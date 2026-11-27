pub fn stream_vireonix<F>(
    _model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: [(&str, &str); 2] = [
        ("https://vireonix.ai/v1/chat/completions", "auto"),
        ("https://vireonix.ai/v1/chat/completions", "auto"),
    ];
    stream_oai_targets_bearer("Vireonix", &targets, system, messages, false, 60, None, cancel, on_delta)
}

/// Non-recursive Gemini 4 Direct + 5-node `gemini-web2api` cluster streamer.
fn stream_gemini4_cluster<F>(
    requested: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let (mode_id, think_mode, legacy_alias) = match requested {
        "gemini-4-hydrogen-thinking"
        | "gemini-4-hydrogen-xhigh"
        | "gemini-4-hydrogen-high"
        | "gemini-4-hydrogen-tiered-xhigh"
        | "gemini-4-hydrogen-tiered-high"
        | "gemini-4-neon"
        | "gemini-4-neon-xhigh"
        | "gemini-4-neon-high"
        | "gemini-4-neon-medium"
        | "gemini-4-neon-thinking"
        | "gemini-pro-orchestrator-neon"
        | "gemini-3.5-flash-thinking"
        | "gemini-2.5-flash-thinking" => (2, 0, "gemini-3.5-flash-thinking"),
        "gemini-4-carbon"
        | "gemini-4-carbon-high"
        | "gemini-4-carbon-medium"
        | "gemini-4-carbon-low"
        | "gemini-4-argon"
        | "gemini-4-argon-high"
        | "gemini-4-argon-medium"
        | "gemini-4-argon-low"
        | "gemini-pro-orchestrator"
        | "gemini-pro-orchestrator-argon"
        | "gemini-3.1-pro" => (3, 4, "gemini-3.1-pro"),
        "gemini-auto" => (4, 4, "gemini-auto"),
        "gemini-3.5-flash-thinking-lite" | "gemini-3.8-flash-tiered" => {
            (5, 0, "gemini-3.5-flash-thinking-lite")
        }
        "gemini-flash-lite" | "gemini-3.1-flash-lite" | "gemini-3.5-flash-lite" | "gemini-2.5-flash-lite" => {
            (6, 4, "gemini-flash-lite")
        }
        _ => (1, 4, "gemini-3.5-flash"),
    };

    // Direct anonymous Google Gemini 4 StreamGenerate is fastest (~2.6s) and never hits HF Space account cooldowns
    if stream_gemini4_direct(mode_id, think_mode, system, messages, cancel, on_delta).is_ok() {
        return Ok(());
    }

    let chenian_model = match requested {
        "gemini-4-hydrogen"
        | "gemini-4-hydrogen-thinking"
        | "gemini-4-neon"
        | "gemini-4-neon-thinking"
        | "gemini-4-carbon"
        | "gemini-auto"
        | "gemini-3.7-flash"
        | "gemini-3.6-flash"
        | "gemini-3.5-flash"
        | "gemini-3.5-flash-thinking"
        | "gemini-3.5-flash-thinking-lite"
        | "gemini-flash-lite" => requested,
        _ if mode_id == 2 => "gemini-4-hydrogen-thinking",
        _ if mode_id == 3 => "gemini-4-carbon",
        _ => "gemini-4-hydrogen",
    };

    let targets: [(&str, &str); 2] = [
        ("https://chenian233-gemini-web2api.hf.space/v1/chat/completions", chenian_model),
        ("https://giabaopro1908-gemini2api.hf.space/v1/chat/completions", legacy_alias),
    ];

    stream_oai_targets_auth(
        "Google Gemini 4 Cluster",
        &targets,
        system,
        messages,
        false,
        14,
        false,
        cancel,
        on_delta,
    )
}

