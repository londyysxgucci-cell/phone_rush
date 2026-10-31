import { q, tx } from './db.js';
import { HttpError } from './game.js';

export async function friendsList(userId) {
  const rows = (await q(
    `SELECT f.friend_id AS id, u.first_name, u.username, u.photo_url, f.created_at
     FROM friends f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = $1 AND f.status = 'accepted'
     ORDER BY f.created_at DESC`,
    [userId]
  )).rows;
  return rows;
}

export async function pendingInvites(userId) {
  const rows = (await q(
    `SELECT f.id, f.user_id AS from_id, u.first_name, u.username, u.photo_url, f.created_at
     FROM friends f
     JOIN users u ON u.id = f.user_id
     WHERE f.friend_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId]
  )).rows;
  return rows;
}

export async function sendInvite(userId, { friendId }) {
  const fid = Number(friendId);
  if (!fid || fid === userId) throw new HttpError(400, 'Некорректный пользователь');
  const exists = (await q('SELECT 1 FROM users WHERE id=$1', [fid])).rowCount > 0;
  if (!exists) throw new HttpError(404, 'Пользователь не найден');

  return tx(async (c) => {
    const already = (await c.query(
      'SELECT 1 FROM friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)',
      [userId, fid]
    )).rowCount;
    if (already) throw new HttpError(409, 'Уже в друзьях или заявка отправлена');

    await c.query(
      'INSERT INTO friends (user_id, friend_id, status) VALUES ($1,$2,\'pending\')',
      [userId, fid]
    );
    return { ok: true };
  });
}

export async function respondInvite(userId, { inviteId, accept }) {
  const inv = (await q(
    'SELECT * FROM friends WHERE id=$1 AND friend_id=$2 AND status=\'pending\' FOR UPDATE',
    [inviteId, userId]
  )).rows[0];
  if (!inv) throw new HttpError(404, 'Заявка не найдена');

  await q(
    'UPDATE friends SET status=$1 WHERE id=$2',
    [accept ? 'accepted' : 'rejected', inviteId]
  );
  return { ok: true, accepted: accept };
}

export async function removeFriend(userId, friendId) {
  await q(
    'DELETE FROM friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)',
    [userId, friendId]
  );
  return { ok: true };
}

export async function searchUsers(query, meId) {
  if (!query || query.length < 2) return [];
  const rows = (await q(
    `SELECT id, first_name, username, photo_url FROM users
     WHERE id <> $1 AND (first_name ILIKE $2 OR username ILIKE $2)
     LIMIT 10`,
    [meId, `%${query}%`]
  )).rows;
  return rows;
}
