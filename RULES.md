# Ludo Game — Rules Reference

> This document is for developers who will play and test the game.
> Review these rules carefully before your first game session.

---

## 🎯 Objective

Be the **first player** to move all **4 of your pieces** from your home base, around the board, and into the center goal.

---

## 👥 Players

- **2 to 6 players** supported
- Each player picks a color and a custom name before the game
- **2–4 players** → Classic square board
- **5–6 players** → Hexagonal board (6-arm star shape)

### Player Colors

| Player Slot | Color |
|---|---|
| Player 1 | 🩷 Neon Pink |
| Player 2 | 💙 Electric Blue |
| Player 3 | 💚 Acid Green |
| Player 4 | 🟠 Hot Orange |
| Player 5 | 💜 Neon Purple |
| Player 6 | 💛 Neon Yellow |

> When fewer than 6 players play, unused corners/arms are grayed out on the board.

---

## 🏠 Home Base

- Each player starts with **4 pieces** in their **home base** (colored corner area)
- Pieces in the home base are **off the board** — they cannot move until released
- To release a piece onto the board, you must **roll a 6**

---

## 🎲 Rolling the Dice

1. On your turn, tap/click the **Roll** button
2. The dice animates and shows a number (1–6)
3. Move **one** of your pieces forward by that number
4. **Rolling a 6** = you get a **bonus extra roll** after your move
   - There is **no limit** on consecutive 6s — keep rolling and moving as long as you roll 6
5. If you have **no valid moves** (e.g., all pieces are blocked or haven't been released), your turn is automatically **skipped**

---

## 🚀 Releasing a Piece

- You must roll a **6** to move a piece from home base onto the board
- The piece is placed on your **starting square** (the square just outside your home base)
- Your starting square is always a **safe square** ⭐
- You still get your bonus roll after releasing a piece (since you rolled a 6)

---

## 🔄 Moving Around the Board

- Pieces move **clockwise** around the outer track
- Each piece travels the full loop and then turns into its **home column** (the colored path leading to the center)
- Only **your own pieces** can enter your home column — opponents cannot enter it

---

## ⭐ Safe Squares

- Certain squares on the board are marked with a **star (⭐)**
- A piece on a safe square **cannot be captured**, ever
- Safe squares include:
  - Every player's **starting square**
  - Several additional marked squares distributed around the board

---

## ⚔️ Capturing (Cutting)

- If your piece lands on a square occupied by an **opponent's piece** (that is NOT a safe square) → that opponent's piece is **sent back to their home base**
- The captured player must roll a 6 again to re-release that piece
- You **cannot** capture your own pieces

---

## 🧱 Blocking Rule

- If **2 or more pieces of the same player** are on the same square → they form a **Block**
- A blocked square **cannot be captured** — no opponent can send those pieces home
- However, opponents **can still pass through** a block (they are not stuck behind it)
- Blocks apply to all squares, including non-safe ones

---

## 🏁 Entering the Home Column & Goal

- Your **home column** is the 5-square colored path leading to the center goal
- Only your own pieces can enter your home column
- You must roll the **exact number** to move a piece into the center goal
  - Example: if a piece is **3 steps away** from the goal, you must roll exactly **3**
  - If you roll more than needed, you cannot move that piece — pick another piece or skip
- Once a piece reaches the center goal, it is **finished** — it cannot be moved or captured

---

## 🏆 Winning & Spectating

- The **first player** to get all 4 pieces into the center goal wins (**1st place**)
- The game **does not end** — remaining players continue to determine 2nd, 3rd, 4th (and 5th, 6th) place
- **1st place winner stays on screen** with a 👑 **Spectating** badge — they can watch the rest of the game
- The winner's turns are automatically skipped

---

## 🌐 Multiplayer & Connection

- Each player joins on their **own device** via a shared link
- The host creates the room and shares the link (e.g., via WhatsApp)
- An **optional room password** can be set for privacy

### If a Player Disconnects

| Time | What Happens |
|---|---|
| 0–30 seconds | "Reconnecting…" banner shown — that player's turn is paused |
| After 30 seconds | Player switches to **AUTO mode** |
| Player returns | Instantly takes back control on their next turn |

### AUTO Mode

- When a player is disconnected for more than 30 seconds, AUTO takes over
- AUTO is **not AI** — it uses simple random logic: it randomly picks any valid move
- AUTO follows all the real game rules — it will not make illegal moves
- Goal of AUTO: keep the game moving so other players are not blocked

---

## 📡 Connection Quality

- A **ping indicator** is visible in the top-right corner on every screen
- Shows your exact connection latency: e.g., `47ms`
- Updates every second
- Color changes: green (fast) → yellow (moderate) → red (slow)

---

## 🗃️ Leaderboard

- A shared leaderboard tracks **wins** and **games played** for all players
- Data is stored on the host's MySQL database — one leaderboard for everyone
- Accessible from the main menu at any time

---

*Last updated: September 2026*
