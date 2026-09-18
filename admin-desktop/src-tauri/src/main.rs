#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATE_CONNECT_TIMEOUT_SECS: u64 = 12;
const UPDATE_READ_TIMEOUT_SECS: u64 = 60;

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
            let _ = window.eval(format!("window.__FW_ADMIN_UPDATE_RENDER__?.({json});"));
        }
    }
}

fn show_update_error(app: &AppHandle, detail: String) {
    ensure_update_ui(app);
    render_update_ui(
        app,
        "error",
        "自动更新没有完成",
        format!("网络、校验或安装阶段返回错误：{detail}"),
        None,
        0,
        None,
        0,
    );

    let retry_app = app.clone();
    app.dialog()
        .message(format!(
            "自动更新没有完成。\n\n错误信息：{detail}\n\n当前版本不会受到影响，可以重新尝试。"
        ))
        .title("FW管理台更新")
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

fn install_latest_update(app: AppHandle, update: Update) {
    let version = update.version.clone();
    ensure_update_ui(&app);
    render_update_ui(
        &app,
        "connecting",
        "正在连接更新服务器…",
        format!("准备下载 FW管理台 {version}"),
        None,
        0,
        None,
        0,
    );

    tauri::async_runtime::spawn(async move {
        let downloaded = Arc::new(AtomicU64::new(0));
        let total_bytes = Arc::new(AtomicU64::new(0));
        let started = Instant::now();
        let mut last_rendered = Instant::now() - Duration::from_secs(1);

        let progress_app = app.clone();
        let progress_downloaded = downloaded.clone();
        let progress_total = total_bytes.clone();
        let finish_app = app.clone();
        let finish_downloaded = downloaded.clone();
        let finish_total = total_bytes.clone();

        let bytes = match update
            .download(
                move |chunk, total| {
                    let current = progress_downloaded.fetch_add(chunk as u64, Ordering::Relaxed)
                        + chunk as u64;
                    if let Some(total) = total {
                        progress_total.store(total, Ordering::Relaxed);
                    }
                    let known_total = progress_total.load(Ordering::Relaxed);
                    let complete = known_total > 0 && current >= known_total;
                    if complete || last_rendered.elapsed() >= Duration::from_millis(250) {
                        let percent = (known_total > 0).then_some(
                            ((current.saturating_mul(100) / known_total).min(100)) as u8,
                        );
                        let speed = (current as f64 / started.elapsed().as_secs_f64().max(0.001)) as u64;
                        render_update_ui(
                            &progress_app,
                            "downloading",
                            "正在下载更新…",
                            "下载完成后还会进行签名校验和安装，请不要关闭软件",
                            percent,
                            current,
                            (known_total > 0).then_some(known_total),
                            speed,
                        );
                        last_rendered = Instant::now();
                    }
                },
                move || {
                    let current = finish_downloaded.load(Ordering::Relaxed);
                    let total = finish_total.load(Ordering::Relaxed);
                    render_update_ui(
                        &finish_app,
                        "verifying",
                        "安装包已下载，正在校验…",
                        "还没有更新完成，请继续等待",
                        Some(100),
                        current,
                        (total > 0).then_some(total),
                        0,
                    );
                },
            )
            .await
        {
            Ok(bytes) => bytes,
            Err(error) => {
                show_update_error(&app, format!("download_or_verify {error}"));
                return;
            }
        };

        render_update_ui(
            &app,
            "installing",
            "校验完成，正在安装…",
            "安装完成后管理台会自动重新打开，重新打开才表示更新成功",
            Some(100),
            bytes.len() as u64,
            Some(bytes.len() as u64),
            0,
        );

        if let Err(error) = update.install(bytes) {
            show_update_error(&app, format!("install {error}"));
            return;
        }

        app.restart();
    });
}

fn check_for_updates(app: AppHandle) {
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
            Err(_) => return,
        };

        let Ok(Some(update)) = updater.check().await else {
            return;
        };

        let version = update.version.clone();
        let notes = update.body.clone().unwrap_or_default();
        let install_app = app.clone();
        app.dialog()
            .message(if notes.trim().is_empty() {
                format!("发现新版本 {version}。更新时会显示下载、校验和安装进度，完成后管理台会自动重新打开。")
            } else {
                format!("发现新版本 {version}。\n\n{notes}\n\n更新时会显示下载、校验和安装进度，完成后管理台会自动重新打开。")
            })
            .title("FW管理台更新")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "立即更新".to_owned(),
                "稍后".to_owned(),
            ))
            .show(move |confirmed| {
                if confirmed {
                    install_latest_update(install_app, update);
                }
            });
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            check_for_updates(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("FW管理台启动失败");
}
