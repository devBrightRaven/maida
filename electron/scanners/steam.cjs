/**
 * Steam Library Scanner
 * Reads locally installed Steam games from ACF manifest files.
 * Output: { games: [...] } or { error: string }
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Environment detection
const isWSL = fs.existsSync('/proc/version') &&
    fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

// Capability: Can we launch games from this environment?
const canLaunchGames = !isWSL;

// Type-based filter: patterns that indicate non-game apps
const NON_GAME_PATTERNS = [
    /redistributable/i,
    /\bruntime\b/i,
    /\bsdk\b/i,
    /\bproton\b/i,
    /\bsteamworks\b/i,
    /\bdedicated server\b/i
];

// Minimal hardcoded exclusions (only for edge cases that slip through pattern filter)
const ALWAYS_EXCLUDE_APPIDS = new Set([
    '228980'  // Steamworks Common Redistributables (most common offender)
]);

function getSteamPath() {
    // 1. Environment override (highest priority - for dev/testing)
    const envOverride = process.env.MAIDA_WINDOWS_STEAM_ROOT;
    if (envOverride) {
        console.log('[Maida] Using MAIDA_WINDOWS_STEAM_ROOT:', envOverride);
        if (fs.existsSync(envOverride)) return envOverride;
        console.warn('[Maida] Override path does not exist:', envOverride);
    }

    const candidates = [
        "C:/Program Files (x86)/Steam",
        "C:/Steam",
        "D:/Steam",
        "E:/Steam"
    ];

    // 2. Evidence-first: Check for Steam installation evidence
    for (let c of candidates) {
        let p = c;
        if (isWSL) {
            // Convert C:/... to /mnt/c/...
            const drive = c.charAt(0).toLowerCase();
            p = `/mnt/${drive}${c.substring(2)}`;
        }

        // Evidence check: steamapps/libraryfolders.vdf exists
        const evidencePath = path.join(p, 'steamapps/libraryfolders.vdf');
        if (fs.existsSync(evidencePath)) {
            console.log('[Maida] Steam evidence found:', p);
            return p;
        }
    }

    // 3. Registry hint (optional, non-blocking)
    // Note: execSync with hardcoded command — no user input, safe from injection
    try {
        const cmd = isWSL ? 'powershell.exe' : 'powershell';
        const result = execSync(`${cmd} -Command "(Get-ItemProperty \\"HKCU:\\Software\\Valve\\Steam\\").SteamPath"`,
            { timeout: 3000 }).toString().trim();
        let p = result.replace(/\\/g, '/');
        if (isWSL && p.match(/^[A-Z]:/i)) {
            const drive = p.charAt(0).toLowerCase();
            p = `/mnt/${drive}${p.substring(2)}`;
        }
        // Verify evidence before trusting registry
        const evidencePath = path.join(p, 'steamapps/libraryfolders.vdf');
        if (fs.existsSync(evidencePath)) {
            console.log('[Maida] Steam evidence found via registry:', p);
            return p;
        }
    } catch (e) {
        // Registry read failed - not fatal in evidence-first approach
        console.log('[Maida] Registry hint unavailable (non-blocking):', e.message);
    }

    console.warn('[Maida] No Steam evidence found in known locations');
    return null;
}

function scanSteamLibrary() {
    const steamPath = getSteamPath();
    if (!steamPath) return { error: "Steam not found" };

    // Path adapter: Convert Windows paths to WSL format if needed
    const adaptPath = (winPath) => {
        if (!isWSL) return winPath;
        // Convert D:\SteamLibrary to /mnt/d/SteamLibrary
        if (winPath.match(/^[A-Z]:/i)) {
            const drive = winPath.charAt(0).toLowerCase();
            return `/mnt/${drive}${winPath.substring(2).replace(/\\/g, '/')}`;
        }
        return winPath.replace(/\\/g, '/');
    };

    const vdfPath = path.join(steamPath, 'steamapps/libraryfolders.vdf');
    if (!fs.existsSync(vdfPath)) return { error: "Library config not found" };

    let vdfContent;
    try {
        vdfContent = fs.readFileSync(vdfPath, 'utf8');
    } catch (e) {
        console.error('[Maida] Failed to read VDF:', e.message);
        return { error: "Cannot read Steam library config" };
    }

    const libraries = new Set();
    libraries.add(steamPath);

    // Parse additional library paths and adapt them
    const matches = vdfContent.matchAll(/"path"\s+"([^"]+)"/g);
    for (const match of matches) {
        const adaptedPath = adaptPath(match[1]);
        libraries.add(adaptedPath);
    }

    const games = [];
    const seenAppIds = new Set();

    libraries.forEach(lib => {
        const appsDir = path.join(lib, 'steamapps');
        if (!fs.existsSync(appsDir)) {
            console.log(`[Maida] Library path not accessible: ${lib}`);
            return;
        }

        const files = fs.readdirSync(appsDir);
        files.forEach(file => {
            if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
                try {
                    const content = fs.readFileSync(path.join(appsDir, file), 'utf8');
                    const nameMatch = content.match(/"name"\s+"([^"]+)"/);
                    const appidMatch = content.match(/"appid"\s+"([^"]+)"/);

                    if (nameMatch && appidMatch) {
                        const appid = appidMatch[1];
                        const name = nameMatch[1];

                        // Dedup first to avoid repeated filter logs across library folders
                        if (seenAppIds.has(appid)) return;
                        seenAppIds.add(appid);

                        // Filter: skip non-games
                        if (ALWAYS_EXCLUDE_APPIDS.has(appid)) {
                            console.log(`[Maida] Filtered by appid: ${appid} "${name}"`);
                            return;
                        }
                        if (NON_GAME_PATTERNS.some(p => p.test(name))) {
                            console.log(`[Maida] Filtered by pattern: ${appid} "${name}"`);
                            return;
                        }

                        const gameData = {
                            id: nameMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            title: nameMatch[1],
                            installed: true,
                            steamAppId: appid,
                            importedAt: new Date().toISOString()
                        };

                        // Capability adapter: only emit launch URL if we can launch games
                        if (canLaunchGames) {
                            gameData.steamUrl = `steam://rungameid/${appid}`;
                        }

                        games.push(gameData);
                    }
                } catch (err) {
                    console.error(`[Maida] Failed to read ${file}:`, err);
                }
            }
        });
    });

    console.log(`[Maida] Scan complete: ${games.length} games found (canLaunch: ${canLaunchGames})`);
    return { games };
}

module.exports = { getSteamPath, scanSteamLibrary };
