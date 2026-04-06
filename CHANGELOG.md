# Changelog

All notable changes to Maida, combining public-facing updates and technical details.

---

## [v0.1.0] - 2026-04-06

### Internationalization
- **Simplified Chinese (zh-CN)**: Full locale support -- UI labels, prescriptions (39 entries), user manual.
- **Locale detection**: Three-tier fallback (localStorage > browser language > default). `zh-TW` and `zh-CN` correctly distinguished.
- **Language settings**: Disclosure button list with two-tap confirm. D-pad navigable.

### Settings Redesign
- **Disclosure pattern**: Language, Vibration, Controls sections collapse/expand. Title shows current value (e.g., "Language: 日本語 ▸").
- **Haptic segmented bar**: Off/Low/Medium/High as connected buttons. D-pad left/right switches immediately.
- **Controls section**: Full keyboard + gamepad shortcut reference table (Rin mode, Kamae mode, General).
- **Vibration duration**: Unified to 500ms across all presets.

### Accessibility
- **SR guides**: Every face switch announces purpose ("Try this game or skip to the next. Ctrl+Tab to switch to Kamae mode...").
- **Rin initial focus**: Changed from NOT NOW to game title (h1). SR reads game name first.
- **Kamae initial focus**: Focus to active kata on mount.
- **Settings initial focus**: Focus to h1 title on mount.
- **Update button**: i18n aria-label + role="alert" (once per session). Gold border, full-width.
- **confirm_delete_aria**: "Press again to delete" (clearer for SR).
- **Escape cancels remove confirm**: HoldButton intercepts Escape before KamaeView back handler.
- **prescription aria-live removed**: Eliminated NVDA double-read.
- **try_hint**: "3s" → "3 seconds" (SR reads correctly).
- **Orca/WebKitGTK**: Documented limitation in a11y statement (4 locales).
- **B in Settings**: Focus to back button first, not immediately close.

### Gamepad
- **Y button = F2**: Rename kata via controller Y button.
- **Kata controls hint**: "Press F2 or controller Y to rename a kata." in KataPanel.
- **Touch keyboard**: `EnableFocusTracking` COM API replaces TabTip.exe (removed in Windows 11 24H2).
- **Game list vibration fix**: A button on `<li>` no longer triggers vibration (only remove button does).

### Testing & CI
- **Hardening tests**: engine.js fallback +2, license.js branch +2, katas.js guard +1.
- **Locale detection tests**: 9 tests (exact match, base match, localStorage override).
- **axe-core e2e**: Playwright + @axe-core/playwright, 3 tests (WCAG 2.2 AA, lang, interactive elements).
- **waitForSelector**: Replaced hardcoded 2s wait in e2e.
- **CI a11y job**: Added to test.yml workflow.

### Infrastructure
- **Repo migration**: `devBrightRaven/maida` (public). git subtree split, 309 commits preserved.
- **Cloudflare Worker**: maida-telemetry deployed (APAC). D1 database for anonymous pings.
- **Updater proxy**: Worker /update endpoint for private repo → public repo transition.
- **Updater endpoint**: Changed to direct GitHub URL (public repo).
- **Telemetry URL fix**: brightraven → brightravenworld.
- **GPL-3.0 license**: Added.
- **Startup white screen fix**: `visible: false` + Rust `window.show()` after setup.
- **Steam title update**: Healing merge updates game names from ACF on each startup.

### Code Review
- 5 findings (2 MEDIUM, 3 LOW). a11y lang list fixed, taskkill removed, e2e waitForSelector.

### Architecture Migration: Electron to Tauri

