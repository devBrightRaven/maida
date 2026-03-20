use serde::Deserialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct TokenCache {
    access_token: Option<String>,
    expires_at: Option<Instant>,
}

static TOKEN_CACHE: Mutex<TokenCache> = Mutex::new(TokenCache {
    access_token: None,
    expires_at: None,
});

/// Get a valid access token, refreshing if expired.
pub async fn get_access_token(client_id: &str, client_secret: &str) -> Option<String> {
    if client_id.is_empty() || client_secret.is_empty() {
        log::warn!("[Twitch] Missing clientId or clientSecret");
        return None;
    }

    // Check cache
    {
        let cache = TOKEN_CACHE.lock().unwrap_or_else(|p| p.into_inner());
        if let (Some(token), Some(expires)) = (&cache.access_token, cache.expires_at) {
            if Instant::now() < expires {
                return Some(token.clone());
            }
        }
    }

    // Fetch new token
    let params = format!(
        "client_id={}&client_secret={}&grant_type=client_credentials",
        urlencoded(client_id),
        urlencoded(client_secret)
    );

    let client = reqwest::Client::new();
    let resp = client
        .post("https://id.twitch.tv/oauth2/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(params)
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            log::warn!("[Twitch] OAuth request failed: {}", e);
            clear_cache();
            return None;
        }
    };

    let status = resp.status();
    if status != 200 {
        let body = resp.text().await.unwrap_or_default();
        log::warn!("[Twitch] OAuth returned {}: {}", status, body);
        clear_cache();
        return None;
    }

    let data: TokenResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            log::warn!("[Twitch] Failed to parse OAuth response: {}", e);
            clear_cache();
            return None;
        }
    };

    // Cache with 60s early expiry
    let expires_at = Instant::now() + Duration::from_secs(data.expires_in.saturating_sub(60));
    {
        let mut cache = TOKEN_CACHE.lock().unwrap_or_else(|p| p.into_inner());
        cache.access_token = Some(data.access_token.clone());
        cache.expires_at = Some(expires_at);
    }

    Some(data.access_token)
}

pub fn clear_cache() {
    let mut cache = TOKEN_CACHE.lock().unwrap_or_else(|p| p.into_inner());
    cache.access_token = None;
    cache.expires_at = None;
}

fn urlencoded(s: &str) -> String {
    // Minimal URL encoding for client credentials
    s.replace('&', "%26").replace('=', "%3D").replace('+', "%2B")
}
