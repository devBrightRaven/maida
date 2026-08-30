//! Official Steam screenshots + microtrailer metadata (Maida 2.0 focus-
//! expansion). Same trust posture as capsule.rs: only Steam's own storefront
//! API and CDN, only for appids the caller already owns, fetched at most
//! once per appid then cached forever (including negative results, so an
//! offline retry never re-hits the network).
//!
//! Product red line: appdetails carries a LOT more than media (price,
//! discounts, release date, age rating...). `extract_media` is the sole
//! extraction point and is a hard whitelist — screenshots + movie only. Do
//! not widen `MediaInfo` to pass more of the raw response through.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;

use crate::commands::titles::steam_lang_key;
use crate::persistence;

const MAX_SCREENSHOTS: usize = 4;
// Same cap as capsule.rs's art fetch — a corrupt/oversized body shouldn't be
// base64'd into the IPC channel.
const MAX_MEDIA_BYTES: u64 = 5 * 1024 * 1024;
// Cache schema marker (see is_stale_media_cache). Bump whenever a field is
// added to MovieInfo/MediaInfo that an on-disk cache from an older build
// wouldn't carry — that forces one silent refetch per appid instead of the
// stale shape sticking around forever.
const MEDIA_CACHE_VERSION: u64 = 2;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MovieInfo {
    // Legacy-forward: current live appdetails responses no longer carry a
    // bare mp4 object (see extract_media doc below), but an older cached
    // snapshot or a future Valve response might.
    #[serde(default)]
    pub mp4_480: Option<String>,
    #[serde(default)]
    pub mp4_max: Option<String>,
    #[serde(default)]
    pub hls_h264: Option<String>,
    #[serde(default)]
    pub dash_h264: Option<String>,
    #[serde(default)]
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MediaInfo {
    #[serde(default)]
    pub screenshots: Vec<String>,
    #[serde(default)]
    pub movie: Option<MovieInfo>,
}

/// The whitelist extraction point (see module doc). Pure and side-effect
/// free so it's directly unit-testable against inline JSON fixtures.
/// None means "no usable data" — malformed shape, or Steam reporting
/// success:false (delisted / not a store page). An app with a real page but
/// zero screenshots/movie still returns Some(empty MediaInfo).
fn extract_media(app_id: &str, body: &Value) -> Option<MediaInfo> {
    let entry = body.get(app_id)?;
    if entry.get("success").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let data = entry.get("data")?;

    let screenshots = data
        .get("screenshots")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|s| s.get("path_full").and_then(Value::as_str))
                .take(MAX_SCREENSHOTS)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    // Current live appdetails responses carry DASH/HLS manifests
    // (dash_av1 / dash_h264 / hls_h264) for movies[0] instead of, or
    // alongside, the plain mp4.480 / mp4.max pair. hls_h264 is what the
    // frontend plays (via hls.js); dash_h264 is captured for completeness
    // but has no player on the frontend today, so a movie with only
    // dash_h264 still falls through to the screenshot slideshow there.
    // mp4_480/mp4_max stay whitelisted too — legacy-forward, in case Valve
    // ever restores a bare `mp4` object or an older cached snapshot has one.
    let movie = data
        .get("movies")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(|m| {
            let mp4 = m.get("mp4");
            let mp4_480 = mp4
                .and_then(|v| v.get("480"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let mp4_max = mp4
                .and_then(|v| v.get("max"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let hls_h264 = m.get("hls_h264").and_then(Value::as_str).map(str::to_string);
            let dash_h264 = m.get("dash_h264").and_then(Value::as_str).map(str::to_string);
            if mp4_480.is_none() && mp4_max.is_none() && hls_h264.is_none() && dash_h264.is_none() {
                return None;
            }
            let thumbnail = m
                .get("thumbnail")
                .and_then(Value::as_str)
                .map(str::to_string);
            Some(MovieInfo {
                mp4_480,
                mp4_max,
                hls_h264,
                dash_h264,
                thumbnail,
            })
        });

    Some(MediaInfo { screenshots, movie })
}

/// True when a cached media.rs JSON blob predates MEDIA_CACHE_VERSION AND
/// has no movie data to show for it — i.e. it could be a pre-hls cache that
/// silently ate a real trailer as "no movie". Refetch once in that case;
/// once refetched the write helpers stamp the current version so this never
/// re-triggers for an appid that genuinely has no movie.
fn is_stale_media_cache(cached: &Value) -> bool {
    let has_movie = cached.get("movie").map(|m| !m.is_null()).unwrap_or(false);
    let current_version = cached.get("v").and_then(Value::as_u64) == Some(MEDIA_CACHE_VERSION);
    !has_movie && !current_version
}

fn media_cache_path(app: &AppHandle, app_id: &str) -> PathBuf {
    persistence::app_data_dir(app)
        .join("media")
        .join(format!("{}.json", app_id))
}

fn screenshot_cache_path(app: &AppHandle, app_id: &str, index: usize) -> PathBuf {
    persistence::app_data_dir(app)
        .join("media")
        .join(format!("{}_ss{}.jpg", app_id, index))
}

/// Same tmp+rename atomic write as capsule.rs's write_art_cache, duplicated
/// here rather than shared across modules — each caller's cache path shape
/// is different and the pattern is 10 lines.
fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)
}

fn read_image_as_data_url(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() > MAX_MEDIA_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    Some(format!(
        "data:image/jpeg;base64,{}",
        STANDARD.encode(&bytes)
    ))
}

/// Fetch + extract, once. `Err(())` means the round-trip itself failed
/// (client build, send, non-200 incl. 429, unparseable body) — a transport
/// problem that should NOT be cached, so a later dwell retries. `Ok(None)`
/// means Steam actually answered and said there's nothing to show
/// (success:false, or a page with no screenshots/movie) — that IS the
/// negative result callers may cache forever.
async fn fetch_and_extract(app_id: &str, lang: &str) -> Result<Option<MediaInfo>, ()> {
    let lang_key = steam_lang_key(lang).unwrap_or("english");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| ())?;
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&l={}",
        app_id, lang_key
    );
    let resp = client.get(&url).send().await.map_err(|_| ())?;
    if !resp.status().is_success() {
        return Err(());
    }
    let body: Value = resp.json().await.map_err(|_| ())?;
    Ok(extract_media(app_id, &body))
}

