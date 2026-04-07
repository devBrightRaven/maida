# Maida Development Guide

## Overview

Maida is a Tauri 2 + React desktop application. Rust backend, JavaScript frontend.

- **Target Platforms**: Windows, Linux (Ubuntu, AppImage)
- **Build Tool**: Tauri bundler (NSIS, deb, AppImage)
- **Package Manager**: pnpm

## Prerequisites

- Node.js 24+
- pnpm 10+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- Rust stable (`rustup install stable`)
- Linux only: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libssl-dev`

## Quick Start

```bash
pnpm install
pnpm tauri dev
```

This starts Vite dev server on `http://localhost:5173` with Tauri window + hot reload.

## Scripts

| Command | What |
|---------|------|
| `pnpm tauri dev` | Dev mode (Vite + Tauri) |
| `pnpm run test` | Unit tests (Vitest) |
| `pnpm run lint` | ESLint |
| `pnpm tauri build` | Build release binary |

## Testing

```bash
pnpm run test              # Unit tests (Vitest)
pnpm run test -- --watch   # Watch mode
```

E2E tests (Playwright + axe-core) are in `e2e/`. These require a running app instance.

## CI

GitHub Actions (`.github/workflows/`):
- **Tests**: runs on push/PR to main
- **Release**: builds + publishes on tag push (Windows NSIS, Linux deb + AppImage)

## Project Structure

```
maida/
├── src/                       # React frontend
│   ├── core/                  # Pure business logic
│   │   ├── engine.js          # Weighted selection engine
│   │   ├── constraints.js     # Pre-engine filter
│   │   └── session-logic.js   # Score, penalties, state
│   ├── hooks/                 # React hooks
│   │   ├── useMaidaSession.js # Main session state
│   │   └── useGameInput.js    # Keyboard + gamepad input
│   ├── i18n/                  # en, zh-TW, zh-CN, ja
│   ├── services/              # bridge.js (Tauri invoke), persistence, haptics
│   ├── ui/features/           # Kamae, Uncertainty, Trace, Onboarding
│   ├── views/                 # RinView, KamaeView, InterfaceView
│   └── __tests__/             # Vitest tests
├── src-tauri/                 # Rust backend
│   └── src/
│       ├── commands/          # Tauri IPC commands
│       ├── steam/             # VDF parsing, library scanning
│       ├── enrichment/        # IGDB API client
│       ├── persistence.rs     # Atomic JSON read/write
│       ├── decay.rs           # Daily score decay
│       ├── telemetry.rs       # Anonymous usage ping
│       ├── credentials.rs     # Keyring (IGDB tokens)
│       └── touch_keyboard.rs  # Windows touch keyboard
├── e2e/                       # Playwright + axe-core
├── docs/                      # User manuals (4 languages)
├── CHANGELOG.md
└── README.md
```

## Troubleshooting

**`pnpm tauri dev` fails with Rust errors**
- Run `rustup update stable`
- On Linux: install webkit2gtk and gtk3 dev packages

**Steam games not found**
- Verify Steam is installed
- Check `src-tauri/src/steam/` for path detection logic

**Build fails with locked files**
- Close all running Maida instances before building
