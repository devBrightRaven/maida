# Maida bug ledger

Updated: 2026-10-30
Scope: defects found or reported during Maida 2.0 UI plan work (P0). Feature ideas and design wishes are not tracked here.
Priority: P0 data loss / cannot start, P1 core function or data/evidence correctness, P2 local, display, non-core.
Status: 待重現, 已確認, 修復中, 待驗證, 已驗證修復, 受阻.

**Next action:** continue the real-window pass (BUG-008, then BUG-007 / BUG-013 with the Onimusha uninstall); physical gamepad when available. BUG-012 needs a wording decision from the user.

| ID | Title | P | Status |
|---|---|---|---|
| BUG-001 | Closing Settings opened from Rin leaves the user on Kamae | P1 | 已驗證修復（鍵盤）|
| BUG-002 | Closing Settings opened from Kamae drops focus to `<body>` | P2 | 已驗證修復（鍵盤）|
| BUG-003 | LastPlayed missing / invalid / 0 collapsed into "never played" | P1 | 已驗證修復 |
| BUG-004 | White screen for about 15 s on startup | P2 | 已確認（dev mode），根因未確認 |
| BUG-005 | `activity_weight` reads a field the Steam pipeline never writes | P2 | 已確認，未修 |
| BUG-006 | Playnite `lastPlayed` pipeline collapses missing / Never / unparseable | P2 | 已確認，未修 |
| BUG-007 | Uninstalled game still listed in Maai (library not refreshed) | P1 | 待重現 |
| BUG-008 | Maai card date/sub text low contrast on hover | P2 | 待驗證 |
| BUG-009 | Simplified-script locales other than zh-CN resolve to Traditional Chinese | P2 | 待驗證 |
| BUG-010 | Kamae remove hold is 2500ms, guardrail 7.4 says 3000ms | P2 | 已驗證修復（文字）|
| BUG-011 | AGENTS.md 7.11 describes a version-tag mechanism the code no longer uses | P2 | 已驗證修復（文字）|
| BUG-012 | Maai hook and state labels reuse the same word (放下 / Release / 手放す) | P2 | 已確認，待使用者決定用詞 |
| BUG-013 | Uninstalled game stays in the Kept zone with no notice | P1 | 已確認，未修 |
| BUG-014 | Rin debug inspector panel clipped at the top | P2 | 待驗證 |
| BUG-015 | Debug Trace panel: focus not moved/restored, light-theme colours, low-contrast buttons | P2 | 已確認，未修 |
| BUG-016 | Frozen screen copy no longer fits Maida (no pause / 間) | P2 | 已修，待實機驗證 |
| BUG-017 | Maai preview audio startles on loud trailers | P2 | 已確認，未修 |
| BUG-018 | Rin anchored state not distinct enough at a glance | P2 | 試做（A+B），待實機驗證 |

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
- Real window 2026-10-30 (user, `tauri dev`): Esc and the close button both return to Rin. Gamepad Menu/B path still not checked.

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
- Real window 2026-10-30 (user): after closing Settings on Kamae, arrow keys show a focus ring inside Kamae. Gamepad path not checked.

## BUG-003 LastPlayed missing / invalid / 0 collapsed into "never played"

- Reported: 2026-09-24 (plan P0-1). Updated: 2026-09-25.
- Impact: unknown play data was shown as a fact ("Not yet opened"), placed in the Just installed zone, and written into the append-only trace as 0.
- Root cause (confirmed): `src-tauri/src/steam/mod.rs` `.unwrap_or(0)` merged absent, unparseable and explicit 0; JS `|| 0` / `> 0` merged them again.
- Change: `steamLastPlayedStatus` (`recorded` / `zero` / `missing` / `invalid`), shared `src/core/lastPlayed.js`, bounded seconds rule (`0 < n <= 253402300799`), new copy `card_no_play_record` / `card_play_record_unavailable` in 4 locales, trace payload `null` instead of `|| 0`. Contract: `design/maida2-review/p0/lastplayed-contract.md` (gitignored, local only).
- Verified: `pnpm test` 434, `cargo test` 75, lint 0; Codex review R1 found an out-of-range gap, fixed, re-review pass. Local Steam: 76 manifests, 50 recorded, 26 zero, 0 missing, 0 invalid.
- Limits: old trace lines not rewritten (by design); hand-written ms timestamps now read as unknown; other machines' Steam data not checked.
- Real window 2026-10-30 (user): never-played games show 「Steam 沒有遊玩紀錄」, 剛安裝 holds only recent installs, played dates look right, no 「無法取得遊玩紀錄」 seen.

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

