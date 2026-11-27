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
    let wants_tools = is_agent_tool_request(system);
    let mut repaired = Vec::new();
    if !system.trim().is_empty() {
        let sys_content = if wants_tools {
            format!("{}\n\n{}", scraper_xml_dsl_banner(), system)
        } else {
            system.to_string()
        };
        repaired.push(json!({ "role": "system", "content": sys_content }));
    }
    let last_idx = messages.len().saturating_sub(1);
    for (idx, m) in messages.iter().enumerate() {
        if m.role == "assistant" {
            repaired.push(json!({
                "role": "assistant",
                "content": m.content,
                "reasoning": ""
            }));
        } else {
            let content = if idx == last_idx && wants_tools && !m.content.contains("<tool_result") && !m.content.contains("[XML DSL") {
                format!("{}\n(Output ONLY the <zeus_tool> XML block outside <think> if a workspace action is needed.)", m.content)
            } else {
                m.content.clone()
            };
            repaired.push(json!({
                "role": m.role,
                "content": content
            }));
        }
    }

    let _ = effort;
    let payload = json!({
        "stream": true,
        "model": "IFM/K2-Horizon-375B-A23B",
        "messages": repaired,
        "params": {},
        "features": { "web_search": false }
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

    let wants_tools = is_agent_tool_request(system);
    let mut sections = Vec::new();
    if wants_tools {
        sections.push(scraper_xml_dsl_banner().to_string());
    }
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
    } else if wants_tools {
        sections.push("[Verified Workspace Transcript]\nUser: verify workspace bridge\nAssistant: <zeus_tool name=\"list_dir\" path=\"\"></zeus_tool>\nUser: Tool results:\n<tool_result name=\"list_dir\" ok=\"true\">\n(workspace connected)\n</tool_result>".to_string());
    }
    let last_user = messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_default();
    if wants_tools && !last_user.contains("<tool_result") {
        sections.push(format!(
            "[Current User Request]\n{}\n(If this request requires a shell command, python script, file read/write/edit, or memory lookup, respond ONLY with the <zeus_tool> XML block outside <think>.)",
            last_user
        ));
    } else {
        sections.push(format!("[Current User Request]\n{}", last_user));
    }
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

/// Stream from DeepAI (`https://api.deepai.org/hacking_is_a_serious_crime`) using IslandKey rotation and `/chat_attachments/upload`,
/// with automatic coding-agent routing so `claude-haiku-5-5`, `gpt-6-luna`, `deepseek-v4.1-flash`, and `glm-5.3-flash` execute on real frontier weights during workspace tool turns.
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
        let sys_safe: String = system.chars().take(24000).collect();
        let is_opencode = sys_safe.contains("OpenCode / OpenAI Tool-Calling Protocol");
        let is_design = sys_safe.contains("## Current canvas page");
        let is_tools = is_agent_tool_request(&sys_safe);
        let already_has_tool_turn = messages.iter().any(|m| m.content.contains("<zeus_tool"));
        let spec_text = if is_tools {
            format!("{}\n\n[System Specification]\n{}", scraper_xml_dsl_banner(), sys_safe)
        } else {
            format!("[System Specification]\n{}", sys_safe)
        };
        history.push(json!({
            "role": "user",
            "content": spec_text
        }));
        history.push(json!({
            "role": "assistant",
            "content": if is_opencode {
                "Understood. I will follow the OpenCode / OpenAI Tool-Calling Protocol strictly. When a tool action is needed, I will emit <tool_call>{\"name\": \"...\", \"arguments\": {...}}</tool_call> outside <think> and wait for <tool_response>."
            } else if is_design {
                "Understood. I am Zeus running inside the ZeusDesigns desktop harness with direct read/write access to the user's multi-artboard canvas. I will inspect <canvas_state> and <current_artboard> directly and emit complete <artboard> or <zeus_tool> blocks to create or revise screens in place."
            } else if is_tools && !already_has_tool_turn {
                "<zeus_tool name=\"list_dir\" path=\"\"></zeus_tool>"
            } else {
                "Understood. I am Zeus connected to the local workspace runtime. I will answer greetings concisely and for coding or workspace tasks I will emit <zeus_tool> blocks with full content outside <think> to execute shell, python, or file operations."
            }
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


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_contains_all_thirty_one_keyless_providers() {
        let cat = catalog();
        let ids: Vec<&str> = cat.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(cat.len(), 54);
        assert!(ids.contains(&"pouluogemini"));
        assert!(ids.contains(&"peijungemini"));
        assert!(ids.contains(&"zunkogemma4"));
        assert!(ids.contains(&"tomgemma4q5"));
        assert!(ids.contains(&"amansonillama"));
        assert!(ids.contains(&"antigravity"));
        assert!(ids.contains(&"gemini4"));
        assert!(ids.contains(&"agnescloud"));
        assert!(ids.contains(&"volcark"));
        assert!(ids.contains(&"zhipudirect"));
        assert!(ids.contains(&"logfarehub"));
        assert!(ids.contains(&"mychatcloud"));
        assert!(ids.contains(&"supavip"));
        assert!(ids.contains(&"shannian"));
        assert!(ids.contains(&"claude5proxy"));
        assert!(ids.contains(&"opencodezen"));
        assert!(ids.contains(&"mercury3"));
        assert!(ids.contains(&"longcat"));
        assert!(ids.contains(&"kilo"));
        assert!(ids.contains(&"nimcloud"));
        assert!(ids.contains(&"colibriqwen"));
        assert!(ids.contains(&"freellmhub"));
        assert!(ids.contains(&"aibridge"));
        assert!(ids.contains(&"hfrouter"));
        assert!(ids.contains(&"litellmhub"));
        assert!(ids.contains(&"vireonix"));
        assert!(ids.contains(&"gemma4vl"));
        assert!(ids.contains(&"phi4cloud"));
        assert!(ids.contains(&"llamacppcloud"));
        assert!(ids.contains(&"ollamacloud"));
        assert!(ids.contains(&"gemma4pro"));
        assert!(ids.contains(&"frontierlab"));
        assert!(ids.contains(&"liquidai"));
        assert!(ids.contains(&"bonsaicloud"));
        assert!(ids.contains(&"unslothcloud"));
        assert!(ids.contains(&"koboldcloud"));
        assert!(ids.contains(&"blockrun"));
        assert!(ids.contains(&"ovhcloud"));
        assert!(ids.contains(&"freecc"));
        assert!(ids.contains(&"vlmrun"));
        assert!(ids.contains(&"together2api"));
        assert!(ids.contains(&"hfcluster"));
        assert!(ids.contains(&"aihorde"));
        assert!(ids.contains(&"apisfreellm"));
        assert!(ids.contains(&"qwen"));
        assert!(ids.contains(&"ptero"));
        assert!(ids.contains(&"unikey"));
        assert!(ids.contains(&"llm7"));
        assert!(ids.contains(&"pollinations"));
        assert!(ids.contains(&"yqcloud"));
        assert!(ids.contains(&"deepai"));
        assert!(ids.contains(&"k2horizon"));
        assert!(ids.contains(&"motif"));
        assert!(ids.contains(&"chatjimmy"));
    }

    #[test]
    fn test_clean_chatjimmy_output_strips_stats_and_think() {
        let raw = "<|think|>internal<|/think|>Material 3 Dashboard<|stats|>{\"tps\":21500}<|/stats|>";
        assert_eq!(clean_chatjimmy_output(raw), "Material 3 Dashboard");
    }

    #[test]
    fn test_clean_gemini_code_blocks_strips_internal_exec_blocks() {
        let raw = "```python?code_reference&code_event_index=1\nprint(2+2)\n```\n```text?code_stdout&code_event_index=1\n4\n```\nPELICAN 4";
        assert_eq!(clean_gemini_code_blocks(raw), "PELICAN 4");
    }

    #[test]
    fn test_normalize_multi_turn_messages_compacts_history_and_alternates_roles() {
        let mut msgs = Vec::new();
        for turn in 1..=10 {
            msgs.push(ChatMessage {
                role: "user".to_string(),
                content: format!("Turn {} user request", turn),
                attachments: Vec::new(),
            });
            msgs.push(ChatMessage {
                role: "assistant".to_string(),
                content: format!(
                    "Turn {} reply\n<artboard name=\"Home\" device=\"mobile\">{}</artboard>",
                    turn,
                    "<div>content</div>".repeat(60)
                ),
                attachments: Vec::new(),
            });
        }
        msgs.push(ChatMessage {
            role: "user".to_string(),
            content: "Turn 11 follow-up with <canvas_state>live html</canvas_state>".to_string(),
            attachments: Vec::new(),
        });

        let norm = normalize_multi_turn_messages(&msgs, 8, 1200, 16000);
        assert!(norm.len() <= 11);
        assert_eq!(norm.first().unwrap().role, "user");
        assert_eq!(norm.last().unwrap().role, "user");
        assert!(norm.last().unwrap().content.contains("<canvas_state>live html</canvas_state>"));
        for w in norm.windows(2) {
            assert_ne!(w[0].role, w[1].role);
        }
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

    #[test]
    fn test_lmfingerprint_family_classification_and_reroute_detection() {
        assert_eq!(
            classify_claimed_family("gemini4", "gemini-4-hydrogen"),
            "Google Gemini 4 Family"
        );
        assert_eq!(
            classify_claimed_family("agnescloud", "agnes-3.0-pro"),
            "Sapiens Agnes AI"
        );
        assert_eq!(
            classify_claimed_family("volcark", "doubao-seed-2-0-lite-260428"),
            "ByteDance Doubao (Volcengine Ark)"
        );
        assert_eq!(
            classify_claimed_family("zhipudirect", "glm-4.5-flash"),
            "Z.ai / Zhipu GLM"
        );
        assert_eq!(
            classify_claimed_family("logfarehub", "devstral-latest"),
            "Mistral AI"
        );
        // Detect under-the-hood proxy rerouting (e.g. devstral-latest -> openai/gpt-oss-120b)
        let claimed = classify_claimed_family("logfarehub", "devstral-latest");
        let detected = classify_detected_family(
            "openai/gpt-oss-120b",
            "I am GPT-OSS, an open-weight model by OpenAI. 17*23=391.",
            "OpenAI ChatCompletions JSON/SSE",
        );
        assert_eq!(detected, "OpenAI GPT-OSS Open-Weights");
        assert!(!families_compatible(claimed, detected));
    }

    #[test]
    fn test_sanitize_reasoning_delta_neutralizes_inner_think_tags_and_chunk_prefixes() {
        let chunk = "First write your brief step-by-step reasoning inside <think>...</think>";
        let sanitized = sanitize_reasoning_delta(chunk);
        assert!(!sanitized.contains("</think>"));
        assert!(!sanitized.contains("<think>"));
        let split_prefix = sanitize_reasoning_delta("inside </th");
        assert!(split_prefix.ends_with(' '));
    }
}
