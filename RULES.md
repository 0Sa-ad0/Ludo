# Ludo Game — Rules Reference

> This document is the spec the code implements. If the two ever disagree,
> that's a bug — the rules themselves live in one place, `src/lib/rules.js`,
> which both the server and the board components import.

---

## 🎯 Objective

Be the **first player** to move all **4 of your pieces** from your home base, around the board, and into the centre goal.

---

## 👥 Players

- **2 to 6 players** supported
- Each player picks a name before the game
- **2–4 players** → classic square board (52-square track)
- **5–6 players** → hexagonal board (6-arm star, 60-square track)

### Player Colours

| Slot | Colour |
|---|---|
| Player 1 | 🩷 Neon Pink |
| Player 2 | 💙 Electric Blue |
| Player 3 | 💚 Acid Green |
| Player 4 | 🟠 Hot Orange |
| Player 5 | 💜 Neon Purple |
| Player 6 | 💛 Neon Yellow |

Unused corners/arms are greyed out and labelled EMPTY.

---

## 🏠 Home Base

- Each player starts with **4 pieces** in their home base
- Pieces there are off the board and cannot move until released
- Releasing a piece requires a roll of **6**

---

## 🎲 Rolling

1. On your turn, tap the **Roll** button
2. The dice tumbles and settles on 1–6
3. Move **one** of your pieces forward by that number
4. You earn a **bonus roll** — same turn, roll again — whenever any of these happen:
   - You roll a **6** (unlimited consecutive 6s)
   - You **capture** an opponent's piece
   - A piece of yours **reaches home** (finishes)

   These stack independently but never double up — landing a capture with a
   6, for instance, is still just one bonus roll, exactly like the physical
   game.
5. **Three 6s in a row forfeits the turn** — the third consecutive 6 is void:
   no move, turn passes immediately, even though it's a 6. Any non-6 in
   between resets the streak, even if that roll earned its own bonus via a
   capture or a finish.
6. If you have **no legal move**, your turn is skipped automatically and everyone
   is told why (`🎲 4 — no legal move`)

---

## 🚀 Releasing a Piece

- Roll a **6** to move a piece from the home base onto your **start square**
- Your start square is always **safe** ⭐
- You still get the bonus roll, since you rolled a 6

---

## 🔄 The Path

- Pieces move **clockwise** around the shared outer track
- A piece walks **51 squares** on the square board (**59** on hex) and then
  turns into its own **home column**
- That is one square *short* of a full lap, by design: the square just before
  your start square is your home-column entrance, so you turn in rather than
  passing your own front door. The first square of your own arm is the one
  square you never land on — other players still pass through it.
- Only your own pieces may enter your home column

### Total distance

| Board | Track steps | Home column | Total to goal |
|---|---|---|---|
| Square (2–4) | 51 | 5 | **56** |
| Hex (5–6) | 59 | 5 | **64** |

---

## ⭐ Safe Squares

- Marked with a star ⭐
- A piece on a safe square **can never be captured**
- Safe squares are: every player's **start square**, plus the square **8 steps
  past** each start

---

## ⚔️ Capturing

- Landing on a square holding an **opponent's** piece sends that piece back to
  their home base — unless the square is safe, or the piece is part of a block
- The captured player must roll a 6 again to re-release it
- You can never capture your own pieces
- Pieces in a home column are off the shared track and cannot be captured

---

## 🧱 Blocking

- **2 or more pieces of the same player** on one square form a **block**
- A block **cannot be captured**
- Opponents **can still pass through** a block — it does not stop movement
- Blocks are shown with a white ring on the piece

---

## 🏁 Reaching the Goal

- The home column is 5 squares; the goal sits at the end
- You must roll the **exact** number to land on the goal
  - 3 steps from the goal means you need exactly a 3
  - Overshooting is not a legal move — pick another piece, or the turn is skipped
- A piece in the goal is **finished**: it cannot move or be captured

---

## 🏆 Winning & Spectating

- The first player to bring all 4 pieces home takes **1st place**
- The game **continues** so the remaining places are decided
- A finished player keeps watching, with a 👑 **Spectating** badge, and their
  turns are skipped
- When only one player is left, they are awarded the final place and the game ends

---

## 🌐 Multiplayer & Connection

- Each player joins on their own device
- The host creates the room and shares the **room code** or the **link**
- Opening the link asks for your name, then drops you straight into the room
- An optional room password can be set

### Host controls (lobby only)

- **Start early** — begin with however many players have turned up (minimum 2).
  The board resizes to match, so a 6-seat room started with 3 plays on the
  square board.
- **Remove a player** — free a seat; remaining players close up the gap

### If a player disconnects

| Time | What happens |
|---|---|
| 0–30 s | 🔌 "Reconnecting…" badge; their turn is held |
| After 30 s | Player switches to 🤖 **AUTO** |
| They return | They take back control immediately |

### If a player just goes idle

A **connected** player who does nothing for **45 seconds** has that turn played
for them. Without this, one person walking away from their phone freezes the
room for everybody else.

### AUTO mode

- Not AI: it picks uniformly at random from the legal moves
- It cannot make an illegal move — it uses the same rule function the server
  validates human moves with
- Its only job is to keep the game moving

---

## 📡 Connection Quality

- A ping indicator sits in the top-right of every screen that has a connection
- Updates every second; green → yellow → red as latency rises

---

## 🎛️ In-game controls

| Control | What it does |
|---|---|
| 🔊 / 🔇 | Mute or unmute sound (remembered on this device) |
| 🚪 | Leave the game (mid-game your seat is handed to AUTO) |

---

## 🗃️ Leaderboard

- Tracks **wins** and **games played** by player name
- Stored in the host's MySQL database
- If the database isn't running, the game still plays — the leaderboard just
  reports itself unavailable

---

## ♿ Accessibility

- Movable pieces are keyboard-reachable (Tab, then Enter/Space)
- Pinch-zoom is not blocked
- `prefers-reduced-motion` disables the pulsing glows, dice tumble and confetti

---

*Last updated: September 2026*
