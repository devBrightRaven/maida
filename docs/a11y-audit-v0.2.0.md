# Maida v0.2.0 — Accessibility Audit

**Date**: 2026-04-12
**Scope**: Full `src/` tree
**Standard**: WCAG 2.2 AA
**Platform**: Tauri + WebView2 (Windows primary)
**Focus**: NVDA screen reader (primary), keyboard, gamepad
**Tier**: 1 (static JSX/CSS analysis) — Tier 2 live browser + Tier 3 NVDA walkthrough still pending
**Previous audit**: none (this is the first formal audit)

Machine-readable data: [`../audit-results.json`](../audit-results.json)

---

## Score card

Two numbers per category: **initial** (pre-fix) and **post-fix** (after 2026-04-12 Tier A + B remediation).

| Category | Initial | Post-fix | Weight |
|---|---|---|---|
| Screen Reader (NVDA) | 58 | **80** | 18% |
| Keyboard Navigation | 52 | **82** | 13% |
| Color & Contrast | 88 | 88 | 13% |
| Forms | 85 | **88** | 13% |
| Responsive | 65 | 65 | 12% |
| Touch | 80 | 80 | 8% |
| Cognitive | 75 | **80** | 8% |
| Motion | 92 | 92 | 5% |
| Media | n/a | n/a | 5% |
| Agent | 70 | **82** | 5% |
| **Overall** | **68** | **80** | — |

**Interpretation**: post-fix 80 puts Maida in the "well-built public sites (BBC, NHS, government sites)" benchmark band. Space-block reclassification alone contributed +4 (68→72) because the initial audit flagged it as a WCAG 2.1.1 violation incorrectly. The remaining +8 (72→80) came from 17 actual code changes.

**Interpretation**: 68 puts Maida in the "good, some issues need attention" band. For a solo-dev v0.2 release this is well above average (commercial SPAs typically score 40-60). The gap to 80+ is almost entirely in two categories (Screen Reader, Keyboard) and is driven by four critical findings with fast fixes.

## Benchmark context

- **90-96**: hand-crafted best-practice pages, top government design systems
- **85-91**: leading a11y-focused orgs (W3C WAI, WebAIM, GOV.UK)
- **75-84**: well-built public sites (BBC, NHS)
- **55-74**: average commercial sites — **Maida currently here**
- **20-40**: neglected SPAs

---

## Critical (fix before v0.3.0)

### ~~C1. Space key is actively blocked on all buttons~~ — RECLASSIFIED

**Status**: initial audit misclassified this as critical. After reading git blame (commit `5c4f9152`) and journal `2026-03-24 addendum [01:30]`, reclassified as **intentional design, WCAG compliant via Enter**. Effort demoted from p0 fix to p3 documentation update.

**Real reasoning** (not what the code comment originally suggested):
- NVDA in browse mode translates Space into a synthetic click (`detail=1`, indistinguishable from a mouse click)
- With default focus on TRY, a browse-mode Space keystroke would bypass the 3-second long-press friction and launch a game unintentionally
- Defense-in-depth: default focus was also moved from TRY to NOT NOW so that if anything slips through, the worst case is "skip" not "launch"
- WCAG 2.1.1 Level A is satisfied because Enter provides full keyboard access (short press = visit, hold = anchor)

**What changed**:
1. Code comment in `useGameInput.js` rewritten to state the real reason and reference this audit + journal
2. `AccessibilityPage` should gain a "Known limitations" bullet so users know to use Enter (deferred to Tier A Settings polish task)
3. Score revised from 68 → 72 (Keyboard category from 52 → 75)

**Lesson**: when the code comment looks wrong, check git blame and project notes before proposing removal. Design decisions that look like bugs often have invisible constraints behind them.

### C2. `role="alert"` on every re-render spams NVDA

