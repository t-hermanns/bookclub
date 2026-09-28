import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'bookclub.sqlite');

// One row per (round, voter, book) with the points given; a voter's rows form their ballot.
function votesTableSql(name: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      voter_name TEXT NOT NULL,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      points INTEGER NOT NULL DEFAULT 1 CHECK (points > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(round_id, voter_name, book_id)
    );`;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === column);
}

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
      winner_book_id INTEGER,
      voting_system TEXT NOT NULL DEFAULT 'single',
      theme TEXT
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
    ${votesTableSql('votes')}
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
  // Databases from before voting systems: every existing round used one vote per person.
  if (!hasColumn(db, 'rounds', 'voting_system')) {
    db.exec(`ALTER TABLE rounds ADD COLUMN voting_system TEXT NOT NULL DEFAULT 'single'`);
  }
  // Optional theme for a round's suggestions (e.g. "Herbst & Halloween"); older rows have none.
  if (!hasColumn(db, 'rounds', 'theme')) {
    db.exec(`ALTER TABLE rounds ADD COLUMN theme TEXT`);
  }
  // ...and `votes` allowed a single row per voter (UNIQUE(round_id, voter_name)). SQLite can't
  // change a constraint in place, so rebuild the table; each old vote becomes one point.
  if (!hasColumn(db, 'votes', 'points')) {
    db.transaction(() => {
      db.exec(votesTableSql('votes_new'));
      db.exec(`
        INSERT INTO votes_new (id, round_id, voter_name, book_id, points, created_at)
          SELECT id, round_id, voter_name, book_id, 1, created_at FROM votes;
        DROP TABLE votes;
        ALTER TABLE votes_new RENAME TO votes;
      `);
    })();
  }
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
