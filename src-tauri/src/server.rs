// ZeusDesigns Local OpenAI & Anthropic Compatible Server (`127.0.0.1:11435`).
//
// Exposes all 34 verified keyless providers (including Mercury 3, Gemini Web, LongCat, DeepAI, Qwen, Ptero,
// Unikey, K2Horizon, Motif, YQCloud, ChatJimmy, and Anthropic proxies like FreeCC Gemini 4 Hydrogen)
// as a standard OpenAI `/v1/chat/completions`, `/v1/models`, `/v1/responses` and Anthropic `/v1/messages`
// local HTTP server with a Universal OpenCode Tool-Calling Bridge (`tools` -> `<tool_call>` -> `delta.tool_calls`).

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
    #[serde(rename = "opencodeConfigUrl")]
    pub opencode_config_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "requestCount")]
    pub request_count: u64,
    #[serde(rename = "modelCount")]
    pub model_count: usize,
    #[serde(rename = "lastModel")]
    pub last_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcSession {
    pub id: String,
    pub title: String,
    pub directory: String,
    pub messages: Vec<ChatMessage>,
    pub created: u64,
}

pub struct LocalServerState {
    pub running: AtomicBool,
    pub stop_signal: Mutex<Option<Arc<AtomicBool>>>,
    pub port: AtomicU16,
    pub request_count: AtomicU64,
    pub last_model: Mutex<String>,
    pub oc_sessions: Mutex<std::collections::HashMap<String, OcSession>>,
    pub oc_cancels: Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>,
    pub oc_subscribers: Mutex<Vec<std::sync::mpsc::Sender<Value>>>,
}

impl Default for LocalServerState {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            stop_signal: Mutex::new(None),
            port: AtomicU16::new(DEFAULT_SERVER_PORT),
            request_count: AtomicU64::new(0),
            last_model: Mutex::new("gemini-4-hydrogen".to_string()),
            oc_sessions: Mutex::new(std::collections::HashMap::new()),
            oc_cancels: Mutex::new(std::collections::HashMap::new()),
            oc_subscribers: Mutex::new(Vec::new()),
        }
    }
}

