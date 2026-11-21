// ZeusDesigns native shell.
//
// OWNERSHIP: the UI (React, /src) is owned by the frontend track. The backend engine
// (providers, workspace, memory, agent loop, MCP) lives in sibling modules and is
// registered below. See docs/BACKEND_CONTRACT.md for the command/event contract the UI calls.

use serde_json::json;

#[tauri::command]
fn app_info() -> serde_json::Value {
    json!({
        "name": "ZeusDesigns",
        "version": env!("CARGO_PKG_VERSION"),
        "native": true,
        "engine": "rust"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Backend track: add `mod engine;` etc. and append commands to this list.
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running ZeusDesigns");
}