- **WCAG**: 4.1.3 Status Messages, Level AA
- **Location**: `src/views/RinView.jsx:284`, `src/views/KamaeView.jsx:264`
- **Issue**: `<p className="sr-only" role="alert">{t('ui.rin.sr_guide')}</p>` sits in the render tree. `role="alert"` is equivalent to `aria-live="assertive"` and interrupts whatever NVDA is reading. Because RinView re-mounts on game change, locale change, face switch, etc., the SR guide is interruptively announced repeatedly — once is helpful, twenty times is hostile.
- **Fix**: one-time gate using localStorage, downgrade to `role="status"` + `aria-live="polite"`.

```jsx
{!hasSeenRinGuide && (
  <p className="sr-only" role="status" aria-live="polite">
    {t('ui.rin.sr_guide')}
  </p>
)}
```

### C3. GuidedTour has `role="dialog"` but no focus trap

- **WCAG**: 2.4.3 Focus Order (Level A); ARIA Authoring Practices dialog pattern
- **Location**: `src/ui/features/GuidedTour/GuidedTour.jsx:201-208`
- **Issue**: Tour is declared as a dialog but Tab can escape to UI elements underneath the clip-path "hole". The visual mask suggests modal-like behavior but the DOM is fully reachable. Additionally, `aria-live="polite"` on the dialog causes double-announcements: step text change triggers live region update AND focus moves to Next button which SR also announces.
- **Fix**: add Tab trap (cycle focus Skip → Prev → Next), remove `aria-live` from dialog, add `aria-modal="true"` + `aria-describedby` pointing to step text.

### C4. Spotlight hint text is unreachable by screen readers

- **WCAG**: 1.3.1 Info and Relationships (Level A)
- **Location**: `src/views/RinView.jsx:432-448`
- **Issue**: `aria-hidden="true"` on the spotlight overlay hides the decorative effect (correct) but also hides the `.help-spotlight-hint` paragraph inside it (incorrect). SR users get nothing about what the pulse means. Focus does move to the help button, so users hear its aria-label — but the "look, there's help here" context is lost.
- **Fix**: render the hint text as a separate sr-only live region, or lift it out of the aria-hidden subtree and attach via `aria-describedby` from the help button.

---

## Warnings

| # | Finding | WCAG | File |
|---|---|---|---|
| W1 | TRY long-press has no live progress announcement | 4.1.3 AA | RinView.jsx:345, useGameInput.js:61 |
| W2 | Window-focus forcibly steals focus back to primary button | 2.4.3, 3.2.1 A | RinView.jsx:88, OnboardingView.jsx:32, App.jsx:44 |
| W3 | F10 hijacks OS-standard menu activation key | 2.1.4 A | App.jsx:197 |
| W4 | Onboarding intro paragraphs may be skipped on landing | 2.4.3 A | OnboardingView.jsx:117 |
| W5 | Kata delete 2-click confirm has no first-click feedback | 4.1.3, 3.3.4 AA | KataPanel.jsx:204 |
| W6 | Onboarding scanning state not announced | 4.1.3 AA | OnboardingView.jsx:138 |
| W7 | Custom focus tracker via focusin/focusout (not :focus-visible) | 2.4.7 AA | OnboardingView.jsx:41, RinView.jsx:117 |
| W8 | Language pending state lacks SR hint for 2-click confirm | 3.3.4 AA | SettingsPanel.jsx:172 |
| W9 | Two-step Escape in Settings is undiscoverable | 3.3.5 AAA | KamaeView.jsx:167 |
| W10 | Fixed `100vh` + `overflow:hidden` may break reflow at 320px | 1.4.10 AA | index.css:89 |

See [`audit-results.json`](../audit-results.json) `findings[].fix` for each remediation.

---

## Tips

- **T1** Controls tables in SettingsPanel need `<caption>` (`src/ui/features/Kamae/SettingsPanel.jsx:257`)
- **T2** Font vars use px instead of rem (`src/index.css:80-86`) — violates project's own rem rule
- **T3** AccessibilityPage only reachable via Footer — add Settings shortcut
- **T4** `console.log` calls in useGameInput fire on every input event — guard with `import.meta.env.DEV`
- **T5** `formatHotkeys` regex only matches 「」 brackets — extend for EN/JP quote styles

