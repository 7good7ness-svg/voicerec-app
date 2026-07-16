import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

// DBファイルの親ディレクトリを作成
mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** スキーマを作成（存在しなければ） */
export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,          -- Telegram user id
      display_name  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      kind         TEXT NOT NULL CHECK (kind IN ('expense','income')),
      amount       INTEGER NOT NULL,
      category     TEXT NOT NULL,
      vendor       TEXT,
      memo         TEXT,
      currency     TEXT NOT NULL DEFAULT 'JPY',
      occurred_on  TEXT NOT NULL,                 -- YYYY-MM-DD
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_user_date
      ON transactions (user_id, occurred_on);

    CREATE TABLE IF NOT EXISTS budgets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      category      TEXT NOT NULL,
      monthly_limit INTEGER NOT NULL,
      UNIQUE (user_id, category)
    );

    CREATE TABLE IF NOT EXISTS recurring (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      amount       INTEGER NOT NULL,
      category     TEXT NOT NULL,
      vendor       TEXT,
      memo         TEXT,
      day_of_month INTEGER NOT NULL,
      active       INTEGER NOT NULL DEFAULT 1
    );
  `);
}
