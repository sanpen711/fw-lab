#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

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
                    "发现新版本 {version}。更新会下载到当前安装位置，完成后自动重启；账号、缓存和浏览位置都会保留。"
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
            check_for_updates(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("F.w 研究所 Windows 客户端启动失败");
}