impl LocalServerState {
    pub fn broadcast_oc_event(&self, ev: Value) {
        if let Ok(mut subs) = self.oc_subscribers.lock() {
            subs.retain(|tx| tx.send(ev.clone()).is_ok());
        }
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h1 = (bytes[i + 1] as char).to_digit(16);
            let h2 = (bytes[i + 2] as char).to_digit(16);
            if let (Some(d1), Some(d2)) = (h1, h2) {
                out.push(((d1 << 4) | d2) as u8);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiModelEntry {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub owned_by: String,
    pub provider: String,
    pub label: String,
    pub reasoning: bool,
    pub vision: bool,
    pub tool_call: bool,
    pub context_window: u64,
    pub max_output: u64,
}

#[derive(Debug, Clone)]
pub struct ParsedToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// Build the full OpenAI-compatible model catalog across all 31 keyless providers plus top-level OpenCode aliases.
pub fn build_openai_models_list() -> Vec<OpenAiModelEntry> {
    let created = 1740000000;
    let mut list = Vec::new();
    let mut seen = HashSet::new();

    // Featured top-level aliases so OpenCode users can select `gemini-4-hydrogen`, `mercury-3`, etc. directly
    let featured = [
        (
            "mercury-3",
            "mercury3",
            "Mercury 3 Diffusion 2,000+ tok/s (Zeus Inception)",
            true,
            false,
            128000,
            16384,
        ),
        (
            "gemini-4-hydrogen",
            "gemini4",
            "Gemini 4 Hydrogen (Zeus Gemini 4 Direct + 5-Node Cluster)",
            false,
            false,
            1000000,
            32768,
        ),
        (
            "gemini-4-hydrogen-thinking",
            "gemini4",
            "Gemini 4 Hydrogen Thinking (Zeus Gemini 4 Direct)",
            true,
            false,
            1000000,
            32768,
        ),
        (
            "gemini-4-hydrogen-high",
            "antigravity",
            "Gemini 4 Hydrogen High (Zeus Antigravity Hub)",
            true,
            false,
            1000000,
            32768,
        ),
        (
            "gemini-4-hydrogen-xhigh",
            "antigravity",
            "Gemini 4 Hydrogen XHigh (Zeus Antigravity Hub)",
            true,
            false,
            1000000,
            32768,
        ),
        (
            "gemini-4-neon",
            "gemini4",
            "Gemini 4 Neon (Zeus Gemini 4 Cluster)",
            true,
            false,
            1000000,
            32768,
        ),
        (
            "gemini-4-carbon",
            "gemini4",
            "Gemini 4 Carbon (Zeus Gemini 4 Cluster)",
            true,
            false,
            1000000,
            32768,
        ),
        (
            "gemini-4-argon",
            "antigravity",
            "Gemini 4 Argon High (Zeus Antigravity Hub)",
            true,
            false,
            1000000,
            32768,
        ),
        (
            "claude-sonnet-5-5",
            "claude5proxy",
            "Claude Sonnet 5.5 (Zeus Claude 5.5 Hub)",
            true,
            true,
            200000,
            16384,
        ),
        (
            "gemini-3-flash-preview",
            "freecc",
            "Gemini 3 Flash VL (Zeus FreeCC)",
            true,
            true,
            262144,
            16384,
        ),
        (
            "claude-opus-5-5",
            "claude5proxy",
            "Claude Opus 5.5 (Zeus Claude 5.5 & Antigravity Hub)",
            true,
            false,
            200000,
            16384,
        ),
        (
            "gpt-6.1-sol",
            "unikey",
            "GPT-6.1 Sol (Zeus Unikey)",
            true,
            false,
            200000,
            16384,
        ),
        (
            "gpt-6-astra",
            "unikey",
            "GPT-6 Astra (Zeus Unikey)",
            true,
            false,
            200000,
            16384,
        ),
        (
            "gpt-6-luna",
            "unikey",
            "GPT-6 Luna (Zeus Unikey)",
            false,
            false,
            128000,
            12288,
        ),
        (
            "claude-haiku-5-5",
            "deepai",
            "Claude Haiku 5.5 (Zeus DeepAI)",
            false,
            false,
            64000,
            8192,
        ),
        (
            "qwen4-max",
            "qwen",
            "Qwen 4 Max (Zeus Qwen App)",
            true,
            true,
            256000,
            16384,
        ),
        (
            "gemini-3.1-pro",
            "gemweb2api",
            "Gemini 3.1 Pro (Zeus Gemini Web)",
            true,
            false,
            262144,
            16384,
        ),
        (
            "deepseek-v4-pro",
            "hfrouter",
            "DeepSeek V4 Pro (Zeus HF Router)",
            true,
            false,
            262144,
            16384,
        ),
        (
            "qwen3-235b",
            "freellmhub",
            "Qwen3 235B (Zeus FreeLLM Hub)",
            true,
            false,
            131072,
            16384,
        ),
        (
            "kimi-k2.6",
            "freellmhub",
            "Kimi K2.6 (Zeus FreeLLM Hub)",
            true,
            false,
            131072,
            16384,
        ),
        (
            "grok-4.20",
            "aibridge",
            "Grok 4.20 (Zeus AI Bridge)",
            true,
            false,
            131072,
            16384,
        ),
        (
            "nemotron-3-ultra-free",
            "litellmhub",
            "Nemotron 3 Ultra 550B (Zeus LiteLLM Hub)",
            true,
            false,
            262144,
            16384,
        ),
        (
            "Qwen3.6-35B-A3B",
            "colibriqwen",
            "Qwen 3.6 35B A3B MoE (Zeus Colibri)",
            true,
            false,
            131072,
            16384,
        ),
        (
            "DeepSeek-V4.1-Flash-1017",
            "ovhcloud",
            "DeepSeek V4.1 Flash (Zeus OVHcloud)",
            true,
            false,
            262144,
            16384,
        ),
        (
            "glm-5.3",
            "freellmhub",
            "GLM 5.3 Flagship (Zeus FreeLLM Hub)",
            true,
            false,
            262144,
            16384,
        ),
        (
            "kimi-k3",
            "unikey",
            "Kimi K3 2.8T (Zeus Unikey)",
            true,
            false,
            128000,
            8192,
        ),
        (
            "nemotron-3.5-super-vl",
            "kilo",
            "Nemotron 3.5 Super VL 120B (Zeus Kilo)",
            true,
            true,
            262144,
            16384,
        ),
        (
            "nemotron-3-ultra-550b",
            "nimcloud",
            "Nemotron 3 Ultra 550B (Zeus NIM Cloud)",
            true,
            false,
            262144,
            16384,
        ),
        (
            "mistral-large-4-1t",
            "nimcloud",
            "Mistral Large 4 1T A52B (Zeus NIM Cloud)",
            true,
            false,
            262144,
            16384,
        ),
        (
            "k2-horizon",
            "k2horizon",
            "K2-Horizon 375B Reasoning (Zeus IFM)",
            true,
            false,
            128000,
            8192,
        ),
        (
            "motif-3-102b",
            "motif",
            "Motif 3 102B Reasoning (Zeus Motif)",
            true,
            false,
            128000,
            8192,
        ),
    ];

    for (id, prov, label, reasoning, vision, ctx, max_out) in featured {
        seen.insert(id.to_string());
        list.push(OpenAiModelEntry {
            id: id.to_string(),
            object: "model".to_string(),
            created,
            owned_by: format!("zeusdesigns:{}", prov),
            provider: prov.to_string(),
            label: label.to_string(),
            reasoning,
            vision,
            tool_call: true,
            context_window: ctx,
            max_output: max_out,
        });
    }

    for p in catalog() {
        for m in p.models {
            let scoped_id = format!("{}/{}", p.id, m.id);
            if seen.insert(scoped_id.clone()) {
                list.push(OpenAiModelEntry {
                    id: scoped_id,
                    object: "model".to_string(),
                    created,
                    owned_by: format!("zeusdesigns:{}", p.id),
                    provider: p.id.clone(),
                    label: format!("{} · {}", p.name, m.label),
                    reasoning: m.reasoning,
                    vision: m.vision,
                    tool_call: true,
                    context_window: 131072,
                    max_output: 16384,
                });
            }
            if seen.insert(m.id.clone()) {
                list.push(OpenAiModelEntry {
                    id: m.id.clone(),
                    object: "model".to_string(),
                    created,
                    owned_by: format!("zeusdesigns:{}", p.id),
                    provider: p.id.clone(),
                    label: format!("{} ({})", m.label, p.name),
                    reasoning: m.reasoning,
                    vision: m.vision,
                    tool_call: true,
                    context_window: 131072,
                    max_output: 16384,
                });
            }
        }
    }

    list
}

/// Resolve any OpenCode / OpenAI model string (e.g. `gemini-4-hydrogen`, `zeusdesigns/gemini-4-hydrogen`,
/// `freecc/claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen`, `unikey/claude-opus-5-5`, etc.)
/// into `(provider_id, upstream_model_id)`.
pub fn resolve_provider_and_model(raw_model: &str) -> (String, String) {
    let trimmed = raw_model
        .trim()
        .strip_prefix("zeusdesigns/")
        .or_else(|| raw_model.trim().strip_prefix("zeus/"))
        .unwrap_or(raw_model.trim());

    match trimmed {
        "" | "auto" | "default" => (
            "kilo".to_string(),
            "nvidia/nemotron-3.5-super-vl:free".to_string(),
        ),
        "gemini-4-hydrogen" | "gemini/models/gemini-4-hydrogen" | "anthropic/gemini/models/gemini-4-hydrogen" => (
            "gemini4".to_string(),
            "gemini-4-hydrogen".to_string(),
        ),
        "gemini-4-hydrogen-thinking" | "gemini-4-neon" | "gemini-4-neon-thinking" | "gemini-4-carbon" | "gemini-hydrogen" | "gemini-neon" | "gemini-auto" => (
            "gemini4".to_string(),
            trimmed.to_string(),
        ),
        "gemini-4-argon" => (
            "antigravity".to_string(),
            "gemini-4-argon-high".to_string(),
        ),
        "gemini-4-hydrogen-high"
        | "gemini-4-hydrogen-xhigh"
        | "gemini-4-hydrogen-medium"
        | "gemini-4-hydrogen-low"
        | "gemini-4-hydrogen-sonar"
        | "gemini-4-hydrogen-tiered-high"
        | "gemini-4-hydrogen-tiered-xhigh"
        | "gemini-4-neon-high"
        | "gemini-4-neon-xhigh"
        | "gemini-4-neon-medium"
        | "gemini-4-neon-low"
        | "gemini-4-carbon-high"
        | "gemini-4-carbon-medium"
        | "gemini-4-carbon-low"
        | "gemini-4-argon-high"
        | "gemini-4-argon-medium"
        | "gemini-4-argon-low"
        | "gemini-pro-orchestrator"
        | "gemini-pro-orchestrator-argon"
        | "gemini-pro-orchestrator-neon"
        | "gemini-3.8-flash-high"
        | "gemini-3.8-flash-medium"
        | "gemini-3.8-flash-low"
        | "gemini-3.8-flash-tiered"
        | "gemini-flash-worker-agy"
        | "claude-opus-5-5-high"
        | "claude-opus-5-5-medium"
        | "claude-opus-5-5-low"
        | "claude-sonnet-5-5-high"
        | "claude-sonnet-5-5-medium"
        | "claude-sonnet-5-5-low"
        | "gpt-oss-120b-medium" => (
            "antigravity".to_string(),
            trimmed.to_string(),
        ),
        "claude-sonnet-5-5" | "claude-haiku-5-5" | "claude-opus-5-5" => (
            "claude5proxy".to_string(),
            trimmed.to_string(),
        ),
        "gpt-6-luna" | "gpt-5" | "gpt-5-mini" | "o3" | "o4-mini" => (
            "mychatcloud".to_string(),
            trimmed.to_string(),
        ),
        "deepseek-v4.1-flash" | "qwen3.7-flash" => (
            "supavip".to_string(),
            trimmed.to_string(),
        ),
        "qwen3.5-flash" | "deepseek-v4-flash-vision-exp" | "doubao-seed-2-0-lite-260428" | "doubao-seed-2-0-mini-260428" => (
            "shannian".to_string(),
            trimmed.to_string(),
        ),
        "z-ai/glm-5.3-flash" | "minimaxai/minimax-m3.1-flash" | "poolside/laguna-xs-2.1" => (
            "nimcloud".to_string(),
            trimmed.to_string(),
        ),
        "gemini-3.5-flash" | "gemini/models/gemini-3.5-flash" => (
            "gemini4".to_string(),
            "gemini-4-hydrogen".to_string(),
        ),
        "gemini-3-flash-preview" | "gemini-3-flash" | "gemini/models/gemini-3-flash-preview" => (
            "freecc".to_string(),
            "claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview".to_string(),
        ),
        "gpt-6.1-sol" | "gpt-6-astra" | "deepseek-v4-flash" => {
            ("unikey".to_string(), trimmed.to_string())
        }
        "qwen3.8-flash" => {
            ("deepai".to_string(), trimmed.to_string())
        }
        "qwen4-max" | "qwen3.8-max" | "qwen3.8-omni-flash" | "qwen3.5-omni-plus" | "qwen3.7-max" | "qwen3.7-plus" => {
            ("qwen".to_string(), trimmed.to_string())
        }
        "Qwen3.6-35B-A3B" => ("colibriqwen".to_string(), "Qwen3.6-35B-A3B".to_string()),
        "gemini-3.1-pro" => ("gemweb2api".to_string(), "gemini-3.1-pro".to_string()),
        "deepseek-v4-pro" => ("hfrouter".to_string(), "deepseek-v4-pro".to_string()),
        "qwen3-235b" | "kimi-k2.6" => ("freellmhub".to_string(), trimmed.to_string()),
        "grok-4.20" => ("aibridge".to_string(), "grok-4.20".to_string()),
        "nemotron-3-ultra-free" => ("litellmhub".to_string(), "nvidia/nemotron-3-ultra-550b-a55b:free".to_string()),
        "DeepSeek-V4.1-Flash-1017" | "Qwen3.8-27B" | "Qwen3.5-397B-A17B" | "Qwen2.5-VL-72B-Instruct" => {
            ("ovhcloud".to_string(), trimmed.to_string())
        }
        "glm-5.3" | "glm-5.3-flash" => ("freellmhub".to_string(), trimmed.to_string()),
        "kimi-k3" => ("unikey".to_string(), "moonshotai/kimi-k3".to_string()),
        "nemotron-3.5-super-vl" => (
            "kilo".to_string(),
            "nvidia/nemotron-3.5-super-vl:free".to_string(),
        ),
        "nemotron-3-ultra-550b" => (
            "nimcloud".to_string(),
            "nvidia/nemotron-3-ultra-550b-a55b".to_string(),
        ),
        "mistral-large-4-1t" | "mistralai/mistral-large-4-1t-a52b" => (
            "nimcloud".to_string(),
            "mistralai/mistral-large-4-1t-a52b".to_string(),
        ),
        "k2-horizon" | "IFM/K2-Horizon-375B-A23B" => {
            ("k2horizon".to_string(), "k2-horizon".to_string())
        }
        "motif-3-102b" | "motif-102b" => ("motif".to_string(), "motif-3-102b".to_string()),
        "motif-3-12.7b" | "motif-12-7b-reasoning" => {
            ("motif".to_string(), "motif-3-12.7b".to_string())
        }
        "mercury-3" | "mercury-2" | "mercury3" => {
            ("mercury3".to_string(), "mercury-3".to_string())
        }
        "longcat-2.5" | "longcat" => {
            ("longcat".to_string(), "longcat-2.5".to_string())
        }
        "gemini-flash-lite" | "geminiweb" => {
            ("geminiweb".to_string(), "gemini-flash-lite".to_string())
        }
        _ => {
            let cat = catalog();
            // 1. Check if prefixed with `<provider_id>/<model_id>`
            if let Some((first, rest)) = trimmed.split_once('/') {
                if let Some(p) = cat.iter().find(|p| p.id == first) {
                    if p.models.iter().any(|m| m.id == rest) {
                        return (p.id.clone(), rest.to_string());
                    }
                    // Also handle `freecc/gemini-4-hydrogen` short aliases
                    if p.id == "freecc" && rest == "gemini-4-hydrogen" {
                        return (
                            "freecc".to_string(),
                            "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen".to_string(),
                        );
                    }
                    return (p.id.clone(), rest.to_string());
                }
            }
            // 2. Check exact model ID match in catalog
            for p in &cat {
                for m in &p.models {
                    if m.id == trimmed {
                        return (p.id.clone(), m.id.clone());
                    }
                }
            }
            // 3. Check if the caller passed a provider ID directly
            if let Some(p) = cat.iter().find(|p| p.id == trimmed) {
                if let Some(first_m) = p.models.first() {
                    return (p.id.clone(), first_m.id.clone());
                }
            }
            // Default fallback
            (
                "kilo".to_string(),
                "nvidia/nemotron-3.5-super-vl:free".to_string(),
            )
        }
    }
}

/// Convert OpenAI `tools` definitions into a deterministic system prompt block so web scrapers,
/// Anthropic proxies, and GGUF endpoints can execute OpenCode tool calls (`bash`, `read`, `edit`, `write`, `glob`, `grep`, etc.).
pub fn build_opencode_tools_system_block(tools: &[Value], tool_choice: Option<&Value>) -> String {
    if tools.is_empty() {
        return String::new();
    }
    if let Some(tc) = tool_choice {
        if tc.as_str() == Some("none") {
            return String::new();
        }
    }

    let mut defs = Vec::new();
    for t in tools {
        let func = t.get("function").unwrap_or(t);
        let Some(name) = func.get("name").and_then(|n| n.as_str()) else {
            continue;
        };
        let desc = func
            .get("description")
            .and_then(|d| d.as_str())
            .unwrap_or("")
            .lines()
            .take(4)
            .collect::<Vec<_>>()
            .join(" ");
        let params = func
            .get("parameters")
            .or_else(|| func.get("input_schema"))
            .cloned()
            .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
        defs.push(format!(
            "- `{}`: {}\n  parameters: {}",
            name,
            desc.chars().take(320).collect::<String>(),
            serde_json::to_string(&params).unwrap_or_else(|_| "{}".to_string())
        ));
    }
    if defs.is_empty() {
        return String::new();
    }

    format!(
        "\n\n## OpenCode / OpenAI Tool-Calling Protocol\nYou have access to the following tools:\n{}\n\nCRITICAL TOOL CALLING RULES:\n1. When you need to call a tool, output a `<tool_call>` XML block OUTSIDE `<think>` with a valid JSON object containing the exact tool `\"name\"` from the list above and `\"arguments\"`:\n<tool_call>{{\"name\": \"bash\", \"arguments\": {{\"command\": \"git status -sb\", \"description\": \"Check repo status\"}}}}</tool_call>\n2. Never emit `<tool_call>` inside `<think>...</think>`, and never use a placeholder name.\n3. Prefer `bash` (including inline `python3 -c` or heredoc scripts) to combine search, inspection, multi-file edits, and test verification in minimal turns.\n4. You may emit multiple `<tool_call>...</tool_call>` blocks if multiple independent tool actions are needed.\n5. When you emit a `<tool_call>`, stop immediately after `</tool_call>` and wait for the `<tool_response>` turn before continuing.\n6. When no tool is needed, respond normally without `<tool_call>` tags.",
        defs.join("\n")
    )
}

/// Extract text and image attachments from an OpenAI or Anthropic message object,
/// preserving `tool_calls` and `tool` role outputs across multi-turn OpenCode sessions.
pub fn parse_openai_messages(raw_msgs: &[Value]) -> (String, Vec<ChatMessage>) {
    let mut system_parts = Vec::new();
    let mut chat_msgs: Vec<ChatMessage> = Vec::new();

    for m in raw_msgs {
        let role = m
            .get("role")
            .and_then(|r| r.as_str())
            .unwrap_or("user")
            .to_lowercase();

        let mut text_parts = Vec::new();
        let mut attachments = Vec::new();

        if let Some(content) = m.get("content") {
            if let Some(s) = content.as_str() {
                if !s.trim().is_empty() {
                    text_parts.push(s.to_string());
                }
            } else if let Some(arr) = content.as_array() {
                for part in arr {
                    let ptype = part.get("type").and_then(|t| t.as_str()).unwrap_or("text");
                    match ptype {
                        "text" | "input_text" | "output_text" => {
                            if let Some(t) = part.get("text").and_then(|x| x.as_str()) {
                                if !t.trim().is_empty() {
                                    text_parts.push(t.to_string());
                                }
                            }
                        }
                        "image_url" | "input_image" => {
                            let url = part
                                .get("image_url")
                                .and_then(|u| u.get("url").or(Some(u)))
                                .and_then(|u| u.as_str())
                                .or_else(|| part.get("url").and_then(|u| u.as_str()))
                                .unwrap_or("");
                            if url.starts_with("data:image/") {
                                let mime = url
                                    .strip_prefix("data:")
                                    .and_then(|s| s.split_once(';'))
                                    .map(|(m, _)| m.to_string())
                                    .unwrap_or_else(|| "image/png".to_string());
                                attachments.push(AttachmentPayload {
                                    name: "image.png".to_string(),
                                    mime,
                                    data_url: url.to_string(),
                                });
                            }
                        }
                        "tool_use" | "tool-call" => {
                            let name = part
                                .get("name")
                                .or_else(|| part.get("toolName"))
                                .and_then(|n| n.as_str())
                                .unwrap_or("tool");
                            let id = part
                                .get("id")
                                .or_else(|| part.get("toolCallId"))
                                .and_then(|i| i.as_str())
                                .unwrap_or("call_1");
                            let input = part
                                .get("input")
                                .or_else(|| part.get("args"))
                                .cloned()
                                .unwrap_or_else(|| json!({}));
                            text_parts.push(format!(
                                "<tool_call>{}</tool_call>",
                                json!({ "id": id, "name": name, "arguments": input })
                            ));
                        }
                        "tool_result" | "tool-result" => {
                            let tid = part
                                .get("tool_use_id")
                                .or_else(|| part.get("toolCallId"))
                                .and_then(|i| i.as_str())
                                .unwrap_or("call_1");
                            let tcontent = part
                                .get("content")
                                .or_else(|| part.get("result"))
                                .map(|c| {
                                    if let Some(s) = c.as_str() {
                                        s.to_string()
                                    } else {
                                        c.to_string()
                                    }
                                })
                                .unwrap_or_default();
                            let capped: String = tcontent.chars().take(14000).collect();
                            text_parts.push(format!(
                                "<tool_response id=\"{}\">\n{}\n</tool_response>",
                                tid, capped
                            ));
                        }
                        _ => {}
                    }
                }
            }
        }

        // Preserve assistant `tool_calls` array in OpenAI messages
        if let Some(tcs) = m.get("tool_calls").and_then(|v| v.as_array()) {
            for tc in tcs {
                let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("call_1");
                if let Some(func) = tc.get("function") {
                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                    let args_raw = func
                        .get("arguments")
                        .and_then(|a| a.as_str())
                        .unwrap_or("{}");
                    let args_val: Value =
                        serde_json::from_str(args_raw).unwrap_or_else(|_| json!(args_raw));
                    text_parts.push(format!(
                        "<tool_call>{}</tool_call>",
                        json!({ "id": id, "name": name, "arguments": args_val })
                    ));
                }
            }
        }

        let combined = text_parts.join("\n").trim().to_string();
        match role.as_str() {
            "system" | "developer" => {
                if !combined.is_empty() {
                    system_parts.push(combined);
                }
            }
            "tool" | "function" => {
                let call_id = m
                    .get("tool_call_id")
                    .or_else(|| m.get("name"))
                    .and_then(|i| i.as_str())
                    .unwrap_or("tool");
                let capped: String = combined.chars().take(14000).collect();
                let wrapped = format!(
                    "<tool_response id=\"{}\">\n{}\n</tool_response>",
                    call_id, capped
                );
                if let Some(last) = chat_msgs.last_mut() {
                    if last.role == "user" {
                        last.content.push_str("\n\n");
                        last.content.push_str(&wrapped);
                        continue;
                    }
                }
                chat_msgs.push(ChatMessage {
                    role: "user".to_string(),
                    content: wrapped,
                    attachments: Vec::new(),
                });
            }
            "assistant" => {
                if !combined.is_empty() {
                    if let Some(last) = chat_msgs.last_mut() {
                        if last.role == "assistant" {
                            last.content.push_str("\n\n");
                            last.content.push_str(&combined);
                            continue;
                        }
                    }
                    if chat_msgs.is_empty() {
                        chat_msgs.push(ChatMessage {
                            role: "user".to_string(),
                            content: "Continue.".to_string(),
                            attachments: Vec::new(),
                        });
                    }
                    chat_msgs.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: combined,
                        attachments,
                    });
                }
            }
            _ => {
                if !combined.is_empty() || !attachments.is_empty() {
                    if let Some(last) = chat_msgs.last_mut() {
                        if last.role == "user" && attachments.is_empty() && last.attachments.is_empty() {
                            last.content.push_str("\n\n");
                            last.content.push_str(&combined);
                            continue;
                        }
                    }
                    chat_msgs.push(ChatMessage {
                        role: "user".to_string(),
                        content: if combined.is_empty() {
                            "Analyze the attached image.".to_string()
                        } else {
                            combined
                        },
                        attachments,
                    });
                }
            }
        }
    }

    if chat_msgs.is_empty() {
        chat_msgs.push(ChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
            attachments: Vec::new(),
        });
    }

