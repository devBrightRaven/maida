use regex::Regex;

/// Extract a field value from VDF/ACF content using regex.
/// Matches: "fieldname"  "value"
pub fn extract_field(content: &str, field: &str) -> Option<String> {
    let pattern = format!(r#""{field}"\s+"([^"]+)""#);
    let re = Regex::new(&pattern).ok()?;
    re.captures(content).map(|c| c[1].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_appid() {
        let acf = r#"
"AppState"
{
    "appid"		"570"
    "Universe"		"1"
    "name"		"Dota 2"
    "StateFlags"		"4"
}
"#;
        assert_eq!(extract_field(acf, "appid"), Some("570".to_string()));
        assert_eq!(extract_field(acf, "name"), Some("Dota 2".to_string()));
    }

    #[test]
    fn test_extract_with_tabs() {
        let acf = "\"appid\"\t\t\"12345\"\n\"name\"\t\t\"Test Game\"";
        assert_eq!(extract_field(acf, "appid"), Some("12345".to_string()));
        assert_eq!(extract_field(acf, "name"), Some("Test Game".to_string()));
    }

    #[test]
    fn test_extract_unicode_name() {
        let acf = "\"appid\"\t\"999\"\n\"name\"\t\"嗜血印 Bloody Spell\"";
        assert_eq!(extract_field(acf, "name"), Some("嗜血印 Bloody Spell".to_string()));
    }

    #[test]
    fn test_extract_missing_field() {
        let acf = "\"appid\"\t\"123\"";
        assert_eq!(extract_field(acf, "name"), None);
    }

    #[test]
    fn test_extract_from_libraryfolders() {
        let vdf = r#"
"libraryfolders"
{
    "0"
    {
        "path"		"C:\\Program Files (x86)\\Steam"
    }
    "1"
    {
        "path"		"D:\\SteamLibrary"
    }
}
"#;
        assert_eq!(extract_field(vdf, "path"), Some("C:\\\\Program Files (x86)\\\\Steam".to_string()));
    }
}
