use chrono::Utc;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

use crate::credentials;
use crate::enrichment;
use crate::games_store;
use crate::library;
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

    let base = persistence::app_data_dir(&app);
    let path = persistence::data_path(&base, "games");
    games_store::update_games_file(&path, |current| {
        let existing = games_of(current.as_ref());
        let games = merge_onboarding_scan(&existing, &scanned, &Utc::now().to_rfc3339());
        Ok(Some(json!({
            "schemaVersion": SCHEMA_VERSION,
            "source": "steam-onboarding",
            "lastSuccessfulSyncAt": Utc::now().to_rfc3339(),
            "libraryProvider": "steam",
            "games": games
        })))
    })?;

    Ok(json!({ "success": true, "count": scanned.len() }))
}

fn games_of(data: Option<&Value>) -> Vec<Value> {
    data.and_then(|d| d.get("games"))
        .and_then(|g| g.as_array())
        .cloned()
        .unwrap_or_default()
}

/// Onboarding replaces Steam-only records with the scan, as before, but keeps
/// every record that has no Steam install or has a non-Steam install, then
/// runs the normal Steam merge (so a same-titled non-Steam record gets the
/// Steam install attached instead of a second record).
fn merge_onboarding_scan(existing: &[Value], scanned: &[Value], now: &str) -> Vec<Value> {
    let kept: Vec<Value> = existing
        .iter()
        .filter(|g| {
            let installs = library::effective_installs(g);
            installs.is_empty() || installs.iter().any(|i| i.source != library::SOURCE_STEAM)
        })
        .cloned()
        .collect();
    merge_steam(&kept, scanned, now, false)
}

#[tauri::command]
pub async fn perform_background_snapshot(app: AppHandle) -> Result<Value, String> {
    let scanned = match steam::scan_steam_library() {
        Ok(g) => g,
        Err(e) => return Ok(json!({ "success": false, "error": e })),
    };

    let base = persistence::app_data_dir(&app);
    let games_path = persistence::data_path(&base, "games");

    // Read-merge-write under the shared games.json lock (atomic write inside).
    let mut clean_games: Vec<Value> = Vec::new();
    games_store::update_games_file(&games_path, |current| {
        let mut current_data = current.unwrap_or_else(|| json!({ "games": [] }));
        let existing_games_raw = games_of(Some(&current_data));
        clean_games = merge_steam_snapshot(&existing_games_raw, &scanned, &Utc::now().to_rfc3339());

        current_data["schemaVersion"] = json!(SCHEMA_VERSION);
        current_data["source"] = json!("steam-background");
        current_data["lastSuccessfulSyncAt"] = json!(Utc::now().to_rfc3339());
        current_data["libraryProvider"] = json!("steam");
        current_data["games"] = json!(clean_games);
        Ok(Some(current_data))
    })?;

    // Fire-and-forget IGDB enrichment. It only reports the `igdb` blocks it
    // gained; they are merged onto a fresh read, never written back as a
    // whole pre-enrichment copy.
    let games_path_clone = games_path.clone();
    let before = clean_games.clone();
    let mut enrichable = clean_games.clone();
    tokio::spawn(async move {
        if let Some(creds) = credentials::load() {
            if let Some(token) =
                enrichment::twitch::get_access_token(&creds.client_id, &creds.client_secret).await
            {
                enrichment::igdb::enrich_games(&mut enrichable, &creds.client_id, &token).await;
                let gained = games_store::collect_enrichment(&before, &enrichable);
                if !gained.is_empty() {
                    let _ = games_store::write_enrichment(&games_path_clone, &gained);
                }
            }
        }
    });

    Ok(json!({ "success": true, "count": clean_games.len() }))
}