## BUG-008 Maai card date/sub text low contrast on hover

- Found: 2026-09-25 by the P2 agent while restyling Maai (pre-existing, not introduced by P2).
- Actual (before fix): when a Maai card is hovered (inverted colours), the date / sub line keeps the muted colour (`ModeNavigation.css` also forced it in light theme) on the inverted ground. Exact ratio was not recorded.
- Impact: low-vision users cannot read the date while hovering.
- Change (2026-10-13): `Maida2View.css` hover sub line takes `--t-hover-text`; the hover fill alpha has an 85% floor so the 40% glass preference cannot wash out the inverted ground; `:focus` is paired with `:focus-visible` (red line 7.10).
- Measured by `e2e/maai-stage-check.mjs` on rendered pixels (text colour vs the box's actual background), sub line, 1280x800, default 70% card opacity: light theme hover 8.31:1, focus 6.54:1, hover+focus 8.31:1; dark theme hover 15.31:1, focus 8.28:1, hover+focus 15.31:1. Same states over the hero stage (dark ground behind cards): light 13.51 / 4.85 / 13.51 (before the 92% stage card-alpha floor), dark 16.52 / 6.98 / 16.52. All >= 4.5:1.
- Status: 待驗證 (not yet confirmed on a real handheld / with the user's own card-opacity setting).

## BUG-009 Simplified-script locales other than zh-CN resolve to Traditional Chinese

- Found: 2026-09-25 during the language audit (code reading, not reproduced on a real OS).
- Actual (before fix): `src/i18n/index.js` `detectLocale()` matched exact tags, then only the primary subtag. `zh-Hans`, `zh-Hans-CN`, `zh-SG`, `zh-Hans-SG` all fell to base `zh` and the first `zh-*` in `SUPPORTED_LOCALES`, which is `zh-TW`.
- Expected: simplified-script and Singapore/Malaysia tags resolve to `zh-CN`; `zh-HK`, `zh-MO`, `zh-Hant*` resolve to `zh-TW`.
- Impact: a Simplified Chinese user whose WebView reports anything other than exactly `zh-CN` gets Traditional Chinese UI until they change it in Settings.
- Change (2026-09-26): `src/i18n/index.js` `detectLocale()` now checks Hans/Hant script subtags and region subtags (`cn`/`sg`/`my` -> `zh-CN`, `tw`/`hk`/`mo` -> `zh-TW`) before falling back to bare base-language match; also now scans `navigator.languages` (first supported entry wins) when present, falling back to `navigator.language`. `localStorage` override still checked first, `en` still the final fallback. Bare `zh` (no script, no region) kept as `zh-TW`, the pre-fix default — no evidence found of a real WebView reporting a bare `zh` for a Simplified-script OS; both cases in this bug's original report were fuller tags.
- Verified: unit tests only — `src/__tests__/i18n/locale-detection.test.js` now covers `zh-Hans`, `zh-Hans-CN`, `zh-CN`, `zh-SG`, `zh-MY`, `zh-Hant`, `zh-Hant-TW`, `zh-TW`, `zh-HK`, `zh-MO`, bare `zh`, `ja-JP`, `en-GB`, `fr`, and a `navigator.languages` case (`['fr', 'ja']` -> `ja`); 23/23 pass.
- Not verified: real WebView2 (Windows) / WebKitGTK (Linux) reports on an actual Simplified-script OS — still unconfirmed what those runtimes actually emit.
- Next: real-system check of what WebView2 / WebKitGTK report for `navigator.language(s)` under a Simplified-Chinese OS locale.

## BUG-010 Kamae remove hold is 2500ms, guardrail 7.4 says 3000ms

- Found: 2026-09-26 by Codex during P2 review (pre-existing baseline, already 2500ms at `6984e75`; not introduced by P1/P2).
- Actual: `src/ui/features/Kamae/ShowcaseList.jsx` `TOTAL_HOLD = 2500` ("1.5s + 1s"). `AGENTS.md` 7.4 lists `anchorThreshold = 3000ms` for "TRY hold = anchor / Kamae remove commit".
- Unknown: which one is intended. Either the code drifted or the guardrail text is inaccurate for Kamae remove.
- Change: none. 7.4 forbids shortening and requires product discussion to lengthen, so this needs a user decision.
- Next: ask the user which value is intended, then align code or guardrail text.
- Resolution 2026-09-26: user confirmed 2500ms is intended. `AGENTS.md` 7.4 text corrected (TRY anchor stays 3000ms; Kamae remove commit listed separately at 2500ms). Code unchanged.

## BUG-011 AGENTS.md 7.11 describes a version-tag mechanism the code no longer uses

- Found: 2026-09-26 by the P4 acceptance run (`design/maida2-review/p4/acceptance.md`, row 41).
- Actual: 7.11 says the update/version button is an app-root sibling `.global-version-tag` that KamaeView/RinView must concatenate into their focus cycle. The code now renders one `VersionTag className="footer-version-tag"` inside the shared `Footer` (`App.jsx` `footerVersion`, `ui/Footer.jsx`), inside each view's container, reached by the generic `.app-footer button` selector. `Maida2View.jsx` still queries `.global-version-tag` (dead: no such element is rendered).
- Behaviour: the requirement still holds. `e2e/closeout-check.mjs` proves gamepad reaches the update button in all three views and both navigation layouts. Documentation drift, not a functional regression.
- Change: none. 7.11 is a red line; rewording it needs the user's consent. Dead query in `Maida2View.jsx` left in place with it.
- Next: user decides whether to reword 7.11 to the Footer-based mechanism (keeping the rule: any new app-root sibling with interactive content must be reachable) and remove the dead query.
- Resolution 2026-09-26: user approved rewording. `AGENTS.md` 7.11 (and the local `CLAUDE.md`) now describe the Footer-based layout; the rule itself (gamepad must reach any interactive element outside a view container) is unchanged. Dead `.global-version-tag` query removed from `Maida2View.jsx`. `e2e/closeout-check.mjs`: gamepad reaches the update button 6/6 (3 views x 2 layouts); `pnpm test` 467, lint 0. Leftover `.global-version-tag` CSS rules (App.css, index.css, ModeNavigation.css, DecisionHistoryView.css) are dead selectors, left in place.

## BUG-012 Maai hook and state labels reuse the same word

- Reported: 2026-10-30 by user during the real-window pass ("這些字眼非常溷肴").
- Actual: on a kept card the action row reads 放下這個心意 / 留下 / 休息 / 放下. `hook_retract` (remove the hook) and `state_released` (set the game state to released) both use 放下; `state_keep` 留下 sits next to the zone name 留住的. Same collision in every locale: en "Release this intent" / "Release", ja 「この想いを手放す」/「手放す」, zh-CN same as zh-TW. Keys in `src/i18n/*.json` `ui.maida2`; button at `src/views/Maida2View.jsx` ~821.
- Impact: two different actions look like one; the user cannot tell which one removes the hook and which one changes the game's state.
- Change: none. Wording needs a user decision (four locales, red line 7.1 applies).

## BUG-013 Uninstalled game stays in the Kept zone with no notice

- Reported: 2026-10-30 by user: Onimusha: Way of the Sword was uninstalled; Maai still shows it under 留住的 with its note, no text saying it is no longer installed.
- Expected (user): a check and a visible notice when a kept game is not installed any more.
- Related: BUG-007. User checked 2026-10-30: Onimusha is NOT in 最近開啟 or 全部已安裝, so the library sync did register the uninstall; this is not a reproduction of BUG-007.
- Root cause (code reading, likely): `src/core/zones.js` `bucketGames` builds STILL_HERE from active hooks joined to any game record (`byId.has(h.gameId)`, ~38-41) with no `installed` check, and the kept card has no "not installed" state. `now` (~32-35) also has no explicit `installed` filter; not yet shown to matter.
- Open product question: hide the kept entry, or keep it (intent outlives uninstall) with a visible "no longer installed" notice. User asked for a check and a notice.
- Change: none. User is reinstalling Onimusha to re-check.

## BUG-014 Rin debug inspector panel clipped at the top

- Reported: 2026-10-30 by user (screenshot): hovering the risk dot in debug mode shows the inspector panel with its upper part cut off.
- Root cause (confirmed): `src/views/RinView.css` `.mvp-content { overflow: hidden; }` clips the panel, which opens upward from the dot (`GameDisplay.css` `.inspector-panel` `bottom: 120%`).
- Change: `.mvp-container.debug-mode .mvp-content { overflow: visible; }` (debug mode only).
- Verified: browser audit (mocked bridge) at 1280x800 and 1280x720, light and dark, anchored: panel inside the viewport and on top. Real window not yet checked.

## BUG-015 Debug Trace panel: focus, light-theme colours, contrast

- Found: 2026-10-30 by a browser audit of debug mode (mocked Tauri bridge, 1280x800 / 1280x720, both themes). Debug mode is reachable in release builds (7 taps), so this is user-reachable.
- Actual:
  - Opening the panel leaves focus on the TRACE button underneath; after Esc focus lands on NOT NOW, not TRACE. `src/ui/features/Trace/TracePanel.jsx` ~64-98 has no focus-on-mount or restore.
  - Light theme: hard-coded dark colours (locale select black box ~155-162, Penalties `#ff8800` ~251, Reset/Clear red 4.1:1 ~173/179, labels `#888` 3.4:1 ~136/147).
  - Dark theme: Hide and Clear buttons `#666`, 3.45:1 (~234-239, ~299-306).
  - `TracePanel.css` ~218 `accent-color: var(--amber)`; `--amber` is not defined, sliders render default blue.
  - Panel has no `role="dialog"`; `.debug-close` has no accessible name (~97).
- Not reached by the audit: real window, gamepad, populated event log.
- Change: none.

## BUG-016 Frozen screen copy no longer fits Maida

- Reported: 2026-10-30 by user (screenshot): after launching a game the screen reads 「MAIDA 已暫停」/「可以試下一款了」/ button 「再來一次」. User: the words no longer fit Maida; they should carry pause and space, the Japanese sense of 間 (ma).
- Keys: `src/i18n/*.json` `ui.status.frozen`, `frozen_wait`, `frozen_wait_sr`, `frozen_wait_static`, `frozen_ready`, `ui.button.im_back`, `im_back_wait` (used in `src/App.jsx` ~119/139). The line under it (「提早結束不會否定你曾經開始。」) is the game's own prescription text (`src/i18n/prescriptions-zh-TW.json`), not frozen-screen copy.
- Constraints: red line 7.1 (Maida never picks or pushes the next game); red line 7.5 (visual countdown digits vs spelled-out SR line stay separate); four-locale parity.
- Change (2026-10-30, user-approved wording): title 「此刻在遊戲裡」, visual countdown digits only, button 「回到 Maida」. The ready line is picked at random once per frozen screen from `ui.status.frozen_ready_1`..`_5` (`src/core/frozenReady.js`, tests in `src/__tests__/core/frozenReady.test.js`); `frozen_ready` removed. en/ja wording is a draft not yet checked by a native reader.
- Same batch: NOT NOW label renamed to 「不是這個」 (en Not This One, ja これじゃない, zh-CN 不是这个); the score penalty stays (user decision). `ui.settings.frozen_guard_desc` reworded; Settings `ui.settings.back` 返回 -> 關閉 (also the shortcut-table row). `docs/user-manual-*.md` still say "Not Now"; left for the v0.5.0 docs pass.

## BUG-017 Maai preview audio startles on loud trailers

- Reported: 2026-10-30 by user: some games' preview sound is very loud and startled them. User asks for a default of 50% or lower and asks whether Settings should allow adjusting it.
- Actual: `src/ui/features/Maida2/CardMedia.jsx` ~149 sets a fixed `v.volume = 0.35` and starts audio at full level on `canplay`. Settings has only on/off (`SettingsPanel.jsx` ~455, `get/set_maida2_preview_audio`). Trailers are mastered at very different loudness, so one fixed level cannot be safe for all.
- Background: audio default-on at low volume is a user ruling of 2026-08-31 (comment in `CardMedia.jsx`).
- Confirmed 2026-10-30 (user): the startle came from the Maai card preview video, not the launched game.
- Change: none.

## BUG-018 Rin anchored state not distinct enough at a glance

- Reported: 2026-10-30 by user (screenshots, anchored vs normal): after the 2026-10-13 redesign (glow and anchor glyph removed, badge added) the only differences are the small 錨定 badge above the title and the button labels (開打 / 清除 vs 試試 / 現在不要). Buttons share the same shape, colour and layout. User: it should be obvious at a glance that this is not the usual state.
- Code: `src/views/RinView.jsx` (`is-anchored` on `.mvp-container`, `.rin-anchored-badge`), `src/views/RinView.css` (`.rin-stage` rules ~444-530).
- Constraint: the difference must not rely on colour alone (WCAG 1.4.1); keep `:focus` + `:focus-visible` pairing (7.10).
- Change (2026-10-30, trial A+B): scoped to `.mvp-container.is-anchored` in `RinView.css`: centred wide PLAY button, CLEAR as an underlined text button (44px tall), art framed by a 2px accent outline plus corner marks (forced-colors safe). Browser check `e2e/rin-anchored-check.mjs` passes (normal state unchanged). Real window not yet checked.
