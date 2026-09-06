# Ludo — Neon Edition

Real-time multiplayer Ludo for 2–6 players. Next.js + Socket.io, with MySQL for
the leaderboard.

See **[RULES.md](RULES.md)** for the full game rules.

---

## Requirements

- **Node.js** 18+
- **MySQL** — optional. Without it the game plays fine; you just lose the
  leaderboard and crash recovery.
- **ngrok** — optional, for playing across different networks.

---

## Setup

```bash
npm install
cp .env.example .env.local     # optional — every value has a default
```

### Database (optional)

Import `database/schema.sql`, either through phpMyAdmin or on the command line:

```bash
mysql -u root -p < database/schema.sql
```

Then point `.env.local` at your MySQL if it isn't on `localhost:3306` as `root`
with no password.

---

## Running

**Linux / macOS**

```bash
./start.sh              # dev mode, compiles on demand
```

**Windows**

```
start.bat
```

**Production**

```bash
npm run build
NODE_ENV=production node server.js
```

The server prints both a `localhost` URL and your LAN address:

```
🎮 Ludo Game running at:
   Local:   http://localhost:4000
   Network: http://192.168.1.37:4000  ← Share this on WiFi
```

---

## Playing with friends

**Same WiFi** — share the `Network:` URL, or just the 6-character room code.

**Different networks** — run `ngrok http 4000` and share the public URL. It also
appears on the lobby screen.

Either way: create a room, then share the **link** shown in the waiting room.
Opening it asks for a name and drops the player straight in.

---

## Configuration

Everything is env-driven with working defaults — see
[`.env.example`](.env.example) for the full list, including the reconnect grace
period, the idle-turn timeout and the room sweep interval.

---

## Testing

```bash
npm test          # unit + server integration (Jest)
npm run test:e2e  # browser end-to-end (Playwright)
```

- `tests/game-logic.test.js` — the rules engine and board geometry, including a
  simulation that plays out full games at every player count to prove no
  position can soft-lock.
- `tests/integration/` — a real `server.js` over real sockets: reconnect/AUTO
  timers, host controls, validation.
- `tests/e2e/` — the actual browser flows.

Playwright needs its browser once: `npx playwright install chromium`.

---

## Architecture

```
server.js              Socket.io server — authoritative, validates every move
game-logic.js          State transitions (apply move, turn order, game over)
src/lib/rules.js       ← single source of truth: path lengths, safe squares,
                         move legality, board geometry. Shared by the server
                         AND the React components, so the highlight a player
                         sees can't disagree with what the server accepts.
src/lib/board.ts       Typed view of rules.js for the components
src/app/               Next.js App Router pages
src/components/        Board, dice, panels, waiting room
```

The client never decides anything. It requests a roll or a move; the server
checks it against `getValidMoves` and broadcasts the resulting state.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Leaderboard says "unavailable" | MySQL isn't reachable — start it and reload. Games still work. |
| Friends can't connect | Allow Node.js through the firewall on port 4000 |
| `EADDRINUSE` | Something else is on port 4000 — set `PORT=4001` |
| Playwright can't find a browser | `npx playwright install chromium` |

---

*Built with Next.js + Socket.io + MySQL*
