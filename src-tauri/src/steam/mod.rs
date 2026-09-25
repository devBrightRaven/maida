pub mod appinfo;
pub mod vdf;

use chrono::Utc;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

const NON_GAME_PATTERNS: &[&str] = &[
    r"(?i)redistributable",
    r"(?i)\bruntime\b",
    r"(?i)\bsdk\b",
    r"(?i)\bproton\b",
    r"(?i)\bsteamworks\b",
    r"(?i)\bdedicated server\b",
];

const ALWAYS_EXCLUDE_APPIDS: &[&str] = &["228980"];

/// R1 fix: shared bound with `src/core/lastPlayed.js`'s `MAX_EPOCH_SECONDS`.
/// 253402300799 = 9999-12-31T23:59:59Z, the conventional "last representable
/// 4-digit-year" bound. A positive value past this bound (e.g. i64::MAX =
/// 9223372036854775807) parses fine as an `i64` but is not a usable epoch:
/// `new Date(n*1000)` on the JS side renders "Invalid Date", so it must not
/// be treated as a recorded timestamp.
const MAX_EPOCH_SECONDS: i64 = 253402300799;

/// LastPlayed data contract (P0-1): compute (steamLastPlayed, status) from
/// raw ACF content. status is one of "recorded" | "zero" | "missing" |
/// "invalid" — never collapsed into a single 0/absent signal, so a caller
/// can distinguish "Steam recorded no play" from "we don't know".
fn compute_last_played(content: &str) -> (i64, &'static str) {
    match vdf::extract_field(content, "LastPlayed") {
        None => (0, "missing"),
        Some(raw) => match raw.parse::<i64>() {
            Ok(n) if n > 0 && n <= MAX_EPOCH_SECONDS => (n, "recorded"),
            Ok(0) => (0, "zero"),
            Ok(_) => (0, "invalid"), // negative, or positive but out of range
            Err(_) => (0, "invalid"),
        },
    }
}

/// Detect Steam installation path (cross-platform).
pub fn get_steam_path() -> Option<PathBuf> {
    // 1. Environment override
    if let Ok(override_path) = std::env::var("MAIDA_WINDOWS_STEAM_ROOT") {
        let p = PathBuf::from(&override_path);
        if p.join("steamapps/libraryfolders.vdf").exists() {
            log::info!("[Steam] Using MAIDA_WINDOWS_STEAM_ROOT: {}", override_path);
            return Some(p);
        }
        log::warn!("[Steam] Override path has no evidence: {}", override_path);
    }

    // 2. Platform-specific candidates
    let candidates = get_platform_candidates();

    for c in &candidates {
        let evidence = c.join("steamapps").join("libraryfolders.vdf");
        if evidence.exists() {
            log::info!("[Steam] Evidence found: {}", c.display());
            return Some(c.clone());
        }
    }

    // 3. Registry (Windows only)
    #[cfg(target_os = "windows")]
    {
        if let Some(p) = get_steam_path_from_registry() {
            let evidence = p.join("steamapps").join("libraryfolders.vdf");
            if evidence.exists() {
                log::info!("[Steam] Evidence found via registry: {}", p.display());
                return Some(p);
            }
        }
    }

    log::warn!("[Steam] No Steam evidence found");
    None
}

fn get_platform_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        vec![
            PathBuf::from("C:/Program Files (x86)/Steam"),
            PathBuf::from("C:/Steam"),
            PathBuf::from("D:/Steam"),
            PathBuf::from("E:/Steam"),
        ]
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        vec![
            PathBuf::from(format!("{}/.steam/steam", home)),
            PathBuf::from(format!("{}/.local/share/Steam", home)),
            // Flatpak Steam
            PathBuf::from(format!(
                "{}/.var/app/com.valvesoftware.Steam/.steam/steam",
                home
            )),
            PathBuf::from(format!(
                "{}/.var/app/com.valvesoftware.Steam/.local/share/Steam",
                home
            )),
        ]
    }

    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        vec![PathBuf::from(format!(
            "{}/Library/Application Support/Steam",
            home
        ))]
    }
}

#[cfg(target_os = "windows")]
fn get_steam_path_from_registry() -> Option<PathBuf> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey("Software\\Valve\\Steam").ok()?;
    let path: String = key.get_value("SteamPath").ok()?;
    Some(PathBuf::from(path.replace('\\', "/")))
}

