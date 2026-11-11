# Game sources beyond Steam: spec and work list

Status: draft for the author's review. Nothing here is implemented. No issue, branch, or commit exists yet.
Written 2026-11-11. All `file:line` references are pinned to commit `819d949` on `main`.

Governing rules: `AGENTS.md` section 9 (amended 2026-11-11, not yet committed) and the Maida 2.0 Design Constitution.

Each statement below carries one of these labels:

- **[ruling]** the author decided it, with the date
- **[provisional]** the author agreed loosely; confirm before building on it
- **[proposal]** the drafting agent's suggestion, open to change
- **[verified]** read in the code at `819d949`
- **[unverified]** reported by research and not checked first-hand

---

## 1. Goal

Maida reads installed games from sources other than Steam and can launch them. The player does not enter games one by one.

Rulings so far:

- **[ruling 2026-11-11]** Putting games into Maida is Maida's job, not the player's.
- **[ruling 2026-11-11]** Maida adds to the player's habits and does not replace them. A library frontend (Playnite, ES-DE) is supported and is not required. Build the no-frontend path first.
- **[ruling 2026-11-11]** Without a frontend, the player names a folder and Maida does the rest.
- **[ruling 2026-11-11]** The same game installed from two stores is one game.
- **[ruling 2026-11-11]** Launch has a priority order and the player can change it.
- **[ruling 2026-11-11]** Existing design is not to be changed by this work.
- **[provisional 2026-11-11]** There are two orders, not one: a read order and a launch order (section 5).

Philosophy impact: **Preserves constraint.** Installed-only keeps Maida inside the attention field (constitution Part 1). One entry per game means fewer things to choose between. The author ruled that this is infrastructure under the Part 4 test.

## 2. Where it lives in the UI

**[proposal]** No new face and no new page.

| Surface | Change |
|---|---|
| Maai, Rin, Kamae | No layout change. Non-Steam games arrive as ordinary records in the same lists. |
| Settings panel | One new section, "Game sources", built as its own component. |
| Onboarding | Unchanged in the first version. |

Why this is enough: the three faces already cope with a record that has no Steam id. **[verified]**

- Kamae maps every installed record by `id`, and by `steamAppId` only when present (`src/views/KamaeView.jsx:60-67`, `src/ui/features/Kamae/KataPanel.jsx:35-42`).
- Kata and showcase lists key on `game.id || game.steamAppId` (`src/ui/features/Kamae/ShowcaseList.jsx:301`, `KamaeSearch.jsx:99`, `KataPanel.jsx:266`).
- A missing id renders the existing quiet empty-slot marker instead of art (`src/ui/features/Kamae/CapsuleThumb.jsx:56-59`, `src/ui/features/Uncertainty/RinArt.jsx:32-33`). Maai skips the art fetch (`src/views/Maida2View.jsx:138-143`).
- The title falls back to `game.title` when there is no localized Steam name (`src/views/Maida2View.jsx:180-182`).
- Maai keys each card on `game.id`, and focusing a card with no Steam id skips the expansion and preview and does nothing else (`src/views/Maida2View.jsx:641`, `:221-230`).

One thing does not cope, and it blocks everything else: the Steam background rescan marks every non-Steam record as uninstalled. See section 7, hazard 1.

Cost of leaving onboarding unchanged: onboarding only offers a Steam scan, and when Steam is missing it shows `voice.error.steam_not_found` (`src/views/OnboardingView.jsx:136-164`, `:233-235`). A player with no Steam installed probably cannot finish onboarding and so cannot reach settings to add a source. The way out of that error state was not traced. In the first version, non-Steam sources serve players who also have Steam.

The settings section follows the existing pattern: `<section className="kamae-settings-section">` with an `h2`, as the IGDB section does (`src/ui/features/Kamae/SettingsPanel.jsx:634-635`). `SettingsPanel.jsx` is already 811 lines, so the new section goes in a new file and `SettingsPanel` only mounts it.

### Open design decision: showing a game's sources

The author described one entry that shows it came from several sources. Showing that on a card changes the card design, which conflicts with "existing design is not to be changed". This spec does not settle it. Until the author decides, source information appears only inside the settings section, and cards stay as they are.

**[proposal]** Whatever is decided, the source label is information. Maida never asks "which one?" at the moment of launch (constitution Part 4). Changing the path happens in settings.

## 3. What breaks today for a non-Steam record

**[verified]** These are the gaps the work items close.

