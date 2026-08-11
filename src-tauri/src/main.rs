#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

const CACHE_FOLDER: &str = "content-cache";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheStatus {
    enabled: bool,
    entries: usize,
    bytes: u64,
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

fn show_update_error(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("F.w 研究所");
    }

    app.dialog()
        .message("更新没有安装成功，当前版本不会受到影响。请稍后重新打开软件再试。")
        .title("F.w 研究所更新")
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCustom("知道了".to_owned()))
        .show(|_| {});
}

fn install_latest_update(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("F.w 研究所 · 正在更新…");
    }

    tauri::async_runtime::spawn(async move {
        let result = async {
            let updater = app.updater()?;
            if let Some(update) = updater.check().await? {
                update
                    .download_and_install(|_, _| {}, || {})
                    .await?;
                app.restart();
            }
            Ok::<(), tauri_plugin_updater::Error>(())
        }
        .await;

        if result.is_err() {
            show_update_error(&app);
        }
    });
}

fn check_for_updates(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let update = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(_) => return,
        };

        if let Ok(Some(update)) = update {
            let version = update.version.clone();
            let install_app = app.clone();
            app.dialog()
                .message(format!(
                    "发现新版本 {version}。更新会下载到当前安装位置，完成后自动重启；账号和缓存都会保留。"
                ))
                .title("F.w 研究所更新")
                .kind(MessageDialogKind::Info)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "立即更新".to_owned(),
                    "稍后".to_owned(),
                ))
                .show(move |confirmed| {
                    if confirmed {
                        install_latest_update(install_app);
                    }
                });
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
            let _ = cache_dir(app.handle());
            check_for_updates(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_cache_read,
            desktop_cache_write,
            desktop_cache_remove,
            desktop_cache_status
        ])
        .run(tauri::generate_context!())
        .expect("F.w 研究所 Windows 客户端启动失败");
}
