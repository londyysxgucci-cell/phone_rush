import { q, tx } from './db.js';
import { RARITIES, REWARDS, generate, pickRarity } from './rarity.js';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: process.env.GAME_TZ || 'Europe/Moscow' });
const DEFAULTS = {
  rarity_weights: { common: 55, uncommon: 25, rare: 12, epic: 5, legendary: 2, mythic: 0.8, secret: 0.2 },
  spin_config: { max: 10, interval_min: 20, coin_cost: 50, cooldown_ms: 1000 },
  daily_rewards: [{ coins: 50, spins: 1 }],
};
export async function getSetting(c, key) { return (await c.query('SELECT value FROM settings WHERE key=$1', [key])).rows[0]?.value ?? DEFAULTS[key]; }
export const levelFromXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
export const fmt = (r) => r && ({ id: r.id, number: r.number, digits: r.number.replace(/\D/g, '').slice(3), rarity: r.rarity, pattern: r.pattern, obtained_at: r.obtained_at });

// Попытки восстанавливаются лениво: считаем по времени, без фоновых задач.
export function computeSpins(u, cfg, now = new Date()) {
  const iv = cfg.interval_min * 60000;
  let spins = u.spins, at = new Date(u.spins_updated_at);
  if (spins >= cfg.max) return { spins, at: now, next: null };
  const gained = Math.floor((now - at) / iv);
  if (gained > 0) { spins = Math.min(cfg.max, spins + gained); at = spins >= cfg.max ? now : new Date(at.getTime() + gained * iv); }
  return { spins, at, next: spins >= cfg.max ? null : new Date(at.getTime() + iv) };
}

export function publicState(u, cfg, rewards, now = new Date()) {
  const st = computeSpins(u, cfg, now), today = dayKey(), yest = dayKey(new Date(Date.now() - 864e5));
  const streak = u.last_daily_date === today || u.last_daily_date === yest ? u.daily_streak : 0;
  const can = u.last_daily_date !== today, len = rewards.length;
  return {
    id: u.id, first_name: u.first_name, username: u.username, photo_url: u.photo_url,
    coins: u.coins, spins: st.spins, spins_max: cfg.max, next_refill_at: st.next, coin_cost: cfg.coin_cost,
    level: u.level, xp: u.xp, xp_from: 100 * (u.level - 1) ** 2, xp_to: 100 * u.level ** 2,
    spin_count: u.spin_count, numbers_count: u.numbers_count, rare_count: u.rare_count, legendary_count: u.legendary_count,
    created_at: u.created_at, daily: { can_claim: can, streak, done: can ? streak % len : streak % len || len, rewards },
  };
}

async function stateOf(c, id) {
  const u = (await c.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
  return publicState(u, await getSetting(c, 'spin_config'), await getSetting(c, 'daily_rewards'));
}

export async function spin(userId) {
  return tx(async (c) => {
    const u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
    if (!u) throw new HttpError(404, 'Игрок не найден');
    if (u.is_banned) throw new HttpError(403, 'Аккаунт заблокирован');
    const cfg = await getSetting(c, 'spin_config'), now = new Date();
    if (u.last_spin_at && now - new Date(u.last_spin_at) < cfg.cooldown_ms) throw new HttpError(429, 'Не так быстро — подождите секунду');
    const st = computeSpins(u, cfg, now);
    let spins = st.spins, coins = u.coins;
    if (spins > 0) spins -= 1;
    else if (coins >= cfg.coin_cost) coins -= cfg.coin_cost;
    else throw new HttpError(402, 'Нет попыток и не хватает монет');

    const g = generate(pickRarity(await getSetting(c, 'rarity_weights')));
    const ins = await c.query(
      'INSERT INTO phone_numbers (user_id, number, rarity, pattern) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, number) DO NOTHING RETURNING *',
      [userId, g.number, g.rarity, g.pattern]);
    const isNew = ins.rowCount > 0;
    const row = isNew ? ins.rows[0] : (await c.query('SELECT * FROM phone_numbers WHERE user_id=$1 AND number=$2', [userId, g.number])).rows[0];

    const idx = RARITIES.indexOf(g.rarity), rw = REWARDS[g.rarity];
    const coinsReward = isNew ? rw.coins : Math.ceil(rw.coins * 0.2); // за дубликат — 20% награды
    const xpGain = isNew ? rw.xp : Math.ceil(rw.xp * 0.2);
    const xp = u.xp + xpGain, level = levelFromXp(xp);
    let bonus = 0;
    for (let l = u.level + 1; l <= level; l++) bonus += 25 * l;
    await c.query(
      `UPDATE users SET coins=$2, spins=$3, spins_updated_at=$4, xp=$5, level=$6, spin_count=spin_count+1,
         numbers_count=numbers_count+$7, rare_count=rare_count+$8, legendary_count=legendary_count+$9, last_spin_at=$10 WHERE id=$1`,
      [userId, coins + coinsReward + bonus, spins, st.at, xp, level, isNew ? 1 : 0, isNew && idx >= 2 ? 1 : 0, isNew && idx >= 4 ? 1 : 0, now]);
    await c.query('INSERT INTO spins_log (user_id, number, rarity, is_new, coins_reward) VALUES ($1,$2,$3,$4,$5)', [userId, g.number, g.rarity, isNew, coinsReward]);
    return { number: fmt(row), is_new: isNew, coins_reward: coinsReward, xp_gain: xpGain, level_up: level > u.level ? { to: level, bonus } : null, state: await stateOf(c, userId) };
  });
}

export async function claimDaily(userId) {
  return tx(async (c) => {
    const u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
    const today = dayKey();
    if (u.last_daily_date === today) throw new HttpError(409, 'Бонус за сегодня уже получен');
    const streak = u.last_daily_date === dayKey(new Date(Date.now() - 864e5)) ? u.daily_streak + 1 : 1;
    const rewards = await getSetting(c, 'daily_rewards'), r = rewards[(streak - 1) % rewards.length];
    const st = computeSpins(u, await getSetting(c, 'spin_config'));
    await c.query(
      'UPDATE users SET coins=coins+$2, spins=$3, spins_updated_at=$4, daily_streak=$5, best_streak=GREATEST(best_streak,$5), last_daily_date=$6 WHERE id=$1',
      [userId, r.coins, st.spins + r.spins, st.at, streak, today]);
    return { reward: r, state: await stateOf(c, userId) };
  });
}

export const getUserState = async (u) => publicState(u, await getSetting({ query: q }, 'spin_config'), await getSetting({ query: q }, 'daily_rewards'));
