use crate::crypto::{
    decode_data_url, fake_ipv4, generate_deepai_island_key, generate_deepai_tryit_key,
    hmac_sha256_bytes, hmac_sha256_hex, iso8601_utc_compact, pseudo_random_u64, random_hex,
    sha256_hex, uuid_v4,
};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelSpec {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default)]
    pub reasoning: bool,
    #[serde(default)]
    pub vision: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub speed: String,
    pub status: String,
    pub models: Vec<ModelSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentPayload {
    pub name: String,
    pub mime: String,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<AttachmentPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomEndpoint {
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub format: String, // "openai" | "anthropic"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub provider: String,
    pub model: String,
    pub effort: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
    #[serde(rename = "workspaceRoot")]
    pub workspace_root: Option<String>,
    pub custom: Option<CustomEndpoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QwenAppAccount {
    pub email: String,
    pub password: String,
    pub device: String,
    pub token: String,
    pub created: u64,
    #[serde(default)]
    pub cool_until: u64,
}

#[derive(Default)]
pub struct ProviderSessionState {
    pub inception_token: Option<(String, u64)>,
    pub motif_conversation_id: Option<String>,
    pub gemini_session: Option<GeminiWarmSession>,
    pub qwen_accounts: Vec<QwenAppAccount>,
    pub qwen_provision_failed_until: u64,
    pub active_cancels: HashMap<String, Arc<AtomicBool>>,
}

#[derive(Clone)]
pub struct GeminiWarmSession {
    pub fsid: String,
    pub bl: String,
    pub snlm0e: String,
    pub reqid: u64,
}

pub struct ProviderEngine {
    pub state: Mutex<ProviderSessionState>,
}

impl Default for ProviderEngine {
    fn default() -> Self {
        Self {
            state: Mutex::new(ProviderSessionState::default()),
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn build_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .user_agent(CHROME_UA)
        .cookie_store(true)
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))
}

pub fn catalog() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            id: "mercury3".to_string(),
            name: "Mercury 3 (Inception Diffusion)".to_string(),
            kind: "keyless".to_string(),
            speed: "1,000–2,000+ tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![ModelSpec {
                id: "mercury-3".to_string(),
                label: "Mercury 3".to_string(),
                note: Some("Diffusion LLM · 1,000–2,000+ tok/s".to_string()),
                reasoning: true,
                vision: false,
            }],
        },
        ProviderInfo {
            id: "kilo".to_string(),
            name: "Kilo Gateway".to_string(),
            kind: "keyless".to_string(),
            speed: "~140 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "nvidia/nemotron-3.5-super-vl:free".to_string(),
                    label: "Nemotron 3.5 Super VL".to_string(),
                    note: Some("1M ctx · 120B MoE vision & UI architect".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free".to_string(),
                    label: "Nemotron 3 Nano Omni VL".to_string(),
                    note: Some("256k ctx · 30B Omni vision & reasoning".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "openrouter/free".to_string(),
                    label: "OpenRouter Free VL".to_string(),
                    note: Some("200k ctx · Auto-routed multimodal VL pool".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "nvidia/nemotron-3-ultra-550b-a55b:free".to_string(),
                    label: "Nemotron 3 Ultra 550B".to_string(),
                    note: Some("1M ctx · 550B MoE frontier reasoning".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "nvidia/nemotron-3.5-lightning:free".to_string(),
                    label: "Nemotron 3.5 Lightning".to_string(),
                    note: Some("1M ctx · High-speed MoE UI coder".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "inclusionai/ling-3.2-flash:free".to_string(),
                    label: "Ling 3.2 Flash VL".to_string(),
                    note: Some("1M ctx · Fast multimodal UI coder".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "baidu/ernie-5.5-flash-preview:free".to_string(),
                    label: "ERNIE 5.5 Flash".to_string(),
                    note: Some("1M ctx · Baidu flagship reasoning & layout".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "reflection/beam-free".to_string(),
                    label: "Reflection Beam 1.0".to_string(),
                    note: Some("1M ctx · 501B MoE software engineering".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "particle-ai/particle-1:free".to_string(),
                    label: "Particle-1 VL".to_string(),
                    note: Some("1M ctx · Multimodal design & reasoning".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "dots-studio/dots-3-note-preview:free".to_string(),
                    label: "Dots 3 Note VL".to_string(),
                    note: Some("262k ctx · Multimodal vision & UI notes".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "recursive/flint-v1.0:free".to_string(),
                    label: "Recursive Flint 1.0".to_string(),
                    note: Some("262k ctx · Fast code & UI synthesis".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "kilo-auto/free".to_string(),
                    label: "Kilo Auto Free".to_string(),
                    note: Some("256k ctx · Fastest available free model".to_string()),
                    reasoning: true,
                    vision: false,
                },
            ],
        },
        ProviderInfo {
            id: "qwen".to_string(),
            name: "Qwen".to_string(),
            kind: "keyless".to_string(),
            speed: "~90 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "qwen4-max".to_string(),
                    label: "Qwen 4 Max".to_string(),
                    note: Some("1M ctx · Alibaba flagship coder & OSS vision".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "qwen3.8-max".to_string(),
                    label: "Qwen 3.8 Max".to_string(),
                    note: Some("1M ctx · Multimodal reasoning & frontend specialist".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "qwen3.8-omni-flash".to_string(),
                    label: "Qwen 3.8 Omni Flash".to_string(),
                    note: Some("1M ctx · Fast native multimodal vision & UI".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "qwen3.5-omni-plus".to_string(),
                    label: "Qwen 3.5 Omni Plus".to_string(),
                    note: Some("1M ctx · Multimodal vision specialist".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "qwen3.7-max".to_string(),
                    label: "Qwen 3.7 Max".to_string(),
                    note: Some("1M ctx · Flagship multimodal & thinking".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "qwen3.7-plus".to_string(),
                    label: "Qwen 3.7 Plus".to_string(),
                    note: Some("1M ctx · Multimodal & thinking".to_string()),
                    reasoning: true,
                    vision: true,
                },
            ],
        },
        ProviderInfo {
            id: "ptero".to_string(),
            name: "Ptero Frontier".to_string(),
            kind: "keyless".to_string(),
            speed: "~120 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "gpt-6.1-terra:voyage".to_string(),
                    label: "GPT-6.1 Terra".to_string(),
                    note: Some("Frontier multimodal vision & UI architect".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "agnes-2.5-flash:agnes".to_string(),
                    label: "Agnes 2.5 Flash VL".to_string(),
                    note: Some("Multimodal vision, reasoning & UI synthesis".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "agnes-3.0-flash:agnes".to_string(),
                    label: "Agnes 3.0 Flash".to_string(),
                    note: Some("Fast frontend architecture & reasoning".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "glm-5.3-flash".to_string(),
                    label: "GLM 5.3 Flash (Ptero)".to_string(),
                    note: Some("Z.ai 320B MoE fast UI coder".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "mimo-v2.6-flash:tokenharbor".to_string(),
                    label: "MiMo V2.6 Flash".to_string(),
                    note: Some("Xiaomi fast reasoning & frontend coder".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "kimi-k3:apinex".to_string(),
                    label: "Kimi K3 (Ptero)".to_string(),
                    note: Some("Moonshot 2.8T MoE".to_string()),
                    reasoning: false,
                    vision: false,
                },
            ],
        },
        ProviderInfo {
            id: "unikey".to_string(),
            name: "Unikey Anonymous".to_string(),
            kind: "keyless".to_string(),
            speed: "~125 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "moonshotai/kimi-k3".to_string(),
                    label: "Kimi K3 2.8T".to_string(),
                    note: Some("Moonshot 2.8T MoE flagship".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "moonshotai/kimi-k2.7-code".to_string(),
                    label: "Kimi K2.7 Code".to_string(),
                    note: Some("Frontend & UI architecture specialist".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "x-ai/grok-4.3".to_string(),
                    label: "Grok 4.3".to_string(),
                    note: Some("xAI frontier reasoning & code".to_string()),
                    reasoning: true,
                    vision: false,
                },
            ],
        },
        ProviderInfo {
            id: "llm7".to_string(),
            name: "LLM7 Gateway".to_string(),
            kind: "keyless".to_string(),
            speed: "~160 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "codestral-latest".to_string(),
                    label: "Codestral Latest".to_string(),
                    note: Some("Mistral flagship coding & UI engine".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "gemma-3-27b".to_string(),
                    label: "Gemma 3 27B".to_string(),
                    note: Some("Google 27B open instruction model".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "gpt-oss:20b".to_string(),
                    label: "GPT-OSS 20B".to_string(),
                    note: Some("OpenAI open-weights fast coder".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "default".to_string(),
                    label: "LLM7 Auto Router".to_string(),
                    note: Some("400k ctx anonymous router".to_string()),
                    reasoning: false,
                    vision: false,
                },
            ],
        },
        ProviderInfo {
            id: "pollinations".to_string(),
            name: "Pollinations AI".to_string(),
            kind: "keyless".to_string(),
            speed: "~150 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "openai".to_string(),
                    label: "OpenAI Fast Reasoning".to_string(),
                    note: Some("Zero-key reasoning & UI generator".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "openai-fast".to_string(),
                    label: "OpenAI Turbo".to_string(),
                    note: Some("Low-latency UI & copy engine".to_string()),
                    reasoning: true,
                    vision: false,
                },
            ],
        },
        ProviderInfo {
            id: "yqcloud".to_string(),
            name: "YQCloud Stream".to_string(),
            kind: "keyless".to_string(),
            speed: "~130 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![ModelSpec {
                id: "yqcloud-default".to_string(),
                label: "YQCloud GPT Stream".to_string(),
                note: Some("Zero-auth high-availability stream".to_string()),
                reasoning: false,
                vision: false,
            }],
        },
        ProviderInfo {
            id: "deepai".to_string(),
            name: "DeepAI".to_string(),
            kind: "keyless".to_string(),
            speed: "~60 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "claude-haiku-5-5".to_string(),
                    label: "Claude Haiku 5.5 (DeepAI)".to_string(),
                    note: Some("Anthropic fast UI layout & code".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "gpt-6-luna".to_string(),
                    label: "GPT-6 Luna (DeepAI)".to_string(),
                    note: Some("OpenAI fast UI generator".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "glm-5.3-flash".to_string(),
                    label: "GLM 5.3 Flash (DeepAI)".to_string(),
                    note: Some("Z.ai 320B MoE UI coder".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "gemma-4".to_string(),
                    label: "Gemma 4 (DeepAI)".to_string(),
                    note: Some("Google compact UI generator".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "qwen3.8-flash".to_string(),
                    label: "Qwen 3.8 Flash (DeepAI)".to_string(),
                    note: Some("Fast coding".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "deepseek-v4.1-flash".to_string(),
                    label: "DeepSeek V4.1 Flash".to_string(),
                    note: Some("Fast code & layout".to_string()),
                    reasoning: false,
                    vision: false,
                },
                ModelSpec {
                    id: "standard".to_string(),
                    label: "DeepAI Standard".to_string(),
                    note: Some("IslandKey rotation".to_string()),
                    reasoning: false,
                    vision: false,
                },
            ],
        },
        ProviderInfo {
            id: "k2horizon".to_string(),
            name: "K2Horizon".to_string(),
            kind: "keyless".to_string(),
            speed: "~70 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![ModelSpec {
                id: "k2-horizon".to_string(),
                label: "K2-Horizon 375B".to_string(),
                note: Some("IFM/K2-Horizon-375B-A23B reasoning MoE".to_string()),
                reasoning: true,
                vision: false,
            }],
        },
        ProviderInfo {
            id: "motif".to_string(),
            name: "Motif".to_string(),
            kind: "keyless".to_string(),
            speed: "~80 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "motif-3-102b".to_string(),
                    label: "Motif 3 102B".to_string(),
                    note: Some("Enterprise guest SSE stream".to_string()),
                    reasoning: true,
                    vision: false,
                },
                ModelSpec {
                    id: "motif-3-12.7b".to_string(),
                    label: "Motif 3 12.7B".to_string(),
                    note: Some("Fast reasoning".to_string()),
                    reasoning: true,
                    vision: false,
                },
            ],
        },
        ProviderInfo {
            id: "longcat".to_string(),
            name: "LongCat".to_string(),
            kind: "keyless".to_string(),
            speed: "~100 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![ModelSpec {
                id: "longcat-2.5".to_string(),
                label: "LongCat 2.5".to_string(),
                note: Some("1.6T MoE oversea-V2".to_string()),
                reasoning: true,
                vision: false,
            }],
        },
        ProviderInfo {
            id: "geminiweb".to_string(),
            name: "Gemini Web".to_string(),
            kind: "keyless".to_string(),
            speed: "~150 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![ModelSpec {
                id: "gemini-flash-lite".to_string(),
                label: "Gemini Flash-Lite".to_string(),
                note: Some("Anonymous StreamGenerate session".to_string()),
                reasoning: false,
                vision: false,
            }],
        },
        ProviderInfo {
            id: "chatjimmy".to_string(),
            name: "ChatJimmy".to_string(),
            kind: "keyless".to_string(),
            speed: "20,000+ tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![ModelSpec {
                id: "llama3.1-8b".to_string(),
                label: "Llama 3.1 8B (Taalas Silicon)".to_string(),
                note: Some("20,000+ tok/s instant title & micro-task engine".to_string()),
                reasoning: false,
                vision: false,
            }],
        },
    ]
}

/// Strip `<|stats|>...<|/stats|>` and `<|think|>...<|/think|>` from ChatJimmy micro-task output.
pub fn clean_chatjimmy_output(raw: &str) -> String {
    let mut s = raw.to_string();
    while let Some(start) = s.find("<|stats|>") {
        if let Some(end) = s[start..].find("<|/stats|>") {
            s.replace_range(start..start + end + 10, "");
        } else {
            s.truncate(start);
            break;
        }
    }
    while let Some(start) = s.find("<|think|>") {
        if let Some(end) = s[start..].find("<|/think|>") {
            s.replace_range(start..start + end + 10, "");
        } else {
            break;
        }
    }
    s.trim().to_string()
}

/// Convert `<|think|>...<|/think|>` to `<think>...</think>` and strip `<|stats|>` for ChatJimmy chat turns.
pub fn format_chatjimmy_chat(raw: &str) -> String {
    let mut s = raw.to_string();
    while let Some(start) = s.find("<|stats|>") {
        if let Some(end) = s[start..].find("<|/stats|>") {
            s.replace_range(start..start + end + 10, "");
        } else {
            s.truncate(start);
            break;
        }
    }
    s.replace("<|think|>", "<think>")
        .replace("<|/think|>", "</think>")
        .trim()
        .to_string()
}

/// Call ChatJimmy (20,000+ tok/s Llama 3.1 8B) for instant title generation & micro-tasks.
pub fn chatjimmy_complete(system_prompt: &str, user_prompt: &str) -> Result<String, String> {
    let client = build_client(15)?;
    let mut msgs = Vec::new();
    if !system_prompt.trim().is_empty() {
        msgs.push(json!({ "role": "system", "content": system_prompt }));
    }
    msgs.push(json!({ "role": "user", "content": user_prompt }));

    let payload = json!({
        "messages": msgs,
        "chatOptions": {
            "selectedModel": "llama3.1-8B",
            "topK": 8
        }
    });

    let resp = client
        .post("https://chatjimmy.ai/api/chat")
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .header("Origin", "https://chatjimmy.ai")
        .header("Referer", "https://chatjimmy.ai/")
        .header("X-Real-IP", fake_ipv4())
        .json(&payload)
        .send()
        .map_err(|e| format!("chatjimmy network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("chatjimmy HTTP {}", resp.status()));
    }
    let body = resp.text().map_err(|e| e.to_string())?;
    let cleaned = clean_chatjimmy_output(&body);
    if cleaned.is_empty() {
        return Err("chatjimmy returned empty response".to_string());
    }
    Ok(cleaned)
}

/// Ensure a valid session token from `https://chat.inceptionlabs.ai/api/session` (Mercury 3).
fn ensure_inception_token(engine: &ProviderEngine, force_refresh: bool) -> Result<String, String> {
    if !force_refresh {
        if let Ok(guard) = engine.state.lock() {
            if let Some((tok, exp)) = &guard.inception_token {
                if *exp > now_secs() + 60 {
                    return Ok(tok.clone());
                }
            }
        }
    }

    let client = build_client(20)?;
    let resp = client
        .get("https://chat.inceptionlabs.ai/api/session")
        .header("Accept", "*/*")
        .header("Origin", "https://chat.inceptionlabs.ai")
        .header("Referer", "https://chat.inceptionlabs.ai/")
        .send()
        .map_err(|e| format!("Inception session request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Inception session HTTP {}", resp.status()));
    }
    let data: Value = resp.json().map_err(|e| format!("Inception session JSON error: {}", e))?;
    let token = data
        .get("token")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();
    if token.is_empty() {
        return Err("Inception session returned empty token".to_string());
    }

    if let Ok(mut guard) = engine.state.lock() {
        guard.inception_token = Some((token.clone(), now_secs() + 3600));
    }
    Ok(token)
}

/// Stream from Mercury 3 (`https://chat.inceptionlabs.ai/api/chat`, 1,000-2,000+ tok/s diffusion LLM).
pub fn stream_mercury3<F>(
    engine: &ProviderEngine,
    system: &str,
    messages: &[ChatMessage],
    effort: &str,
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let inc_effort = match effort {
        "low" => "low",
        "medium" => "medium",
        _ => "high",
    };
    for attempt in 0..2 {
        let token = ensure_inception_token(engine, attempt > 0)?;
        let mut inc_msgs = Vec::new();
        if !system.trim().is_empty() {
            let sys_full: String = system.chars().take(24000).collect();
            inc_msgs.push(json!({
                "id": random_hex(16),
                "role": "user",
                "parts": [{ "type": "text", "text": format!("[Zeus Desktop Harness & Design System Specification]\n{}", sys_full) }]
            }));
            inc_msgs.push(json!({
                "id": random_hex(16),
                "role": "assistant",
                "parts": [{ "type": "text", "text": "Understood. I am Zeus running inside the ZeusDesigns desktop harness with direct read/write access to the user's multi-artboard canvas. I will inspect <canvas_state> and <current_artboard> directly and emit complete <artboard> or <zeus_tool> blocks to create or revise screens in place without ever asking the user to paste HTML." }]
            }));
        }
        for m in messages.iter() {
            inc_msgs.push(json!({
                "id": random_hex(16),
                "role": m.role,
                "parts": [{ "type": "text", "text": m.content }]
            }));
        }

        let payload = json!({
            "reasoningEffort": inc_effort,
            "webSearchEnabled": false,
            "voiceMode": false,
            "timezone": "UTC",
            "id": random_hex(16),
            "messages": inc_msgs,
            "trigger": "submit-message"
        });

        let client = build_client(180)?;
        let resp = client
            .post("https://chat.inceptionlabs.ai/api/chat")
            .header("Content-Type", "application/json")
            .header("Accept", "*/*")
            .header("Origin", "https://chat.inceptionlabs.ai")
            .header("Referer", "https://chat.inceptionlabs.ai/")
            .header("x-session-token", &token)
            .header("Cookie", format!("session={}", token))
            .json(&payload)
            .send()
            .map_err(|e| format!("Mercury 3 request failed: {}", e))?;

        if resp.status().as_u16() == 403 && attempt == 0 {
            continue;
        }
        if !resp.status().is_success() {
            return Err(format!("Mercury 3 HTTP {}", resp.status()));
        }

        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut saw_text = false;
        let mut in_think = false;
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            let trimmed = line.trim();
            if let Some(raw) = trimmed.strip_prefix("data: ") {
                if raw == "[DONE]" {
                    break;
                }
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    let etype = ev.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if etype == "reasoning-delta" || etype == "reasoning" {
                        if let Some(delta) = ev.get("delta").or_else(|| ev.get("text")).and_then(|d| d.as_str()) {
                            if !delta.is_empty() {
                                if !in_think {
                                    in_think = true;
                                    on_delta("<think>");
                                }
                                on_delta(delta);
                            }
                        }
                    } else if etype == "text-delta" {
                        if let Some(delta) = ev.get("delta").and_then(|d| d.as_str()) {
                            if !delta.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                saw_text = true;
                                on_delta(delta);
                            }
                        }
                    }
                }
            }
            line.clear();
        }
        if in_think {
            on_delta("</think>");
        }
        if saw_text {
            return Ok(());
        }
    }
    Err("Mercury 3 stream ended without text".to_string())
}

/// Parse K2Horizon `<details type="reasoning">...</details>` cumulative stream.
fn split_k2_details(content: &str) -> String {
    if let Some(idx) = content.rfind("</details>") {
        content[idx + "</details>".len()..]
            .trim_start_matches('\n')
            .to_string()
    } else if content.contains("<details") {
        String::new()
    } else {
        content.to_string()
    }
}

/// Stream from K2Horizon (`https://chat.ifm.ai/api/guest/chat/completions`, IFM/K2-Horizon-375B-A23B).
pub fn stream_k2horizon<F>(
    system: &str,
    messages: &[ChatMessage],
    effort: &str,
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let mut repaired = Vec::new();
    if !system.trim().is_empty() {
        repaired.push(json!({ "role": "system", "content": system }));
    }
    for m in messages {
        if m.role == "assistant" {
            repaired.push(json!({
                "role": "assistant",
                "content": m.content,
                "reasoning": ""
            }));
        } else {
            repaired.push(json!({
                "role": m.role,
                "content": m.content
            }));
        }
    }

    let eff = match effort {
        "low" => "low",
        "high" | "max" => "high",
        _ => "medium",
    };

    let payload = json!({
        "stream": true,
        "model": "IFM/K2-Horizon-375B-A23B",
        "messages": repaired,
        "params": {},
        "features": { "web_search": false },
        "extra_body": { "chat_template_kwargs": { "reasoning_effort": eff } }
    });

    let client = build_client(240)?;
    let resp = client
        .post("https://chat.ifm.ai/api/guest/chat/completions")
        .header("Accept", "text/event-stream, application/json")
        .header("Content-Type", "application/json")
        .header("Origin", "https://chat.ifm.ai")
        .header("Referer", "https://chat.ifm.ai/guest")
        .json(&payload)
        .send()
        .map_err(|e| format!("K2Horizon request error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("K2Horizon HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut prev_reason = String::new();
    let mut prev_answer = String::new();
    let mut in_think = false;
    let mut saw_any = false;

    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let trimmed = line.trim();
        if let Some(raw) = trimmed.strip_prefix("data:") {
            let raw = raw.trim();
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                if let Some(content) = ev.get("content").and_then(|c| c.as_str()) {
                    if let Some(d_start) = content.find("<details") {
                        if let Some(gt) = content[d_start..].find('>') {
                            let body_start = d_start + gt + 1;
                            let body_end = content.rfind("</details>").unwrap_or(content.len());
                            if body_end > body_start {
                                let reason_raw = &content[body_start..body_end];
                                let reason_clean = reason_raw
                                    .lines()
                                    .map(|l| l.strip_prefix("> ").unwrap_or(l))
                                    .collect::<Vec<_>>()
                                    .join("\n")
                                    .trim()
                                    .to_string();
                                if reason_clean.len() > prev_reason.len() && reason_clean.starts_with(&prev_reason) {
                                    if !in_think {
                                        in_think = true;
                                        on_delta("<think>");
                                    }
                                    on_delta(&reason_clean[prev_reason.len()..]);
                                    prev_reason = reason_clean;
                                }
                            }
                        }
                    }
                    let answer = split_k2_details(content);
                    if !answer.is_empty() {
                        if in_think {
                            in_think = false;
                            on_delta("</think>");
                        }
                        let delta = if answer.starts_with(&prev_answer) {
                            &answer[prev_answer.len()..]
                        } else {
                            &answer
                        };
                        if !delta.is_empty() {
                            saw_any = true;
                            on_delta(delta);
                        }
                        prev_answer = answer;
                    }
                }
                if ev.get("done").and_then(|d| d.as_bool()) == Some(true) {
                    break;
                }
            }
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }

    if saw_any {
        Ok(())
    } else {
        Err("K2Horizon stream ended without answer".to_string())
    }
}

/// Stream from Motif (`https://chat.motiftech.io/api/v1/enterprise/chat`, Motif 3 102B / 12.7B).
pub fn stream_motif<F>(
    engine: &ProviderEngine,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    effort: &str,
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let motif_model = if model.contains("12.7") || model.contains("12-7") {
        "motif-12-7b-reasoning"
    } else {
        "motif-102b"
    };
    let eff = match effort {
        "low" => "small",
        "medium" => "medium",
        _ => "high",
    };

    let mut sections = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(20000).collect();
        sections.push(format!("[Zeus Desktop Harness Instructions]\n{}", sys_safe));
    }
    if messages.len() > 1 {
        let mut hist = String::new();
        for m in &messages[..messages.len() - 1] {
            let role_lbl = if m.role == "assistant" { "Assistant" } else { "User" };
            let snippet: String = m.content.chars().take(8000).collect();
            hist.push_str(&format!("{}: {}\n\n", role_lbl, snippet));
        }
        sections.push(format!("[Conversation History]\n{}", hist.trim()));
    }
    let last_user = messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_default();
    sections.push(format!("[Current User Request]\n{}", last_user));
    let query = sections.join("\n\n");

    let payload = json!({
        "query": query,
        "conversation_id": Value::Null,
        "project_id": Value::Null,
        "template_id": Value::Null,
        "forced_skill_names": [],
        "disabled_skill_names": [],
        "language": "en",
        "timezone": "UTC",
        "mode": "chat",
        "reasoning_effort": eff,
        "model": motif_model
    });

    let client = build_client(240)?;
    let resp = client
        .post("https://chat.motiftech.io/api/v1/enterprise/chat")
        .header("Accept", "text/event-stream, application/json")
        .header("Content-Type", "application/json")
        .header("Origin", "https://chat.motiftech.io")
        .header("Referer", "https://chat.motiftech.io/chat")
        .json(&payload)
        .send()
        .map_err(|e| format!("Motif request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Motif HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut saw_text = false;
    let mut in_think = false;
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let trimmed = line.trim();
        if let Some(raw) = trimmed.strip_prefix("data:") {
            let raw = raw.trim();
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                let etype = ev.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if etype == "chat.reasoning" || etype == "chat.thinking" || etype == "chat.thought" {
                    if let Some(d) = ev.get("data").and_then(|d| d.as_str()) {
                        if !d.is_empty() {
                            if !in_think {
                                in_think = true;
                                on_delta("<think>");
                            }
                            on_delta(d);
                        }
                    }
                } else if etype == "chat.text" {
                    if let Some(d) = ev.get("data").and_then(|d| d.as_str()) {
                        if !d.is_empty() {
                            if in_think {
                                in_think = false;
                                on_delta("</think>");
                            }
                            saw_text = true;
                            on_delta(d);
                        }
                    }
                } else if etype == "shared.data.conversation_id" {
                    if let Some(cid) = ev.get("data").and_then(|d| d.as_str()) {
                        if let Ok(mut guard) = engine.state.lock() {
                            guard.motif_conversation_id = Some(cid.to_string());
                        }
                    }
                } else if etype == "shared.sign" {
                    break;
                }
            }
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }

    if saw_text {
        Ok(())
    } else {
        Err("Motif stream ended without text".to_string())
    }
}

fn upload_deepai_attachment(client: &Client, att: &AttachmentPayload) -> Option<String> {
    let (mime_from_url, bytes) = decode_data_url(&att.data_url)?;
    if bytes.is_empty() {
        return None;
    }
    let mime = if !att.mime.trim().is_empty() {
        att.mime.clone()
    } else {
        mime_from_url
    };
    let filename = if att.name.trim().is_empty() {
        "upload.png".to_string()
    } else {
        att.name.clone()
    };
    let part = reqwest::blocking::multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(&mime)
        .ok()?;
    let form = reqwest::blocking::multipart::Form::new().part("file", part);
    let api_key = generate_deepai_island_key(CHROME_UA);
    let resp = client
        .post("https://api.deepai.org/chat_attachments/upload")
        .header("api-key", &api_key)
        .header("Origin", "https://deepai.org")
        .header("Referer", "https://deepai.org/chat/")
        .multipart(form)
        .send()
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let data: Value = resp.json().ok()?;
    if data.get("success").and_then(|v| v.as_bool()) == Some(true) {
        data.get("attachment")
            .and_then(|a| a.get("uuid"))
            .and_then(|u| u.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    } else {
        None
    }
}

/// Stream from DeepAI (`https://api.deepai.org/hacking_is_a_serious_crime`) using IslandKey rotation and `/chat_attachments/upload`.
pub fn stream_deepai<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let has_attachments = messages.iter().any(|m| !m.attachments.is_empty());
    let effective_model = match model {
        "qwen4-max" | "qwen3-30b-a3b" | "qwen3.8-max" | "qwen3.8-flash" => {
            if has_attachments { "gpt-6-luna" } else { "qwen3.8-flash" }
        }
        "claude-haiku-5-5" | "gemini-2.5-flash-lite" => "claude-haiku-5-5",
        "deepseek-v4.1-flash" | "deepseek-v3.2" => {
            if has_attachments { "claude-haiku-5-5" } else { "deepseek-v4.1-flash" }
        }
        "gpt-6-luna" | "gpt-4.1-nano" | "gpt-5-nano" | "gpt-4o-mini" => "gpt-6-luna",
        "glm-5.3-flash" => "glm-5.3-flash",
        "gemma-4" => "gemma-4",
        "llama-3.3-70b-instruct" => "llama-3.3-70b-instruct",
        "llama-3.1-8b-instant" => "llama-3.1-8b-instant",
        _ => if has_attachments { "gpt-6-luna" } else { "standard" },
    };

    let client = build_client(180)?;
    let mut attachment_uuids = Vec::new();
    for m in messages {
        for att in &m.attachments {
            if !att.data_url.trim().is_empty() {
                if let Some(uuid) = upload_deepai_attachment(&client, att) {
                    if !attachment_uuids.contains(&uuid) {
                        attachment_uuids.push(uuid);
                    }
                }
            }
        }
    }

    let mut history = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(20000).collect();
        history.push(json!({
            "role": "user",
            "content": format!("[Zeus Desktop Harness & Design System Specification]\n{}", sys_safe)
        }));
        history.push(json!({
            "role": "assistant",
            "content": "Understood. I am Zeus running inside the ZeusDesigns desktop harness with direct read/write access to the user's multi-artboard canvas. I will inspect <canvas_state> and <current_artboard> directly and emit complete <artboard> or <zeus_tool> blocks to create or revise screens in place."
        }));
    }
    for m in messages {
        let role = if m.role == "system" { "user" } else { m.role.as_str() };
        history.push(json!({
            "role": role,
            "content": m.content
        }));
    }

    let api_key = generate_deepai_island_key(CHROME_UA);
    let _legacy_fallback_key = generate_deepai_tryit_key(CHROME_UA);
    let mut form = reqwest::blocking::multipart::Form::new()
        .text("chatHistory", serde_json::to_string(&history).unwrap_or_default())
        .text("model", effective_model.to_string())
        .text("session_uuid", uuid_v4())
        .text("sensitivity_request_id", uuid_v4())
        .text("tool_activity_support", "1")
        .text("thinking_image_tool_support", "1")
        .text("hacker_is_stinky", "very_stinky");
    if !attachment_uuids.is_empty() {
        form = form.text(
            "attachment_uuids",
            serde_json::to_string(&attachment_uuids).unwrap_or_default(),
        );
    }

    let mut resp = client
        .post("https://api.deepai.org/hacking_is_a_serious_crime")
        .header("api-key", &api_key)
        .header("Origin", "https://deepai.org")
        .header("Referer", "https://deepai.org/chat/")
        .multipart(form)
        .send()
        .map_err(|e| format!("DeepAI request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("DeepAI HTTP {}", resp.status()));
    }

    let mut buf = [0u8; 2048];
    let mut saw_text = false;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]);
                if let Some(sep) = chunk.find('\x1c') {
                    let before = &chunk[..sep];
                    if !before.is_empty() {
                        saw_text = true;
                        on_delta(before);
                    }
                    break;
                } else if !chunk.is_empty() {
                    saw_text = true;
                    on_delta(&chunk);
                }
            }
            Err(_) => break,
        }
    }

    if saw_text {
        Ok(())
    } else {
        Err("DeepAI stream returned empty output".to_string())
    }
}

