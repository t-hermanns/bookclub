# Bookclub Voting

Kleine Web-App für unseren Bookclub: Buchvorschläge, anonyme Abstimmung, Stichwahlen, Historie. UI auf Deutsch. 11 fest verdrahtete Teilnehmer:innen, ein Admin mit Passwort.

## Stack
- Next.js 14 (App Router, TypeScript)
- Tailwind CSS, Light/Dark-Mode
- SQLite via `better-sqlite3` (eine Datei unter `./data/bookclub.sqlite`)
- Polling (5s) für Live-Updates

## Lokale Entwicklung

```bash
npm install
npm run dev   # http://localhost:3000
```

Datenbank wird automatisch unter `./data/` angelegt.

Umgebungsvariablen (optional, siehe `.env.example`):
- `SESSION_SECRET` – Signiert das Auth-Cookie. **In Produktion unbedingt setzen.**
- `ADMIN_PASSWORD` – Admin-Passwort (Default: `change-me`).
- `DATA_DIR` – Pfad zum SQLite-Verzeichnis (Default: `./data`).

## Deployment (Portainer)

Das Image wird mit dem mitgelieferten `Dockerfile` gebaut und über `docker-compose.yml` gestartet. Auf arm64 baut alles nativ; `better-sqlite3` wird beim `npm ci` kompiliert.

### Variante A: Direkt mit docker compose

```bash
git clone <repo> bookclub && cd bookclub
cp .env.example .env  # SESSION_SECRET ändern!
docker compose up -d --build
```

Die SQLite-Datei liegt persistent in `./data/`.

### Variante B: Stack in Portainer

1. In Portainer **Stacks → Add stack**.
2. Inhalt aus `docker-compose.yml` einfügen.
3. Unter "Environment variables" `SESSION_SECRET` (Pflicht) und ggf. `ADMIN_PASSWORD` setzen.
4. Optional: Build-Kontext über Portainer-Git verwenden, damit Updates per "Pull and redeploy" laufen.
5. Volume-Mount `./data:/app/data` zeigt auf einen Ordner relativ zum Stack-Verzeichnis (Portainer legt das automatisch an).

## Funktionsumfang

- **Login**: Name aus Liste auswählen + bestätigen, im Browser dauerhaft gespeichert (Cookie + localStorage). Der Admin bestätigt zusätzlich mit Passwort.
- **Buchvorschläge**: Titel, Autor:in, Link. Anonym; jede:r kann seinen Vorschlag bis Abstimmungsstart ändern. Live-Zähler X/11.
- **Vorschläge schließen**: automatisch wenn 11/11 vorliegen, sonst manuell durch den Admin (Warn-Dialog wenn unvollständig).
- **Phase "Vorschläge geschlossen"**: alle sehen die Bücher anonym. Eigene Vorschläge bleiben editierbar. Der Admin sieht Hinweis-Banner.
- **Abstimmung**: anonym, eine Stimme, kein Vote auf eigenes Buch. Live-Zähler. Auto-Close bei 11/11, sonst manuell mit Warn-Dialog.
- **Stichwahl**: bei Gleichstand kann der Admin eine Stichwahl starten (default 8 h). In Stichwahlen darf für eigene Bücher gestimmt werden – Banner informiert die Betroffenen. Beliebig viele Stichwahlen möglich. Sind alle verbleibenden Bücher gleichauf, ist nur noch Zufallsauswahl möglich.
- **Zufallsauswahl**: Der Admin wählt aktiv per Knopfdruck einen zufälligen Gewinner aus den gleichauf liegenden Büchern.
- **Historie**: alle abgeschlossenen Runden mit Bücherliste, Stimmen und – jetzt offengelegten – Einreicher:innen.

## Datenmodell

`rounds` (Suggestion-Runde + Child-Runden für Stichwahlen via `runoff_parent_id`), `books`, `votes`, `runoff_books`, `app_state`. Sprechende Status: `suggestions_open`, `suggestions_closed`, `voting_open`, `runoff_open`, `voting_closed`, `finished`.

## Backup

Die einzige zustandsbehaftete Datei ist `data/bookclub.sqlite` (+ WAL/SHM). Einfach den `data`-Ordner sichern.

## Datenbank manuell einsehen / bearbeiten

Die SQLite-Datei liegt unter `data/bookclub.sqlite` (lokal: `./data/bookclub.sqlite`, im Container: `/app/data/bookclub.sqlite`).

### Lokal

```bash
# einmalig: sqlite3 installieren
sudo apt install sqlite3

# interaktive Shell direkt auf der Datei im Volume
sqlite3 /pfad/zum/stack/data/bookclub.sqlite

# nützliche Befehle in der Shell:
.tables
.schema rounds
.headers on
.mode column
SELECT * FROM rounds;
SELECT * FROM books ORDER BY round_id;
SELECT round_id, voter_name, book_id FROM votes;
.quit
```

### Im laufenden Container

```bash
# Container-Name ist im docker-compose.yml: bookclub
docker exec -it bookclub sh
# Im Container ist sqlite3 nicht installiert; entweder kurz nachinstallieren …
apk add --no-cache sqlite 2>/dev/null || apt-get update && apt-get install -y sqlite3
sqlite3 /app/data/bookclub.sqlite
```

Praktischer: einfach **eine Kopie auf den Host ziehen** und dort öffnen:

```bash
docker cp bookclub:/app/data/bookclub.sqlite ./bookclub-snapshot.sqlite
sqlite3 ./bookclub-snapshot.sqlite
```

### Mit GUI

Die Datei lässt sich auch mit [DB Browser for SQLite](https://sqlitebrowser.org/) oder JetBrains DataGrip öffnen — einfach `data/bookclub.sqlite` (oder die kopierte Snapshot-Datei) als „Open database" laden.

### Wichtig: Schreibzugriff & WAL

- Wenn du die Datei live editierst während die App läuft, immer **`PRAGMA journal_mode=WAL;`** beachten — daneben liegen `bookclub.sqlite-wal` und `bookclub.sqlite-shm`. Beim Backup also alle drei mitnehmen.
- Sicherer: App kurz stoppen (`docker compose stop bookclub`), Datei bearbeiten, Container wieder starten.

### Tabellen-Übersicht

| Tabelle         | Zweck |
|-----------------|-------|
| `rounds`        | Eine Zeile pro Vorschlags-/Stichwahl-Runde inkl. `status`, Deadlines, `winner_book_id`. |
| `books`         | Bücher pro Suggestion-Runde mit `submitter_name`. |
| `votes`         | Eine Stimme pro `(round_id, voter_name)`. |
| `runoff_books`  | Welche Bücher zu einer Stichwahl-Runde gehören. |
| `app_state`     | Key-Value-Store; insbesondere `active_round_id`. |
