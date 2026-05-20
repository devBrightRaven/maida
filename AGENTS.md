# Maida Agent Guardrails

These rules are mandatory when working on Maida.
Applies to all AI agents — Claude, Codex, Gemini, Copilot, and others.

---

## 0) No feature ideation before verification

Before proposing *any* feature/UI change, you must:

- Point to the exact existing implementation (file path + function/class name), OR
- Explicitly say "not found in codebase yet" and show what you searched (ripgrep keywords).

If you can't cite code locations, you are not allowed to suggest the feature.

---

## 1) Philosophy check is mandatory

Maida's value is often in deliberate constraints.

For any suggestion, include a one-line "Philosophy impact" note:

- **Preserves constraint** / **Violates constraint** / **Unclear** (ask one question)

Reference documents (in vault, not in this repo):

- Behavioral Constraints — The Five Immutable Rules (RED LINES)
- Design Constitution — Design principles and forbidden interpretations

---

## 2) Stop auto-apologizing & reframing

Do not use apologies or self-critique as a transition to take control of direction.

If you realize an error:

- State the correction in one sentence
- Return to the user's last concrete goal WITHOUT changing the question frame

---

## 3) Design assets

Pencil design file: `design/maida-ui.pen`

- `.pen` files are encrypted — do NOT read them with any file-reading tool.
  Editing requires Pencil's native tooling. Treat as opaque binary.
- Font family must be "Inter"
- Always set `fill` on text nodes (no color = invisible)

---

## 4) Build rules

**DO NOT build executables unless the user explicitly asks.**

For testing changes, use dev mode:

```bash
pnpm run tauri dev
```

Build targets are configured in `src-tauri/tauri.conf.json` (NSIS, deb, AppImage).

---

## 5) Package manager

**pnpm only.** Never use npm or npx.

---

## 6) This repo is source of truth

- `CHANGELOG.md` (root) — release history
- `docs/` — user manuals (4 languages)
- Gist `b26da3e8aef40d683a92e66e5b783fec` — user-facing readable copy, sync from here on release
- Technical docs (architecture, data persistence, gamepad mapping) live in vault, not here

---

## 7) Hard red lines — do not touch without explicit authorization

Each line below has been broken at least once or is load-bearing for product narrative, accessibility, or trust. Changing them requires the user's direct consent, not just "it feels cleaner."

### 7.1 Maida is not a recommender

Maida **presents** options, the user decides. Never write UI copy, docs, or release notes where Maida is the subject of `pick / chose / selected / suggested / recommended / showed you / 挑選 / 為你選 / 選びました / 提案`.

Canonical anchor: `ui.legal.terms_your_choice`:
> "Maida presents options from your game library. What you do with them is entirely up to you."

If you need to describe Maida surfacing a game, use passive or user-centric phrasing (`a game from your library appears`, `the next one appears`). Any brand or tutorial copy is subject to this.

### 7.2 Updater signing key

