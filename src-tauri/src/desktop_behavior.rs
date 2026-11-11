use serde::{Deserialize, Serialize};
use std::{
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub close_to_tray: bool,
    pub shortcut: Option<String>,
    pub message_preview: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            close_to_tray: false,
            shortcut: None,
            message_preview: true,
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPreferences {
    #[serde(flatten)]
    preferences: Preferences,
    shortcut_enabled: Option<bool>,
}

fn load_preferences(bytes: &[u8]) -> Option<Preferences> {
    let stored: StoredPreferences = serde_json::from_slice(bytes).ok()?;
    let mut preferences = stored.preferences;
    if stored.shortcut_enabled == Some(false) {
        preferences.shortcut = None;
    }
    Some(preferences)
}

#[derive(Deserialize)]
#[serde(tag = "section", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum PreferencesChange {
    Window {
        close_to_tray: bool,
        shortcut: Option<String>,
    },
    Privacy {
        message_preview: bool,
    },
}

#[derive(Clone)]
struct Behavior {
    preferences: Preferences,
    registered: Option<Shortcut>,
}

pub struct BehaviorState {
    current: Mutex<Behavior>,
    saving: Mutex<()>,
    recording: AtomicBool,
}

fn parse_shortcut(value: &str) -> Result<Shortcut, String> {
    if value.len() > 64 {
        return Err("这个快捷键无法使用，请重新录入。".into());
    }
    value
        .parse()
        .map_err(|_| "这个快捷键无法使用，请重新录入。".into())
}

