//! Record shape and intake rules for games from more than one source
//! (issue #35, part of #33; `docs/specs/game-sources.md` sections 3, 4, 7, 8 W1).
//!
//! Everything here is a pure function over `serde_json::Value` records, so it
//! is tested without touching the real app data directory.
//!
//! Record shape (all fields optional, nothing is written onto existing Steam
//! records):
//! - `installs`: `[{ "source", "sourceId", "installed" }]`. A record without
//!   `installs` but with a `steamAppId` is READ as one Steam install. A record
//!   with neither is a legacy manual entry and no source scan touches it.
//! - `traceSubject`: `{ "namespace", "id" }`, stored once (on creation by the
//!   intake path, or when a second install is attached) and never changed.
//! - top-level `installed` on a record that has `installs` is the OR of them.

use serde_json::{json, Map, Value};
use std::collections::HashSet;

pub const SOURCE_STEAM: &str = "steam";
pub const SOURCE_MANUAL: &str = "manual";

/// One install of a game, as read through [`effective_installs`].
#[derive(Debug, Clone, PartialEq)]
pub struct Install {
    pub source: String,
    pub source_id: String,
    pub installed: bool,
}

/// One game a source reports as present on this machine.
#[derive(Debug, Clone)]
pub struct ScannedInstall {
    pub source_id: String,
    pub title: String,
    /// Extra fields copied onto a NEW record only (never overrides the
    /// intake-owned fields: id, title, installed, installs, traceSubject, score).
    pub fields: Value,
}