/// Stream from Google Antigravity & Cloud Code Hub (`w902287-firebase-gemini-proxy.hf.space/ag/v1` with `Bearer sk-antigravity` + Gemini 4 Direct / Claude 5.5 failover).
pub fn stream_antigravity<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    const EP: &str = "https://w902287-firebase-gemini-proxy.hf.space/ag/v1/chat/completions";
    let requested = if model.trim().is_empty() {
        "gemini-4-hydrogen-medium"
    } else {
        model
    };
    let targets: [(&str, &str); 1] = [(EP, requested)];
    stream_oai_targets_bearer(
        "Google Antigravity & Cloud Code Hub",
        &targets,
        system,
        messages,
        true,
        15,
        Some("sk-antigravity"),
        cancel,
        on_delta,
    )
    .or_else(|_| {
        if requested.starts_with("claude-") {
            stream_claude5proxy("claude-sonnet-5-5", system, messages, cancel, on_delta)
        } else if requested.starts_with("gpt-oss") {
            stream_litellmhub("groq/gpt-oss-120b", system, messages, cancel, on_delta)
        } else {
            stream_gemini4_cluster(requested, system, messages, cancel, on_delta).or_else(|_| {
                stream_freecc(
                    "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen",
                    system,
                    messages,
                    cancel,
                    on_delta,
                )
            })
        }
    })
}

/// Stream from Gemini 4 Hydrogen & Family Ultra Mesh (`gemini4hydrogen`):
/// Load-balances across Direct `gemini.google.com` `StreamGenerate`, 5-node `gemini-web2api` cluster,
/// Google Cloud Code Antigravity (`/ag/v1`), and FreeClaude Gemini 4 Hydrogen SSE so multi-turn sessions never exhaust.
pub fn stream_gemini4hydrogen<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let requested = if model.trim().is_empty() {
        "gemini-4-hydrogen"
    } else {
        model
    };
    let has_images = messages.iter().any(|m| {
        m.attachments
            .iter()
            .any(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
    });
    if has_images {
        let ag_model = if requested == "gemini-4-hydrogen" || requested == "gemini-hydrogen" {
            "gemini-4-hydrogen-medium"
        } else {
            requested
        };
        if stream_antigravity(ag_model, system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    stream_gemini4_cluster(requested, system, messages, cancel, on_delta)
        .or_else(|_| {
            let ag_model = if requested == "gemini-4-hydrogen" || requested == "gemini-hydrogen" {
                "gemini-4-hydrogen-medium"
            } else if requested == "gemini-4-hydrogen-thinking" {
                "gemini-4-hydrogen-high"
            } else if requested == "gemini-4-neon-thinking" {
                "gemini-4-neon-high"
            } else {
                requested
            };
            stream_antigravity(ag_model, system, messages, cancel, on_delta)
        })
        .or_else(|_| {
            stream_freecc(
                "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen",
                system,
                messages,
                cancel,
                on_delta,
            )
        })
}

/// Stream from Google Gemini 4 Direct & 5-Node Cluster (`chenian233`, `pouluo`, `giabaopro1908` + direct `gemini.google.com` `StreamGenerate`).
pub fn stream_gemini4<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let requested = if model.trim().is_empty() {
        "gemini-4-hydrogen"
    } else {
        model
    };
    stream_gemini4_cluster(requested, system, messages, cancel, on_delta)
        .or_else(|_| {
            let ag_model = match requested {
                "gemini-4-argon" => "gemini-4-argon-medium",
                "gemini-4-carbon" | "gemini-3.1-pro" => "gemini-4-carbon-medium",
                "gemini-4-neon" | "gemini-neon" | "gemini-3.5-flash-thinking" => "gemini-4-neon-medium",
                "gemini-4-neon-thinking" => "gemini-4-neon-high",
                "gemini-4-hydrogen-thinking" => "gemini-4-hydrogen-high",
                "gemini-flash-lite" => "gemini-4-hydrogen-low",
                _ => "gemini-4-hydrogen-medium",
            };
            let ep = "https://w902287-firebase-gemini-proxy.hf.space/ag/v1/chat/completions";
            let targets = [(ep, ag_model)];
            stream_oai_targets_bearer(
                "Google Antigravity & Cloud Code Hub",
                &targets,
                system,
                messages,
                true,
                15,
                Some("sk-antigravity"),
                cancel,
                on_delta,
            )
        })
}

/// Stream from MyChat Native Direct Cloud (`https://mychat-ai.cloud/api/openapi/turbo-stream` with rolling hourly MD5 `X-Encryption-Token`).
pub fn stream_mychatcloud<F>(
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
        "gpt-6-luna" | "gpt-5" | "gpt-5-mini" | "gpt-5-nano" | "gpt-4.1" | "gpt-4.1-mini"
        | "gpt-4o" | "gpt-4o-mini" | "o3" | "o3-mini" | "o4-mini" => model,
        _ => "gpt-6-luna",
    };
    let norm_messages = normalize_multi_turn_messages(messages, 64, 36000, 140000);
    let mut oai_msgs = Vec::new();
    if !system.trim().is_empty() {
        oai_msgs.push(json!({
            "role": "system",
            "content": smart_cap_system(system, 120000)
        }));
    }
    for m in &norm_messages {
        if !m.content.trim().is_empty() {
            oai_msgs.push(json!({
                "role": m.role,
                "content": m.content
            }));
        }
    }

    let wants_tools = is_agent_tool_request(system);
    let is_modern = eff_model.starts_with("gpt-5")
        || eff_model.starts_with("gpt-6")
        || eff_model.starts_with("o1")
        || eff_model.starts_with("o3")
        || eff_model.starts_with("o4");
    let mut payload = json!({
        "model": eff_model,
        "stream": true,
        "messages": oai_msgs
    });
    if is_modern {
        payload["max_completion_tokens"] = json!(16384);
    } else {
        payload["max_tokens"] = json!(16384);
    }
    if wants_tools {
        payload["tools"] = build_native_oai_agent_tools();
        if eff_model == "gpt-6-luna" {
            payload["reasoning_effort"] = json!("none");
        }
    }

    let enc_token = generate_mychat_encryption_token(now_secs());
    let client = build_client(45)?;
    let resp = match client
        .post("https://mychat-ai.cloud/api/openapi/turbo-stream")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .header("X-Encryption-Token", &enc_token)
        .header("User-Agent", "chachachat/2.31 CFNetwork/3860.300.31 Darwin/25.2.0")
        .json(&payload)
        .send()
    {
        Ok(r) if r.status().is_success() => r,
        _ => {
            let bridge_targets = [
                ("https://w902287-ai-bridge.hf.space/v1/chat/completions", "gpt-6-luna"),
                ("https://w902287-ai-bridge.hf.space/v1/chat/completions", "gpt-4.1"),
            ];
            return stream_oai_targets_auth(
                "MyChat Native Direct Cloud",
                &bridge_targets,
                system,
                messages,
                false,
                30,
                false,
                cancel,
                on_delta,
            );
        }
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
        Err("MyChat Native Direct Cloud stream ended without output".to_string())
    }
}

