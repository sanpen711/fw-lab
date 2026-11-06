# Windows versions

The public client version restarts at **1.0.1**. Set `version` in `release.json` for the next public version (1.0.2, 1.0.3, ...).

The native installer/update version must keep increasing from **1.3.37** so already-installed 1.3.36 clients receive the update. Set `buildVersion` in `release.json` and keep Cargo.toml, the application Cargo.lock entry, tauri.v11.conf.json and the release workflow in sync. The installed application identity, updater key and local storage identifiers stay the same.

Both download manifests retain the native version in `version` and include the public version as `displayVersion`. The new client uses the public version in Settings, its footer and update prompts. The static website takes its version and installer URL from the published manifest. Older clients show the native version in the transition update prompt.

Contra is temporarily absent from the game hall. Keep its core, ROM, internal player and save keys intact so existing local saves can still be used when the entry returns.