/// Title key used to decide that two installs are the same game.
///
/// ASSUMPTION (deliberately conservative): trim, Unicode lowercase, collapse
/// internal whitespace. No punctuation stripping, no edition-word removal, no
/// diacritic folding. A false split (two records for one game) is fixable by
/// the player later (W5); a false merge would put two games under one trace
/// subject, so the key stays strict.
pub fn normalize_title(title: &str) -> String {
    title
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn has_installs_field(game: &Value) -> bool {
    game.get("installs").is_some_and(Value::is_array)
}

fn top_level_installed(game: &Value) -> bool {
    game.get("installed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn non_empty_steam_app_id(game: &Value) -> Option<&str> {
    game.get("steamAppId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
}

/// The installs a record has, whatever its shape. The one reader every rule
/// below uses: `installs` when present, else one Steam install when there is
/// a `steamAppId`, else none (legacy manual entry).
pub fn effective_installs(game: &Value) -> Vec<Install> {
    if let Some(arr) = game.get("installs").and_then(|v| v.as_array()) {
        return arr
            .iter()
            .filter_map(|e| {
                Some(Install {
                    source: e.get("source")?.as_str()?.to_string(),
                    source_id: e.get("sourceId")?.as_str()?.to_string(),
                    installed: e
                        .get("installed")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                })
            })
            .collect();
    }
    match non_empty_steam_app_id(game) {
        Some(app_id) => vec![Install {
            source: SOURCE_STEAM.to_string(),
            source_id: app_id.to_string(),
            installed: top_level_installed(game),
        }],
        None => Vec::new(),
    }
}

/// True when the record has any install from `source`.
pub fn has_install_from(game: &Value, source: &str) -> bool {
    effective_installs(game).iter().any(|i| i.source == source)
}

/// The trace subject a record has today, as `(namespace, id)`. Mirrors the
/// JS derivation in `src/core/traceSubject.js` EXACTLY: `steamAppId != null`
/// gives `steam` + `String(steamAppId)`, otherwise `maida` + `id`. It is a
/// separate function from `non_empty_steam_app_id` on purpose: this value is
/// frozen into the record, so it must match what the webview would have
/// recorded, empty strings included.
pub fn derive_trace_subject(game: &Value) -> (String, String) {
    match game.get("steamAppId") {
        None | Some(Value::Null) => (
            "maida".to_string(),
            game.get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        ),
        Some(Value::String(s)) => ("steam".to_string(), s.clone()),
        Some(other) => ("steam".to_string(), other.to_string()),
    }
}

fn write_installs(game: &mut Value, installs: &[Install]) {
    game["installs"] = Value::Array(
        installs
            .iter()
            .map(|i| {
                json!({
                    "source": i.source,
                    "sourceId": i.source_id,
                    "installed": i.installed
                })
            })
            .collect(),
    );
}

/// Top-level `installed` = OR of the installs. Only for records that have an
/// `installs` array.
pub fn recompute_installed(game: &mut Value) {
    if has_installs_field(game) {
        let any = effective_installs(game).iter().any(|i| i.installed);
        game["installed"] = json!(any);
    }
}

/// Reinstall bookkeeping shared with the Steam path: a record that was not
/// installed anywhere and is now installed somewhere gets the same
/// `reinstalledAt` and visibility buffer a Steam reinstall gets.
pub fn mark_return_if_reinstalled(game: &mut Value, was_installed: bool, now: &str) {
    if !was_installed && top_level_installed(game) {
        game["reinstalledAt"] = json!(now);
        game["buffer"] = json!({"type": "visibility", "remaining": 3});
    }
}

/// Make the record carry an explicit `installs` array, storing the trace
/// subject it would have had BEFORE this change. No-op for the array when it
/// already exists. The subject is only ever written when absent.
fn materialize(game: &mut Value) {
    if game.get("traceSubject").is_none() {
        let (namespace, id) = derive_trace_subject(game);
        game["traceSubject"] = json!({ "namespace": namespace, "id": id });
    }
    if has_installs_field(game) {
        return;
    }
    let mut installs = effective_installs(game);
    if installs.is_empty() {
        // Legacy manual entry: its existing state becomes a manual install.
        installs.push(Install {
            source: SOURCE_MANUAL.to_string(),
            source_id: game
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            installed: top_level_installed(game),
        });
    }
    write_installs(game, &installs);
}

/// Set the `installed` state of one existing install on a record that has an
/// `installs` array. Returns false when no such install exists.
pub fn set_install_state(game: &mut Value, source: &str, source_id: &str, installed: bool) -> bool {
    let Some(arr) = game.get_mut("installs").and_then(|v| v.as_array_mut()) else {
        return false;
    };
    for entry in arr.iter_mut() {
        if entry.get("source").and_then(|v| v.as_str()) == Some(source)
            && entry.get("sourceId").and_then(|v| v.as_str()) == Some(source_id)
        {
            entry["installed"] = json!(installed);
            return true;
        }
    }
    false
}

/// Attach an install (installed now) to an existing record. The record keeps
/// its `id` and `traceSubject`; it gains the install, and a top-level
/// `steamAppId` only when the source is Steam and it had none.
pub fn attach_install(game: &mut Value, source: &str, source_id: &str, now: &str) {
    let was_installed = top_level_installed(game);
    materialize(game);
    if !set_install_state(game, source, source_id, true) {
        let mut installs = effective_installs(game);
        installs.push(Install {
            source: source.to_string(),
            source_id: source_id.to_string(),
            installed: true,
        });
        write_installs(game, &installs);
    }
    if source == SOURCE_STEAM && non_empty_steam_app_id(game).is_none() {
        game["steamAppId"] = json!(source_id);
        // Launch still reads `steamUrl` until W2 resolves targets in Rust.
        // Without it the attached game would record a decision and not start.
        if game.get("steamUrl").and_then(|v| v.as_str()).is_none() {
            game["steamUrl"] = json!(format!("steam://rungameid/{}", source_id));
        }
    }
    recompute_installed(game);
    mark_return_if_reinstalled(game, was_installed, now);
}

/// Index of the record a new install from `source` titled `title` attaches
/// to: the first record, in list order, whose normalised title equals the
/// scanned one and which has no install from `source`. A record that already
/// has an install from the same source (any `sourceId`) is never a target: two
/// Steam appids are two games. An empty normalised title never matches.
pub fn find_attach_target(games: &[Value], source: &str, title: &str) -> Option<usize> {
    let key = normalize_title(title);
    if key.is_empty() {
        return None;
    }
    games.iter().position(|g| {
        let t = g.get("title").and_then(|v| v.as_str()).unwrap_or("");
        normalize_title(t) == key && !has_install_from(g, source)
    })
}

fn new_record(source: &str, item: &ScannedInstall, now: &str) -> Value {
    let id = format!("{}:{}", source, item.source_id);
    let mut rec = Map::new();
    if let Some(extra) = item.fields.as_object() {
        for (k, v) in extra {
            rec.insert(k.clone(), v.clone());
        }
    }
    rec.insert("id".into(), json!(id));
    rec.insert("title".into(), json!(item.title));
    rec.insert("installed".into(), json!(true));
    rec.insert(
        "installs".into(),
        json!([{ "source": source, "sourceId": item.source_id, "installed": true }]),
    );
    rec.insert(
        "traceSubject".into(),
        json!({ "namespace": "maida", "id": id }),
    );
    rec.insert("score".into(), json!(0.0));
    rec.entry("importedAt").or_insert_with(|| json!(now));
    Value::Object(rec)
}

/// Merge one source's scan into the games list.
///
/// - `Err`: the list comes back unchanged. A read failure is never "uninstalled".
/// - Each source decides `installed` only for its own installs; records with
///   no install from `source` are not touched.
/// - A reported install not yet known attaches to a same-titled record
///   (see [`find_attach_target`]) or becomes a new record
///   `id = <source>:<sourceId>`, `traceSubject = maida/<that id>`.
///
/// Order is deterministic: existing records keep their position, new records
/// are appended in scan order. The Steam snapshot has its own path (score,
/// healing, legacy shape) in `commands/steam.rs` and shares only the helpers.
// No reader ships in W1; the first caller is the Epic reader (W3).
#[allow(dead_code)]
pub fn merge_source_scan(
    existing: &[Value],
    source: &str,
    scan: Result<Vec<ScannedInstall>, String>,
    now: &str,
) -> Vec<Value> {
    let scanned = match scan {
        Ok(s) => s,
        Err(_) => return existing.to_vec(),
    };
    let mut games: Vec<Value> = existing.to_vec();
    let present: HashSet<&str> = scanned.iter().map(|s| s.source_id.as_str()).collect();

    // A) Known installs from this source: installed iff the scan reports them.
    let mut known: HashSet<String> = HashSet::new();
    for g in games.iter_mut() {
        let mine: Vec<Install> = effective_installs(g)
            .into_iter()
            .filter(|i| i.source == source)
            .collect();
        if mine.is_empty() {
            continue;
        }
        let was_installed = top_level_installed(g);
        if has_installs_field(g) {
            for i in &mine {
                set_install_state(
                    g,
                    source,
                    &i.source_id,
                    present.contains(i.source_id.as_str()),
                );
            }
            recompute_installed(g);
        } else {
            // Legacy single-install shape (Steam-only record): flag only.
            let any = mine.iter().any(|i| present.contains(i.source_id.as_str()));
            g["installed"] = json!(any);
        }
        mark_return_if_reinstalled(g, was_installed, now);
        known.extend(mine.into_iter().map(|i| i.source_id));
    }

    // B) Unknown installs: attach to a same-titled game or add a record.
    for item in &scanned {
        if known.contains(&item.source_id) {
            continue;
        }
        known.insert(item.source_id.clone());
        match find_attach_target(&games, source, &item.title) {
            Some(i) => attach_install(&mut games[i], source, &item.source_id, now),
            None => games.push(new_record(source, item, now)),
        }
    }
    games
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: &str = "2026-11-12T00:00:00+00:00";

    fn steam_rec(appid: &str, title: &str) -> Value {
        json!({
            "id": title.to_lowercase().replace(' ', "-"),
            "title": title,
            "installed": true,
            "steamAppId": appid,
            "steamUrl": format!("steam://rungameid/{}", appid),
            "score": 1.0
        })
    }

    fn item(source_id: &str, title: &str) -> ScannedInstall {
        ScannedInstall {
            source_id: source_id.to_string(),
            title: title.to_string(),
            fields: json!({}),
        }
    }

    #[test]
    fn normalize_is_trim_lowercase_collapse_only() {
        assert_eq!(normalize_title("  HaDeS \t  II  "), "hades ii");
        assert_eq!(normalize_title("ÉCLAIR"), "éclair");
        // Deliberately NOT normalised.
        assert_ne!(normalize_title("Hades: II"), normalize_title("Hades II"));
        assert_ne!(
            normalize_title("Hades (Deluxe Edition)"),
            normalize_title("Hades")
        );
        assert_eq!(normalize_title("   "), "");
    }

    #[test]
    fn failed_source_leaves_its_records_as_they_were() {
        let existing = vec![
            steam_rec("10", "Steam Game"),
            json!({"id": "manual-one", "title": "Manual", "installed": true}),
            json!({
                "id": "epic:a", "title": "Epic A", "installed": true,
                "installs": [{"source": "epic", "sourceId": "a", "installed": true}],
                "traceSubject": {"namespace": "maida", "id": "epic:a"}
            }),
        ];
        let out = merge_source_scan(
            &existing,
            "epic",
            Err("manifest dir unreadable".into()),
            NOW,
        );
        assert_eq!(out, existing);
    }

    #[test]
    fn second_source_known_title_adds_install_not_record() {
        let existing = vec![steam_rec("10", "Hades")];
        let out = merge_source_scan(&existing, "epic", Ok(vec![item("hd", "  HADES ")]), NOW);
        assert_eq!(out.len(), 1);
        let g = &out[0];
        assert_eq!(g["id"], json!("hades"));
        assert_eq!(g["steamAppId"], json!("10"));
        assert_eq!(g["installed"], json!(true));
        assert_eq!(
            g["installs"],
            json!([
                {"source": "steam", "sourceId": "10", "installed": true},
                {"source": "epic", "sourceId": "hd", "installed": true}
            ])
        );
        // Subject it had before the attach: a Steam record.
        assert_eq!(g["traceSubject"], json!({"namespace": "steam", "id": "10"}));
    }

    #[test]
    fn new_title_becomes_new_record_with_maida_subject() {
        let existing = vec![steam_rec("10", "Hades")];
        let mut it = item("abc", "Celeste");
        it.fields = json!({"installLocation": "D:/Celeste"});
        let out = merge_source_scan(&existing, "epic", Ok(vec![it]), NOW);
        assert_eq!(out.len(), 2);
        let g = &out[1];
        assert_eq!(g["id"], json!("epic:abc"));
        assert_eq!(
            g["traceSubject"],
            json!({"namespace": "maida", "id": "epic:abc"})
        );
        assert_eq!(g["installed"], json!(true));
        assert_eq!(g["score"], json!(0.0));
        assert_eq!(g["installLocation"], json!("D:/Celeste"));
        assert!(g.get("steamAppId").is_none());
    }

    #[test]
    fn same_source_with_different_id_is_never_an_attach_target() {
        let existing = vec![json!({
            "id": "epic:a", "title": "Twin", "installed": true,
            "installs": [{"source": "epic", "sourceId": "a", "installed": true}],
            "traceSubject": {"namespace": "maida", "id": "epic:a"}
        })];
        let out = merge_source_scan(
            &existing,
            "epic",
            Ok(vec![item("a", "Twin"), item("b", "Twin")]),
            NOW,
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[1]["id"], json!("epic:b"));
    }

    #[test]
    fn each_source_decides_installed_only_for_its_own_installs() {
        let mixed = json!({
            "id": "hades", "title": "Hades", "installed": true, "steamAppId": "10",
            "installs": [
                {"source": "steam", "sourceId": "10", "installed": true},
                {"source": "epic", "sourceId": "hd", "installed": true}
            ],
            "traceSubject": {"namespace": "steam", "id": "10"}
        });
        let steam_only = steam_rec("20", "Other");
        let existing = vec![mixed, steam_only.clone()];
        // Epic reports nothing: only the epic install flips.
        let out = merge_source_scan(&existing, "epic", Ok(vec![]), NOW);
        assert_eq!(
            out[0]["installs"],
            json!([
                {"source": "steam", "sourceId": "10", "installed": true},
                {"source": "epic", "sourceId": "hd", "installed": false}
            ])
        );
        assert_eq!(out[0]["installed"], json!(true));
        assert_eq!(out[1], steam_only);
    }

    #[test]
    fn last_install_gone_flips_record_and_return_sets_markers() {
        let rec = json!({
            "id": "epic:a", "title": "A", "installed": true,
            "installs": [{"source": "epic", "sourceId": "a", "installed": true}],
            "traceSubject": {"namespace": "maida", "id": "epic:a"}
        });
        let gone = merge_source_scan(&[rec], "epic", Ok(vec![]), NOW);
        assert_eq!(gone[0]["installed"], json!(false));
        assert!(gone[0].get("reinstalledAt").is_none());
        let back = merge_source_scan(&gone, "epic", Ok(vec![item("a", "A")]), NOW);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0]["installed"], json!(true));
        assert_eq!(back[0]["reinstalledAt"], json!(NOW));
        assert_eq!(
            back[0]["buffer"],
            json!({"type": "visibility", "remaining": 3})
        );
    }

    #[test]
    fn legacy_manual_entry_is_untouched_by_scans_without_a_title_match() {
        let manual = json!({"id": "my-game", "title": "My Game", "installed": true});
        let out = merge_source_scan(
            std::slice::from_ref(&manual),
            "epic",
            Ok(vec![item("x", "Something Else")]),
            NOW,
        );
        assert_eq!(out[0], manual);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn legacy_manual_entry_as_attach_target_materialises_state_and_subject() {
        let manual = json!({"id": "my-game", "title": "My Game", "installed": false});
        let out = merge_source_scan(&[manual], "epic", Ok(vec![item("x", "my  game")]), NOW);
        assert_eq!(out.len(), 1);
        let g = &out[0];
        assert_eq!(g["id"], json!("my-game"));
        assert_eq!(
            g["traceSubject"],
            json!({"namespace": "maida", "id": "my-game"})
        );
        assert_eq!(
            g["installs"],
            json!([
                {"source": "manual", "sourceId": "my-game", "installed": false},
                {"source": "epic", "sourceId": "x", "installed": true}
            ])
        );
        assert_eq!(g["installed"], json!(true));
        assert_eq!(g["reinstalledAt"], json!(NOW));
    }

    #[test]
    fn empty_title_never_matches_and_first_match_wins() {
        let games = vec![
            json!({"id": "a", "title": "", "installed": true}),
            json!({"id": "b", "title": "Same", "installed": true}),
            json!({"id": "c", "title": "same", "installed": true}),
        ];
        assert_eq!(find_attach_target(&games, "epic", ""), None);
        assert_eq!(find_attach_target(&games, "epic", "  "), None);
        assert_eq!(find_attach_target(&games, "epic", "SAME"), Some(1));
    }

    #[test]
    fn steam_source_attach_sets_steam_app_id_only_when_absent() {
        let mut rec = json!({
            "id": "epic:a", "title": "Celeste", "installed": true,
            "installs": [{"source": "epic", "sourceId": "a", "installed": true}],
            "traceSubject": {"namespace": "maida", "id": "epic:a"}
        });
        attach_install(&mut rec, "steam", "504230", NOW);
        assert_eq!(rec["steamAppId"], json!("504230"));
        assert_eq!(
            rec["traceSubject"],
            json!({"namespace": "maida", "id": "epic:a"})
        );
        assert_eq!(rec["id"], json!("epic:a"));
        assert_eq!(rec["steamUrl"], json!("steam://rungameid/504230"));
    }

    #[test]
    fn steam_source_attach_keeps_an_existing_steam_id_and_url() {
        let mut rec = json!({
            "id": "x", "title": "Celeste", "installed": false,
            "steamAppId": "111", "steamUrl": "steam://rungameid/111",
            "installs": [{"source": "epic", "sourceId": "a", "installed": false}]
        });
        attach_install(&mut rec, "steam", "222", NOW);
        assert_eq!(rec["steamAppId"], json!("111"));
        assert_eq!(rec["steamUrl"], json!("steam://rungameid/111"));
    }

    #[test]
    fn derive_trace_subject_matches_the_js_rule() {
        let cases = [
            (json!({"id": "x", "steamAppId": "10"}), ("steam", "10")),
            (json!({"id": "x", "steamAppId": 10}), ("steam", "10")),
            (json!({"id": "x", "steamAppId": null}), ("maida", "x")),
            (json!({"id": "x"}), ("maida", "x")),
            (json!({"id": "x", "steamAppId": ""}), ("steam", "")),
        ];
        for (rec, (ns, id)) in cases {
            assert_eq!(derive_trace_subject(&rec), (ns.to_string(), id.to_string()));
        }
    }
}