| Behaviour | Today | Reference |
|---|---|---|
| Launch | Silent no-op. The decision is recorded and nothing starts. | `src/App.jsx:546`, `src/hooks/useMaidaSession.js:197-198`, `:219-220` |
| Launch command | Rejects anything that is not `steam://`. | `src-tauri/src/commands/window.rs:25-28` |
| Art | Rejected unless the id is a numeric Steam appid. | `src-tauri/src/commands/capsule.rs:187-189` |
| Hide | The control is shown only with a Steam id, and the exclusion list is keyed on appid. | `src/ui/features/Trace/TracePanel.jsx:231`, `src/core/constraints.js:35` |
| Trace subject | Namespace `maida`, id = the record's `id`. Derived from `steamAppId != null` at four sites; all four must change together. | `src/services/decisionHistory.js:39-40`, `:51-52`, `src/App.jsx:500-502`, `:540-541` |
| Source field | None per game. Only a file-level `libraryProvider: "steam"`. | `src-tauri/src/commands/steam.rs:26`, `:180` |

Dead code, do not build on it: `deduplicateGames` (`src/core/dedup.js`) and `normalizePlayniteGame` (`src/core/normalize.js:21`) have no caller outside tests. `dedup.js` also reads `game.name`, while records use `title` (`src-tauri/src/steam/mod.rs:221-230`).

## 4. Identity

This is the one decision that cannot be undone cheaply. Ids are written into the append-only Decision Trace, and the constitution (Part 1, rule 6) says the game identity shared with Neri is versioned, and that a reader must never have to dedupe or guess how events relate.

**[proposal]** Shape:

- Each install is identified by `(source, sourceId)`. There is no id shared across stores, so the title is only a hint for grouping.
- Existing Steam records are not rewritten. A record with no `installs` field is read as one Steam install. No `games.json` migration is needed for current users.
- A non-Steam record's `id` is `<source>:<sourceId>`. Steam ids are title slugs made only of letters, digits, and dashes (`src-tauri/src/steam/mod.rs:212-219`), so a colon cannot collide with them.
- A game's trace subject is fixed when the record is first created and stored on the record. Later installs never change it. Code that derives the subject from `steamAppId != null` keeps doing so only when the stored subject is absent.

| Source | `sourceId` | Stability |
|---|---|---|
| Steam | appid | stable |
| Epic | `AppName` from the `.item` manifest | stable **[unverified]** |
| GOG | numeric game id | stable **[unverified]** |
| Folder (ROM) | derived from file content, not from the path | must survive a folder move |
| Steam non-Steam shortcut | `crc32(exe + name)` | changes when either changes **[unverified]**; do not use as a subject |

ROM id **[proposal, needs a test before it is fixed]**: system plus file size plus a hash of the first and last mebibyte. A full hash of a 24 GB image is too slow for a scan. Multi-file games (cue plus bin, PS3 folder format) need a rule for which file is the primary one.

### Identity decisions

Decisions 1 and 2 are settled and unblock W1. Decisions 3 and 4 are open and block W5 only.

1. **Trace namespace for new sources.** **[ruling 2026-11-12]** Keep `maida`, with a `<source>:<sourceId>` id. Today anything without a Steam id is already `maida`, so this changes no vocabulary shared with Neri. The alternative, one namespace per source, was not taken because it needs a version bump of that vocabulary.
2. **A game seen first on Epic and later installed on Steam.** **[ruling 2026-11-12]** The Steam install is attached to the existing game, and the game keeps its original trace subject, so history is not split. Today the Steam scan would add a second record (`src-tauri/src/commands/steam.rs:145-157`); W1 changes that.
3. **A wrong automatic match.** Two different games can share a title (a remake and its original). The player needs a way to split and to join. Where that control lives is a design decision (section 2).
4. **The trace subject on a manual join or split.** The trace is append-only, so past events cannot be moved. Draft default: a join keeps the subject of the game that is joined into, and the other game's earlier events stay under their old subject; a split gives the separated game a new subject from that point on. Either way some history sits under a subject that is no longer shown, and the author should decide whether that is acceptable or whether a declared link event is needed (rule 6 requires a new event type to be declared first).

## 5. The two orders

**[provisional 2026-11-11]** Both are player-editable in settings.

| Order | Decides | Default |
|---|---|---|
| Read order | Whose record is the main one when several sources report the same game: title, art, id | Steam, Playnite, Epic, Xbox first |
| Launch order | Which path runs when the player launches | Steam > Epic > GOG > Battle.net >= Ubisoft >= Playnite |

Playnite sits high in the read order because it already lists stores Maida has no reader for, and last in the launch order because Maida should launch directly when it can.

Xbox, Battle.net, and Ubisoft have not been researched. In the first version they can only arrive through a frontend.

