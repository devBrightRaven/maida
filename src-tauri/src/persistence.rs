use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Resolve the app data directory (equivalent to Electron's app.getPath('userData')).
pub fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
}

/// Ensure the app data directory exists.
pub fn ensure_dir(dir: &Path) {
    if !dir.exists() {
        fs::create_dir_all(dir).expect("failed to create app data dir");
    }
}

/// Read a JSON file, returning None if it doesn't exist or is invalid.
pub fn read_json(path: &Path) -> Option<Value> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Atomic write: write to temp file, then rename.
pub fn write_json(path: &Path, data: &Value) -> Result<(), String> {
    let dir = path.parent().ok_or("invalid path")?;
    ensure_dir(dir);

    let tmp = path.with_extension("tmp");
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;

    let mut file = fs::File::create(&tmp).map_err(|e| format!("create tmp: {}", e))?;
    file.write_all(json.as_bytes())
        .map_err(|e| format!("write tmp: {}", e))?;
    file.sync_all().map_err(|e| format!("sync tmp: {}", e))?;
    drop(file);

    fs::rename(&tmp, path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

/// Data file path for a given type.
pub fn data_path(base: &Path, data_type: &str) -> PathBuf {
    match data_type {
        "games" => base.join("games.json"),
        "prescriptions" => base.join("prescriptions.json"),
        "anchor" => base.join("anchor.json"),
        "returnPenalties" => base.join("returnPenalties.json"),
        "constraints" => base.join("constraints.json"),
        "showcase" => base.join("showcase.json"),
        "config" => base.join("config.json"),
        _ => base.join(format!("{}.json", data_type)),
    }
}

/// Default values for user data types (anchor, returnPenalties).
/// These return defaults immediately, never fetch from app resources.
pub fn user_data_default(data_type: &str) -> Value {
    match data_type {
        "anchor" => serde_json::json!(null),
        "returnPenalties" => serde_json::json!([]),
        "constraints" => serde_json::json!({}),
        "showcase" => serde_json::json!({
            "games": [],
            "box": [],
            "katas": [],
            "activeKataId": null,
            "exploreHistory": {
                "lastSessionDate": null,
                "cardsShownToday": 0
            }
        }),
        "config" => serde_json::json!({
            "license": null,
            "telemetry": {
                "enabled": true
            }
        }),
        _ => serde_json::json!(null),
    }
}

/// Check if a data type uses user defaults (as opposed to app data with fallback chain).
pub fn is_user_data(data_type: &str) -> bool {
    matches!(
        data_type,
        "anchor" | "returnPenalties" | "constraints" | "showcase" | "config"
    )
}

/// Session log path.
pub fn session_log_path(base: &Path) -> PathBuf {
    base.join("session-log.jsonl")
}

/// Migrate data from Electron's app data directory on first Tauri launch.
/// Copies .json and .jsonl files. Does NOT copy igdb-credentials.enc (incompatible format).
/// Writes a migrated.flag file to prevent re-migration.
pub fn migrate_from_electron(tauri_dir: &Path) {
    let flag = tauri_dir.join("migrated.flag");
    if flag.exists() {
        return;
    }

    // Electron stored data in %APPDATA%/maida-prototype/
    let electron_dir = if let Some(appdata) = std::env::var_os("APPDATA") {
        PathBuf::from(appdata).join("maida-prototype")
    } else if let Some(home) = std::env::var_os("HOME") {
        // Linux: check ~/.config/maida-prototype
        PathBuf::from(home).join(".config").join("maida-prototype")
    } else {
        return;
    };

    if !electron_dir.exists() {
        // No Electron data to migrate — write flag and return
        let _ = fs::write(&flag, "no-electron-data");
        return;
    }

    ensure_dir(tauri_dir);

    let files_to_copy = [
        "games.json",
        "prescriptions.json",
        "anchor.json",
        "returnPenalties.json",
        "constraints.json",
        "showcase.json",
        "session-log.jsonl",
    ];

    let mut copied = 0;
    for filename in &files_to_copy {
        let src = electron_dir.join(filename);
        let dst = tauri_dir.join(filename);
        if src.exists() && !dst.exists() {
            match fs::copy(&src, &dst) {
                Ok(_) => {
                    log::info!("[Migration] Copied {}", filename);
                    copied += 1;
                }
                Err(e) => {
                    log::warn!("[Migration] Failed to copy {}: {}", filename, e);
                }
            }
        }
    }

    log::info!(
        "[Migration] Complete. {} files copied from {:?}",
        copied,
        electron_dir
    );

    // Write flag to prevent re-migration
    let _ = fs::write(&flag, format!("migrated-{}-files", copied));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_write_and_read_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.json");
        let data = serde_json::json!({"score": 42, "name": "test"});

        write_json(&path, &data).unwrap();
        let loaded = read_json(&path).unwrap();
        assert_eq!(loaded["score"], 42);
        assert_eq!(loaded["name"], "test");
    }

    #[test]
    fn test_read_nonexistent_returns_none() {
        let path = Path::new("/nonexistent/file.json");
        assert!(read_json(path).is_none());
    }

    #[test]
    fn test_atomic_write_no_partial() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("atomic.json");
        let data = serde_json::json!({"key": "value"});

        write_json(&path, &data).unwrap();

        // tmp file should not exist after successful write
        let tmp = path.with_extension("tmp");
        assert!(!tmp.exists());
        assert!(path.exists());
    }

    #[test]
    fn test_data_path_mapping() {
        let base = Path::new("/data");
        assert_eq!(data_path(base, "games"), PathBuf::from("/data/games.json"));
        assert_eq!(
            data_path(base, "showcase"),
            PathBuf::from("/data/showcase.json")
        );
        assert_eq!(
            data_path(base, "config"),
            PathBuf::from("/data/config.json")
        );
    }

    #[test]
    fn test_user_data_defaults() {
        let showcase = user_data_default("showcase");
        assert_eq!(showcase["games"], serde_json::json!([]));
        assert_eq!(showcase["katas"], serde_json::json!([]));
        assert!(showcase["activeKataId"].is_null());

        let config = user_data_default("config");
        assert!(config["license"].is_null());
    }

    #[test]
    fn test_is_user_data() {
        assert!(is_user_data("anchor"));
        assert!(is_user_data("showcase"));
        assert!(is_user_data("config"));
        assert!(!is_user_data("games"));
        assert!(!is_user_data("prescriptions"));
    }
}
