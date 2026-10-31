const T = process.env.BOT_TOKEN;
let name = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tg = (m, b = {}, signal) => fetch(`https://api.telegram.org/bot${T}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), signal }).then((r) => r.json());
export const botName = () => name;

async function onMessage(m) {
  console.log('Получено сообщение:', m.text);

  if (m.chat?.type !== 'private' || !m.text || !/^\/(start|help|play)/.test(m.text)) return;

  const result = await tg('sendMessage', {
    chat_id: m.chat.id,
    text: '📱 PHONE RUSH\n\nКрути и собирай редкие вымышленные номера!',
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
export async function startBot() {
  const me = await tg('getMe');
  if (!me.ok) throw new Error('Неверный BOT_TOKEN');
  name = me.result.username;
  await tg('setMyCommands', { commands: [{ command: 'start', description: 'Открыть игру' }] });
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
