use crate::crypto::{
    decode_data_url, fake_ipv4, generate_deepai_island_key, generate_deepai_tryit_key,
    generate_mychat_encryption_token, hmac_sha256_bytes, hmac_sha256_hex, iso8601_utc_compact,
    pseudo_random_u64, random_hex, sha256_hex, uuid_v4,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    #[serde(rename = "sessionId", default)]
    pub session_id: Option<String>,
    #[serde(rename = "toolsPrompt", default)]
    pub tools_prompt: Option<String>,
    #[serde(rename = "subagentDepth", default)]
    pub subagent_depth: u32,
    #[serde(rename = "maxSubagentDepth", default)]
    pub max_subagent_depth: Option<u32>,
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
    pub shannian_token: Option<(String, u64)>,
    pub gemini_bl_cached: Option<String>,
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
    let eff_timeout = if timeout_secs >= 12 { timeout_secs.max(60) } else { timeout_secs };
    Client::builder()
        .user_agent(CHROME_UA)
        .cookie_store(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(eff_timeout))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))
}

/// Cap a system prompt to `max_chars` by preserving both the head (tool schemas / core laws)
/// and the tail (active canvas screen list / workspace / closing protocol).
pub fn smart_cap_system(system: &str, max_chars: usize) -> String {
    let total = system.chars().count();
    if total <= max_chars {
        return system.to_string();
    }
    let head_len = (max_chars * 7) / 10;
    let tail_len = max_chars.saturating_sub(head_len);
    let head: String = system.chars().take(head_len).collect();
    let tail: String = system.chars().skip(total.saturating_sub(tail_len)).collect();
    format!("{}\n\n{}\n", head.trim_end(), tail.trim_start())
}

/// Compact bulky `<artboard>` or `<tool_response>` bodies inside older history turns so 10+ turn
/// conversations never overflow scraper or GGUF context windows while keeping the latest turn intact.
fn compact_older_turn_content(content: &str, max_chars: usize) -> String {
    let mut out = content.to_string();
    // Replace full HTML bodies inside older `<artboard ...>...</artboard>` turns with a compact marker
    while let Some(start) = out.find("<artboard") {
        let Some(gt_rel) = out[start..].find('>') else {
            break;
        };
        let open_end = start + gt_rel + 1;
        if let Some(close_rel) = out[open_end..].find("</artboard>") {
            let close_start = open_end + close_rel;
            let inner_len = close_start.saturating_sub(open_end);
            if inner_len > 360 {
                let open_tag = &out[start..open_end];
                let replacement = format!(
                    "{}[/* screen HTML updated on canvas ({} chars) */]</artboard>",
                    open_tag, inner_len
                );
                out.replace_range(start..close_start + 11, &replacement);
                continue;
            }
        }
        break;
    }
    let char_count = out.chars().count();
    if char_count <= max_chars {
        return out;
    }
    let head_len = (max_chars * 6) / 10;
    let tail_len = max_chars.saturating_sub(head_len);
    let head: String = out.chars().take(head_len).collect();
    let tail: String = out.chars().skip(char_count.saturating_sub(tail_len)).collect();
    format!("{}\n...[compacted earlier turn]...\n{}", head, tail)
}