    (system_parts.join("\n\n"), chat_msgs)
}

/// Split `<think>...</think>`, `<thinking>...</thinking>`, `<thought>...</thought>`, `<reasoning>...</reasoning>`,
/// `<|begin_of_thought|>...<|end_of_thought|>`, and orphan closing `</think>` blocks from raw model output into `(reasoning, answer)`.
pub fn split_thinking_and_content(raw: &str) -> (String, String) {
    let mut reasoning = Vec::new();
    let mut rest = raw
        .replace("<think>...</think>", "`<think>...</think>`")
        .replace("<thinking>...</thinking>", "`<thinking>...</thinking>`");

    let clean_thought = |s: &str| -> String {
        s.replace("<think>", "")
            .replace("</think>", "")
            .replace("<thinking>", "")
            .replace("</thinking>", "")
            .trim()
            .to_string()
    };

    // 1. Handle orphan closing tags when an upstream template pre-opened `<think>` on the server
    for (open_tag, close_tag) in [
        ("<think>", "</think>"),
        ("<thinking>", "</thinking>"),
        ("<thought>", "</thought>"),
        ("<reasoning>", "</reasoning>"),
        ("<|begin_of_thought|>", "<|end_of_thought|>"),
    ] {
        let lower = rest.to_ascii_lowercase();
        if let Some(close_idx) = lower.rfind(close_tag) {
            if close_idx > 0 && matches!(rest.as_bytes()[close_idx - 1], b'`' | b'"' | b'\'') {
                continue;
            }
            let before = &lower[..close_idx];
            if !before.contains(open_tag) {
                let orphan = clean_thought(&rest[..close_idx]);
                if !orphan.is_empty() {
                    reasoning.push(orphan);
                }
                rest.replace_range(0..close_idx + close_tag.len(), "");
            }
        }
    }

    // 2. Handle paired or unclosed-tail reasoning blocks (spanning to the last `</think>` if split early)
    for (open_tag, close_tag) in [
        ("<think>", "</think>"),
        ("<thinking>", "</thinking>"),
        ("<thought>", "</thought>"),
        ("<reasoning>", "</reasoning>"),
        ("<|begin_of_thought|>", "<|end_of_thought|>"),
    ] {
        let mut search_from = 0usize;
        loop {
            let lower = rest.to_ascii_lowercase();
            if search_from >= lower.len() {
                break;
            }
            let Some(rel_start) = lower[search_from..].find(open_tag) else { break };
            let start = search_from + rel_start;
            if start > 0 && matches!(rest.as_bytes()[start - 1], b'`' | b'"' | b'\'') {
                search_from = start + open_tag.len();
                continue;
            }
            let after_open = start + open_tag.len();
            let mut found_end: Option<usize> = None;
            let mut scan = after_open;
            while scan < lower.len() {
                let Some(rel_end) = lower[scan..].find(close_tag) else { break };
                let cand = scan + rel_end;
                if cand > 0 && matches!(rest.as_bytes()[cand - 1], b'`' | b'"' | b'\'') {
                    scan = cand + close_tag.len();
                    continue;
                }
                found_end = Some(cand);
                if start > 4 {
                    break;
                }
                scan = cand + close_tag.len();
            }
            if let Some(end) = found_end {
                let tail = rest[end + close_tag.len()..].trim_start();
                if start == 0 && (tail.starts_with(", then") || tail.starts_with(", and")) && !tail.contains(close_tag) {
                    let thought = clean_thought(&rest[after_open..]);
                    if !thought.is_empty() {
                        reasoning.push(thought);
                    }
                    rest.truncate(start);
                    break;
                }
                let thought = clean_thought(&rest[after_open..end]);
                if !thought.is_empty() {
                    reasoning.push(thought);
                }
                rest.replace_range(start..end + close_tag.len(), "");
            } else {
                let line_start = rest[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
                if !rest[line_start..start].trim().is_empty() {
                    rest.replace_range(start..after_open, "");
                    continue;
                }
                let thought = clean_thought(&rest[after_open..]);
                if !thought.is_empty() {
                    reasoning.push(thought);
                }
                rest.truncate(start);
                break;
            }
        }
    }

    (reasoning.join("\n\n"), rest.trim().to_string())
}

/// Extract `<tool_call>...</tool_call>` blocks (or fallback JSON tool call blocks) from the model's answer,
/// returning `(cleaned_text_without_tool_tags, parsed_tool_calls)`.
pub fn extract_tool_calls_from_text(
    answer: &str,
    known_tool_names: &HashSet<String>,
) -> (String, Vec<ParsedToolCall>) {
    let mut cleaned = answer.to_string();
    let mut calls = Vec::new();

    // 1. Parse explicit `<tool_call>...</tool_call>` and `<function_call>...</function_call>` tags
    for (open_tag, close_tag) in [
        ("<tool_call>", "</tool_call>"),
        ("<function_call>", "</function_call>"),
    ] {
        while let Some(start) = cleaned.find(open_tag) {
            let rest = &cleaned[start + open_tag.len()..];
            let (body, remove_end) = if let Some(end_rel) = rest.find(close_tag) {
                (
                    &rest[..end_rel],
                    start + open_tag.len() + end_rel + close_tag.len(),
                )
            } else {
                (rest, cleaned.len())
            };
            let raw_json = body
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();
            if let Some(tc) = parse_single_tool_json(raw_json) {
                calls.push(tc);
            }
            cleaned.replace_range(start..remove_end, "");
        }
    }

    // 1b. Also parse `<zeus_tool name="...">...</zeus_tool>` if emitted by a scraper
    while let Some(start) = cleaned.find("<zeus_tool") {
        let rest = &cleaned[start..];
        let Some(gt) = rest.find('>') else {
            break;
        };
        let header = &rest[..gt];
        let name = header
            .split("name=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .or_else(|| header.split("name='").nth(1).and_then(|s| s.split('\'').next()))
            .unwrap_or("")
            .trim()
            .to_string();
        let path_attr = header
            .split("path=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .or_else(|| header.split("path='").nth(1).and_then(|s| s.split('\'').next()))
            .unwrap_or("")
            .trim()
            .to_string();
        let after_gt = &rest[gt + 1..];
        let (body, remove_end) = if let Some(end_rel) = after_gt.find("</zeus_tool>") {
            (&after_gt[..end_rel], start + gt + 1 + end_rel + 12)
        } else {
            (after_gt, cleaned.len())
        };
        if !name.is_empty() && !matches!(name.as_str(), "TOOL" | "tool_name" | "NAME") {
            let args_trimmed = body.trim();
            let arguments = if args_trimmed.starts_with('{') && args_trimmed.ends_with('}') {
                args_trimmed.to_string()
            } else if matches!(name.as_str(), "bash" | "shell" | "cmd" | "exec") {
                json!({ "command": if !args_trimmed.is_empty() { args_trimmed } else { &path_attr }, "description": "Execute command" }).to_string()
            } else if matches!(name.as_str(), "write" | "write_file") {
                json!({ "filePath": path_attr, "path": path_attr, "content": args_trimmed }).to_string()
            } else if matches!(name.as_str(), "read" | "read_file") {
                let p = if !path_attr.is_empty() { path_attr } else { args_trimmed.to_string() };
                json!({ "filePath": p, "path": p }).to_string()
            } else if !path_attr.is_empty() {
                json!({ "path": path_attr, "body": args_trimmed }).to_string()
            } else if args_trimmed.is_empty() {
                "{}".to_string()
            } else {
                json!({ "input": args_trimmed }).to_string()
            };
            calls.push(ParsedToolCall {
                id: format!("call_{}", random_hex(12)),
                name,
                arguments,
            });
        }
        cleaned.replace_range(start..remove_end, "");
    }

    // 1c. Also parse `<function=...>`, `<function name="...">`, `<invoke name="...">`, and `<ifm|tool_call>` via the universal agent parser
    if calls.is_empty() {
        let fallback_invs = crate::agent::parse_inline_invocations_segment(&cleaned, true, false);
        for inv in fallback_invs {
            let arguments = if inv.body.starts_with('{') && inv.body.ends_with('}') {
                inv.body.clone()
            } else if matches!(inv.name.as_str(), "bash" | "shell" | "cmd" | "exec") {
                json!({ "command": if !inv.body.is_empty() { &inv.body } else { &inv.path }, "description": "Execute command" }).to_string()
            } else if matches!(inv.name.as_str(), "write" | "write_file") {
                json!({ "filePath": inv.path, "path": inv.path, "content": inv.body }).to_string()
            } else if matches!(inv.name.as_str(), "read" | "read_file") {
                let p = if !inv.path.is_empty() { &inv.path } else { &inv.body };
                json!({ "filePath": p, "path": p }).to_string()
            } else if !inv.path.is_empty() {
                json!({ "path": inv.path, "body": inv.body }).to_string()
            } else {
                json!({ "input": inv.body }).to_string()
            };
            calls.push(ParsedToolCall {
                id: format!("call_{}", random_hex(12)),
                name: inv.name,
                arguments,
            });
        }
        if !calls.is_empty() {
            cleaned = strip_tool_xml_for_oc(&cleaned);
        }
    }

    // 2. Fallback: if tools were requested and no `<tool_call>` tag was used, check if the model emitted a standalone JSON tool call object
    if calls.is_empty() && !known_tool_names.is_empty() {
        let trimmed = cleaned
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```tool_call")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Some(tc) = parse_single_tool_json(trimmed) {
                if known_tool_names.contains(&tc.name) {
                    calls.push(tc);
                    cleaned.clear();
                }
            }
        }
    }

    (cleaned.trim().to_string(), calls)
}

fn parse_single_tool_json(raw_json: &str) -> Option<ParsedToolCall> {
    let v: Value = serde_json::from_str(raw_json).ok()?;
    let name = v
        .get("name")
        .or_else(|| v.get("tool"))
        .or_else(|| v.get("function").and_then(|f| f.get("name")))
        .and_then(|n| n.as_str())?
        .trim()
        .to_string();
    if name.is_empty() || matches!(name.as_str(), "tool_name" | "TOOL" | "NAME") {
        return None;
    }
    let args_val = v
        .get("arguments")
        .or_else(|| v.get("parameters"))
        .or_else(|| v.get("input"))
        .or_else(|| v.get("args"))
        .or_else(|| v.get("function").and_then(|f| f.get("arguments")))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let arguments = if let Some(s) = args_val.as_str() {
        s.to_string()
    } else {
        serde_json::to_string(&args_val).unwrap_or_else(|_| "{}".to_string())
    };
    let id = v
        .get("id")
        .and_then(|i| i.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("call_{}", random_hex(12)));
    Some(ParsedToolCall {
        id,
        name,
        arguments,
    })
}

/// Generate a complete, verified `opencode.json` configuration object for OpenCode.
pub fn generate_opencode_config_json(port: u16) -> Value {
    let base_url = format!("http://127.0.0.1:{}/v1", port);
    let mut models_map = serde_json::Map::new();

    for m in build_openai_models_list() {
        // Include top-level aliases and key provider/model pairs without bloating opencode.json
        if !m.id.contains('/')
            || m.id.starts_with("freecc/")
            || m.id.starts_with("kilo/")
            || m.id.starts_with("nimcloud/")
            || m.id.starts_with("unikey/")
            || m.id.starts_with("ovhcloud/")
            || m.id.starts_with("colibriqwen/")
            || m.id.starts_with("gemma4vl/")
            || m.id.starts_with("phi4cloud/")
            || m.id.starts_with("qwen/")
            || m.id.starts_with("deepai/")
        {
            models_map.insert(
                m.id.clone(),
                json!({
                    "name": m.label,
                    "tool_call": true,
                    "reasoning": m.reasoning,
                    "attachment": m.vision,
                    "temperature": true,
                    "limit": {
                        "context": m.context_window,
                        "output": m.max_output
                    }
                }),
            );
        }
    }

    json!({
        "$schema": "https://opencode.ai/config.json",
        "model": "zeusdesigns/gemini-4-hydrogen",
        "small_model": "zeusdesigns/claude-haiku-5-5",
        "provider": {
            "zeusdesigns": {
                "npm": "@ai-sdk/openai-compatible",
                "name": "ZeusDesigns Local Gateway (Free Keyless)",
                "options": {
                    "baseURL": base_url,
                    "apiKey": "zeus-local"
                },
                "models": models_map
            }
        }
    })
}

fn write_json_response(stream: &mut TcpStream, status_line: &str, body: &Value) {
    let payload = serde_json::to_string(body).unwrap_or_else(|_| "{}".to_string());
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n",
        status_line,
        payload.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(payload.as_bytes());
    let _ = stream.flush();
}

fn write_sse_headers(stream: &mut TcpStream) -> std::io::Result<()> {
    let header = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-cache\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\n\r\n";
    stream.write_all(header.as_bytes())?;
    stream.flush()
}

fn write_sse_data(stream: &mut TcpStream, data: &Value) -> std::io::Result<()> {
    let line = format!("data: {}\n\n", serde_json::to_string(data).unwrap_or_default());
    stream.write_all(line.as_bytes())?;
    stream.flush()
}

fn write_sse_event(stream: &mut TcpStream, event: &str, data: &Value) -> std::io::Result<()> {
    let line = format!(
        "event: {}\ndata: {}\n\n",
        event,
        serde_json::to_string(data).unwrap_or_default()
    );
    stream.write_all(line.as_bytes())?;
    stream.flush()
}

fn strip_tool_xml_for_oc(raw: &str) -> String {
    let mut out = crate::agent::strip_thinking_blocks(raw);
    for (open_tag, close_tag) in [
        ("<zeus_tool", "</zeus_tool>"),
        ("<tool_call>", "</tool_call>"),
        ("<function_call>", "</function_call>"),
        ("<function", "</function>"),
        ("<invoke", "</invoke>"),
        ("<ifm|tool_calls>", "</ifm|tool_calls>"),
        ("<ifm|tool_call>", "</ifm|tool_call>"),
        ("<bash", "</bash>"),
        ("<shell", "</shell>"),
        ("<python", "</python>"),
        ("<read_file", "</read_file>"),
        ("<write_file", "</write_file>"),
        ("<edit_file", "</edit_file>"),
        ("<delete_file", "</delete_file>"),
        ("<search_code", "</search_code>"),
        ("<list_dir", "</list_dir>"),
        ("<web_fetch", "</web_fetch>"),
        ("<memory_search", "</memory_search>"),
        ("<memory_save", "</memory_save>"),
        ("<memory_edit", "</memory_edit>"),
        ("<memory_delete", "</memory_delete>"),
    ] {
        let mut search_from = 0usize;
        loop {
            if search_from >= out.len() {
                break;
            }
            let Some(rel_start) = out[search_from..].find(open_tag) else { break };
            let start = search_from + rel_start;
            // Never strip or truncate if the tag is inside inline backticks (e.g. `` `<bash>` ``)
            if start > 0 && out.as_bytes()[start - 1] == b'`' {
                search_from = start + open_tag.len();
                continue;
            }
            let rest = &out[start..];
            if let Some(gt) = rest.find('>') {
                let header = &rest[open_tag.len()..gt];
                if !open_tag.ends_with('>')
                    && !header.is_empty()
                    && !header.starts_with(char::is_whitespace)
                    && !header.starts_with('/')
                    && !header.starts_with('=')
                {
                    search_from = start + gt + 1;
                    continue;
                }
                if rest[..gt].trim_end().ends_with('/') {
                    out.replace_range(start..start + gt + 1, "");
                    continue;
                }
            }
            if let Some(rel_end) = rest.find(close_tag) {
                let block = &rest[..rel_end + close_tag.len()];
                if open_tag == "<zeus_tool" && (!block.contains("name=") || block.contains(">...</zeus_tool>")) {
                    search_from = start + open_tag.len();
                    continue;
                }
                out.replace_range(start..start + rel_end + close_tag.len(), "");
            } else if matches!(open_tag, "<zeus_tool" | "<tool_call>" | "<function_call>" | "<ifm|tool_call>") {
                let line_start = out[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
                let has_prose_prefix = !out[line_start..start].trim().is_empty();
                let is_placeholder_zeus = open_tag == "<zeus_tool" && !rest.contains("name=");
                if has_prose_prefix || is_placeholder_zeus {
                    search_from = start + open_tag.len();
                    continue;
                }
                out.truncate(start);
                break;
            } else {
                search_from = start + open_tag.len();
            }
        }
    }
    out.trim().to_string()
}

