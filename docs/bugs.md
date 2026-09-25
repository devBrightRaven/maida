# Maida bug ledger

Updated: 2026-09-25
Scope: defects found or reported during Maida 2.0 UI plan work (P0). Feature ideas and design wishes are not tracked here.
Priority: P0 data loss / cannot start, P1 core function or data/evidence correctness, P2 local, display, non-core.
Status: 待重現, 已確認, 修復中, 待驗證, 已驗證修復, 受阻.

**Next action:** real-window check of BUG-001 to BUG-003 in `pnpm run tauri dev` (isolated identifier), then physical gamepad when available.

| ID | Title | P | Status |
|---|---|---|---|
| BUG-001 | Closing Settings opened from Rin leaves the user on Kamae | P1 | 待驗證 |
| BUG-002 | Closing Settings opened from Kamae drops focus to `<body>` | P2 | 待驗證 |
| BUG-003 | LastPlayed missing / invalid / 0 collapsed into "never played" | P1 | 待驗證 |
| BUG-004 | White screen for about 15 s on startup | P2 | 已確認（dev mode），根因未確認 |
| BUG-005 | `activity_weight` reads a field the Steam pipeline never writes | P2 | 已確認，未修 |
| BUG-006 | Playnite `lastPlayed` pipeline collapses missing / Never / unparseable | P2 | 已確認，未修 |
| BUG-007 | Uninstalled game still listed in Maai (library not refreshed) | P1 | 待重現 |

---

## BUG-001 Closing Settings opened from Rin leaves the user on Kamae

- Reported: 2026-09-24 (Maida 2.0 UI plan, P0-2). Updated: 2026-09-25.
- Impact: every user who opens Settings (F10 / Menu) from Rin loses their place.
- Expected: Esc, gamepad B, or the panel close button returns to Rin.
- Actual (before fix): user stays on Kamae.
- Repro: Rin, press F10, close Settings.
- Root cause (confirmed): Settings lives in `KamaeView`; `App.jsx` `handleSettingsClosed` only switched back for `maida2`, not `rin`.
- Change: `src/core/settingsReturn.js` + `App.jsx` `handleSettingsClosed`.
- Verified: unit tests; e2e `e2e/settings-return-check.mjs` in a browser against Vite with a mocked Tauri bridge and mocked gamepad, 9/9 (Codex reran independently). Clearing the fix makes the Maai/Rin cases fail.
- Not verified: real `tauri dev` window, physical gamepad, Menu key path (tests open with F10).
- Next: real-window check.

## BUG-002 Closing Settings opened from Kamae drops focus to `<body>`

- Found: 2026-09-24 by e2e while verifying BUG-001 (pre-existing).
- Impact: keyboard, gamepad and screen-reader users lose their position after closing Settings on Kamae.
- Expected: focus lands inside the Kamae view.
- Actual (before fix): `document.activeElement` is `<body>`.
- Repro: Kamae, F10, close Settings with Esc / B / close button.
- Root cause (confirmed): no face switch happens, so KamaeView is not remounted, and its close paths did not restore focus.
- Change: `src/views/KamaeView.jsx` `settingsOpenerRef` + `returnFocusFromSettings()`.
- Verified: same e2e, Kamae cases strict, fail before fix, pass after.
- Limits: the opener is usually unmounted while Settings is open, so focus normally goes to the Kamae default target, not the original button. Tour-driven auto-close (`KAMAE_SWITCH_RIN`) deliberately not wired.
- Next: real-window check.

## BUG-003 LastPlayed missing / invalid / 0 collapsed into "never played"

- Reported: 2026-09-24 (plan P0-1). Updated: 2026-09-25.
- Impact: unknown play data was shown as a fact ("Not yet opened"), placed in the Just installed zone, and written into the append-only trace as 0.
- Root cause (confirmed): `src-tauri/src/steam/mod.rs` `.unwrap_or(0)` merged absent, unparseable and explicit 0; JS `|| 0` / `> 0` merged them again.
- Change: `steamLastPlayedStatus` (`recorded` / `zero` / `missing` / `invalid`), shared `src/core/lastPlayed.js`, bounded seconds rule (`0 < n <= 253402300799`), new copy `card_no_play_record` / `card_play_record_unavailable` in 4 locales, trace payload `null` instead of `|| 0`. Contract: `design/maida2-review/p0/lastplayed-contract.md` (gitignored, local only).
- Verified: `pnpm test` 434, `cargo test` 75, lint 0; Codex review R1 found an out-of-range gap, fixed, re-review pass. Local Steam: 76 manifests, 50 recorded, 26 zero, 0 missing, 0 invalid.
- Limits: old trace lines not rewritten (by design); hand-written ms timestamps now read as unknown; other machines' Steam data not checked.
- Next: real-window check of Maai zones and copy.

## BUG-004 White screen for about 15 s on startup

- Reported: user, earlier session, observed under `tauri dev`. Updated: 2026-09-25.
- Impact: every launch in dev; release not measured.
- Observed (dev mode, 5 warm runs): launch to first `get_data` IPC 15.6 to 17.5 s. Largest phase `window_show` to first IPC, 7.7 to 10.9 s. `prune_session_log` (debug build) 0.9 to 2.3 s at 100k to 200k log lines, every launch.
- Root cause: **not confirmed**. Vite dev cache is a hypothesis only. First contentful paint and first interactive time were not measured.
- Change: none. User decided to defer `prune_session_log` work.
- Evidence: `design/maida2-review/p0/startup-timing.md` (gitignored, local only).
- Next: measure first paint and first interactive, plus a release-build run, before choosing a fix.

## BUG-005 `activity_weight` reads a field the Steam pipeline never writes

- Found: 2026-09-24 while mapping LastPlayed data flow.
- Actual: `src-tauri/src/commands/steam.rs` `activity_weight()` reads `"lastPlayed"` and compares to `"Never"`; the Steam scan only writes `steamLastPlayed`, so the played term is always 0.
- Impact: conflict-resolution weight ignores play activity. User-visible effect not measured.
- Change: none (out of P0 scope).
- Next: decide whether to route it through the LastPlayed contract.

## BUG-006 Playnite `lastPlayed` pipeline collapses missing / Never / unparseable

- Found: 2026-09-24 while mapping LastPlayed data flow.
- Actual: `src/core/normalize.js`, `engine.js` `daysSinceLastPlayed`, `sort.js`, `stats.js` turn missing, "Never" and invalid dates into the same `null`.
- Impact: same class as BUG-003 for the Playnite source. Whether this pipeline is still reachable in 2.0 is not verified. `src/components/GamePresence.jsx` has no importers.
- Change: none (out of scope).
- Next: confirm whether the pipeline is live before fixing.

## BUG-007 Uninstalled game still listed in Maai (library not refreshed)

- Reported: 2026-09-25 by user while viewing the P1 preview (`tauri dev`, identifier `world.brightraven.maida.p0preview`).
- Impact: Maai shows games that are no longer installed; launching them cannot work, and the list stops matching the real library.
- Expected: after a game is uninstalled in Steam, Maida stops listing it as installed on the next sync.
- Actual (reported): Wo Long 2 demo, already deleted by the user, still appears in Maai.
- Repro: not yet reproduced. Unknown: whether the deletion happened before or after this preview's onboarding sync, whether the background snapshot ran, and whether the release build behaves the same.
- Root cause: not investigated. Candidate area only: `perform_background_snapshot` merge in `src-tauri/src/commands/steam.rs` (installed flag / removal handling).
- Change: none. User asked to fix later.
- Next: reproduce with a controlled uninstall, then trace the snapshot merge.
