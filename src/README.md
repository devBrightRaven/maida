# Maida Source Code

## Architecture

```
src/
├── core/                  # Pure business logic (no React, no Electron)
│   ├── engine.js          # Behavioral weighting: getActiveGame, calculateTraceWeights, getPrescription
│   ├── constraints.js     # Pre-engine filter: applyConstraints (exclude_appids, etc.)
│   ├── session-logic.js   # Pure functions: applyTryScore, applySkipScore, updateGameScore, etc.
│   └── debugStore.js      # Observable debug state + session log forwarding
│
├── services/              # Infrastructure layer
│   ├── bridge.js          # Wraps window.maidaAPI (Electron IPC)
│   └── persistence.js     # loadData/saveData with IPC → localStorage → fetch fallback
│
├── hooks/                 # React hooks (connection layer)
│   ├── useMaidaSession.js # Main session state machine (loading → onboarding → active → frozen)
│   ├── useGameInput.js    # Unified keyboard + gamepad input (60fps polling)
│   └── useUpdateCheck.js  # Silent GitHub release check
│
├── i18n/                  # Internationalization
│   ├── index.js           # Auto-detect locale, t() function, setLocale/getLocale
│   ├── prescriptions.js   # Lazy-load prescription translations per locale
│   ├── en.json            # English UI strings (source of truth)
│   ├── zh-TW.json         # Traditional Chinese (validated against user manual)
│   ├── ja.json            # Japanese (validated against user manual)
│   ├── prescriptions-zh-TW.json  # 69 prescription translations (draft)
│   └── prescriptions-ja.json     # 69 prescription translations (draft)
│
├── data/                  # Static data
│   └── prescriptions.json # Behavioral prescriptions (69 entries across categories)
│
├── views/                 # Top-level page components
│   ├── MVPView.jsx        # Main game suggestion view (TRY/NOT NOW/anchor)
│   └── OnboardingView.jsx # First-run Steam sync
│
├── ui/features/           # Feature-specific components
│   ├── Uncertainty/
│   │   └── GameDisplay.jsx    # Game title + prescription text + debug inspector
│   └── Trace/
│       ├── TracePanel.jsx     # Debug panel (simulation, trace, event log, locale switcher)
│       └── TracePanel.css
│
├── components/            # Shared components
│   └── ErrorBoundary.jsx  # React crash recovery UI
│
├── __tests__/             # Vitest tests (74 total)
│   ├── core/
│   │   ├── engine.test.js         # 19 tests
│   │   ├── session-logic.test.js  # 32 tests
│   │   └── constraints.test.js    # 4 tests
│   ├── i18n/
│   │   └── translations.test.js   # 19 tests (auto-discovers locales)
│   └── setup.js
│
├── App.jsx                # Root component, state orchestration
├── App.css
└── main.jsx               # Entry point (ErrorBoundary wrapper)
```

## Scripts

All scripts use **pnpm** (never npm/npx):

```bash
pnpm run start          # Dev mode (Vite + Electron)
pnpm run build          # Vite production build
pnpm run test           # Run all tests
pnpm run test:watch     # Watch mode
pnpm run test:coverage  # With coverage report
pnpm run dist:debug     # Package exe (debug panel enabled)
pnpm run dist:prod      # Package exe (debug panel disabled)
```

## Adding a New Locale

1. Copy `en.json` → `{locale}.json`, translate all values
2. Copy `prescriptions-zh-TW.json` → `prescriptions-{locale}.json`, translate all entries
3. In `index.js`: import the new JSON file and add to `translations` object
4. In `prescriptions.js`: add lazy import to `translationModules`
5. Run `pnpm run test` — the i18n validation tests will automatically verify completeness
