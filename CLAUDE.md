# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Small German-language web app for a book club: members submit book suggestions, vote anonymously, resolve ties via run-offs, and browse history. One admin drives the round lifecycle with a password. The participant list is hard-wired in `src/lib/participants.ts`; `TOTAL_PARTICIPANTS` is derived from the array length, so counts and auto-close thresholds follow the array — update the array, not magic numbers.

## Commands

```bash
npm install
npm run dev     # dev server on http://localhost:3000
npm run build   # next build (standalone output)
npm run start   # serve the production build
npm run lint    # next lint (eslint-config-next)
```

There is no test suite. The SQLite database is created automatically under `./data/` (override with `DATA_DIR`).

### Environment variables
- `SESSION_SECRET` — HMAC key for the auth cookie. Falls back to an insecure dev default outside production; in production (`NODE_ENV=production`) an unset or placeholder value makes `getSecret()` in `src/lib/auth.ts` throw on first use, and `docker-compose.yml` refuses to start without it.
- `ADMIN_PASSWORD` — admin password (default `change-me`).
- `VOTING_SYSTEM` — voting system for **new** rounds: `single` (default) or `three_votes`; see `src/lib/voting.ts`. An unknown value blocks starting a round (the admin sees a warning).
- `DATA_DIR` — SQLite directory (default `./data`).

## Architecture

Next.js 14 App Router (TypeScript, Tailwind). All server logic lives in route handlers under `src/app/api/**` and shared modules in `src/lib`. The `@/*` path alias maps to `src/*`.

**State machine is the core.** A "round" moves through `RoundStatus` values (`src/lib/round.ts`): `suggestions_open → suggestions_closed → voting_open → voting_closed`, plus `runoff_open` for run-offs, ending in `finished`. `src/lib/round.ts` owns every transition; do not mutate `rounds.status` elsewhere. Run-offs are modeled as **child rounds** (`runoff_parent_id`, which always points at the original suggestion round, even for a run-off of a run-off) that reference — never duplicate — the original books via the `runoff_books` table. **Voting systems** (`src/lib/voting.ts`): every system is a ballot of points per book that must add up to the system's `votesPerVoter` (`single` = 1, `three_votes` = 3, several points on one book allowed); tallies are `SUM(points)`. Each round stores the system it was started with in `rounds.voting_system` (older rows default to `single`), run-offs always use `single`, and the history shows it per round. How a winner was decided (vote / run-off / random) is not stored: `decisionFor` in `src/lib/state.ts` derives it for the history and the last finished round (random is only offered on a tie, so a deciding round that is still tied means the winner was drawn). `finishWithWinner` finishes the original suggestion round and all of its run-offs with the same winner (`init()` in `db.ts` repairs older rows where an earlier run-off in a chain was left at `voting_closed`).

**Two ways state advances:**
1. **Admin actions** — the routes under `src/app/api/admin/round/*` (start-suggestions, close-suggestions, start-voting, close-voting, start-runoff, pick-random, finish). Each is admin-gated and validates the current status before transitioning. Manual close endpoints may be called regardless of the deadline, but require `force: true` in the body to override an incomplete tally (they return HTTP 409 otherwise).
2. **Lazy auto-transitions** — `applyAutoTransitions()` auto-closes suggestions/voting once everyone has acted. It is called opportunistically at the start of `GET /api/state` and inside admin routes; there is no background job or cron. State only advances when a request comes in. **The stage deadline is deliberately informational only** — nothing happens when it passes (the UI just shows "Frist abgelaufen"). If not everyone has acted, the admin must always close manually; that is allowed at any time, before or after the deadline (an incomplete tally still needs `force: true` as a confirmation). Don't add deadline-based auto-close.

**`src/lib/state.ts` (`buildState`) is the single read model.** It assembles the `StateDTO` the entire frontend consumes and enforces all information-hiding rules: books stay hidden during `suggestions_open`; vote tallies are hidden until voting closes; **submitter names are only revealed once a round is `finished`**. **Participation is deliberately public**: `submittedNames` / `votedNames` (and the counts) are always visible, so everyone can see *who* has submitted/voted — but never *what* they submitted or *how* they voted (that stays hidden per the rules above; the roster is an aggregate never linked to a specific book). Logged-out requests get an empty state (`user.name: null`, no round, no last round) and `GET /api/history` requires login (401), so nothing is readable without picking a name. When changing what clients can see, change it here — routes return raw DTOs, the UI does no filtering of its own.

**Frontend** is a single polling client. `src/components/useAppState.ts` re-fetches `/api/state` every 5s (`POLL_MS`); there are no websockets. `src/app/page.tsx` renders stage-specific UI from `StageCards.tsx` / `AdminBar.tsx` based on `round.status`. After any mutating call, components call `refresh()` rather than optimistically updating.

**Persistence** (`src/lib/db.ts`): synchronous `better-sqlite3`, a single connection cached on `global.__bookclub_db` to survive Next dev hot-reloads. WAL mode + foreign keys are enabled on init; the schema is created idempotently with `CREATE TABLE IF NOT EXISTS` (there are no migration files — schema changes mean editing `init()` and reasoning about existing rows; see the `voting_system` column and the `votes` rebuild there for examples). Backups must include `bookclub.sqlite` plus its `-wal` / `-shm` sidecars.

**Auth** (`src/lib/auth.ts`): no real accounts. Login = pick a name from the list; the admin additionally supplies the password. The session is a self-signed HMAC token (`base64url(payload).hmac`) in the `bc_session` httpOnly cookie, valid 5 years. `requireUser` / `requireAdmin` in `src/lib/api.ts` guard the routes and return a `Response` on failure — the calling handler must check `instanceof Response` and return it early.

## Conventions

- API handlers export `export const dynamic = 'force-dynamic'` (state must never be cached) and use the `ok()` / `err()` helpers from `src/lib/api.ts`. Errors are `{ error: string }` with an appropriate status; error messages are user-facing German.
- Deadlines are accepted as either an absolute ISO datetime (`deadlineAt`) or relative hours (`deadlineHours`) and normalized by `resolveDeadlineHours` in `src/lib/deadline.ts`. Stored as ISO strings.
- Business rules to preserve: you cannot vote for your own book except during a run-off (`canVoteOwnBook` / the `isRunoff` flag) — with several votes, none of them may go to it; one book per person per round (`UNIQUE`); one ballot per person per round — `castBallot` replaces the voter's rows (`UNIQUE(round_id, voter_name, book_id)`) and `/api/votes` requires the points to add up to exactly `votesPerVoter`.

## Deployment

Multi-stage `Dockerfile` producing a Next standalone image; `better-sqlite3` is compiled during `npm ci` (build deps present in the `deps` stage), so it builds natively on the target arch (e.g. arm64). `docker-compose.yml` stores `/app/data` in the named volume `bookclub_data` (Compose prefixes the project/stack name, e.g. `bookclub_bookclub_data`). See `README.md` for the Portainer setup and instructions for inspecting the SQLite file directly.
