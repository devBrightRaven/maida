use serde_json::Value;
use tauri::AppHandle;

use crate::decay;
use crate::games_store;
use crate::persistence;

const ALLOWED_DATA_TYPES: &[&str] = &[
    "games",
    "prescriptions",
    "anchor",
    "returnPenalties",
    "constraints",
    "showcase",
    "config",
    "hooks",
];

#[tauri::command]
pub fn get_data(
    app: AppHandle,
    #[allow(non_snake_case)] dataType: String,
) -> Result<Value, String> {
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
        // Decay is a writer of games.json: redo it on a fresh read under the
        // shared lock so it cannot overwrite a save that landed meanwhile.
        let mut result = data;
        games_store::update_games_file(&path, |current| {
            let Some(mut fresh) = current else {
                return Ok(None);
            };
            let applied = decay::apply_daily_decay(&mut fresh);
            result = fresh.clone();
            Ok(if applied { Some(fresh) } else { None })
        })?;
        return Ok(result);
    }

    Ok(data)
}

#[tauri::command]
pub fn save_data(
    app: AppHandle,
    #[allow(non_snake_case)] dataType: String,
    data: Value,
) -> Result<(), String> {
    let data_type = dataType;
    if !ALLOWED_DATA_TYPES.contains(&data_type.as_str()) {
        return Err(format!("Unknown data type: {}", data_type));
    }
    let base = persistence::app_data_dir(&app);
    persistence::ensure_dir(&base);
    let path = persistence::data_path(&base, &data_type);
    if data_type == "games" {
        // Whole-file replace by the webview, now serialised with the other
        // games.json writers. It can still drop a record the webview never
        // loaded (see the W1 report, residual risks).
        games_store::update_games_file(&path, |_| Ok(Some(data)))?;
        return Ok(());
    }
    persistence::write_json(&path, &data)
}

#[tauri::command]
pub fn reset_games_data(app: AppHandle) -> Result<(), String> {
    let base = persistence::app_data_dir(&app);
    let games_path = persistence::data_path(&base, "games");
    let anchor_path = persistence::data_path(&base, "anchor");
    let penalties_path = persistence::data_path(&base, "returnPenalties");

    // Remove files — ok if they don't exist
    games_store::remove_games_file(&games_path);
    let _ = std::fs::remove_file(&anchor_path);
    let _ = std::fs::remove_file(&penalties_path);

    Ok(())
}
