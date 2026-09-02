# Ludo Game — Setup & Run Guide

## Requirements

- **Node.js** 18+ (install from https://nodejs.org)
- **XAMPP** with MySQL running
- **ngrok** (optional, for internet access) — https://ngrok.com/download

---

## First-Time Setup

### 1. Setup MySQL Database

1. Start **XAMPP** → Start **MySQL**
2. Open **phpMyAdmin** → http://localhost/phpmyadmin
3. Click **Import** → select `database/schema.sql`
4. Click **Go** — this creates the `ludo_game` database

### 2. Configure Environment

Edit `.env.local` if your MySQL settings are different:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=        ← add your MySQL password if any
DB_NAME=ludo_game
PORT=3000
```

### 3. Build the Game

Open a terminal in this folder and run:

```
npm run build
```

---

## Running the Game

### Option A: Double-click (Easy)

Just double-click **`start.bat`** — it starts everything automatically.

### Option B: Terminal

```
node server.js
```

The game opens at: `http://localhost:3000`

---

## How to Play with Friends

### Same WiFi (Local)
- The terminal shows: `Network: http://192.168.x.x:3000`
- Share that URL with friends connected to the same WiFi
- They open it on their phone/browser → Join Room

### Different Networks (Mobile Data)
1. Install ngrok: https://ngrok.com/download
2. Run `start.bat` — ngrok starts automatically
3. The ngrok public URL appears in the ngrok window AND inside the game
4. Share that URL anywhere (WhatsApp, etc.)

---

## Rules Summary

See **RULES.md** for full rules.

Quick version:
- Roll **6** to bring a piece out of home
- Roll **6** again = extra turn (unlimited)
- Land on opponent = they go home (unless safe square ⭐ or block)
- **Block**: 2+ same-color pieces on same square = protected
- Exact roll needed to reach center goal
- Winner watches the rest of the game (spectate mode)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "DB error" on startup | Start XAMPP MySQL first |
| Friends can't connect | Check Windows Firewall — allow Node.js on port 3000 |
| Slow connection | Use ngrok for better routing |
| Game not loading | Run `npm run build` first |

---

*Built with Next.js + Socket.io + MySQL*
