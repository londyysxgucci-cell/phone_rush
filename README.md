# PHONE RUSH — Telegram Mini App (этап 1)

Игра-коллекция вымышленных телефонных номеров (код `+999` не принадлежит ни одной стране). Никаких реальных денег, звонков и сообщений.

## Структура
```
server/  Node.js (Express) + PostgreSQL: авторизация initData, генерация номеров, экономика, бот
  migrations/001_init.sql   схема БД (применяется автоматически при старте)
  src/rarity.js             классификация и генерация номеров по редкости
  src/auth.js               проверка подписи initData (HMAC-SHA256), upsert игрока
  src/game.js               spin / ежедневный бонус / восстановление попыток (всё в транзакциях)
  src/bot.js                Bot API: /start, кнопка «Играть», меню-кнопка
web/     React + TypeScript + Tailwind (Vite)
Dockerfile, docker-compose.yml, .env.example
```

## Запуск
1. @BotFather → `/newbot` → получите `BOT_TOKEN`. Узнайте свой Telegram ID (например, у @userinfobot) → `ADMIN_IDS`.
2. `cp .env.example .env` и заполните. `WEBAPP_URL` — **HTTPS**-адрес, где будет доступно приложение.
3. **Docker (рекомендуется):** `docker compose up -d --build` — поднимет PostgreSQL и приложение на порту 3000.
   Поставьте перед ним HTTPS (Caddy / nginx + Let's Encrypt, либо Railway/Render/Fly.io).
4. @BotFather → `/mybots` → ваш бот → *Bot Settings → Menu Button* (необязательно: бот сам ставит кнопку «Играть»).
5. Напишите боту `/start` и нажмите «🎮 Играть».

### Локальная разработка
```
docker compose up -d db
cd server && cp ../.env.example .env   # DATABASE_URL=postgres://phonerush:phonerush@localhost:5432/phonerush, DEV_AUTH=true
npm install && npm run dev
cd ../web && npm install && npm run dev  # http://localhost:5173 (в dev-режиме работает без Telegram, как игрок 1001)
```
Для проверки внутри Telegram: `cloudflared tunnel --url http://localhost:3000` (после `npm run build` в `web`) и подставьте выданный HTTPS-адрес в `WEBAPP_URL`.

## Безопасность
- Каждый запрос подписан `initData`; подпись проверяется на сервере, срок — 24 ч.
- Номера, награды и попытки считаются только на сервере; `spin` — транзакция с блокировкой строки игрока и кулдауном.
- `DEV_AUTH` игнорируется при `NODE_ENV=production`.

## Что готово / дальше
Готово: авторизация, генерация и редкости, коллекция, ежедневный бонус, профиль, рейтинг, бот, шаринг, миграции.
Этап 2: задания, достижения, админ-панель (по `ADMIN_IDS`, вероятности, выдача валюты, статистика).
