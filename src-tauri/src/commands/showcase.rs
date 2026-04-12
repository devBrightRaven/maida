use rand::prelude::IndexedRandom;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::persistence;

#[tauri::command]
pub fn get_showcase(app: AppHandle) -> Result<Value, String> {
    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "showcase");

    Ok(persistence::read_json(&path).unwrap_or_else(|| persistence::user_data_default("showcase")))
}

#[tauri::command]
pub fn save_showcase(app: AppHandle, data: Value) -> Result<(), String> {
    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "showcase");
    persistence::write_json(&path, &data)
}

#[tauri::command]
pub fn search_warehouse(app: AppHandle, query: String) -> Result<Value, String> {
    let base = persistence::app_data_dir(&app);
    let games_path = persistence::data_path(&base, "games");

    let data = match persistence::read_json(&games_path) {
        Some(d) => d,
        None => return Ok(json!([])),
    };

    let games = match data.get("games").and_then(|g| g.as_array()) {
        Some(g) => g,
        None => return Ok(json!([])),
    };

    let q = query.to_lowercase();
    let results: Vec<&Value> = games
        .iter()
        .filter(|g| {
            g.get("title")
                .and_then(|t| t.as_str())
                .map(|t| t.to_lowercase().contains(&q))
                .unwrap_or(false)
        })
        .take(20)
        .collect();

    Ok(json!(results))
}

#[tauri::command]
pub fn sample_warehouse(
    app: AppHandle,
    #[allow(non_snake_case)] excludeIds: Vec<String>,
) -> Result<Value, String> {
    let exclude_ids = excludeIds;
    let base = persistence::app_data_dir(&app);
    let games_path = persistence::data_path(&base, "games");

    let data = match persistence::read_json(&games_path) {
        Some(d) => d,
        None => return Ok(Value::Null),
    };

    let games = match data.get("games").and_then(|g| g.as_array()) {
        Some(g) => g,
        None => return Ok(Value::Null),
    };

    let exclude_set: std::collections::HashSet<&str> =
        exclude_ids.iter().map(|s| s.as_str()).collect();

    let candidates: Vec<&Value> = games
        .iter()
        .filter(|g| {
            let installed = g
                .get("installed")
                .and_then(|i| i.as_bool())
                .unwrap_or(false);
            let id = g.get("id").and_then(|i| i.as_str()).unwrap_or("");
            installed && !exclude_set.contains(id)
        })
        .collect();

    if candidates.is_empty() {
        return Ok(Value::Null);
    }

    let mut rng = rand::rng();
    let selected = candidates.choose(&mut rng).unwrap();
    Ok((*selected).clone())
}

#[tauri::command]
pub fn reset_explore_limit(app: AppHandle) -> Result<(), String> {
    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "showcase");

    let mut showcase =
        persistence::read_json(&path).unwrap_or_else(|| persistence::user_data_default("showcase"));

    showcase["exploreHistory"] = json!({
        "lastSessionDate": null,
        "cardsShownToday": 0
    });

    persistence::write_json(&path, &showcase)
}