## 6. Launch

Three kinds: a URI scheme (Steam, Epic), a direct executable (GOG), and an emulator with arguments.

Requirements **[proposal]**:

- The webview sends a game id and nothing else. Rust resolves the launch target from the stored record. An executable path or URL sent from the webview is never run. `launch_game` is an allowlist today (`src-tauri/src/commands/window.rs:26`) and stays one.
- Verify that the Epic URI survives the Windows launch path. It contains `&`, and the current code runs `cmd /C start "" <url>` (`window.rs:31-33`). `cmd` may split on `&`. If it does, use a launch call that does not go through `cmd`.
- Emulator launch commands reuse a maintained rule set (`AGENTS.md` section 9). ES-DE's `es_systems.xml` gives the system-to-extension table and the launch commands (MIT). Its find rules only look in the system PATH and in folders beside ES-DE, so they will not find a portable emulator in an arbitrary folder. Finding the emulator is Maida's own scan of the folder the player chose. **[verified on a sample of the RPCS3 rule]**
- A failed launch is reported to the player. It must not be recorded as a successful play.

## 7. Storage safety

**[verified]** Three hazards in `src-tauri/src/commands/steam.rs` today:

1. The background rescan marks non-Steam records uninstalled. A record with no `steamAppId` is stored in the map under its `id` (`:64-72`). The loop that detects uninstalls skips only an empty key (`:98-101`), so the record is compared against the scanned Steam appids, never matches, and gets `installed: false` (`:135-137`). Kamae lists only installed records (`src/views/KamaeView.jsx:60`), so the game disappears after the next snapshot. The comment at `:65` calls these "manual entries" and intends to keep them; the code keeps the record and still flips the flag.
2. `request_onboarding_sync` replaces the whole file with the Steam scan (`:19-35`).
3. The IGDB enrichment task writes back a clone taken before it started (`:185-201`).

Requirement **[proposal]**: every source merges into the file through one write path, and a source that fails to read leaves its games untouched. A read failure is never treated as "uninstalled".

Scans are cached. Summon must not wait on a rescan (constitution Part 3).

## 8. Work list

Order follows the author's ruling: the no-frontend path first.

### W0. Decisions (author)

- Identity decisions 3 and 4 in section 4 (1 and 2 were ruled on 2026-11-12)
- Whether a whole ROM folder counts as "installed" (see section 10)
- Whether the first version is Windows only (see section 10)
- Whether sources are shown on cards (section 2)
- Confirm the two orders (section 5)

### W1. Identity and record shape

- Add `installs` and the stored trace subject. Existing Steam records are read unchanged.
- One write path for `games.json` (section 7).
- Each source decides "installed" only for its own installs. The Steam rescan no longer touches records that have no Steam install (section 7, hazard 1).
- Attach-at-intake rule: when a source reports an install whose normalised title equals an existing game's, the install is attached to that game instead of creating a second record. This must exist before any second source ships, or the same game gets two records, each with its own trace subject, kata membership, and score.
- Done when: an existing user's `games.json` and trace load with no change in behaviour; a test shows a non-Steam record stays installed across a Steam background snapshot; a test shows a failed source leaves its records as they were; the onboarding sync and the enrichment task no longer drop non-Steam records; a test shows a second source reporting a known title adds an install and not a record.

### W2. Launch

- Resolve the launch target in Rust from the record, for the three kinds.
- Launch order stored in `config.json` preferences, following the existing getter and setter pattern (`src-tauri/src/preferences.rs:35-62`).
- Done when: a non-Steam record launches; an id that is not in `games.json` is rejected; the Epic URI test passes on Windows; a failed launch is surfaced.

### W3. Settings section and the Epic reader (Windows)

- New component for the "Game sources" section, mounted from `SettingsPanel.jsx`.
- Epic reader: `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item`. Fields confirmed on the author's machine: `AppName`, `DisplayName`, `InstallLocation`, `LaunchExecutable`, `CatalogNamespace`, `CatalogItemId`, `MainGameAppName`, `bIsApplication`, `AppCategories`. Filter out entries that are not games (DLC, tools).
- Done when: an installed Epic game appears in Kamae and launches; reading is installed-only, with no sign-in and no store API call; all new strings exist in the four locale files (`AGENTS.md` section 10); the section meets red lines 7.9, 7.10, and 7.11 and is reachable by gamepad and keyboard; copy follows red line 7.1.

### W4. Folder source