/// Non-empty `steamAppId` of a record, if it has one. A record without one
/// (absent, null, or empty) has no Steam install and is never touched by a
/// Steam scan.
fn steam_app_id(game: &Value) -> Option<&str> {
    game.get("steamAppId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
}

/// Pure merge of a Steam scan into the existing games list. `now` is an
/// RFC3339 timestamp. Order is deterministic: existing records keep their
/// position, new games are appended in scan order.
fn merge_steam_snapshot(existing_games_raw: &[Value], scanned: &[Value], now: &str) -> Vec<Value> {
    merge_steam(existing_games_raw, scanned, now, true)
}

/// Shared Steam merge. `seed_score` gives brand-new records `score: 0.0`
/// (background snapshot does; onboarding never did).
///
/// Records with an `installs` array (a game that also has a non-Steam
/// install) are updated only through their Steam install: top-level
/// `installed` is recomputed as the OR of the installs, and the title is not
/// overwritten from the Steam scan (which install's title wins is W5).
fn merge_steam(
    existing_games_raw: &[Value],
    scanned: &[Value],
    now: &str,
    seed_score: bool,
) -> Vec<Value> {
    // Layer 2: Deterministic Healing Dedup. Only records with a Steam appid
    // enter the appid-keyed index; every other record passes through
    // untouched, so a non-Steam `id` can never share the appid key space.
    let mut games: Vec<Value> = Vec::with_capacity(existing_games_raw.len());
    let mut index_by_appid: HashMap<String, usize> = HashMap::new();
    for g in existing_games_raw {
        let Some(app_id) = steam_app_id(g) else {
            games.push(g.clone());
            continue;
        };
        if let Some(&i) = index_by_appid.get(app_id) {
            // Conflict resolution: keep the one with more behavioral weight
            if activity_weight(g) > activity_weight(&games[i]) {
                games[i] = g.clone();
            }
        } else {
            index_by_appid.insert(app_id.to_string(), games.len());
            games.push(g.clone());
        }
    }

    // Scanned game IDs
    let scanned_ids: HashSet<String> = scanned
        .iter()
        .filter_map(|g| steam_app_id(g).map(|s| s.to_string()))
        .collect();

    // A) Process existing Steam games — detect installs/uninstalls + update titles
    for (app_id, &idx) in index_by_appid.iter() {
        let game = &mut games[idx];
        let is_installed = scanned_ids.contains(app_id);
        let was_installed = game
            .get("installed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if library::has_installs_field(game) {
            // Multi-source record: only its Steam install is ours to decide.
            if is_installed {
                if let Some(s) = scanned
                    .iter()
                    .find(|s| steam_app_id(s) == Some(app_id.as_str()))
                {
                    for key in ["steamLastPlayed", "steamLastPlayedStatus"] {
                        if let Some(v) = s.get(key) {
                            game[key] = v.clone();
                        }
                    }
                }
            }
            library::set_install_state(game, library::SOURCE_STEAM, app_id, is_installed);
            library::recompute_installed(game);
            library::mark_return_if_reinstalled(game, was_installed, now);
            continue;
        }

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
            game["reinstalledAt"] = json!(now);
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

    // B) Add brand new games (appended after existing records, scan order)
    for g in scanned {
        let app_id = g.get("steamAppId").and_then(|v| v.as_str()).unwrap_or("");
        if app_id.is_empty() || index_by_appid.contains_key(app_id) {
            continue;
        }
        let title = g.get("title").and_then(|t| t.as_str()).unwrap_or("");
        // Ruling 2 (2026-11-12): a new appid whose title matches a record
        // with no Steam install joins that record and keeps its trace subject.
        if let Some(i) = library::find_attach_target(&games, library::SOURCE_STEAM, title) {
            library::attach_install(&mut games[i], library::SOURCE_STEAM, app_id, now);
            index_by_appid.insert(app_id.to_string(), i);
            log::info!("[Steam] Attached to existing game: {}", title);
            continue;
        }
        let mut new_game = g.clone();
        if seed_score {
            new_game["score"] = json!(0.0);
        }
        index_by_appid.insert(app_id.to_string(), games.len());
        games.push(new_game);
        log::info!("[Steam] New game: {}", title);
    }

    // The appid index is unique by construction, so the old Layer 3 final
    // dedup has nothing left to remove.
    games
}

fn activity_weight(game: &Value) -> f64 {
    let score = game
        .get("score")
        .and_then(|s| s.as_f64())
        .unwrap_or(0.0)
        .abs();
    let played = game
        .get("lastPlayed")
        .and_then(|v| v.as_str())
        .map(|s| if s != "Never" { 1.0 } else { 0.0 })
        .unwrap_or(0.0);
    score + played
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: &str = "2026-11-12T00:00:00+00:00";

    fn steam_scan(appid: &str, title: &str) -> Value {
        json!({
            "id": title.to_lowercase().replace(' ', "-"),
            "title": title,
            "installed": true,
            "steamAppId": appid,
            "steamUrl": format!("steam://rungameid/{}", appid),
            "steamLastPlayed": 0,
            "steamLastPlayedStatus": "zero",
            "importedAt": "2026-01-01T00:00:00+00:00"
        })
    }

    fn by_id<'a>(games: &'a [Value], id: &str) -> &'a Value {
        games
            .iter()
            .find(|g| g["id"] == id)
            .unwrap_or_else(|| panic!("record {id} missing"))
    }

    #[test]
    fn non_steam_record_stays_installed_across_steam_snapshot() {
        let existing = vec![
            json!({"id": "epic:abc", "title": "Epic Thing", "installed": true, "score": 1.5}),
            json!({"id": "manual-null", "title": "Null Appid", "installed": true, "steamAppId": null}),
        ];
        let scanned = vec![steam_scan("10", "Some Steam Game")];
        let out = merge_steam_snapshot(&existing, &scanned, NOW);
        assert_eq!(by_id(&out, "epic:abc")["installed"], json!(true));
        assert_eq!(by_id(&out, "manual-null")["installed"], json!(true));
    }

    #[test]
    fn uninstalled_steam_game_flips_to_not_installed() {
        let mut gone = steam_scan("20", "Gone Game");
        gone["score"] = json!(2.0);
        let out = merge_steam_snapshot(&[gone], &[steam_scan("10", "Other")], NOW);
        assert_eq!(by_id(&out, "gone-game")["installed"], json!(false));
        assert!(by_id(&out, "gone-game").get("reinstalledAt").is_none());
    }

    #[test]
    fn reinstalled_steam_game_gets_reinstalled_at_and_buffer() {
        let mut back = steam_scan("30", "Back Game");
        back["installed"] = json!(false);
        let out = merge_steam_snapshot(&[back], &[steam_scan("30", "Back Game")], NOW);
        let g = by_id(&out, "back-game");
        assert_eq!(g["installed"], json!(true));
        assert_eq!(g["reinstalledAt"], json!(NOW));
        assert_eq!(g["buffer"], json!({"type": "visibility", "remaining": 3}));
    }

    #[test]
    fn existing_steam_only_file_unchanged_by_snapshot_merge() {
        let mut a = steam_scan("1", "Alpha");
        a["score"] = json!(3.0);
        a["lastPlayed"] = json!("2026-01-01");
        let mut b = steam_scan("2", "Beta");
        b["score"] = json!(-1.0);
        let existing = vec![a, b];
        let scanned = vec![steam_scan("1", "Alpha"), steam_scan("2", "Beta")];
        let out = merge_steam_snapshot(&existing, &scanned, NOW);
        // Same records, same order, no field added or removed.
        assert_eq!(out, existing);
        for g in &out {
            assert!(g.get("installs").is_none());
            assert!(g.get("traceSubject").is_none());
        }
    }

    #[test]
    fn duplicate_appid_healing_keeps_heavier_record() {
        let mut light = steam_scan("5", "Dup");
        light["id"] = json!("dup-light");
        light["score"] = json!(0.5);
        let mut heavy = steam_scan("5", "Dup");
        heavy["id"] = json!("dup-heavy");
        heavy["score"] = json!(9.0);
        let out = merge_steam_snapshot(&[light, heavy], &[steam_scan("5", "Dup")], NOW);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["id"], json!("dup-heavy"));
    }

    #[test]
    fn snapshot_order_keeps_existing_and_appends_new() {
        let existing = vec![
            steam_scan("3", "Three"),
            json!({"id": "epic:x", "title": "X", "installed": true}),
            steam_scan("1", "One"),
        ];
        let scanned = vec![
            steam_scan("9", "Nine"),
            steam_scan("1", "One"),
            steam_scan("3", "Three"),
            steam_scan("7", "Seven"),
        ];
        let out = merge_steam_snapshot(&existing, &scanned, NOW);
        let ids: Vec<&str> = out.iter().map(|g| g["id"].as_str().unwrap()).collect();
        assert_eq!(ids, vec!["three", "epic:x", "one", "nine", "seven"]);
    }

    fn epic_record(sid: &str, title: &str) -> Value {
        json!({
            "id": format!("epic:{sid}"),
            "title": title,
            "installed": true,
            "installs": [{"source": "epic", "sourceId": sid, "installed": true}],
            "traceSubject": {"namespace": "maida", "id": format!("epic:{sid}")},
            "score": 4.0
        })
    }

    #[test]
    fn steam_scan_attaches_new_appid_to_same_titled_non_steam_record() {
        let existing = vec![epic_record("abc", "Celeste")];
        let out = merge_steam_snapshot(&existing, &[steam_scan("504230", "  celeste ")], NOW);
        assert_eq!(out.len(), 1);
        let g = &out[0];
        assert_eq!(g["id"], json!("epic:abc"));
        assert_eq!(
            g["traceSubject"],
            json!({"namespace": "maida", "id": "epic:abc"})
        );
        assert_eq!(g["steamAppId"], json!("504230"));
        assert_eq!(g["score"], json!(4.0));
        assert_eq!(
            g["installs"],
            json!([
                {"source": "epic", "sourceId": "abc", "installed": true},
                {"source": "steam", "sourceId": "504230", "installed": true}
            ])
        );
    }

    #[test]
    fn attached_record_stays_installed_when_only_steam_install_goes_away() {
        let existing = vec![epic_record("abc", "Celeste")];
        let attached = merge_steam_snapshot(&existing, &[steam_scan("504230", "Celeste")], NOW);
        // Next snapshot: Steam no longer reports it; the Epic install remains.
        let out = merge_steam_snapshot(&attached, &[steam_scan("1", "Other")], NOW);
        let g = by_id(&out, "epic:abc");
        assert_eq!(g["installed"], json!(true));
        assert_eq!(g["installs"][1]["installed"], json!(false));
        assert_eq!(g["installs"][0]["installed"], json!(true));
        // Title is not overwritten from Steam on a multi-source record.
        let renamed = merge_steam_snapshot(&attached, &[steam_scan("504230", "Celeste (EN)")], NOW);
        assert_eq!(by_id(&renamed, "epic:abc")["title"], json!("Celeste"));
    }

    #[test]
    fn legacy_manual_entry_is_steam_attach_target_with_state_materialised() {
        let manual = json!({"id": "my-game", "title": "My Game", "installed": true, "score": 2.0});
        let out = merge_steam_snapshot(&[manual], &[steam_scan("77", "My Game")], NOW);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["id"], json!("my-game"));
        assert_eq!(
            out[0]["traceSubject"],
            json!({"namespace": "maida", "id": "my-game"})
        );
        assert_eq!(
            out[0]["installs"],
            json!([
                {"source": "manual", "sourceId": "my-game", "installed": true},
                {"source": "steam", "sourceId": "77", "installed": true}
            ])
        );
    }

    #[test]
    fn two_steam_appids_with_the_same_title_stay_two_records() {
        let mut first = steam_scan("1", "Twin");
        first["id"] = json!("twin-1");
        let mut second = steam_scan("2", "Twin");
        second["id"] = json!("twin-2");
        let out = merge_steam_snapshot(&[first], &[steam_scan("1", "Twin"), second], NOW);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0]["id"], json!("twin-1"));
        assert_eq!(out[1]["id"], json!("twin-2"));
        assert!(out[1].get("installs").is_none());
    }

    #[test]
    fn onboarding_sync_keeps_non_steam_records_and_replaces_steam_only() {
        let mut stale = steam_scan("9", "Stale Steam");
        stale["score"] = json!(5.0);
        let manual = json!({"id": "manual-1", "title": "Manual", "installed": true});
        let epic = epic_record("e1", "Epic One");
        let mixed = json!({
            "id": "both", "title": "Both", "installed": true, "steamAppId": "5",
            "installs": [
                {"source": "steam", "sourceId": "5", "installed": true},
                {"source": "epic", "sourceId": "b", "installed": true}
            ],
            "traceSubject": {"namespace": "steam", "id": "5"}
        });
        let existing = vec![stale, manual.clone(), epic.clone(), mixed];
        let scanned = vec![steam_scan("5", "Both"), steam_scan("6", "Fresh")];
        let out = merge_onboarding_scan(&existing, &scanned, NOW);
        let ids: Vec<&str> = out.iter().map(|g| g["id"].as_str().unwrap()).collect();
        // Steam-only "stale-steam" is gone; others kept in order; new appended.
        assert_eq!(ids, vec!["manual-1", "epic:e1", "both", "fresh"]);
        assert_eq!(out[0], manual);
        assert_eq!(out[1], epic);
        // Onboarding never seeded a score on scanned records.
        assert!(by_id(&out, "fresh").get("score").is_none());
    }

    #[test]
    fn onboarding_sync_attaches_scan_to_same_titled_non_steam_record() {
        let epic = epic_record("e1", "Hades");
        let out = merge_onboarding_scan(&[epic], &[steam_scan("1145360", "Hades")], NOW);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["id"], json!("epic:e1"));
        assert_eq!(out[0]["steamAppId"], json!("1145360"));
    }
}
