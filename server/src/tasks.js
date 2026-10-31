import { q, tx, dayKey } from './db.js';

const TASKS_TODAY = [
  {
    kind: 'spins', target: 3,
    title: 'Крути барабан',
    description: 'Сделай 3 прокрутки',
    reward_coins: 100, reward_spins: 1,
  },
  {
    kind: 'collect_rare', target: 1,
    title: 'Редкий номер',
    description: 'Выпади номер редкостью Редкий или выше',
    reward_coins: 250, reward_spins: 2,
  },
];

function pickTaskForDate(dateKey) {
  let seed = 0;
  for (const ch of dateKey) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  return TASKS_TODAY[Math.abs(seed) % TASKS_TODAY.length];
}

export async function ensureTaskToday() {
  const today = dayKey();
  const existing = (await q('SELECT * FROM daily_tasks WHERE task_date=$1', [today])).rows[0];
  if (existing) return existing;
  const t = pickTaskForDate(today);
  const ins = await q(
    `INSERT INTO daily_tasks (task_date, title, description, kind, target, reward_coins, reward_spins, reward_stars)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [today, t.title, t.description, t.kind, t.target, t.reward_coins, t.reward_spins, t.reward_stars]
  );
  return ins.rows[0];
}

export async function getDailyTask(userId) {
  const task = await ensureTaskToday();
  const today = dayKey();
  let prog = (await q(
    'SELECT * FROM user_task_progress WHERE user_id=$1 AND task_date=$2',
    [userId, today]
  )).rows[0];
  if (!prog) {
    const ins = await q(
      'INSERT INTO user_task_progress (user_id, task_date, task_id, progress, claimed) VALUES ($1,$2,$3,0,false) RETURNING *',
      [userId, today, task.id]
    );
    prog = ins.rows[0];
  }
  return { task, progress: prog.progress, claimed: prog.claimed, target: task.target };
}

export async function claimDailyTask(userId) {
  return tx(async (c) => {
    const today = dayKey();
    const task = await ensureTaskToday();
    const prog = (await c.query(
      'SELECT * FROM user_task_progress WHERE user_id=$1 AND task_date=$2 FOR UPDATE',
      [userId, today]
    )).rows[0];
    if (!prog) throw new HttpError(404, 'Прогресс не найден');
    if (prog.claimed) throw new HttpError(409, 'Уже получено');
    if (prog.progress < task.target) throw new HttpError(400, 'Задание не выполнено');

    await c.query(
      'UPDATE user_task_progress SET claimed=true WHERE id=$1',
      [prog.id]
    );
    await c.query(
      'UPDATE users SET coins=coins+$2, spins=spins+$3, stars=stars+$4 WHERE id=$1',
      [userId, task.reward_coins, task.reward_spins, task.reward_stars]
    );

    // Возвращаем свежее состояние пользователя
    const u = (await c.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
    return { reward: { coins: task.reward_coins, spins: task.reward_spins, stars: task.reward_stars }, user: u };
  });
}

// Увеличить прогресс по заданию (вызывать из spin и других мест)
export async function incrementTask(userId, kind, amount = 1) {
  const today = dayKey();
  const task = await ensureTaskToday();
  if (task.kind !== kind) return;
  await q(
    `INSERT INTO user_task_progress (user_id, task_date, task_id, progress, claimed)
     VALUES ($1,$2,$3,$4,false)
     ON CONFLICT (user_id, task_date) DO UPDATE SET progress = user_task_progress.progress + $4`,
    [userId, today, task.id, amount]
  );
}
