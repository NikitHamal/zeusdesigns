// ZeusDesigns native shell & AI engine.
//
// OWNERSHIP: the UI (React, /src) is owned by the frontend track. The backend engine
// (keyless providers, workspace indexer, persistent memory, agent loop, MCP client,
// and Local OpenAI/OpenCode Server) lives in sibling modules and is registered below.

pub mod agent;
pub mod crypto;
pub mod mcp;
pub mod memory;
pub mod perf;
pub mod providers;
pub mod server;
pub mod updater;
pub mod workspace;

use serde_json::json;
use std::sync::Arc;
use tauri::Manager;

extern "C" {
    fn zeus_engine_version() -> *const std::os::raw::c_char;
}

#[tauri::command]
fn app_info() -> serde_json::Value {
    let cpp_ver = unsafe {
        let ptr = zeus_engine_version();
        if ptr.is_null() {
            "1.0.0-m3e"
        } else {
            std::ffi::CStr::from_ptr(ptr).to_str().unwrap_or("1.0.0-m3e")
        }
    };
    json!({
        "name": "Zeus Codes",
        "version": env!("CARGO_PKG_VERSION"),
        "cppEngineVersion": cpp_ver,
        "native": true,
        "engine": "rust+cpp20-neb-keyless"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let provider_engine = Arc::new(providers::ProviderEngine::default());
    let local_server_state = Arc::new(server::LocalServerState::default());

    // Local OpenAI & OpenCode server is off by default; users can start it from Settings > Local server
    // or on demand when launching the OpenCode runtime.

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            workspace::set_term_app(app.handle().clone());
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.maximize();
                let _ = win.set_focus();
            }
            Ok(())
        })
        .manage(provider_engine)
        .manage(local_server_state)
        .manage(workspace::WorkspaceState::default())
        .manage(memory::MemoryStore::default())
        .manage(mcp::McpRegistry::default())
        .manage(perf::PerfGovernor::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            perf::perf_stats,
            perf::perf_trim,
            perf::perf_set_auto,
            server::server_status,
            server::server_start,
            server::server_stop,
            server::server_opencode_config,
            server::server_install_opencode,
            updater::update_check,
            updater::update_install,
            agent::providers_list,
            agent::provider_verify_model,
            agent::chat_stream,
            agent::chat_cancel,
            agent::title_generate,
            workspace::workspace_pick,
            workspace::workspace_open,
            workspace::workspace_tree,
            workspace::workspace_list,
            workspace::workspace_search,
            workspace::workspace_checkpoints,
            workspace::workspace_restore_checkpoint,
            workspace::workspace_audit,
            workspace::workspace_git_status,
            workspace::fs_read,
            workspace::fs_write,
            workspace::fs_delete,
            workspace::fs_move,
            workspace::shell_run,
            memory::memory_list,
            memory::memory_search,
            memory::memory_add,
            memory::memory_update,
            memory::memory_delete,
            mcp::mcp_list,
            mcp::mcp_add,
            mcp::mcp_remove,
            mcp::mcp_tools,
            mcp::mcp_call,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZeusDesigns");
}
