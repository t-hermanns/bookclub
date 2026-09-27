import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'bookclub.sqlite');

declare global {
  // eslint-disable-next-line no-var
  var __bookclub_db: Database.Database | undefined;
}

function init(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      suggestions_deadline TEXT,
      voting_deadline TEXT,
      runoff_parent_id INTEGER REFERENCES rounds(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      winner_book_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      link TEXT NOT NULL,
      submitter_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(round_id, submitter_name)
    );
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      voter_name TEXT NOT NULL,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(round_id, voter_name)
    );
    CREATE TABLE IF NOT EXISTS runoff_books (
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      PRIMARY KEY (round_id, book_id)
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  // Repair rows from before finishWithWinner covered chained run-offs: an earlier run-off
  // of a finished round was left at 'voting_closed'. Idempotent, so it simply runs on every start.
  db.exec(`
    UPDATE rounds SET
      status = 'finished',
      winner_book_id = (SELECT p.winner_book_id FROM rounds p WHERE p.id = rounds.runoff_parent_id),
      closed_at = (SELECT p.closed_at FROM rounds p WHERE p.id = rounds.runoff_parent_id)
    WHERE status <> 'finished'
      AND runoff_parent_id IN (SELECT id FROM rounds WHERE status = 'finished');
  `);
}

export function getDb(): Database.Database {
  if (!global.__bookclub_db) {
    const db = new Database(dbPath);
    init(db);
    global.__bookclub_db = db;
  }
  return global.__bookclub_db;
}
