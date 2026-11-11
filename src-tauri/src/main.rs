#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_identity;
mod alipay_checkout;
mod external_links;
mod persistent_cache;
mod update_endpoints;
mod release_version;
mod desktop_behavior;

use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    fs::OpenOptions,
    io::Write,
    net::{IpAddr, Ipv4Addr},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const CACHE_FOLDER: &str = "content-cache";
struct PendingUpdate(Mutex<Option<(Update, Vec<u8>)>>);

const UPDATE_CONNECT_TIMEOUT_SECS: u64 = 12;
const UPDATE_READ_TIMEOUT_SECS: u64 = 45;
const UPDATE_UI_INTERVAL_MS: u64 = 250;
const UPDATE_LOG_INTERVAL_SECS: u64 = 5;
const UPDATE_SLOW_GRACE_SECS: u64 = 4;
const UPDATE_SLOW_SAMPLE_SECS: u64 = 4;
const UPDATE_SLOW_MIN_BPS: u64 = 96 * 1024;
const UPDATE_MODE_DIRECT: &str = "direct-http1-ipv4";
const UPDATE_MODE_SYSTEM: &str = "system-network";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheStatus {
    enabled: bool,
    entries: usize,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppCacheStatus {
    enabled: bool,
    entries: u64,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateUiState {
    phase: String,
    title: String,
    detail: String,
    percent: Option<u8>,
    downloaded: u64,
    total: Option<u64>,
    speed_bps: u64,
}

fn valid_cache_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 64
        && key
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_')
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("无法定位缓存目录：{error}"))?
        .join(CACHE_FOLDER);
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建缓存目录：{error}"))?;
    Ok(dir)
}

fn cache_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if !valid_cache_key(key) {
        return Err("缓存名称不合法。".to_owned());
    }
    Ok(cache_dir(app)?.join(format!("{key}.json")))
}

fn cache_usage(dir: &PathBuf) -> (usize, u64) {
    let mut entries = 0usize;
    let mut bytes = 0u64;
    let Ok(files) = fs::read_dir(dir) else {
        return (entries, bytes);
    };
    for entry in files.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                entries += 1;
                bytes = bytes.saturating_add(metadata.len());
            }
        }
    }
    (entries, bytes)
}

#[tauri::command]
fn desktop_cache_read(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let path = cache_file(&app, &key)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|error| format!("无法读取缓存：{error}"))?;
    match serde_json::from_str(&raw) {
        Ok(value) => Ok(Some(value)),
        Err(_) => {
            let _ = fs::remove_file(path);
            Ok(None)
        }
    }
}

#[tauri::command]
fn desktop_cache_write(app: AppHandle, key: String, value: Value) -> Result<CacheStatus, String> {
    let path = cache_file(&app, &key)?;
    let raw = serde_json::to_vec(&value).map_err(|error| format!("无法整理缓存数据：{error}"))?;

    let dir = path
        .parent()
        .ok_or_else(|| "缓存目录无效。".to_owned())?
        .to_path_buf();
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, raw).map_err(|error| format!("无法写入缓存：{error}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("无法替换旧缓存：{error}"))?;
    }
    fs::rename(&temp, &path).map_err(|error| format!("无法启用新缓存：{error}"))?;

    let (entries, bytes) = cache_usage(&dir);
    Ok(CacheStatus { enabled: true, entries, bytes })
}

#[tauri::command]
fn desktop_cache_remove(app: AppHandle, key: String) -> Result<CacheStatus, String> {
    let path = cache_file(&app, &key)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("无法清理缓存：{error}"))?;
    }
    let dir = cache_dir(&app)?;
    let (entries, bytes) = cache_usage(&dir);
    Ok(CacheStatus { enabled: true, entries, bytes })
}

#[tauri::command]
fn desktop_cache_status(app: AppHandle) -> Result<CacheStatus, String> {
    let dir = cache_dir(&app)?;
    let (entries, bytes) = cache_usage(&dir);
    Ok(CacheStatus { enabled: true, entries, bytes })
}