const QWEN_APP_BASE: &str = "https://chat.qwen.ai/api/v2";
const QWEN_MAIL_BASE: &str = "https://api.0mail.tech/v1";
const QWEN_APP_UA: &str = "Dalvik/2.1.0 (Linux; U; Android 15; 25028RN03A Build/AP3A.240905.015.A2) AliApp(QWENCHAT/2.5.1) AppType/Release AplusBridgeLite,Dalvik/2.1.0 (Linux; U; Android 15; 25028RN03A Build/AP3A.240905.015.A2)";
const QWEN_APP_WAF: &str = "Z9Tr56YmQpXcO2K_d_3nAbJvRqMLFW8HTNjvRguWHEowM1xY";

fn qwen_pool_file() -> std::path::PathBuf {
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join(".zeusdesigns");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("qwen_pool.json")
}

fn extract_activate_link(body: &str) -> Option<String> {
    let idx = body.find("auths/activate")?;
    let before = &body[..idx];
    let http_start = before.rfind("http")?;
    let rest = &body[http_start..];
    let end = rest
        .find(|c: char| matches!(c, '"' | '\'' | '<' | '>' | ' ' | '\r' | '\n'))
        .unwrap_or(rest.len());
    Some(rest[..end].replace("&amp;", "&"))
}

