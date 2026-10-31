import { q } from './db.js';
import { isAdmin } from './auth.js';

const T = process.env.BOT_TOKEN;
let name = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tg = (m, b = {}, signal) => fetch(`https://api.telegram.org/bot${T}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), signal }).then((r) => r.json());
export const botName = () => name;

async function onMessage(m) {
  console.log('Получено сообщение:', m.text);

  if (m.chat?.type !== 'private' || !m.text) return;

  const isAdminUser = isAdmin(m.from.id);

  // Рассылка всем игрокам (только админ)
  if (/^\/broadcast(\s+|$)/i.test(m.text) && isAdminUser) {
    const text = m.text.replace(/^\/broadcast/i, '').trim();
    if (!text) {
      await tg('sendMessage', { chat_id: m.chat.id, text: 'Использование: /broadcast ваш текст' });
      return;
    }

    const users = (await q('SELECT id FROM users WHERE NOT is_banned')).rows;
    let sent = 0, failed = 0;
    for (const { id } of users) {
      try {
        await tg('sendMessage', { chat_id: id, text });
        sent++;
      } catch (e) {
        failed++;
      }
      // Пауза между сообщениями, чтобы не получить лимит от Telegram
      await sleep(40);
    }
    await tg('sendMessage', { chat_id: m.chat.id, text: `Рассылка завершена: отправлено ${sent}, ошибок ${failed}` });
    return;
  }

  if (/^\/(start|help|play)/i.test(m.text)) {
    const result = await tg('sendMessage', {
      chat_id: m.chat.id,
      text: '📱 PHONE RUSH\n\nКрути и собирай редкие вымышленные номера!\n\nАдмин может сделать рассылку всем: /broadcast текст',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🎮 Играть',
            web_app: { url: process.env.WEBAPP_URL }
          }
        ]]
      }
    });

    if (!result.ok) {
      console.error('Ошибка отправки сообщения:', result.description);
    } else {
      console.log('Ответ успешно отправлен!');
    }
  }
}
export async function startBot() {
  const me = await tg('getMe');
  if (!me.ok) throw new Error('Неверный BOT_TOKEN');
  name = me.result.username;
  await tg('setMyCommands', { commands: [
    { command: 'start', description: 'Открыть игру' },
    { command: 'broadcast', description: 'Рассылка всем (только админ)' },
  ] });
  await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: process.env.WEBAPP_URL } } });
  await tg('deleteWebhook');
  let offset = 0;
  (async () => {
    for (;;) {
      try {
        const r = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }, AbortSignal.timeout(40000));
        if (!r.ok) { console.error('getUpdates:', r.description); await sleep(5000); continue; }
        for (const u of r.result) { offset = u.update_id + 1; if (u.message) onMessage(u.message).catch(console.error); }
      } catch (e) { console.error('poll:', e.message); await sleep(3000); }
    }
  })();
  console.log('Бот запущен: @' + name);
}
