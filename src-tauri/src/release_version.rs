use serde_json::Value;

// Keep display numbering independent of the monotonically increasing installer version.
// Existing clients compare installer versions before offering a signed update.
const RELEASE: &str = include_str!("../../desktop-v11/release.json");

pub fn current_display_version() -> String {
    let release: Value = serde_json::from_str(RELEASE).expect("valid bundled release metadata");
    release["version"].as_str().expect("display version").to_owned()
}

pub fn update_display_version(manifest: &Value, fallback: &str) -> String {
    manifest.get("displayVersion").and_then(Value::as_str)
        .filter(|version| {
            let parts: Vec<_> = version.split('.').collect();
            parts.len() == 3 && parts.iter().all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()) && part.parse::<u64>().is_ok())
        })
        .unwrap_or(fallback).to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn restarted_display_number_keeps_a_newer_installer_version() {
        let release: Value = serde_json::from_str(RELEASE).unwrap();
        assert_eq!(current_display_version(), "1.0.8");
        assert_eq!(release["buildVersion"], env!("CARGO_PKG_VERSION"));
        let build: Vec<u64> = env!("CARGO_PKG_VERSION").split('.').map(|part| part.parse().unwrap()).collect();
        assert!(build.as_slice() > [1, 3, 36].as_slice());
    }

    #[test]
    fn update_prompts_use_the_public_version() {
        assert_eq!(update_display_version(&json!({"version":"1.3.38","displayVersion":"1.0.2"}), "1.3.38"), "1.0.2");
    }

    #[test]
    fn legacy_or_invalid_display_metadata_keeps_the_actual_update_version() {
        for manifest in [json!({}), json!({"displayVersion":""}), json!({"displayVersion":"oops"}), json!({"displayVersion":123})] {
            assert_eq!(update_display_version(&manifest, "1.3.36"), "1.3.36");
        }
    }
}
