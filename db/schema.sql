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
-- Metin2 tarzı durum puanları (GÜÇ/CAN/ZEKA/ÇEV): harcanan puanlar
ALTER TABLE characters ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}';
-- arkadaş listesi (karakter adları)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS friends JSONB NOT NULL DEFAULT '[]';

-- Aşama 5: lonca, krallık, pazar tezgâhı
CREATE TABLE IF NOT EXISTS guilds (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(16) NOT NULL,
  leader_id  INTEGER,
  level      INTEGER     NOT NULL DEFAULT 1,
  exp        BIGINT      NOT NULL DEFAULT 0,
  storage    JSONB       NOT NULL DEFAULT '[]',
  yang       BIGINT      NOT NULL DEFAULT 0,
  notice     TEXT        NOT NULL DEFAULT '',
  wins       INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_name_lower_idx ON guilds (lower(name));
ALTER TABLE characters ADD COLUMN IF NOT EXISTS guild_id INTEGER;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS guild_rank SMALLINT NOT NULL DEFAULT 0;   -- 0 üye, 1 subay, 2 lider
ALTER TABLE characters ADD COLUMN IF NOT EXISTS empire SMALLINT;                         -- 1 Shinsoo (kırmızı), 2 Chunjo (sarı), 3 Jinno (mavi)
CREATE TABLE IF NOT EXISTS stalls (
  char_id    INTEGER     PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  owner_name VARCHAR(14) NOT NULL,
  map_id     INTEGER     NOT NULL,
  x          REAL        NOT NULL,
  z          REAL        NOT NULL,
  title      VARCHAR(32) NOT NULL,
  items      JSONB       NOT NULL DEFAULT '[]',
  earnings   BIGINT      NOT NULL DEFAULT 0,
  log        JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- sıralama sorguları için
CREATE INDEX IF NOT EXISTS characters_level_idx ON characters (level DESC, exp DESC);
-- hesap deposu: aynı hesabın bütün karakterleri ortak kullanır
CREATE TABLE IF NOT EXISTS depots (
  account_id INTEGER     PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  items      JSONB       NOT NULL DEFAULT '[]',
  yang       BIGINT      NOT NULL DEFAULT 0
);
-- Ejder Parası (EP): Nesne Market'in parası, hesabın bütün karakterleri ortak kullanır
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ep INTEGER NOT NULL DEFAULT 0;

-- sunucu ayarları (ör. yönetim panelinden açılan tecrübe oranı)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
