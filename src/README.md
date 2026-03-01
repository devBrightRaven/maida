# Maida Codebase Guide (Proposed Architecture)

This document serves as a map for the Maida codebase. It explains *where* code lives and *why* it lives there.

## 📂 /app/electron (System Layer)
Handles all "outside world" interactions that a browser cannot do: file system access, Steam scanning, and window management.

- **`main.cjs`**: The entry point of the Electron "Main Process".
    - *Responsibilities*: App lifecycle (launch/quit), IPC handlers (responding to renderer requests), File I/O (reading/writing JSON), Steam Library Scanning logic.
- **`preload.cjs`**: The bridge.
    - *Responsibilities*: Exposes a safe `window.maidaAPI` to the frontend. No logic here, just pass-throughs.

## 📂 /app/src/core (Domain Layer)
The "Brain". Pure JavaScript logic. **No React, No Electron.** This code should run in a simple console.

- **`engine.js`**: Behavioral weighting engine.
    - *Responsibilities*: `getActiveGame` (Who's next?), `calculateTraceWeights` (Math).
- **`scoring.js`** (New):
    - *Responsibilities*: Constants and formulas for score changes (e.g., `SCORE_PLAY = +1`, `SCORE_SKIP = -2`).
- **`prescriptions.js`**:
    - *Responsibilities*: Logic for selecting the correct philosophical text based on momentum.

## 📂 /app/src/services (Infrastructure Layer)
The "Hands". Code that talks to the outside world (via Electron) or manages data flow.

- **`bridge.js`** (New):
    - *Responsibilities*: Wraps `window.maidaAPI` requests.
    - *Why*: Allows us to easily mock data for testing without running Electron.
- **`persistence.js`**:
    - *Responsibilities*: `loadData()`, `saveData()`, `syncLibrary()`. Orchestrates the raw API calls into useful actions.

## 📂 /app/src/ui (Presentation Layer)
The "Face". React components that only care about rendering and user interaction.

### `/ui/components` (Atoms)
- **`Button.jsx`**, **`Slider.jsx`**: Reusable implementations of our design system.

### `/ui/features` (Organisms)
- **`/Uncertainty`**:
    - **`GameCard.jsx`**: Displays the active game cover and Title.
    - **`PrescriptionCard.jsx`**: Displays the philosophical text.
    - **`Actions.jsx`**: The Play/Skip/Back buttons.
- **`/Trace`**:
    - **`TracePanel.jsx`**: The debug overlay with the matrix rain visuals.
    - **`SimulationControls.jsx`**: The temperature slider and sim buttons.

### `/ui/layouts`
- **`MainLayout.jsx`**: Handles the overall page structure (e.g., if we add a sidebar later).

## 📂 /app/src/hooks (Connection Layer)
The "Nerves". Connecting Logic (Core) to View (UI).

- **`useMaidaSession.js`**:
- **`useMaidaSession.js`**:
    - *Responsibilities*: Holds the `session` state (loading, onboarding, active, **frozen**), calls `engine.js` to get the next game, handles `refreshSession`.
- **`useSimulation.js`**:
    - *Responsibilities*: Manages the `temperature` state and debug actions.

- **`games.json`**: The seed file (if needed).
- **`prescriptions.json`**: The source of truth for all prescription texts.

## 🛠️ Build Scripts

- **`npm run dev`**: Start the development environment (React + Electron).
- **`npm run pack`**: Create a **Portable Windows Build** (folder with .exe).
    - Output: `/app/dist_portable/maida-prototype-win32-x64/`
- **`npm run pack`**: Create a **Portable Windows Build** (folder with .exe).
    - Output: `/app/dist_portable/maida-prototype-win32-x64/`
    - Useful for testing on other devices (e.g., ROG Ally) without installation.
- **`npm run dist-exe`**: Create a **Self-Contained Single Executable** (`Maida.exe`).
    - Output: `/app/Maida.exe`
    - Wraps the portable folder into a single file for easy sharing.
