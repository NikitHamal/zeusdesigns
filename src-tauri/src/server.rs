// ZeusDesigns Local OpenAI & Anthropic Compatible Server (`127.0.0.1:11435`).
//
// Exposes all 34 verified keyless providers (including Mercury 3, Gemini Web, LongCat, DeepAI, Qwen, Ptero,
// Unikey, K2Horizon, Motif, YQCloud, ChatJimmy, and Anthropic proxies like FreeCC Gemini 4 Hydrogen)
// as a standard OpenAI `/v1/chat/completions`, `/v1/models`, `/v1/responses` and Anthropic `/v1/messages`
// local HTTP server with a universal tool-calling bridge (`tools` -> `<tool_call>` -> `delta.tool_calls`).

use crate::crypto::{random_hex, uuid_v4};
use crate::providers::{
    catalog, dispatch_stream, AttachmentPayload, ChatMessage, ChatRequest, ProviderEngine,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const DEFAULT_SERVER_PORT: u16 = 11435;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "openaiBaseUrl")]
    pub openai_base_url: String,
    #[serde(rename = "chatCompletionsUrl")]
    pub chat_completions_url: String,
    #[serde(rename = "modelsUrl")]
    pub models_url: String,
    #[serde(rename = "messagesUrl")]
    pub messages_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "requestCount")]
    pub request_count: u64,
    #[serde(rename = "modelCount")]
    pub model_count: usize,
    #[serde(rename = "lastModel")]
    pub last_model: String,
}

pub struct LocalServerState {
    pub running: AtomicBool,
    pub stop_signal: Mutex<Option<Arc<AtomicBool>>>,
    pub port: AtomicU16,
    pub request_count: AtomicU64,
    pub last_model: Mutex<String>,
}

impl Default for LocalServerState {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            stop_signal: Mutex::new(None),
            port: AtomicU16::new(DEFAULT_SERVER_PORT),
            request_count: AtomicU64::new(0),
            last_model: Mutex::new("gemini-4-hydrogen".to_string()),
        }
    }
}

fn handle_openai_responses_api(
    stream: &mut TcpStream,
    want_stream: bool,
    model: &str,
    clean_text: &str,
    tool_calls: &[ParsedToolCall],
    input_tokens: u64,
    output_tokens: u64,
) {
    let resp_id = format!("resp_{}", random_hex(12));
    let mut output_items = Vec::new();
    if !clean_text.is_empty() || tool_calls.is_empty() {
        output_items.push(json!({
            "type": "message",
            "id": format!("msg_{}", random_hex(10)),
            "status": "completed",
            "role": "assistant",
            "content": [{
                "type": "output_text",
                "text": clean_text,
                "annotations": []
            }]
        }));
    }
    for tc in tool_calls {
        output_items.push(json!({
            "type": "function_call",
            "id": format!("fc_{}", random_hex(10)),
            "call_id": tc.id,
            "name": tc.name,
            "arguments": tc.arguments,
            "status": "completed"
        }));
    }

    let full_resp = json!({
        "id": resp_id,
        "object": "response",
        "created_at": now_secs(),
        "status": "completed",
        "model": model,
        "output": output_items,
        "output_text": clean_text,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens
        }
    });

    if !want_stream {
        write_json_response(stream, "200 OK", &full_resp);
        return;
    }

    if write_sse_headers(stream).is_err() {
        return;
    }
    if !clean_text.is_empty() {
        let _ = write_sse_event(
            stream,
            "response.output_text.delta",
            &json!({
                "type": "response.output_text.delta",
                "delta": clean_text
            }),
        );
    }
    let _ = write_sse_event(
        stream,
        "response.completed",
        &json!({
            "type": "response.completed",
            "response": full_resp
        }),
    );
}

pub fn build_status(state: &LocalServerState) -> ServerStatus {
    let running = state.running.load(Ordering::Relaxed);
    let port = state.port.load(Ordering::Relaxed);
    let base = format!("http://127.0.0.1:{}", port);
    let last_model = state
        .last_model
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "gemini-4-hydrogen".to_string());
    ServerStatus {
        running,
        port,
        base_url: base.clone(),
        openai_base_url: format!("{}/v1", base),
        chat_completions_url: format!("{}/v1/chat/completions", base),
        models_url: format!("{}/v1/models", base),
        messages_url: format!("{}/v1/messages", base),
        api_key: "zeus-local".to_string(),
        request_count: state.request_count.load(Ordering::Relaxed),
        model_count: build_openai_models_list().len(),
        last_model,
    }
}

