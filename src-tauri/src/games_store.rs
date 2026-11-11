//! The one Rust write path for `games.json` (issue #35, W1).
//!
//! Every Rust writer reads, modifies and writes inside [`update_games_file`]
//! under one process-wide lock, so a slow task (IGDB enrichment) can no longer
//! write back a stale copy over something another writer saved meanwhile.
//!
//! Never hold this lock across an `.await`: scan or fetch first, then lock
//! only for the read-merge-write.

use serde_json::Value;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use crate::persistence;

static GAMES_LOCK: Mutex<()> = Mutex::new(());

fn lock() -> MutexGuard<'static, ()> {
    // A panic in another writer must not wedge every later write.
    GAMES_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// Read-modify-write `games.json` under the lock.
///
/// `f` receives the current file content (`None` when missing or unreadable)
/// and returns the new content, or `None` for "no write". Returns whether a
/// write happened. An `Err` from `f` aborts without writing.
pub fn update_games_file<F>(path: &Path, f: F) -> Result<bool, String>
where
    F: FnOnce(Option<Value>) -> Result<Option<Value>, String>,
{
    let _guard = lock();
    match f(persistence::read_json(path))? {
        Some(next) => {
            persistence::write_json(path, &next)?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Delete `games.json` under the lock (data reset). Missing file is fine.
pub fn remove_games_file(path: &Path) {
    let _guard = lock();
    let _ = std::fs::remove_file(path);
}

/// IGDB data computed for records, to be merged onto a fresh read.
pub type Enrichment = Vec<(RecordKey, Value)>;

/// A record's match key: `id` plus `steamAppId`. A Steam `id` is a title slug,
/// so two different appids can share one `id`; the appid tells them apart.
pub type RecordKey = (String, Option<String>);

fn record_key(game: &Value) -> Option<RecordKey> {
    let id = game.get("id")?.as_str()?.to_string();
    let app_id = game
        .get("steamAppId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Some((id, app_id))
}

/// The `igdb` blocks `after` gained compared with `before` (same order, same
/// length, as `enrich_games` leaves them), keyed by [`RecordKey`].
pub fn collect_enrichment(before: &[Value], after: &[Value]) -> Enrichment {
    before
        .iter()
        .zip(after.iter())
        .filter_map(|(b, a)| {
            if b.get("igdb").is_some() {
                return None;
            }
            let igdb = a.get("igdb")?.clone();
            Some((record_key(a)?, igdb))
        })
        .collect()
}

/// Set `igdb` on fresh records, matched by [`RecordKey`], only where the
/// record has none yet. Touches nothing else, so records added or changed
/// meanwhile survive. Returns true when anything changed.
pub fn apply_enrichment(games: &mut [Value], enrichment: &Enrichment) -> bool {
    let mut changed = false;
    for (key, igdb) in enrichment {
        for g in games.iter_mut() {
            if g.get("igdb").is_none() && record_key(g).as_ref() == Some(key) {
                g["igdb"] = igdb.clone();
                changed = true;
            }
        }
    }
    changed
}

/// Merge enrichment onto the current file. No file, no write: enrichment never
/// resurrects a `games.json` that a reset removed meanwhile.
pub fn write_enrichment(path: &Path, enrichment: &Enrichment) -> Result<bool, String> {
    update_games_file(path, |current| {
        let Some(mut data) = current else {
            return Ok(None);
        };
        let changed = match data.get_mut("games").and_then(|g| g.as_array_mut()) {
            Some(games) => apply_enrichment(games, enrichment),
            None => false,
        };
        Ok(if changed { Some(data) } else { None })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn enrichment_write_keeps_records_added_and_changed_meanwhile() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("games.json");
        let a = json!({"id": "a", "title": "A", "installed": true, "score": 1.0});
        let b = json!({"id": "b", "title": "B", "installed": true, "score": 2.0});
        // Snapshot wrote [a, b]; enrichment started from that clone.
        let before = vec![a.clone(), b.clone()];
        persistence::write_json(&path, &json!({"games": before.clone(), "lastDecayAt": "d"}))
            .unwrap();

        let mut after = before.clone();
        after[0]["igdb"] = json!({"timeToBeat": 10});
        let enrichment = collect_enrichment(&before, &after);
        assert_eq!(enrichment.len(), 1);

        // Meanwhile: a record is added and a score changes.
        let mut changed_b = b.clone();
        changed_b["score"] = json!(7.5);
        let added = json!({"id": "epic:new", "title": "New", "installed": true});
        persistence::write_json(
            &path,
            &json!({"games": [a.clone(), changed_b, added.clone()], "lastDecayAt": "d"}),
        )
        .unwrap();

        assert!(write_enrichment(&path, &enrichment).unwrap());
        let out = persistence::read_json(&path).unwrap();
        let games = out["games"].as_array().unwrap();
        assert_eq!(games.len(), 3);
        assert_eq!(games[0]["igdb"], json!({"timeToBeat": 10}));
        assert_eq!(games[1]["score"], json!(7.5));
        assert_eq!(games[2], added);
        assert_eq!(out["lastDecayAt"], json!("d"));
    }

    #[test]
    fn enrichment_does_not_cross_records_that_share_a_slug_id() {
        // Two Steam games whose titles slug to the same `id`.
        let before = vec![
            json!({"id": "doom", "steamAppId": "2280", "title": "DOOM"}),
            json!({"id": "doom", "steamAppId": "379720", "title": "DOOM"}),
        ];
        let mut after = before.clone();
        after[0]["igdb"] = json!({"timeToBeat": 5});
        after[1]["igdb"] = json!({"timeToBeat": 12});
        let enrichment = collect_enrichment(&before, &after);

        let mut fresh = before.clone();
        assert!(apply_enrichment(&mut fresh, &enrichment));
        assert_eq!(fresh[0]["igdb"], json!({"timeToBeat": 5}));
        assert_eq!(fresh[1]["igdb"], json!({"timeToBeat": 12}));
    }

    #[test]
    fn enrichment_does_not_resurrect_a_removed_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("games.json");
        let enrichment: Enrichment = vec![(("a".into(), None), json!({"timeToBeat": 1}))];
        assert!(!write_enrichment(&path, &enrichment).unwrap());
        assert!(!path.exists());
    }

    #[test]
    fn concurrent_updates_do_not_lose_writes() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("games.json");
        persistence::write_json(&path, &json!({"games": []})).unwrap();
        let handles: Vec<_> = (0..8)
            .map(|n| {
                let p = path.clone();
                std::thread::spawn(move || {
                    update_games_file(&p, |cur| {
                        let mut data = cur.unwrap_or_else(|| json!({"games": []}));
                        data["games"]
                            .as_array_mut()
                            .unwrap()
                            .push(json!({"id": format!("g{n}")}));
                        Ok(Some(data))
                    })
                    .unwrap();
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        let out = persistence::read_json(&path).unwrap();
        assert_eq!(out["games"].as_array().unwrap().len(), 8);
    }

    #[test]
    fn closure_error_or_none_writes_nothing() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("games.json");
        persistence::write_json(&path, &json!({"games": [{"id": "keep"}]})).unwrap();
        assert!(!update_games_file(&path, |_| Ok(None)).unwrap());
        assert!(update_games_file(&path, |_| Err("boom".to_string())).is_err());
        let out = persistence::read_json(&path).unwrap();
        assert_eq!(out["games"][0]["id"], json!("keep"));
    }
}
