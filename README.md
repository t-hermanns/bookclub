# Bookclub Voting

Kleine Web-App für unseren Bookclub: Buchvorschläge, anonyme Abstimmung, Stichwahlen, Historie. UI auf Deutsch. Fest verdrahtete Teilnehmer:innen, ein Admin mit Passwort.

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
- `SESSION_SECRET` – Signiert das Auth-Cookie. **In Produktion Pflicht:** Fehlt die Variable (oder steht noch ein Platzhalter wie in `.env.example` drin), startet `docker compose` nicht bzw. die App beantwortet keine Anfragen. Wer den Wert kennt, kann sich als beliebige Person anmelden – auch als Admin.
- `ADMIN_PASSWORD` – Admin-Passwort (Default: `change-me`).
- `VOTING_SYSTEM` – Abstimmungssystem für **neue** Runden: `single` (1 Stimme pro Person, Default) oder `three_votes` (3 Stimmen pro Person). Eine laufende Runde behält ihr System; der Admin sieht vor dem Start, welches gilt.
- `DATA_DIR` – Pfad zum SQLite-Verzeichnis (Default: `./data`).

## Deployment (Portainer)

Das Image wird mit dem mitgelieferten `Dockerfile` gebaut und über `docker-compose.yml` gestartet. Auf arm64 baut alles nativ; `better-sqlite3` wird beim `npm ci` kompiliert.

### Variante A: Direkt mit docker compose

```bash
git clone <repo> bookclub && cd bookclub
cp .env.example .env  # SESSION_SECRET ändern!
docker compose up -d --build
```

Die SQLite-Datenbank liegt persistent im Docker-Volume `bookclub_data`. Compose stellt dem Namen den Projektnamen voran, hier also `bookclub_bookclub_data` (`docker volume ls | grep bookclub`).

### Variante B: Stack in Portainer

1. In Portainer **Stacks → Add stack**.
2. Inhalt aus `docker-compose.yml` einfügen.
3. Unter "Environment variables" `SESSION_SECRET` (Pflicht) und ggf. `ADMIN_PASSWORD` und `VOTING_SYSTEM` setzen.
4. Optional: Build-Kontext über Portainer-Git verwenden, damit Updates per "Pull and redeploy" laufen.
5. Die Datenbank landet im Named Volume `<stackname>_bookclub_data` (Portainer → **Volumes**). Es bleibt bei Redeploys erhalten.

## Funktionsumfang

- **Login**: Name aus Liste auswählen + bestätigen, im Browser dauerhaft gespeichert (Cookie). Der Admin bestätigt zusätzlich mit Passwort.
- **Buchvorschläge**: Titel, Autor:in, Link. Anonym; jede:r kann seinen Vorschlag bis Abstimmungsstart ändern. Sichtbar ist, **wer** schon eingereicht hat und wer noch aussteht (aber nicht was).
- **Vorschläge schließen**: automatisch wenn alle vorliegen, sonst jederzeit manuell durch den Admin (Warn-Dialog wenn unvollständig) — auch schon vor Ablauf der Frist.
- **Fristen** sind nur ein Richtwert: Nach Ablauf zeigt die App "Frist abgelaufen", schließt aber nichts automatisch. Solange nicht alle mitgemacht haben, muss der Admin manuell schließen.
- **Phase "Vorschläge geschlossen"**: alle sehen die Bücher anonym. Eigene Vorschläge bleiben editierbar. Der Admin sieht Hinweis-Banner.
- **Abstimmung**: anonym, kein Vote auf eigenes Buch. Je nach `VOTING_SYSTEM` hat jede:r **1 Stimme** oder **3 Stimmen**; bei 3 Stimmen müssen alle drei vergeben werden, auch mehrere (oder alle) für dasselbe Buch. Das System wird beim Start der Runde festgelegt und bei der Runde sowie in der Historie angezeigt. Sichtbar ist, **wer** schon abgestimmt hat und wer noch aussteht (aber nicht wofür). Auto-Close wenn alle abgestimmt haben, sonst jederzeit manuell durch den Admin.
- **Stichwahl**: bei Gleichstand kann der Admin eine Stichwahl starten (default 8 h). In der Stichwahl hat jede:r immer 1 Stimme. In Stichwahlen darf für eigene Bücher gestimmt werden – Banner informiert die Betroffenen. Beliebig viele Stichwahlen möglich. Sind alle verbleibenden Bücher gleichauf, ist nur noch Zufallsauswahl möglich.
- **Zufallsauswahl**: Der Admin wählt aktiv per Knopfdruck einen zufälligen Gewinner aus den gleichauf liegenden Büchern.
- **Historie**: alle abgeschlossenen Runden mit Bücherliste, Stimmen und – jetzt offengelegten – Einreicher:innen. Wurde der Gewinner per Stichwahl oder Zufall bestimmt, steht das am Gewinner; die Ergebnisse jeder Stichwahl lassen sich aufklappen.