`tauri.conf.json > plugins.updater.pubkey` is the public half of the signing key pair. The private key lives in GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY`). Rotating the public key **breaks auto-update for every existing install** because the old install only trusts signatures that match the pubkey it shipped with. Never rotate without a migration plan.

### 7.3 Space key is intentionally blocked on buttons

`useGameInput` explicitly preventDefaults Space on `<button>`. Reason: NVDA browse mode converts Space into a synthetic click (detail=1, identical to mouse) which would bypass long-press friction and launch a game unintentionally. Enter stays fully keyboard-accessible (short press = visit, 3s hold = anchor). Do not "fix" Space back to default.

### 7.4 Long-press thresholds

- `tapThreshold = 300ms` (short press)
- `anchorThreshold = 3000ms` (TRY hold = anchor / Kamae remove commit)
- Undo decision window: same tapThreshold

These are the friction layer that protects the user from accidental state changes. Don't shorten to "improve UX." Lengthening requires product discussion.

### 7.5 Frozen screen: digits for visual, spelled-out for SR

Frozen screen has two live regions:

- Visual countdown: Arabic digits (tabular-nums)
- SR announcements (initial + ready): spelled-out via `secondsToWord` + `src/i18n/numbers.js`

Do not unify them. NVDA voices splice digit tokens with locale counter words awkwardly and rapid updates cause buffer stuttering. If `frozenGuardSeconds` range changes, the `numbers.js` table must extend to cover the new range.

### 7.6 `prefers-reduced-motion` is OS-level only

Never add an app-level toggle for motion preferences. The OS user-agent setting is the source of truth (WCAG 2.3.3 AAA). Maida respects it via `usePrefersReducedMotion`.

### 7.7 Telemetry payload is 3 fields

Anonymous ping on launch carries: random UUID, days-since-install, app version. Nothing else. No session data, game titles, device fingerprints, locale, or IP-derived info. Extending requires explicit product decision and privacy-policy update in `privacy.html` + `ui.legal.privacy_*` i18n.

### 7.8 `useGamepadScroll` is a single-instance hook

Mounted exactly once at app root. Module-level `activeInstance` counter guards against StrictMode double-mount. Do not inline R-stick scroll into `useGameInput` — `useGameInput` is mounted per-view (7 views today), so R-stick polling would multiply scroll speed by the number of mounted instances.

### 7.9 Modal state via DOM query, not state lifting

`App.jsx`'s `isModalOpen()` queries `document.querySelector('main.legal-page, .kamae-settings')`. Face-switch (LB/RB/Ctrl+Tab) is suppressed when this returns truthy. Do not lift legalPage / showSettings state three levels up to App just to check modal status — add a new selector to `isModalOpen()` for each new modal instead.

### 7.10 Gamepad focus ring: pair `:focus` with `:focus-visible`

Chromium does not classify gamepad-driven programmatic `.focus()` as keyboard-sourced, so `:focus-visible` alone will fail to light up on elements the user navigates to via D-pad / L-stick. Always pair both pseudo-classes for focusable elements in the gamepad flow.

### 7.11 App-root siblings must be explicitly added to view focus cycles

`VersionTag.global-version-tag` and any other app-root sibling of the view's `<main>` lives **outside** the view's `containerRef`. D-pad / L-stick navigation in `KamaeView.handleNav` and `RinView.handleNav` is container-scoped, so siblings are unreachable unless explicitly added:

- KamaeView: the `focusable` array concatenates `document.querySelectorAll('.global-version-tag button:not(:disabled)')`
- RinView: the named-button graph inserts `updateBtn` between theme-toggle and footer

If you add a new app-root sibling with interactive content, extend both handlers. Otherwise gamepad users cannot reach it.

### 7.12 Author

`package.json > author`, `Cargo.toml > authors`, and `tauri.conf.json` producer fields all say `Bertram (Bright Raven) <bertram@brightraven.world>`. Do not change without user consent.

---

## 8) Release cadence

Releases should accumulate meaningful user-visible change. Maida's anti-interruption narrative treats each auto-update notification as spending the user's attention; the payload must earn it. Bumping for bumping's sake violates the core product posture.

### 8.1 Release notes must be worth opening

Every release body must pass the "would a user regret clicking this?" test. Rules of thumb:

- Only a version bump + two or fewer latent no-op fixes → accumulate another cycle before tagging
- Trust-critical fix (signing key issue, auto-update failure, accessibility regression, security) → ship immediately regardless of cadence
- Polish-only → pair with at least one user-visible improvement before tagging

v0.4.1 was a one-off auto-update pipeline verification release after v0.4.0. That precedent is NOT a template. Future pipeline verification uses draft releases or test tags from feature branches; public releases exist for users, not for CI validation.

### 8.2 Version numbers are irreversible commitments

Once a tag is pushed and a release is publicly distributed (any user auto-updated to it), the version number is load-bearing forever. Rolling it back breaks installed clients: they see the lower number advertised by the server and conclude "no update available". Never rewind published tags.

v0.1.0 and v0.2.0 were safely deleted from GitHub Releases only because they were test artifacts never distributed to real users. The moment a version ships to anyone, its number is frozen.

### 8.3 Hotfix vs patch release vs release

"Hotfix" carries semantic weight: urgency plus production impact plus critical bug. Applying it to UX polish or latent copy fixes inflates the term and confuses CHANGELOG readers scanning for real incidents. Use:

- **hotfix** when a live install is broken (security, auto-update failure, crash on launch)
- **patch release** for non-urgent combined fixes (v0.4.2 was a patch release)
- **release** for normal cadence (v0.4.0, v0.5.0)

Do not collapse the distinctions for brevity. Each word sets different user expectation.

### 8.4 Minor version signals accumulation, patch signals singular fix

- **Minor** (v0.5.0) bumps ship accumulated user-visible changes: new feature + polish + i18n + docs together. Bumping minor forces the question "do I have enough material yet?"
- **Patch** (v0.4.3) bumps ship a singular concern: one focused fix, release notes may be a single line.

If you catch yourself writing a single-line v0.5.0 release note, the version is probably wrong; reconsider as v0.4.Y.

---

## 9) Multi-platform game library strategy

Maida is positioned as a Steam Deck-first daily focus tool, not a universal game aggregator.

**The only approved path for non-Steam games:** `shortcuts.vdf` — Steam's own file listing non-Steam shortcuts. Users who install games via Heroic, Lutris, EmuDeck, or manually add Battle.net titles add them to Steam, and Maida reads that file.

Rules:
- Do NOT add platform-specific library readers (Epic manifest, GOG registry, Battle.net product.db, Heroic JSON, itch.io butler.db, etc.) without explicit user demand evidence — a GitHub issue filed by a real user
- When asked to "support Epic / GOG / X", the default answer is: teach the user to add via Steam's "Add Non-Steam Game", not write a new parser
- Quantitative validation (2026-05-10): GOG Galaxy 2.0 community plugins abandoned 2021, Heroic 30% Deck adoption already routes through shortcuts.vdf, 0 existing issues requesting non-Steam platform support

See vault `Project/bright-raven/codex/005_maida/18_library-import-plan.md` for full research.

---

## 10) i18n four-language parity

Maida ships in four languages: `en`, `ja`, `zh-CN`, `zh-TW`.

Every user-facing string added or changed must be updated in all four locale files simultaneously:

```
src/i18n/en.json
src/i18n/ja.json
src/i18n/zh-CN.json
src/i18n/zh-TW.json
```

A PR that adds a key to only one locale file is incomplete. CI does not currently enforce this — it is a manual review requirement. If a translation is unknown, use a placeholder and mark it `// TODO: translate` in the PR description, but do not omit the key.