fn remove_cache_contents(dir: &PathBuf) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|error| format!("无法清理缓存目录：{error}"))?;
        } else {
            fs::remove_file(&path).map_err(|error| format!("无法清理缓存文件：{error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_app_cache_status(app: AppHandle) -> Result<AppCacheStatus, String> {
    let legacy = cache_dir(&app)?;
    let (legacy_entries, legacy_bytes) = cache_usage(&legacy);
    let persistent = persistent_cache::status(&app)?;
    Ok(AppCacheStatus {
        enabled: true,
        entries: persistent.entries.saturating_add(legacy_entries as u64),
        bytes: persistent.bytes.saturating_add(legacy_bytes),
    })
}

#[tauri::command]
fn desktop_app_cache_clear(app: AppHandle) -> Result<AppCacheStatus, String> {
    let legacy = cache_dir(&app)?;
    remove_cache_contents(&legacy)?;
    let persistent = persistent_cache::clear(&app)?;
    let (legacy_entries, legacy_bytes) = cache_usage(&legacy);
    Ok(AppCacheStatus {
        enabled: true,
        entries: persistent.entries.saturating_add(legacy_entries as u64),
        bytes: persistent.bytes.saturating_add(legacy_bytes),
    })
}

fn update_log(app: &AppHandle, message: impl AsRef<str>) {
    let Ok(dir) = app.path().app_cache_dir() else {
        return;
    };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("update.log");
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    let _ = writeln!(file, "{stamp} {}", message.as_ref());
}

fn ensure_update_ui(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(include_str!("update_ui.js"));
    }
}

fn render_update_ui(
    app: &AppHandle,
    phase: &str,
    title: &str,
    detail: impl Into<String>,
    percent: Option<u8>,
    downloaded: u64,
    total: Option<u64>,
    speed_bps: u64,
) {
    if let Some(window) = app.get_webview_window("main") {
        let payload = UpdateUiState {
            phase: phase.to_owned(),
            title: title.to_owned(),
            detail: detail.into(),
            percent,
            downloaded,
            total,
            speed_bps,
        };
        if let Ok(json) = serde_json::to_string(&payload) {
            let _ = window.eval(format!("window.__FW_UPDATE_RENDER__?.({json});"));
        }
    }
}

fn show_update_error(app: &AppHandle, detail: String) {
    UPDATE_INSTALL_ACTIVE.store(false, Ordering::Release);
    UPDATE_INSTALLING.store(false, Ordering::Release);
    update_log(app, format!("error {detail}"));
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&format!("{} · 更新失败", desktop_identity::display_name(app)));
    }
    ensure_update_ui(app);
    render_update_ui(
        app,
        "error",
        "自动更新没有完成",
        "更新暂时未能完成，请稍后重试。当前版本可继续使用。",
        None,
        0,
        None,
        0,
    );

}

async fn check_manifest_endpoint(app: &AppHandle, endpoint: &'static str, direct: bool) -> Result<Option<Update>, String> {
    update_log(app, format!("check_endpoint direct={direct} url={endpoint}"));
    let builder = app.updater_builder()
        .endpoints(vec![endpoint.parse().map_err(|error| format!("endpoint {error:?}"))?])
        .map_err(|error| format!("endpoint {error:?}"))?;
    let updater = if direct {
        builder.no_proxy().configure_client(|client| client
            .connect_timeout(Duration::from_secs(UPDATE_CONNECT_TIMEOUT_SECS))
            .read_timeout(Duration::from_secs(UPDATE_READ_TIMEOUT_SECS))
            .http1_only()
            .local_address(IpAddr::V4(Ipv4Addr::UNSPECIFIED)))
            .build()
    } else {
        builder.configure_client(|client| client
            .connect_timeout(Duration::from_secs(UPDATE_CONNECT_TIMEOUT_SECS))
            .read_timeout(Duration::from_secs(UPDATE_READ_TIMEOUT_SECS)))
            .build()
    }.map_err(|error| format!("builder {endpoint}: {error:?}"))?;
    updater.check().await.map_err(|error| format!("{endpoint}: {error:?}"))
}

