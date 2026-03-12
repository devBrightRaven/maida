const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getSteamPath, scanSteamLibrary } = require('./scanners/steam.cjs');
const { fetchHltb } = require('./services/hltb.cjs');

// ---------------------------------------------------------
// Update Checker (GitHub Releases - Manual Download)
// 可替換：這段邏輯是獨立的，未來可以換成其他更新機制
// ---------------------------------------------------------
const UPDATE_CONFIG = {
    owner: 'bright-raven',
    repo: 'maida',
};

// Update check cache (in-memory, 24h TTL)
let updateCache = { result: null, checkedAt: 0 };
const UPDATE_CACHE_TTL = 24 * 60 * 60 * 1000;

async function checkForUpdates() {
    if (!app.isPackaged) return null; // 開發模式不檢查

    try {
        const https = require('https');
        const currentVersion = app.getVersion();

        const url = `https://api.github.com/repos/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repo}/releases/latest`;

        const data = await new Promise((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'Maida-App' } }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(body));
                    } else {
                        reject(new Error(`GitHub API returned ${res.statusCode}`));
                    }
                });
            }).on('error', reject);
        });

        const latestVersion = data.tag_name?.replace(/^v/, '') || '';
        const hasUpdate = latestVersion && compareVersions(latestVersion, currentVersion) > 0;

        console.log(`[Maida] Update check: current=${currentVersion}, latest=${latestVersion}, hasUpdate=${hasUpdate}`);

        return hasUpdate ? {
            currentVersion,
            latestVersion,
            releaseUrl: data.html_url,
            releaseNotes: data.body?.substring(0, 500) || '',
        } : null;
    } catch (err) {
        console.log('[Maida] Update check failed (non-blocking):', err.message);
        return null;
    }
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

let mainWindow;

// Prevent multiple instances to avoid data corruption
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    // Icon path - works in both dev and production
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.ico')
        : path.join(__dirname, '../build/icon.ico');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true,
        backgroundColor: '#050505'
    });

    // Handle external links (e.g. steam://) properly
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        // mainWindow.webContents.openDevTools();
    } else {

        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        app.quit(); // Ensure concurrently sees the exit
    });
}


// Persistence Management
const userDataPath = app.getPath('userData');
const GAMES_PATH = path.join(userDataPath, 'games.json');
const PRESCRIPTIONS_PATH = path.join(userDataPath, 'prescriptions.json');
const ANCHOR_PATH = path.join(userDataPath, 'anchor.json');
const RETURN_PENALTIES_PATH = path.join(userDataPath, 'returnPenalties.json');
const CONSTRAINTS_PATH = path.join(userDataPath, 'constraints.json');
const SHOWCASE_PATH = path.join(userDataPath, 'showcase.json');

// Template paths: In production, extraResources are at process.resourcesPath/data/
// In development, they're at ../src/data/
const isPackaged = app.isPackaged;
const SEED_GAMES = isPackaged
    ? path.join(process.resourcesPath, 'data', 'games.json')
    : path.join(__dirname, '../src/data/games.json');
const SEED_PRESCRIPTIONS = isPackaged
    ? path.join(process.resourcesPath, 'data', 'prescriptions.json')
    : path.join(__dirname, '../src/data/prescriptions.json');

const SCHEMA_VERSION = '0.2.2';

function ensureDataFile(filePath, type) {
    // 1. Force Sync for Prescriptions (Template -> UserData)
    // This ensures updates to the static source file always propagate to the user.
    if (type === 'prescriptions' && fs.existsSync(SEED_PRESCRIPTIONS)) {
        try {
            fs.copyFileSync(SEED_PRESCRIPTIONS, filePath);
            console.log('[Main] Synced prescriptions from template.');
        } catch (err) {
            console.error('[Main] Failed to sync prescriptions:', err);
        }
        return;
    }

    // 2. Initialize Games if missing
    if (!fs.existsSync(filePath)) {
        const defaultData = type === 'games'
            ? { schemaVersion: SCHEMA_VERSION, source: 'uninitialized', games: [] }
            : { prescriptions: { default: [], catalog: {} } }; // Fallback only if template missing
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 4));
    }
}


