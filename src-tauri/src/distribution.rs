pub const STORE_PRODUCT_ID: &str = "9NDC57KQMR7S";

pub const fn is_store() -> bool {
    cfg!(feature = "microsoft-store")
}

pub fn open_store() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(format!("ms-windows-store://pdp/?productid={STORE_PRODUCT_ID}"))
            .spawn()
            .map_err(|_| "无法打开微软商店，请在商店中搜索 FW研究所检查更新。".to_owned())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("请在 Windows 的微软商店中检查更新。".to_owned())
    }
}