---

## Positives — do not regress

This list is important: many of these are rarer than the problems above.

- `prefers-reduced-motion` supported across **7 CSS files** (above industry average)
- `prefers-reduced-transparency` supported (rare, even W3C WAI reference sites often lack this)
- `:focus-visible` used **24 times across 6 files** — consistent focus-ring discipline
- **F1 chosen over H** for help hotkey, with explicit code comment: "H conflicts with SR heading navigation". This is the kind of awareness most teams don't have.
- `<html lang>` set before React hydration, with locale-aware resolution and fallback
- `ErrorBoundary` wraps the whole app
- Loading state uses `role="status"` + `aria-live="polite"`
- Two-step destructive delete on katas (× → ? → delete)
- Focus restoration after TracePanel / Legal page close, using `requestAnimationFrame`
- `aria-describedby` linking inputs to help text (IGDB credentials)
- All form inputs have `htmlFor` labels; no placeholder-as-label anti-pattern
- `role="switch"` on the telemetry toggle (modern pattern)
- **AccessibilityPage exists** — structured sections (commitment, standards, features, known limitations, planned improvements, contact)
- **Gamepad as motor-accessibility alternative** — users who can't do precise keyboard shortcuts get a true alternative input
- Onboarding places focus on h1 first so SR announces title before the action button
- Kata select button `aria-label` includes localized game count
- Haptic feedback (vibration) during long-press provides cross-sensory confirmation
- Contrast is excellent: dark theme `#e0e0e0` on `#0a0a0a` ≈ 17:1; light theme `#2c2c2c` on `#fdfbf7` ≈ 12:1; accent colors ≥ 4.9:1

---

## Legal risk

| Jurisdiction | Risk | Exposure | Notes |
|---|---|---|---|
| US ADA Title III | **Medium** | 5/10 | 1 Level A (Space block), 1 dialog-no-trap. No overlay widgets, no CAPTCHA, statement exists. Desktop apps less litigated than commercial websites. |
| EU EAA | Low | 3/10 | Effective 2025-06-28. B2C software covered. Check if Maida is distributed commercially. Currently MIT / free. |
| Japan JIS X 8341-3 | Low | 2/10 | Voluntary. JP locale support is a plus. |
| Taiwan | Low | 2/10 | Voluntary for private apps. |

Overall: **MEDIUM** — fixes in C1-C4 would drop this to LOW.

---

## Testing recommendations

1. **Tier 2 live audit** — start `pnpm dev`, open `localhost:1420`, inject axe-core via Playwright, verify no additional violations
2. **Tier 3 NVDA walkthrough** — cover: Onboarding → Rin game pick → Try → Long-press Enter (anchor) → face switch → Kata create/rename/delete → Settings F10 → Tour replay. Verify announcements at each state transition.
3. **Keyboard-only walkthrough** — Tab through full flow, confirm focus-visible always present, Escape behavior consistent
4. **Gamepad-only walkthrough** — Xbox controller, no keyboard, all features reachable
5. **CI integration** — add jest-axe to existing Vitest setup; run axe on component snapshots
6. **Before v0.3.0** — re-run this audit, target **overall ≥ 80**
7. **Before v1.0.0** — third-party audit (WebAIM, Deque)

---

## Recommended issue triage

| Priority | Count | Effort |
|---|---|---|
| p0 (critical, block release) | 4 | ~50 min total |
| p1 (warnings, fix in v0.2.x patch) | 6 | ~60 min total |
| p2 (polish) | 4 | ~25 min total |
| p3 (housekeeping) | 2 | ~7 min total |

Total remediation effort for full AA compliance: **~2.5 hours** of focused work. The four critical items alone take under an hour and would push the score from 68 into the 78-82 range.

