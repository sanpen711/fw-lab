use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{image::Image, AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::{os::windows::process::CommandExt, process::Command};

const DEFAULT_NAME: &str = "F.w 研究所";
const IDENTITY_FILE: &str = "desktop-identity.json";
const ICONS: &[&str] = &[
    "folder", "document", "computer", "drive", "image", "archive", "text", "printer",
    "network",
];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopIdentity {
    pub mode: String,
    pub display_name: String,
    pub icon: String,
}

impl Default for DesktopIdentity {
    fn default() -> Self {
        Self {
            mode: "default".to_owned(),
            display_name: DEFAULT_NAME.to_owned(),
            icon: "folder".to_owned(),
        }
    }
}

fn identity_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位客户端设置目录：{error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建客户端设置目录：{error}"))?;
    Ok(dir.join(IDENTITY_FILE))
}

fn valid_icon(value: &str) -> bool {
    ICONS.contains(&value)
}

fn valid_name(value: &str) -> bool {
    let name = value.trim();
    !name.is_empty()
        && name.chars().count() <= 24
        && !name.ends_with('.')
        && !name.ends_with(' ')
        && !name.chars().any(|value| "<>:\"/\\|?*".contains(value))
}

fn normalize(mut value: DesktopIdentity) -> DesktopIdentity {
    if value.mode != "custom" {
        return DesktopIdentity::default();
    }
    value.display_name = value.display_name.trim().to_owned();
    if !valid_name(&value.display_name) {
        value.display_name = "工作资料".to_owned();
    }
    if value.icon == "table" {
        value.icon = "drive".to_owned();
    } else if !valid_icon(&value.icon) {
        value.icon = "folder".to_owned();
    }
    value
}

pub fn read(app: &AppHandle) -> DesktopIdentity {
    let Ok(path) = identity_path(app) else {
        return DesktopIdentity::default();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return DesktopIdentity::default();
    };
    serde_json::from_str::<DesktopIdentity>(&raw)
        .map(normalize)
        .unwrap_or_default()
}

fn icon_png(name: &str) -> &'static [u8] {
    match name {
        "folder" => include_bytes!("../icons/identity/folder.png"),
        "document" => include_bytes!("../icons/identity/document.png"),
        "computer" => include_bytes!("../icons/identity/computer.png"),
        "drive" => include_bytes!("../icons/identity/drive.png"),
        "image" => include_bytes!("../icons/identity/image.png"),
        "archive" => include_bytes!("../icons/identity/archive.png"),
        "text" => include_bytes!("../icons/identity/text.png"),
        "printer" => include_bytes!("../icons/identity/printer.png"),
        "network" => include_bytes!("../icons/identity/network.png"),
        _ => include_bytes!("../icons/identity/default.png"),
    }
}

fn icon_ico(name: &str) -> &'static [u8] {
    match name {
        "folder" => include_bytes!("../icons/identity/folder.ico"),
        "document" => include_bytes!("../icons/identity/document.ico"),
        "computer" => include_bytes!("../icons/identity/computer.ico"),
        "drive" => include_bytes!("../icons/identity/drive.ico"),
        "image" => include_bytes!("../icons/identity/image.ico"),
        "archive" => include_bytes!("../icons/identity/archive.ico"),
        "text" => include_bytes!("../icons/identity/text.ico"),
        "printer" => include_bytes!("../icons/identity/printer.ico"),
        "network" => include_bytes!("../icons/identity/network.ico"),
        _ => include_bytes!("../icons/identity/default.ico"),
    }
}

fn icon_file(app: &AppHandle, icon: &str) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位图标目录：{error}"))?
        .join("identity-icons");
    fs::create_dir_all(&root).map_err(|error| format!("无法创建图标目录：{error}"))?;
    let name = if valid_icon(icon) { icon } else { "default" };
    let path = root.join(format!("{name}.ico"));
    fs::write(&path, icon_ico(name)).map_err(|error| format!("无法保存客户端图标：{error}"))?;
    Ok(path)
}

