import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

pg.types.setTypeParser(20, Number);       // bigint -> number (Telegram ID < 2^53)
pg.types.setTypeParser(1082, (v) => v);   // date -> 'YYYY-MM-DD'

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const q = (text, params) => pool.query(text, params);

export const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: process.env.GAME_TZ || 'Europe/Moscow' });

export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

export async function migrate() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727200)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if ((await c.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f])).rowCount) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        console.log('миграция применена:', f);
      } catch (e) { await c.query('ROLLBACK'); throw e; }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727200)').catch(() => {});
    c.release();
  }
}