---

# Addendum — Tech debt (pre-v0.2.0 origins)

Second-pass audit on components not deeply inspected in the v0.2.0-focused scan (GameDisplay, ShowcaseList, KamaeSearch, Footer, ErrorBoundary, tauri.conf.json, and orphan files).

## TD1. Dead code: `KernelView.jsx` + `InterfaceView.jsx` (critical hygiene)

- **Location**: `src/views/KernelView.jsx`, `src/views/InterfaceView.jsx`, `.css` siblings
- **Last modified**: 2026-03-28 (pre-v0.1.0)
- **Size**: 298 lines total across 4 files
- **Status**: confirmed zero imports elsewhere in `src/`
- **A11y impact**: hardcoded English strings without i18n, patterns like bare `<button>` without aria-label, `<div>` as layout. If accidentally re-imported later (by another agent or a lost merge), reintroduces debt that was never audited.
- **Security hygiene**: dead code increases attack surface and review burden. These were clearly early design prototypes (Japanese concepts "kernel"/"interface" — Maida went with "rin"/"kamae" instead).
- **Fix**: delete all four files. ~30 seconds.

```bash
rm src/views/KernelView.jsx src/views/KernelView.css
rm src/views/InterfaceView.jsx src/views/InterfaceView.css
```

## TD2. Two `role="contentinfo"` landmarks, one nested inside `<main>` (warning)

- **WCAG**: 1.3.1 Info and Relationships, Level A; ARIA landmark pattern
- **Locations**:
  - `src/App.jsx:446` — `<div className="global-version-tag" role="contentinfo">`
  - `src/ui/Footer.jsx:5` — `<footer role="contentinfo">`
- **Issue 1**: Two `contentinfo` landmarks per page. ARIA pattern expects one per document; screen readers that enumerate landmarks will announce "contentinfo" twice, confusing navigation.
- **Issue 2**: `Footer` is rendered **inside** `<main>` (see `RinView.jsx:471`, `KamaeView.jsx:327`). Per landmark nesting rules, `contentinfo` should be a sibling of `main`, not a descendant. NVDA's landmark navigation (D key) gets muddled because the footer sits logically inside the main region.
- **Issue 3**: `global-version-tag` is not semantically "content info" (copyright, site info). It's app version + update notification. This should not carry the landmark role at all.
- **Fix**:
  1. Remove `role="contentinfo"` from `global-version-tag` — it doesn't need any landmark role. If SR navigation helpful, use `role="status"` since it contains an update alert.
  2. Move `<Footer />` out of `<main>` in both RinView and KamaeView, render it at `app-root` level in App.jsx instead (single source, both views).

```jsx
// App.jsx — render Footer once, outside RinView/KamaeView
return (
  <div className="app-root">
    {face === 'kamae' ? <KamaeView ... /> : <RinView ... />}
    {themeToggle}
    <div className="global-version-tag">  {/* no role */}
      ...
    </div>
    <Footer onNavigate={handleLegalNavigate} />  {/* now sibling of main */}
  </div>
);
```

## TD3. `ErrorBoundary` is English-only and silent to screen readers (warning)

- **WCAG**: 4.1.3 Status Messages (AA), 3.1.1 Language of Page (A for mixed-locale users)
- **Location**: `src/components/ErrorBoundary.jsx`
- **Issues**:
  1. Hardcoded English string "Maida encountered an error." — no `t()` translation. JP/zh users get English error.
  2. No `role="alert"` or `aria-live` — when the error boundary triggers, SR gets no announcement of the state change. User sits in silence.
  3. Hardcoded colors `#050505` / `#e0e0e0` / `#1a1a1a` / `#333` — ignores user's theme preference. High contrast is fine, but `prefers-reduced-transparency` and light theme users get jarring dark screen.
  4. "Clear Data & Reload" button destroys all `localStorage` (includes license key, tour state, language preference, theme preference, IGDB credentials) without confirmation. Destructive action one-click-away.
