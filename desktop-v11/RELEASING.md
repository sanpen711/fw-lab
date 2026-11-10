# Current release

Public **1.0.2**, native installer/update **1.3.39**. This release improves visible-message receipts, durable drafts, incremental chat rendering, tray/hotkeys, background updates, compact windows and Chinese failure messages. Archived game/resource exclusions remain in force.

# Windows versions

The public client version restarts at **1.0.1**. Set `version` in `release.json` for the next public version (1.0.3, 1.0.4, ...).

The native installer/update version must keep increasing from **1.3.38** so already-installed clients receive the update. Set `buildVersion` in `release.json` and keep Cargo.toml, the application Cargo.lock entry, tauri.v11.conf.json and the release workflow in sync. The installed application identity, updater key and local storage identifiers stay the same.

Both download manifests retain the native version in `version` and include the public version as `displayVersion`. The new client uses the public version in Settings, its footer and update prompts. The static website takes its version and installer URL from the published manifest. Older clients show the native version in the transition update prompt.

Production bundles use the allowlist in `scripts/release-package.mjs`. Only the active app, 2048, Minesweeper, Sudoku and Reaction Test are distributed. ROMs, the NES player, emulator cores, Snake, Catch, retired pages, old home artwork and inactive icons are excluded. The build audits both file paths and contents and writes `.cache/release-package-audit.json` outside the packaged frontend.

Keep the original ROM, emulator, player, save code and other archived assets in GitHub. Archived NES functionality remains available to source regression tests in development; it is compiled out of production. Do not add a hidden feature to the public allowlist without explicitly enabling it again.

Run `npm run test:release` after building to verify the actual production frontend. Candidate and official installers both embed this audited `dist` directory. Never overwrite the already-published 1.3.37 artifact; this resource-excluded package uses a new internal version, 1.3.38, while retaining public version 1.0.1.
