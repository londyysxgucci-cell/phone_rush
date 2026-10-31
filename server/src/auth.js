import crypto from 'node:crypto';
import { q } from './db.js';

// Проверка подписи Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
export function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = Buffer.from(crypto.createHmac('sha256', secret).update(check).digest('hex'), 'hex');
  const got = Buffer.from(hash, 'hex');
  if (calc.length !== got.length || !crypto.timingSafeEqual(calc, got)) return null;
  const age = Date.now() / 1000 - Number(p.get('auth_date'));
  if (!(age >= -60 && age <= maxAgeSec)) return null;
  try { const u = JSON.parse(p.get('user') || 'null'); return u?.id ? u : null; } catch { return null; }
}

export const isAdmin = (id) => (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(String(id));

export async function authenticate(req, res, next) {
  try {
    let t = null;
    const h = req.get('authorization') || '';
    if (h.startsWith('tma ')) t = verifyInitData(h.slice(4), process.env.BOT_TOKEN);
    else if (process.env.DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production' && req.get('x-dev-user'))
      t = { id: Number(req.get('x-dev-user')), first_name: 'Dev' };
    if (!t || !Number.isSafeInteger(t.id)) return res.status(401).json({ error: 'Не удалось проверить авторизацию. Откройте игру через Telegram-бота.' });
    const { rows: [u] } = await q(
      `INSERT INTO users (id, first_name, last_name, username, photo_url, language_code) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         username=EXCLUDED.username, photo_url=EXCLUDED.photo_url, last_seen_at=now() RETURNING *`,
      [t.id, t.first_name || '', t.last_name ?? null, t.username ?? null, t.photo_url ?? null, t.language_code ?? null]);
    if (u.is_banned) return res.status(403).json({ error: 'Аккаунт заблокирован.' });
    req.user = u;
    next();
  } catch (e) { next(e); }
}