fn handle_opencode_session_message(
    stream: &mut TcpStream,
    raw_path: &str,
    session_id: &str,
    body_bytes: &[u8],
    engine: Arc<ProviderEngine>,
    server_state: Arc<LocalServerState>,
) {
    let req_json: Value = serde_json::from_slice(body_bytes).unwrap_or_else(|_| json!({}));
    let dir_q = raw_path
        .split('?')
        .nth(1)
        .and_then(|q| {
            q.split('&').find_map(|kv| {
                let (k, v) = kv.split_once('=')?;
                if k == "directory" {
                    Some(percent_decode(v))
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();

    let model_str = req_json
        .get("model")
        .and_then(|m| {
            if let Some(s) = m.as_str() {
                Some(s.to_string())
            } else {
                let pid = m.get("providerID").and_then(|x| x.as_str()).unwrap_or("zeusdesigns");
                let mid = m.get("modelID").and_then(|x| x.as_str()).unwrap_or("mercury-3");
                if pid == "opencode" {
                    Some(format!("opencodezen/{}", mid))
                } else if mid.contains('/') {
                    Some(mid.to_string())
                } else {
                    Some(format!("{}/{}", pid, mid))
                }
            }
        })
        .unwrap_or_else(|| "mercury3/mercury-3".to_string());
    let (provider_id, upstream_model) = resolve_provider_and_model(&model_str);

    let user_text = req_json
        .get("parts")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .or_else(|| req_json.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();

    let custom_sys = req_json
        .get("system")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    let mut workdir = dir_q;
    let mut history: Vec<ChatMessage> = Vec::new();
    if let Ok(mut guard) = server_state.oc_sessions.lock() {
        let entry = guard.entry(session_id.to_string()).or_insert_with(|| OcSession {
            id: session_id.to_string(),
            title: "OpenCode Session".to_string(),
            directory: workdir.clone(),
            messages: Vec::new(),
            created: now_secs(),
        });
        if workdir.is_empty() && !entry.directory.is_empty() {
            workdir = entry.directory.clone();
        } else if !workdir.is_empty() {
            entry.directory = workdir.clone();
        }
        entry.messages.push(ChatMessage {
            role: "user".to_string(),
            content: user_text.clone(),
            attachments: Vec::new(),
        });
        history = entry.messages.clone();
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut cguard) = server_state.oc_cancels.lock() {
        cguard.insert(session_id.to_string(), cancel_flag.clone());
    }

    let asst_msg_id = format!("msg_{}", random_hex(10));
    server_state.broadcast_oc_event(json!({
        "type": "message.updated",
        "properties": {
            "info": {
                "id": asst_msg_id,
                "sessionID": session_id,
                "role": "assistant"
            }
        }
    }));

    let eff_dir = if workdir.trim().is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    } else {
        workdir.clone()
    };
    let top_nodes = crate::workspace::walk_workspace(
        std::path::Path::new(&eff_dir),
        std::path::Path::new(&eff_dir),
        1,
    );
    let top_listing = if top_nodes.is_empty() {
        "(empty directory — 0 files)".to_string()
    } else {
        top_nodes
            .iter()
            .take(50)
            .map(|n| if n.dir { format!("{}/", n.name) } else { n.name.clone() })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let norm_user_q = user_text
        .trim()
        .to_ascii_lowercase()
        .trim_end_matches(|c: char| matches!(c, '!' | '.' | '?' | ' '))
        .to_string();
    let is_greeting = matches!(
        norm_user_q.as_str(),
        "hi" | "hello" | "hey" | "yo" | "sup" | "hola" | "howdy" | "greetings" | "good morning" | "good afternoon" | "good evening"
            | "who are you" | "who r u" | "what model are you" | "which model are you" | "which model r u" | "what model r u" | "what model is this"
    );
    if !is_greeting && history.len() == 1 {
        let orig_user = history[0].content.clone();
        history = vec![
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "[XML DSL Output Mode — Required by Client Parser]\nWorkspace ({}) is connected. List top-level entries to verify the <zeus_tool> bridge.",
                    eff_dir
                ),
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "assistant".to_string(),
                content: "Workspace is connected. I will check the directory listing first.\n<zeus_tool name=\"list_dir\" path=\"\"></zeus_tool>".to_string(),
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "Tool results:\n<tool_result name=\"list_dir\" ok=\"true\">\n{}\n</tool_result>\n\nUser request: {}\n(If this request requires a shell command, python script, file read/write/edit, or memory lookup, emit the required <zeus_tool> XML block in your response; if no workspace tool is needed, answer the user directly.)",
                    top_listing, orig_user
                ),
                attachments: Vec::new(),
            },
        ];
    }

    let tool_sys = format!(
        "You are Zeus running inside the ZeusDesigns Native OpenCode SDK Agent Runtime.\nOpen project folder: {}.\n## Agent tools\nKeep internal reasoning plain text, emit tool blocks in your final response, and stop immediately after </zeus_tool>:\n- <zeus_tool name=\"shell\">command</zeus_tool> (alias: name=\"bash\")\n- <zeus_tool name=\"python\">python3_code</zeus_tool>\n- <zeus_tool name=\"read_file\" path=\"relative/file\" start=\"1\" end=\"250\"></zeus_tool>\n- <zeus_tool name=\"write_file\" path=\"relative/file\">complete file content</zeus_tool>\n- <zeus_tool name=\"edit_file\" path=\"relative/file\"><<<<<<< SEARCH\\nexisting\\n=======\\nreplacement\\n>>>>>>> REPLACE</zeus_tool>\n- <zeus_tool name=\"delete_file\" path=\"relative/file\"></zeus_tool>\n- <zeus_tool name=\"search_code\">query</zeus_tool>\n- <zeus_tool name=\"list_dir\" path=\"subdir\"></zeus_tool>\n- <zeus_tool name=\"memory_search\">query</zeus_tool> | <zeus_tool name=\"memory_save\" path=\"preferences\">fact</zeus_tool> | <zeus_tool name=\"memory_edit\" path=\"id\">fact</zeus_tool> | <zeus_tool name=\"memory_delete\" path=\"id\"></zeus_tool>",
        eff_dir
    );
    let system_prompt = if custom_sys.trim().is_empty() {
        tool_sys
    } else {
        format!("{}\n\n{}", custom_sys, tool_sys)
    };

    let req_effort = req_json
        .get("effort")
        .and_then(|e| e.as_str())
        .unwrap_or("high")
        .to_string();

    let mut final_clean_answer = String::new();
    let mut final_reasoning = String::new();
    let mut nudged = false;
    for round in 0..14usize {
        if cancel_flag.load(Ordering::Relaxed) {
            break;
        }
        let chat_req = ChatRequest {
            request_id: format!("oc-{}-{}", session_id, round),
            provider: provider_id.clone(),
            model: upstream_model.clone(),
            effort: if round > 0 { "low".to_string() } else { req_effort.clone() },
            system: system_prompt.clone(),
            messages: history.clone(),
            workspace_root: if workdir.is_empty() { None } else { Some(workdir.clone()) },
            custom: None,
        };

        let mut round_raw = String::new();
        let text_part_id = format!("prt_txt_{}_{}", round, random_hex(6));
        let reason_part_id = format!("prt_rsn_{}_{}", round, random_hex(6));
        let mut prev_vis = String::new();
        let mut prev_rsn = String::new();

        let res = dispatch_stream(&engine, &chat_req, &cancel_flag, |delta| {
            round_raw.push_str(delta);
            let (rsn, vis_raw) = split_thinking_and_content(&round_raw);
            if rsn.len() > prev_rsn.len() {
                let d = rsn[prev_rsn.len()..].to_string();
                prev_rsn = rsn.clone();
                server_state.broadcast_oc_event(json!({
                    "type": "message.part.updated",
                    "properties": {
                        "part": {
                            "id": reason_part_id,
                            "sessionID": session_id,
                            "messageID": asst_msg_id,
                            "type": "reasoning",
                            "text": rsn
                        },
                        "delta": d
                    }
                }));
            }
            let vis_clean = strip_tool_xml_for_oc(&vis_raw);
            if vis_clean.len() > prev_vis.len() && !vis_raw.contains("<zeus_tool") && !vis_raw.contains("<tool_call>") {
                let d = vis_clean[prev_vis.len()..].to_string();
                prev_vis = vis_clean.clone();
                server_state.broadcast_oc_event(json!({
                    "type": "message.part.updated",
                    "properties": {
                        "part": {
                            "id": text_part_id,
                            "sessionID": session_id,
                            "messageID": asst_msg_id,
                            "type": "text",
                            "text": vis_clean
                        },
                        "delta": d
                    }
                }));
            }
        });

        if let Err(err) = res {
            server_state.broadcast_oc_event(json!({
                "type": "session.error",
                "properties": {
                    "sessionID": session_id,
                    "error": { "name": "ProviderError", "data": { "message": err } }
                }
            }));
            break;
        }

        if !prev_rsn.trim().is_empty() {
            if final_reasoning.is_empty() {
                final_reasoning = prev_rsn.trim().to_string();
            } else if !final_reasoning.contains(prev_rsn.trim()) {
                final_reasoning.push_str("\n\n");
                final_reasoning.push_str(prev_rsn.trim());
            }
        }

        let clean_no_think = crate::agent::strip_thinking_blocks(&round_raw);
        let mut invocations = crate::agent::parse_inline_invocations_segment(&clean_no_think, true, true);
        if invocations.is_empty() && clean_no_think.trim().len() < 80 {
            invocations = crate::agent::parse_inline_invocations_segment(&round_raw, false, true);
        }

        let vis_final = strip_tool_xml_for_oc(&clean_no_think);
        if !vis_final.is_empty() {
            if vis_final != prev_vis {
                let delta = if vis_final.starts_with(&prev_vis) {
                    vis_final[prev_vis.len()..].to_string()
                } else {
                    vis_final.clone()
                };
                server_state.broadcast_oc_event(json!({
                    "type": "message.part.updated",
                    "properties": {
                        "part": {
                            "id": text_part_id,
                            "sessionID": session_id,
                            "messageID": asst_msg_id,
                            "type": "text",
                            "text": vis_final
                        },
                        "delta": delta
                    }
                }));
            }
            final_clean_answer = vis_final.clone();
        }

        if invocations.is_empty() {
            let stated_plan_only = vis_final.trim().is_empty()
                || (round == 0
                    && vis_final.len() < 220
                    && (vis_final.to_ascii_lowercase().contains("i will ")
                        || vis_final.to_ascii_lowercase().contains("let's ")
                        || vis_final.to_ascii_lowercase().contains("let me ")));
            if !is_greeting && !nudged && stated_plan_only {
                nudged = true;
                if round == 0 && !vis_final.trim().is_empty() {
                    history.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: "Understood. I will emit the `<zeus_tool>` XML block now to execute the workspace action directly.".to_string(),
                        attachments: Vec::new(),
                    });
                    history.push(ChatMessage {
                        role: "user".to_string(),
                        content: "Your reply stopped after planning without emitting a `<zeus_tool>` block, so no command or file operation ran. Emit the required `<zeus_tool>` block now (or provide your complete final answer if no workspace action is needed).".to_string(),
                        attachments: Vec::new(),
                    });
                } else {
                    history.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: format!("Thought summary: {}", prev_rsn.chars().take(600).collect::<String>()),
                        attachments: Vec::new(),
                    });
                    history.push(ChatMessage {
                        role: "user".to_string(),
                        content: "You finished your internal reasoning. Now provide your clear, complete visible answer to the user (or emit the next `<zeus_tool>` block if a workspace action is required).".to_string(),
                        attachments: Vec::new(),
                    });
                }
                continue;
            }
            history.push(ChatMessage {
                role: "assistant".to_string(),
                content: final_clean_answer.clone(),
                attachments: Vec::new(),
            });
            break;
        }

        let mut canonical_calls = Vec::new();
        let mut tool_results_block = String::from("Tool results:\n");
        for (t_idx, inv) in invocations.iter().enumerate() {
            let call_id = format!("call_{}_{}_{}", round, t_idx, random_hex(4));
            let input_obj = json!({
                "path": inv.path,
                "body": inv.body
            });
            server_state.broadcast_oc_event(json!({
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "id": call_id,
                        "callID": call_id,
                        "sessionID": session_id,
                        "messageID": asst_msg_id,
                        "type": "tool",
                        "tool": inv.name,
                        "state": {
                            "status": "running",
                            "input": input_obj
                        }
                    }
                }
            }));

            let (ok, output) = crate::agent::execute_single_workspace_tool(&workdir, inv);
            server_state.broadcast_oc_event(json!({
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "id": call_id,
                        "callID": call_id,
                        "sessionID": session_id,
                        "messageID": asst_msg_id,
                        "type": "tool",
                        "tool": inv.name,
                        "state": {
                            "status": if ok { "completed" } else { "error" },
                            "input": input_obj,
                            "output": output,
                            "error": if ok { Value::Null } else { Value::String(output.clone()) }
                        }
                    }
                }
            }));

            canonical_calls.push(format!(
                "<zeus_tool name=\"{}\" path=\"{}\">{}</zeus_tool>",
                inv.name, inv.path, inv.body
            ));
            tool_results_block.push_str(&format!(
                "<tool_result name=\"{}\" ok=\"{}\">\n{}\n</tool_result>\n",
                inv.name, ok, output
            ));
        }
        tool_results_block.push_str("Continue from these tool results. Emit another <zeus_tool> if more steps are needed, or provide the final response.");
        history.push(ChatMessage {
            role: "assistant".to_string(),
            content: canonical_calls.join("\n"),
            attachments: Vec::new(),
        });
        history.push(ChatMessage {
            role: "user".to_string(),
            content: tool_results_block,
            attachments: Vec::new(),
        });
    }

    if let Ok(mut guard) = server_state.oc_sessions.lock() {
        if let Some(sess) = guard.get_mut(session_id) {
            sess.messages = history;
        }
    }

    server_state.broadcast_oc_event(json!({
        "type": "session.idle",
        "properties": { "sessionID": session_id }
    }));

    let mut final_parts = Vec::new();
    if !final_reasoning.is_empty() {
        final_parts.push(json!({
            "id": format!("prt_rsn_final_{}", random_hex(6)),
            "sessionID": session_id,
            "messageID": asst_msg_id,
            "type": "reasoning",
            "text": final_reasoning
        }));
    }
    final_parts.push(json!({
        "id": format!("prt_final_{}", random_hex(6)),
        "sessionID": session_id,
        "messageID": asst_msg_id,
        "type": "text",
        "text": final_clean_answer
    }));

    write_json_response(
        stream,
        "200 OK",
        &json!({
            "info": {
                "id": asst_msg_id,
                "sessionID": session_id,
                "role": "assistant"
            },
            "parts": final_parts
        }),
    );
}