fn provision_qwen_account() -> Result<QwenAppAccount, String> {
    let client = build_client(25)?;
    let sess = uuid_v4();
    let device = format!("ai{}", random_hex(32));

    let dom_resp = client
        .get(format!("{}/domains", QWEN_MAIL_BASE))
        .header("X-Session-Id", &sess)
        .send()
        .map_err(|e| format!("0mail domains failed: {}", e))?;
    let doms: Value = dom_resp.json().map_err(|e| e.to_string())?;
    let domain = doms
        .as_array()
        .and_then(|arr| {
            arr.iter().find_map(|d| {
                let avail = d.get("available").and_then(|v| v.as_bool()).unwrap_or(false);
                let prem = d.get("premium").and_then(|v| v.as_bool()).unwrap_or(false);
                let name = d.get("domain").and_then(|v| v.as_str()).unwrap_or("");
                if avail && !prem && !name.is_empty() && name != "cfdevelopment.online" {
                    Some(name.to_string())
                } else {
                    None
                }
            })
        })
        .ok_or_else(|| "No available 0mail domain".to_string())?;

    let inbox_resp = client
        .post(format!("{}/inboxes", QWEN_MAIL_BASE))
        .header("X-Session-Id", &sess)
        .json(&json!({ "domain": domain }))
        .send()
        .map_err(|e| format!("0mail inbox failed: {}", e))?;
    let inbox: Value = inbox_resp.json().map_err(|e| e.to_string())?;
    let email = inbox
        .get("address")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "0mail missing address".to_string())?
        .to_string();
    let inbox_id = inbox
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "0mail missing id".to_string())?
        .to_string();

    let password = format!("Aa1!{}", random_hex(14));
    let pw_hash = sha256_hex(password.as_bytes());
    let short_name = format!("Neb {}", &email[..email.len().min(5)]);

    let signup_resp = client
        .post(format!("{}/auths/signup", QWEN_APP_BASE))
        .header("User-Agent", QWEN_APP_UA)
        .header("Accept", "application/json")
        .header("X-Platform", "android")
        .header("source", "app")
        .header("Accept-Language", "en-US")
        .header("Cache-Control", "no-store")
        .header("app_waf", QWEN_APP_WAF)
        .header("x-request-id", uuid_v4())
        .header("x-device-id", &device)
        .json(&json!({
            "email": email,
            "password": pw_hash,
            "name": short_name
        }))
        .send()
        .map_err(|e| format!("Qwen signup failed: {}", e))?;
    let signup_json: Value = signup_resp.json().unwrap_or_default();
    if signup_json.get("success").and_then(|v| v.as_bool()) != Some(true) {
        return Err("Qwen signup rejected".to_string());
    }

    let mut activate_link = None;
    for _ in 0..18 {
        std::thread::sleep(Duration::from_millis(1200));
        if let Ok(r) = client
            .get(format!("{}/inboxes/{}/messages", QWEN_MAIL_BASE, inbox_id))
            .header("X-Session-Id", &sess)
            .send()
        {
            if let Ok(msgs) = r.json::<Value>() {
                if let Some(arr) = msgs.as_array() {
                    for m in arr {
                        let body = m.get("body").and_then(|v| v.as_str()).unwrap_or("");
                        if let Some(l) = extract_activate_link(body) {
                            activate_link = Some(l);
                            break;
                        }
                    }
                }
            }
        }
        if activate_link.is_some() {
            break;
        }
    }

    let link = activate_link.ok_or_else(|| "Qwen activation email timeout".to_string())?;
    if let Ok(no_redir) = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
    {
        let _ = no_redir
            .get(&link)
            .header("User-Agent", QWEN_APP_UA)
            .header("X-Platform", "android")
            .header("source", "app")
            .header("app_waf", QWEN_APP_WAF)
            .header("x-device-id", &device)
            .send();
    }

    let signin_resp = client
        .post(format!("{}/auths/signin", QWEN_APP_BASE))
        .header("User-Agent", QWEN_APP_UA)
        .header("Accept", "application/json")
        .header("X-Platform", "android")
        .header("source", "app")
        .header("app_waf", QWEN_APP_WAF)
        .header("x-request-id", uuid_v4())
        .header("x-device-id", &device)
        .json(&json!({
            "email": email,
            "password": pw_hash
        }))
        .send()
        .map_err(|e| format!("Qwen signin failed: {}", e))?;
    let signin_json: Value = signin_resp.json().map_err(|e| e.to_string())?;
    let token = signin_json
        .get("data")
        .and_then(|d| d.get("token"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();
    if token.is_empty() {
        return Err("Qwen signin missing token".to_string());
    }

    Ok(QwenAppAccount {
        email,
        password,
        device,
        token,
        created: now_secs(),
        cool_until: 0,
    })
}

fn acquire_qwen_account(engine: &ProviderEngine) -> Result<QwenAppAccount, String> {
    let now = now_secs();
    if let Ok(mut guard) = engine.state.lock() {
        if guard.qwen_accounts.is_empty() {
            let path = qwen_pool_file();
            if let Ok(raw) = std::fs::read_to_string(&path) {
                if let Ok(loaded) = serde_json::from_str::<Vec<QwenAppAccount>>(&raw) {
                    guard.qwen_accounts = loaded;
                }
            }
        }
        if let Some(acct) = guard
            .qwen_accounts
            .iter()
            .find(|a| !a.token.is_empty() && a.cool_until <= now)
            .cloned()
        {
            return Ok(acct);
        }
        if guard.qwen_provision_failed_until > now {
            return Err("Qwen provisioning temporarily in cooldown".to_string());
        }
    }

    let fresh = match provision_qwen_account() {
        Ok(a) => a,
        Err(e) => {
            if let Ok(mut guard) = engine.state.lock() {
                guard.qwen_provision_failed_until = now_secs() + 300;
            }
            return Err(e);
        }
    };
    if let Ok(mut guard) = engine.state.lock() {
        guard.qwen_accounts.push(fresh.clone());
        if guard.qwen_accounts.len() > 8 {
            let drain = guard.qwen_accounts.len() - 8;
            guard.qwen_accounts.drain(0..drain);
        }
        if let Ok(raw) = serde_json::to_string_pretty(&guard.qwen_accounts) {
            let _ = std::fs::write(qwen_pool_file(), raw);
        }
    }
    Ok(fresh)
}

pub fn cool_qwen_account(engine: &ProviderEngine, email: &str, cooldown_secs: u64) {
    let until = now_secs() + cooldown_secs;
    if let Ok(mut guard) = engine.state.lock() {
        for acct in &mut guard.qwen_accounts {
            if acct.email == email {
                acct.cool_until = until;
            }
        }
        if let Ok(raw) = serde_json::to_string_pretty(&guard.qwen_accounts) {
            let _ = std::fs::write(qwen_pool_file(), raw);
        }
    }
}

fn upload_qwen_attachment(
    client: &Client,
    acct: &QwenAppAccount,
    att: &AttachmentPayload,
) -> Option<Value> {
    let (mime_from_url, bytes) = decode_data_url(&att.data_url)?;
    if bytes.is_empty() {
        return None;
    }
    let mime = if !att.mime.trim().is_empty() {
        att.mime.clone()
    } else {
        mime_from_url
    };
    let filename = if att.name.trim().is_empty() {
        "image.png".to_string()
    } else {
        att.name.clone()
    };
    let is_image = mime.starts_with("image/");
    let filetype_short = if is_image { "image" } else { "file" };
    let file_class = if is_image { "vision" } else { "document" };

    let sts_resp = client
        .post(format!("{}/files/getstsToken", QWEN_APP_BASE))
        .header("User-Agent", QWEN_APP_UA)
        .header("Accept", "application/json")
        .header("X-Platform", "android")
        .header("source", "app")
        .header("app_waf", QWEN_APP_WAF)
        .header("x-request-id", uuid_v4())
        .header("x-device-id", &acct.device)
        .header("Authorization", format!("Bearer {}", acct.token))
        .json(&json!({
            "filename": filename,
            "filesize": bytes.len(),
            "filetype": filetype_short
        }))
        .send()
        .ok()?;
    if !sts_resp.status().is_success() {
        return None;
    }
    let sts_json: Value = sts_resp.json().ok()?;
    if sts_json.get("success").and_then(|v| v.as_bool()) != Some(true) {
        return None;
    }
    let data = sts_json.get("data")?;
    let file_url = data.get("file_url").and_then(|v| v.as_str())?;
    let file_id = data.get("file_id").and_then(|v| v.as_str())?;
    let bucket_name = data
        .get("bucketname")
        .and_then(|v| v.as_str())
        .unwrap_or("qwen-webui-prod");
    let file_path = data.get("file_path").and_then(|v| v.as_str())?;
    let access_key_id = data.get("access_key_id").and_then(|v| v.as_str())?;
    let access_key_secret = data.get("access_key_secret").and_then(|v| v.as_str())?;
    let security_token = data.get("security_token").and_then(|v| v.as_str())?;

    let (date_str, date_part) = iso8601_utc_compact(now_secs());
    let oss_ua = "aliyun-sdk-js/6.23.0 Chrome 132.0.0.0 on Windows 10 64-bit";
    let canonical_headers = format!(
        "content-type:{}\nx-oss-content-sha256:UNSIGNED-PAYLOAD\nx-oss-date:{}\nx-oss-security-token:{}\nx-oss-user-agent:{}\n",
        mime, date_str, security_token, oss_ua
    );
    let encoded_path = file_path
        .split('/')
        .map(url_encode)
        .collect::<Vec<_>>()
        .join("/");
    let canonical_uri = format!("/{}/{}", bucket_name, encoded_path);
    let canonical_request = format!(
        "PUT\n{}\n\n{}\n\nUNSIGNED-PAYLOAD",
        canonical_uri, canonical_headers
    );
    let date_scope = format!("{}/ap-southeast-1/oss/aliyun_v4_request", date_part);
    let string_to_sign = format!(
        "OSS4-HMAC-SHA256\n{}\n{}\n{}",
        date_str,
        date_scope,
        sha256_hex(canonical_request.as_bytes())
    );

    let k_date = hmac_sha256_bytes(
        format!("aliyun_v4{}", access_key_secret).as_bytes(),
        date_part.as_bytes(),
    );
    let k_region = hmac_sha256_bytes(&k_date, b"ap-southeast-1");
    let k_service = hmac_sha256_bytes(&k_region, b"oss");
    let k_signing = hmac_sha256_bytes(&k_service, b"aliyun_v4_request");
    let signature = hmac_sha256_hex(&k_signing, string_to_sign.as_bytes());
    let auth_header = format!(
        "OSS4-HMAC-SHA256 Credential={}/{},Signature={}",
        access_key_id, date_scope, signature
    );

    let put_url = file_url.split('?').next().unwrap_or(file_url);
    let put_resp = client
        .put(put_url)
        .header("Content-Type", &mime)
        .header("x-oss-content-sha256", "UNSIGNED-PAYLOAD")
        .header("x-oss-date", &date_str)
        .header("x-oss-security-token", security_token)
        .header("x-oss-user-agent", oss_ua)
        .header("authorization", auth_header)
        .body(bytes.clone())
        .send()
        .ok()?;
    if !put_resp.status().is_success() {
        return None;
    }

    let now_ms = now_secs() * 1000;
    Some(json!({
        "type": filetype_short,
        "file": {
            "created_at": now_ms,
            "data": {},
            "filename": filename,
            "hash": Value::Null,
            "id": file_id,
            "meta": {
                "name": filename,
                "size": bytes.len(),
                "content_type": mime
            },
            "update_at": now_ms,
            "type": filetype_short
        },
        "id": file_id,
        "url": file_url,
        "name": filename,
        "collection_name": "",
        "progress": 0,
        "status": "uploaded",
        "greenNet": "success",
        "size": bytes.len(),
        "error": "",
        "itemId": uuid_v4(),
        "file_type": mime,
        "showType": filetype_short,
        "file_class": file_class,
        "uploadTaskId": uuid_v4()
    }))
}

/// Stream from Qwen via the native Android App Gateway (`https://chat.qwen.ai/api/v2`, ported from `qwen_app.py`) with OSS multimodal upload.
pub fn stream_qwen_app<F>(
    engine: &ProviderEngine,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    effort: &str,
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let acct = acquire_qwen_account(engine)?;
    let qwen_model = match model {
        "qwen4-max" | "qwen3.8-max" | "qwen3.7-max" | "qwen3.8-omni-flash" | "qwen3.5-omni-plus" | "qwen3.7-plus" => model,
        _ => "qwen4-max",
    };
    let thinking = (effort == "high" || effort == "max")
        && !qwen_model.contains("omni");

    let mut prompt = String::new();
    if !system.trim().is_empty() {
        prompt.push_str(&format!("[System]\n{}\n\n", system));
    }
    if messages.len() > 1 {
        prompt.push_str("[Conversation so far]\n");
        for m in &messages[..messages.len() - 1] {
            let r = if m.role == "assistant" { "Assistant" } else { "User" };
            prompt.push_str(&format!("{}: {}\n", r, m.content));
        }
        prompt.push('\n');
    }
    if let Some(last) = messages.last() {
        prompt.push_str(&format!("[User]\n{}", last.content));
    }

    let client = build_client(120)?;
    let mut uploaded_files = Vec::new();
    for m in messages {
        for att in &m.attachments {
            if !att.data_url.trim().is_empty() {
                if let Some(file_obj) = upload_qwen_attachment(&client, &acct, att) {
                    uploaded_files.push(file_obj);
                }
            }
        }
    }

    let now_ms = now_secs() * 1000;
    let new_resp = client
        .post(format!("{}/chats/new", QWEN_APP_BASE))
        .header("User-Agent", QWEN_APP_UA)
        .header("Accept", "application/json")
        .header("X-Platform", "android")
        .header("source", "app")
        .header("app_waf", QWEN_APP_WAF)
        .header("x-request-id", uuid_v4())
        .header("x-device-id", &acct.device)
        .header("Authorization", format!("Bearer {}", acct.token))
        .json(&json!({
            "title": "New Chat",
            "models": [qwen_model],
            "chat_mode": "normal",
            "chat_type": "t2t",
            "timestamp": now_ms,
            "project_id": ""
        }))
        .send()
        .map_err(|e| format!("Qwen chats/new failed: {}", e))?;

    let new_json: Value = new_resp.json().map_err(|e| e.to_string())?;
    let chat_id = new_json
        .get("data")
        .and_then(|d| d.get("id"))
        .and_then(|i| i.as_str())
        .ok_or_else(|| "Qwen chats/new missing id".to_string())?
        .to_string();

    let _ = thinking;
    let mut user_msg = json!({
        "fid": uuid_v4(),
        "parentId": Value::Null,
        "childrenIds": [],
        "chat_type": "t2t",
        "content": prompt,
        "role": "user",
        "timestamp": now_ms,
        "sub_chat_type": "t2t",
        "models": [qwen_model],
        "user_action": "chat",
        "files": uploaded_files,
        "safety": { "enabled": false },
        "extra": {
            "meta": { "subChatType": "t2t" },
            "disable_recitation_policy": true,
            "skip_safety_check": true
        },
        "feature_config": {
            "output_schema": "phase",
            "thinking_enabled": true,
            "thinking_mode": "Auto",
            "auto_thinking": true,
            "research_mode": "normal",
            "auto_search": false
        }
    });
    let _ = &mut user_msg;

    let payload = json!({
        "stream": true,
        "incremental_output": true,
        "chat_id": chat_id,
        "chat_mode": "normal",
        "model": qwen_model,
        "parent_id": Value::Null,
        "version": "2.1",
        "timestamp": now_ms,
        "share_id": "",
        "origin_branch_message_id": "",
        "messages": [user_msg]
    });

    let comp_resp = client
        .post(format!("{}/chat/completions?chat_id={}", QWEN_APP_BASE, chat_id))
        .header("User-Agent", QWEN_APP_UA)
        .header("Accept", "*/*,text/event-stream")
        .header("Content-Type", "application/json; charset=UTF-8")
        .header("X-Platform", "android")
        .header("source", "app")
        .header("app_waf", QWEN_APP_WAF)
        .header("x-request-id", uuid_v4())
        .header("x-device-id", &acct.device)
        .header("Authorization", format!("Bearer {}", acct.token))
        .json(&payload)
        .send()
        .map_err(|e| format!("Qwen completions failed: {}", e))?;

    if !comp_resp.status().is_success() {
        return Err(format!("Qwen HTTP {}", comp_resp.status()));
    }

    let mut reader = BufReader::new(comp_resp);
    let mut line = String::new();
    let mut saw_text = false;
    let mut in_think = false;
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        if let Some(raw) = line.trim().strip_prefix("data:") {
            let raw = raw.trim();
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                if let Some(delta) = ev
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c0| c0.get("delta"))
                {
                    let phase = delta.get("phase").and_then(|p| p.as_str()).unwrap_or("answer");
                    let content = delta.get("content").and_then(|c| c.as_str()).unwrap_or("");
                    if (phase == "think" || phase == "thinking") && !content.is_empty() {
                        if !in_think {
                            in_think = true;
                            on_delta("<think>");
                        }
                        on_delta(content);
                    } else if phase == "answer" && !content.is_empty() {
                        if in_think {
                            in_think = false;
                            on_delta("</think>");
                        }
                        saw_text = true;
                        on_delta(content);
                    }
                }
            }
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }

    let _ = client
        .delete(format!("{}/chats/{}", QWEN_APP_BASE, chat_id))
        .header("User-Agent", QWEN_APP_UA)
        .header("X-Platform", "android")
        .header("source", "app")
        .header("app_waf", QWEN_APP_WAF)
        .header("x-device-id", &acct.device)
        .header("Authorization", format!("Bearer {}", acct.token))
        .send();

    if saw_text {
        Ok(())
    } else {
        Err("Qwen app stream ended without answer".to_string())
    }
}

