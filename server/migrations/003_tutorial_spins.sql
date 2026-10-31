-- Новички начинают с 5 бесплатных прокруток вместо 10
ALTER TABLE users ALTER COLUMN spins SET DEFAULT 5;

-- Флаг прохождения обучения
ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_done BOOLEAN NOT NULL DEFAULT false;
