#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod persistent_cache;

use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    fs::OpenOptions,
    io::Write,
    net::{IpAddr, Ipv4Addr},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const CACHE_FOLDER: &str = "content-cache";
const UPDATE_CONNECT_TIMEOUT_SECS: u64 = 12;
const UPDATE_READ_TIMEOUT_SECS: u64 = 45;
const UPDATE_UI_INTERVAL_MS: u64 = 250;
const UPDATE_LOG_INTERVAL_SECS: u64 = 5;
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
    update_log(app, format!("error {detail}"));
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("F.w 研究所 · 更新失败");
    }
    ensure_update_ui(app);
    render_update_ui(
        app,
        "error",
        "自动更新没有完成",
        format!("网络或安装阶段返回错误：{detail}"),
        None,
        0,
        None,
        0,
    );

    let retry_app = app.clone();
    app.dialog()
        .message(format!(
            "自动更新没有完成。\n\n错误信息：{detail}\n\n可以重新尝试；如果仍然失败，请使用网页下载最新版。当前版本不会受到影响。"
        ))
        .title("F.w 研究所更新")
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "重新尝试".to_owned(),
            "关闭".to_owned(),
        ))
        .show(move |retry| {
            if retry {
                check_for_updates(retry_app);
            }
        });
}

fn check_for_updates_system_auto(app: AppHandle) {
    update_log(&app, "fallback_system_check_start");
    render_update_ui(
        &app,
        "connecting",
        "直连通道失败，正在切换系统网络…",
        "将自动使用 Windows 当前网络/代理设置重试一次",
        None,
        0,
        None,
        0,
    );

    tauri::async_runtime::spawn(async move {
        let updater = match app
            .updater_builder()
            .configure_client(|client| {
                client
                    .connect_timeout(Duration::from_secs(UPDATE_CONNECT_TIMEOUT_SECS))
                    .read_timeout(Duration::from_secs(UPDATE_READ_TIMEOUT_SECS))
            })
            .build()
        {
            Ok(updater) => updater,
            Err(error) => {
                show_update_error(&app, format!("system_builder {error}"));
                return;
            }
        };

        match updater.check().await {
            Ok(Some(update)) => {
                update_log(&app, format!("fallback_system_found version={}", update.version));
                install_latest_update(app, update, UPDATE_MODE_SYSTEM.to_owned());
            }
            Ok(None) => show_update_error(&app, "system_no_update_after_direct_failure".to_owned()),
            Err(error) => show_update_error(&app, format!("system_check {error}")),
        }
    });
}

fn install_latest_update(app: AppHandle, update: Update, network_mode: String) {
    let version = update.version.clone();
    if let Some(window) = app.get_webview_window("main") {
        let window_title = format!("F.w 研究所 · 正在更新到 {version}");
        let _ = window.set_title(&window_title);
    }
    ensure_update_ui(&app);
    render_update_ui(
        &app,
        "connecting",
        "正在连接更新服务器…",
        format!("准备下载 Windows {version} · 通道：{network_mode}"),
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
        let progress_mode = network_mode.clone();

        let download_result = update
            .download(
                move |chunk, total| {
                    let current = chunk_downloaded.fetch_add(chunk as u64, Ordering::Relaxed) + chunk as u64;
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
                            format!("下载完成后会自动校验并安装 · 通道：{progress_mode}"),
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
                        "下载完成，正在校验更新…",
                        "正在验证安装包签名和完整性",
                        Some(100),
                        current,
                        (total > 0).then_some(total),
                        0,
                    );
                    update_log(&finish_app, format!("download_finished bytes={current} total={total}"));
                },
            )
            .await;

        let bytes = match download_result {
            Ok(bytes) => bytes,
            Err(error) => {
                update_log(
                    &app,
                    format!("download_failed mode={network_mode} error={error}"),
                );
                if network_mode == UPDATE_MODE_DIRECT {
                    check_for_updates_system_auto(app.clone());
                } else {
                    show_update_error(&app, format!("{network_mode} download_or_verify {error}"));
                }
                return;
            }
        };

        update_log(
            &app,
            format!("verify_ok mode={network_mode} bytes={}", bytes.len()),
        );
        render_update_ui(
            &app,
            "installing",
            "校验完成，正在启动安装…",
            "安装程序接管后软件会退出，完成后自动重新打开",
            Some(100),
            bytes.len() as u64,
            Some(bytes.len() as u64),
            0,
        );

        if let Err(error) = update.install(bytes) {
            show_update_error(&app, format!("install {error}"));
            return;
        }

        update_log(&app, "install_returned_ok");
        app.restart();
    });
}

