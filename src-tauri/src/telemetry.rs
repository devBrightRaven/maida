use crate::persistence;
use chrono::Utc;
use serde_json::json;
use std::path::Path;
use tauri::AppHandle;
use uuid::Uuid;

const TELEMETRY_URL: &str = "https://maida-telemetry.brightravenworld.workers.dev/ping";

/// Send anonymous launch ping. Fire-and-forget, never blocks.
pub async fn send_launch_ping(base: &Path) {
    let config_path = persistence::data_path(base, "config");
    let mut config = persistence::read_json(&config_path)
        .unwrap_or_else(|| persistence::user_data_default("config"));

    // Check opt-out
    if config
        .get("telemetry")
        .and_then(|t| t.get("enabled"))
        .and_then(|v| v.as_bool())
        == Some(false)
    {
        return;
    }

    // Get or create anonymous ID
    let anon_id = match config
        .get("telemetry")
        .and_then(|t| t.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id.to_string(),
        None => {
            let id = Uuid::new_v4().to_string();
            let first_launch = Utc::now().to_rfc3339();
            config["telemetry"] = json!({
                "enabled": true,
                "id": id,
                "firstLaunch": first_launch
            });
            let _ = persistence::write_json(&config_path, &config);
            id
        }
    };

    // Calculate days since first launch
    let days = config
        .get("telemetry")
        .and_then(|t| t.get("firstLaunch"))
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|first| (Utc::now() - first.with_timezone(&Utc)).num_days())
        .unwrap_or(0);

    let body = json!({
        "id": anon_id,
        "d": days,
        "v": env!("CARGO_PKG_VERSION")
    });

    let client = reqwest::Client::new();
    let _ = client
        .post(TELEMETRY_URL)
        .json(&body)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await;
}

#[tauri::command]
pub fn get_telemetry_enabled(app: AppHandle) -> bool {
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    persistence::read_json(&config_path)
        .and_then(|c| c.get("telemetry")?.get("enabled")?.as_bool())
        .unwrap_or(true)
}

#[tauri::command]
pub fn set_telemetry_enabled(app: AppHandle, enabled: bool) -> serde_json::Value {
    let base = persistence::app_data_dir(&app);
    let config_path = persistence::data_path(&base, "config");
    let mut config = persistence::read_json(&config_path)
        .unwrap_or_else(|| persistence::user_data_default("config"));

    if let Some(t) = config.get_mut("telemetry") {
        t["enabled"] = json!(enabled);
    } else {
        config["telemetry"] = json!({ "enabled": enabled });
    }

    match persistence::write_json(&config_path, &config) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}