/// Normalize multi-turn messages for any keyless provider, guaranteeing:
/// 1. Strict `user` -> `assistant` -> `user` role alternation starting with `user`.
/// 2. Compaction of older turns when `messages.len() > 2` so Turn 2..Turn 20+ never hit HTTP 400/413.
/// 3. Full preservation of the final user turn (including `<canvas_state>` and `<tool_response>`).
pub fn normalize_multi_turn_messages(
    messages: &[ChatMessage],
    max_history_turns: usize,
    max_older_turn_chars: usize,
    max_last_user_chars: usize,
) -> Vec<ChatMessage> {
    if messages.is_empty() {
        return vec![ChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
            attachments: Vec::new(),
        }];
    }

    let len = messages.len();
    let last_idx = len - 1;
    let keep_from = if len > max_history_turns + 1 {
        len.saturating_sub(max_history_turns)
    } else {
        0
    };
    let has_xml_prefill = messages
        .first()
        .map(|m| m.content.contains("[XML DSL Output Mode"))
        .unwrap_or(false);

    let mut normalized: Vec<ChatMessage> = Vec::new();

    for (idx, m) in messages.iter().enumerate() {
        // Always keep idx 0..=2 when the synthetic XML DSL prefill is present so the user's real request at idx == 2 is never dropped
        let is_protected_initial = idx == 0 || (has_xml_prefill && idx <= 2);
        if !is_protected_initial && idx < keep_from {
            continue;
        }
        let role = if m.role == "assistant" {
            "assistant".to_string()
        } else {
            "user".to_string()
        };
        let raw_content = m.content.trim();
        if raw_content.is_empty() && m.attachments.is_empty() {
            continue;
        }
        let content = if idx == last_idx {
            let c_len = raw_content.chars().count();
            if c_len <= max_last_user_chars {
                raw_content.to_string()
            } else {
                let head_len = (max_last_user_chars * 4) / 10;
                let tail_len = max_last_user_chars.saturating_sub(head_len);
                let head: String = raw_content.chars().take(head_len).collect();
                let tail: String = raw_content.chars().skip(c_len.saturating_sub(tail_len)).collect();
                format!("{}\n\n{}\n", head, tail)
            }
        } else {
            compact_older_turn_content(raw_content, max_older_turn_chars)
        };

        if let Some(prev) = normalized.last_mut() {
            if prev.role == role {
                prev.content.push_str("\n\n");
                prev.content.push_str(&content);
                for att in &m.attachments {
                    prev.attachments.push(att.clone());
                }
                continue;
            }
        }

        if normalized.is_empty() && role == "assistant" {
            normalized.push(ChatMessage {
                role: "user".to_string(),
                content: "Continue the session.".to_string(),
                attachments: Vec::new(),
            });
        }

        normalized.push(ChatMessage {
            role,
            content,
            attachments: m.attachments.clone(),
        });
    }

    if normalized.is_empty() {
        normalized.push(ChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
            attachments: Vec::new(),
        });
    }

    normalized
}


