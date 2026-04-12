use regex::Regex;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::persistence;

const KEY_PATTERN: &str = r"^MAIDA-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$";

fn validate_format(key: &str) -> bool {
    let re = Regex::new(KEY_PATTERN).unwrap();
    re.is_match(&key.trim().to_uppercase())
}

#[tauri::command]
pub fn save_license_key(app: AppHandle, key: String) -> Value {
    let normalized = key.trim().to_uppercase();
    if !validate_format(&normalized) {
        return json!({ "success": false, "error": "Invalid key format" });
    }

    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "config");

    let mut config =
        persistence::read_json(&path).unwrap_or_else(|| persistence::user_data_default("config"));

    config["license"] = json!(normalized);

    match persistence::write_json(&path, &config) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

#[tauri::command]
pub fn load_license_key(app: AppHandle) -> Value {
    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "config");

    let config =
        persistence::read_json(&path).unwrap_or_else(|| persistence::user_data_default("config"));

    match config.get("license").and_then(|v| v.as_str()) {
        Some(key) => json!(key),
        None => Value::Null,
    }
}

#[tauri::command]
pub fn check_license(app: AppHandle) -> Value {
    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "config");

    let config =
        persistence::read_json(&path).unwrap_or_else(|| persistence::user_data_default("config"));

    let licensed = config
        .get("license")
        .and_then(|v| v.as_str())
        .map(validate_format)
        .unwrap_or(false);

    json!({ "licensed": licensed })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_key() {
        assert!(validate_format("MAIDA-ABCDE-12345-FGHIJ"));
    }

    #[test]
    fn test_lowercase_normalized() {
        assert!(validate_format("maida-abcde-12345-fghij"));
    }

    #[test]
    fn test_with_whitespace() {
        assert!(validate_format("  MAIDA-ABCDE-12345-FGHIJ  "));
    }

    #[test]
    fn test_invalid_prefix() {
        assert!(!validate_format("WRONG-ABCDE-12345-FGHIJ"));
    }

    #[test]
    fn test_too_short() {
        assert!(!validate_format("MAIDA-ABC"));
    }

    #[test]
    fn test_empty() {
        assert!(!validate_format(""));
    }
}
