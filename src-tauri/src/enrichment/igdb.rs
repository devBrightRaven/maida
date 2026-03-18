use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

static LAST_REQUEST: Mutex<Option<Instant>> = Mutex::const_new(None);

/// Enforce 250ms minimum gap between IGDB requests (4 req/s limit).
async fn rate_limit() {
    let mut last = LAST_REQUEST.lock().await;
    if let Some(prev) = *last {
        let elapsed = prev.elapsed();
        if elapsed < Duration::from_millis(250) {
            tokio::time::sleep(Duration::from_millis(250) - elapsed).await;
        }
    }
    *last = Some(Instant::now());
}

/// POST to IGDB API with Apicalypse query.
async fn igdb_post(endpoint: &str, body: &str, client_id: &str, access_token: &str) -> Option<Vec<Value>> {
    rate_limit().await;

    let url = format!("https://api.igdb.com/v4/{}", endpoint);

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "text/plain")
        .body(body.to_string())
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            log::warn!("[IGDB] Request failed: {}", e);
            return None;
        }
    };

    if resp.status() != 200 {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        log::warn!("[IGDB] API {} returned {}", endpoint, status);
        log::warn!("[IGDB] Query: {}", body);
        log::warn!("[IGDB] Response: {}", &text[..text.len().min(300)]);
        return None;
    }

    match resp.json().await {
        Ok(v) => Some(v),
        Err(e) => {
            log::warn!("[IGDB] Failed to parse response: {}", e);
            None
        }
    }
}

/// Fetch time-to-beat data for a game.
/// Strategy: Steam appId → external_games → game_time_to_beats
/// Fallback: title search → game_time_to_beats
pub async fn fetch_time_to_beat(
    steam_app_id: &str,
    title: &str,
    client_id: &str,
    access_token: &str,
) -> Option<Value> {
    if access_token.is_empty() || client_id.is_empty() {
        return None;
    }

    let mut igdb_game_id: Option<i64> = None;

    // Step 1: Lookup by Steam appId
    if !steam_app_id.is_empty() {
        let query = format!(
            "fields game; where uid = \"{}\" & category = 1; limit 1;",
            steam_app_id
        );
        if let Some(results) = igdb_post("external_games", &query, client_id, access_token).await {
            if let Some(first) = results.first() {
                igdb_game_id = first.get("game").and_then(|g| g.as_i64());
            }
        }
    }

    // Step 2: Fallback to title search
    if igdb_game_id.is_none() && !title.is_empty() {
        let escaped = title.replace('"', "\\\"");
        let query = format!("fields id; search \"{}\"; limit 1;", escaped);
        if let Some(results) = igdb_post("games", &query, client_id, access_token).await {
            if let Some(first) = results.first() {
                igdb_game_id = first.get("id").and_then(|g| g.as_i64());
            }
        }
    }

    let game_id = igdb_game_id?;

    // Step 3: Query game_time_to_beats
    let query = format!(
        "fields hastily,normally,completely; where game_id = {}; limit 1;",
        game_id
    );
    let results = igdb_post("game_time_to_beats", &query, client_id, access_token).await?;
    let data = results.first()?;

    let hastily = data.get("hastily").and_then(|v| v.as_i64());
    let normally = data.get("normally").and_then(|v| v.as_i64());
    let completely = data.get("completely").and_then(|v| v.as_i64());

    if hastily.is_none() && normally.is_none() && completely.is_none() {
        return None;
    }

    Some(json!({
        "hastily": hastily,
        "normally": normally,
        "completely": completely
    }))
}

/// Enrich a list of games with IGDB time-to-beat data.
/// Only enriches games that don't already have IGDB data.
pub async fn enrich_games(
    games: &mut Vec<Value>,
    client_id: &str,
    access_token: &str,
) {
    log::info!("[IGDB] Enrichment starting for {} games", games.len());

    for game in games.iter_mut() {
        // Skip if already enriched
        if game.get("igdb").is_some() {
            continue;
        }

        let steam_app_id = game.get("steamAppId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let title = game.get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if steam_app_id.is_empty() && title.is_empty() {
            continue;
        }

        if let Some(ttb) = fetch_time_to_beat(steam_app_id, title, client_id, access_token).await {
            game["igdb"] = json!({
                "timeToBeat": ttb,
                "enrichedAt": chrono::Utc::now().to_rfc3339()
            });
        }
    }

    log::info!("[IGDB] Enrichment complete.");
}
