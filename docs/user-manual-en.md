---
tags:
  - maida
  - user-manual
  - english
status: published
source: claude-code
project: maida
created: 2025-01-01
updated: 2026-04-18
description: "Maida v0.4.2 User Manual (English): covers Rin (fast decision), Kamae (curation), Kata (grouping), guided tour, anchoring, freeze state, keyboard and gamepad controls, settings."
---

# Maida User Manual

**Version: v0.4.2**

---

## What is this?

Maida shows you **one game** from your Steam library at a time.

You decide: play it now, or see something else.

Maida has two faces:
- **Rin**: Fast decision. A dice roll shows one game; you choose TRY or Not Now.
- **Kamae**: Curation. Manage your showcase and decide which games enter the dice pool.

---

## First Time Setup

1. Make sure **Steam is running**
2. Open Maida
3. Click **"Scan my Steam library"**
4. Wait for the scan to complete (no data leaves your device)
5. Done — Maida creates a "Demo Kata" with 3 random games to get you started

Maida automatically detects your system language (English, Japanese, Simplified Chinese, Traditional Chinese). You can change it later in Settings.

---

## Guided Tour

When you first enter Rin, look for the **?** button in the top-right corner. Press it (or press **F1**) to start a guided tour that walks you through:

- What the game title and prescription mean
- How TRY and Not Now work
- How to switch to Kamae mode
- How to manage katas and games in Kamae
- How to switch back to Rin

The tour is available any time — press ? or F1 whenever you need a refresher.

---

## Rin: Fast Decision

You'll see:
- A game title
- A short reflection (called a "prescription")
- Two buttons: **TRY** and **Not Now**

### TRY

If you're willing to play this game right now, **tap TRY**.

What happens:
- The game launches immediately
- Maida remembers you picked this (weight +1)
- The screen enters freeze state

### Not Now

If you don't want this game right now, **tap Not Now**.

What happens:
- A different game appears
- This game won't appear again in the current session
- Games you repeatedly refuse appear much less often

---

## Kamae: Curation

Press the switch button on the right edge of Rin, or press **Ctrl+Tab** / **RB** to enter Kamae.

In Kamae you can:
- Browse games in your showcase
- Search installed games and add them to your showcase
- Create and manage Katas

### Katas

Katas are named sub-groups within your showcase. Create them by mood or theme.

- Up to 2 katas (each holds up to 15 games)
- In Rin, the dice only rolls from the active kata
- Select "All Games" to roll from the entire showcase
- Press F2 or controller Y to rename a kata

#### Operations

| Action | Method |
|--------|--------|
| Create kata | Tap "+" button |
| Delete kata | Tap "x" button (confirm twice) |
| Rename | Press F2 or controller Y |
| Add game | Search and tap "add" |
| Remove game | Hold Enter/A for 2.5 seconds, or press twice to confirm |

---

## That's literally it

You don't need to know anything else to use Maida. Everything below is optional.

---

## Optional: Anchoring

Sometimes you want to decide now but play later.

**Hold the TRY button for 3 seconds.**

What happens:
- The game gets "anchored" to the screen
- TRY becomes **PLAY**
- Not Now becomes **Clear**
- Next time you open Maida, this game is still here

**Changed your mind?** Tap **Clear**.

---

## Optional: Undo

Made a mistake?

Tap the **Undo (One Time Only)** button at the bottom.

Goes back one step. Works once per decision.

Note: Undo brings the game back on screen, but the -2 weight penalty is not reversed. The score recovers naturally via daily decay (~1 week).

---

## Freeze State

### What is freeze?

After you tap TRY or PLAY to launch a game, Maida enters **freeze state**.

Freeze means:
- You've made a commitment
- The system stops showing new options
- Your decision is protected from interference

**This isn't pause -- it's protecting your focus.**

### How to unfreeze?

After playing, return to Maida and tap **I'M BACK**.

Note: The button activates after the cool-down period (default 15 seconds, adjustable in Settings → Accessibility → Cool-down duration, 5-30 seconds). This prevents accidental double-tap.

---

## How Maida Picks Games

Maida watches your choices:
- Games you TRY appear more often
- Games you say Not Now to appear less often
- All weights decay daily (trend toward neutral)

It's not recommending. It honestly reflects where your intention is leaning.

---

## Keyboard and Gamepad Controls

### Navigation (all modes)

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move focus | Arrow keys or Tab | D-pad, or left stick |
| Scroll long pages | Page Up/Down | Right stick, or D-pad up/down on legal pages |

### Rin Mode

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| TRY | Enter | A |
| Not Now | Enter | A |
| Anchor | Hold Enter 3 seconds | Hold A 3 seconds |
| Undo | Enter | A |
| Switch to Kamae | Ctrl+Tab | RB |

### Kamae Mode

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Select kata | Enter | A |
| Rename kata | F2 | Y |
| Delete kata | x button (twice) | A on x (twice) |
| Remove game | Hold Enter 2.5s, or press twice | Hold A 2.5s, or press twice |
| Switch to Rin | Ctrl+Tab | LB |
| Settings | Enter | A |

### General

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Switch light/dark | Click top-right button | D-pad + A |
| Help / Tour | F1 or click ? button | — |
| Back | Escape | B |

NVDA screen reader supported (Windows). On Linux, Orca support is limited due to WebKitGTK constraints.

---

## Settings

In Kamae, tap "Settings". Each section can be expanded by tapping its title.

- **Language**: Choose from English, Japanese, Simplified Chinese, or Traditional Chinese. Select a language, then press again to confirm.
- **Accessibility**: Expanded section with three preferences:
  - **Haptic feedback**: Off / Low / Medium / High. Changes apply immediately. (Gamepad only)
  - **Cool-down duration**: How long the post-TRY rest screen stays before "I'M BACK" activates. Slide between 5 and 30 seconds (default 15s). The value persists across launches.
  - **View full Accessibility statement**: Opens the accessibility policy page.
- **Controls**: Full list of keyboard and gamepad shortcuts.
- **Theme**: Toggle light/dark mode.
- **IGDB Game Duration**: Optional. Enter Twitch Developer credentials to show estimated play time below game titles.
- **Anonymous Usage Data**: Each launch sends a small anonymous signal (random ID + install day count + version). Toggle off anytime.

---

## Common Questions

**Q: Why do I keep seeing the same game?**
You've chosen TRY multiple times before. Maida doesn't track playtime -- only your choices. Tap Not Now if you're done with it.

**Q: Can I search for a specific game?**
In Kamae, yes -- search and add to your showcase. In Rin, no -- that's the dice's job.

**Q: Does it track how long I play?**
No. It only knows whether you chose TRY or Not Now.

**Q: Is my data uploaded anywhere?**
No. All data stays on your device.

---

## Troubleshooting

### "Steam Not Detected"
Steam isn't running. Start Steam, then retry.

### Button doesn't respond
You might be pressing in the "dead zone" (not quick enough, not long enough). Either tap quickly or hold firmly for 3+ seconds.

### Windows says "This app might be unsafe"
Click "More info" then "Run anyway". Maida is free software without a paid certificate. It's safe.

### Game didn't launch
Check if Steam can launch the game normally. Some games need manual setup before first launch.

---

## Design Philosophy (if you're curious)

Most game launchers help you browse. Browsing your library creates decision fatigue.

Maida removes browsing entirely. One game. One choice. Move on.

> maida is the space you pass through before you begin.

---

Contact: bertram@brightraven.world

App Version: v0.4.2 | Manual Version: v0.4.2
Last updated: 2026-04-18
