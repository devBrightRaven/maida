---
tags:
  - maida
  - user-manual
  - english
status: published
source: claude-code
project: maida
created: 2025-01-01
updated: 2026-10-30
description: "Maida v0.5.0 User Manual (English): covers the three modes (Maai, Rin, Kamae), the sidebar, kept intents, katas, decision history, the after-launch screen, keyboard and gamepad controls, settings."
---

# Maida User Manual

**Version: v0.5.0**

---

## What is this?

Maida is a quiet place between you and your Steam library.

What to play, and whether to play at all, is up to you.

Maida has three modes, listed in the sidebar on the left:
- **Maai (My games)**: Your games on one page, in three short zones. Maida opens here.
- **Rin (One at a time)**: One game from your library appears at a time. You decide: TRY it, or Not This One.
- **Kamae (Collections)**: Organize katas, the small groups of games that Rin draws from.

---

## Before You Install

### Windows: SmartScreen warning

The first time you run Maida, Windows will show **"Windows protected your PC"**. This happens because Maida isn't code-signed. Those certificates cost $300+/year, which doesn't make sense for free software made by one person.

To proceed: click **More info** → **Run anyway**. The warning will stop appearing after Windows learns the file (SmartScreen reputation builds with download count, no action needed from you).

If you'd rather verify before trusting:
- Source code: [github.com/devBrightRaven/maida](https://github.com/devBrightRaven/maida) (MIT licensed, you can read every line)
- The anonymous usage ping can be turned off at any time in Settings
- Built and contactable: bertram@brightraven.world

### ROG Ally: gamepad mode

If you're on a ROG Ally and the buttons don't work in Maida, set **Armoury Crate** to **gamepad mode**, or add Maida as a game profile. This makes the buttons send gamepad input instead of keyboard/mouse mapping.

---

## First Time Setup

1. Open Maida
2. **Choose your language.** The four options (English, 日本語, 简体中文, 繁體中文) are written in their own script, and your system language is already highlighted. You can change this later in Settings.
3. Press **"Scan my game library"**. Nothing is launched, and no data leaves your device.
4. Wait for the scan to finish
5. Done. Maida creates a "Demo Kata" with 3 random installed games so Rin has something to start with.

Steam does not need to be running for the scan. Maida reads your library from disk.

---

## Getting Around

The sidebar on the left stays in place while the page scrolls. It has:

- The three modes: **My games** (Maai, circle), **One at a time** (Rin, triangle), **Collections** (Kamae, square)
- **Decision history**
- **Settings**

Switch modes from the sidebar, or with **LB / RB** on a gamepad (Maai → Rin → Kamae, and around). On a keyboard, **Ctrl+Tab** switches between Rin and Kamae, **F9** goes to Maai, **F8** goes to Rin.

**F10** or the gamepad **Menu** button opens Settings from any mode. When you close Settings, you return to the mode you came from.

Prefer a compact sidebar? In Settings → **Mode navigation**, choose **C · Previous / next**. The sidebar then shows only the previous and next mode, with your position (for example 1 / 3).

---

## Maai: My Games

### Zones

Maai shows your games in three zones, plus a full list:

- **Recently opened**: Games Steam has a play record for, most recent first (up to 5).
- **Kept**: Games you kept an intent for (see below), newest first.
- **Just installed**: Installed games with no play record in Steam, newest first (up to 5).
- **All installed**: Every installed game. Collapsed by default; press it to expand.

Each card shows what Steam knows about it. If Steam has no play record, the card says so. Maida never guesses what you played.

### Opening a game

Press a card (quick tap, Enter, or A) to launch the game through Steam. Maida then moves to the after-launch screen (see **After You Launch a Game**).

With a mouse, resting the pointer on a card for about a second moves focus there without launching.

When a card keeps focus for a moment (3 seconds by default), a trailer or screenshots of the game play as the background. You can change the delay, or turn the sound off, in Settings → Accessibility.

### Keeping an intent

Sometimes a game matters to you, even when you are not playing it right now.

**Hold a card for 3 seconds** (mouse, Enter, or A). A note field opens: "What do you want to remember?" Write a few words and press **Save** (or Enter). Escape cancels.

The game now appears under **Kept**, with your note. A kept card has a few extra buttons:

- **Release this intent**: Removes it from Kept. The original note stays in Decision history.
- **Keep / Rest / Release**: Marks how you hold this game right now. A game set to Rest or Release no longer appears under Recently opened or Just installed.
- **Decision history**: Shows the records for this game only.

---

## Rin: One at a Time

You'll see:
- A game title, with its art when available
- A short message (called a "prescription")
- Two buttons: **TRY** and **Not This One**

### TRY

If you're willing to play this game right now, **tap TRY**.

What happens:
- The game launches immediately
- Your choice is recorded (weight +1)
- Maida moves to the after-launch screen

### Not This One

If you don't want this game right now, **tap Not This One**.

What happens:
- A different game appears
- This game won't appear again in the current session
- Games you repeatedly turn down appear much less often

### Empty kata

If the active kata has no games yet, Rin says so and TRY / Not This One stay inactive. Add games in Kamae, or switch to another kata.

---

## Kamae: Collections

Open Kamae from the sidebar (Collections), or press **Ctrl+Tab** / **RB** from Rin.

In Kamae you can:
- See your katas, each as a card with a strip of game capsules
- Search installed games and add them to the active kata
- Create, rename, and delete katas

### Katas

Katas are named groups of games. Create them by mood or theme.

- Up to 2 katas (each holds up to 15 games)
- In Rin, games only come from the active kata
- Choose "All installed games" to let Rin draw from everything installed
- Press F2 or controller Y to rename a kata

#### Operations

| Action | Method |
|--------|--------|
| Create kata | Press the "new kata" button |
| Delete kata | Press "×"; it turns into "?". Press again to delete. |
| Rename | Press F2 or controller Y |
| Add game | Press "+" on a kata card and tick games, or search by name in the search bar |
| Remove game | Press "Remove"; the button changes to "Confirm remove?". Press again to confirm, or Esc / B to cancel. Or hold Enter / A for 2.5 seconds. |

---

## That's literally it

You don't need to know anything else to use Maida. Everything below is optional.

---

## Optional: Anchoring

Sometimes you want to decide now but play later.

**In Rin, hold the TRY button for 3 seconds.**

What happens:
- The game gets "anchored" to the screen, marked with an **Anchored** badge
- TRY becomes **PLAY**
- Not This One becomes **Clear**
- Next time you open Rin, this game is still here

**Changed your mind?** Tap **Clear**.

---

## Optional: Undo

Made a mistake in Rin?

Tap the **Undo (One Time Only)** button at the bottom.

Goes back one step. Works once per decision. Switching to a different kata ends the chance to undo.

Note: Undo brings the game back on screen, but the -2 weight penalty is not reversed. The score recovers naturally via daily decay (~1 week).

---

## Optional: Decision History

Press **Decision history** in the sidebar to see your notes and recorded actions, newest first: intents you kept, edited, or released, states you set, games you launched, and TRY / Not This One / PLAY / Undo / anchor actions in Rin.

Only existing records appear. Maida does not fill in past choices or guess your reasons.

Press **Back** (or Escape / B) to return.

---

## Guided Tour

The guided tour covers Rin and Kamae. The first time you open Rin, the **?** button in the top-right corner is highlighted. Press it (or **F1**) to start a tour that walks you through:

- What the game title and prescription mean
- How TRY and Not This One work
- How to switch to Kamae
- How to manage katas and games in Kamae
- How to switch back to Rin

Replay it any time: press ? or F1 in Rin or Kamae, or go to Settings → Guided Tour → **Replay**.

---

## After You Launch a Game

### What happens after launch?

After you launch a game (from a Maai card, TRY, or PLAY), Maida steps aside. The screen reads **"In the game now"**, with a short countdown.

While you're away:
- No new options appear
- A short message appears below the title. Press left / right to see another one.

### Coming back

When you're done, return to Maida and press **Back to Maida**.

The button becomes available after the cool-down (default 15 seconds, adjustable in Settings → Accessibility → Cool-down after each try, 5-30 seconds). This prevents an accidental double press from skipping the screen.

---

## What Decides Which Game Appears in Rin

Your own choices:
- Games you TRY appear more often
- Games you turn down with Not This One appear less often
- All weights decay daily (trend toward neutral)

Maida does not rank your games for you. The weights only reflect where your own choices have been leaning.

Maai does not use weights at all. Its zones are ordered only by facts: Steam's play record, install date, and when you kept an intent.

---

## Keyboard and Gamepad Controls

### Navigation (all modes)

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move focus | Arrow keys or Tab | D-pad, or left stick |
| Scroll long pages | Page Up/Down | Right stick, or D-pad up/down on legal pages |
| Previous / next mode | — | LB / RB |
| Rin ↔ Kamae | Ctrl+Tab | — |
| Go to Maai / Rin | F9 / F8 | — |
| Settings | F10 | Menu |

### Maai

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Open a game | Enter | A |
| Keep an intent | Hold Enter 3 seconds | Hold A 3 seconds |
| Save note | Enter | A on Save |
| Cancel note | Escape | B |

### Rin Mode

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| TRY | Enter | A |
| Not This One | Enter | A |
| Anchor | Hold Enter 3 seconds | Hold A 3 seconds |
| Undo | Enter | A |

### Kamae Mode

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Select kata | Enter | A |
| Rename kata | F2 | Y |
| Delete kata | × button (twice) | A on × (twice) |
| Remove game | Hold Enter 2.5s, or press twice | Hold A 2.5s, or press twice |
| Cancel remove | Escape | B |

### General

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Switch light/dark | Top-right button | D-pad + A |
| Help / Tour (Rin, Kamae) | F1 or ? button | — |
| Back / Close | Escape | B |

NVDA screen reader supported (Windows). On Linux, Orca support is limited due to WebKitGTK constraints.

---

## Settings

Open Settings from the sidebar, or press F10 / Menu. Press **Close** (or Escape / B, twice) to leave. Some sections expand when you press their title.

- **Guided Tour**: **Replay** starts the tour again.
- **Mode navigation**: **Side navigation** (all three modes listed) or **C · Previous / next** (compact).
- **Language**: English, Japanese, Simplified Chinese, or Traditional Chinese. Select a language, then press again to apply.
- **Accessibility**:
  - **Vibration**: Off / Low / Medium / High. Changes apply immediately. (Gamepad only)
  - **Cool-down after each try**: How long to wait after starting a game before you can come back to Maida. 5 to 30 seconds (default 15s).
  - **Preview delay**: How long a focused card in Maai waits before its preview plays: 1, 3, or 6 seconds (default 3s).
  - **Preview sound**: On / Off (default On).
  - **Card opacity**: How see-through the Maai cards are against the background, 40% to 100% (default 70%).
  - **View full accessibility statement**: Opens the accessibility policy page.
- **Controls**: Keyboard and gamepad shortcuts for Rin, Kamae, and general use.
- **Appearance**: Toggle light/dark mode.
- **IGDB (Game Duration Data)**: Optional. Enter Twitch Developer credentials to show estimated play time.
- **Anonymous Usage Data**: Each launch sends a small anonymous signal (random ID + install day count + version). Toggle off anytime.

All values persist across launches.

---

## Common Questions

**Q: Why do I keep seeing the same game in Rin?**
You've pressed TRY on it several times. Maida doesn't track playtime, only your choices. Tap Not This One if you're done with it.

**Q: Can I search for a specific game?**
In Kamae, yes: search and add it to a kata. In Maai, open **All installed**. In Rin, no. Rin is for meeting one game at a time.

**Q: Does it track how long I play?**
No. Maai shows Steam's own play record (whether and when a game was last played). Maida does not measure playtime itself.

**Q: Is my data uploaded anywhere?**
No. Your games, notes, and history stay on your device. The only thing sent is the anonymous launch ping, which you can turn off.

---

## Troubleshooting

### "Steam Not Detected"

Maida couldn't find your Steam installation on disk. It looks for the file `steamapps/libraryfolders.vdf` in standard locations:

- Windows: `C:\Program Files (x86)\Steam`, `C:\Steam`, `D:\Steam`, `E:\Steam`
- Linux: `~/.steam/steam`, `~/.local/share/Steam`, and Flatpak locations
- (Windows also checks the registry for a custom install path)

Common causes:

- Steam isn't installed → install from store.steampowered.com
- Steam is installed in a non-standard location → set environment variable `MAIDA_WINDOWS_STEAM_ROOT` to your Steam folder before launching Maida

Steam does not need to be running. Maida reads your library directly from disk and launches games via Steam URLs (which auto-start Steam if needed).

### Button doesn't respond

Most buttons (TRY, Not This One, PLAY, Clear, Back to Maida, Maai cards) react to a quick tap. Anchoring in Rin and keeping an intent in Maai need a 3-second hold. This is deliberate, to prevent accidental launches from shaky fingers or bumped gamepads.

If a button isn't reacting, you're probably mid-way: too long for a tap, too short for the 3-second hold. Try a faster tap, or commit to a full 3-second hold.

### Windows says "This app might be unsafe"
This is the SmartScreen warning. See the **Before You Install** section above for the full explanation and how to proceed.

### Game didn't launch
Check if Steam can launch the game normally. Some games need manual setup before first launch.

---

## Design Philosophy (if you're curious)

Most game launchers help you browse. Browsing your library creates decision fatigue.

Maida keeps browsing small. A few games you recently opened, the ones you kept, the ones that just arrived. Or one game at a time, in Rin. The decision stays yours.

> maida is the space you pass through before you begin.

---

Contact: bertram@brightraven.world

App Version: v0.5.0 | Manual Version: v0.5.0
Last updated: 2026-10-30