async fn check_manifests(app: &AppHandle, direct: bool) -> Result<Option<Update>, String> {
    update_endpoints::first_available(|endpoint| check_manifest_endpoint(app, endpoint, direct))
        .await.map_err(|errors| errors.join("; "))
}

fn check_for_updates_direct_auto(app: AppHandle) {
    update_log(&app, "fallback_direct_check_start");
    render_update_ui(
        &app,
        "connecting",
        "正在重新连接…",
        "网络连接不稳定，正在重试。你可以继续使用软件。",
        None,
        0,
        None,
        0,
    );

    tauri::async_runtime::spawn(async move {
        match check_manifests(&app, true).await {
            Ok(Some(update)) => {
                update_log(&app, format!("fallback_direct_found version={}", update.version));
                install_latest_update(app, update, UPDATE_MODE_DIRECT.to_owned());
            }
            Ok(None) => show_update_error(&app, "direct_no_update_after_system_failure".to_owned()),
            Err(error) => show_update_error(&app, format!("direct_check {error}")),
        }
    });
}

fn install_latest_update(app: AppHandle, update: Update, network_mode: String) {
    UPDATE_INSTALL_ACTIVE.store(true, Ordering::Release);
    let version = release_version::update_display_version(&update.raw_json, &update.version);
    if let Some(window) = app.get_webview_window("main") {
        let window_title = format!("{} · 正在更新到 {version}", desktop_identity::display_name(&app));
        let _ = window.set_title(&window_title);
    }
    ensure_update_ui(&app);
    render_update_ui(
        &app,
        "connecting",
        "正在连接更新服务器…",
        format!("正在后台下载 {version}，你可以继续使用软件。"),
        None,
        0,
        None,
        0,
    );
    update_log(
        &app,
        format!("download_start version={version} mode={network_mode}"),
    );

    tauri::async_runtime::spawn(async move {
        let downloaded = Arc::new(AtomicU64::new(0));
        let total_bytes = Arc::new(AtomicU64::new(0));
        let started = Instant::now();
        let mut first_chunk_at: Option<Instant> = None;
        let mut last_ui_at: Option<Instant> = None;
        let mut last_log_at: Option<Instant> = None;

        let chunk_app = app.clone();
        let chunk_downloaded = downloaded.clone();
        let chunk_total = total_bytes.clone();
        let finish_app = app.clone();
        let finish_downloaded = downloaded.clone();
        let finish_total = total_bytes.clone();
        let watchdog_downloaded = downloaded.clone();

        let progress_mode = network_mode.clone();
        let download_future = update.download(
            move |chunk, total| {
                    let current = chunk_downloaded
                        .fetch_add(chunk as u64, Ordering::Relaxed)
                        + chunk as u64;
                    if let Some(total) = total {
                        chunk_total.store(total, Ordering::Relaxed);
                    }
                    let known_total = chunk_total.load(Ordering::Relaxed);
                    let percent = if known_total > 0 {
                        Some(((current.saturating_mul(100) / known_total).min(100)) as u8)
                    } else {
                        None
                    };

                    if first_chunk_at.is_none() {
                        first_chunk_at = Some(Instant::now());
                    }
                    let elapsed = first_chunk_at
                        .as_ref()
                        .map(|first| first.elapsed().as_secs_f64())
                        .unwrap_or_else(|| started.elapsed().as_secs_f64())
                        .max(0.001);
                    let speed = (current as f64 / elapsed) as u64;
                    let complete = known_total > 0 && current >= known_total;

                    let should_render = complete
                        || last_ui_at
                            .as_ref()
                            .map(|last| last.elapsed() >= Duration::from_millis(UPDATE_UI_INTERVAL_MS))
                            .unwrap_or(true);
                    if should_render {
                        render_update_ui(
                            &chunk_app,
                            "downloading",
                            "正在下载更新…",
                            "正在后台下载，完成后由你选择重启安装。",
                            percent,
                            current,
                            (known_total > 0).then_some(known_total),
                            speed,
                        );
                        last_ui_at = Some(Instant::now());
                    }

                    let should_log = complete
                        || last_log_at
                            .as_ref()
                            .map(|last| last.elapsed() >= Duration::from_secs(UPDATE_LOG_INTERVAL_SECS))
                            .unwrap_or(true);
                    if should_log {
                        update_log(
                            &chunk_app,
                            format!(
                                "download_progress mode={progress_mode} bytes={current} total={known_total} speed_bps={speed}"
                            ),
                        );
                        last_log_at = Some(Instant::now());
                    }
            },
            move || {
                let current = finish_downloaded.load(Ordering::Relaxed);
                let total = finish_total.load(Ordering::Relaxed);
                render_update_ui(
                    &finish_app,
                    "verifying",
                    "安装包已下载，正在校验…",
                    "正在检查更新包，你可以继续使用软件。",
                    Some(100),
                    current,
                    (total > 0).then_some(total),
                    0,
                );
                update_log(
                    &finish_app,
                    format!("download_finished bytes={current} total={total}"),
                );
            },
        );
        tokio::pin!(download_future);

        let low_speed_watchdog = async move {
            tokio::time::sleep(Duration::from_secs(UPDATE_SLOW_GRACE_SECS)).await;
            let before = watchdog_downloaded.load(Ordering::Relaxed);
            tokio::time::sleep(Duration::from_secs(UPDATE_SLOW_SAMPLE_SECS)).await;
            let after = watchdog_downloaded.load(Ordering::Relaxed);
            after.saturating_sub(before) / UPDATE_SLOW_SAMPLE_SECS
        };
        tokio::pin!(low_speed_watchdog);

        let download_result = if network_mode == UPDATE_MODE_SYSTEM {
            tokio::select! {
                result = &mut download_future => Some(result),
                observed_bps = &mut low_speed_watchdog => {
                    if observed_bps < UPDATE_SLOW_MIN_BPS {
                        update_log(
                            &app,
                            format!(
                                "download_slow mode={network_mode} speed_bps={observed_bps} threshold_bps={UPDATE_SLOW_MIN_BPS}"
                            ),
                        );
                        None
                    } else {
                        Some(download_future.await)
                    }
                }
            }
        } else {
            Some(download_future.await)
        };

        let bytes = match download_result {
            Some(Ok(bytes)) => bytes,
            Some(Err(error)) => {
                update_log(
                    &app,
                    format!("download_failed mode={network_mode} error={error}"),
                );
                if network_mode == UPDATE_MODE_SYSTEM {
                    check_for_updates_direct_auto(app.clone());
                } else {
                    show_update_error(&app, format!("{network_mode} download_or_verify {error}"));
                }
                return;
            }
            None => {
                let known_total = total_bytes.load(Ordering::Relaxed);
                render_update_ui(
                    &app,
                    "connecting",
                    "当前线路持续低速，正在自动换线…",
                    "你可以继续使用软件，下载完成后会提醒你。",
                    None,
                    0,
                    (known_total > 0).then_some(known_total),
                    0,
                );
                check_for_updates_direct_auto(app.clone());
                return;
            }
        };

        update_log(
            &app,
            format!("verify_ok mode={network_mode} bytes={}", bytes.len()),
        );
        let size = bytes.len() as u64;
        if let Ok(mut pending) = app.state::<PendingUpdate>().0.lock() {
            *pending = Some((update.clone(), bytes));
        } else {
            show_update_error(&app, "pending_update_lock".into()); return;
        }
        UPDATE_INSTALL_ACTIVE.store(false, Ordering::Release);
        if let Some(window) = app.get_webview_window("main") { let _ = window.set_title(&desktop_identity::display_name(&app)); }
        render_update_ui(&app, "ready", "更新已准备好", "方便时重启安装即可。未发送的草稿已保存在本机。", Some(100), size, Some(size), 0);
    });
}


