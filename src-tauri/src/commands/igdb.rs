use serde_json::{json, Value};

use crate::credentials;
use crate::enrichment;

#[tauri::command]
pub async fn save_igdb_credentials(
    #[allow(non_snake_case)] clientId: String,
    #[allow(non_snake_case)] clientSecret: String,
) -> Value {
    match credentials::save(&clientId, &clientSecret) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

#[tauri::command]
pub fn load_igdb_credentials() -> Value {
    match credentials::load() {
        Some(creds) => json!({
            "clientId": creds.client_id,
            "hasSecret": true
        }),
        None => Value::Null,
    }
}

#[tauri::command]
pub async fn test_igdb_credentials(
    #[allow(non_snake_case)] clientId: String,
    #[allow(non_snake_case)] clientSecret: String,
) -> Value {
    match enrichment::twitch::get_access_token(&clientId, &clientSecret).await {
        Some(_) => json!({ "success": true }),
        None => json!({ "success": false, "error": "Connection failed. Check your credentials." }),
    }
}

#[tauri::command]
pub fn clear_igdb_credentials() -> Value {
    enrichment::twitch::clear_cache();
    match credentials::clear() {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}