function writeFileAtomic(filePath, data) {
    const tmpPath = filePath + '.tmp';
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 4));
        fs.renameSync(tmpPath, filePath);
        return { success: true };
    } catch (e) {
        console.error('[Maida] Write failed:', e.message);
        // Cleanup orphaned temp file
        try { fs.unlinkSync(tmpPath); } catch {}
        return { success: false, error: e.message };
    }
}


/**
 * For each installed game missing hltb data, fetch from HLTB and update games.json.
 * Runs after background snapshot, non-blocking.
 * Rate-limited: 1 request per 500ms to avoid hammering the scraper.
 */
async function enrichHltbData(gamesPath, games) {
    const missing = games.filter(g => g.installed && g.hltb === undefined);
    if (missing.length === 0) return;

    console.log(`[HLTB] Enriching ${missing.length} games...`);

    for (const game of missing) {
        await new Promise(r => setTimeout(r, 500));

        const result = await fetchHltb(game.title);

        try {
            const current = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
            current.games = current.games.map(g =>
                g.steamAppId === game.steamAppId
                    ? { ...g, hltb: result }
                    : g
            );
            writeFileAtomic(gamesPath, current);
        } catch (e) {
            console.warn(`[HLTB] Write failed for ${game.title}:`, e.message);
        }
    }

    console.log('[HLTB] Enrichment complete.');
}


// ---------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------

ipcMain.handle('get-data', (event, type) => {
    let filePath;
    if (type === 'games') filePath = GAMES_PATH;
    else if (type === 'prescriptions') filePath = PRESCRIPTIONS_PATH;
    else if (type === 'anchor') filePath = ANCHOR_PATH; // NEW
    else if (type === 'returnPenalties') filePath = RETURN_PENALTIES_PATH;
    else if (type === 'constraints') filePath = CONSTRAINTS_PATH;
    else return null;

    // ensureDataFile(filePath, type); // Skip ensure for anchor, it can be missing
    if (!fs.existsSync(filePath)) return null;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        let data = JSON.parse(content);

        // Daily Decay for games
        if (type === 'games' && data.games) {
            const now = new Date();
            const lastDecay = data.lastDecayAt ? new Date(data.lastDecayAt) : null;

            // If it's a new day, apply decay
            if (!lastDecay || now.toDateString() !== lastDecay.toDateString()) {
                // 20% daily decay (×0.8) — aligns with spec §5 and Debug Panel default.
                // Applies to both positive and negative scores (entropy, not intervention).
                // Recovery: score -2.0 → meaningful probability (~-0.5) in ~7 days.
                // Fixed from: Math.max(0, score * 0.9) which had two bugs:
                //   1. Math.max(0) clamped negatives to 0 overnight (spec: gradual decay)
                //   2. 0.9 (10%) didn't match spec/Debug default of 0.8 (20%)
                // See: docs/05-qa/2026-02-09_OPEN_daily-decay-negative-score-clamping.md
                console.log('[Maida] New day detected, applying score decay...');
                data.games = data.games.map(game => ({
                    ...game,
                    score: (game.score || 0) * 0.8
                }));
                data.lastDecayAt = now.toISOString();
                writeFileAtomic(GAMES_PATH, data);
            }
        }
        return data;
    } catch (e) {
        return null;
    }
});

ipcMain.handle('save-data', (event, type, data) => {
    let filePath;
    if (type === 'games') filePath = GAMES_PATH;
    else if (type === 'prescriptions') filePath = PRESCRIPTIONS_PATH;
    else if (type === 'anchor') filePath = ANCHOR_PATH;
    else if (type === 'returnPenalties') filePath = RETURN_PENALTIES_PATH;
    else if (type === 'constraints') filePath = CONSTRAINTS_PATH;
    else return { success: false, error: 'Unknown type' };

    return writeFileAtomic(filePath, data);
});

ipcMain.handle('check-steam-available', () => {
    const steamPath = getSteamPath();
    return { available: !!steamPath };
});