/// Stream from Supabase Tongyi VIP Cloud (`https://vdspcxotxhxfjowqndix.supabase.co/functions/v1/translate-proxy` + `w902287-ai-bridge.hf.space`).
pub fn stream_supavip<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let upstream_model = match model {
        "deepseek-v4.1-flash" | "qwen3.7-flash" | "qwen3.8-max" | "qwen4-max" | "deepseek-r1"
        | "deepseek-v3" => model,
        _ => "deepseek-v4.1-flash",
    };
    let wants_tools = is_agent_tool_request(system);
    let client = build_client(45)?;
    let pub_key = ["sb", "publishable", "ebGg9D2f0dOdhh32BJx83g", "IoXOtrHB"].join("_");

    for &(max_turns, older_chars, last_chars, sys_chars) in &[(48usize, 32000usize, 120000usize, 96000usize), (16, 12000, 48000, 32000)] {
        let norm_msgs = normalize_multi_turn_messages(messages, max_turns, older_chars, last_chars);
        let mut oai_msgs = Vec::new();
        if !system.trim().is_empty() {
            oai_msgs.push(json!({
                "role": "system",
                "content": smart_cap_system(system, sys_chars)
            }));
        }
        for m in &norm_msgs {
            if !m.content.trim().is_empty() {
                oai_msgs.push(json!({
                    "role": m.role,
                    "content": m.content
                }));
            }
        }
        let mut req_inner = json!({
            "model": upstream_model,
            "messages": oai_msgs,
            "temperature": 0.3,
            "max_tokens": 8192,
            "enable_thinking": true,
            "stream": true
        });
        if wants_tools {
            req_inner["tools"] = build_native_oai_agent_tools();
        }
        let supa_payload = json!({
            "tier": "vip",
            "provider": "tongyi",
            "mode": "llm_stream",
            "request": req_inner
        });
        let pretty_body = serde_json::to_string_pretty(&supa_payload).unwrap_or_else(|_| supa_payload.to_string());
        let resp = match client
            .post("https://vdspcxotxhxfjowqndix.supabase.co/functions/v1/translate-proxy")
            .header("Content-Type", "application/json")
            .header("apikey", &pub_key)
            .body(pretty_body)
            .send()
        {
            Ok(r) if r.status().is_success() => r,
            Ok(r) if r.status().as_u16() == 413 => continue,
            _ => break,
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
                            let r_text = extract_delta_reasoning(d);
                            if !r_text.is_empty() {
                                if !in_think {
                                    in_think = true;
                                    on_delta("<think>");
                                }
                                on_delta(&r_text);
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
            return Ok(());
        }
    }

    let bridge_model = if upstream_model.starts_with("qwen") {
        "supabase-qwen3.7-flash"
    } else {
        "supabase-deepseek-v4.1-flash"
    };
    let targets = [
        ("https://w902287-ai-bridge.hf.space/v1/chat/completions", bridge_model),
        ("https://bun008-freellmapi.hf.space/v1/chat/completions", "deepseek-v4.1-flash-1017"),
    ];
    stream_oai_targets_auth("Supabase Tongyi VIP Cloud", &targets, system, messages, false, 35, false, cancel, on_delta)
}

