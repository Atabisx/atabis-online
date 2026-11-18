-- ATABİS ONLINE veritabanı şeması
-- Sunucu her açılışta bu dosyayı çalıştırır; IF NOT EXISTS sayesinde var olan veriye dokunmaz.

CREATE TABLE IF NOT EXISTS accounts (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(20)  NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token      CHAR(64)    PRIMARY KEY,
  account_id INTEGER     NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);

CREATE TABLE IF NOT EXISTS characters (
  id          SERIAL PRIMARY KEY,
  account_id  INTEGER     NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        VARCHAR(14) NOT NULL,
  class       VARCHAR(16) NOT NULL,
  level       INTEGER     NOT NULL DEFAULT 1,
  exp         INTEGER     NOT NULL DEFAULT 0,
  yang        BIGINT      NOT NULL DEFAULT 0,
  kills       INTEGER     NOT NULL DEFAULT 0,
  pos_x       REAL,
  pos_z       REAL,
  inventory   JSONB       NOT NULL DEFAULT '[]',
  equip       JSONB       NOT NULL DEFAULT '{}',
  next_uid    INTEGER     NOT NULL DEFAULT 1000,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_played TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_name_lower_idx ON characters (lower(name));
CREATE INDEX IF NOT EXISTS characters_account_idx ON characters(account_id);

-- Aşama 1: haritalar ve can
ALTER TABLE characters ADD COLUMN IF NOT EXISTS map_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS hp INTEGER;

-- Aşama 2: mana, beceriler, görevler
ALTER TABLE characters ADD COLUMN IF NOT EXISTS mp INTEGER;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS quests JSONB NOT NULL DEFAULT '{}';
