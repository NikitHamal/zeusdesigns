pub fn stream_freecc<F>(
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
            "claude-3-freecc-no-thinking/gemini/models/gemini-3.5-flash"
            | "claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview"
            | "claude-3-freecc-no-thinking/gemini/models/gemini-3.1-flash-lite"
            | "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b" => model,
            _ => "claude-3-freecc-no-thinking/gemini/models/gemini-3.5-flash",
        }
    } else {
        match model {
            "gemini-4-hydrogen" => "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen",
            "gemini-3.5-flash" => "claude-3-freecc-no-thinking/gemini/models/gemini-3.5-flash",
            "gemini-3-flash-preview" => "claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview",
            "claude-3-freecc-no-thinking/gemini/models/gemini-3.5-flash"
            | "claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview"
            | "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen"
            | "claude-3-freecc-no-thinking/nvidia_nim/stepfun-ai/step-5-preview"
            | "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b"
            | "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
            | "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b"
            | "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b"
            | "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-bolt-e4b"
            | "claude-3-freecc-no-thinking/nvidia_nim/poolside/laguna-xs-2.1" => model,
            _ => "claude-3-freecc-no-thinking/gemini/models/gemini-3.5-flash",
        }
    };

    let hosts: &[&str] = if eff_model.contains("kimi-k3.1-pro") {
        &[
            "https://dherain24-claude-proxy.hf.space",
            "https://calkotter-free-claude-code.hf.space",
        ]
    } else if eff_model.contains("/gemini/") {
        &["https://calkotter-free-claude-code.hf.space"]
    } else {
        &[
            "https://calkotter-free-claude-code.hf.space",
            "https://dherain24-claude-proxy.hf.space",
        ]
    };

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

    if !has_images && eff_model.contains("/gemini/") {
        let gem4_id = if eff_model.contains("gemini-4-hydrogen") {
            "gemini-4-hydrogen"
        } else if eff_model.contains("gemini-4-carbon") {
            "gemini-4-carbon"
        } else if eff_model.contains("gemini-4-neon") {
            "gemini-4-neon"
        } else if eff_model.contains("gemini-4-argon") {
            "gemini-4-argon"
        } else {
            "gemini-4-hydrogen"
        };
        if stream_gemini4(gem4_id, system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    let wants_tools = is_agent_tool_request(system);
    let sys_safe = smart_cap_system(system, 120000);
    let mut candidate_routes: Vec<(&str, &str, u64)> = Vec::new();
    for &h in hosts {
        let t_secs = if eff_model.contains("/gemini/") || eff_model.contains("kimi-k3.1-pro") || eff_model.contains("step-5") {
            6
        } else {
            16
        };
        if !eff_model.contains("/gemini/") {
            candidate_routes.push((h, eff_model, t_secs));
        }
    }
    candidate_routes.push((
        "https://dherain24-claude-proxy.hf.space",
        "claude-sonnet-5-5",
        16,
    ));
    candidate_routes.push((
        "https://dherain24-claude-proxy.hf.space",
        "claude-haiku-5-5",
        14,
    ));
    candidate_routes.push((
        "https://dherain24-claude-proxy.hf.space",
        "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b",
        16,
    ));
    candidate_routes.push((
        "https://dherain24-claude-proxy.hf.space",
        "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b",
        14,
    ));
    candidate_routes.push((
        "https://calkotter-free-claude-code.hf.space",
        "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-bolt-e4b",
        14,
    ));
    candidate_routes.push((
        "https://calkotter-free-claude-code.hf.space",
        "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b",
        18,
    ));

    for (host, route_model, timeout_secs) in candidate_routes {
        let Ok(client) = build_client(timeout_secs) else {
            continue;
        };
        let mut payload = json!({
            "model": route_model,
            "max_tokens": 16384,
            "stream": true,
            "system": sys_safe,
            "messages": anth_msgs
        });
        if wants_tools {
            payload["tools"] = build_native_anthropic_agent_tools();
        }
        let resp = match client
            .post(format!("{}/v1/messages", host))
            .header("Content-Type", "application/json")
            .header("x-api-key", "free")
            .header("anthropic-version", "2023-06-01")
            .json(&payload)
            .send()
        {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
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
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    accumulate_anthropic_tool_use(&ev, &mut streamed_tool_calls);
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
            return Ok(());
        }
    }
    Err("FreeClaude & Gemini 4 stream ended without output".to_string())
}

/// Stream from HF Frontier Cluster (`apathy-exe-qwen3-8-27b`, `wanyamaelis-qwen3-8-27b`, `agrawal-prateek-gemma4-e4b`, `amirkazim-qwen-7b-chat`, `rabu1234-gemma-4-e2b`).
pub fn stream_hfcluster<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "gemma-4-e4b-q5" => &[
            (
                "https://amirkazim-qwen-7b-chat.hf.space/v1/chat/completions",
                "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q5_K_P.gguf",
            ),
            (
                "https://agrawal-prateek-gemma4-e4b-ablitereted-server.hf.space/v1/chat/completions",
                "gemma4-e4b",
            ),
        ],
        "gemma-4-e2b-q8" => &[
            (
                "https://rabu1234-gemma-4-e2b-it-gguf.hf.space/v1/chat/completions",
                "gemma-4-e2b-it-Q8_0.gguf",
            ),
            (
                "https://agrawal-prateek-gemma4-e4b-ablitereted-server.hf.space/v1/chat/completions",
                "gemma4-e4b",
            ),
        ],
        _ => &[
            (
                "https://apathy-exe-qwen3-8-27b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-GGUF/snapshots/4af51b3542f775b0a8e4b310bfb3f17e01c306c9/Qwen3.8-27B-UD-Q8_K_XL.gguf",
            ),
            (
                "https://wanyamaelis-qwen3-8-27b.hf.space/v1/chat/completions",
                "/home/user/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-GGUF/snapshots/4af51b3542f775b0a8e4b310bfb3f17e01c306c9/Qwen3.8-27B-UD-Q8_K_XL.gguf",
            ),
            (
                "https://amirkazim-qwen-7b-chat.hf.space/v1/chat/completions",
                "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q5_K_P.gguf",
            ),
        ],
    };

    stream_oai_targets("HF Frontier Cluster", targets, system, messages, false, 90, cancel, on_delta)
}