#[tauri::command]
async fn desktop_install_ready_update(app: AppHandle) -> Result<(), String> {
    let pending = app.state::<PendingUpdate>().0.lock().map_err(|_| "更新状态暂时不可用。")?.take();
    let Some((update, bytes)) = pending else { return Err("还没有准备好的更新包，请先检查更新。".into()); };
    UPDATE_INSTALL_ACTIVE.store(true, Ordering::Release);
    UPDATE_INSTALLING.store(true, Ordering::Release);
    render_update_ui(&app, "installing", "正在安装更新…", "软件将自动重新打开，请稍候。", Some(100), bytes.len() as u64, Some(bytes.len() as u64), 0);
    // Start installation on the next task so the UI can paint and drafts flush.
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Err(error) = update.install(bytes) { show_update_error(&app, format!("install {error}")); return; }
        update_log(&app, "install_returned_ok"); app.restart();
    });
    Ok(())
}

static UPDATE_CHECK_RUNNING: AtomicBool = AtomicBool::new(false);
static UPDATE_INSTALL_ACTIVE: AtomicBool = AtomicBool::new(false);
static UPDATE_INSTALLING: AtomicBool = AtomicBool::new(false);

struct UpdateCheckGuard;
impl UpdateCheckGuard {
    fn acquire() -> Option<Self> {
        UPDATE_CHECK_RUNNING.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).ok().map(|_| Self)
    }
}
impl Drop for UpdateCheckGuard {
    fn drop(&mut self) { UPDATE_CHECK_RUNNING.store(false, Ordering::Release); }
}