/// Scan all Steam library folders for installed games.
pub fn scan_steam_library() -> Result<Vec<Value>, String> {
    let steam_path = get_steam_path().ok_or("Steam not found")?;
    let vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");

    let vdf_content = fs::read_to_string(&vdf_path)
        .map_err(|e| format!("Cannot read libraryfolders.vdf: {}", e))?;

    // Collect library paths
    let mut libraries: Vec<PathBuf> = vec![steam_path.clone()];
    let path_re = Regex::new(r#""path"\s+"([^"]+)""#).unwrap();
    for cap in path_re.captures_iter(&vdf_content) {
        let lib_path = PathBuf::from(cap[1].replace('\\', "/"));
        if !libraries.contains(&lib_path) {
            libraries.push(lib_path);
        }
    }

    let non_game_regexes: Vec<Regex> = NON_GAME_PATTERNS
        .iter()
        .map(|p| Regex::new(p).unwrap())
        .collect();
    let exclude_set: HashSet<&str> = ALWAYS_EXCLUDE_APPIDS.iter().copied().collect();

    let mut games: Vec<Value> = Vec::new();
    let mut seen_appids: HashSet<String> = HashSet::new();
    let now = Utc::now().to_rfc3339();

    for lib in &libraries {
        let apps_dir = lib.join("steamapps");
        if !apps_dir.exists() {
            log::info!("[Steam] Library not accessible: {}", lib.display());
            continue;
        }

        let entries = match fs::read_dir(&apps_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let filename = entry.file_name().to_string_lossy().to_string();
            if !filename.starts_with("appmanifest_") || !filename.ends_with(".acf") {
                continue;
            }

            let content = match fs::read_to_string(entry.path()) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let appid = vdf::extract_field(&content, "appid");
            let name = vdf::extract_field(&content, "name");
            // Steam-recorded last-play epoch; missing or unparseable = 0.
            // steam_last_played_status distinguishes WHY it's 0 (see
            // compute_last_played) so callers never fabricate "never played".
            let (steam_last_played, steam_last_played_status) = compute_last_played(&content);

            let (appid, name) = match (appid, name) {
                (Some(a), Some(n)) => (a, n),
                _ => continue,
            };

            // Dedup
            if seen_appids.contains(&appid) {
                continue;
            }
            seen_appids.insert(appid.clone());

            // Filter non-games
            if exclude_set.contains(appid.as_str()) {
                continue;
            }
            if non_game_regexes.iter().any(|r| r.is_match(&name)) {
                continue;
            }

            let id = name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_alphanumeric() { c } else { '-' })
                .collect::<String>();
            // Collapse multiple dashes
            let id = Regex::new(r"-+").unwrap().replace_all(&id, "-").to_string();
            let id = id.trim_matches('-').to_string();

            games.push(json!({
                "id": id,
                "title": name,
                "installed": true,
                "steamAppId": appid,
                "steamUrl": format!("steam://rungameid/{}", appid),
                "steamLastPlayed": steam_last_played,
                "steamLastPlayedStatus": steam_last_played_status,
                "importedAt": now
            }));
        }
    }

    log::info!("[Steam] Scan complete: {} games found", games.len());
    Ok(games)
}

/// Check if Steam is available on this system.
pub fn is_available() -> bool {
    get_steam_path().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_non_game_filter_patterns() {
        let regexes: Vec<Regex> = NON_GAME_PATTERNS
            .iter()
            .map(|p| Regex::new(p).unwrap())
            .collect();

        assert!(regexes
            .iter()
            .any(|r| r.is_match("Steamworks Common Redistributables")));
        assert!(regexes.iter().any(|r| r.is_match("Visual C++ Runtime")));
        assert!(regexes.iter().any(|r| r.is_match("Proton 8.0")));
        assert!(regexes
            .iter()
            .any(|r| r.is_match("Counter-Strike Dedicated Server")));
        assert!(!regexes.iter().any(|r| r.is_match("Elden Ring")));
        assert!(!regexes.iter().any(|r| r.is_match("Stardew Valley")));
    }

    #[test]
    fn test_exclude_appids() {
        let set: HashSet<&str> = ALWAYS_EXCLUDE_APPIDS.iter().copied().collect();
        assert!(set.contains("228980"));
        assert!(!set.contains("730"));
    }

    // LastPlayed data contract (P0-1) — four statuses at scan level.
    #[test]
    fn test_compute_last_played_recorded() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"1724800000\"";
        assert_eq!(compute_last_played(acf), (1724800000, "recorded"));
    }

    #[test]
    fn test_compute_last_played_zero() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"0\"";
        assert_eq!(compute_last_played(acf), (0, "zero"));
    }

    #[test]
    fn test_compute_last_played_missing() {
        let acf = "\"appid\"\t\"570\"";
        assert_eq!(compute_last_played(acf), (0, "missing"));
    }

    #[test]
    fn test_compute_last_played_invalid_non_numeric() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"not-a-number\"";
        assert_eq!(compute_last_played(acf), (0, "invalid"));
    }

    #[test]
    fn test_compute_last_played_invalid_negative() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"-5\"";
        assert_eq!(compute_last_played(acf), (0, "invalid"));
    }

    // R1: a positive but unusable value (out of the sane epoch range) must
    // not be treated as a recorded timestamp.
    #[test]
    fn test_compute_last_played_invalid_i64_max() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"9223372036854775807\"";
        assert_eq!(compute_last_played(acf), (0, "invalid"));
    }

    #[test]
    fn test_compute_last_played_invalid_bound_plus_one() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"253402300800\"";
        assert_eq!(compute_last_played(acf), (0, "invalid"));
    }

    #[test]
    fn test_compute_last_played_recorded_at_bound() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"253402300799\"";
        assert_eq!(compute_last_played(acf), (253402300799, "recorded"));
    }

    #[test]
    fn test_compute_last_played_recorded_minimum() {
        let acf = "\"appid\"\t\"570\"\n\"LastPlayed\"\t\"1\"";
        assert_eq!(compute_last_played(acf), (1, "recorded"));
    }
}
