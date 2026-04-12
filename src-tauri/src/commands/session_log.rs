use chrono::{Duration, Local};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use tauri::AppHandle;

use crate::persistence;

#[tauri::command]
pub fn append_session_log(app: AppHandle, entry: Value) -> Result<(), String> {
    let base = persistence::app_data_dir(&app);
    persistence::ensure_dir(&base);
    let path = persistence::session_log_path(&base);

    let mut enriched = entry;
    if enriched.get("timestamp").is_none() {
        enriched["timestamp"] = serde_json::json!(Local::now().to_rfc3339());
    }

    let line = serde_json::to_string(&enriched).map_err(|e| e.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open log: {}", e))?;

    writeln!(file, "{}", line).map_err(|e| format!("write log: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn export_session_log(app: AppHandle) -> Result<String, String> {
    let base = persistence::app_data_dir(&app);
    let path = persistence::session_log_path(&base);

    if !path.exists() {
        return Err("No session log found.".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content)
}

/// Prune session log entries older than 30 days. Called on startup.
pub fn prune_session_log(base: &std::path::Path) {
    let path = persistence::session_log_path(base);
    if !path.exists() {
        return;
    }

    let cutoff = Local::now() - Duration::days(30);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    let file = match fs::File::open(&path) {
        Ok(f) => f,
        Err(_) => return,
    };

    let reader = BufReader::new(file);
    let mut kept: Vec<String> = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        // Parse just enough to check date
        if let Ok(entry) = serde_json::from_str::<Value>(&line) {
            if let Some(ts) = entry.get("timestamp").and_then(|t| t.as_str()) {
                // Compare date portion (first 10 chars)
                if ts.len() >= 10 && &ts[..10] >= cutoff_str.as_str() {
                    kept.push(line);
                }
                continue;
            }
        }
        // Keep unparseable lines (don't silently drop data)
        kept.push(line);
    }

    // Rewrite
    if let Ok(mut file) = fs::File::create(&path) {
        for line in &kept {
            let _ = writeln!(file, "{}", line);
        }
    }
}
