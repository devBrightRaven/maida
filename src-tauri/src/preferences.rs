use crate::persistence;
use serde_json::json;
use tauri::AppHandle;

/// Allowed range for the frozen guard cool-down (seconds).
/// 5s is a floor below which the cool-down stops being a meaningful pause.
/// 30s is the ceiling we support in i18n number tables and UI copy.
const FROZEN_GUARD_MIN_SECONDS: u32 = 5;
const FROZEN_GUARD_MAX_SECONDS: u32 = 30;
const FROZEN_GUARD_DEFAULT_SECONDS: u32 = 15;

fn clamp_guard(seconds: u32) -> u32 {
    seconds.clamp(FROZEN_GUARD_MIN_SECONDS, FROZEN_GUARD_MAX_SECONDS)
}

#[tauri::command]
pub fn get_frozen_guard_duration(app: AppHandle) -> u32 {
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let raw = persistence::read_json(&config_path)
        .and_then(|c| c.get("preferences")?.get("frozenGuardSeconds")?.as_u64())
        .map(|v| v as u32)
        .unwrap_or(FROZEN_GUARD_DEFAULT_SECONDS);
    clamp_guard(raw)
}

#[tauri::command]
pub fn set_frozen_guard_duration(app: AppHandle, seconds: u32) -> serde_json::Value {
    let clamped = clamp_guard(seconds);
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let mut config = persistence::read_json(&config_path)
        .unwrap_or_else(|| persistence::user_data_default("config"));

    if let Some(p) = config.get_mut("preferences") {
        p["frozenGuardSeconds"] = json!(clamped);
    } else {
        config["preferences"] = json!({ "frozenGuardSeconds": clamped });
    }

    match persistence::write_json(&config_path, &config) {
        Ok(_) => json!({ "success": true, "seconds": clamped }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}