fn handle_http_connection(
    mut stream: TcpStream,
    engine: Arc<ProviderEngine>,
    server_state: Arc<LocalServerState>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(240)));

    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }
    let parts: Vec<&str> = request_line.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0].to_uppercase();
    let raw_path = parts[1];
    let path = raw_path.split('?').next().unwrap_or(raw_path);

    let mut content_length: usize = 0;
    loop {
        let mut hline = String::new();
        if reader.read_line(&mut hline).unwrap_or(0) == 0 {
            break;
        }
        let trimmed = hline.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();
        return;
    }

    let mut body_bytes = vec![0u8; content_length.min(16 * 1024 * 1024)];
    if content_length > 0 {
        let _ = reader.read_exact(&mut body_bytes);
    }

    let port = server_state.port.load(Ordering::Relaxed);

    if method == "GET" && (path == "/" || path == "/health" || path == "/v1/health" || path == "/global/health") {
        let models = build_openai_models_list();
        write_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "healthy": true,
                "version": "1.0.0",
                "status": "ok",
                "server": "ZeusDesigns Local OpenAI & Native OpenCode Server",
                "port": port,
                "base_url": format!("http://127.0.0.1:{}/v1", port),
                "models_count": models.len(),
                "requests_served": server_state.request_count.load(Ordering::Relaxed),
                "opencode_ready": true
            }),
        );
        return;
    }

    // Native OpenCode SDK Server Protocol (`/event`, `/session`, `/session/{id}/message`, `/session/{id}/abort`)
    if method == "GET" && (path == "/event" || path == "/global/event" || path == "/api/event") {
        if write_sse_headers(&mut stream).is_err() {
            return;
        }
        let _ = write_sse_data(&mut stream, &json!({ "type": "server.connected", "properties": {} }));
        let (tx, rx) = std::sync::mpsc::channel::<Value>();
        if let Ok(mut subs) = server_state.oc_subscribers.lock() {
            subs.push(tx);
        }
        loop {
            match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(ev) => {
                    if write_sse_data(&mut stream, &ev).is_err() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if stream.write_all(b": keepalive\n\n").is_err() || stream.flush().is_err() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        return;
    }

    if (path == "/session" || path == "/api/session") && method == "GET" {
        let list: Vec<Value> = server_state
            .oc_sessions
            .lock()
            .map(|m| {
                m.values()
                    .map(|s| {
                        json!({
                            "id": s.id,
                            "title": s.title,
                            "directory": s.directory,
                            "version": "1.0.0",
                            "time": { "created": s.created, "updated": now_secs() }
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        write_json_response(&mut stream, "200 OK", &json!(list));
        return;
    }

    if (path == "/session" || path == "/api/session") && method == "POST" {
        let req_json: Value = serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({}));
        let sid = format!("ses_{}", random_hex(12));
        let title = req_json
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("New Session")
            .to_string();
        let dir_q = raw_path
            .split('?')
            .nth(1)
            .and_then(|q| {
                q.split('&').find_map(|kv| {
                    let (k, v) = kv.split_once('=')?;
                    if k == "directory" {
                        Some(percent_decode(v))
                    } else {
                        None
                    }
                })
            })
            .unwrap_or_default();
        let created = now_secs();
        let sess = OcSession {
            id: sid.clone(),
            title: title.clone(),
            directory: dir_q.clone(),
            messages: Vec::new(),
            created,
        };
        if let Ok(mut guard) = server_state.oc_sessions.lock() {
            guard.insert(sid.clone(), sess);
        }
        write_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "id": sid,
                "title": title,
                "directory": dir_q,
                "version": "1.0.0",
                "time": { "created": created, "updated": created }
            }),
        );
        return;
    }

    if path.starts_with("/session/") || path.starts_with("/api/session/") {
        let clean_p = path.trim_start_matches("/api");
        let segs: Vec<&str> = clean_p.split('/').filter(|s| !s.is_empty()).collect();
        if segs.len() >= 2 && segs[0] == "session" {
            let sid = segs[1].to_string();
            let action = segs.get(2).copied().unwrap_or("");
            if method == "GET" && action.is_empty() {
                let info = server_state
                    .oc_sessions
                    .lock()
                    .ok()
                    .and_then(|g| g.get(&sid).cloned());
                if let Some(s) = info {
                    write_json_response(
                        &mut stream,
                        "200 OK",
                        &json!({
                            "id": s.id,
                            "title": s.title,
                            "directory": s.directory,
                            "version": "1.0.0",
                            "time": { "created": s.created, "updated": now_secs() }
                        }),
                    );
                } else {
                    write_json_response(&mut stream, "404 Not Found", &json!({ "error": "Session not found" }));
                }
                return;
            }
            if method == "DELETE" && action.is_empty() {
                if let Ok(mut guard) = server_state.oc_sessions.lock() {
                    guard.remove(&sid);
                }
                write_json_response(&mut stream, "200 OK", &json!(true));
                return;
            }
            if method == "POST" && (action == "abort" || action == "interrupt") {
                if let Ok(guard) = server_state.oc_cancels.lock() {
                    if let Some(flag) = guard.get(&sid) {
                        flag.store(true, Ordering::Relaxed);
                    }
                }
                server_state.broadcast_oc_event(json!({
                    "type": "session.idle",
                    "properties": { "sessionID": sid }
                }));
                write_json_response(&mut stream, "200 OK", &json!(true));
                return;
            }
            if method == "POST" && (action == "message" || action == "prompt" || action == "prompt_async") {
                handle_opencode_session_message(
                    &mut stream,
                    raw_path,
                    &sid,
                    &body_bytes,
                    engine,
                    server_state,
                );
                return;
            }
        }
    }

    if method == "GET" && (path == "/v1/models" || path == "/models") {
        let models = build_openai_models_list();
        write_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "object": "list",
                "data": models
            }),
        );
        return;
    }

    if method == "GET" && (path == "/v1/opencode.json" || path == "/opencode.json") {
        let cfg = generate_opencode_config_json(port);
        write_json_response(&mut stream, "200 OK", &cfg);
        return;
    }

    if method == "POST"
        && (path == "/v1/chat/completions"
            || path == "/chat/completions"
            || path == "/v1/responses"
            || path == "/responses"
            || path == "/v1/messages"
            || path == "/messages")
    {
        server_state.request_count.fetch_add(1, Ordering::Relaxed);
        let req_json: Value = match serde_json::from_slice(&body_bytes) {
            Ok(v) => v,
            Err(e) => {
                write_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &json!({ "error": { "message": format!("Invalid JSON body: {}", e), "type": "invalid_request_error" } }),
                );
                return;
            }
        };

        let is_anthropic_path = path.ends_with("/messages");
        let is_responses_path = path.ends_with("/responses");

        let requested_model = req_json
            .get("model")
            .and_then(|m| m.as_str())
            .unwrap_or("gemini-4-hydrogen")
            .to_string();
        let (provider_id, upstream_model) = resolve_provider_and_model(&requested_model);

        if let Ok(mut guard) = server_state.last_model.lock() {
            *guard = format!("{}/{}", provider_id, upstream_model);
        }

        let want_stream = req_json
            .get("stream")
            .and_then(|s| s.as_bool())
            .unwrap_or(false);

        let raw_msgs = if let Some(arr) = req_json.get("messages").and_then(|m| m.as_array()) {
            arr.clone()
        } else if let Some(inp) = req_json.get("input") {
            if let Some(arr) = inp.as_array() {
                arr.clone()
            } else if let Some(s) = inp.as_str() {
                vec![json!({ "role": "user", "content": s })]
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        let (mut system_prompt, chat_messages) = parse_openai_messages(&raw_msgs);

        // Merge top-level `system` or `instructions` field (used by Anthropic `/v1/messages` and OpenAI `/v1/responses`)
        if let Some(top_sys) = req_json.get("system").or_else(|| req_json.get("instructions")) {
            let sys_extra = if let Some(s) = top_sys.as_str() {
                s.to_string()
            } else if let Some(arr) = top_sys.as_array() {
                arr.iter()
                    .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                String::new()
            };
            if !sys_extra.trim().is_empty() {
                if system_prompt.is_empty() {
                    system_prompt = sys_extra;
                } else {
                    system_prompt = format!("{}\n\n{}", sys_extra, system_prompt);
                }
            }
        }

        // Universal OpenCode / OpenAI / Anthropic tool-calling injection
        let tools_arr = req_json
            .get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        let mut known_tool_names = HashSet::new();
        for t in &tools_arr {
            let func = t.get("function").unwrap_or(t);
            if let Some(n) = func.get("name").and_then(|x| x.as_str()) {
                known_tool_names.insert(n.to_string());
            }
        }
        let mut chat_messages = chat_messages;
        if !tools_arr.is_empty() {
            let tool_block =
                build_opencode_tools_system_block(&tools_arr, req_json.get("tool_choice"));
            // Place tool protocol at the top of system_prompt so provider character caps never truncate tool schemas
            if system_prompt.is_empty() {
                system_prompt = tool_block.trim().to_string();
            } else {
                system_prompt = format!("{}\n\n{}", tool_block.trim(), system_prompt);
            }
            // Reinforce `<tool_call>` syntax after `<tool_response>` on multi-turn OpenCode tool loops
            if let Some(last_msg) = chat_messages.last_mut() {
                if last_msg.role == "user" && last_msg.content.contains("<tool_response") {
                    last_msg.content.push_str(
                        "\n\n[OpenCode Tool-Call Protocol: Review the <tool_response> above. If another tool action is required, output ONLY <tool_call>{\"name\": \"tool_name\", \"arguments\": {...}}</tool_call>. If no more tools are needed, answer the user directly without <tool_call> tags.]",
                    );
                }
            }
        }

        let effort = req_json
            .get("reasoning_effort")
            .and_then(|e| e.as_str())
            .unwrap_or("medium")
            .to_string();

        let chat_req = ChatRequest {
            request_id: format!("srv-{}", uuid_v4()),
            provider: provider_id.clone(),
            model: upstream_model.clone(),
            effort,
            system: system_prompt,
            messages: chat_messages,
            workspace_root: None,
            custom: None,
        };

        let cancel = AtomicBool::new(false);
        let created = now_secs();
        let completion_id = format!("chatcmpl-{}", random_hex(12));

        // When tools are present or non-streaming is requested, collect the full output so `<tool_call>` blocks
        // can be deterministically compiled into OpenAI `tool_calls` or Anthropic `tool_use` blocks.
        if !want_stream || !tools_arr.is_empty() {
            let mut full_raw = String::new();
            let res = dispatch_stream(&engine, &chat_req, &cancel, |delta| {
                full_raw.push_str(delta);
            });

            if let Err(err) = res {
                write_json_response(
                    &mut stream,
                    "502 Bad Gateway",
                    &json!({ "error": { "message": err, "type": "upstream_error" } }),
                );
                return;
            }

            let (reasoning, answer_raw) = split_thinking_and_content(&full_raw);
            let (clean_text, tool_calls) =
                extract_tool_calls_from_text(&answer_raw, &known_tool_names);

            let prompt_tokens = 128u64;
            let completion_tokens = ((full_raw.len() / 4) as u64).max(1);

            if is_anthropic_path {
                handle_anthropic_response(
                    &mut stream,
                    want_stream,
                    &requested_model,
                    &reasoning,
                    &clean_text,
                    &tool_calls,
                    prompt_tokens,
                    completion_tokens,
                );
                return;
            }

            if is_responses_path {
                handle_openai_responses_api(
                    &mut stream,
                    want_stream,
                    &requested_model,
                    &clean_text,
                    &tool_calls,
                    prompt_tokens,
                    completion_tokens,
                );
                return;
            }

            if want_stream {
                if write_sse_headers(&mut stream).is_err() {
                    return;
                }
                // Role start chunk
                let _ = write_sse_data(
                    &mut stream,
                    &json!({
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "delta": { "role": "assistant", "content": "" },
                            "finish_reason": Value::Null
                        }]
                    }),
                );
                if !reasoning.is_empty() {
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "reasoning_content": reasoning },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                }
                if !clean_text.is_empty() {
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "content": clean_text },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                }
                if !tool_calls.is_empty() {
                    let tc_deltas: Vec<Value> = tool_calls
                        .iter()
                        .enumerate()
                        .map(|(idx, tc)| {
                            json!({
                                "index": idx,
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments
                                }
                            })
                        })
                        .collect();
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "tool_calls": tc_deltas },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                }
                let finish_reason = if tool_calls.is_empty() {
                    "stop"
                } else {
                    "tool_calls"
                };
                let _ = write_sse_data(
                    &mut stream,
                    &json!({
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "delta": {},
                            "finish_reason": finish_reason
                        }],
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": prompt_tokens + completion_tokens
                        }
                    }),
                );
                let _ = stream.write_all(b"data: [DONE]\n\n");
                let _ = stream.flush();
            } else {
                let mut msg_obj = json!({
                    "role": "assistant",
                    "content": if clean_text.is_empty() && !tool_calls.is_empty() {
                        Value::Null
                    } else {
                        Value::String(clean_text)
                    }
                });
                if !reasoning.is_empty() {
                    msg_obj["reasoning_content"] = Value::String(reasoning);
                }
                if !tool_calls.is_empty() {
                    let tcs: Vec<Value> = tool_calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments
                                }
                            })
                        })
                        .collect();
                    msg_obj["tool_calls"] = Value::Array(tcs);
                }
                let finish_reason = if tool_calls.is_empty() {
                    "stop"
                } else {
                    "tool_calls"
                };
                write_json_response(
                    &mut stream,
                    "200 OK",
                    &json!({
                        "id": completion_id,
                        "object": "chat.completion",
                        "created": created,
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "message": msg_obj,
                            "finish_reason": finish_reason
                        }],
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": prompt_tokens + completion_tokens
                        }
                    }),
                );
            }
            return;
        }

        // Pure low-latency token-by-token SSE streaming when `stream: true` and no tool schema was passed
        if write_sse_headers(&mut stream).is_err() {
            return;
        }
        let _ = write_sse_data(
            &mut stream,
            &json!({
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": requested_model,
                "choices": [{
                    "index": 0,
                    "delta": { "role": "assistant", "content": "" },
                    "finish_reason": Value::Null
                }]
            }),
        );

        let mut total_chars = 0usize;
        let mut in_think = false;
        let _ = dispatch_stream(&engine, &chat_req, &cancel, |delta| {
            total_chars += delta.len();
            let mut s = delta;
            while !s.is_empty() {
                if !in_think {
                    if let Some(pos) = s.find("<think>") {
                        let before = &s[..pos];
                        if !before.is_empty() {
                            let _ = write_sse_data(
                                &mut stream,
                                &json!({
                                    "id": completion_id,
                                    "object": "chat.completion.chunk",
                                    "created": created,
                                    "model": requested_model,
                                    "choices": [{
                                        "index": 0,
                                        "delta": { "content": before },
                                        "finish_reason": Value::Null
                                    }]
                                }),
                            );
                        }
                        in_think = true;
                        s = &s[pos + 7..];
                    } else {
                        let _ = write_sse_data(
                            &mut stream,
                            &json!({
                                "id": completion_id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": requested_model,
                                "choices": [{
                                    "index": 0,
                                    "delta": { "content": s },
                                    "finish_reason": Value::Null
                                }]
                            }),
                        );
                        break;
                    }
                } else if let Some(pos) = s.find("</think>") {
                    let thought = &s[..pos];
                    if !thought.is_empty() {
                        let _ = write_sse_data(
                            &mut stream,
                            &json!({
                                "id": completion_id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": requested_model,
                                "choices": [{
                                    "index": 0,
                                    "delta": { "reasoning_content": thought },
                                    "finish_reason": Value::Null
                                }]
                            }),
                        );
                    }
                    in_think = false;
                    s = &s[pos + 8..];
                } else {
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "reasoning_content": s },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                    break;
                }
            }
        });

        let comp_toks = ((total_chars / 4) as u64).max(1);
        let _ = write_sse_data(
            &mut stream,
            &json!({
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": requested_model,
                "choices": [{
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 128,
                    "completion_tokens": comp_toks,
                    "total_tokens": 128 + comp_toks
                }
            }),
        );
        let _ = stream.write_all(b"data: [DONE]\n\n");
        let _ = stream.flush();
        return;
    }

    write_json_response(
        &mut stream,
        "404 Not Found",
        &json!({
            "error": {
                "message": format!("Unknown endpoint '{}'. Supported: GET /v1/models, POST /v1/chat/completions, POST /v1/responses, POST /v1/messages", path),
                "type": "not_found_error"
            }
        }),
    );
}