fn apply_window(app: &AppHandle, identity: &DesktopIdentity) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    window
        .set_title(&identity.display_name)
        .map_err(|error| format!("无法修改窗口名称：{error}"))?;
    let icon_name = if identity.mode == "custom" {
        identity.icon.as_str()
    } else {
        "default"
    };
    let icon = Image::from_bytes(icon_png(icon_name))
        .map_err(|error| format!("无法读取客户端图标：{error}"))?;
    window
        .set_icon(icon)
        .map_err(|error| format!("无法修改窗口图标：{error}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn update_shortcuts(app: &AppHandle, identity: &DesktopIdentity) -> Result<(), String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let executable = std::env::current_exe().map_err(|error| format!("无法定位客户端程序：{error}"))?;
    let icon_name = if identity.mode == "custom" {
        identity.icon.as_str()
    } else {
        "default"
    };
    let icon = icon_file(app, icon_name)?;
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$exe = $env:FW_IDENTITY_EXE
$name = $env:FW_IDENTITY_NAME
$icon = $env:FW_IDENTITY_ICON
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$taskbar = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
$roots = @($desktop, $programs, $taskbar) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$shell = New-Object -ComObject WScript.Shell
foreach ($root in $roots) {
  $isTaskbar = [string]::Equals($root, $taskbar, [StringComparison]::OrdinalIgnoreCase)
  Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse | ForEach-Object {
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -and [string]::Equals([IO.Path]::GetFullPath($shortcut.TargetPath), [IO.Path]::GetFullPath($exe), [StringComparison]::OrdinalIgnoreCase)) {
      $shortcut.IconLocation = $icon + ',0'
      $shortcut.Description = $name
      $shortcut.Save()
      if (-not $isTaskbar) {
        $next = Join-Path $_.DirectoryName ($name + '.lnk')
        if (-not [string]::Equals($_.FullName, $next, [StringComparison]::OrdinalIgnoreCase)) {
          Move-Item -LiteralPath $_.FullName -Destination $next -Force
        }
      }
    }
  }
}
"#;
    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .env("FW_IDENTITY_EXE", executable)
        .env("FW_IDENTITY_NAME", &identity.display_name)
        .env("FW_IDENTITY_ICON", icon)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| format!("无法更新桌面快捷方式：{error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Windows 没有完成快捷方式更新。".to_owned())
    }
}

#[cfg(not(target_os = "windows"))]
fn update_shortcuts(_app: &AppHandle, _identity: &DesktopIdentity) -> Result<(), String> {
    Ok(())
}

pub fn apply_saved(app: &AppHandle) -> Result<DesktopIdentity, String> {
    let identity = read(app);
    apply_window(app, &identity)?;
    Ok(identity)
}

pub fn display_name(app: &AppHandle) -> String {
    read(app).display_name
}

#[tauri::command]
pub fn desktop_identity_get(app: AppHandle) -> DesktopIdentity {
    read(&app)
}

#[tauri::command]
pub fn desktop_identity_set(
    app: AppHandle,
    mode: String,
    name: String,
    icon: String,
) -> Result<DesktopIdentity, String> {
    let identity = if mode == "custom" {
        let display_name = name.trim().to_owned();
        if !valid_name(&display_name) {
            return Err("应用名称为空、过长或包含 Windows 不支持的字符。".to_owned());
        }
        if !valid_icon(&icon) {
            return Err("请选择有效的应用图标。".to_owned());
        }
        DesktopIdentity {
            mode,
            display_name,
            icon,
        }
    } else {
        DesktopIdentity::default()
    };
    let path = identity_path(&app)?;
    let temp = path.with_extension("json.tmp");
    let raw = serde_json::to_vec_pretty(&identity)
        .map_err(|error| format!("无法整理应用显示设置：{error}"))?;
    fs::write(&temp, raw).map_err(|error| format!("无法保存应用显示设置：{error}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("无法替换旧设置：{error}"))?;
    }
    fs::rename(temp, path).map_err(|error| format!("无法启用应用显示设置：{error}"))?;
    apply_window(&app, &identity)?;
    let _ = update_shortcuts(&app, &identity);
    Ok(identity)
}