fn change_shortcut(
    app: &AppHandle,
    previous: Option<Shortcut>,
    wanted: Option<Shortcut>,
) -> Result<(), String> {
    if wanted == previous {
        return Ok(());
    }
    let manager = app.global_shortcut();
    if let Some(shortcut) = wanted {
        manager.register(shortcut).map_err(|_| {
            "快捷键已被占用或由系统保留，请换一个键。"
        })?;
    }
    if let Some(old) = previous {
        if manager.unregister(old).is_err() {
            if let Some(shortcut) = wanted {
                let _ = manager.unregister(shortcut);
            }
            return Err("无法更改当前快捷键，请重试。".into());
        }
    }
    Ok(())
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
pub fn initialize(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let path = app.path().app_config_dir()?.join("desktop-behavior.json");
    let preferences = fs::read(&path)
        .ok()
        .and_then(|bytes| load_preferences(&bytes))
        .unwrap_or_default();
    app.manage(BehaviorState {
        current: Mutex::new(Behavior {
            preferences: preferences.clone(),
            registered: None,
        }),
        saving: Mutex::new(()),
        recording: AtomicBool::new(false),
    });
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                let state = app.state::<BehaviorState>();
                if state.recording.load(Ordering::Acquire) && desktop_window_is_active(app.clone()) {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval("window.dispatchEvent(new Event('fw:registered-shortcut-captured'));");
                    }
                    return;
                }
                toggle_window(app);
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
    if let Some(shortcut) = preferences.shortcut.as_deref().and_then(|key| parse_shortcut(key).ok()) {
        if app.global_shortcut().register(shortcut).is_ok() {
            app.state::<BehaviorState>().current.lock().unwrap().registered = Some(shortcut);
        }
    }
    Ok(())
}
pub fn close_to_tray(app: &AppHandle) -> bool {
    app.try_state::<BehaviorState>()
        .and_then(|state| {
            state
                .current
                .lock()
                .ok()
                .map(|value| value.preferences.close_to_tray)
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
pub fn desktop_shortcut_capture(app: AppHandle, active: bool) {
    if let Some(state) = app.try_state::<BehaviorState>() {
        state
            .recording
            .store(active && desktop_window_is_active(app.clone()), Ordering::Release);
    }
}

fn behavior_response(current: &Behavior) -> Result<serde_json::Value, String> {
    let mut value = serde_json::to_value(&current.preferences).map_err(|_| "设置暂时无法读取。")?;
    value["shortcutRegistered"] = current.registered.is_some().into();
    Ok(value)
}

#[tauri::command]
pub fn desktop_behavior_get(app: AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<BehaviorState>();
    let current = state.current.lock().map_err(|_| "设置暂时无法读取。")?;
    behavior_response(&current)
}

#[tauri::command]
pub fn desktop_behavior_set(
    app: AppHandle,
    change: PreferencesChange,
) -> Result<serde_json::Value, String> {
    let state = app.state::<BehaviorState>();
    let _saving = state.saving.try_lock().map_err(|_| "设置正在保存，请稍后重试。")?;
    let previous = state.current.lock().map_err(|_| "设置暂时无法保存。")?.clone();
    let mut next = previous.clone();
    match change {
        PreferencesChange::Window { close_to_tray, shortcut } => {
            next.registered = shortcut.as_deref().map(parse_shortcut).transpose()?;
            next.preferences.close_to_tray = close_to_tray;
            next.preferences.shortcut = shortcut;
        }
        PreferencesChange::Privacy { message_preview } => {
            next.preferences.message_preview = message_preview;
        }
    }

    let error = "设置保存失败，请稍后重试。";
    let dir = app.path().app_config_dir().map_err(|_| error)?;
    fs::create_dir_all(&dir).map_err(|_| error)?;
    let path = dir.join("desktop-behavior.json");
    let temp = path.with_extension("json.tmp");
    let json = serde_json::to_vec(&next.preferences).map_err(|_| error)?;
    fs::write(&temp, json).map_err(|_| error)?;
    if let Err(reason) = change_shortcut(&app, previous.registered, next.registered) {
        let _ = fs::remove_file(&temp);
        return Err(reason);
    }
    if fs::rename(&temp, &path).is_err() {
        let _ = fs::remove_file(&temp);
        let _ = change_shortcut(&app, next.registered, previous.registered);
        return Err(error.into());
    }
    *state.current.lock().map_err(|_| error)? = next.clone();
    behavior_response(&next)
}

#[cfg(test)]
mod tests {
    use super::{load_preferences, parse_shortcut, Preferences, PreferencesChange};

    #[test]
    fn default_shortcut_is_unset() {
        let value = load_preferences(b"{}").unwrap();
        assert!(!value.close_to_tray);
        assert!(value.message_preview);
        assert_eq!(value.shortcut, None);
    }

    #[test]
    fn migrate_saved_settings_and_respect_disabled_shortcuts() {
        let enabled = load_preferences(br#"{"shortcutEnabled":true,"shortcut":"Ctrl+Alt+Q"}"#).unwrap();
        assert_eq!(enabled.shortcut.as_deref(), Some("Ctrl+Alt+Q"));
        let disabled = load_preferences(br#"{"closeToTray":true,"shortcutEnabled":false,"shortcut":"Ctrl+Alt+Q","messagePreview":false}"#).unwrap();
        assert!(disabled.close_to_tray);
        assert!(!disabled.message_preview);
        assert_eq!(disabled.shortcut, None);
        let saved = serde_json::to_vec(&disabled).unwrap();
        assert_eq!(load_preferences(&saved).unwrap().shortcut, None);
    }

    #[test]
    fn parse_single_keys_and_combinations_from_the_recorder() {
        for key in ["F9", "A", "9", "Numpad3", "Ctrl+Shift+F9", "Super+Alt+KeyK"] {
            assert!(parse_shortcut(key).is_ok(), "{key}");
        }
        for key in ["Ctrl", "F9+Q", "", "UnknownKey"] {
            assert!(parse_shortcut(key).is_err(), "{key}");
        }
        let value = Preferences { shortcut: Some("F9".into()), ..Preferences::default() };
        assert_eq!(load_preferences(&serde_json::to_vec(&value).unwrap()).unwrap().shortcut, value.shortcut);
        let change = serde_json::from_str::<PreferencesChange>(r#"{"section":"window","closeToTray":true,"shortcut":null}"#).unwrap();
        assert!(matches!(change, PreferencesChange::Window { close_to_tray: true, shortcut: None }));
    }
}