- **Fix**:

```jsx
// 1. Add role="alert" and aria-live
<div style={containerStyle} role="alert" aria-live="assertive">

// 2. i18n the strings (but tricky: if i18n itself is the thing that crashed, fallback needed)
const errorMsg = (() => { try { return t('ui.error.boundary'); } catch { return 'Maida encountered an error.'; } })();

// 3. Use CSS vars instead of hardcoded colors
const containerStyle = {
  background: 'var(--t-bg, #050505)',
  color: 'var(--t-text, #e0e0e0)',
  ...
};

// 4. Clear Data button: two-click confirm pattern (matching Kata delete)
const [confirmClear, setConfirmClear] = useState(false);
<button onClick={() => {
  if (confirmClear) { localStorage.clear(); window.location.reload(); }
  else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }
}}>
  {confirmClear ? 'Press again to confirm' : 'Clear Data & Reload'}
</button>
```

## TD4. `HoldButton` has three announcement channels (tip)

- **Location**: `src/ui/features/Kamae/ShowcaseList.jsx:197-213`
- **Issue**: During kata remove hold, three things announce simultaneously:
  1. `aria-label` changes between `ariaLabel` and `t('ui.kamae.remove_confirm_aria')`
  2. `<span className="sr-only" role="status" aria-live="assertive">` for confirming state
  3. `<span className="sr-only" role="status" aria-live="assertive">` for isRunning state
- Two `aria-live="assertive"` regions mount/unmount on state change, and the button's accessible name also changes. NVDA may announce 3 times for one action.
- Also worth noting: `HoldButton` has an NVDA-specific fix at line 104-117 (short-press detected as NVDA browse-mode click, switches to two-step confirm). This is **good work** and shows the team did NVDA testing on this component. The redundant live regions just need consolidation.
- **Fix**: consolidate to a single live region keyed on state:

```jsx
<span className="sr-only" role="status" aria-live="polite">
  {confirming ? t('ui.kamae.remove_confirm_aria')
    : isRunning ? t('ui.kamae.remove_progress_aria')
    : ''}
</span>
// Drop aria-label dynamic switching; keep ariaLabel static. Let live region narrate state.
```

## TD5. Tauri `minWidth: 1024` sidesteps reflow but not zoom (tip)

- **Location**: `src-tauri/tauri.conf.json:19-20`
- **Current**: `minWidth: 1024, minHeight: 680`
- **A11y impact**: WCAG 1.4.10 Reflow requires content readable at 320px CSS px width without horizontal scrolling. With `minWidth: 1024`, the window can never narrow below 1024 CSS px — so the 320px test is bypassed. **However**, browser zoom at 200% effectively halves the CSS viewport: 1024 / 2 = 512 px. The reflow contract still matters at zoom.
- **Fix (optional)**: verify layout at 200% zoom. If layout breaks, reduce `minWidth` to 800 or lower AND fix responsive layout. Alternatively document "Maida is designed for screens ≥ 1024px" in AccessibilityPage under "Known Limitations" — which is legally defensible for a desktop app.

---

## Updated tech-debt summary

Adding these 5 to the original 19 findings: **total 24 findings** on v0.2.0 codebase.

| Priority | Count | Effort |
|---|---|---|
| p0 original | 4 | ~50 min |
| p1 original | 6 | ~60 min |
| p1 tech debt (TD2, TD3) | 2 | ~45 min |
| p2 original | 4 | ~25 min |
| p2 tech debt (TD4, TD5) | 2 | ~15 min |
| p3 original | 2 | ~7 min |
| hygiene (TD1 dead code) | 1 | ~1 min |

Total including tech debt: **~3.5 hours** to reach full AA + clean codebase.

The TD items are low-friction because they're isolated to specific files (not cross-cutting). TD1 is literally `rm` four files. TD3 ErrorBoundary is quarantined — it only renders on crash, so fixing it doesn't risk breaking happy-path behavior.

