use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const CACHE_FOLDER: &str = "Cache";
const CACHE_DB_FILE: &str = "fw-cache.db";
static CACHE_LOCATION: OnceLock<(PathBuf, bool)> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentCacheStatus {
    enabled: bool,
    entries: u64,
    bytes: u64,
    path: String,
    fallback: bool,
}

fn valid_cache_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 160
        && key.bytes().all(|byte| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || byte == b'-'
                || byte == b'_'
        })
}

fn prepare_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("无法创建缓存目录：{error}"))?;
    fs::create_dir_all(dir.join("media")).map_err(|error| format!("无法创建媒体缓存目录：{error}"))?;
    fs::create_dir_all(dir.join("temp")).map_err(|error| format!("无法创建临时缓存目录：{error}"))?;
    let probe = dir.join(format!(".fw-cache-write-{}.tmp", std::process::id()));
    fs::write(&probe, b"ok").map_err(|error| format!("缓存目录不可写：{error}"))?;
    let _ = fs::remove_file(probe);
    Ok(())
}

fn resolve_cache_dir(app: &AppHandle) -> Result<(PathBuf, bool), String> {
    if let Some((dir, fallback)) = CACHE_LOCATION.get() {
        return Ok((dir.clone(), *fallback));
    }

    let resolved = if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let preferred = parent.join(CACHE_FOLDER);
            if prepare_dir(&preferred).is_ok() {
                Some((preferred, false))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let (dir, fallback) = if let Some(value) = resolved {
        value
    } else {
        let fallback = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法定位备用缓存目录：{error}"))?
            .join(CACHE_FOLDER);
        prepare_dir(&fallback)?;
        (fallback, true)
    };

    let _ = CACHE_LOCATION.set((dir.clone(), fallback));
    if let Some((cached, cached_fallback)) = CACHE_LOCATION.get() {
        Ok((cached.clone(), *cached_fallback))
    } else {
        Ok((dir, fallback))
    }
}

fn dir_bytes(dir: &Path) -> u64 {
    fn walk(path: &Path, total: &mut u64) {
        let Ok(entries) = fs::read_dir(path) else { return; };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, total);
            } else if let Ok(meta) = entry.metadata() {
                *total = total.saturating_add(meta.len());
            }
        }
    }
    let mut total = 0u64;
    walk(dir, &mut total);
    total
}

fn open_db(app: &AppHandle) -> Result<(Connection, PathBuf, bool), String> {
    let (dir, fallback) = resolve_cache_dir(app)?;
    let path = dir.join(CACHE_DB_FILE);
    let connection = Connection::open(&path).map_err(|error| format!("无法打开本地缓存数据库：{error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode=WAL;\n\
             PRAGMA synchronous=NORMAL;\n\
             CREATE TABLE IF NOT EXISTS cache_entries (\n\
               cache_key TEXT PRIMARY KEY,\n\
               value_json TEXT NOT NULL,\n\
               updated_at INTEGER NOT NULL\n\
             );",
        )
        .map_err(|error| format!("无法初始化本地缓存数据库：{error}"))?;
    Ok((connection, path, fallback))
}

fn status_from(connection: &Connection, path: &Path, fallback: bool) -> Result<PersistentCacheStatus, String> {
    let entries: u64 = connection
        .query_row("SELECT COUNT(*) FROM cache_entries", [], |row| row.get(0))
        .map_err(|error| format!("无法统计缓存条目：{error}"))?;
    let dir = path.parent().unwrap_or(path);
    Ok(PersistentCacheStatus {
        enabled: true,
        entries,
        bytes: dir_bytes(dir),
        path: dir.to_string_lossy().into_owned(),
        fallback,
    })
}

pub fn init(app: &AppHandle) -> Result<PersistentCacheStatus, String> {
    let (connection, path, fallback) = open_db(app)?;
    status_from(&connection, &path, fallback)
}

#[tauri::command]
pub fn desktop_persistent_cache_read(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    if !valid_cache_key(&key) {
        return Err("缓存名称不合法。".to_owned());
    }
    let (connection, _path, _fallback) = open_db(&app)?;
    let raw: Option<String> = connection
        .query_row(
            "SELECT value_json FROM cache_entries WHERE cache_key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("无法读取本地缓存：{error}"))?;
    let Some(raw) = raw else { return Ok(None); };
    match serde_json::from_str::<Value>(&raw) {
        Ok(value) => Ok(Some(value)),
        Err(_) => {
            let _ = connection.execute("DELETE FROM cache_entries WHERE cache_key = ?1", params![key]);
            Ok(None)
        }
    }
}

#[tauri::command]
pub fn desktop_persistent_cache_write(app: AppHandle, key: String, value: Value) -> Result<PersistentCacheStatus, String> {
    if !valid_cache_key(&key) {
        return Err("缓存名称不合法。".to_owned());
    }
    let raw = serde_json::to_string(&value).map_err(|error| format!("无法整理缓存数据：{error}"))?;
    let updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or_default();
    let (connection, path, fallback) = open_db(&app)?;
    connection
        .execute(
            "INSERT INTO cache_entries(cache_key,value_json,updated_at) VALUES(?1,?2,?3)\n\
             ON CONFLICT(cache_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
            params![key, raw, updated_at],
        )
        .map_err(|error| format!("无法写入本地缓存：{error}"))?;
    status_from(&connection, &path, fallback)
}

#[tauri::command]
pub fn desktop_persistent_cache_remove(app: AppHandle, key: String) -> Result<PersistentCacheStatus, String> {
    if !valid_cache_key(&key) {
        return Err("缓存名称不合法。".to_owned());
    }
    let (connection, path, fallback) = open_db(&app)?;
    connection
        .execute("DELETE FROM cache_entries WHERE cache_key = ?1", params![key])
        .map_err(|error| format!("无法删除本地缓存：{error}"))?;
    status_from(&connection, &path, fallback)
}

#[tauri::command]
pub fn desktop_persistent_cache_status(app: AppHandle) -> Result<PersistentCacheStatus, String> {
    let (connection, path, fallback) = open_db(&app)?;
    status_from(&connection, &path, fallback)
}