fn check_for_updates(app: AppHandle) {
    update_log(&app, "check_direct_start");
    tauri::async_runtime::spawn(async move {
        let direct_result = match app
            .updater_builder()
            .no_proxy()
            .configure_client(|client| {
                client
                    .connect_timeout(Duration::from_secs(UPDATE_CONNECT_TIMEOUT_SECS))
                    .read_timeout(Duration::from_secs(UPDATE_READ_TIMEOUT_SECS))
                    .http1_only()
                    .local_address(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
            })
            .build()
        {
            Ok(updater) => updater
                .check()
                .await
                .map_err(|error| format!("direct_check {error}")),
            Err(error) => Err(format!("direct_builder {error}")),
        };

        let (update, network_mode) = match direct_result {
            Ok(update) => {
                update_log(&app, "check_direct_ok");
                (update, UPDATE_MODE_DIRECT.to_owned())
            }
            Err(direct_error) => {
                update_log(&app, format!("{direct_error}; fallback_system_check"));
                let system_updater = match app
                    .updater_builder()
                    .configure_client(|client| {
                        client
                            .connect_timeout(Duration::from_secs(UPDATE_CONNECT_TIMEOUT_SECS))
                            .read_timeout(Duration::from_secs(UPDATE_READ_TIMEOUT_SECS))
                    })
                    .build()
                {
                    Ok(updater) => updater,
                    Err(error) => {
                        update_log(&app, format!("system_builder_error {error}"));
                        return;
                    }
                };

                match system_updater.check().await {
                    Ok(update) => {
                        update_log(&app, "check_system_ok");
                        (update, UPDATE_MODE_SYSTEM.to_owned())
                    }
                    Err(error) => {
                        update_log(&app, format!("system_check_error {error}"));
                        return;
                    }
                }
            }
        };

        if let Some(update) = update {
            let version = update.version.clone();
            update_log(
                &app,
                format!("found version={version} mode={network_mode}"),
            );
            let install_app = app.clone();
            app.dialog()
                .message(format!(
                    "发现新版本 {version}。点击立即更新后会直接开始下载；本版会优先使用兼容直连通道，必要时自动回退系统网络。下载过程会显示实时进度。账号和缓存都会保留。"
                ))
                .title("F.w 研究所更新")
                .kind(MessageDialogKind::Info)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "立即更新".to_owned(),
                    "稍后".to_owned(),
                ))
                .show(move |confirmed| {
                    if confirmed {
                        install_latest_update(install_app, update, network_mode);
                    }
                });
        } else {
            update_log(&app, "no_update");
        }
    });
}

fn main() {
    tauri::Builder::default()
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
            let _ = persistent_cache::init(app.handle());
            check_for_updates(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_cache_read,
            desktop_cache_write,
            desktop_cache_remove,
            desktop_cache_status,
            persistent_cache::desktop_persistent_cache_read,
            persistent_cache::desktop_persistent_cache_write,
            persistent_cache::desktop_persistent_cache_remove,
            persistent_cache::desktop_persistent_cache_status
        ])
        .run(tauri::generate_context!())
        .expect("F.w 研究所 Windows 客户端启动失败");
}