/// Stream from VLM Run Gateway (`https://gateway.vlm.run/v1/openai/chat/completions`, zero-key DiffusionGemma 26B A4B VL / Qwen 3.5 VL / GLM-OCR).
pub fn stream_vlmrun<F>(
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
    let eff_model = match model {
        "google/diffusiongemma-26b-a4b-it" | "qwen/qwen3.5-0.8b" => model,
        "zai-org/glm-ocr" if has_images => "zai-org/glm-ocr",
        _ => "google/diffusiongemma-26b-a4b-it",
    };

    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() && eff_model != "zai-org/glm-ocr" {
        let sys_safe: String = system.chars().take(24000).collect();
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

    let payload = json!({
        "model": eff_model,
        "stream": true,
        "max_tokens": 8192,
        "messages": oai_msgs
    });

    let client = build_client(180)?;
    let resp = client
        .post("https://gateway.vlm.run/v1/openai/chat/completions")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .json(&payload)
        .send()
        .map_err(|e| format!("VLM Run request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("VLM Run HTTP {}", resp.status()));
    }

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
        Err("VLM Run stream ended without output".to_string())
    }
}

/// Stream from Together Frontier (`https://lolmaobruhhh-test.hf.space/v1/chat/completions`, zero-key GLM 5.3 / Kimi K3 / Muse Glimmer 30B / GPT-OSS 120B).
pub fn stream_together2api<F>(
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
        "glm-5.3" | "glm-5.3-flash" | "kimi-k3" | "muse-glimmer-30b" | "gpt-oss-120b" | "glm-5.2" | "qwen3.5-9b" => model,
        _ => "glm-5.3",
    };

    let wants_tools = is_agent_tool_request(system);
    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe = smart_cap_system(system, 120000);
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    for m in messages {
        if !m.content.trim().is_empty() {
            oai_msgs.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let mut payload = json!({
        "model": eff_model,
        "stream": true,
        "max_tokens": 16384,
        "messages": oai_msgs
    });
    if wants_tools {
        payload["tools"] = build_native_oai_agent_tools();
    }

    let client = build_client(60)?;
    let resp = match client
        .post("https://lolmaobruhhh-test.hf.space/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .json(&payload)
        .send()
    {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => return Err(format!("Together Frontier HTTP {}", r.status())),
        Err(e) => return Err(format!("Together Frontier request failed: {}", e)),
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
                            if text.contains("[proxy error:") {
                                return fallback(eff_model, system, messages, cancel, on_delta);
                            }
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
    if !saw_text && !fallback_reason.trim().is_empty() {
        on_delta(fallback_reason.trim());
        saw_text = true;
    }
    if saw_text {
        Ok(())
    } else {
        Err("Together Frontier stream ended without output".to_string())
    }
}

/// Stream from AI Horde (`https://oai.aihorde.net/v1/chat/completions`, anonymous `0000000000` bearer distributed worker pool).
pub fn stream_aihorde<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let eff_model = if model.trim().is_empty() {
        "Qwen/Qwen3.8-Flash-Next"
    } else {
        model
    };

    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        let sys_safe: String = system.chars().take(16000).collect();
        oai_msgs.push(json!({ "role": "system", "content": sys_safe }));
    }
    for m in messages {
        if !m.content.trim().is_empty() {
            oai_msgs.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let payload = json!({
        "model": eff_model,
        "max_tokens": 4096,
        "messages": oai_msgs
    });

    let client = build_client(120)?;
    let resp = client
        .post("https://oai.aihorde.net/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer 0000000000")
        .json(&payload)
        .send()
        .map_err(|e| format!("AI Horde request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("AI Horde HTTP {}", resp.status()));
    }
    if cancel.load(Ordering::Relaxed) {
        return Ok(());
    }

    let data: Value = resp
        .json()
        .map_err(|e| format!("AI Horde JSON decode error: {}", e))?;
    let text = data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .trim();

    if text.is_empty() {
        return Err("AI Horde returned empty completion".to_string());
    }
    on_delta(text);
    Ok(())
}

/// Stream from Gemma 4 Flagship Cluster (`markpaulm-gemma-4-31b-it-abliterated`, `markpaulm-gemma-4-12b-abliterated`, `shanghsin-gemma-4-12b`, `rikunarita-gemma-4-e4b-it-gguf-ud-q5-k-xl`, `hispa-nico-gemma4-e2b`, `ismizo-gemma4`).
pub fn stream_gemma4pro<F>(
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

    let targets: &[(&str, &str)] = if has_images || model == "gemma-4-e4b-ud-q5" {
        &[
            (
                "https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions",
                "/models/gemma-4-E4B-it-Q4_K_M.gguf",
            ),
            (
                "https://hispa-nico-gemma4-e2b.hf.space/v1/chat/completions",
                "huihui-ai/Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0",
            ),
            (
                "https://mikeee-gemma-4-e4b-uncensored-hauhaucs-aggressive-q5-k-p.hf.space/v1/chat/completions",
                "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q5_K_P.gguf",
            ),
        ]
    } else {
        match model {
            "gemma-4-e4b-qat" => &[
                (
                    "https://hispa-nico-gemma4-e2b.hf.space/v1/chat/completions",
                    "huihui-ai/Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0",
                ),
                (
                    "https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions",
                    "/models/gemma-4-E4B-it-Q4_K_M.gguf",
                ),
            ],
            _ => &[
                (
                    "https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions",
                    "/models/gemma-4-E4B-it-Q4_K_M.gguf",
                ),
                (
                    "https://hispa-nico-gemma4-e2b.hf.space/v1/chat/completions",
                    "huihui-ai/Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0",
                ),
                (
                    "https://elseodelasgalletas-gemma4-e2b.hf.space/v1/chat/completions",
                    "unsloth/gemma-4-E2B-it-GGUF:UD-Q4_K_XL",
                ),
            ],
        }
    };

    stream_oai_targets("Gemma 4 Flagship Cluster", targets, system, messages, true, 22, cancel, on_delta)
}

/// Stream from Frontier Open-Weights Lab (`bananamort-inkling-2-mini`, `apathy-exe-qwen3-8-flash-next`, `apathy-exe-nanbeige4-3-33b`, `apathy-exe-muse-glimmer-30b`, `apathy-exe-xing4-0-29b-a4b`, `usermma-mellum2-12b-a2-5b-thinking-abliterated`, `usermma-minicpm5-abliterated-q3`).
pub fn stream_frontierlab<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "inkling-2-mini" => &[
            (
                "https://bananamort-inkling-2-mini.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--unsloth--Inkling-2-Mini-GGUF/snapshots/45fd08764f2b0bf16b03a5483a80e5c7aaec8772/Inkling-2-Mini-UD-Q4_K_XL.gguf",
            ),
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
        ],
        "nanbeige4.3-33b" => &[
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
            (
                "https://apathy-exe-nanbeige4-3-33b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--bartowski--Nanbeige_Nanbeige4.3-33B-GGUF/snapshots/9beb68421fdf7be095093a6888325fa2c83ddd38/Nanbeige_Nanbeige4.3-33B-Q4_K_M.gguf",
            ),
        ],
        "muse-glimmer-30b" => &[
            (
                "https://apathy-exe-muse-glimmer-30b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--meta-models--Muse-Glimmer-30B-GGUF/snapshots/b44f1072cf75e918a1b82a3a17b45c4389b076e7/Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf",
            ),
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
        ],
        "xing4.0-29b-a4b" => &[
            (
                "https://apathy-exe-xing4-0-29b-a4b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--XingChen-AGI--Xing4.0-29B-A4B-GGUF/snapshots/006904bc1d05ae2c37f938a4abdffee27e488544/xing4_0-29b-IQ4_NL.gguf",
            ),
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
        ],
        "mellum2-12b-thinking" => &[
            (
                "https://usermma-mellum2-12b-a2-5b-thinking-abliterated.hf.space/v1/chat/completions",
                "Mellum2-12B-A2.5B-Thinking-Abliterated-Q6_K.gguf",
            ),
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
        ],
        "nanbeige4.2-3b" => &[
            (
                "https://apathy-exe-nanbeige4-2-3b.hf.space/v1/chat/completions",
                "/app/nanbeige4.2-3b-Q4_K_M.gguf",
            ),
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
        ],
        "minicpm5-1b" => &[
            (
                "https://usermma-minicpm5-abliterated-q3.hf.space/v1/chat/completions",
                "Huihui-MiniCPM5-1B-abliterated.Q3_K_L.gguf",
            ),
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
        ],
        _ => &[
            (
                "https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf",
            ),
            (
                "https://bananamort-inkling-2-mini.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--unsloth--Inkling-2-Mini-GGUF/snapshots/45fd08764f2b0bf16b03a5483a80e5c7aaec8772/Inkling-2-Mini-UD-Q4_K_XL.gguf",
            ),
            (
                "https://apathy-exe-nanbeige4-3-33b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--bartowski--Nanbeige_Nanbeige4.3-33B-GGUF/snapshots/9beb68421fdf7be095093a6888325fa2c83ddd38/Nanbeige_Nanbeige4.3-33B-Q4_K_M.gguf",
            ),
        ],
    };

    stream_oai_targets("Frontier Open-Weights Lab", targets, system, messages, false, 90, cancel, on_delta)
}

/// Stream from Liquid AI LFM Gateway (`apathy-exe-lfm2-5-24b-a2b`, `apathy-exe-lfm3-1-7b`, `l0d0v1c-lfm3-1-7b`, `apathy-exe-lfm2-5-2-6b`).
pub fn stream_liquidai<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "lfm2.5-8b-a1b" => &[
            (
                "https://usermma-lfm2-5-8b-a1b-abliterated-q3.hf.space/v1/chat/completions",
                "Huihui-LFM2.5-8B-A1B-abliterated.Q4_K_M.gguf",
            ),
            (
                "https://apathy-exe-lfm2-5-24b-a2b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--unsloth--LFM2.5-24B-A2B-GGUF/snapshots/aacc77834f6aa568c93b4dbd6d295059736be98c/LFM2.5-24B-A2B-Q8_0.gguf",
            ),
        ],
        "lfm3-1.7b" => &[
            (
                "https://apathy-exe-lfm3-1-7b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--LiquidAI--LFM3-1.7B-GGUF/snapshots/cd0c74c575b5c416f3011b5b4c298077f26ca8c2/LFM3-1.7B-QAD-Q4_0.gguf",
            ),
            (
                "https://l0d0v1c-lfm3-1-7b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--LiquidAI--LFM3-1.7B-GGUF/snapshots/cd0c74c575b5c416f3011b5b4c298077f26ca8c2/LFM3-1.7B-QAD-Q4_0.gguf",
            ),
        ],
        "lfm2.5-2.6b" => &[
            (
                "https://apathy-exe-lfm2-5-2-6b.hf.space/v1/chat/completions",
                "/LFM2.5-2.6B-Q4_K_M.gguf",
            ),
            (
                "https://apathy-exe-lfm2-5-24b-a2b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--unsloth--LFM2.5-24B-A2B-GGUF/snapshots/aacc77834f6aa568c93b4dbd6d295059736be98c/LFM2.5-24B-A2B-Q8_0.gguf",
            ),
        ],
        _ => &[
            (
                "https://apathy-exe-lfm2-5-24b-a2b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--unsloth--LFM2.5-24B-A2B-GGUF/snapshots/aacc77834f6aa568c93b4dbd6d295059736be98c/LFM2.5-24B-A2B-Q8_0.gguf",
            ),
            (
                "https://apathy-exe-lfm3-1-7b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--LiquidAI--LFM3-1.7B-GGUF/snapshots/cd0c74c575b5c416f3011b5b4c298077f26ca8c2/LFM3-1.7B-QAD-Q4_0.gguf",
            ),
        ],
    };

    stream_oai_targets("Liquid AI LFM Gateway", targets, system, messages, false, 90, cancel, on_delta)
}

/// Stream from KoboldAI Multi-Node Cloud (`nxdev-org-koboldcpp-tiefighter`, `koboldai-koboldcpp-tiefighter`, `nanoph-koboldcpp-tiefighter`).
pub fn stream_koboldcloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "koboldcpp/gemma-2-9b-it-Q5_K_M" => &[
            (
                "https://nxdev-org-koboldcpp-tiefighter.hf.space/v1/chat/completions",
                "koboldcpp/gemma-3n-E2B-it",
            ),
            (
                "https://nanoph-koboldcpp-tiefighter.hf.space/v1/chat/completions",
                "koboldcpp/gemma-2-9b-it-Q5_K_M",
            ),
            (
                "https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions",
                "/models/gemma-4-E4B-it-Q4_K_M.gguf",
            ),
        ],
        _ => &[
            (
                "https://nxdev-org-koboldcpp-tiefighter.hf.space/v1/chat/completions",
                "koboldcpp/gemma-3n-E2B-it",
            ),
            (
                "https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions",
                "/models/gemma-4-E4B-it-Q4_K_M.gguf",
            ),
            (
                "https://koboldai-koboldcpp-tiefighter.hf.space/v1/chat/completions",
                "koboldcpp/Gemma4-E2B",
            ),
        ],
    };

    stream_oai_targets("KoboldAI Multi-Node Cloud", targets, system, messages, false, 20, cancel, on_delta)
}

