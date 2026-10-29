use chrono::Utc;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

use crate::credentials;
use crate::enrichment;
use crate::persistence;
use crate::steam;

const SCHEMA_VERSION: &str = "0.2.2";

#[tauri::command]
pub fn check_steam_available() -> Value {
    json!({ "available": steam::is_available() })
}

#[tauri::command]
pub async fn request_onboarding_sync(app: AppHandle) -> Result<Value, String> {
    let scanned = steam::scan_steam_library()?;

    let data = json!({
        "schemaVersion": SCHEMA_VERSION,
        "source": "steam-onboarding",
        "lastSuccessfulSyncAt": Utc::now().to_rfc3339(),
        "libraryProvider": "steam",
        "games": scanned
    });

    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "games");
    persistence::write_json(&path, &data)?;

    Ok(json!({ "success": true, "count": scanned.len() }))
}

#[tauri::command]
pub async fn perform_background_snapshot(app: AppHandle) -> Result<Value, String> {
    let scanned = match steam::scan_steam_library() {
        Ok(g) => g,
        Err(e) => return Ok(json!({ "success": false, "error": e })),
    };

    let base = persistence::app_data_dir(&app);
    let games_path = persistence::data_path(&base, "games");

    let mut current_data =
        persistence::read_json(&games_path).unwrap_or_else(|| json!({ "games": [] }));

    let existing_games_raw = current_data
        .get("games")
        .and_then(|g| g.as_array())
        .cloned()
        .unwrap_or_default();

    // Layer 2: Deterministic Healing Dedup
    let mut existing_map: HashMap<String, Value> = HashMap::new();
    for g in &existing_games_raw {
        let app_id = g
            .get("steamAppId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if app_id.is_empty() {
            // Keep manual entries by using a unique key
            let id = g
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            existing_map.entry(id).or_insert_with(|| g.clone());
            continue;
        }

        if let Some(prev) = existing_map.get(&app_id) {
            // Conflict resolution: keep the one with more behavioral weight
            let prev_activity = activity_weight(prev);
            let curr_activity = activity_weight(g);
            if curr_activity > prev_activity {
                existing_map.insert(app_id, g.clone());
            }
        } else {
            existing_map.insert(app_id, g.clone());
        }
    }

    // Scanned game IDs
    let scanned_ids: HashSet<String> = scanned
        .iter()
        .filter_map(|g| {
            g.get("steamAppId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .collect();

    // A) Process existing games — detect installs/uninstalls + update titles
    for (app_id, game) in existing_map.iter_mut() {
        if app_id.is_empty() {
            continue;
        }
        let is_installed = scanned_ids.contains(app_id);
        let was_installed = game
            .get("installed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Update title from latest scan (Steam language may have changed)
        if is_installed {
            if let Some(scanned_game) = scanned
                .iter()
                .find(|s| s.get("steamAppId").and_then(|v| v.as_str()) == Some(app_id.as_str()))
            {
                if let Some(new_title) = scanned_game.get("title") {
                    game["title"] = new_title.clone();
                }
                if let Some(last_played) = scanned_game.get("steamLastPlayed") {
                    game["steamLastPlayed"] = last_played.clone();
                }
                if let Some(last_played_status) = scanned_game.get("steamLastPlayedStatus") {
                    game["steamLastPlayedStatus"] = last_played_status.clone();
                }
            }
        }

        if is_installed && !was_installed {
            // Reinstall
            game["installed"] = json!(true);
            game["reinstalledAt"] = json!(Utc::now().to_rfc3339());
            game["buffer"] = json!({"type": "visibility", "remaining": 3});
            log::info!(
                "[Steam] Re-install detected: {}",
                game.get("title").and_then(|t| t.as_str()).unwrap_or("?")
            );
        } else if !is_installed && was_installed {
            // Soft delete
            game["installed"] = json!(false);
            log::info!(
                "[Steam] Uninstall detected: {}",
                game.get("title").and_then(|t| t.as_str()).unwrap_or("?")
            );
        }
    }

    // B) Add brand new games
    for g in &scanned {
        let app_id = g.get("steamAppId").and_then(|v| v.as_str()).unwrap_or("");
        if !app_id.is_empty() && !existing_map.contains_key(app_id) {
            let mut new_game = g.clone();
            new_game["score"] = json!(0.0);
            existing_map.insert(app_id.to_string(), new_game);
            log::info!(
                "[Steam] New game: {}",
                g.get("title").and_then(|t| t.as_str()).unwrap_or("?")
            );
        }
    }

    // Layer 3: Persistence invariant — final dedup
    let mut final_set: HashSet<String> = HashSet::new();
    let clean_games: Vec<Value> = existing_map
        .into_values()
        .filter(|g| {
            let app_id = g.get("steamAppId").and_then(|v| v.as_str()).unwrap_or("");
            if app_id.is_empty() {
                return true;
            } // Keep manual entries
            if final_set.contains(app_id) {
                return false;
            }
            final_set.insert(app_id.to_string());
            true
        })
        .collect();

    // Atomic write
    current_data["schemaVersion"] = json!(SCHEMA_VERSION);
    current_data["source"] = json!("steam-background");
    current_data["lastSuccessfulSyncAt"] = json!(Utc::now().to_rfc3339());
    current_data["libraryProvider"] = json!("steam");
    current_data["games"] = json!(clean_games);

    persistence::write_json(&games_path, &current_data)?;

    // Fire-and-forget IGDB enrichment
    let games_path_clone = games_path.clone();
    let mut enrichable = clean_games.clone();
    tokio::spawn(async move {
        if let Some(creds) = credentials::load() {
            if let Some(token) =
                enrichment::twitch::get_access_token(&creds.client_id, &creds.client_secret).await
            {
                enrichment::igdb::enrich_games(&mut enrichable, &creds.client_id, &token).await;
                // Save enriched data back
                if let Some(mut data) = persistence::read_json(&games_path_clone) {
                    data["games"] = json!(enrichable);
                    let _ = persistence::write_json(&games_path_clone, &data);
                }
            }
        }
    });

    Ok(json!({ "success": true, "count": clean_games.len() }))
}

fn activity_weight(game: &Value) -> f64 {
    let score = game
        .get("score")
        .and_then(|s| s.as_f64())
        .unwrap_or(0.0)
        .abs();
    let played = if has_played(game) { 1.0 } else { 0.0 };
    score + played
}

/// BUG-005: Steam records carry `steamLastPlayed` / `steamLastPlayedStatus`
/// (LastPlayed contract, `src/core/lastPlayed.js`); only a "recorded" status
/// with a usable epoch proves play. Zero / missing / invalid add nothing.
/// Legacy Playnite-era records keep the old `lastPlayed != "Never"` rule.
fn has_played(game: &Value) -> bool {
    if let Some(status) = game.get("steamLastPlayedStatus").and_then(|v| v.as_str()) {
        let epoch = game
            .get("steamLastPlayed")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        return status == "recorded" && epoch > 0 && epoch <= steam::MAX_EPOCH_SECONDS;
    }
    game.get("lastPlayed")
        .and_then(|v| v.as_str())
        .map(|s| s != "Never")
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_recorded_play_outweighs_unplayed_duplicate() {
        // BUG-005: Steam records carry steamLastPlayed/Status, not lastPlayed.
        let played = json!({
            "steamAppId": "10", "score": 0.0,
            "steamLastPlayed": 1724800000, "steamLastPlayedStatus": "recorded"
        });
        let unplayed = json!({
            "steamAppId": "10", "score": 0.0,
            "steamLastPlayed": 0, "steamLastPlayedStatus": "zero"
        });
        assert!(activity_weight(&played) > activity_weight(&unplayed));
    }

    #[test]
    fn unknown_steam_play_state_adds_no_weight() {
        for status in ["missing", "invalid", "zero"] {
            let g = json!({ "score": 0.0, "steamLastPlayed": 0, "steamLastPlayedStatus": status });
            assert_eq!(activity_weight(&g), 0.0, "status {status}");
        }
        // Inconsistent pairing: "recorded" without a usable epoch is not played.
        let bad =
            json!({ "score": 0.0, "steamLastPlayed": 0, "steamLastPlayedStatus": "recorded" });
        assert_eq!(activity_weight(&bad), 0.0);
    }

    #[test]
    fn legacy_last_played_string_still_counts() {
        let legacy = json!({ "score": 0.0, "lastPlayed": "2024-05-11" });
        let never = json!({ "score": 0.0, "lastPlayed": "Never" });
        assert_eq!(activity_weight(&legacy), 1.0);
        assert_eq!(activity_weight(&never), 0.0);
    }
}