fn handle_anthropic_response(
    stream: &mut TcpStream,
    want_stream: bool,
    model: &str,
    reasoning: &str,
    clean_text: &str,
    tool_calls: &[ParsedToolCall],
    input_tokens: u64,
    output_tokens: u64,
) {
    let msg_id = format!("msg_{}", random_hex(12));
    let stop_reason = if tool_calls.is_empty() {
        "end_turn"
    } else {
        "tool_use"
    };

    if !want_stream {
        let mut content = Vec::new();
        if !reasoning.is_empty() {
            content.push(json!({ "type": "thinking", "thinking": reasoning }));
        }
        if !clean_text.is_empty() || tool_calls.is_empty() {
            content.push(json!({ "type": "text", "text": clean_text }));
        }
        for tc in tool_calls {
            let input_val: Value =
                serde_json::from_str(&tc.arguments).unwrap_or_else(|_| json!({}));
            content.push(json!({
                "type": "tool_use",
                "id": tc.id,
                "name": tc.name,
                "input": input_val
            }));
        }
        write_json_response(
            stream,
            "200 OK",
            &json!({
                "id": msg_id,
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": content,
                "stop_reason": stop_reason,
                "stop_sequence": Value::Null,
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens
                }
            }),
        );
        return;
    }

    if write_sse_headers(stream).is_err() {
        return;
    }
    let _ = write_sse_event(
        stream,
        "message_start",
        &json!({
            "type": "message_start",
            "message": {
                "id": msg_id,
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": [],
                "stop_reason": Value::Null,
                "stop_sequence": Value::Null,
                "usage": { "input_tokens": input_tokens, "output_tokens": 1 }
            }
        }),
    );

    let mut block_idx = 0usize;
    if !clean_text.is_empty() || tool_calls.is_empty() {
        let _ = write_sse_event(
            stream,
            "content_block_start",
            &json!({
                "type": "content_block_start",
                "index": block_idx,
                "content_block": { "type": "text", "text": "" }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_delta",
            &json!({
                "type": "content_block_delta",
                "index": block_idx,
                "delta": { "type": "text_delta", "text": clean_text }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_stop",
            &json!({ "type": "content_block_stop", "index": block_idx }),
        );
        block_idx += 1;
    }

    for tc in tool_calls {
        let _ = write_sse_event(
            stream,
            "content_block_start",
            &json!({
                "type": "content_block_start",
                "index": block_idx,
                "content_block": {
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": {}
                }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_delta",
            &json!({
                "type": "content_block_delta",
                "index": block_idx,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": tc.arguments
                }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_stop",
            &json!({ "type": "content_block_stop", "index": block_idx }),
        );
        block_idx += 1;
    }

    let _ = write_sse_event(
        stream,
        "message_delta",
        &json!({
            "type": "message_delta",
            "delta": { "stop_reason": stop_reason, "stop_sequence": Value::Null },
            "usage": { "output_tokens": output_tokens }
        }),
    );
    let _ = write_sse_event(stream, "message_stop", &json!({ "type": "message_stop" }));
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
        opencode_config_url: format!("{}/v1/opencode.json", base),
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

#[tauri::command(async)]
pub fn server_opencode_config(state: tauri::State<'_, Arc<LocalServerState>>) -> Value {
    let port = state.port.load(Ordering::Relaxed);
    generate_opencode_config_json(port)
}

#[tauri::command(async)]
pub fn server_install_opencode(
    workspace_root: Option<String>,
    state: tauri::State<'_, Arc<LocalServerState>>,
) -> Result<Value, String> {
    let port = state.port.load(Ordering::Relaxed);
    let generated = generate_opencode_config_json(port);
    let mut written_paths = Vec::new();

    // 1. Write/merge into global `~/.config/opencode/opencode.json`
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    if !home.is_empty() {
        let global_dir = PathBuf::from(&home).join(".config").join("opencode");
        if fs::create_dir_all(&global_dir).is_ok() {
            let global_file = global_dir.join("opencode.json");
            let merged = merge_opencode_json(&global_file, &generated);
            if let Ok(pretty) = serde_json::to_string_pretty(&merged) {
                if fs::write(&global_file, pretty).is_ok() {
                    written_paths.push(global_file.to_string_lossy().to_string());
                }
            }
        }
    }

    // 2. If a workspace folder is open in ZeusDesigns, also write/merge `opencode.json` in the workspace root
    if let Some(ws) = workspace_root {
        let ws_trimmed = ws.trim();
        if !ws_trimmed.is_empty() {
            let ws_file = PathBuf::from(ws_trimmed).join("opencode.json");
            let merged = merge_opencode_json(&ws_file, &generated);
            if let Ok(pretty) = serde_json::to_string_pretty(&merged) {
                if fs::write(&ws_file, pretty).is_ok() {
                    written_paths.push(ws_file.to_string_lossy().to_string());
                }
            }
        }
    }

    if written_paths.is_empty() {
        return Err("Could not write opencode.json to ~/.config/opencode/opencode.json".to_string());
    }

    Ok(json!({
        "ok": true,
        "paths": written_paths,
        "baseUrl": format!("http://127.0.0.1:{}/v1", port),
        "defaultModel": "zeusdesigns/gemini-4-hydrogen"
    }))
}

fn merge_opencode_json(path: &PathBuf, generated: &Value) -> Value {
    let mut base = fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or_else(|| json!({}));
    if !base.is_object() {
        base = json!({});
    }
    base["$schema"] = json!("https://opencode.ai/config.json");
    if base.get("model").is_none() {
        base["model"] = json!("zeusdesigns/gemini-4-hydrogen");
    }
    if base.get("small_model").is_none() {
        base["small_model"] = json!("zeusdesigns/claude-haiku-5-5");
    }
    if !base.get("provider").map(|p| p.is_object()).unwrap_or(false) {
        base["provider"] = json!({});
    }
    if let Some(zeus_prov) = generated.get("provider").and_then(|p| p.get("zeusdesigns")) {
        base["provider"]["zeusdesigns"] = zeus_prov.clone();
    }
    base
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