pub fn catalog() -> Vec<ProviderInfo> {
    let mut list = Vec::with_capacity(56);
    list.extend(catalog_part_1());
    list.extend(catalog_part_2());
    list.extend(catalog_part_3());
    list.extend(catalog_part_4());
    list
}


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

    let ip = fake_ipv4();
    let client = build_client(12)?;
    let resp = client
        .get("https://chat.inceptionlabs.ai/api/session")
        .header("Accept", "*/*")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Origin", "https://chat.inceptionlabs.ai")
        .header("Referer", "https://chat.inceptionlabs.ai/")
        .header("Sec-CH-UA", "\"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"150\", \"Google Chrome\";v=\"150\"")
        .header("Sec-CH-UA-Mobile", "?0")
        .header("Sec-CH-UA-Platform", "\"Windows\"")
        .header("X-Forwarded-For", &ip)
        .header("X-Real-IP", &ip)
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
    let real_tool_rounds = messages.iter().filter(|m| m.content.contains("<tool_result")).count();
    let inc_effort = if real_tool_rounds > 1 {
        "low"
    } else {
        match effort {
            "low" => "low",
            "medium" => "medium",
            _ => "high",
        }
    };
    for attempt in 0..2 {
        let token = match ensure_inception_token(engine, attempt > 0) {
            Ok(t) => t,
            Err(_) if attempt == 0 => continue,
            Err(_) => return Err("Mercury 3 session token unavailable".to_string()),
        };
        let mut inc_msgs = Vec::new();
        if !system.trim().is_empty() {
            let sys_full = smart_cap_system(system, 96000);
            let is_opencode = sys_full.contains("OpenCode / OpenAI Tool-Calling Protocol");
            let is_design = sys_full.contains("## Current canvas page");
            let is_tools = is_agent_tool_request(&sys_full);
            let already_has_tool_turn = messages.iter().any(|m| m.content.contains("<zeus_tool"));
            let spec_text = if is_tools {
                format!("{}\n\n[System Specification]\n{}", scraper_xml_dsl_banner(), sys_full)
            } else {
                format!("[System Specification]\n{}", sys_full)
            };
            inc_msgs.push(json!({
                "id": random_hex(16),
                "role": "user",
                "parts": [{ "type": "text", "text": spec_text }]
            }));
            inc_msgs.push(json!({
                "id": random_hex(16),
                "role": "assistant",
                "parts": [{ "type": "text", "text": if is_opencode {
                    "Understood. I will follow the OpenCode / OpenAI Tool-Calling Protocol strictly. When a tool action is needed, I will emit <tool_call>{\"name\": \"...\", \"arguments\": {...}}</tool_call> outside <think> and wait for <tool_response>."
                } else if is_design {
                    "Understood. I am Zeus running inside the ZeusDesigns desktop harness with direct read/write access to the user's multi-artboard canvas. I will inspect <canvas_state> and <current_artboard> directly and emit complete <artboard> or <zeus_tool> blocks to create or revise screens in place without ever asking the user to paste HTML."
                } else if is_tools && !already_has_tool_turn {
                    "<zeus_tool name=\"list_dir\" path=\"\"></zeus_tool>"
                } else {
                    "Understood. I am Zeus connected to the local workspace runtime. I will answer greetings concisely and for coding or workspace tasks I will emit <zeus_tool> blocks with full content outside <think> to execute shell, python, or file operations."
                } }]
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
        let mut saw_think = false;
        let mut in_think = false;
        let mut think_buf = String::new();
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
                    if etype == "reasoning-delta" || etype == "reasoning" || etype == "thinking-delta" || etype == "thought-delta" {
                        if let Some(delta) = ev.get("delta").or_else(|| ev.get("text")).and_then(|d| d.as_str()) {
                            if !delta.is_empty() {
                                if !in_think {
                                    in_think = true;
                                    on_delta("<think>");
                                }
                                saw_think = true;
                                think_buf.push_str(delta);
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
        // If Mercury 3 emitted only <think> and cut off before emitting any text-delta (and didn't put <zeus_tool> inside <think>),
        // immediately request the visible response with reasoningEffort="low" so the turn never ends blank or stalls mid-task.
        if !saw_text && saw_think && !think_buf.contains("<zeus_tool") && !cancel.load(Ordering::Relaxed) {
            let mut followup_msgs = inc_msgs.clone();
            followup_msgs.push(json!({
                "id": random_hex(16),
                "role": "assistant",
                "parts": [{ "type": "text", "text": format!("Thought summary: {}", think_buf.chars().take(1200).collect::<String>()) }]
            }));
            followup_msgs.push(json!({
                "id": random_hex(16),
                "role": "user",
                "parts": [{ "type": "text", "text": "Now output ONLY your visible response or the next <zeus_tool> XML block outside <think> to execute the action." }]
            }));
            let followup_payload = json!({
                "reasoningEffort": "low",
                "webSearchEnabled": false,
                "voiceMode": false,
                "timezone": "UTC",
                "id": random_hex(16),
                "messages": followup_msgs,
                "trigger": "submit-message"
            });
            if let Ok(resp2) = client
                .post("https://chat.inceptionlabs.ai/api/chat")
                .header("Content-Type", "application/json")
                .header("Accept", "*/*")
                .header("Origin", "https://chat.inceptionlabs.ai")
                .header("Referer", "https://chat.inceptionlabs.ai/")
                .header("x-session-token", &token)
                .header("Cookie", format!("session={}", token))
                .json(&followup_payload)
                .send()
            {
                if resp2.status().is_success() {
                    let mut r2 = BufReader::new(resp2);
                    let mut l2 = String::new();
                    while r2.read_line(&mut l2).unwrap_or(0) > 0 {
                        if cancel.load(Ordering::Relaxed) {
                            break;
                        }
                        if let Some(raw2) = l2.trim().strip_prefix("data: ") {
                            if raw2 == "[DONE]" {
                                break;
                            }
                            if let Ok(ev2) = serde_json::from_str::<Value>(raw2) {
                                if ev2.get("type").and_then(|t| t.as_str()) == Some("text-delta") {
                                    if let Some(d2) = ev2.get("delta").and_then(|d| d.as_str()) {
                                        if !d2.is_empty() {
                                            saw_text = true;
                                            on_delta(d2);
                                        }
                                    }
                                }
                            }
                        }
                        l2.clear();
                    }
                }
            }
        }
        if saw_text || saw_think {
            return Ok(());
        }
    }
    Err("Mercury 3 stream ended without text".to_string())
}

/// Parse K2Horizon `<details type="reasoning">...</details>` cumulative stream.

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

/// Collapse Gemini's auto-linkified `[https://...](https://...)` markdown links back to the bare URL
/// so shell commands, URLs, and mid-stream snapshot diffs never get corrupted.
fn unlinkify_markdown_urls(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(lb) = rest.find('[') {
        out.push_str(&rest[..lb]);
        let after_lb = &rest[lb + 1..];
        if let Some(mid) = after_lb.find("](") {
            let label = &after_lb[..mid];
            let after_mid = &after_lb[mid + 2..];
            if (label.starts_with("http://") || label.starts_with("https://"))
                && (after_mid.starts_with("http://") || after_mid.starts_with("https://"))
                && !label.contains('\n')
            {
                if let Some(rb) = after_mid.find(')') {
                    let href = &after_mid[..rb];
                    if !href.contains('\n') && !href.contains(' ') {
                        out.push_str(href);
                        rest = &after_mid[rb + 1..];
                        continue;
                    }
                }
            }
        }
        out.push('[');
        rest = after_lb;
    }
    out.push_str(rest);
    out
}

/// Strip internal Gemini Web code execution blocks (` ```python?code_reference...``` ` and ` ```text?code_stdout...``` `),
/// including unclosed trailing internal blocks during mid-stream snapshots so `prev_text` prefix matching never breaks.
pub fn clean_gemini_code_blocks(raw: &str) -> String {
    let mut out = unlinkify_markdown_urls(raw);
    for marker in [
        "```python?code_reference",
        "```javascript?code_reference",
        "```text?code_stdout",
        "```text?code_reference",
    ] {
        while let Some(start) = out.find(marker) {
            let after = start + marker.len();
            if let Some(close_rel) = out[after..].find("```") {
                let mut end = after + close_rel + 3;
                while end < out.len() && out.as_bytes()[end] == b'\n' {
                    end += 1;
                }
                out.replace_range(start..end, "");
            } else {
                out.truncate(start);
                break;
            }
        }
    }
    out
}

/// Direct anonymous Google Gemini 4 `StreamGenerate` (`MODE_CATEGORY` `inner[79]` = 1..6, `think_mode` `inner[17]` = 0/4).
pub fn stream_gemini4_direct<F>(
    mode_id: i64,
    think_mode: i64,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let wants_tools = is_agent_tool_request(system);
    let norm_messages = normalize_multi_turn_messages(messages, 48, 24000, 120000);
    let mut prompt = String::new();
    if wants_tools {
        prompt.push_str(&format!("{}\n\n", scraper_xml_dsl_banner()));
    } else if think_mode == 0 || mode_id == 2 || mode_id == 3 || mode_id == 5 {
        prompt.push_str("[Thinking Mode Enabled]: Begin your response with a concise <think>...</think> reasoning block analyzing the request, then provide your final answer after </think>.\n\n");
    }
    if !system.trim().is_empty() {
        let sys_safe = smart_cap_system(system, 96000);
        prompt.push_str(&format!("<system_instruction>\n{}\n</system_instruction>\n\n", sys_safe));
    }
    if norm_messages.len() > 1 {
        prompt.push_str("<conversation_history>\n");
        for m in &norm_messages[..norm_messages.len() - 1] {
            let role_tag = if m.role == "assistant" { "assistant" } else { "user" };
            prompt.push_str(&format!("<turn role=\"{}\">\n{}\n</turn>\n\n", role_tag, m.content));
        }
        prompt.push_str("</conversation_history>\n\n");
    }
    if let Some(last) = norm_messages.last() {
        if wants_tools && !last.content.contains("<tool_result") && !last.content.contains("[XML DSL") {
            prompt.push_str(&format!(
                "<current_user_turn>\n{}\n</current_user_turn>\n(If a workspace action is needed, output ONLY the <zeus_tool> XML tag. Never echo <turn>, [User]:, [Assistant]:, or <tool_result> tags.)",
                last.content
            ));
        } else if wants_tools && last.content.contains("<tool_result") {
            prompt.push_str(&format!(
                "<current_user_turn>\n{}\n</current_user_turn>\n\n[Execution Rule: Do NOT stop mid-task and NEVER ask 'tell me to proceed'. Respond directly as the assistant and NEVER echo <turn>, [User]:, [Assistant]:, or <tool_result> tags. If the user's request is not yet 100% completed on disk, emit the next <zeus_tool name=\"read_file\"|\"edit_file\"|\"write_file\"|\"search_code\"|\"list_dir\"|\"shell\"|\"python\">...</zeus_tool> block outside <think> right now.]",
                last.content
            ));
        } else {
            prompt.push_str(&format!(
                "<current_user_turn>\n{}\n</current_user_turn>\n(Respond directly as the assistant. Never echo <turn>, [User]:, or [Assistant]: tags.)",
                last.content
            ));
        }
    }

    let mut inner: Vec<Value> = vec![Value::Null; 80];
    inner[0] = json!([prompt, 0, Value::Null, Value::Null, Value::Null, Value::Null, 0]);
    inner[1] = json!(["en"]);
    inner[2] = json!(["", "", "", Value::Null, Value::Null, Value::Null, Value::Null, Value::Null, Value::Null, ""]);
    inner[6] = json!([0]);
    inner[7] = json!(1);
    inner[10] = json!(1);
    inner[11] = json!(0);
    inner[17] = json!([[think_mode]]);
    inner[18] = json!(0);
    inner[27] = json!(1);
    inner[30] = json!([4]);
    inner[41] = json!([2]);
    inner[53] = json!(0);
    inner[59] = json!(uuid_v4());
    inner[61] = json!([]);
    inner[68] = json!(1);
    inner[79] = json!(mode_id);

    let outer = json!([Value::Null, Value::Array(inner).to_string()]).to_string();
    let body = format!("f.req={}", url_encode(&outer));
    let client = build_client(16)?;

    let mut bl = "boq_assistant-bard-web-server_20260716.08_p0".to_string();
    for attempt in 0..2 {
        let reqid = 100_000 + (pseudo_random_u64() % 800_000);
        let url = format!(
            "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl={}&hl=en&_reqid={}&rt=c",
            url_encode(&bl),
            reqid
        );
        let resp = match client
            .post(&url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Origin", "https://gemini.google.com")
            .header("Referer", "https://gemini.google.com/app")
            .header("X-Same-Domain", "1")
            .body(body.clone())
            .send()
        {
            Ok(r) if r.status().is_success() => r,
            Ok(r) if r.status().as_u16() == 405 && attempt == 0 => {
                if let Ok(app_resp) = client.get("https://gemini.google.com/app").send() {
                    let html = app_resp.text().unwrap_or_default();
                    if let Some(idx) = html.find("boq_assistant-bard-web-server_") {
                        let rest = &html[idx..];
                        let end = rest
                            .find(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '.')
                            .unwrap_or(rest.len());
                        if end > 30 {
                            bl = rest[..end].to_string();
                            continue;
                        }
                    }
                }
                break;
            }
            _ => break,
        };

        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut prev_text = String::new();
        let mut saw_any = false;

        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            let trimmed = line.trim();
            if trimmed.contains("\"wrb.fr\"") && trimmed.len() > 120 {
                if let Ok(arr) = serde_json::from_str::<Value>(trimmed) {
                    if let Some(entries) = arr.as_array() {
                        for entry in entries {
                            if entry.get(0).and_then(|v| v.as_str()) == Some("wrb.fr") {
                                if let Some(inner_str) = entry.get(2).and_then(|v| v.as_str()) {
                                    if let Ok(inner_val) = serde_json::from_str::<Value>(inner_str) {
                                        if let Some(parts) = inner_val.get(4).and_then(|v| v.as_array()) {
                                            for part in parts {
                                                if let Some(texts) = part.get(1).and_then(|v| v.as_array()) {
                                                    for t_val in texts {
                                                        if let Some(snap_raw) = t_val.as_str() {
                                                            let snap = clean_gemini_code_blocks(snap_raw);
                                                            if snap.is_empty() {
                                                                continue;
                                                            }
                                                            if snap.len() > prev_text.len() && snap.starts_with(&prev_text) {
                                                                let delta = &snap[prev_text.len()..];
                                                                if !delta.is_empty() {
                                                                    saw_any = true;
                                                                    on_delta(delta);
                                                                }
                                                                prev_text = snap;
                                                            } else if prev_text.is_empty() && !snap.trim().is_empty() {
                                                                saw_any = true;
                                                                on_delta(&snap);
                                                                prev_text = snap;
                                                            } else if snap.len() > prev_text.len() {
                                                                // Handle Gemini StreamGenerate snapshot rewrites (e.g. markdown backticks/links)
                                                                // without ever freezing at the first snapshot ("The `").
                                                                let common_bytes = prev_text
                                                                    .chars()
                                                                    .zip(snap.chars())
                                                                    .take_while(|(a, b)| a == b)
                                                                    .map(|(a, _)| a.len_utf8())
                                                                    .sum::<usize>();
                                                                let tail_anchor: String = prev_text
                                                                    .chars()
                                                                    .rev()
                                                                    .take(12)
                                                                    .collect::<Vec<_>>()
                                                                    .into_iter()
                                                                    .rev()
                                                                    .collect();
                                                                let resume_from = if !tail_anchor.is_empty() {
                                                                    snap.rfind(&tail_anchor)
                                                                        .map(|pos| pos + tail_anchor.len())
                                                                        .filter(|&p| p >= common_bytes)
                                                                        .unwrap_or(common_bytes)
                                                                } else {
                                                                    common_bytes
                                                                };
                                                                if resume_from < snap.len() {
                                                                    let delta = &snap[resume_from..];
                                                                    if !delta.is_empty() {
                                                                        saw_any = true;
                                                                        on_delta(delta);
                                                                    }
                                                                }
                                                                prev_text = snap;
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
            return Ok(());
        }
    }

    Err("Direct Gemini 4 StreamGenerate returned no text".to_string())
}

/// Stream from Kilo Gateway (`https://api.kilo.ai/api/gateway/chat/completions`, free frontier & multimodal models).

fn is_agent_tool_request(system: &str) -> bool {
    (system.contains("## Agent Tools")
        || system.contains("## Agent tools")
        || system.contains("## Calling Tools")
        || system.contains("## Local Workspace Agent Tools")
        || system.contains("<zeus_tool"))
        && !system.contains("## Current canvas page")
        && !system.contains("CRITICAL - MAXIMUM STEPS REACHED")
}

fn scraper_xml_dsl_banner() -> &'static str {
    "[XML DSL Output Mode — Required by Client Parser]\nYour text output is parsed in real time by the local Zeus Codes C++/Rust client runtime.\nDo NOT say you lack local file/terminal access and do NOT output markdown ```bash code blocks.\nPrefer dedicated tools (read_file, edit_file, write_file, search_code, list_dir) over shell; never chain echo \"====\" separators; parallelize independent reads.\nWhenever a workspace action is needed, emit a raw XML tag in your response:\n- <zeus_tool name=\"shell\">command</zeus_tool>\n- <zeus_tool name=\"python\">python3_code</zeus_tool>\n- <zeus_tool name=\"read_file\" path=\"relative/file\" start=\"1\" end=\"250\"></zeus_tool>\n- <zeus_tool name=\"write_file\" path=\"relative/file\">complete content</zeus_tool>\n- <zeus_tool name=\"delete_file\" path=\"relative/file\"></zeus_tool>\n- <zeus_tool name=\"edit_file\" path=\"relative/file\">\n<<<<<<< SEARCH\nold lines\n=======\nnew lines\n>>>>>>> REPLACE\n</zeus_tool>\n- <zeus_tool name=\"list_dir\" path=\"subdir\"></zeus_tool>\n- <zeus_tool name=\"search_code\">query</zeus_tool>\n- <zeus_tool name=\"memory_search\">query</zeus_tool> | <zeus_tool name=\"memory_save\" path=\"preferences\">fact</zeus_tool> | <zeus_tool name=\"memory_edit\" path=\"id\">fact</zeus_tool> | <zeus_tool name=\"memory_delete\" path=\"id\"></zeus_tool>\nNEVER invent or simulate command output before receiving <tool_result>. Stop immediately after </zeus_tool>."
}

/// Sanitize a dedicated reasoning chunk (`reasoning_content`, `thinking`, etc.) so any inner `<think>` / `</think>`
/// mentions (including split chunk boundaries like `</th` + `ink>`) never prematurely close the `<think>` envelope.
fn sanitize_reasoning_delta(raw: &str) -> String {
    let mut s = raw
        .replace("</think>", "`/think`")
        .replace("<think>", "`think`")
        .replace("</thinking>", "`/thinking`")
        .replace("<thinking>", "`thinking`")
        .replace("</thought>", "`/thought`")
        .replace("<thought>", "`thought`")
        .replace("</reasoning>", "`/reasoning`")
        .replace("<reasoning>", "`reasoning`");
    let lower = s.to_ascii_lowercase();
    for suffix in ["<", "</", "</t", "</th", "</thi", "</thin", "<t", "<th", "<thi", "<thin"] {
        if lower.ends_with(suffix) {
            s.push(' ');
            break;
        }
    }
    s
}

/// Extract reasoning text from any OpenAI/vLLM/OpenRouter/Kilo/Tongyi/ShanNian/Anthropic-bridge delta object.
fn extract_delta_reasoning(d: &Value) -> String {
    for key in ["reasoning_content", "reasoning", "thinking", "thought"] {
        if let Some(val) = d.get(key) {
            if let Some(s) = val.as_str() {
                if !s.is_empty() {
                    return sanitize_reasoning_delta(s);
                }
            } else if let Some(obj) = val.as_object() {
                for subk in ["text", "content", "thinking", "summary"] {
                    if let Some(s) = obj.get(subk).and_then(|v| v.as_str()) {
                        if !s.is_empty() {
                            return sanitize_reasoning_delta(s);
                        }
                    }
                }
            }
        }
    }
    if let Some(details) = d.get("reasoning_details").and_then(|v| v.as_array()) {
        let mut combined = String::new();
        for item in details {
            if let Some(s) = item
                .get("text")
                .or_else(|| item.get("thinking"))
                .or_else(|| item.get("summary"))
                .and_then(|v| v.as_str())
            {
                combined.push_str(s);
            }
        }
        if !combined.is_empty() {
            return sanitize_reasoning_delta(&combined);
        }
    }
    String::new()
}

fn is_upstream_error_text(s: &str) -> bool {
    let t = s.trim();
    t.starts_with("Provider API request failed.")
        || t.starts_with("Provider authentication failed.")
        || t.starts_with("[proxy error:")
        || t.contains("Vercel Security Checkpoint")
        || t.contains("tool_use_failed")
        || t.starts_with("API Error: 401")
        || t.starts_with("API Error: 402")
        || t.starts_with("API Error: 403")
        || t.starts_with("API Error: 404")
        || t.starts_with("Error code: 401")
        || t.starts_with("Error code: 402")
        || t.starts_with("Error code: 403")
        || t.starts_with("Error code: 404")
        || t.starts_with("Error code: 410")
        || t.starts_with("Service error, please try again later")
}

// Standard OpenAI function-calling schema for Zeus workspace tools, passed to gateways that natively
// execute OpenAI `tools` (`bun008-freellmapi`, `alchoholpad-litellm`, `w902287-ai-bridge`, etc.).

// Native thinking support ("enable_thinking": true) is wired in providers_oai_a.rs and providers_oai_b.rs

include!("providers_cat_1.rs");
include!("providers_cat_2.rs");
include!("providers_cat_3.rs");
include!("providers_cat_4.rs");
include!("providers_neb_a.rs");
include!("providers_neb_b.rs");
include!("providers_gateways_a.rs");
include!("providers_gateways_b.rs");
include!("providers_oai_a.rs");
include!("providers_oai_b.rs");
include!("providers_direct.rs");
include!("providers_fingerprint.rs");