#[derive(Serialize)]
struct UpdateCheckResult {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
}

#[tauri::command]
fn desktop_app_version() -> String {
    release_version::current_display_version()
}

#[tauri::command]
async fn desktop_check_for_updates(app: AppHandle) -> Result<UpdateCheckResult, String> {
    run_update_check(app.clone()).await.map_err(|error| {
        update_log(&app, format!("manual_check_error {error}"));
        "检查更新失败，请确认网络连接后重试。".to_owned()
    })
}

fn check_for_updates(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        for attempt in 0..2 {
            match run_update_check(app.clone()).await {
                Ok(_) => return,
                Err(error) => update_log(&app, format!("startup_check_error attempt={attempt}: {error}")),
            }
            if attempt == 0 {
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        }
        // An unavailable update service must not interrupt starting the client.
        update_log(&app, "startup_check_deferred");
    });
}

async fn run_update_check(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let ready_version = app.state::<PendingUpdate>().0.lock().ok().and_then(|value| value.as_ref().map(|(update, _)| release_version::update_display_version(&update.raw_json, &update.version)));
    if let Some(version) = ready_version {
        ensure_update_ui(&app);
        render_update_ui(&app, "ready", "更新已准备好", "方便时重启安装即可。未发送的草稿已保存在本机。", Some(100), 0, None, 0);
        return Ok(UpdateCheckResult { status: "ready", version: Some(version) });
    }
    if UPDATE_INSTALL_ACTIVE.load(Ordering::Acquire) {
        return Ok(UpdateCheckResult { status: "busy", version: None });
    }
    let Some(guard) = UpdateCheckGuard::acquire() else {
        return Ok(UpdateCheckResult { status: "busy", version: None });
    };
    update_log(&app, "check_system_start");
    let system_result = check_manifests(&app, false).await
        .map_err(|error| format!("system_check {error}"));

    let (update, network_mode) = match system_result {
        Ok(update) => {
            update_log(&app, "check_system_ok");
            (update, UPDATE_MODE_SYSTEM.to_owned())
        }
        Err(system_error) => {
            update_log(&app, format!("{system_error}; fallback_direct_check"));
            match check_manifests(&app, true).await {
                Ok(update) => {
                    update_log(&app, "check_direct_ok");
                    (update, UPDATE_MODE_DIRECT.to_owned())
                }
                Err(error) => {
                    return Err(format!("{system_error}; direct_check {error}"));
                }
            }
        }
    };

    if let Some(update) = update {
        let version = release_version::update_display_version(&update.raw_json, &update.version);
        update_log(
            &app,
            format!("found version={version} mode={network_mode}"),
        );
        let result = UpdateCheckResult { status: "available", version: Some(version.clone()) };
        let install_app = app.clone();
        app.dialog()
            .message(format!(
                "当前版本 {} → 新版本 {version}\n\n{}\n\n更新包将在后台下载，完成后由你选择重启安装。", release_version::current_display_version(), update.body.as_deref().unwrap_or("改进使用体验与运行稳定性。").chars().take(300).collect::<String>()
            ))
            .title(format!("{}更新", desktop_identity::display_name(&app)))
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "后台下载".to_owned(),
                "稍后".to_owned(),
            ))
            .show(move |confirmed| {
                let _check_guard = guard;
                if confirmed {
                    install_latest_update(install_app, update, network_mode);
                }
            });
        Ok(result)
    } else {
        update_log(&app, "no_update");
        Ok(UpdateCheckResult { status: "latest", version: None })
    }
}

