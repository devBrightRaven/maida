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

/// Maida 2.0 focus-expansion dwell-to-play delay. Three allowed values
/// (user ruling 2026-08-31: 1 / 3 / 6, default 3) — a discrete setting,
/// not a continuous range like the frozen guard above. Any other input
/// snaps to the nearest allowed value.
const MAIDA2_PLAY_DELAY_DEFAULT_SECONDS: u32 = 3;

fn clamp_play_delay(seconds: u32) -> u32 {
    if seconds <= 1 {
        1
    } else if seconds <= 4 {
        3
    } else {
        6
    }
}

#[tauri::command]
pub fn get_maida2_play_delay_seconds(app: AppHandle) -> u32 {
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let raw = persistence::read_json(&config_path)
        .and_then(|c| c.get("preferences")?.get("maida2PlayDelaySeconds")?.as_u64())
        .map(|v| v as u32)
        .unwrap_or(MAIDA2_PLAY_DELAY_DEFAULT_SECONDS);
    clamp_play_delay(raw)
}

#[tauri::command]
pub fn set_maida2_play_delay_seconds(app: AppHandle, seconds: u32) -> serde_json::Value {
    let clamped = clamp_play_delay(seconds);
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let mut config = persistence::read_json(&config_path)
        .unwrap_or_else(|| persistence::user_data_default("config"));

    if let Some(p) = config.get_mut("preferences") {
        p["maida2PlayDelaySeconds"] = json!(clamped);
    } else {
        config["preferences"] = json!({ "maida2PlayDelaySeconds": clamped });
    }

    match persistence::write_json(&config_path, &config) {
        Ok(_) => json!({ "success": true, "seconds": clamped }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Maida 2.0 dwell-to-play preview audio (user ruling 2026-08-31: silence
/// clause repealed — default on, at low volume; the frontend applies the
/// actual volume). Boolean, not a discrete/range value like the two
/// preferences above.
const MAIDA2_PREVIEW_AUDIO_DEFAULT: bool = true;

#[tauri::command]
pub fn get_maida2_preview_audio(app: AppHandle) -> bool {
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    persistence::read_json(&config_path)
        .and_then(|c| c.get("preferences")?.get("maida2PreviewAudio")?.as_bool())
        .unwrap_or(MAIDA2_PREVIEW_AUDIO_DEFAULT)
}

#[tauri::command]
pub fn set_maida2_preview_audio(app: AppHandle, enabled: bool) -> serde_json::Value {
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let mut config = persistence::read_json(&config_path)
        .unwrap_or_else(|| persistence::user_data_default("config"));

    if let Some(p) = config.get_mut("preferences") {
        p["maida2PreviewAudio"] = json!(enabled);
    } else {
        config["preferences"] = json!({ "maida2PreviewAudio": enabled });
    }

    match persistence::write_json(&config_path, &config) {
        Ok(_) => json!({ "success": true, "enabled": enabled }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Maida 2.0 card opacity (percent). Cards must always read as translucent
/// (frosted glass), so the floor stops short of fully opaque; the ceiling
/// stops short of fully transparent so text never loses contrast.
const MAIDA2_CARD_OPACITY_MIN: u32 = 40;
const MAIDA2_CARD_OPACITY_MAX: u32 = 100;
const MAIDA2_CARD_OPACITY_DEFAULT: u32 = 70;

fn clamp_card_opacity(percent: u32) -> u32 {
    percent.clamp(MAIDA2_CARD_OPACITY_MIN, MAIDA2_CARD_OPACITY_MAX)
}

#[tauri::command]
pub fn get_maida2_card_opacity(app: AppHandle) -> u32 {
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let raw = persistence::read_json(&config_path)
        .and_then(|c| c.get("preferences")?.get("maida2CardOpacity")?.as_u64())
        .map(|v| v as u32)
        .unwrap_or(MAIDA2_CARD_OPACITY_DEFAULT);
    clamp_card_opacity(raw)
}

#[tauri::command]
pub fn set_maida2_card_opacity(app: AppHandle, percent: u32) -> serde_json::Value {
    let clamped = clamp_card_opacity(percent);
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let mut config = persistence::read_json(&config_path)
        .unwrap_or_else(|| persistence::user_data_default("config"));

    if let Some(p) = config.get_mut("preferences") {
        p["maida2CardOpacity"] = json!(clamped);
    } else {
        config["preferences"] = json!({ "maida2CardOpacity": clamped });
    }

    match persistence::write_json(&config_path, &config) {
        Ok(_) => json!({ "success": true, "percent": clamped }),
        Err(e) => json!({ "success": false, "error": e }),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clamp_play_delay_snaps_to_nearer_allowed_value() {
        assert_eq!(clamp_play_delay(0), 1);
        assert_eq!(clamp_play_delay(1), 1);
        assert_eq!(clamp_play_delay(3), 3);
        assert_eq!(clamp_play_delay(4), 3);
        assert_eq!(clamp_play_delay(6), 6);
        assert_eq!(clamp_play_delay(30), 6);
    }

    #[test]
    fn test_clamp_guard_range() {
        assert_eq!(clamp_guard(0), FROZEN_GUARD_MIN_SECONDS);
        assert_eq!(clamp_guard(999), FROZEN_GUARD_MAX_SECONDS);
        assert_eq!(clamp_guard(15), 15);
    }

    #[test]
    fn test_clamp_card_opacity_range() {
        assert_eq!(clamp_card_opacity(0), MAIDA2_CARD_OPACITY_MIN);
        assert_eq!(clamp_card_opacity(999), MAIDA2_CARD_OPACITY_MAX);
        assert_eq!(clamp_card_opacity(70), 70);
        assert_eq!(clamp_card_opacity(40), 40);
        assert_eq!(clamp_card_opacity(100), 100);
    }
}
