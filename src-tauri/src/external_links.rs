use tauri::Url;

fn validate_url(value: &str) -> Result<Url, String> {
    if value.len() > 4096 || value.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') {
        return Err("网址无效。".into());
    }
    let url = Url::parse(value).map_err(|_| "网址无效。")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some()
    {
        return Err("只支持普通网页地址。".into());
    }
    Ok(url)
}

#[tauri::command]
pub fn desktop_open_web_url(url: String) -> Result<(), String> {
    let url = validate_url(&url)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(url.as_str())
            .spawn()
            .map_err(|_| "浏览器打开失败，请重试。".to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Err("请在 Windows 客户端打开网页。".into())
    }
}

#[cfg(test)]
mod tests {
    use super::validate_url;

    #[test]
    fn permits_web_addresses_and_preserves_query_and_fragment() {
        let value = "https://example.com/watch?v=one&lang=zh#comments";
        assert_eq!(validate_url(value).unwrap().as_str(), value);
        assert!(validate_url("http://example.com:8080/path").is_ok());
        assert!(validate_url("https://例子.中国/页面").is_ok());
    }

    #[test]
    fn rejects_other_protocols_and_embedded_credentials() {
        for value in ["javascript:alert(1)", "file:///C:/Windows/system32/cmd.exe", "data:text/html,test", "ms-settings:privacy", "ftp://example.com/file", "https://user:password@example.com/", "https://user@example.com/"] {
            assert!(validate_url(value).is_err(), "{value}");
        }
    }

    #[test]
    fn rejects_malformed_or_ambiguous_input() {
        for value in ["not a url", "https://", "https://example.com\n", "https://example.com/white space", "https://example.com\\path"] {
            assert!(validate_url(value).is_err(), "{value}");
        }
        assert!(validate_url(&format!("https://example.com/{}", "x".repeat(4096))).is_err());
    }
}