pub fn start_local_server(
    engine: Arc<ProviderEngine>,
    server_state: Arc<LocalServerState>,
    desired_port: Option<u16>,
) -> Result<ServerStatus, String> {
    if server_state.running.load(Ordering::Relaxed) {
        if let Some(p) = desired_port {
            if p != server_state.port.load(Ordering::Relaxed) {
                let _ = stop_local_server(&server_state);
            } else {
                return Ok(build_status(&server_state));
            }
        } else {
            return Ok(build_status(&server_state));
        }
    }

    let base_port = desired_port.unwrap_or_else(|| {
        let cur = server_state.port.load(Ordering::Relaxed);
        if cur > 0 {
            cur
        } else {
            DEFAULT_SERVER_PORT
        }
    });

    let mut bound: Option<(TcpListener, u16)> = None;
    for candidate in base_port..=base_port.saturating_add(12) {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", candidate)) {
            let _ = listener.set_nonblocking(true);
            bound = Some((listener, candidate));
            break;
        }
    }

    let Some((listener, actual_port)) = bound else {
        return Err(format!("Could not bind local server port {}", base_port));
    };

    let stop_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = server_state.stop_signal.lock() {
        *guard = Some(stop_flag.clone());
    }
    server_state.port.store(actual_port, Ordering::Relaxed);
    server_state.running.store(true, Ordering::Relaxed);

    let state_clone = server_state.clone();
    let _ = std::thread::Builder::new()
        .name("zeus-openai-server".to_string())
        .stack_size(256 * 1024)
        .spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _addr)) => {
                        let _ = stream.set_nonblocking(false);
                        let eng = engine.clone();
                        let st = state_clone.clone();
                        let _ = std::thread::Builder::new()
                            .name("zeus-http-worker".to_string())
                            .stack_size(256 * 1024)
                            .spawn(move || {
                                handle_http_connection(stream, eng, st);
                            });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(25));
                    }
                    Err(_) => {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                }
            }
            state_clone.running.store(false, Ordering::Relaxed);
        });

    Ok(build_status(&server_state))
}

pub fn stop_local_server(server_state: &LocalServerState) -> Result<ServerStatus, String> {
    if let Ok(mut guard) = server_state.stop_signal.lock() {
        if let Some(flag) = guard.take() {
            flag.store(true, Ordering::Relaxed);
        }
    }
    server_state.running.store(false, Ordering::Relaxed);
    Ok(build_status(server_state))
}

#[tauri::command]
pub fn server_status(state: tauri::State<'_, Arc<LocalServerState>>) -> ServerStatus {
    build_status(&state)
}

#[tauri::command(async)]
pub fn server_start(
    port: Option<u16>,
    engine: tauri::State<'_, Arc<ProviderEngine>>,
    state: tauri::State<'_, Arc<LocalServerState>>,
) -> Result<ServerStatus, String> {
    start_local_server(engine.inner().clone(), state.inner().clone(), port)
}

#[tauri::command(async)]
pub fn server_stop(state: tauri::State<'_, Arc<LocalServerState>>) -> Result<ServerStatus, String> {
    stop_local_server(&state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_provider_and_model_handles_gemini_4_hydrogen_and_scoped_ids() {
        assert_eq!(
            resolve_provider_and_model("gemini-4-hydrogen"),
            (
                "freecc".to_string(),
                "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen".to_string()
            )
        );
        assert_eq!(
            resolve_provider_and_model("zeusdesigns/gemini-4-hydrogen"),
            (
                "freecc".to_string(),
                "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen".to_string()
            )
        );
        assert_eq!(
            resolve_provider_and_model("unikey/claude-opus-5-5"),
            ("unikey".to_string(), "claude-opus-5-5".to_string())
        );
    }

    #[test]
    fn test_extract_tool_calls_from_text_parses_xml_and_strips_tags() {
        let mut known = HashSet::new();
        known.insert("bash".to_string());
        let raw = "I will list the directory.\n<tool_call>{\"name\": \"bash\", \"arguments\": {\"command\": \"ls -la\"}}</tool_call>";
        let (clean, calls) = extract_tool_calls_from_text(raw, &known);
        assert_eq!(clean, "I will list the directory.");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "bash");
        assert!(calls[0].arguments.contains("ls -la"));
    }

    #[test]
    fn test_split_thinking_and_strip_tool_xml_preserves_answer_after_quoted_think_and_zeus_tool() {
        let raw = "<think>The user explicitly asked \"which model r u\". However, the harness prompt says \"First write your brief step-by-step reasoning inside <think>...</think>, then emit <zeus_tool ...> outside <think> to execute this request.\" Since no tool is needed, I will answer directly.</think>\n\nI am agnes-3.0-pro, developed by Sapiens AI.";
        let (rsn, vis) = split_thinking_and_content(raw);
        let clean = strip_tool_xml_for_oc(&vis);
        assert!(rsn.contains("First write your brief step-by-step reasoning"));
        assert!(rsn.contains("Since no tool is needed"));
        assert_eq!(clean, "I am agnes-3.0-pro, developed by Sapiens AI.");
    }
}


include!("server_models.rs");
include!("server_util.rs");
include!("server_http.rs");
