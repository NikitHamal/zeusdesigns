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

    let wants_tools = is_agent_tool_request(system);
    let mut prompt = String::new();
    if wants_tools {
        prompt.push_str(&format!("{}\n\n", scraper_xml_dsl_banner()));
    }
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
        if wants_tools && !last.content.contains("<tool_result") {
            prompt.push_str(&format!("[User]\n{}\n(Output ONLY the <zeus_tool> XML block outside <think> if a tool action is needed.)", last.content));
        } else {
            prompt.push_str(&format!("[User]\n{}", last.content));
        }
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
    let mut seen_summary_thoughts = 0usize;
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
                    let r_extra = delta
                        .get("reasoning_content")
                        .or_else(|| delta.get("reasoning"))
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    if phase == "thinking_summary" {
                        if let Some(items) = delta
                            .get("extra")
                            .and_then(|e| e.get("summary_thought"))
                            .and_then(|s| s.get("content"))
                            .and_then(|c| c.as_array())
                        {
                            for item in items.iter().skip(seen_summary_thoughts) {
                                if let Some(t_str) = item.as_str() {
                                    if !t_str.trim().is_empty() {
                                        if !in_think {
                                            in_think = true;
                                            on_delta("<think>");
                                        }
                                        on_delta(t_str);
                                        on_delta("\n");
                                    }
                                }
                            }
                            seen_summary_thoughts = seen_summary_thoughts.max(items.len());
                        }
                    } else if !r_extra.is_empty() {
                        if !in_think {
                            in_think = true;
                            on_delta("<think>");
                        }
                        on_delta(r_extra);
                    } else if (phase == "think" || phase == "thinking" || phase == "thought") && !content.is_empty() {
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
    let lc_key = ["ak", "20S62c7qo1Lx2tb7fe4ay5Jc2L207"].join("_");
    let direct_targets = [
        ("https://api.longcat.chat/openai/v1/chat/completions", "LongCat-2.5"),
        ("https://api.longcat.chat/openai/v1/chat/completions", "LongCat-2.5-Preview"),
    ];
    if stream_oai_targets_bearer(
        "LongCat Official OpenAI API",
        &direct_targets,
        system,
        messages,
        false,
        35,
        Some(&lc_key),
        cancel,
        on_delta,
    )
    .is_ok()
    {
        return Ok(());
    }

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
    let wants_tools = is_agent_tool_request(system);
    let max_sys = 26000usize.saturating_sub(user_len).max(6000);
    let sys_prefix: String = system.chars().take(max_sys).collect();
    let content = if sys_prefix.trim().is_empty() {
        last_user.chars().take(26000).collect::<String>()
    } else if wants_tools {
        format!("{}\n\n{}\n\n{}\n(Output ONLY the <zeus_tool> XML block outside <think> if a workspace action is needed.)", scraper_xml_dsl_banner(), sys_prefix, last_user)
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

    let resp = match client
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
    {
        Ok(r) if r.status().is_success() => r,
        _ => {
            return stream_unikey("moonshotai/kimi-k3", system, messages, cancel, on_delta)
                .or_else(|_| stream_kilo("reflection/beam-free", system, messages, cancel, on_delta));
        }
    };

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
        stream_unikey("moonshotai/kimi-k3", system, messages, cancel, on_delta)
            .or_else(|_| stream_kilo("reflection/beam-free", system, messages, cancel, on_delta))
    }
}

/// Extract regex-like pattern `"KEY":"VALUE"` from Gemini Web `/app` HTML without regex crate dependency.

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
        let sys_safe = smart_cap_system(system, 120000);
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

    let candidates: Vec<&str> = if has_images {
        vec![
            eff_model,
            "particle-ai/particle-1:free",
            "dots-studio/dots-3-note-preview:free",
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        ]
    } else if eff_model == "kilo-auto/free" || eff_model == "cohere/north-mini-code:free" {
        vec![
            "nvidia/nemotron-3.5-lightning:free",
            "reflection/beam-free",
            "stealth/glyph-cluster",
            "particle-ai/particle-1:free",
        ]
    } else {
        vec![
            eff_model,
            "nvidia/nemotron-3.5-lightning:free",
            "reflection/beam-free",
            "stealth/glyph-cluster",
        ]
    };

    let client = build_client(14)?;
    let mut active_resp = None;
    let wants_tools = is_agent_tool_request(system);
    for cand in candidates {
        let mut cand_payload = json!({
            "model": cand,
            "stream": true,
            "max_tokens": 16384,
            "messages": kilo_msgs
        });
        if wants_tools {
            cand_payload["tools"] = build_native_oai_agent_tools();
        }
        let ip = fake_ipv4();
        if let Ok(r) = client
            .post("https://api.kilo.ai/api/gateway/chat/completions")
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream, application/json")
            .header("X-Forwarded-For", &ip)
            .header("X-Real-IP", &ip)
            .json(&cand_payload)
            .send()
        {
            if r.status().is_success() {
                active_resp = Some(r);
                break;
            }
        }
    }
    let Some(resp) = active_resp else {
        return stream_blockrun("nvidia/nemotron-3.5-lightning", system, messages, cancel, on_delta);
    };

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut in_think = false;
    let mut saw_text = false;
    let mut fallback_reason = String::new();
    let mut streamed_tool_calls: Vec<(String, String, String)> = Vec::new();

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
                        let r_text_owned = extract_delta_reasoning(d);
                        let r_text = r_text_owned.as_str();
                        if !r_text.is_empty() {
                            if !in_think {
                                in_think = true;
                                on_delta("<think>");
                            }
                            on_delta(r_text);
                            fallback_reason.push_str(r_text);
                        }
                        accumulate_oai_tool_calls(d, &mut streamed_tool_calls);
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
    if flush_oai_tool_calls(&streamed_tool_calls, on_delta) {
        saw_text = true;
    }
    if !saw_text && !fallback_reason.trim().is_empty() && !wants_tools {
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

    let eff_model = if !attachments.is_empty() {
        "agnes-2.5-flash:agnes"
    } else {
        match model {
            "agnes-2.5-flash:agnes"
            | "agnes-3.0-flash:agnes"
            | "ising-calibration-1.5-31b:bluesminds"
            | "mimo-v2.6-flash:tokenharbor"
            | "glm-5.3-flash" => model,
            _ => "agnes-2.5-flash:agnes",
        }
    };

    let client = build_client(90)?;
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

    let wants_tools = is_agent_tool_request(system);
    let last_user = messages
        .last()
        .map(|m| m.content.as_str())
        .unwrap_or("");
    let message_text = if system.trim().is_empty() {
        last_user.to_string()
    } else {
        let sys_safe: String = system.chars().take(18000).collect();
        if wants_tools {
            format!("{}\n\n[System instructions: {}]\n\n{}\n(Output ONLY the <zeus_tool> XML tag if a workspace action is needed.)", scraper_xml_dsl_banner(), sys_safe, last_user)
        } else {
            format!("[System instructions: {}]\n\n{}", sys_safe, last_user)
        }
    };

    let payload = json!({
        "message": message_text,
        "model": eff_model,
        "conversation_id": uuid_v4(),
        "history": history,
        "attachments": attachments,
        "github_repo": "",
        "lang": "en",
        "mode": "quick"
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
