// ZeusDesigns native shell & AI engine.
//
// OWNERSHIP: the UI (React, /src) is owned by the frontend track. The backend engine
// (keyless providers, workspace indexer, persistent memory, agent loop, MCP client)
// lives in sibling modules and is registered below.

pub mod agent;
pub mod crypto;
pub mod mcp;
pub mod memory;
pub mod providers;
pub mod workspace;

use serde_json::json;
use std::sync::Arc;

#[tauri::command]
fn app_info() -> serde_json::Value {
    json!({
        "name": "ZeusDesigns",
        "version": env!("CARGO_PKG_VERSION"),
        "native": true,
        "engine": "rust+cpp20-neb-keyless"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(providers::ProviderEngine::default()))
        .manage(workspace::WorkspaceState::default())
        .manage(memory::MemoryStore::default())
        .manage(mcp::McpRegistry::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            agent::providers_list,
            agent::chat_stream,
            agent::chat_cancel,
            agent::title_generate,
            workspace::workspace_open,
            workspace::workspace_tree,
            workspace::fs_read,
            workspace::fs_write,
            workspace::shell_run,
            memory::memory_list,
            memory::memory_add,
            memory::memory_delete,
            mcp::mcp_list,
            mcp::mcp_add,
            mcp::mcp_remove,
            mcp::mcp_tools,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZeusDesigns");
}