## Datenmodell

`rounds` (Suggestion-Runde + Child-Runden für Stichwahlen via `runoff_parent_id`; `voting_system` pro Runde), `books`, `votes`, `runoff_books`, `app_state`. Sprechende Status: `suggestions_open`, `suggestions_closed`, `voting_open`, `runoff_open`, `voting_closed`, `finished`.

## Backup

Der einzige Zustand ist der Datenordner `/app/data` im Volume: `bookclub.sqlite` plus `bookclub.sqlite-wal` und `bookclub.sqlite-shm`. Immer alle drei sichern – die letzten Änderungen stehen oft noch in der `-wal`-Datei.

```bash
# kompletten Datenordner aus dem Container auf den Host kopieren
docker cp bookclub:/app/data ./bookclub-backup-$(date +%F)
```

Für ein garantiert konsistentes Backup die App vorher kurz stoppen (`docker stop bookclub`) und danach wieder starten (`docker start bookclub`).

## Datenbank manuell einsehen / bearbeiten

- Lokal (`npm run dev`): `./data/bookclub.sqlite`
- Im Container: `/app/data/bookclub.sqlite`
- Auf dem Host im Volume: `/var/lib/docker/volumes/<stackname>_bookclub_data/_data/bookclub.sqlite` (nur mit `sudo` lesbar; `docker volume inspect <name>` zeigt den genauen Pfad)

### Kopie ansehen (am einfachsten)

```bash
# einmalig: sqlite3 installieren
sudo apt install sqlite3

# ganzen Ordner kopieren (inkl. -wal, sonst fehlen evtl. die neuesten Änderungen)
docker cp bookclub:/app/data ./bookclub-snapshot
sqlite3 ./bookclub-snapshot/bookclub.sqlite

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

### Im laufenden Container bearbeiten

Das Image basiert auf Debian (`node:20-bookworm-slim`) und läuft als Benutzer `nextjs`; `sqlite3` ist nicht enthalten. Zum Installieren braucht es root (die Installation ist nach dem nächsten Redeploy wieder weg):

```bash
docker exec -u root bookclub sh -c 'apt-get update && apt-get install -y sqlite3'
# danach als normaler Benutzer öffnen, damit neue Dateien weiter `nextjs` gehören
docker exec -it bookclub sqlite3 /app/data/bookclub.sqlite
```

### Mit GUI

Die kopierte Snapshot-Datei (bzw. lokal `./data/bookclub.sqlite`) lässt sich auch mit [DB Browser for SQLite](https://sqlitebrowser.org/) oder JetBrains DataGrip öffnen — einfach als „Open database" laden.

### Wichtig: Schreibzugriff & WAL

- Die Datenbank läuft im WAL-Modus — neben `bookclub.sqlite` liegen `bookclub.sqlite-wal` und `bookclub.sqlite-shm`. Beim Kopieren und Sichern also immer alle drei mitnehmen.
- Änderungen an einer *Kopie* landen nicht in der App. Zum Bearbeiten entweder im Container arbeiten (siehe oben) oder die App stoppen (`docker stop bookclub`), die Dateien im Volume bearbeiten und wieder starten.
- Wer direkt im Volume als root arbeitet: Neu angelegte Dateien gehören dann root und die App kann sie nicht mehr schreiben – vor dem Start `sudo chown 1001:1001 /var/lib/docker/volumes/<stackname>_bookclub_data/_data/*`.

### Tabellen-Übersicht

| Tabelle         | Zweck |
|-----------------|-------|
| `rounds`        | Eine Zeile pro Vorschlags-/Stichwahl-Runde inkl. `status`, Deadlines, `winner_book_id`. |
| `books`         | Bücher pro Suggestion-Runde mit `submitter_name`. |
| `votes`         | Stimmzettel: eine Zeile pro `(round_id, voter_name, book_id)` mit `points` (Anzahl Stimmen für das Buch). |
| `runoff_books`  | Welche Bücher zu einer Stichwahl-Runde gehören. |
| `app_state`     | Key-Value-Store; insbesondere `active_round_id`. |
