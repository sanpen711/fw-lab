use tauri::Url;

fn validate_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "付款地址无效。")?;
    let app_ids: Vec<_> = url.query_pairs().filter(|(key, _)| key == "app_id").collect();
    let methods: Vec<_> = url.query_pairs().filter(|(key, _)| key == "method").collect();
    if url.scheme() != "https" || url.host_str() != Some("openapi.alipay.com")
        || url.port().is_some() || !url.username().is_empty() || url.password().is_some()
        || url.path() != "/gateway.do" || url.fragment().is_some()
        || app_ids.len() != 1 || app_ids[0].1 != "2021007104686921"
        || methods.len() != 1 || methods[0].1 != "alipay.trade.page.pay"
    {
        return Err("付款地址校验失败，请重新查询订单。".into());
    }
    Ok(url)
}

#[tauri::command]
pub fn desktop_open_alipay(url: String) -> Result<(), String> {
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
        Err("请在 Windows 客户端打开支付宝付款页。".into())
    }
}

#[cfg(test)]
mod tests {
    use super::validate_url;
    #[test]
    fn only_official_page_pay_is_allowed() {
        let query = "app_id=2021007104686921&method=alipay.trade.page.pay";
        assert!(validate_url(&format!("https://openapi.alipay.com/gateway.do?{query}")).is_ok());
        for base in ["http://openapi.alipay.com", "https://openapi.alipay.com.evil.test", "https://user@openapi.alipay.com", "https://openapi.alipay.com:8443"] {
            assert!(validate_url(&format!("{base}/gateway.do?{query}")).is_err());
        }
        assert!(validate_url(&format!("https://openapi.alipay.com/gateway.do?{query}&method=other")).is_err());
        assert!(validate_url(&format!("https://openapi.alipay.com/gateway.do?{query}#other")).is_err());
    }
}