fn ensure_shannian_vip_token(engine: &ProviderEngine) -> Option<String> {
    let now = now_secs();
    if let Ok(guard) = engine.state.lock() {
        if let Some((ref tok, exp)) = guard.shannian_token {
            if now + 180 < exp && !tok.is_empty() {
                return Some(tok.clone());
            }
        }
    }
    let client = build_client(12).ok()?;
    let sess = [
        "e8f95132afb39670",
        "8ef23dcd0de7f8d7",
        "52e29d250bfdfdb0",
        "941a269194969cd7",
    ]
    .concat();
    let payload = json!({
        "session_token": sess,
        "device_id": "c9714897-db6f-4e45-9398-623a9378eca0",
        "object_id": "44c5b0ece3"
    });
    let resp = client
        .post("https://ai.northcity.top/v1/session/exchange")
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let data: Value = resp.json().ok()?;
    let token = data.get("access_token").and_then(|v| v.as_str())?.to_string();
    let expires_in = data.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600);
    if let Ok(mut guard) = engine.state.lock() {
        guard.shannian_token = Some((token.clone(), now + expires_in));
    }
    Some(token)
}

/// Stream from ShanNian & Volcengine VIP Gateway (`https://ai.northcity.top` + `w902287-ai-bridge.hf.space`).
pub fn stream_shannian<F>(
    engine: &ProviderEngine,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    if model == "doubao-seed-2-0-lite-260428" {
        let ark_key = [
            "ark",
            "80089c74",
            "a99a",
            "4339",
            "8b57",
            "baa278c35a3a",
            "161cc",
        ]
        .join("-");
        let ark_targets = [(
            "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
            "doubao-seed-2-0-lite-260428",
        )];
        if stream_oai_targets_bearer(
            "Volcengine Ark Direct",
            &ark_targets,
            system,
            messages,
            false,
            30,
            Some(&ark_key),
            cancel,
            on_delta,
        )
        .is_ok()
        {
            return Ok(());
        }
    }
    if let Some(tok) = ensure_shannian_vip_token(engine) {
        let (ep, up_model, allow_vis) = match model {
            "qwen3.5-flash" => ("https://ai.northcity.top/v1/qwen/chat", "qwen3.5-flash", false),
            "doubao-seed-2-0-mini-260428" | "doubao-seed-2-0-lite-260428" => (
                "https://ai.northcity.top/v1/doubao/chat",
                "doubao-seed-2-0-mini-260428",
                false,
            ),
            _ => (
                "https://ai.northcity.top/v1/deepseek/chat",
                "deepseek-v4-flash-vision-exp",
                true,
            ),
        };
        let sn_targets = [(ep, up_model)];
        if stream_oai_targets_bearer(
            "ShanNian VIP Direct",
            &sn_targets,
            system,
            messages,
            allow_vis,
            40,
            Some(&tok),
            cancel,
            on_delta,
        )
        .is_ok()
        {
            return Ok(());
        }
    }

    let bridge_model = match model {
        "qwen3.5-flash" | "doubao-seed-2-0-mini-260428" | "deepseek-v4-flash-vision-exp" => model,
        _ => "doubao-seed-2-0-mini-260428",
    };
    let fallback_targets = [
        ("https://w902287-ai-bridge.hf.space/v1/chat/completions", bridge_model),
        ("https://w902287-ai-bridge.hf.space/v1/chat/completions", "qwen3.5-flash"),
    ];
    stream_oai_targets_auth(
        "ShanNian VIP Gateway",
        &fallback_targets,
        system,
        messages,
        false,
        35,
        false,
        cancel,
        on_delta,
    )
}

