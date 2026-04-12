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
}
