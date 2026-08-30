//! Localized Steam game titles, parsed once from appinfo.vdf and cached
//! (disk cache keyed by appinfo.vdf's mtime + an in-memory session cache on
//! top of it — same "parse once, reuse forever this run" posture as
//! capsule.rs's art cache).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::UNIX_EPOCH;
use tauri::AppHandle;

use crate::persistence;
use crate::steam;
use crate::steam::appinfo::LocalizedTitles;

static SESSION_CACHE: OnceLock<Mutex<Option<Arc<LocalizedTitles>>>> = OnceLock::new();

/// Maida locale code -> Steam's own language key (used inside appinfo.vdf's
/// common.name_localized, and equally accepted as the storefront API's `l=`
/// query param — media.rs reuses this same mapping for appdetails fetches).
/// Unrecognized locales have no Steam equivalent.
pub(crate) fn steam_lang_key(locale: &str) -> Option<&'static str> {
    match locale {
        "zh-TW" => Some("tchinese"),
        "zh-CN" => Some("schinese"),
        "ja" => Some("japanese"),
        "en" => Some("english"),
        _ => None,
    }
}

fn cache_path(app: &AppHandle) -> PathBuf {
    persistence::app_data_dir(app).join("localized-names.json")
}

fn appinfo_mtime_ms(appinfo_path: &std::path::Path) -> Option<u64> {
    fs::metadata(appinfo_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

fn cache_to_json(mtime_ms: u64, apps: &LocalizedTitles) -> Value {
    json!({ "appinfoMtimeMs": mtime_ms, "apps": apps })
}

fn cache_from_json(data: &Value, expected_mtime: u64) -> Option<LocalizedTitles> {
    if data.get("appinfoMtimeMs").and_then(|v| v.as_u64()) != Some(expected_mtime) {
        return None;
    }
    let apps = data.get("apps")?.as_object()?;
    let mut result = LocalizedTitles::new();
    for (appid, langs) in apps {
        let Some(langs_obj) = langs.as_object() else { continue };
        let mut lang_map = HashMap::new();
        for (lang, name) in langs_obj {
            if let Some(name) = name.as_str() {
                lang_map.insert(lang.clone(), name.to_string());
            }
        }
        result.insert(appid.clone(), lang_map);
    }
    Some(result)
}

/// Parse once per app run (disk cache first, gated on appinfo.vdf's mtime;
/// falls back to a fresh parse), then keep in memory for every subsequent
/// call this session.
fn load_or_parse(app: &AppHandle) -> Arc<LocalizedTitles> {
    let lock = SESSION_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().unwrap();
    if let Some(cached) = guard.as_ref() {
        return cached.clone();
    }

    let Some(steam_path) = steam::get_steam_path() else {
        let empty = Arc::new(LocalizedTitles::new());
        *guard = Some(empty.clone());
        return empty;
    };
    let appinfo_path = steam_path.join("appcache").join("appinfo.vdf");
    let mtime_ms = appinfo_mtime_ms(&appinfo_path);

    if let Some(mtime) = mtime_ms {
        if let Some(stored) = persistence::read_json(&cache_path(app)) {
            if let Some(apps) = cache_from_json(&stored, mtime) {
                let apps = Arc::new(apps);
                *guard = Some(apps.clone());
                return apps;
            }
        }
    }

    let apps = crate::steam::appinfo::parse_appinfo_file(&appinfo_path);
    if let Some(mtime) = mtime_ms {
        let data = cache_to_json(mtime, &apps);
        if let Err(e) = persistence::write_json(&cache_path(app), &data) {
            log::warn!("[titles] failed to persist localized-names cache: {}", e);
        }
    }
    let apps = Arc::new(apps);
    *guard = Some(apps.clone());
    apps
}

/// Returns only appids that have a name in `lang`; missing entries are left
/// out entirely so the frontend falls back to its own title for those.
#[tauri::command]
pub fn get_localized_titles(
    app: AppHandle,
    #[allow(non_snake_case)] appIds: Vec<String>,
    lang: String,
) -> HashMap<String, String> {
    let Some(lang_key) = steam_lang_key(&lang) else {
        return HashMap::new();
    };
    let titles = load_or_parse(&app);

    appIds
        .iter()
        .filter(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()))
        .filter_map(|id| {
            titles
                .get(id)
                .and_then(|langs| langs.get(lang_key))
                .map(|name| (id.clone(), name.clone()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_steam_lang_key_mapping() {
        assert_eq!(steam_lang_key("zh-TW"), Some("tchinese"));
        assert_eq!(steam_lang_key("zh-CN"), Some("schinese"));
        assert_eq!(steam_lang_key("ja"), Some("japanese"));
        assert_eq!(steam_lang_key("en"), Some("english"));
    }

    #[test]
    fn test_steam_lang_key_unknown_locale() {
        assert_eq!(steam_lang_key("fr"), None);
        assert_eq!(steam_lang_key(""), None);
        assert_eq!(steam_lang_key("EN"), None); // case-sensitive on purpose: matches Maida's own locale codes
    }

    #[test]
    fn test_cache_json_round_trip() {
        let mut apps = LocalizedTitles::new();
        let mut langs = HashMap::new();
        langs.insert("tchinese".to_string(), "測試".to_string());
        apps.insert("730".to_string(), langs);

        let json = cache_to_json(123456, &apps);
        let restored = cache_from_json(&json, 123456).expect("mtime should match");
        assert_eq!(
            restored.get("730").and_then(|l| l.get("tchinese")),
            Some(&"測試".to_string())
        );
    }

    #[test]
    fn test_cache_json_stale_mtime_rejected() {
        let apps = LocalizedTitles::new();
        let json = cache_to_json(123456, &apps);
        assert!(cache_from_json(&json, 999999).is_none());
    }
}
