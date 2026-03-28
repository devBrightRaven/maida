# Maida

**200 games in your Steam library. Zero idea what to play tonight.**

Maida picks one game for you. Try it or skip it. Over time, Maida learns what you actually want to play.

## Features

- One game at a time. Try it or skip it.
- Behavioral memory -- your choices shape future suggestions.
- Katas -- group games by mood.
- Works with your Steam library.
- Runs on Windows and Linux.

## Accessibility

- Full keyboard navigation
- NVDA screen reader support (Windows)
- Gamepad support (D-pad, A/B buttons)
- Available in English, Japanese, Simplified Chinese, and Traditional Chinese

## Privacy

All game data stays on your device. Maida sends one anonymous ping per launch (random ID + install day count). Opt-out in Settings.

## Development

```bash
pnpm install
pnpm run tauri:dev
```

## Testing

```bash
pnpm run test          # unit tests
pnpm run test:e2e      # accessibility (axe-core)
```

## Building

```bash
pnpm run tauri:build
```

## License

Copyright 2026 Bright Raven World. All rights reserved.
