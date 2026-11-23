-- Stage 2 (holders): a chat can link one wallet; codes for the /link flow; small key-value state (last digest).
ALTER TABLE chats ADD COLUMN wallet TEXT;
ALTER TABLE chats ADD COLUMN checked_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS link_codes (
  code TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