/// Stream from LongCat (`https://longcat.chat/api/v1/chat-completion-oversea-V2`, LongCat 2.5 1.6T MoE).
/// Ported from `/tmp/NEB/backend_python/api/longcat_proxy.py` with full `agentId` + `events` schema.
pub fn stream_longcat<F>(
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let client = build_client(180)?;
    let _ = client
        .get("https://longcat.chat/t")
        .header("Accept", "text/html")
        .send();

    let last_user = messages
        .last()
        .map(|m| m.content.as_str())
        .unwrap_or("");
    let user_len = last_user.chars().count();
    let max_sys = 26000usize.saturating_sub(user_len).max(6000);
    let sys_prefix: String = system.chars().take(max_sys).collect();
    let content = if sys_prefix.trim().is_empty() {
        last_user.chars().take(26000).collect::<String>()
    } else {
        format!("{}\n\n{}", sys_prefix, last_user)
    };

    let mut lc_msgs = Vec::new();
    let history_len = messages.len().saturating_sub(1);
    for m in messages.iter().take(history_len) {
        if m.content.trim().is_empty() {
            continue;
        }
        let msg_id = 10_000_000 + (pseudo_random_u64() % 89_000_000);
        let ev_type = if m.role == "assistant" { "content" } else { "userMsg" };
        let role = if m.role == "assistant" { "assistant" } else { "user" };
        lc_msgs.push(json!({
            "role": role,
            "events": [{
                "type": ev_type,
                "content": m.content.chars().take(16000).collect::<String>(),
                "status": "FINISHED"
            }],
            "chatStatus": "FINISHED",
            "messageId": msg_id,
            "idType": "custom"
        }));
    }
    lc_msgs.push(json!({
        "role": "user",
        "events": [{
            "type": "userMsg",
            "content": content,
            "status": "FINISHED"
        }],
        "chatStatus": "FINISHED",
        "messageId": 10_000_000 + (pseudo_random_u64() % 89_000_000),
        "idType": "custom"
    }));
    lc_msgs.push(json!({
        "role": "assistant",
        "events": [],
        "chatStatus": "LOADING",
        "messageId": 10_000_000 + (pseudo_random_u64() % 89_000_000),
        "idType": "custom"
    }));

    let payload = json!({
        "content": content,
        "agentId": "1",
        "messages": lc_msgs,
        "reasonEnabled": 1,
        "searchEnabled": 0,
        "regenerate": 0
    });

    let resp = client
        .post("https://longcat.chat/api/v1/chat-completion-oversea-V2")
        .header("Accept", "text/event-stream,application/json")
        .header("Content-Type", "application/json")
        .header("x-requested-with", "XMLHttpRequest")
        .header("X-Client-Language", "en")
        .header("m-appkey", "fe_com.sankuai.friday.fe.longcat")
        .header("Origin", "https://longcat.chat")
        .header("Referer", "https://longcat.chat/t")
        .json(&payload)
        .send()
        .map_err(|e| format!("LongCat request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("LongCat HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut saw_text = false;
    let mut in_think = false;
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let trimmed = line.trim();
        if let Some(raw) = trimmed.strip_prefix("data:") {
            let raw = raw.trim();
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                if let Some(event_obj) = ev.get("event") {
                    let etype = event_obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if etype == "reason" || etype == "think" || etype == "thinking" {
                        if let Some(c) = event_obj.get("content").and_then(|c| c.as_str()) {
                            if !c.is_empty() {
                                if !in_think {
                                    in_think = true;
                                    on_delta("<think>");
                                }
                                on_delta(c);
                            }
                        }
                    } else if etype == "content" {
                        if let Some(c) = event_obj.get("content").and_then(|c| c.as_str()) {
                            if !c.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                saw_text = true;
                                on_delta(c);
                            }
                        }
                    } else if etype == "finish" {
                        break;
                    }
                }
            }
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }

    if saw_text {
        Ok(())
    } else {
        Err("LongCat stream ended without text".to_string())
    }
}