/// Whitelist for screenshot URLs pulled from Steam metadata/cache before
/// they're fetched: https only, and only Steam's own CDN hosts. Guards
/// against a poisoned/corrupt cache entry sending this app's network client
/// somewhere unexpected.
fn is_trusted_media_url(url_str: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url_str) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    match parsed.host_str() {
        Some(host) => host == "steamcdn-a.akamaihd.net" || host.ends_with(".steamstatic.com"),
        None => false,
    }
}

fn validate_app_id(app_id: &str) -> Result<(), String> {
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("invalid appId".to_string());
    }
    Ok(())
}

/// Shared write path for both get_game_media and get_screenshot's own
/// fetch-if-missing branch, so every write stamps the current schema
/// version (see is_stale_media_cache) — whichever command fetches first.
fn write_media_cache(app: &AppHandle, app_id: &str, info: &MediaInfo) {
    let mut value = serde_json::to_value(info).unwrap_or_else(|_| json!({}));
    if let Value::Object(map) = &mut value {
        map.insert("v".to_string(), json!(MEDIA_CACHE_VERSION));
    }
    if let Err(e) = persistence::write_json(&media_cache_path(app, app_id), &value) {
        log::warn!("[media] failed to persist media cache: {}", e);
    }
}

fn write_negative_media_cache(app: &AppHandle, app_id: &str) {
    let value = json!({ "none": true, "v": MEDIA_CACHE_VERSION });
    if let Err(e) = persistence::write_json(&media_cache_path(app, app_id), &value) {
        log::warn!("[media] failed to persist negative media cache: {}", e);
    }
}

/// Screenshot + microtrailer metadata for one appid. Cached forever on
/// disk (success or negative) — never re-fetched once resolved this
/// install.
#[tauri::command]
pub async fn get_game_media(
    app: AppHandle,
    #[allow(non_snake_case)] appId: String,
    lang: String,
) -> Result<Option<MediaInfo>, String> {
    validate_app_id(&appId)?;

    if let Some(cached) = persistence::read_json(&media_cache_path(&app, &appId)) {
        if !is_stale_media_cache(&cached) {
            if cached.get("none").and_then(Value::as_bool) == Some(true) {
                return Ok(None);
            }
            if let Ok(info) = serde_json::from_value::<MediaInfo>(cached) {
                return Ok(Some(info));
            }
        }
        // Corrupt, or stale pre-hls (or otherwise old-shape) cache: fall
        // through and refetch.
    }

    match fetch_and_extract(&appId, &lang).await {
        Ok(Some(info)) => {
            write_media_cache(&app, &appId, &info);
            Ok(Some(info))
        }
        Ok(None) => {
            write_negative_media_cache(&app, &appId);
            Ok(None)
        }
        Err(()) => Ok(None), // transport failure: no cache write, so a later dwell retries
    }
}

