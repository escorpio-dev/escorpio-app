-- escorpio-alerts D1 schema (fresh installs; existing databases apply migrations/ in order).
-- Stored per user: the Telegram chat id, its alerts, and only if the user links one, a wallet address. No name, no email.
CREATE TABLE IF NOT EXISTS chats (
  chat_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free', -- 'free' or 'holder' (holder switches on with the token)
  created_at INTEGER NOT NULL,
  wallet TEXT, -- linked with a signed message on escorpio.pro/link
  checked_at INTEGER NOT NULL DEFAULT 0 -- last balance check
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL REFERENCES chats(chat_id),
  kind TEXT NOT NULL CHECK (kind IN ('vault', 'borrow')),
  target TEXT NOT NULL, -- '*' for vaults, a collateral symbol or address for loans
  threshold REAL NOT NULL, -- fraction a year (0.05 = 5%)
  created_at INTEGER NOT NULL,
  last_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS alerts_chat ON alerts(chat_id);

CREATE TABLE IF NOT EXISTS link_codes (
  code TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