fn main() {
    tauri::Builder::default()
        .manage(PendingUpdate(Mutex::new(None)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let _ = desktop_identity::apply_saved(app.handle());
            let _ = persistent_cache::init(app.handle());
            if let Err(error) = desktop_behavior::initialize(app.handle()) { update_log(app.handle(), format!("desktop_behavior_init {error}")); }
            check_for_updates(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_behavior::desktop_window_is_active,
            desktop_behavior::desktop_behavior_get,
            desktop_behavior::desktop_behavior_set,
            desktop_behavior::desktop_shortcut_capture,
            desktop_app_version,
            desktop_install_ready_update,
            desktop_check_for_updates,
            alipay_checkout::desktop_open_alipay,
            external_links::desktop_open_web_url,
            desktop_cache_read,
            desktop_cache_write,
            desktop_cache_remove,
            desktop_cache_status,
            desktop_app_cache_status,
            desktop_app_cache_clear,
            desktop_identity::desktop_identity_get,
            desktop_identity::desktop_identity_set,
            persistent_cache::desktop_persistent_cache_read,
            persistent_cache::desktop_persistent_cache_write,
            persistent_cache::desktop_persistent_cache_remove,
            persistent_cache::desktop_persistent_cache_status
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" { return; }
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } if UPDATE_INSTALLING.load(Ordering::Acquire) => api.prevent_close(),
                tauri::WindowEvent::CloseRequested { api, .. } if !UPDATE_INSTALLING.load(Ordering::Acquire) && desktop_behavior::close_to_tray(window.app_handle()) => {
                    api.prevent_close(); let _ = window.hide(); desktop_behavior::notify_attention(window.app_handle());
                },
                tauri::WindowEvent::Focused(false) => {
                    desktop_behavior::desktop_shortcut_capture(window.app_handle().clone(), false);
                    desktop_behavior::notify_attention(window.app_handle());
                }
                tauri::WindowEvent::Focused(true) | tauri::WindowEvent::Resized(_) => desktop_behavior::notify_attention(window.app_handle()),
                _ => ()
            }
        })
        .run(tauri::generate_context!())
        .expect("F.w 研究所 Windows 客户端启动失败");
}

#[cfg(test)]
mod update_check_tests {
    use super::UpdateCheckGuard;

    #[test]
    fn update_checks_share_a_guard_until_the_prompt_finishes() {
        let guard = UpdateCheckGuard::acquire().expect("first check");
        assert!(UpdateCheckGuard::acquire().is_none());
        drop(guard);
        assert!(UpdateCheckGuard::acquire().is_some());
    }
}
