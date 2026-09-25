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
| BUG-008 | Maai card date/sub text low contrast on hover | P2 | 已確認，未修 |
| BUG-009 | Simplified-script locales other than zh-CN resolve to Traditional Chinese | P2 | 待驗證 |
| BUG-010 | Kamae remove hold is 2500ms, guardrail 7.4 says 3000ms | P2 | 已驗證修復（文字）|
| BUG-011 | AGENTS.md 7.11 describes a version-tag mechanism the code no longer uses | P2 | 已確認，未修 |

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

## BUG-008 Maai card date/sub text low contrast on hover

- Found: 2026-09-25 by the P2 agent while restyling Maai (pre-existing, not introduced by P2).
- Actual: when a Maai card is hovered (inverted colours), the date / sub line has low contrast. Exact ratio not recorded.
- Impact: low-vision users cannot read the date while hovering.
- Change: none. Maai hover is part of the deferred hover redesign.
- Next: measure the ratio; fix together with the Maai hover redesign or on its own if that stays deferred.

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
