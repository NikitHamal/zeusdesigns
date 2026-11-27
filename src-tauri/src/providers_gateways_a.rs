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
        "claude-opus-5-5"
        | "gpt-6.1-sol"
        | "gpt-6-astra"
        | "gpt-6-luna"
        | "deepseek-v4-flash"
        | "moonshotai/kimi-k3"
        | "moonshotai/kimi-k2.7-code"
        | "x-ai/grok-4.3" => model,
        _ => "claude-opus-5-5",
    };

    let wants_tools = is_agent_tool_request(system);
    let mut convo = Vec::new();
    if !system.trim().is_empty() {
        let sys_raw: String = system.chars().take(20000).collect();
        let sys_safe = if wants_tools {
            format!("{}\n\n{}", scraper_xml_dsl_banner(), sys_raw)
        } else {
            sys_raw
        };
        convo.push(json!({ "role": "system", "content": sys_safe }));
    }
    let last_idx = messages.len().saturating_sub(1);
    for (idx, m) in messages.iter().enumerate() {
        if !m.content.trim().is_empty() {
            let content = if idx == last_idx && wants_tools && !m.content.contains("<tool_result") && !m.content.contains("[XML DSL") {
                format!("{}\n(Output ONLY the <zeus_tool> XML block outside <think> if a workspace action is needed.)", m.content)
            } else {
                m.content.clone()
            };
            convo.push(json!({ "role": m.role, "content": content }));
        }
    }

    let candidates = if eff_model == "moonshotai/kimi-k2.7-code" {
        vec!["moonshotai/kimi-k3", "claude-opus-5-5", "gpt-6.1-sol"]
    } else {
        vec![eff_model, "gpt-6.1-sol", "claude-opus-5-5", "gpt-6-luna"]
    };

    let client = build_client(18)?;
    let mut active_resp = None;
    for cand in candidates {
        let cand_payload = json!({
            "model": cand,
            "messages": convo,
            "stream": true
        });
        let ip = fake_ipv4();
        if let Ok(r) = client
            .post("https://www.getunikey.ai/api/anonymous/chat/completions")
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .header("Origin", "https://www.getunikey.ai")
            .header("Referer", "https://www.getunikey.ai/anonymous-chat")
            .header("X-Anonymous-Fingerprint", format!("rnd{}", random_hex(32)))
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
        return match eff_model {
            "claude-opus-5-5" => stream_aibridge("claude-haiku-5-5", system, messages, cancel, on_delta)
                .or_else(|_| stream_deepai("claude-haiku-5-5", system, messages, cancel, on_delta)),
            "moonshotai/kimi-k3" | "moonshotai/kimi-k2.7-code" => {
                stream_freellmhub("kimi-k2.7-code", system, messages, cancel, on_delta)
            }
            "x-ai/grok-4.3" => stream_aibridge("grok-4.20", system, messages, cancel, on_delta),
            "deepseek-v4-flash" => stream_aibridge("deepseek-v4-flash", system, messages, cancel, on_delta)
                .or_else(|_| stream_freellmhub("deepseek-v4.1-flash-1017", system, messages, cancel, on_delta)),
            _ => stream_aibridge("gpt-6-luna", system, messages, cancel, on_delta)
                .or_else(|_| stream_freellmhub("glm-5.3", system, messages, cancel, on_delta)),
        };
    };

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut in_think = false;
    let mut saw_text = false;
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

    let wants_tools = is_agent_tool_request(system);
    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe = smart_cap_system(system, 120000);
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    for m in messages.iter() {
        if !m.content.trim().is_empty() {
            oai_msgs.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let client = build_client(16)?;
    let candidates = vec![eff_model, "codestral-latest", "default"];
    let mut active_resp = None;
    for cand in candidates {
        let mut payload = json!({
            "model": cand,
            "stream": true,
            "max_tokens": 8000,
            "messages": oai_msgs
        });
        if wants_tools {
            payload["tools"] = build_native_oai_agent_tools();
        }
        let ip = fake_ipv4();
        if let Ok(r) = client
            .post("https://api.llm7.io/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer unused")
            .header("X-Forwarded-For", &ip)
            .header("X-Real-IP", &ip)
            .json(&payload)
            .send()
        {
            if r.status().is_success() {
                active_resp = Some(r);
                break;
            }
        }
    }
    let Some(resp) = active_resp else {
        return stream_unikey("gpt-6-luna", system, messages, cancel, on_delta);
    };

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut saw_text = false;
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
                        accumulate_oai_tool_calls(d, &mut streamed_tool_calls);
                        if let Some(text) = d.get("content").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
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
    if flush_oai_tool_calls(&streamed_tool_calls, on_delta) {
        saw_text = true;
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

    let wants_tools = is_agent_tool_request(system);
    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_raw: String = system.chars().take(18000).collect();
        let sys_safe = if wants_tools {
            format!("{}\n\n{}", scraper_xml_dsl_banner(), sys_raw)
        } else {
            sys_raw
        };
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    let last_idx = messages.len().saturating_sub(1);
    for (idx, m) in messages.iter().enumerate() {
        if !m.content.trim().is_empty() {
            let content = if idx == last_idx && wants_tools && !m.content.contains("<tool_result") && !m.content.contains("[XML DSL") {
                format!("{}\n(Output ONLY the <zeus_tool> XML block outside <think> if a workspace action is needed.)", m.content)
            } else {
                m.content.clone()
            };
            oai_msgs.push(json!({ "role": m.role, "content": content }));
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
                        let r_text_owned = extract_delta_reasoning(d);
                        let r_text = r_text_owned.as_str();
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
                                let cleaned_harmony = text
                                    .replace("<|start|>assistant<|channel|>commentary to=zeus_tool", "<zeus_tool")
                                    .replace("to=zeus_tool", "<zeus_tool")
                                    .replace("<|end|>", "")
                                    .replace("<|return|>", "");
                                saw_text = true;
                                on_delta(&cleaned_harmony);
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
                    let cleaned_harmony = text
                        .replace("<|start|>assistant<|channel|>commentary to=zeus_tool", "<zeus_tool")
                        .replace("to=zeus_tool", "<zeus_tool")
                        .replace("<|end|>", "")
                        .replace("<|return|>", "");
                    saw_text = true;
                    on_delta(&cleaned_harmony);
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

/// Stream from BlockRun Gateway (`https://blockrun.ai/api/v1/chat/completions`, zero-key NVIDIA/MiniMax/Poolside/Cohere free pool).
pub fn stream_blockrun<F>(
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
    let eff_model = if has_images {
        match model {
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning" | "nvidia/nemotron-nano-12b-v2-vl" => model,
            _ => "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        }
    } else {
        match model {
            "nvidia/nemotron-3-super-120b"
            | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
            | "nvidia/nemotron-nano-12b-v2-vl"
            | "nvidia/gpt-oss-120b"
            | "nvidia/step-3.7-flash"
            | "nvidia/minimax-m3.1-flash"
            | "nvidia/nemotron-3-ultra-550b"
            | "nvidia/nemotron-3.5-lightning"
            | "nvidia/nemotron-3.5-bolt"
            | "nvidia/muse-glimmer-30b"
            | "nvidia/mistral-nemotron"
            | "poolside/laguna-xs-2.1"
            | "cohere/north-mini-code" => model,
            _ => "nvidia/nemotron-3-super-120b",
        }
    };

    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe = smart_cap_system(system, 120000);
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
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

    let candidates = if has_images {
        vec![
            eff_model,
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
            "nvidia/nemotron-nano-12b-v2-vl",
        ]
    } else {
        vec![
            eff_model,
            "nvidia/nemotron-3.5-lightning",
            "poolside/laguna-xs-2.1",
            "nvidia/nemotron-3.5-bolt",
            "nvidia/nemotron-3-ultra-550b",
        ]
    };

    let wants_tools = is_agent_tool_request(system);
    let client = build_client(12)?;
    let mut active_resp = None;
    for cand in candidates {
        let mut payload = json!({
            "model": cand,
            "stream": true,
            "max_tokens": 16384,
            "messages": oai_msgs
        });
        if wants_tools {
            payload["tools"] = build_native_oai_agent_tools();
        }
        let ip = fake_ipv4();
        if let Ok(r) = client
            .post("https://blockrun.ai/api/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream, application/json")
            .header("X-Forwarded-For", &ip)
            .header("X-Real-IP", &ip)
            .json(&payload)
            .send()
        {
            if r.status().is_success() {
                active_resp = Some(r);
                break;
            }
        }
    }
    let Some(resp) = active_resp else {
        return Err("BlockRun all candidate models unavailable".to_string());
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
        Err("BlockRun stream ended without output".to_string())
    }
}

/// Stream from OVHcloud AI Endpoints (`https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions`, EU keyless frontier & vision models).
pub fn stream_ovhcloud<F>(
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
    let eff_model = if has_images {
        match model {
            "Qwen3.8-27B" | "qwen3-vl-30b-a3b" | "nemotron3-omni-30b" | "Qwen2.5-VL-72B-Instruct" => model,
            _ => "Qwen2.5-VL-72B-Instruct",
        }
    } else {
        match model {
            "DeepSeek-V4.1-Flash-1017"
            | "Qwen3.8-27B"
            | "Qwen3.5-397B-A17B"
            | "qwen3-vl-30b-a3b"
            | "nemotron3-omni-30b"
            | "Qwen2.5-VL-72B-Instruct"
            | "qwen3.6-35b-a3b"
            | "Qwen3.6-27B"
            | "gemma-4-26b-a4b"
            | "laguna-xs-2.1"
            | "nemotron3-nano-30b"
            | "gpt-oss-120b"
            | "gpt-oss-20b"
            | "Meta-Llama-3_3-70B-Instruct"
            | "Mistral-Small-3.2-24B-Instruct-2506" => model,
            _ => "DeepSeek-V4.1-Flash-1017",
        }
    };

    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe = smart_cap_system(system, 120000);
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
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

    let client = build_client(18)?;
    let candidates = if has_images {
        vec![
            eff_model,
            "qwen3-vl-30b-a3b",
            "nemotron3-omni-30b",
            "Qwen3.8-27B",
            "Qwen2.5-VL-72B-Instruct",
        ]
    } else {
        vec![
            eff_model,
            "qwen3.6-35b-a3b",
            "Qwen3.6-27B",
            "gemma-4-26b-a4b",
            "laguna-xs-2.1",
            "nemotron3-nano-30b",
            "gpt-oss-20b",
        ]
    };
    let wants_tools = is_agent_tool_request(system);
    let mut active_resp = None;
    for cand in candidates {
        let mut cand_payload = json!({
            "model": cand,
            "stream": true,
            "max_tokens": 16384,
            "messages": oai_msgs
        });
        if wants_tools {
            cand_payload["tools"] = build_native_oai_agent_tools();
        }
        let ip = fake_ipv4();
        if let Ok(r) = client
            .post("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions")
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
        return Err("OVHcloud all candidate models rate-limited or unavailable".to_string());
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
        Err("OVHcloud stream ended without output".to_string())
    }
}

/// Stream from APIsFreeLLM (`https://api.apisfreellm.com/v1/chat/completions`, 10,000 req/day zero-key OpenAI stream).
pub fn stream_apisfreellm<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let eff_model = if model.is_empty() { "free-ai" } else { model };
    let wants_tools = is_agent_tool_request(system);
    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_raw: String = system.chars().take(18000).collect();
        let sys_safe = if wants_tools {
            format!("{}\n\n{}", scraper_xml_dsl_banner(), sys_raw)
        } else {
            sys_raw
        };
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    let last_idx = messages.len().saturating_sub(1);
    for (idx, m) in messages.iter().enumerate() {
        if !m.content.trim().is_empty() {
            let content = if idx == last_idx && wants_tools && !m.content.contains("<tool_result") && !m.content.contains("[XML DSL") {
                format!("{}\n(Output ONLY the <zeus_tool> XML block outside <think> if a workspace action is needed.)", m.content)
            } else {
                m.content.clone()
            };
            oai_msgs.push(json!({ "role": m.role, "content": content }));
        }
    }

    let payload = json!({
        "model": eff_model,
        "stream": true,
        "messages": oai_msgs
    });

    let client = build_client(180)?;
    let resp = client
        .post("https://api.apisfreellm.com/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .json(&payload)
        .send()
        .map_err(|e| format!("APIsFreeLLM request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("APIsFreeLLM HTTP {}", resp.status()));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut saw_text = false;
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
                        accumulate_oai_tool_calls(d, &mut streamed_tool_calls);
                        if let Some(text) = d.get("content").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
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
    if flush_oai_tool_calls(&streamed_tool_calls, on_delta) {
        saw_text = true;
    }
    if saw_text {
        Ok(())
    } else {
        Err("APIsFreeLLM stream ended without output".to_string())
    }
}