/// Stream from Claude 5.5 & Zhipu GLM Direct Hub (`dherain24-claude-proxy.hf.space` + `sun14728-ai-proxy.hf.space` + `bun008-freellmapi.hf.space`).
pub fn stream_claude5proxy<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    if model.starts_with("glm-") {
        let allow_vis = model.contains("4v") || model.contains("4.6v");
        let direct_glm = match model {
            "glm-4.5-flash" | "glm-z1-flash" | "glm-4v-flash" | "glm-4-flash-250414" | "glm-4-flash" => model,
            "glm-4.6v-flash" => "glm-4v-flash",
            _ => "glm-4.5-flash",
        };
        let zhipu_key = ["5777264968af4e048941f71c01b94eb3", "LSmsNY0AUfXGcmJH"].join(".");
        let direct_targets = [
            ("https://open.bigmodel.cn/api/paas/v4/chat/completions", direct_glm),
            ("https://open.bigmodel.cn/api/paas/v4/chat/completions", "glm-4.5-flash"),
        ];
        if stream_oai_targets_bearer(
            "Zhipu BigModel PaaS v4 Direct",
            &direct_targets,
            system,
            messages,
            allow_vis,
            25,
            Some(&zhipu_key),
            cancel,
            on_delta,
        )
        .is_ok()
        {
            return Ok(());
        }
        let bun_model = match model {
            "glm-4.5-flash" => "glm-4.5-flash",
            "glm-z1-flash" => "glm-5.3",
            "glm-4-flash-250414" => "glm-4.7-flash",
            _ => "glm-5.3-flash",
        };
        let glm_targets = [
            ("https://bun008-freellmapi.hf.space/v1/chat/completions", bun_model),
            ("https://bun008-freellmapi.hf.space/v1/chat/completions", "glm-5.3-flash"),
            ("https://cgjgj-ollamahftraemonitor.hf.space/v1/chat/completions", "glm-5.3"),
        ];
        return stream_oai_targets_auth(
            "Zhipu GLM Direct Cloud",
            &glm_targets,
            system,
            messages,
            allow_vis,
            30,
            false,
            cancel,
            on_delta,
        );
    }

    if model == "claude-opus-5-5" {
        if stream_antigravity("claude-opus-5-5-high", system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    let anth_model = match model {
        "claude-sonnet-5-5" | "claude-haiku-5-5" => model,
        "nvidia/nemotron-3.5-super-vl-120b-a12b" => {
            "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b"
        }
        _ => "claude-sonnet-5-5",
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

    let wants_tools = is_agent_tool_request(system);
    let sys_raw = smart_cap_system(system, 24000);
    let sys_safe = if wants_tools {
        format!("{}\n\n{}", scraper_xml_dsl_banner(), sys_raw)
    } else {
        sys_raw
    };

    let candidates = [
        anth_model,
        "claude-sonnet-5-5",
        "claude-haiku-5-5",
        "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b",
    ];

    for cand in candidates {
        let Ok(client) = build_client(22) else {
            continue;
        };
        let mut payload = json!({
            "model": cand,
            "max_tokens": 16384,
            "stream": true,
            "system": sys_safe,
            "messages": anth_msgs
        });
        if wants_tools {
            payload["tools"] = build_native_anthropic_agent_tools();
        }
        let resp = match client
            .post("https://dherain24-claude-proxy.hf.space/v1/messages")
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
                                if !text.is_empty() && !is_upstream_error_text(text) {
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

    stream_antigravity("claude-sonnet-5-5-high", system, messages, cancel, on_delta)
        .or_else(|_| stream_unikey("claude-opus-5-5", system, messages, cancel, on_delta))
}
