use crate::crypto::{fake_ipv4, generate_deepai_tryit_key, pseudo_random_u64, random_hex, uuid_v4};
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

#[derive(Default)]
pub struct ProviderSessionState {
    pub inception_token: Option<(String, u64)>,
    pub motif_conversation_id: Option<String>,
    pub gemini_session: Option<GeminiWarmSession>,
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
                vision: true,
            }],
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
                    note: Some("Alibaba flagship coder & UI architect".to_string()),
                    reasoning: true,
                    vision: true,
                },
                ModelSpec {
                    id: "qwen3.8-max".to_string(),
                    label: "Qwen 3.8 Max".to_string(),
                    note: None,
                    reasoning: true,
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
            id: "deepai".to_string(),
            name: "DeepAI".to_string(),
            kind: "keyless".to_string(),
            speed: "~60 tok/s".to_string(),
            status: "ready".to_string(),
            models: vec![
                ModelSpec {
                    id: "standard".to_string(),
                    label: "DeepAI Standard".to_string(),
                    note: Some("SHA-256 tryit key rotation".to_string()),
                    reasoning: false,
                    vision: true,
                },
                ModelSpec {
                    id: "qwen3.8-flash".to_string(),
                    label: "Qwen 3.8 Flash (DeepAI)".to_string(),
                    note: None,
                    reasoning: false,
                    vision: true,
                },
                ModelSpec {
                    id: "claude-haiku-5-5".to_string(),
                    label: "Claude Haiku 5.5 (DeepAI)".to_string(),
                    note: None,
                    reasoning: false,
                    vision: true,
                },
                ModelSpec {
                    id: "deepseek-v4.1-flash".to_string(),
                    label: "DeepSeek V4.1 Flash".to_string(),
                    note: None,
                    reasoning: false,
                    vision: false,
                },
            ],
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

/// Strip `<|stats|>...<|/stats|>` and `<|think|>...<|/think|>` from ChatJimmy output.
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
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    for attempt in 0..2 {
        let token = ensure_inception_token(engine, attempt > 0)?;
        let mut inc_msgs = Vec::new();
        if !system.trim().is_empty() {
            inc_msgs.push(json!({
                "id": random_hex(16),
                "role": "system",
                "parts": [{ "type": "text", "text": system }]
            }));
        }
        for m in messages {
            inc_msgs.push(json!({
                "id": random_hex(16),
                "role": m.role,
                "parts": [{ "type": "text", "text": m.content }]
            }));
        }

        let payload = json!({
            "reasoningEffort": "high",
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
                    if ev.get("type").and_then(|t| t.as_str()) == Some("text-delta") {
                        if let Some(delta) = ev.get("delta").and_then(|d| d.as_str()) {
                            if !delta.is_empty() {
                                saw_text = true;
                                on_delta(delta);
                            }
                        }
                    }
                }
            }
            line.clear();
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
    let mut prev_answer = String::new();
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
                    let answer = split_k2_details(content);
                    if !answer.is_empty() {
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

    let mut transcript = String::new();
    if !system.trim().is_empty() {
        transcript.push_str(&format!("System: {}\n\n", system));
    }
    for (idx, m) in messages.iter().enumerate() {
        if idx + 1 < messages.len() {
            transcript.push_str(&format!("{}: {}\n\n", m.role, m.content));
        }
    }
    let last_user = messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_default();
    let query = if transcript.is_empty() {
        last_user
    } else {
        format!("Previous conversation:\n{}\nCurrent message: {}", transcript, last_user)
    };

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
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let trimmed = line.trim();
        if let Some(raw) = trimmed.strip_prefix("data:") {
            let raw = raw.trim();
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                let etype = ev.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if etype == "chat.text" {
                    if let Some(d) = ev.get("data").and_then(|d| d.as_str()) {
                        if !d.is_empty() {
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

    if saw_text {
        Ok(())
    } else {
        Err("Motif stream ended without text".to_string())
    }
}

/// Stream from DeepAI (`https://api.deepai.org/hacking_is_a_serious_crime`) using SHA-256 tryit key rotation.
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
    let effective_model = match model {
        "qwen4-max" | "qwen3.8-max" | "qwen3.8-flash" => "qwen3.8-flash",
        "claude-haiku-5-5" => "claude-haiku-5-5",
        "deepseek-v4.1-flash" => "deepseek-v4.1-flash",
        _ => "standard",
    };

    let mut history = Vec::new();
    if !system.trim().is_empty() {
        history.push(json!({
            "role": "user",
            "content": format!("[System Instructions]\n{}", system)
        }));
    }
    for m in messages {
        let role = if m.role == "system" { "user" } else { m.role.as_str() };
        history.push(json!({
            "role": role,
            "content": m.content
        }));
    }

    let api_key = generate_deepai_tryit_key(CHROME_UA);
    let form = reqwest::blocking::multipart::Form::new()
        .text("chatHistory", serde_json::to_string(&history).unwrap_or_default())
        .text("model", effective_model.to_string())
        .text("session_uuid", uuid_v4())
        .text("chat_style", "chat")
        .text("sensitivity_request_id", uuid_v4())
        .text("hacker_is_stinky", "very_stinky");

    let client = build_client(180)?;
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

/// Stream from LongCat (`https://longcat.chat/api/v1/chat-completion-oversea-V2`, LongCat 2.5 1.6T MoE).
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

    let mut prompt = String::new();
    if !system.trim().is_empty() {
        prompt.push_str(&format!("{}\n\n", system));
    }
    for m in messages {
        prompt.push_str(&format!("{}: {}\n\n", m.role, m.content));
    }

    let payload = json!({
        "content": prompt.trim(),
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
                    if etype == "content" {
                        if let Some(c) = event_obj.get("content").and_then(|c| c.as_str()) {
                            if !c.is_empty() {
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
        prompt.push_str(&format!("{}\n\n", &system[..system.len().min(4000)]));
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

/// Stream from custom OpenAI-compatible or Anthropic endpoint.
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
            anth_msgs.push(json!({
                "role": m.role,
                "content": m.content
            }));
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
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            if let Some(raw) = line.trim().strip_prefix("data:") {
                let raw = raw.trim();
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    if ev.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(text) = ev
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|t| t.as_str())
                        {
                            if !text.is_empty() {
                                on_delta(text);
                            }
                        }
                    }
                }
            }
            line.clear();
        }
        Ok(())
    } else {
        let mut oai_msgs = Vec::new();
        if !system.trim().is_empty() {
            oai_msgs.push(json!({ "role": "system", "content": system }));
        }
        for m in messages {
            oai_msgs.push(json!({ "role": m.role, "content": m.content }));
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
                    if let Some(text) = ev
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c0| c0.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(|t| t.as_str())
                    {
                        if !text.is_empty() {
                            on_delta(text);
                        }
                    }
                }
            }
            line.clear();
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

    let primary = req.provider.as_str();
    let res = match primary {
        "mercury3" => stream_mercury3(engine, &req.system, &req.messages, cancel, &mut on_delta),
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
        "deepai" => stream_deepai(&req.model, &req.system, &req.messages, cancel, &mut on_delta),
        "qwen" => stream_deepai("qwen3.8-flash", &req.system, &req.messages, cancel, &mut on_delta)
            .or_else(|_| stream_mercury3(engine, &req.system, &req.messages, cancel, &mut on_delta)),
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
        _ => stream_mercury3(engine, &req.system, &req.messages, cancel, &mut on_delta),
    };

    if res.is_ok() || cancel.load(Ordering::Relaxed) {
        return res;
    }

    // Automatic resilient failover across our bundled keyless providers
    let fallbacks = ["mercury3", "k2horizon", "motif", "deepai", "chatjimmy"];
    for fb in fallbacks {
        if fb == primary || cancel.load(Ordering::Relaxed) {
            continue;
        }
        let ok = match fb {
            "mercury3" => stream_mercury3(engine, &req.system, &req.messages, cancel, &mut on_delta).is_ok(),
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
            "deepai" => stream_deepai("standard", &req.system, &req.messages, cancel, &mut on_delta).is_ok(),
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