ipcMain.handle('reset-games-data', () => {
    try {
        if (fs.existsSync(GAMES_PATH)) {
            const resetData = { schemaVersion: SCHEMA_VERSION, source: 'uninitialized', games: [] };
            writeFileAtomic(GAMES_PATH, resetData);

            // Also clear returnPenalties and anchor state
            if (fs.existsSync(RETURN_PENALTIES_PATH)) {
                fs.unlinkSync(RETURN_PENALTIES_PATH);
                console.log('[Maida] Return penalties cleared.');
            }
            if (fs.existsSync(ANCHOR_PATH)) {
                fs.unlinkSync(ANCHOR_PATH);
                console.log('[Maida] Anchor state cleared.');
            }

            console.log('[Maida] Games data reset via Debug command.');
            return { success: true };
        }
        return { success: false, reason: 'file_not_found' };
    } catch (e) {
        console.error('[Maida] Failed to reset games:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('request-onboarding-sync', async () => {
    console.log('[Maida] User requested onboarding sync...');
    const scanResult = scanSteamLibrary();
    if (scanResult.error) return scanResult;

    const data = {
        schemaVersion: SCHEMA_VERSION,
        source: 'steam-onboarding',
        lastSuccessfulSyncAt: new Date().toISOString(),
        libraryProvider: 'steam',
        games: scanResult.games
    };

    writeFileAtomic(GAMES_PATH, data);
    return { success: true, count: scanResult.games.length };
});

ipcMain.handle('perform-background-snapshot', async () => {
    // Always scan on startup — no cooldown.
    // Steam scan reads local ACF files and is fast.
    // See: docs/05-qa/2026-02-09_OPEN_background-sync-stale-data.md
    console.log('[Maida] Running background snapshot (Healing Merge)...');
    const scanResult = scanSteamLibrary();
    if (scanResult.error) return { success: false, error: scanResult.error };

    // 2. Load current data
    let currentData = { games: [] };
    try {
        if (fs.existsSync(GAMES_PATH)) {
            currentData = JSON.parse(fs.readFileSync(GAMES_PATH, 'utf8'));
        }
    } catch (e) { }

    const scannedGames = scanResult.games;
    const existingGamesRaw = currentData.games || [];

    // Layer 2: Deterministic Healing Dedup (Existing Data)
    const existingMap = new Map();
    existingGamesRaw.forEach(g => {
        const prev = existingMap.get(g.steamAppId);
        if (!prev) {
            existingMap.set(g.steamAppId, g);
            return;
        }
        // Conflict resolution: Keep the one with behavioral "weight"
        const prevActivity = Math.abs(prev.score || 0) + (prev.lastPlayed && prev.lastPlayed !== 'Never' ? 1 : 0);
        const currActivity = Math.abs(g.score || 0) + (g.lastPlayed && g.lastPlayed !== 'Never' ? 1 : 0);
        if (currActivity > prevActivity) {
            existingMap.set(g.steamAppId, g);
        }
    });

    // Layer 2: Behavioral Merge with Scanned results
    const scannedIds = new Set(scannedGames.map(g => g.steamAppId));

    // A) Process existing games
    existingMap.forEach((g, steamAppId) => {
        const isCurrentlyInstalled = scannedIds.has(steamAppId);
        if (isCurrentlyInstalled && !g.installed) {
            // RE-INSTALLED!
            g.installed = true;
            g.reinstalledAt = new Date().toISOString();
            g.buffer = { type: 'visibility', remaining: 3 };
            console.log(`[Maida] Re-install detected: ${g.title}`);
        } else if (!isCurrentlyInstalled && g.installed) {
            // UNINSTALLED (Soft Delete)
            g.installed = false;
            console.log(`[Maida] Uninstall detected: ${g.title}`);
        }
    });

    // B) Add brand new games
    scannedGames.forEach(g => {
        if (!existingMap.has(g.steamAppId)) {
            existingMap.set(g.steamAppId, {
                ...g,
                score: 0.00
            });
            console.log(`[Maida] New game discovered: ${g.title}`);
        }
    });

    const finalGamesArray = Array.from(existingMap.values());

    // Layer 3: Persistence Invariant Check
    const finalSet = new Set();
    const cleanGames = finalGamesArray.filter(g => {
        if (!g.steamAppId) return true; // Keep manual entries
        if (finalSet.has(g.steamAppId)) return false;
        finalSet.add(g.steamAppId);
        return true;
    });

    // 3. Atomic Write
    const nextData = {
        ...currentData,
        schemaVersion: SCHEMA_VERSION,
        source: 'steam-background',
        lastSuccessfulSyncAt: new Date().toISOString(),
        libraryProvider: 'steam',
        games: cleanGames
    };

    writeFileAtomic(GAMES_PATH, nextData);

    // Fire-and-forget: enrich games missing HLTB data (non-blocking)
    enrichHltbData(GAMES_PATH, cleanGames).catch(e =>
        console.warn('[HLTB] Enrichment error:', e.message)
    );

    return { success: true, count: cleanGames.length };
});



ipcMain.handle('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
    return { success: true };
});

ipcMain.handle('close-window', () => {
    if (mainWindow) mainWindow.close();
    return { success: true };
});

// Update IPC Handlers
ipcMain.handle('check-for-updates', async (event, options = {}) => {
    const force = options?.force === true;
    if (!force && updateCache.result && (Date.now() - updateCache.checkedAt < UPDATE_CACHE_TTL)) {
        return updateCache.result;
    }
    const result = await checkForUpdates();
    updateCache = { result, checkedAt: Date.now() };
    return result;
});

ipcMain.handle('open-release-page', (event, url) => {
    if (url) shell.openExternal(url);
    return { success: true };
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// ---------------------------------------------------------
// Showcase & Warehouse IPC
// ---------------------------------------------------------

ipcMain.handle('get-showcase', () => {
    if (!fs.existsSync(SHOWCASE_PATH)) return { games: [], box: [], exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    try {
        return JSON.parse(fs.readFileSync(SHOWCASE_PATH, 'utf8'));
    } catch (e) {
        return { games: [], box: [], exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    }
});

ipcMain.handle('save-showcase', (event, data) => {
    return writeFileAtomic(SHOWCASE_PATH, data);
});

ipcMain.handle('search-warehouse', (event, query) => {
    if (!query || !query.trim()) return [];
    try {
        const data = JSON.parse(fs.readFileSync(GAMES_PATH, 'utf8'));
        const games = data.games || [];
        const lower = query.trim().toLowerCase();
        return games
            .filter(g => g.title && g.title.toLowerCase().includes(lower))
            .slice(0, 20);
    } catch (e) {
        return [];
    }
});

ipcMain.handle('sample-warehouse', (event, excludeIds) => {
    try {
        const data = JSON.parse(fs.readFileSync(GAMES_PATH, 'utf8'));
        const games = data.games || [];
        const excludeSet = new Set(excludeIds || []);
        const candidates = games.filter(g => !excludeSet.has(g.steamAppId) && !excludeSet.has(g.id));
        if (candidates.length === 0) return null;
        const idx = Math.floor(Math.random() * candidates.length);
        return candidates[idx];
    } catch (e) {
        return null;
    }
});

// ---------------------------------------------------------
// Session Log (User Testing Data Collection)
// ---------------------------------------------------------
const SESSION_LOG_PATH = path.join(userDataPath, 'session-log.jsonl');
const SESSION_LOG_MAX_AGE_DAYS = 30;

function pruneSessionLog() {
    if (!fs.existsSync(SESSION_LOG_PATH)) return;
    try {
        const cutoff = Date.now() - SESSION_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        const lines = fs.readFileSync(SESSION_LOG_PATH, 'utf8').split('\n').filter(Boolean);
        const kept = lines.filter(line => {
            try {
                const entry = JSON.parse(line);
                return new Date(entry.ts).getTime() > cutoff;
            } catch { return false; }
        });
        fs.writeFileSync(SESSION_LOG_PATH, kept.join('\n') + (kept.length ? '\n' : ''));
        console.log(`[Maida] Session log pruned: ${lines.length} -> ${kept.length} entries`);
    } catch (e) {
        console.error('[Maida] Session log prune failed:', e.message);
    }
}

ipcMain.handle('append-session-log', (event, entry) => {
    try {
        const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
        fs.appendFileSync(SESSION_LOG_PATH, line);
        return { success: true };
    } catch (e) {
        console.error('[Maida] Session log append failed:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('export-session-log', async () => {
    if (!fs.existsSync(SESSION_LOG_PATH)) {
        return { success: false, error: 'No session log found' };
    }
    const today = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Session Log',
        defaultPath: `maida-session-log-${today}.jsonl`,
        filters: [{ name: 'JSONL', extensions: ['jsonl'] }],
    });
    if (result.canceled) return { success: false, canceled: true };
    try {
        fs.copyFileSync(SESSION_LOG_PATH, result.filePath);
        return { success: true, path: result.filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

app.on('ready', () => {
    pruneSessionLog();
    ensureDataFile(GAMES_PATH, 'games');
    ensureDataFile(PRESCRIPTIONS_PATH, 'prescriptions');
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
