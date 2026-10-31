-- Лимит гаража/сейфа и звёзды у пользователя
ALTER TABLE users ADD COLUMN IF NOT EXISTS garage_slots INTEGER NOT NULL DEFAULT 5;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stars INTEGER NOT NULL DEFAULT 0;

-- Номера в гараже (под защитой: не продаются автоматически и не теряются)
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS in_garage BOOLEAN NOT NULL DEFAULT false;

-- Рынок: лоты на продажу
CREATE TABLE IF NOT EXISTS market_listings (
  id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number_id BIGINT REFERENCES phone_numbers(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  rarity TEXT NOT NULL,
  pattern TEXT NOT NULL,
  price_coins INTEGER NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  price_stars INTEGER NOT NULL DEFAULT 0 CHECK (price_stars >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX market_listings_status_idx ON market_listings (status, created_at DESC);
CREATE INDEX market_listings_seller_idx ON market_listings (seller_id, status);

-- Ставки на лоты (аукцион)
CREATE TABLE IF NOT EXISTS market_bids (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  bidder_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Друзья
CREATE TABLE IF NOT EXISTS friends (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

-- Задание дня
CREATE TABLE IF NOT EXISTS daily_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_date DATE NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL,                 -- 'spins' | 'invite' | 'collect_rare' | 'win_rare'
  target INTEGER NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_spins INTEGER NOT NULL DEFAULT 0,
  reward_stars INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_task_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_date DATE NOT NULL,
  task_id BIGINT REFERENCES daily_tasks(id),
  progress INTEGER NOT NULL DEFAULT 0,
  claimed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, task_date)
);