/// Extract regex-like pattern `"KEY":"VALUE"` from Gemini Web `/app` HTML without regex crate dependency.
fn extract_quoted_value(haystack: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\":\"", key);
    let start = haystack.find(&pat)? + pat.len();
    let rest = &haystack[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Stream from Gemini Web (`https://gemini.google.com/app` anonymous Flash-Lite StreamGenerate).
pub fn stream_geminiweb<F>(
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let client = build_client(180)?;
    let warm_resp = client
        .get("https://gemini.google.com/app")
        .header("Accept", "text/html")
        .send()
        .map_err(|e| format!("GeminiWeb warm failed: {}", e))?;

    if !warm_resp.status().is_success() {
        return Err(format!("GeminiWeb warm HTTP {}", warm_resp.status()));
    }
    let html = warm_resp.text().unwrap_or_default();
    let fsid = extract_quoted_value(&html, "FdrFJe")
        .ok_or_else(|| "GeminiWeb FdrFJe session id not found".to_string())?;
    let bl = extract_quoted_value(&html, "cfb2h")
        .unwrap_or_else(|| "boq_gemini-web-uiserver_20261117.01_p0".to_string());
    let snlm0e = extract_quoted_value(&html, "SNlM0e").unwrap_or_default();

    let mut prompt = String::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(16000).collect();
        prompt.push_str(&format!("{}\n\n", sys_safe));
    }
    if messages.len() > 1 {
        prompt.push_str("Previous conversation:\n");
        for m in &messages[..messages.len() - 1] {
            prompt.push_str(&format!("{}: {}\n", m.role, m.content));
        }
        prompt.push('\n');
    }
    if let Some(last) = messages.last() {
        prompt.push_str(&last.content);
    }

    let inner = json!([
        [prompt, 0, Value::Null, Value::Null, Value::Null, Value::Null, 0],
        ["en-US"],
        ["", "", "", Value::Null, Value::Null, Value::Null, Value::Null, Value::Null, Value::Null, ""],
        "",
        random_hex(32),
        Value::Null,
        [0],
        1,
        Value::Null,
        Value::Null,
        1,
        0
    ]);
    let freq = json!([Value::Null, inner.to_string()]).to_string();
    let reqid = 100_000 + (pseudo_random_u64() % 800_000);
    let mut url = format!(
        "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl={}&f.sid={}&hl=en-US&_reqid={}&rt=c",
        url_encode(&bl),
        url_encode(&fsid),
        reqid
    );
    if !snlm0e.is_empty() {
        url.push_str(&format!("&at={}", url_encode(&snlm0e)));
    }

    let body = format!("f.req={}&", url_encode(&freq));
    let resp = client
        .post(&url)
        .header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
        .header("Origin", "https://gemini.google.com")
        .header("Referer", "https://gemini.google.com/")
        .header("x-same-domain", "1")
        .body(body)
        .send()
        .map_err(|e| format!("GeminiWeb StreamGenerate failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GeminiWeb HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut prev_text = String::new();
    let mut saw_any = false;

    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if let Ok(arr) = serde_json::from_str::<Value>(trimmed) {
                if let Some(entries) = arr.as_array() {
                    for entry in entries {
                        if entry.get(0).and_then(|v| v.as_str()) == Some("wrb.fr") {
                            if let Some(inner_str) = entry.get(2).and_then(|v| v.as_str()) {
                                if let Ok(inner_val) = serde_json::from_str::<Value>(inner_str) {
                                    if let Some(parts) = inner_val.get(4).and_then(|v| v.as_array()) {
                                        for part in parts {
                                            if let Some(rc) = part.get(0).and_then(|v| v.as_str()) {
                                                if rc.starts_with("rc_") {
                                                    if let Some(texts) = part.get(1).and_then(|v| v.as_array()) {
                                                        if let Some(snap) = texts.first().and_then(|t| t.as_str()) {
                                                            let delta = if snap.starts_with(&prev_text) {
                                                                &snap[prev_text.len()..]
                                                            } else if prev_text.is_empty() {
                                                                snap
                                                            } else {
                                                                ""
                                                            };
                                                            if !delta.is_empty() {
                                                                saw_any = true;
                                                                on_delta(delta);
                                                            }
                                                            if snap.len() > prev_text.len() {
                                                                prev_text = snap.to_string();
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        line.clear();
    }

    if saw_any {
        Ok(())
    } else {
        Err("GeminiWeb stream ended without content".to_string())
    }
}

/// Stream from Kilo Gateway (`https://api.kilo.ai/api/gateway/chat/completions`, free frontier & multimodal models).
pub fn stream_kilo<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let has_images = messages.iter().any(|m| {
        m.attachments
            .iter()
            .any(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
    });
    let eff_model = if model.is_empty() {
        "nvidia/nemotron-3.5-super-vl:free"
    } else if has_images
        && !matches!(
            model,
            "nvidia/nemotron-3.5-super-vl:free"
                | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
                | "inclusionai/ling-3.2-flash:free"
                | "particle-ai/particle-1:free"
                | "dots-studio/dots-3-note-preview:free"
                | "openrouter/free"
        )
    {
        "nvidia/nemotron-3.5-super-vl:free"
    } else {
        model
    };

    let mut kilo_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(24000).collect();
        kilo_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    for m in messages {
        let imgs: Vec<&AttachmentPayload> = m
            .attachments
            .iter()
            .filter(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
            .collect();
        if imgs.is_empty() {
            kilo_msgs.push(json!({ "role": m.role, "content": m.content }));
        } else {
            let mut parts = vec![json!({ "type": "text", "text": m.content })];
            for img in imgs {
                parts.push(json!({
                    "type": "image_url",
                    "image_url": { "url": img.data_url }
                }));
            }
            kilo_msgs.push(json!({ "role": m.role, "content": parts }));
        }
    }

    let payload = json!({
        "model": eff_model,
        "stream": true,
        "max_tokens": 16384,
        "messages": kilo_msgs
    });

    let client = build_client(180)?;
    let resp = client
        .post("https://api.kilo.ai/api/gateway/chat/completions")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .json(&payload)
        .send()
        .map_err(|e| format!("Kilo Gateway request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Kilo Gateway HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut in_think = false;
    let mut saw_text = false;
    let mut fallback_reason = String::new();

    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(raw) = line.trim().strip_prefix("data:") {
            let raw = raw.trim();
            if raw == "[DONE]" {
                break;
            }
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                if let Some(choice) = ev.get("choices").and_then(|c| c.get(0)) {
                    let delta = choice.get("delta").or_else(|| choice.get("message"));
                    if let Some(d) = delta {
                        let r_text = d
                            .get("reasoning_content")
                            .or_else(|| d.get("reasoning"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        if !r_text.is_empty() {
                            if !in_think {
                                in_think = true;
                                on_delta("<think>");
                            }
                            on_delta(r_text);
                            fallback_reason.push_str(r_text);
                        }
                        if let Some(text) = d.get("content").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                saw_text = true;
                                on_delta(text);
                            }
                        }
                    }
                }
            }
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }
    if !saw_text && !fallback_reason.trim().is_empty() {
        on_delta(fallback_reason.trim());
        saw_text = true;
    }
    if saw_text {
        Ok(())
    } else {
        Err("Kilo Gateway stream ended without output".to_string())
    }
}

fn extract_ptero_nonce(html: &str) -> Option<String> {
    for pat in ["var nonce = '", "var nonce = \"", "data-referral-nonce=\"", "data-referral-nonce='"] {
        if let Some(idx) = html.find(pat) {
            let rest = &html[idx + pat.len()..];
            let end = rest.find(|c: char| !c.is_ascii_hexdigit()).unwrap_or(0);
            if end >= 8 {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

/// Stream from Ptero Frontier (`https://ptero.pro/wp-json/mlp/v1/chat-stream` SSE & `/chat` fallback, GPT-6.1 Terra vision + GLM 5.3 + MiMo V2.6).
pub fn stream_ptero<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let mut attachments = Vec::new();
    for m in messages {
        for att in &m.attachments {
            if !att.data_url.trim().is_empty() {
                let approx_size = decode_data_url(&att.data_url)
                    .map(|(_, b)| b.len())
                    .unwrap_or_else(|| att.data_url.len() * 3 / 4);
                attachments.push(json!({
                    "name": if att.name.is_empty() { "image.png" } else { att.name.as_str() },
                    "type": if att.mime.is_empty() { "image/png" } else { att.mime.as_str() },
                    "size": approx_size,
                    "data": att.data_url,
                    "dataUrl": att.data_url,
                    "url": att.data_url
                }));
            }
        }
    }

    // On Ptero, gpt-6.1-terra:voyage and agnes-2.5-flash:agnes are the free models in freeVisionModelIds
    let eff_model = if !attachments.is_empty() {
        match model {
            "gpt-6.1-terra:voyage" | "agnes-2.5-flash:agnes" => model,
            _ => "gpt-6.1-terra:voyage",
        }
    } else {
        match model {
            "gpt-6.1-terra:voyage"
            | "agnes-2.5-flash:agnes"
            | "agnes-3.0-flash:agnes"
            | "glm-5.3-flash"
            | "mimo-v2.6-flash:tokenharbor"
            | "qwen3.7-flash:minirouter"
            | "kimi-k3:apinex" => model,
            _ => "gpt-6.1-terra:voyage",
        }
    };

    let client = build_client(180)?;
    let warm_html = client
        .get("https://ptero.pro/")
        .header("Accept", "text/html")
        .send()
        .and_then(|r| r.text())
        .unwrap_or_default();
    let nonce = extract_ptero_nonce(&warm_html).unwrap_or_default();

    let mut history = Vec::new();
    let hist_len = messages.len().saturating_sub(1);
    for m in messages.iter().take(hist_len) {
        if m.content.trim().is_empty() {
            continue;
        }
        let role = if m.role == "assistant" { "assistant" } else { "user" };
        history.push(json!({
            "role": role,
            "text": m.content.chars().take(12000).collect::<String>(),
            "attachments": []
        }));
    }

    let last_user = messages
        .last()
        .map(|m| m.content.as_str())
        .unwrap_or("");
    let message_text = if system.trim().is_empty() {
        last_user.to_string()
    } else {
        let sys_safe: String = system.chars().take(18000).collect();
        format!("[System instructions: {}]\n\n{}", sys_safe, last_user)
    };

    let payload = json!({
        "message": message_text,
        "model": eff_model,
        "conversation_id": uuid_v4(),
        "history": history,
        "attachments": attachments,
        "github_repo": "",
        "lang": "en",
        "mode": "smart"
    });

    let guest_token = random_hex(32);
    let mut stream_req = client
        .post("https://ptero.pro/wp-json/mlp/v1/chat-stream")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .header("Origin", "https://ptero.pro")
        .header("Referer", "https://ptero.pro/")
        .header("X-MLP-Guest-Token", &guest_token)
        .header("X-MLP-Guest-Username", "nebian");
    if !nonce.is_empty() {
        stream_req = stream_req.header("X-WP-Nonce", &nonce);
    }

    if let Ok(resp) = stream_req.json(&payload).send() {
        if resp.status().is_success() {
            let mut reader = BufReader::new(resp);
            let mut line = String::new();
            let mut in_think = false;
            let mut saw_text = false;
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                if cancel.load(Ordering::Relaxed) {
                    return Ok(());
                }
                let trimmed = line.trim();
                if let Some(raw) = trimmed.strip_prefix("data:") {
                    let raw = raw.trim();
                    if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                        if let Some(act) = ev.get("activity") {
                            if act.get("type").and_then(|t| t.as_str()) == Some("thinking") {
                                if let Some(lbl) = act.get("label").and_then(|l| l.as_str()) {
                                    if !lbl.is_empty() {
                                        if !in_think {
                                            in_think = true;
                                            on_delta("<think>");
                                        }
                                        on_delta(lbl);
                                        on_delta("\n");
                                    }
                                }
                            }
                        }
                        if let Some(th) = ev.get("thinking_token").and_then(|t| t.as_str()) {
                            if !th.is_empty() {
                                if !in_think {
                                    in_think = true;
                                    on_delta("<think>");
                                }
                                on_delta(th);
                            }
                        }
                        if let Some(tok) = ev.get("token").and_then(|t| t.as_str()) {
                            if !tok.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                saw_text = true;
                                on_delta(tok);
                            }
                        }
                        if ev.get("done").and_then(|d| d.as_bool()) == Some(true) {
                            break;
                        }
                    }
                }
                line.clear();
            }
            if in_think {
                on_delta("</think>");
            }
            if saw_text {
                return Ok(());
            }
        }
    }

    // Fallback to synchronous /wp-json/mlp/v1/chat if SSE stream was empty
    let mut req = client
        .post("https://ptero.pro/wp-json/mlp/v1/chat")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Origin", "https://ptero.pro")
        .header("Referer", "https://ptero.pro/")
        .header("X-MLP-Guest-Token", random_hex(32))
        .header("X-MLP-Guest-Username", "nebian");
    if !nonce.is_empty() {
        req = req.header("X-WP-Nonce", nonce);
    }

    let resp = req
        .json(&payload)
        .send()
        .map_err(|e| format!("Ptero request failed: {}", e))?;

    if cancel.load(Ordering::Relaxed) {
        return Ok(());
    }
    if !resp.status().is_success() {
        return Err(format!("Ptero HTTP {}", resp.status()));
    }
    let data: Value = resp.json().map_err(|e| format!("Ptero JSON error: {}", e))?;
    let reply = data
        .get("reply")
        .and_then(|r| r.as_str())
        .unwrap_or("")
        .trim();
    if reply.is_empty() {
        return Err("Ptero returned empty reply".to_string());
    }
    on_delta(reply);
    Ok(())
}

/// Stream from Unikey Anonymous (`https://www.getunikey.ai/api/anonymous/chat/completions`, Kimi K3 / K2.7 Code / Grok 4.3).
pub fn stream_unikey<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let eff_model = match model {
        "moonshotai/kimi-k3" | "moonshotai/kimi-k2.7-code" | "x-ai/grok-4.3" => model,
        _ => "moonshotai/kimi-k3",
    };

    let mut convo = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(22000).collect();
        convo.push(json!({ "role": "system", "content": sys_safe }));
    }
    for m in messages {
        if !m.content.trim().is_empty() {
            convo.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let payload = json!({
        "model": eff_model,
        "messages": convo,
        "stream": true
    });

    let client = build_client(180)?;
    let resp = client
        .post("https://www.getunikey.ai/api/anonymous/chat/completions")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("Origin", "https://www.getunikey.ai")
        .header("Referer", "https://www.getunikey.ai/anonymous-chat")
        .header("X-Anonymous-Fingerprint", format!("rnd{}", random_hex(32)))
        .json(&payload)
        .send()
        .map_err(|e| format!("Unikey request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Unikey HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut in_think = false;
    let mut saw_text = false;

    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(raw) = line.trim().strip_prefix("data:") {
            let raw = raw.trim();
            if raw == "[DONE]" {
                break;
            }
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                if let Some(choice) = ev.get("choices").and_then(|c| c.get(0)) {
                    let delta = choice.get("delta").or_else(|| choice.get("message"));
                    if let Some(d) = delta {
                        let r_text = d
                            .get("reasoning_content")
                            .or_else(|| d.get("reasoning"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        if !r_text.is_empty() {
                            if !in_think {
                                in_think = true;
                                on_delta("<think>");
                            }
                            on_delta(r_text);
                        }
                        if let Some(text) = d.get("content").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                saw_text = true;
                                on_delta(text);
                            }
                        }
                    }
                }
            }
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }
    if saw_text {
        Ok(())
    } else {
        Err("Unikey stream ended without output".to_string())
    }
}

/// Stream from LLM7 (`https://api.llm7.io/v1/chat/completions`, Codestral Latest / Gemma 3 27B / GPT-OSS 20B).
pub fn stream_llm7<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let eff_model = match model {
        "codestral-latest" | "gemma-3-27b" | "gpt-oss:20b" | "default" | "fast" => model,
        _ => "codestral-latest",
    };

    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(24000).collect();
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    for m in messages {
        if !m.content.trim().is_empty() {
            oai_msgs.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let payload = json!({
        "model": eff_model,
        "stream": true,
        "max_tokens": 8000,
        "messages": oai_msgs
    });

    let client = build_client(180)?;
    let resp = client
        .post("https://api.llm7.io/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer unused")
        .json(&payload)
        .send()
        .map_err(|e| format!("LLM7 request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("LLM7 HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut saw_text = false;
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(raw) = line.trim().strip_prefix("data:") {
            let raw = raw.trim();
            if raw == "[DONE]" {
                break;
            }
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                if let Some(choice) = ev.get("choices").and_then(|c| c.get(0)) {
                    let delta = choice.get("delta").or_else(|| choice.get("message"));
                    if let Some(text) = delta.and_then(|d| d.get("content")).and_then(|t| t.as_str()) {
                        if !text.is_empty() {
                            saw_text = true;
                            on_delta(text);
                        }
                    }
                }
            }
        }
        line.clear();
    }
    if saw_text {
        Ok(())
    } else {
        Err("LLM7 stream ended without output".to_string())
    }
}

/// Stream from Pollinations AI (`https://text.pollinations.ai/openai`, zero-key OpenAI reasoning endpoint).
pub fn stream_pollinations<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let eff_model = match model {
        "openai-fast" => "openai-fast",
        _ => "openai-fast",
    };

    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(20000).collect();
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    for m in messages {
        if !m.content.trim().is_empty() {
            oai_msgs.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let payload = json!({
        "model": eff_model,
        "stream": true,
        "messages": oai_msgs
    });

    let client = build_client(180)?;
    let resp = client
        .post("https://text.pollinations.ai/openai")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .json(&payload)
        .send()
        .map_err(|e| format!("Pollinations request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Pollinations HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut in_think = false;
    let mut saw_text = false;
    let mut raw_body = String::new();

    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let trimmed = line.trim();
        if let Some(raw) = trimmed.strip_prefix("data:") {
            let raw = raw.trim();
            if raw == "[DONE]" {
                break;
            }
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                if let Some(choice) = ev.get("choices").and_then(|c| c.get(0)) {
                    let delta = choice.get("delta").or_else(|| choice.get("message"));
                    if let Some(d) = delta {
                        let r_text = d
                            .get("reasoning_content")
                            .or_else(|| d.get("reasoning"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        if !r_text.is_empty() {
                            if !in_think {
                                in_think = true;
                                on_delta("<think>");
                            }
                            on_delta(r_text);
                        }
                        if let Some(text) = d.get("content").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                saw_text = true;
                                on_delta(text);
                            }
                        }
                    }
                }
            }
        } else if !trimmed.is_empty() {
            raw_body.push_str(trimmed);
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }
    if !saw_text && !raw_body.is_empty() {
        if let Ok(ev) = serde_json::from_str::<Value>(&raw_body) {
            if let Some(msg) = ev.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")) {
                if let Some(r_text) = msg.get("reasoning").and_then(|t| t.as_str()).filter(|s| !s.is_empty()) {
                    on_delta("<think>");
                    on_delta(r_text);
                    on_delta("</think>");
                }
                if let Some(text) = msg.get("content").and_then(|t| t.as_str()).filter(|s| !s.is_empty()) {
                    saw_text = true;
                    on_delta(text);
                }
            }
        }
    }
    if saw_text {
        Ok(())
    } else {
        Err("Pollinations stream ended without output".to_string())
    }
}

/// Stream from YQCloud (`https://api.binjie.fun/api/generateStream`, zero-auth streaming chat).
pub fn stream_yqcloud<F>(
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let mut lines = Vec::new();
    for m in messages {
        if m.content.trim().is_empty() {
            continue;
        }
        if lines.is_empty() {
            lines.push(m.content.clone());
        } else {
            let lbl = if m.role == "assistant" { "Assistant" } else { "User" };
            lines.push(format!("{}: {}", lbl, m.content));
        }
    }
    let prompt = lines.join("\n\n");
    let sys_safe: String = system.chars().take(18000).collect();

    let payload = json!({
        "prompt": prompt,
        "userId": format!("#/chat/{}", now_secs() * 1000),
        "network": false,
        "system": sys_safe,
        "withoutContext": false,
        "stream": true
    });

    let client = build_client(180)?;
    let mut resp = client
        .post("https://api.binjie.fun/api/generateStream")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .header("Origin", "https://chat9.yqcloud.top")
        .header("Referer", "https://chat9.yqcloud.top/")
        .json(&payload)
        .send()
        .map_err(|e| format!("YQCloud request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("YQCloud HTTP {}", resp.status()));
    }

    let mut buf = [0u8; 2048];
    let mut saw_text = false;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]);
                if !chunk.is_empty() {
                    saw_text = true;
                    on_delta(&chunk);
                }
            }
            Err(_) => break,
        }
    }
    if saw_text {
        Ok(())
    } else {
        Err("YQCloud stream ended without output".to_string())
    }
}

/// Stream from custom OpenAI-compatible or Anthropic endpoint (including multimodal image attachments).
pub fn stream_custom_endpoint<F>(
    custom: &CustomEndpoint,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    effort: &str,
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let client = build_client(240)?;
    let base = custom.base_url.trim_end_matches('/');

    if custom.format == "anthropic" {
        let mut anth_msgs = Vec::new();
        for m in messages {
            let imgs: Vec<&AttachmentPayload> = m
                .attachments
                .iter()
                .filter(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
                .collect();
            if imgs.is_empty() {
                anth_msgs.push(json!({
                    "role": m.role,
                    "content": m.content
                }));
            } else {
                let mut content_blocks = Vec::new();
                for img in imgs {
                    let b64_data = img
                        .data_url
                        .split_once(',')
                        .map(|(_, b)| b)
                        .unwrap_or(img.data_url.as_str());
                    content_blocks.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img.mime,
                            "data": b64_data
                        }
                    }));
                }
                content_blocks.push(json!({ "type": "text", "text": m.content }));
                anth_msgs.push(json!({
                    "role": m.role,
                    "content": content_blocks
                }));
            }
        }
        let payload = json!({
            "model": model,
            "max_tokens": 16000,
            "stream": true,
            "system": system,
            "messages": anth_msgs
        });
        let resp = client
            .post(format!("{}/v1/messages", base))
            .header("Content-Type", "application/json")
            .header("x-api-key", &custom.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&payload)
            .send()
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Anthropic HTTP {}", resp.status()));
        }
        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut in_think = false;
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            if let Some(raw) = line.trim().strip_prefix("data:") {
                let raw = raw.trim();
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    if ev.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(delta) = ev.get("delta") {
                            if let Some(th) = delta.get("thinking").and_then(|t| t.as_str()) {
                                if !th.is_empty() {
                                    if !in_think {
                                        in_think = true;
                                        on_delta("<think>");
                                    }
                                    on_delta(th);
                                }
                            } else if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                if !text.is_empty() {
                                    if in_think {
                                        in_think = false;
                                        on_delta("</think>");
                                    }
                                    on_delta(text);
                                }
                            }
                        }
                    }
                }
            }
            line.clear();
        }
        if in_think {
            on_delta("</think>");
        }
        Ok(())
    } else {
        let mut oai_msgs = Vec::new();
        if !system.trim().is_empty() {
            oai_msgs.push(json!({ "role": "system", "content": system }));
        }
        for m in messages {
            let imgs: Vec<&AttachmentPayload> = m
                .attachments
                .iter()
                .filter(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
                .collect();
            if imgs.is_empty() {
                oai_msgs.push(json!({ "role": m.role, "content": m.content }));
            } else {
                let mut parts = vec![json!({ "type": "text", "text": m.content })];
                for img in imgs {
                    parts.push(json!({
                        "type": "image_url",
                        "image_url": { "url": img.data_url }
                    }));
                }
                oai_msgs.push(json!({ "role": m.role, "content": parts }));
            }
        }
        let mut payload = json!({
            "model": model,
            "stream": true,
            "messages": oai_msgs
        });
        if effort != "medium" {
            payload["reasoning_effort"] = json!(if effort == "max" { "high" } else { effort });
        }

        let endpoint = if base.ends_with("/v1") {
            format!("{}/chat/completions", base)
        } else {
            format!("{}/v1/chat/completions", base)
        };
        let resp = client
            .post(endpoint)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", custom.api_key))
            .json(&payload)
            .send()
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("OpenAI HTTP {}", resp.status()));
        }
        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut in_think = false;
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            if let Some(raw) = line.trim().strip_prefix("data:") {
                let raw = raw.trim();
                if raw == "[DONE]" {
                    break;
                }
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    if let Some(delta) = ev
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c0| c0.get("delta"))
                    {
                        let r_text = delta
                            .get("reasoning_content")
                            .or_else(|| delta.get("reasoning"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        if !r_text.is_empty() {
                            if !in_think {
                                in_think = true;
                                on_delta("<think>");
                            }
                            on_delta(r_text);
                        }
                        if let Some(text) = delta.get("content").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                on_delta(text);
                            }
                        }
                    }
                }
            }
            line.clear();
        }
        if in_think {
            on_delta("</think>");
        }
        Ok(())
    }
}

/// Dispatch a chat request to the selected keyless provider with automatic multi-provider failover.
pub fn dispatch_stream<F>(
    engine: &ProviderEngine,
    req: &ChatRequest,
    cancel: &AtomicBool,
    mut on_delta: F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    if let Some(custom) = &req.custom {
        return stream_custom_endpoint(
            custom,
            &req.model,
            &req.system,
            &req.messages,
            &req.effort,
            cancel,
            &mut on_delta,
        );
    }

    let has_attachments = req
        .messages
        .iter()
        .any(|m| !m.attachments.is_empty());
    let primary = req.provider.as_str();
    let res = match primary {
        "mercury3" => {
            if has_attachments {
                stream_kilo("nvidia/nemotron-3.5-super-vl:free", &req.system, &req.messages, cancel, &mut on_delta)
                    .or_else(|_| stream_ptero("gpt-6.1-terra:voyage", &req.system, &req.messages, cancel, &mut on_delta))
                    .or_else(|_| stream_qwen_app(engine, "qwen4-max", &req.system, &req.messages, &req.effort, cancel, &mut on_delta))
            } else {
                stream_mercury3(engine, &req.system, &req.messages, &req.effort, cancel, &mut on_delta)
            }
        }
        "kilo" => stream_kilo(&req.model, &req.system, &req.messages, cancel, &mut on_delta)
            .or_else(|_| {
                if has_attachments {
                    stream_kilo("openrouter/free", &req.system, &req.messages, cancel, &mut on_delta)
                        .or_else(|_| stream_kilo("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", &req.system, &req.messages, cancel, &mut on_delta))
                } else {
                    Err("kilo primary failed".to_string())
                }
            }),
        "ptero" => stream_ptero(&req.model, &req.system, &req.messages, cancel, &mut on_delta),
        "unikey" => stream_unikey(&req.model, &req.system, &req.messages, cancel, &mut on_delta),
        "llm7" => stream_llm7(&req.model, &req.system, &req.messages, cancel, &mut on_delta),
        "pollinations" => stream_pollinations(&req.model, &req.system, &req.messages, cancel, &mut on_delta),
        "yqcloud" => stream_yqcloud(&req.system, &req.messages, cancel, &mut on_delta),
        "k2horizon" => stream_k2horizon(&req.system, &req.messages, &req.effort, cancel, &mut on_delta),
        "motif" => stream_motif(
            engine,
            &req.model,
            &req.system,
            &req.messages,
            &req.effort,
            cancel,
            &mut on_delta,
        ),
        "deepai" => {
            if has_attachments {
                stream_ptero("gpt-6.1-terra:voyage", &req.system, &req.messages, cancel, &mut on_delta)
                    .or_else(|_| stream_kilo("nvidia/nemotron-3.5-super-vl:free", &req.system, &req.messages, cancel, &mut on_delta))
                    .or_else(|_| stream_qwen_app(engine, "qwen4-max", &req.system, &req.messages, &req.effort, cancel, &mut on_delta))
            } else {
                stream_deepai(&req.model, &req.system, &req.messages, cancel, &mut on_delta)
            }
        }
        "qwen" => stream_qwen_app(engine, &req.model, &req.system, &req.messages, &req.effort, cancel, &mut on_delta)
            .or_else(|_| {
                if has_attachments {
                    stream_ptero("gpt-6.1-terra:voyage", &req.system, &req.messages, cancel, &mut on_delta)
                        .or_else(|_| stream_kilo("nvidia/nemotron-3.5-super-vl:free", &req.system, &req.messages, cancel, &mut on_delta))
                } else {
                    stream_deepai("qwen3.8-flash", &req.system, &req.messages, cancel, &mut on_delta)
                        .or_else(|_| stream_mercury3(engine, &req.system, &req.messages, &req.effort, cancel, &mut on_delta))
                }
            }),
        "longcat" => stream_longcat(&req.system, &req.messages, cancel, &mut on_delta),
        "geminiweb" => stream_geminiweb(&req.system, &req.messages, cancel, &mut on_delta),
        "chatjimmy" => {
            let user_prompt = req
                .messages
                .iter()
                .map(|m| format!("{}: {}", m.role, m.content))
                .collect::<Vec<_>>()
                .join("\n\n");
            let text = chatjimmy_complete(&req.system, &user_prompt)?;
            on_delta(&text);
            Ok(())
        }
        _ => stream_mercury3(engine, &req.system, &req.messages, &req.effort, cancel, &mut on_delta),
    };

    if res.is_ok() || cancel.load(Ordering::Relaxed) {
        return res;
    }

    // Automatic resilient failover across our bundled keyless providers (vision-aware when attachments are present)
    let fallbacks: &[&str] = if has_attachments {
        &["ptero", "kilo", "qwen"]
    } else {
        &["mercury3", "kilo", "unikey", "llm7", "pollinations", "ptero", "k2horizon", "motif", "deepai", "yqcloud", "chatjimmy"]
    };
    for &fb in fallbacks {
        if fb == primary || cancel.load(Ordering::Relaxed) {
            continue;
        }
        let ok = match fb {
            "mercury3" => stream_mercury3(engine, &req.system, &req.messages, &req.effort, cancel, &mut on_delta).is_ok(),
            "kilo" => stream_kilo(
                if has_attachments { "nvidia/nemotron-3.5-super-vl:free" } else { "kilo-auto/free" },
                &req.system,
                &req.messages,
                cancel,
                &mut on_delta,
            ).is_ok(),
            "ptero" => stream_ptero("gpt-6.1-terra:voyage", &req.system, &req.messages, cancel, &mut on_delta).is_ok(),
            "unikey" => stream_unikey("moonshotai/kimi-k3", &req.system, &req.messages, cancel, &mut on_delta).is_ok(),
            "llm7" => stream_llm7("codestral-latest", &req.system, &req.messages, cancel, &mut on_delta).is_ok(),
            "pollinations" => stream_pollinations("openai", &req.system, &req.messages, cancel, &mut on_delta).is_ok(),
            "yqcloud" => stream_yqcloud(&req.system, &req.messages, cancel, &mut on_delta).is_ok(),
            "k2horizon" => stream_k2horizon(&req.system, &req.messages, &req.effort, cancel, &mut on_delta).is_ok(),
            "motif" => stream_motif(
                engine,
                "motif-102b",
                &req.system,
                &req.messages,
                &req.effort,
                cancel,
                &mut on_delta,
            )
            .is_ok(),
            "deepai" => stream_deepai(
                "claude-haiku-5-5",
                &req.system,
                &req.messages,
                cancel,
                &mut on_delta,
            ).is_ok(),
            "qwen" => stream_qwen_app(engine, "qwen4-max", &req.system, &req.messages, &req.effort, cancel, &mut on_delta).is_ok(),
            "chatjimmy" => {
                let user_prompt = req
                    .messages
                    .last()
                    .map(|m| m.content.as_str())
                    .unwrap_or("");
                if let Ok(text) = chatjimmy_complete(&req.system, user_prompt) {
                    on_delta(&text);
                    true
                } else {
                    false
                }
            }
            _ => false,
        };
        if ok {
            return Ok(());
        }
    }

    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_contains_all_fourteen_keyless_providers() {
        let cat = catalog();
        let ids: Vec<&str> = cat.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"mercury3"));
        assert!(ids.contains(&"kilo"));
        assert!(ids.contains(&"qwen"));
        assert!(ids.contains(&"ptero"));
        assert!(ids.contains(&"unikey"));
        assert!(ids.contains(&"llm7"));
        assert!(ids.contains(&"pollinations"));
        assert!(ids.contains(&"yqcloud"));
        assert!(ids.contains(&"deepai"));
        assert!(ids.contains(&"k2horizon"));
        assert!(ids.contains(&"motif"));
        assert!(ids.contains(&"longcat"));
        assert!(ids.contains(&"geminiweb"));
        assert!(ids.contains(&"chatjimmy"));
    }

    #[test]
    fn test_clean_chatjimmy_output_strips_stats_and_think() {
        let raw = "<|think|>internal<|/think|>Material 3 Dashboard<|stats|>{\"tps\":21500}<|/stats|>";
        assert_eq!(clean_chatjimmy_output(raw), "Material 3 Dashboard");
    }

    #[test]
    fn test_split_k2_details_extracts_answer() {
        let raw = "<details type=\"reasoning\">\n> step 1\n</details>\n<artboard name=\"Home\">UI</artboard>";
        assert_eq!(split_k2_details(raw), "<artboard name=\"Home\">UI</artboard>");
    }

    #[test]
    fn test_extract_activate_link_from_html() {
        let html = "<a href=\"https://chat.qwen.ai/api/v2/auths/activate?token=abc&amp;id=1\">Activate</a>";
        assert_eq!(
            extract_activate_link(html).as_deref(),
            Some("https://chat.qwen.ai/api/v2/auths/activate?token=abc&id=1")
        );
    }
}
