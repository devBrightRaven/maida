use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "maida-igdb";
const USERNAME: &str = "igdb-credentials";

#[derive(Serialize, Deserialize, Debug)]
pub struct IgdbCredentials {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "clientSecret")]
    pub client_secret: String,
}

/// Save IGDB credentials to the system keyring.
pub fn save(client_id: &str, client_secret: &str) -> Result<(), String> {
    if client_id.is_empty() || client_secret.is_empty() {
        return Err("Missing clientId or clientSecret".to_string());
    }

    let creds = IgdbCredentials {
        client_id: client_id.to_string(),
        client_secret: client_secret.to_string(),
    };

    let json = serde_json::to_string(&creds).map_err(|e| e.to_string())?;

    let entry =
        keyring::Entry::new(SERVICE_NAME, USERNAME).map_err(|e| format!("keyring init: {}", e))?;
    entry
        .set_password(&json)
        .map_err(|e| format!("keyring save: {}", e))?;

    log::info!("[Credentials] Saved to system keyring");
    Ok(())
}

/// Load IGDB credentials from the system keyring.
pub fn load() -> Option<IgdbCredentials> {
    let entry = keyring::Entry::new(SERVICE_NAME, USERNAME).ok()?;
    let json = entry.get_password().ok()?;
    serde_json::from_str(&json).ok()
}

/// Clear stored IGDB credentials.
pub fn clear() -> Result<(), String> {
    let entry =
        keyring::Entry::new(SERVICE_NAME, USERNAME).map_err(|e| format!("keyring init: {}", e))?;
    match entry.delete_credential() {
        Ok(_) => {
            log::info!("[Credentials] Cleared from system keyring");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()), // Already gone
        Err(e) => Err(format!("keyring clear: {}", e)),
    }
}
