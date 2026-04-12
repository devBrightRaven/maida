use chrono::Local;
use serde_json::Value;

const DECAY_RATE: f64 = 0.8;

/// Apply daily decay to all game scores if the last decay was on a different day.
/// Mutates the games data in place. Returns true if decay was applied.
pub fn apply_daily_decay(data: &mut Value) -> bool {
    let today = Local::now().format("%Y-%m-%d").to_string();

    let last_decay = data
        .get("lastDecayAt")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if last_decay == today {
        return false;
    }

    if let Some(games) = data.get_mut("games").and_then(|g| g.as_array_mut()) {
        for game in games.iter_mut() {
            if let Some(score) = game.get("score").and_then(|s| s.as_f64()) {
                // Both positive and negative scores decay toward 0.
                // No clamping — decay is entropy, not intervention.
                let decayed = score * DECAY_RATE;
                game["score"] = serde_json::json!(decayed);
            }
        }
    }

    data["lastDecayAt"] = serde_json::json!(today);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_games(scores: &[f64], last_decay: &str) -> Value {
        let games: Vec<Value> = scores.iter().enumerate().map(|(i, &s)| {
            json!({"id": format!("g{}", i), "title": format!("Game {}", i), "score": s, "installed": true})
        }).collect();
        json!({"games": games, "lastDecayAt": last_decay})
    }

    #[test]
    fn test_decay_positive_scores() {
        let mut data = make_games(&[10.0, 5.0, 1.0], "2020-01-01");
        let applied = apply_daily_decay(&mut data);
        assert!(applied);

        let games = data["games"].as_array().unwrap();
        assert_eq!(games[0]["score"].as_f64().unwrap(), 8.0); // 10 * 0.8
        assert_eq!(games[1]["score"].as_f64().unwrap(), 4.0); // 5 * 0.8
        assert_eq!(games[2]["score"].as_f64().unwrap(), 0.8); // 1 * 0.8
    }

    #[test]
    fn test_decay_negative_scores_toward_zero() {
        let mut data = make_games(&[-5.0, -2.0], "2020-01-01");
        apply_daily_decay(&mut data);

        let games = data["games"].as_array().unwrap();
        assert_eq!(games[0]["score"].as_f64().unwrap(), -4.0); // -5 * 0.8
        assert_eq!(games[1]["score"].as_f64().unwrap(), -1.6); // -2 * 0.8
    }

    #[test]
    fn test_no_decay_same_day() {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut data = make_games(&[10.0], &today);
        let applied = apply_daily_decay(&mut data);
        assert!(!applied);

        let games = data["games"].as_array().unwrap();
        assert_eq!(games[0]["score"].as_f64().unwrap(), 10.0); // unchanged
    }

    #[test]
    fn test_decay_sets_today() {
        let mut data = make_games(&[1.0], "2020-01-01");
        apply_daily_decay(&mut data);

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        assert_eq!(data["lastDecayAt"].as_str().unwrap(), today);
    }

    #[test]
    fn test_decay_no_last_date() {
        let mut data = json!({"games": [{"id": "g1", "score": 10.0}]});
        let applied = apply_daily_decay(&mut data);
        assert!(applied);
        assert_eq!(data["games"][0]["score"].as_f64().unwrap(), 8.0);
    }
}
