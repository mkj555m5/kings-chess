-- قاعدة بيانات الإحصائيات العالمية على Cloudflare D1
-- التطبيق بعد إنشاء القاعدة:
--   wrangler d1 create kings-chess-db
--   wrangler d1 execute kings-chess-db --remote --file=./db/schema.sql

CREATE TABLE IF NOT EXISTS game_record (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  result TEXT NOT NULL,
  player_color TEXT NOT NULL,
  ai_level TEXT,
  opponent TEXT,
  moves INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_record_mode_result ON game_record(mode, result);
CREATE INDEX IF NOT EXISTS idx_game_record_player ON game_record(player_name);
