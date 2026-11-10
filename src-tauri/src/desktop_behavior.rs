use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const SHORTCUTS: [&str; 3] = ["Ctrl+Alt+H", "Ctrl+Alt+Q", "Ctrl+Shift+F9"];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub close_to_tray: bool,
    pub shortcut_enabled: bool,
    pub shortcut: String,
    pub message_preview: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            close_to_tray: false,
            shortcut_enabled: true,
            shortcut: SHORTCUTS[0].into(),
            message_preview: true,
        }
    }
}
pub struct BehaviorState {
    preferences: Mutex<Preferences>,
    registered: Mutex<Option<String>>,
}

pub fn restore_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
pub fn notify_attention(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let active = desktop_window_is_active(app.clone());
        let _ = window.eval(format!("window.dispatchEvent(new CustomEvent('fw:window-attention',{{detail:{{active:{active}}}}}));"));
    }
}
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
            notify_attention(app);
        } else {
            restore_window(app);
        }
    }
}
fn register_shortcut(app: &AppHandle, preferences: &Preferences) -> Result<(), String> {
    let state = app.state::<BehaviorState>();
    let mut registered = state
        .registered
        .lock()
        .map_err(|_| "快捷键状态暂时不可用。")?;
    let wanted = preferences
        .shortcut_enabled
        .then_some(preferences.shortcut.clone());
    if *registered == wanted {
        return Ok(());
    }
    if let Some(shortcut) = &wanted {
        app.global_shortcut()
            .register(shortcut.as_str())
            .map_err(|_| "快捷键已被其他软件占用，请选择其他组合后重试。")?;
    }
    if let Some(old) = registered.as_ref() {
        let _ = app.global_shortcut().unregister(old.as_str());
    }
    *registered = wanted;
    Ok(())
}
pub fn initialize(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let path = app.path().app_config_dir()?.join("desktop-behavior.json");
    let mut preferences: Preferences = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    if !SHORTCUTS.contains(&preferences.shortcut.as_str()) {
        preferences.shortcut = SHORTCUTS[0].into();
    }
    app.manage(BehaviorState {
        preferences: Mutex::new(preferences.clone()),
        registered: Mutex::new(None),
    });
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    toggle_window(app);
                }
            })
            .build(),
    )?;
    let show = MenuItem::with_id(app, "show", "打开窗口", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出软件", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
    TrayIconBuilder::with_id("fw-desktop")
        .icon(super::desktop_identity::tray_image(app)?)
        .tooltip(super::desktop_identity::display_name(app))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => restore_window(app),
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                    notify_attention(app);
                }
            }
            "quit" => app.exit(0),
            _ => (),
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                restore_window(tray.app_handle());
            }
        })
        .build(app)?;
    // A conflicting hotkey must never prevent the application from starting.
    let _ = register_shortcut(app, &preferences);
    Ok(())
}
pub fn close_to_tray(app: &AppHandle) -> bool {
    app.try_state::<BehaviorState>()
        .and_then(|state| {
            state
                .preferences
                .lock()
                .ok()
                .map(|value| value.close_to_tray)
        })
        .unwrap_or(false)
        && app.tray_by_id("fw-desktop").is_some()
}
#[tauri::command]
pub fn desktop_window_is_active(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|window| {
            window.is_visible().unwrap_or(false)
                && !window.is_minimized().unwrap_or(true)
                && window.is_focused().unwrap_or(false)
        })
        .unwrap_or(false)
}
#[tauri::command]
pub fn desktop_behavior_get(app: AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<BehaviorState>();
    let preferences = state
        .preferences
        .lock()
        .map_err(|_| "设置暂时无法读取。")?
        .clone();
    let registered = state
        .registered
        .lock()
        .map_err(|_| "快捷键状态暂时不可用。")?
        .is_some();
    let mut value = serde_json::to_value(preferences).map_err(|_| "设置暂时无法读取。")?;
    value["shortcutRegistered"] = registered.into();
    Ok(value)
}
#[tauri::command]
pub fn desktop_behavior_set(
    app: AppHandle,
    preferences: Preferences,
) -> Result<serde_json::Value, String> {
    if !SHORTCUTS.contains(&preferences.shortcut.as_str()) {
        return Err("请选择列表中的快捷键。".into());
    }
    let state = app.state::<BehaviorState>();
    let previous = state
        .preferences
        .lock()
        .map_err(|_| "设置暂时无法保存。")?
        .clone();
    register_shortcut(&app, &preferences)?;
    let save = || -> Result<(), Box<dyn std::error::Error>> {
        let dir = app.path().app_config_dir()?;
        fs::create_dir_all(&dir)?;
        fs::write(
            dir.join("desktop-behavior.json"),
            serde_json::to_vec(&preferences)?,
        )?;
        Ok(())
    };
    if save().is_err() {
        let _ = register_shortcut(&app, &previous);
        return Err("设置保存失败，请稍后重试。".into());
    }
    *state.preferences.lock().map_err(|_| "设置暂时无法保存。")? = preferences;
    desktop_behavior_get(app)
}

#[cfg(test)]
mod tests {
    use super::{Preferences, SHORTCUTS};
    #[test]
    fn defaults_preserve_exit_and_preview_and_offer_a_recoverable_shortcut() {
        let value: Preferences = serde_json::from_str("{}").unwrap();
        assert!(!value.close_to_tray);
        assert!(value.message_preview);
        assert!(value.shortcut_enabled);
        assert!(SHORTCUTS.contains(&value.shortcut.as_str()));
    }
    #[test]
    fn saved_behavior_roundtrips_without_losing_privacy_choices() {
        let value: Preferences = serde_json::from_str(r#"{"closeToTray":true,"shortcutEnabled":false,"shortcut":"Ctrl+Alt+Q","messagePreview":false}"#).unwrap();
        let saved = serde_json::to_value(value).unwrap();
        assert_eq!(saved["closeToTray"], true);
        assert_eq!(saved["shortcutEnabled"], false);
        assert_eq!(saved["messagePreview"], false);
        assert_eq!(saved["shortcut"], "Ctrl+Alt+Q");
    }
}
