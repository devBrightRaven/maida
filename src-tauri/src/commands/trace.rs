use chrono::Utc;
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use tauri::AppHandle;

use crate::persistence;

/// Append-only trace log. Never pruned by design — it is the prototype's
/// decision-memory record.
#[tauri::command]
pub fn append_trace(app: AppHandle, entry: Value) -> Result<(), String> {
    let base = persistence::app_data_dir(&app);
    persistence::ensure_dir(&base);
    let path = persistence::trace_path(&base);

    let mut enriched = entry;
    // IndexMut on a non-object Value panics; reject instead.
    if !enriched.is_object() {
        return Err("trace entry must be a JSON object".into());
    }
    if enriched.get("recordedAt").is_none() {
        enriched["recordedAt"] = serde_json::json!(Utc::now().to_rfc3339());
    }

    let line = serde_json::to_string(&enriched).map_err(|e| e.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open trace: {}", e))?;

    writeln!(file, "{}", line).map_err(|e| format!("write trace: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn export_trace(app: AppHandle) -> Result<String, String> {
    let base = persistence::app_data_dir(&app);
    let path = persistence::trace_path(&base);

    if !path.exists() {
        return Err("No trace found.".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content)
}