/// One screenshot image, downloaded + cached on first request. Reuses
/// get_game_media's cached URL list when available; fetches fresh (English)
/// metadata if called before get_game_media ever ran for this appid.
#[tauri::command]
pub async fn get_screenshot(
    app: AppHandle,
    #[allow(non_snake_case)] appId: String,
    index: usize,
) -> Result<Option<String>, String> {
    validate_app_id(&appId)?;
    if index >= MAX_SCREENSHOTS {
        return Err(format!(
            "invalid screenshot index: {} (expected 0..{})",
            index, MAX_SCREENSHOTS
        ));
    }

    let image_path = screenshot_cache_path(&app, &appId, index);
    if let Some(data_url) = read_image_as_data_url(&image_path) {
        return Ok(Some(data_url));
    }

    let media_cache = media_cache_path(&app, &appId);
    let cached = persistence::read_json(&media_cache);
    let info = match &cached {
        Some(v) if v.get("none").and_then(Value::as_bool) == Some(true) => return Ok(None),
        Some(v) => serde_json::from_value::<MediaInfo>(v.clone()).ok(),
        None => None,
    };
    let info = match info {
        Some(i) => i,
        None => {
            // Transient fetch only (M7): hardcoded "en" here would poison
            // language-specific movie URLs if persisted. Only get_game_media
            // (called with the real locale) writes media_cache_path.
            match fetch_and_extract(&appId, "en").await {
                Ok(Some(fresh)) => fresh,
                Ok(None) | Err(()) => return Ok(None),
            }
        }
    };

    let Some(url) = info.screenshots.get(index) else {
        return Ok(None);
    };
    if !is_trusted_media_url(url) {
        return Ok(None);
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let Ok(resp) = client.get(url).send().await else {
        return Ok(None);
    };
    if !resp.status().is_success() {
        return Ok(None);
    }
    let is_image = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.starts_with("image/"))
        .unwrap_or(false);
    if !is_image {
        return Ok(None);
    }
    // Content-Length precheck: bail before reading the body when the server
    // announces an oversized response. The post-read len check below stays
    // as a backstop for chunked responses with no Content-Length header.
    if resp.content_length().is_some_and(|len| len > MAX_MEDIA_BYTES) {
        return Ok(None);
    }
    let Ok(bytes) = resp.bytes().await else {
        return Ok(None);
    };
    if bytes.len() as u64 > MAX_MEDIA_BYTES {
        return Ok(None);
    }

    if let Err(e) = write_bytes_atomic(&image_path, &bytes) {
        log::warn!("[media] failed to persist screenshot cache: {}", e);
    }
    Ok(Some(format!(
        "data:image/jpeg;base64,{}",
        STANDARD.encode(&bytes)
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_with_movie() -> Value {
        json!({
            "730": {
                "success": true,
                "data": {
                    "price_overview": { "final": 999 }, // red-line trap: must never surface in MediaInfo
                    "release_date": { "date": "21 Aug, 2012" },
                    "screenshots": [
                        { "id": 0, "path_thumbnail": "https://x/thumb0.jpg", "path_full": "https://x/ss0.jpg" },
                        { "id": 1, "path_thumbnail": "https://x/thumb1.jpg", "path_full": "https://x/ss1.jpg" },
                        { "id": 2, "path_thumbnail": "https://x/thumb2.jpg", "path_full": "https://x/ss2.jpg" },
                        { "id": 3, "path_thumbnail": "https://x/thumb3.jpg", "path_full": "https://x/ss3.jpg" },
                        { "id": 4, "path_thumbnail": "https://x/thumb4.jpg", "path_full": "https://x/ss4.jpg" }
                    ],
                    "movies": [
                        {
                            "id": 1,
                            "name": "Trailer",
                            "thumbnail": "https://x/movie.jpg",
                            "mp4": { "480": "https://x/movie480.mp4", "max": "https://x/movie_max.mp4" },
                            "highlight": true
                        }
                    ]
                }
            }
        })
    }

    #[test]
    fn test_extract_media_with_movie() {
        let info = extract_media("730", &fixture_with_movie()).expect("should extract");
        assert_eq!(info.screenshots.len(), 4, "truncated to MAX_SCREENSHOTS");
        assert_eq!(info.screenshots[0], "https://x/ss0.jpg");
        let movie = info.movie.expect("movie present");
        assert_eq!(movie.mp4_480.as_deref(), Some("https://x/movie480.mp4"));
        assert_eq!(movie.mp4_max.as_deref(), Some("https://x/movie_max.mp4"));
        assert_eq!(movie.thumbnail.as_deref(), Some("https://x/movie.jpg"));
    }

    #[test]
    fn test_extract_media_never_leaks_price_or_release_date() {
        let value = serde_json::to_value(
            extract_media("730", &fixture_with_movie()).expect("should extract"),
        )
        .unwrap();
        let dumped = value.to_string();
        assert!(!dumped.contains("price_overview"));
        assert!(!dumped.contains("release_date"));
        assert!(!dumped.contains("999"));
    }

    #[test]
    fn test_extract_media_hls_dash_manifest_present() {
        // Today's live shape: movies[0] carries dash/hls manifests, no bare
        // mp4 object. hls_h264/dash_h264 must be captured, not dropped.
        let body = json!({
            "730": {
                "success": true,
                "data": {
                    "screenshots": [
                        { "id": 0, "path_full": "https://x/ss0.jpg" }
                    ],
                    "movies": [
                        {
                            "id": 1,
                            "name": "Trailer",
                            "thumbnail": "https://x/movie.jpg",
                            "dash_h264": "https://x/dash_h264.mpd",
                            "hls_h264": "https://x/hls.m3u8"
                        }
                    ]
                }
            }
        });
        let info = extract_media("730", &body).expect("should extract");
        assert_eq!(info.screenshots, vec!["https://x/ss0.jpg".to_string()]);
        let movie = info.movie.expect("movie present");
        assert_eq!(movie.hls_h264.as_deref(), Some("https://x/hls.m3u8"));
        assert_eq!(movie.dash_h264.as_deref(), Some("https://x/dash_h264.mpd"));
        assert!(movie.mp4_480.is_none());
        assert!(movie.mp4_max.is_none());
    }

    #[test]
    fn test_extract_media_manifest_absent_falls_back_to_none() {
        // movies[0] exists (has a thumbnail) but carries no playable
        // manifest at all — genuinely nothing to play, should stay None.
        let body = json!({
            "730": {
                "success": true,
                "data": {
                    "screenshots": [],
                    "movies": [
                        { "id": 1, "name": "Trailer", "thumbnail": "https://x/movie.jpg" }
                    ]
                }
            }
        });
        let info = extract_media("730", &body).expect("should extract");
        assert!(info.movie.is_none());
    }

    #[test]
    fn test_extract_media_no_movies_field() {
        let body = json!({
            "730": {
                "success": true,
                "data": { "screenshots": [] }
            }
        });
        let info = extract_media("730", &body).expect("should extract");
        assert!(info.screenshots.is_empty());
        assert!(info.movie.is_none());
    }

    #[test]
    fn test_extract_media_malformed_success_false() {
        let body = json!({ "730": { "success": false } });
        assert!(extract_media("730", &body).is_none());
    }

    #[test]
    fn test_extract_media_malformed_missing_appid() {
        let body = json!({ "440": { "success": true, "data": {} } });
        assert!(extract_media("730", &body).is_none());
    }

    #[test]
    fn test_extract_media_malformed_missing_data() {
        let body = json!({ "730": { "success": true } });
        assert!(extract_media("730", &body).is_none());
    }

    #[test]
    fn test_extract_media_malformed_not_json_object() {
        let body = json!("not an object");
        assert!(extract_media("730", &body).is_none());
    }

    #[test]
    fn test_validate_app_id() {
        assert!(validate_app_id("730").is_ok());
        assert!(validate_app_id("").is_err());
        assert!(validate_app_id("abc").is_err());
        assert!(validate_app_id("73-0").is_err());
    }

    #[test]
    fn test_media_info_cache_round_trip() {
        let info = extract_media("730", &fixture_with_movie()).unwrap();
        let value = serde_json::to_value(&info).unwrap();
        let restored: MediaInfo = serde_json::from_value(value).unwrap();
        assert_eq!(info, restored);
    }

    #[test]
    fn test_is_stale_media_cache_pre_hls_shape_with_no_movie_is_stale() {
        // Pre-hls cache written back when a movie with only hls/dash
        // manifests silently resolved to `movie: null`, and no version
        // marker existed yet — must be treated as stale so it refetches.
        let cached = json!({ "screenshots": ["https://x/ss0.jpg"], "movie": null });
        assert!(is_stale_media_cache(&cached));
    }

    #[test]
    fn test_is_stale_media_cache_negative_pre_version_is_stale() {
        let cached = json!({ "none": true });
        assert!(is_stale_media_cache(&cached));
    }

    #[test]
    fn test_is_stale_media_cache_versioned_with_no_movie_is_not_stale() {
        // Refetched under the current schema and genuinely has no movie —
        // must NOT refetch forever.
        let cached = json!({ "screenshots": [], "movie": null, "v": MEDIA_CACHE_VERSION });
        assert!(!is_stale_media_cache(&cached));
    }

    #[test]
    fn test_is_stale_media_cache_with_movie_present_is_not_stale() {
        let cached = json!({
            "screenshots": [],
            "movie": { "hls_h264": "https://x/hls.m3u8" }
        });
        assert!(!is_stale_media_cache(&cached));
    }
}