/// Stream from Bonsai & Ternary Frontier (`bananamort-ternary-bonsai-2-27b`, `mikeee-bonsai-8b`, `mikeee-llama-cpp-server`).
pub fn stream_bonsaicloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "bonsai-8b" => &[
            ("https://mikeee-bonsai-8b.hf.space/v1/chat/completions", "bonsai-8b"),
            (
                "https://bananamort-ternary-bonsai-2-27b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--prism-ml--Ternary-Bonsai-2-27B-gguf/snapshots/839bd57023c1558945afea70a74fa83c054f35f9/Ternary-Bonsai-2-27B-PTQ1_0.gguf",
            ),
        ],
        "vibethinker-3b-q4" => &[
            ("https://mikeee-llama-cpp-server.hf.space/v1/chat/completions", "vibethinker-3b-q4"),
            ("https://mikeee-bonsai-8b.hf.space/v1/chat/completions", "bonsai-8b"),
        ],
        _ => &[
            (
                "https://bananamort-ternary-bonsai-2-27b.hf.space/v1/chat/completions",
                "/root/.cache/huggingface/hub/models--prism-ml--Ternary-Bonsai-2-27B-gguf/snapshots/839bd57023c1558945afea70a74fa83c054f35f9/Ternary-Bonsai-2-27B-PTQ1_0.gguf",
            ),
            ("https://mikeee-bonsai-8b.hf.space/v1/chat/completions", "bonsai-8b"),
            ("https://mikeee-llama-cpp-server.hf.space/v1/chat/completions", "vibethinker-3b-q4"),
        ],
    };

    stream_oai_targets("Bonsai & Ternary Frontier", targets, system, messages, false, 90, cancel, on_delta)
}

