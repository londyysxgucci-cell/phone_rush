import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, migrate } from './db.js';
import { authenticate, isAdmin } from './auth.js';
import { HttpError, fmt, getUserState, getSetting, spin, claimDaily } from './game.js';
import { RARITIES, SECRET_TOTAL } from './rarity.js';
import { startBot, botName } from './bot.js';
import { listMarket, myListings, createListing, buyListing, cancelListing } from './market.js';
import { friendsList, pendingInvites, sendInvite, respondInvite, removeFriend, searchUsers } from './social.js';
import { getDailyTask, claimDailyTask, incrementTask } from './tasks.js';

for (const k of ['BOT_TOKEN', 'DATABASE_URL', 'WEBAPP_URL']) if (!process.env[k]) { console.error(`Не задана переменная ${k}`); process.exit(1); }

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = [path.join(root, 'public'), path.join(root, '../web/dist')].find(fs.existsSync);
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  frameguard: false, crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://telegram.org'], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'"], frameAncestors: ['https://web.telegram.org', 'https://*.telegram.org'],
    upgradeInsecureRequests: null,
  } },
}));
app.use(express.json({ limit: '10kb' }));
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api', rateLimit({ windowMs: 60000, limit: 180 }), authenticate);

const rarityOrder = `CASE rarity ${RARITIES.map((r, i) => `WHEN '${r}' THEN ${i}`).join(' ')} END DESC, obtained_at DESC`;

app.get('/api/me', ah(async (req, res) => {
  const w = await getSetting({ query: q }, 'rarity_weights'), sum = RARITIES.reduce((a, r) => a + (w[r] || 0), 0) || 1;
  const last = (await q('SELECT * FROM phone_numbers WHERE user_id=$1 ORDER BY obtained_at DESC LIMIT 1', [req.user.id])).rows[0];
  res.json({ ...(await getUserState(req.user)), last_number: fmt(last) || null, bot_username: botName(), is_admin: isAdmin(req.user.id),
    chances: RARITIES.map((r) => ({ rarity: r, pct: ((w[r] || 0) / sum) * 100 })) });
}));
app.post('/api/spin', ah(async (req, res) => res.json(await spin(req.user.id))));
app.post('/api/daily', ah(async (req, res) => res.json(await claimDaily(req.user.id))));

app.get('/api/collection', ah(async (req, res) => {
  const rar = RARITIES.includes(req.query.rarity) ? req.query.rarity : null;
  const order = req.query.sort === 'date' ? 'obtained_at DESC' : rarityOrder;
  const [items, top, counts] = await Promise.all([
    q(`SELECT * FROM phone_numbers WHERE user_id=$1 AND ($2::text IS NULL OR rarity=$2) ORDER BY ${order} LIMIT 2000`, [req.user.id, rar]),
    q(`SELECT * FROM phone_numbers WHERE user_id=$1 ORDER BY ${rarityOrder} LIMIT 5`, [req.user.id]),
    q('SELECT rarity, count(*)::int AS c FROM phone_numbers WHERE user_id=$1 GROUP BY rarity', [req.user.id]),
  ]);
  res.json({ items: items.rows.map(fmt), top: top.rows.map(fmt), counts: Object.fromEntries(counts.rows.map((r) => [r.rarity, r.c])), secret_total: SECRET_TOTAL });
}));
app.get('/api/collection/:id', ah(async (req, res) => {
  const r = (await q('SELECT * FROM phone_numbers WHERE id=$1 AND user_id=$2', [Number(req.params.id) || 0, req.user.id])).rows[0];
  if (!r) throw new HttpError(404, 'Номер не найден');
  const owners = (await q('SELECT count(*)::int AS c FROM phone_numbers WHERE number=$1', [r.number])).rows[0].c;
  res.json({ ...fmt(r), owners });
}));

const BOARDS = { numbers: 'numbers_count', rare: 'rare_count', level: 'level' };
app.get('/api/leaderboard', ah(async (req, res) => {
  const col = BOARDS[req.query.type] || 'numbers_count';
  const top = await q(`SELECT id, first_name, photo_url, level, ${col} AS value FROM users WHERE NOT is_banned ORDER BY ${col} DESC, xp DESC, id LIMIT 50`);
  const mine = (await q(`SELECT count(*)::int + 1 AS rank FROM users WHERE NOT is_banned AND ${col} > $1`, [req.user[col]])).rows[0].rank;
  res.json({ top: top.rows, me: { rank: mine, value: req.user[col] } });
}));

// --- Рынок номеров ---
app.get('/api/market', ah(async (req, res) => {
  res.json(await listMarket(req.user.id));
}));
app.get('/api/market/my', ah(async (req, res) => {
  res.json(await myListings(req.user.id));
}));
app.post('/api/market/list', ah(async (req, res) => {
  const { phone_number_id, price_coins, price_stars } = req.body || {};
  res.json(await createListing(req.user.id, { phoneNumberId: phone_number_id, priceCoins: price_coins, priceStars: price_stars }));
}));
app.post('/api/market/buy/:id', ah(async (req, res) => {
  res.json(await buyListing(req.user.id, Number(req.params.id)));
}));
app.post('/api/market/cancel/:id', ah(async (req, res) => {
  res.json(await cancelListing(req.user.id, Number(req.params.id)));
}));

// --- Друзья ---
app.get('/api/friends', ah(async (req, res) => {
  res.json(await friendsList(req.user.id));
}));
app.get('/api/friends/invites', ah(async (req, res) => {
  res.json(await pendingInvites(req.user.id));
}));
app.post('/api/friends/invite', ah(async (req, res) => {
  res.json(await sendInvite(req.user.id, req.body || {}));
}));
app.post('/api/friends/respond/:id', ah(async (req, res) => {
  const { accept } = req.body || {};
  res.json(await respondInvite(req.user.id, { inviteId: Number(req.params.id), accept: accept === true }));
}));
app.post('/api/friends/remove/:id', ah(async (req, res) => {
  res.json(await removeFriend(req.user.id, Number(req.params.id)));
}));
app.get('/api/users/search', ah(async (req, res) => {
  res.json(await searchUsers(req.query.q || '', req.user.id));
}));

// --- Ежедневное задание ---
app.get('/api/daily-task', ah(async (req, res) => {
  res.json(await getDailyTask(req.user.id));
}));
app.post('/api/daily-task/claim', ah(async (req, res) => {
  res.json(await claimDailyTask(req.user.id));
}));

// Обучение
app.post('/api/tutorial/done', ah(async (req, res) => {
  await q('UPDATE users SET tutorial_done=true WHERE id=$1', [req.user.id]);
  res.json({ ok: true });
}));

if (pub) { app.use(express.static(pub, { maxAge: '1h' })); app.get('*', (req, res) => res.sendFile(path.join(pub, 'index.html'))); }
app.use((e, req, res, next) => {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  console.error(e); res.status(500).json({ error: 'Ошибка сервера' });
});

await migrate();
app.listen(process.env.PORT || 3000, () => console.log('PHONE RUSH слушает порт', process.env.PORT || 3000));
startBot().catch((e) => console.error('Бот не запущен:', e.message));
