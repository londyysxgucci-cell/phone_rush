CREATE TABLE users (
  id BIGINT PRIMARY KEY,                       -- Telegram ID
  first_name TEXT NOT NULL DEFAULT '', last_name TEXT, username TEXT, photo_url TEXT, language_code TEXT,
  coins INTEGER NOT NULL DEFAULT 100 CHECK (coins >= 0),
  spins INTEGER NOT NULL DEFAULT 10 CHECK (spins >= 0),
  spins_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1,
  spin_count INTEGER NOT NULL DEFAULT 0, numbers_count INTEGER NOT NULL DEFAULT 0,
  rare_count INTEGER NOT NULL DEFAULT 0, legendary_count INTEGER NOT NULL DEFAULT 0,
  daily_streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, last_daily_date DATE,
  last_spin_at TIMESTAMPTZ, is_banned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_numbers_idx ON users (numbers_count DESC);
CREATE INDEX users_rare_idx ON users (rare_count DESC);
CREATE INDEX users_level_idx ON users (level DESC, xp DESC);

CREATE TABLE phone_numbers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common','uncommon','rare','epic','legendary','mythic','secret')),
  pattern TEXT NOT NULL,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);
CREATE INDEX phone_numbers_user_idx ON phone_numbers (user_id, obtained_at DESC);
CREATE INDEX phone_numbers_number_idx ON phone_numbers (number);

CREATE TABLE spins_log (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL, rarity TEXT NOT NULL, is_new BOOLEAN NOT NULL, coins_reward INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX spins_log_created_idx ON spins_log (created_at);

CREATE TABLE settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO settings (key, value) VALUES
 ('rarity_weights', '{"common":55,"uncommon":25,"rare":12,"epic":5,"legendary":2,"mythic":0.8,"secret":0.2}'),
 ('spin_config',    '{"max":10,"interval_min":20,"coin_cost":50,"cooldown_ms":1000}'),
 ('daily_rewards',  '[{"coins":50,"spins":1},{"coins":75,"spins":1},{"coins":100,"spins":2},{"coins":125,"spins":2},{"coins":150,"spins":3},{"coins":200,"spins":3},{"coins":500,"spins":5}]');