/// Stream from Unsloth Qwen 3.5 & Gemma 4 Cloud (`bleak-openai-compatible-server`, `elseodelasgalletas-gemma4-e2b`, `elseodelasgalletas-gemma4-e2b-qat`, `bleak-openai-compatible-server-gemma4`).
pub fn stream_unslothcloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "gemma-4-e2b-ud-q4" => &[
            (
                "https://elseodelasgalletas-gemma4-e2b.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-GGUF:UD-Q4_K_XL",
            ),
            (
                "https://bleak-openai-compatible-server.hf.space/v1/chat/completions",
                "unsloth/Qwen3.5-4B-GGUF:Q6_K",
            ),
        ],
        "gemma-4-e2b-qat-ud" => &[
            (
                "https://elseodelasgalletas-gemma4-e2b-qat.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL",
            ),
            (
                "https://elseodelasgalletas-gemma4-e2b.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-GGUF:UD-Q4_K_XL",
            ),
        ],
        "gemma-4-e2b-q4ks" => &[
            (
                "https://bleak-openai-compatible-server-gemma4.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-GGUF:Q4_K_S",
            ),
            (
                "https://elseodelasgalletas-gemma4-e2b.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-GGUF:UD-Q4_K_XL",
            ),
        ],
        _ => &[
            (
                "https://elseodelasgalletas-gemma4-e2b.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-GGUF:UD-Q4_K_XL",
            ),
            (
                "https://bleak-openai-compatible-server-gemma4.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-GGUF:Q4_K_S",
            ),
            (
                "https://elseodelasgalletas-gemma4-e2b-qat.hf.space/v1/chat/completions",
                "unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL",
            ),
        ],
    };

    stream_oai_targets("Unsloth Qwen 3.5 & Gemma 4 Cloud", targets, system, messages, false, 16, cancel, on_delta)
}
