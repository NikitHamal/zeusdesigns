//! Tauri commands for the shared terminal: real PTY sessions and cancellable agent shell runs.

use crate::shell;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Emitter;

pub fn init(app: tauri::AppHandle) {
    shell::set_emitter(Box::new(move |event, payload| {
        let _ = app.emit(event, payload);
    }));
}

pub fn shutdown() {
    shell::cancel_all();
    shell::pty_close_all();
}

fn resolve_dir(root: &str) -> PathBuf {
    let p = PathBuf::from(root.trim());
    if !root.trim().is_empty() && p.is_dir() {
        return p;
    }
    std::env::current_dir()
        .ok()
        .or_else(|| std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir)
}

#[tauri::command(async)]
pub fn term_shells() -> Value {
    let all: Vec<Value> = shell::available_shells().iter().map(|s| s.info()).collect();
    json!({ "default": shell::default_shell().info(), "available": all })
}

#[tauri::command(async)]
pub fn pty_open(root: String, shell: Option<String>, cols: Option<u16>, rows: Option<u16>) -> Result<Value, String> {
    let sh = shell::shell_by_id(shell.as_deref().unwrap_or("auto"));
    shell::pty_open(&sh, &resolve_dir(&root), cols.unwrap_or(100), rows.unwrap_or(28))
}

#[tauri::command]
pub fn pty_write(id: String, data: String) -> Result<(), String> {
    shell::pty_write(&id, &data)
}

#[tauri::command]
pub fn pty_resize(id: String, cols: u16, rows: u16) -> Result<(), String> {
    shell::pty_resize(&id, cols, rows)
}

#[tauri::command(async)]
pub fn pty_close(id: String) {
    shell::pty_close(&id);
}

#[tauri::command]
pub fn pty_attach(id: String) -> Option<Value> {
    shell::pty_attach(&id)
}

#[tauri::command(async)]
pub fn shell_cancel(id: String) -> bool {
    shell::cancel(&id)
}