- The player picks a folder. `tauri-plugin-dialog` is already installed and unused by the app (`src-tauri/Cargo.toml:17`, `src-tauri/src/lib.rs:35`, `src-tauri/capabilities/default.json:10`).
- Scan for systems, games, and emulators. Cache the result.
- Known hard cases, all present in the author's own folder: an archive beside its extracted copy, emulator archives beside games, extensions that fit several systems (`.iso`, `.zip`, `.chd`), an emulator that exists only as an unextracted archive, a game with no emulator present.
- Maida does not extract, move, or delete the player's files.
- Anything the scan cannot identify is listed in the settings section for the player to resolve or ignore. It is never raised outside settings (red line four).
- Done when: the author's folder scans to a correct list; moving a game's folder keeps its id; a game with no emulator is listed and is not launchable, with a plain reason.
- Open problem: a native folder dialog may not be usable with a gamepad in Steam Deck gaming mode. Not tested.

### W5. Grouping the same game

- Automatic grouping at intake is already in W1. This item adds the read order (which install's title and art are shown) and the player's corrections.
- Manual split and join, placed wherever W0 decides, with the trace behaviour from section 4, decision 4.
- Done when: one game installed from two stores appears once and launches by the launch order; a split survives a rescan.

### Later

- GOG reader. The author's machine has no GOG game installed, so it cannot be tested there yet.
- Art for games with no Steam id. Until then they show the existing empty-slot marker.
- Hide for non-Steam games (the exclusion list is keyed on appid).
- Playnite. It has no official list interface, so reading it by a supported route means shipping a Playnite extension. Its library files are LiteDB, and its developer discourages reading them directly. **[unverified]**
- ES-DE reader, Steam non-Steam shortcuts, Xbox, Battle.net, Ubisoft, Heroic on Steam Deck.
- Controller support for non-Steam games through Steam (idea from the author, 2026-11-12). Steam Input and the Steam overlay apply to games started through Steam, and in Steam Deck gaming mode that is close to the only way a non-Steam game gets good controller support. Two routes, to be tried in this order:
  1. **Start Maida itself from Steam.** The player adds Maida to Steam once, and games started by Maida inherit that entry's controller configuration. Nothing is written to Steam's data. ES-DE and Heroic work this way on Steam Deck **[unverified]**. Limits: every game shares one controller configuration, and whether this is reliable on Windows desktop is not known. Test this first.
  2. **Write Steam shortcuts.** Only if per-game controller configuration turns out to be needed. **[proposal]** One switch in the "Game sources" settings section, off by default, never a per-game question (constitution Part 4). Known costs:
     - It writes into another program's data, which Maida does not do today. It must be opt-in, and turning it off must remove what Maida added.
     - Steam appears to read `shortcuts.vdf` at start and write it back on exit, so a new shortcut needs a Steam restart and a write while Steam is running may be lost **[unverified]**.
     - `shortcuts.vdf` is also a read source (`AGENTS.md` section 9). Shortcuts written by Maida must be marked so the same game is not read back as a second entry.
     - A shortcut's appid changes when its executable or name changes **[unverified]**, so it is a launch path only and never a trace subject (section 4).
  - Neither route replaces W1 to W4. A shortcut needs an executable and arguments, so Maida still has to find the game and know how to start it. This is one more launch kind after W2.

## 9. Out of scope

- Signing in to any store, calling a store API, or reading games that are owned and not installed. That ledger belongs to Neri.
- Downloading, extracting, or managing emulators or ROMs.
- Any change to the layout of Maai, Rin, or Kamae.
- Any change to red lines 7.1 to 7.12.

## 10. Open rulings, with draft defaults

| Question | Draft default | Why it matters |
|---|---|---|
| Does a whole ROM folder count as installed? | Yes for a hand-kept folder. A collection of thousands is closer to an ownership ledger and needs its own ruling. | Constitution Part 1, rule 2: being in the full collection does not put a game in the attention field. |
| Windows only for the first version? | Yes. | The Epic and GOG read paths are Windows-specific, and the author can test only there. Maida is Steam Deck-first, so this is a real trade. |

## 11. Pending rule text

The following clauses were drafted for `AGENTS.md` section 9 and are **not** approved. They are recorded here so they are not lost, and they are not in force.

- One game, one entry. The same game installed from more than one source is one game in Maida.
- Two orders, both player-editable in settings: read order and launch order.
- No source prompt at launch.

## 12. Evidence and its limits

- Demand: the author's own library spans Steam, Epic, GOG, and emulators. No external user has asked for this.
- Tested on one Windows machine. Nothing here has been tried on a Steam Deck.
- The Epic manifest fields were confirmed on one installed game.
- The GOG, Playnite, and shortcut details come from research and were not checked against a live install.