- **Framework**: Migrated from Electron 39 to Tauri 2. Significantly smaller binary size and native OS integration.
- **Two Faces**: Rin (臨, fast decision) and Kamae (構, slow curation) with face-switching.
- **Kata System**: Named sub-groups (MAX_KATAS = 2, expandable to 10) with MAX_KATA_GAMES = 15.
- **Showcase Curation**: Kamae search, add/remove games, hold-to-remove (2.5s).
- **IGDB Integration**: Optional game duration data via Twitch Developer credentials.
- **Calligraphy SVG**: Handwritten brush calligraphy as decorative background (vector traced from PNG).
- **Three Languages**: English, Traditional Chinese (zh-TW), Japanese (ja) with prescriptions per language.
- **Accessibility**: NVDA screen reader support, visual state three-separation (active/hover/focus), D-pad navigation, keyboard-equivalent gamepad controls.
- **Legal Pages**: Accessibility Statement, Privacy Policy, Terms of Use (for itch.io).
- **Font System**: CSS variables for 7 font sizes + Debug FontSizeTuner.
- **Engine Filter**: candidatePool filters to installed games only; Rin rolls from active kata or full showcase.

### Breaking Changes

- Electron removed. Tauri 2 required.
- `games.json` schema unchanged but `showcase.json` added.
- IPC bridge methods updated for Tauri invoke pattern.

---

## [v0.0.6] - 2026-02-11

### Stability
- **Crash Recovery**: ErrorBoundary component wraps `<App />`. Recovery UI ("Reload" / "Clear Data & Reload") instead of permanent black screen.
- **Faster Startup**: Background snapshot reverted to fire-and-forget (non-blocking). Results update React state asynchronously via `.then()`.
- **Skip Null Guard**: Fixed crash when pressing Acknowledge in idle state with no game available.

### New
- **Silent Update Check**: `useUpdateCheck` hook checks GitHub Releases on mount. Version tag shows "(latest)" or "(update available)" with link. 24h in-memory cache.
- **Hide Games**: Debug Panel "Hide" button adds game to `constraints.json` exclude list. Pre-engine filter via `applyConstraints()`.

---

## [v0.0.5] - 2026-02-09

### Critical Fixes
- **Background Sync**: Removed 12h cooldown that blocked Steam scan. Made snapshot result update React state. Changes now reflected on first restart (was 3 restarts + 12h).
- **Daily Decay Fix**: Removed `Math.max(0, ...)` that zeroed negative scores overnight. Fixed rate from x0.9 to x0.8 per spec. Score -2.0 now takes ~7 days to recover.

### New
- **FrozenScreen Input Guard**: 5s cooldown (default) after TRY prevents accidental double-tap. Adjustable via Debug Panel (0.5s-10s).
- **Dual Build**: Single command produces both portable and setup Windows executables.
- **Debug Panel**: Sections A-E, anchor/penalty display, color-coded event log, resume guard slider.

### Design Decision Documented
- Undo does not restore score (see 02_constitution.md Part 6).

---

## [v0.0.4] - 2026-02-05

### Distribution
- NSIS installer + portable exe dual distribution.

### UX
- Onboarding copy: "Let Maida look for you" (was "Sync Library").
- Better focus visibility on buttons.
- Fixed EXE icons.

### Input
- Removed shoulder button debug toggle (conflicts with ROG Ally X Desktop Mode).
- Debug toggle: touch/click 7-tap only.

### Fixes
- Cleaned up unnecessary console errors on first startup.

---

## [v0.0.3] - 2026-01-27

### Engine v2.3
- Removed `recentShownQueue` (artificial de-duplication). Pure weighted random selection.

### UX
- Undo button: smaller (30% width), less intrusive, hidden when anchored.

### Fixes
- Restored strict single-level undo.
- Fixed undo selecting skipped games (weight 0).
- Fixed undo button persisting after TRY.
- Fixed zombie Electron/Vite process issue.

---

## [v0.0.2] - 2026-01-25

### Fixes
- Fixed startup freeze (prescription data fallback: array vs object).
- Fixed stale debug scores (race condition).

### New
- Steam not found handling.
- Anti-repetition logic refactored (queue populates on exit, not entry).
- Silent simulation mode in debug.
- Infinite skip soft reset (auto-clears skippedIds when exhausted).

---

## [v0.0.1] - 2026-01-21

- Initial public prototype.
- Electron main process with VDF/ACF scanning.
- React frontend with weighted sampling engine.
- IPC bridge persistence layer.
