# Bookclub

A small web app our book club uses to pick the next book: members suggest books, vote anonymously, settle ties with run-offs and look back at past rounds. The UI is in German.

## Features

- **Suggestions**: everyone submits one book (title, author, link) and can edit it until voting starts. Books stay anonymous; a roster shows *who* has submitted, never *what*.
- **Voting**: one vote or three votes per person (configurable, three can be stacked on one book), never for your own book. Voting closes automatically once everyone has voted; the admin can close earlier.
- **Ties**: the admin starts a run-off (one vote each, own book allowed) or draws the winner at random.
- **Themes**: an optional theme per round, shown as a banner while suggestions are open.
- **History**: every finished round with its tallies, who suggested what, how the winner was decided and the run-off results.
- Mobile-first, light and dark mode.

Login is deliberately simple for a small, trusted group: you pick your name from the list. Only the admin additionally needs a password.

## How it works

- **Next.js 14** (App Router, TypeScript, Tailwind) with route handlers as the API and **SQLite** (`better-sqlite3`) for storage.
- A round is a small state machine (`suggestions_open → suggestions_closed → voting_open → voting_closed → finished`); run-offs are child rounds that reference the original books.
- A single read model (`src/lib/state.ts`) builds everything the client sees and enforces what stays hidden when (books during suggestions, tallies while voting, submitters until a round is finished).
- The client polls the state every 5 seconds; stages close lazily on the next request once everyone has acted. There is no background job.
- The schema is created and migrated in place on startup.

## Getting started

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3000
```

Log in with one of the names from `PARTICIPANTS`; the admin (`ADMIN_NAME`) also enters `ADMIN_PASSWORD`. The database is created under `./data/`.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | in production | Signs the session cookie. Production refuses a missing or placeholder value. |
| `PARTICIPANTS` | yes | Comma-separated list of everyone who can log in, in display order. |
| `ADMIN_NAME` | yes | The admin; must be one of `PARTICIPANTS`. |
| `ADMIN_PASSWORD` | yes | The admin's password. There is no default; production refuses a placeholder. |
| `VOTING_SYSTEM` | no | `single` (default) or `three_votes`. Applies to rounds started afterwards. |
| `DATA_DIR` | no | Directory of the SQLite database (default `./data`). |

## Deployment

The repository ships a multi-stage `Dockerfile` (Next.js standalone output; builds natively on amd64 and arm64) and a `docker-compose.yml`:

```bash
cp .env.example .env   # then set real values
docker compose up -d --build
```

Compose refuses to start while a required variable is missing. The app listens on port 3000; put it behind a reverse proxy that terminates TLS. The database lives in the named volume `bookclub_data` and survives rebuilds.

### Backups

The state is the data directory: `bookclub.sqlite` plus its `-wal` and `-shm` files. Copy all of them, e.g.:

```bash
docker cp bookclub:/app/data ./bookclub-backup
```

For a guaranteed consistent copy, stop the container first.

## License

[MIT](LICENSE)
