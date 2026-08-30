use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::AppHandle;

use crate::persistence;
use crate::steam;

/// New layout: appcache/librarycache/{appid}/{content-hash}/{filename}.
/// Multiple hash dirs can exist (Steam re-caches art over time); pick the
/// newest by mtime that actually contains the wanted file.
fn find_newest(cache_dir: &Path, app_id: &str, filename: &str) -> Option<PathBuf> {
    let app_dir = cache_dir.join(app_id);
    let mut dirs: Vec<(SystemTime, PathBuf)> = fs::read_dir(&app_dir)
        .ok()?
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    dirs.sort_by(|a, b| b.0.cmp(&a.0));

    dirs.into_iter()
        .map(|(_, dir)| dir.join(filename))
        .find(|p| p.exists())
}

/// Legacy layout: appcache/librarycache/{appid}{suffix} (flat, no hash dir).
fn find_legacy(cache_dir: &Path, app_id: &str, suffix: &str) -> Option<PathBuf> {
    let path = cache_dir.join(format!("{}{}", app_id, suffix));
    path.exists().then_some(path)
}

/// Portrait capsule preferred, landscape header as fallback; new layout
/// probed before legacy.
fn locate_capsule(cache_dir: &Path, app_id: &str) -> Option<PathBuf> {
    find_newest(cache_dir, app_id, "library_capsule.jpg")
        .or_else(|| find_newest(cache_dir, app_id, "library_header.jpg"))
        .or_else(|| find_legacy(cache_dir, app_id, "_library_600x900.jpg"))
        .or_else(|| find_legacy(cache_dir, app_id, "_header.jpg"))
}

/// Wide hero banner (Maida 2.0 focus-dwell backdrop); new layout probed
/// before legacy flat naming. No portrait fallback — a missing hero is a
/// normal Ok(None), never substituted with the capsule.
fn locate_hero(cache_dir: &Path, app_id: &str) -> Option<PathBuf> {
    find_newest(cache_dir, app_id, "library_hero.jpg")
        .or_else(|| find_legacy(cache_dir, app_id, "_library_hero.jpg"))
}

fn locate_art(cache_dir: &Path, app_id: &str, kind: &str) -> Option<PathBuf> {
    match kind {
        "capsule" => locate_capsule(cache_dir, app_id),
        "hero" => locate_hero(cache_dir, app_id),
        // Unreachable: get_art rejects any other kind before calling this.
        _ => None,
    }
}

// Cap read/download size: a corrupt/oversized file shouldn't be base64'd
// into the IPC channel. Over-cap is treated as no-art (Ok(None)), not an
// error — same posture as any other "art not available" case.
const MAX_ART_BYTES: u64 = 5 * 1024 * 1024;

/// Read a local file into a data: URL, respecting the size cap. Any I/O
/// problem (missing, oversized, unreadable) is Ok(None)-shaped — missing
/// art is always the normal case, never an error, for any of the three
/// probe steps below.
fn read_art_as_data_url(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() > MAX_ART_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    Some(format!(
        "data:image/jpeg;base64,{}",
        STANDARD.encode(&bytes)
    ))
}

/// Path to this appid+kind's persisted CDN art cache, under the app data
/// dir (separate from Steam's own librarycache, which we never write to).
fn art_cache_path(app: &AppHandle, app_id: &str, kind: &str) -> PathBuf {
    persistence::app_data_dir(app)
        .join("art")
        .join(format!("{}_{}.jpg", app_id, kind))
}

/// Atomic write of raw image bytes: tmp file + rename (same pattern as
/// persistence::write_json, minus the JSON encoding).
fn write_art_cache(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
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

/// Candidate CDN filenames to try in order for a given art kind.
fn cdn_candidates(kind: &str) -> &'static [&'static str] {
    match kind {
        "capsule" => &["library_600x900.jpg", "header.jpg"],
        "hero" => &["library_hero.jpg"],
        _ => &[],
    }
}

/// Fetch art from Steam's own CDN as a last resort on a cache miss.
///
/// Trust posture: only Steam's own asset CDN (shared.steamstatic.com), only
/// for appids the caller already owns (the numeric-appid check in get_art
/// guards this path too), fetched at most once per appid+kind then cached
/// forever on disk, never any other host. Any network error, timeout,
/// non-200, non-image response, or oversized body is silently None — an
/// offline user must see this fail fast and quiet, not hang or error.
async fn fetch_art_from_cdn(app_id: &str, kind: &str) -> Option<Vec<u8>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;

    for filename in cdn_candidates(kind) {
        let url = format!(
            "https://shared.steamstatic.com/store_item_assets/steam/apps/{}/{}",
            app_id, filename
        );
        let Ok(resp) = client.get(&url).send().await else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        let is_image = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|ct| ct.starts_with("image/"))
            .unwrap_or(false);
        if !is_image {
            continue;
        }
        let Ok(bytes) = resp.bytes().await else {
            continue;
        };
        if bytes.len() as u64 > MAX_ART_BYTES {
            continue;
        }
        return Some(bytes.to_vec());
    }
    None
}

/// Steam art lookup: local librarycache, then a persisted CDN cache, then a
/// one-time CDN fetch. Missing art is the normal case (Steam hasn't cached
/// it, the CDN doesn't have it, or the network is unavailable) — always
/// Ok(None) for that, never an Err. An unrecognized `kind` or a malformed
/// `appId` are the only Err cases.
#[tauri::command]
pub async fn get_art(
    app: AppHandle,
    #[allow(non_snake_case)] appId: String,
    kind: String,
) -> Result<Option<String>, String> {
    if kind != "capsule" && kind != "hero" {
        return Err(format!(
            "invalid art kind: {} (expected \"capsule\" or \"hero\")",
            kind
        ));
    }

    // IPC trust boundary: appId crosses from the untrusted frontend and gets
    // joined into filesystem paths and a CDN URL below. Reject anything but
    // a plain numeric Steam appid before touching disk or network — same
    // standard as data.rs's allowlist. This guards all three steps below.
    if appId.is_empty() || !appId.chars().all(|c| c.is_ascii_digit()) {
        return Err("invalid appId".to_string());
    }

    // Step 1: local Steam librarycache probe (zero network).
    if let Some(steam_path) = steam::get_steam_path() {
        let cache_dir = steam_path.join("appcache").join("librarycache");
        if let Some(path) = locate_art(&cache_dir, &appId, &kind) {
            if let Some(data_url) = read_art_as_data_url(&path) {
                return Ok(Some(data_url));
            }
        }
    }

    // Step 2: previously CDN-fetched art, persisted in the app data dir.
    let cache_path = art_cache_path(&app, &appId, &kind);
    if let Some(data_url) = read_art_as_data_url(&cache_path) {
        return Ok(Some(data_url));
    }

    // Step 3: CDN fetch, once, then persist for every future call.
    let Some(bytes) = fetch_art_from_cdn(&appId, &kind).await else {
        return Ok(None);
    };
    if let Err(e) = write_art_cache(&cache_path, &bytes) {
        log::warn!("[capsule] failed to persist CDN art cache: {}", e);
        // Fall through and still return the freshly fetched art — a disk
        // write failure shouldn't also cost the user the cover art itself.
    }
    Ok(Some(format!(
        "data:image/jpeg;base64,{}",
        STANDARD.encode(&bytes)
    )))
}
