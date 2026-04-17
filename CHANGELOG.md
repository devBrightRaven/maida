# Changelog

All notable changes to Maida, combining public-facing updates and technical details.

---

## [v0.4.2] - 2026-04-18

Two small tweaks shipped together.

### Prescription

- **`new-device-start` rewrite**: the "first time with this game" prescription leaked the internal data-model term `last-played` into user-facing copy. Rewritten in plain language across all four locales so the psychological nudge reads naturally instead of like debug text.

### Focus cycles

- **Rin and Kamae navigation reordered**: gamepad / keyboard focus traversal now starts at the theme toggle and help button (meta controls) before reaching the main action buttons, matching top-to-bottom visual scanning on a handheld. Initial focus on each view is unchanged (Rin: NOT NOW, Kamae: active kata row). Kamae additionally builds its focus sequence explicitly rather than from raw DOM order, so the app-root Update button is inserted before the footer strip and is no longer unreachable by D-pad or left stick.

---

## [v0.4.1] - 2026-04-18

Verification release for the auto-update pipeline. No functional changes beyond the version increment. Shipped so a live v0.4.0 install can exercise the signed-update code path end-to-end.

---

## [v0.4.0] - 2026-04-17

Consolidated release covering iterative accessibility and UX work that built up since v0.1.0 (internal v0.2.x and v0.3.0 iterations). Headline additions are gamepad-first scrolling and a persisted cool-down setting.

### Gamepad

- **Right stick = global scroll**: The right analog stick now scrolls any scrollable content (kata list, legal pages, settings) with velocity proportional to deflection. Mounted once at the app root, resolves the scroll target by walking up from the focused element to the nearest scrollable ancestor. Dead zone 0.15, speed 1500 px/sec at full deflection, dt-based so scroll feels consistent across frame rates. Suppressed while a text input / textarea / combobox / contentEditable is focused so it never fights caret keys.
- **Left stick = navigation (mirrors D-pad)**: The left analog stick now drives focus navigation, firing the same `onNav(dir)` callback as the D-pad. Discrete cardinal direction via `discretizeStick` (threshold 0.5; dominant axis wins, horizontal on ties). Shares the D-pad's 400 ms initial delay and 100 ms repeat interval so holding the stick adjusts the cool-down slider continuously, same as holding a D-pad direction.
- **D-pad fallback scroll on legal pages**: When a legal page (Accessibility / Privacy / Terms) is open, D-pad up/down scrolls the page body ~120 px per press (auto-repeats when held). This is the discrete fallback for users without a usable right stick; the back button remains focusable via Esc/B.
- **Slider focus ring for gamepad users**: The cool-down slider now styles both `:focus` and `:focus-visible`. Chromium does not always treat gamepad-driven programmatic `.focus()` as keyboard-sourced, so `:focus-visible` alone left the slider without a visible highlight; the `:focus` fallback ensures the amber outline renders whenever the slider is focused.

### Settings

- **Cool-down duration slider**: Users can set the post-TRY rest period from 5 to 30 seconds (default 15s) via a new slider in Settings. Change takes effect immediately, persists across launches in `config.json` under a new `preferences` section. SR announces the committed value using spelled-out numbers in the current locale.

### Frozen Screen (from v0.3.0)

- **Complete rework**: h1 heading receives focus so SR reads the "Take a break" title first. Two separate SR live regions: per-second visual countdown uses digits; initial and ready announcements use spelled-out numbers (prevents NVDA from struggling with rapid digit updates).
- **Reduced-motion support**: `usePrefersReducedMotion` hook drives static "about X seconds" copy instead of live countdown when the OS requests reduced motion (WCAG 2.3.3).
- **Font + size polish**: Frozen message 1.5x larger, light-mode weight 500 for clearer reading.

### Guided Tour (from v0.3.0)

- **Undo step (Rin step 4)**: Tour now covers the undo-back button. During this step the button is force-visible even when normally hidden (no-undo state), so the tour always has a target.
- **Level A refactor**: Tour step indices centralized in `src/tourSteps.js` via named `STEP.*` constants and `TOUR_TOTAL`. Adding / removing / reordering steps no longer requires updating magic numbers across view files. Only 4 edits needed per change (const file + array + i18n keys).
- **SR polish**: `aria-live` + `aria-atomic` on tour step text ensures each step is announced cleanly.

### Legal Pages (from v0.3.0)

- **Esc/B visual feedback**: Pressing Esc/B on a legal page now scrolls the back button into view, focuses it, and pulses it briefly (600ms CSS animation). User still has to press Enter/A to actually close; the single-step focus-plus-pulse is intentional so partially-sighted users see the input was received.
- **Reduced-motion fallback**: Pulse animation respects `prefers-reduced-motion`.

### i18n (4 locales: en, zh-TW, zh-CN, ja)

- **`src/i18n/numbers.js`**: Spelled-out number table extended from 0-15 to 0-30 across all locales. Used by SR announcements so NVDA voices read durations phonetically (e.g. "twenty" / "二十" / "三十") instead of splicing digit tokens with locale counter words.
- **Cross-locale polish pass**: Broad refactor of UI copy across all four locales (commit `599921c`).
- **Frozen guard setting keys**: 6 new keys per locale covering title, description, aria-label, visual value, unit, SR announce.
- **NVDA buffer-stuck limitation**: New `a11y_limitation_screen_reader_buffer_stuck` in all locales documenting the Insert+F5 workaround.

### Accessibility

- **Space-key defense on buttons**: Space no longer activates buttons, preventing NVDA browse-mode synthetic clicks from bypassing long-press friction. Enter still provides full keyboard access (short press = visit, 3s hold = anchor).
- **Focus ring refinements**: Amber/accent for focus, white for hover; single CSS variable at the design-token level.
- **KamaeSearch**: Listbox focus behavior, layered Escape (input clears → listbox closes → focus active kata), auto-close on blur.
- **Kata group Enter**: Enter on a kata group header selects the group (previously ignored).
- **Settings aria-setsize/posinset**: SR users now hear "section N of M" while navigating settings.
- **`<html lang>` region suffix**: Chinese voices correctly distinguish zh-TW from zh-CN.

### Author / Packaging

- **Author**: Bertram (Bright Raven) `<bertram@brightraven.world>`.
- **Version bump**: 0.3.0 → 0.4.0 in `package.json`, `Cargo.toml`, `tauri.conf.json`.

### Tests

- **Total: 287 tests / 21 files** (baseline at start of v0.4.0 work: 236 / 19).
- `src/__tests__/utils/scroll.test.js` (11 tests) — scroll ancestor resolution with mocked DOM chains.
- `src/__tests__/hooks/gamepadLogic.test.js` (23 tests) — dead zone, scroll delta, L-stick discretization, R-stick suppression rules. Pure-function coverage for both analog sticks' decision logic.
- `src/__tests__/services/bridge-preferences.test.js` (9 tests) — bridge range validation, graceful degrade when Tauri invoke fails.
- `src/__tests__/i18n/numbers.test.js` (8 tests) — extended 16-30 range across all 4 locales + fallback behavior.

### Infrastructure

- **Rust `preferences` module**: New `src-tauri/src/preferences.rs` with clamped `get_frozen_guard_duration` / `set_frozen_guard_duration` Tauri commands, registered in `lib.rs` invoke handler. Config stored under a new `preferences.frozenGuardSeconds` key.
- **`src/utils/scroll.js`**: New utility module with `getScrollableAncestor` and `resolveScrollTarget`. DOM-independent (takes optional window/document arguments) so it's fully unit-testable without jsdom.
- **ESLint**: Added `performance` as a readonly global for the rAF time-delta path.

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
