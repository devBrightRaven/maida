use serde_json::Value;
use tauri::AppHandle;

use crate::persistence;
use crate::decay;

const ALLOWED_DATA_TYPES: &[&str] = &[
    "games", "prescriptions", "anchor", "returnPenalties",
    "constraints", "showcase", "config",
];

#[tauri::command]
pub fn get_data(app: AppHandle, #[allow(non_snake_case)] dataType: String) -> Result<Value, String> {
    let data_type = dataType;
    if !ALLOWED_DATA_TYPES.contains(&data_type.as_str()) {
        return Err(format!("Unknown data type: {}", data_type));
    }
    let base = persistence::app_data_dir(&app);
    persistence::ensure_dir(&base);

    let path = persistence::data_path(&base, &data_type);

    let data = if let Some(value) = persistence::read_json(&path) {
        value
    } else if persistence::is_user_data(&data_type) {
        persistence::user_data_default(&data_type)
    } else {
        return Ok(Value::Null);
    };

    // Apply daily decay when loading games
    if data_type == "games" {
        let mut mutable = data;
        if decay::apply_daily_decay(&mut mutable) {
            persistence::write_json(&path, &mutable)?;
        }
        return Ok(mutable);
    }

    Ok(data)
}

#[tauri::command]
pub fn save_data(app: AppHandle, #[allow(non_snake_case)] dataType: String, data: Value) -> Result<(), String> {
    let data_type = dataType;
    if !ALLOWED_DATA_TYPES.contains(&data_type.as_str()) {
        return Err(format!("Unknown data type: {}", data_type));
    }
    let base = persistence::app_data_dir(&app);
    persistence::ensure_dir(&base);
    let path = persistence::data_path(&base, &data_type);
    persistence::write_json(&path, &data)
}

#[tauri::command]
pub fn reset_games_data(app: AppHandle) -> Result<(), String> {
    let base = persistence::app_data_dir(&app);
    let games_path = persistence::data_path(&base, "games");
    let anchor_path = persistence::data_path(&base, "anchor");
    let penalties_path = persistence::data_path(&base, "returnPenalties");

    // Remove files — ok if they don't exist
    let _ = std::fs::remove_file(&games_path);
    let _ = std::fs::remove_file(&anchor_path);
    let _ = std::fs::remove_file(&penalties_path);

    Ok(())
}
