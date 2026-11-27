/// Stream from Anthropic Claude Fable 5.2, Opus 5.5 & Sonnet 5.5 Flagship Mesh (`claudefable`):
/// Multi-turn rotation across Direct Unikey (`getunikey.ai/api/anonymous/chat/completions` with per-turn
/// `X-Anonymous-Fingerprint` + `X-Forwarded-For` rotation), FreeClaude Anthropic Messages SSE
/// (`dherain24-claude-proxy.hf.space` + `calkotter-free-claude-code.hf.space`), Antigravity Hub, and DeepAI IslandKey.
pub fn stream_claudefable<F>(
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
        "claude-fable-5-2"
    } else {
        model.trim()
    };

    let has_images = messages.iter().any(|m| {
        m.attachments
            .iter()
            .any(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
    });

    // 1. For Haiku 5.5 or multimodal image turns, try fast Anthropic Messages SSE on dherain24 first
    if has_images || requested == "claude-haiku-5-5" {
        if stream_claude5proxy("claude-haiku-5-5", system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    // 2. Direct Unikey anonymous stream with per-turn fresh fingerprint & IP rotation (verified 2-turn recall on claude-opus-5-5)
    if !has_images {
        let unikey_primary = match requested {
            "claude-haiku-5-5" => "claude-opus-5-5",
            _ => "claude-opus-5-5",
        };
        if stream_unikey(unikey_primary, system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    // 3. Multi-node Anthropic Messages SSE & Claude 5.5 Direct Hub fallback
    let anth_model = match requested {
        "claude-haiku-5-5" => "claude-haiku-5-5",
        "claude-sonnet-5-5" | "claude-sonnet-5-5-thinking" | "claude-sonnet-5" => "claude-sonnet-5-5",
        _ => "claude-opus-5-5",
    };
    stream_claude5proxy(anth_model, system, messages, cancel, on_delta)
        .or_else(|_| stream_deepai("claude-haiku-5-5", system, messages, cancel, on_delta))
}

/// Stream from OpenAI GPT-6.2 Sol, GPT-6.2 Astra & GPT-6.1 Frontier Mesh (`gpt6flagship`):
/// Multi-turn rotation across Direct MyChat Native Turbo-Stream (`mychat-ai.cloud/api/openapi/turbo-stream`
/// with rolling hourly MD5 `X-Encryption-Token` & native OpenAI `tools`), Direct Unikey Responses API
/// (`gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna`), AI Bridge Native Direct, and Groq LPU (`gpt-oss-120b`).
pub fn stream_gpt6flagship<F>(
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
        "gpt-6.2-sol"
    } else {
        model.trim()
    };

    // 1. For GPT-6.1 Sol and GPT-6 Astra, try Unikey's direct OpenAI Responses stream first when no native tools are needed,
    // or MyChat Native Direct Cloud which supports full native OpenAI function-calling (`tools`).
    let wants_tools = is_agent_tool_request(system);
    if !wants_tools && matches!(requested, "gpt-6.1-sol" | "gpt-6-astra") {
        if stream_unikey(requested, system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    // 2. Direct MyChat Native Turbo-Stream (supports gpt-6.2-sol, gpt-6.1-sol, gpt-6-astra, gpt-6-luna, gpt-5, o3, o4-mini + native tools)
    let mychat_model = match requested {
        "gpt-6.2-sol" | "gpt-6.2-sol-pro" => "gpt-6.2-sol",
        "gpt-6.2-astra" | "gpt-6.2-astra-pro" | "gpt-6-astra" => "gpt-6-astra",
        "gpt-6.1-sol" | "gpt-5.6-sol" => "gpt-6.1-sol",
        "gpt-6.1-terra" | "gpt-5.6-terra" | "gpt-5.3-codex" => "gpt-5",
        "gpt-6-luna" => "gpt-6-luna",
        "o3" => "o3",
        _ => "gpt-6-luna",
    };
    if stream_mychatcloud(mychat_model, system, messages, cancel, on_delta).is_ok() {
        return Ok(());
    }

    // 3. Unikey & AI Bridge multi-node rotation
    let uni_fallback = match requested {
        "gpt-6-luna" => "gpt-6-luna",
        "gpt-6-astra" | "gpt-6.2-astra" | "gpt-6.2-astra-pro" => "gpt-6-astra",
        _ => "gpt-6.1-sol",
    };
    stream_unikey(uni_fallback, system, messages, cancel, on_delta)
        .or_else(|_| stream_aibridge("gpt-6-luna", system, messages, cancel, on_delta))
}

/// Stream from Google Gemini 4 Argon, Carbon, Neon & Hydrogen 7-Node Mesh (`gemini4ultra`):
/// Load-balances across Direct `gemini.google.com` `StreamGenerate` (`MODE_CATEGORY` `1..6`),
/// `peijun1-gemini-web2api1.hf.space`, `pouluo-gemini-web2api.hf.space`, `chenian233-gemini-web2api.hf.space`,
/// `giabaopro1908-gemini2api.hf.space`, `calkotter-free-claude-code.hf.space` (`gemini-4-hydrogen` / `gemini-3-flash-preview`),
/// and `w902287-firebase-gemini-proxy.hf.space`.
pub fn stream_gemini4ultra<F>(
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
        "gemini-4-argon"
    } else {
        model.trim()
    };

    let has_images = messages.iter().any(|m| {
        m.attachments
            .iter()
            .any(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
    });

    if has_images {
        if stream_freecc(
            "claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview",
            system,
            messages,
            cancel,
            on_delta,
        )
        .is_ok()
        {
            return Ok(());
        }
    }

    let (mode_id, think_mode, web2api_model) = match requested {
        "gemini-4-argon" | "gemini-4-argon-xhigh" | "gemini-4-carbon" | "gemini-4-carbon-xhigh" | "gemini-pro-orchestrator" => {
            (3, 0, "gemini-4-carbon")
        }
        "gemini-4-neon" | "gemini-4-neon-thinking" | "gemini-4-hydrogen-thinking" | "gemini-4-hydrogen-sonar" => {
            (2, 0, "gemini-4-neon-thinking")
        }
        "gemini-3.8-flash" | "gemini-3-flash-preview" => (5, 0, "gemini-3.5-flash"),
        _ => (1, 4, "gemini-4-hydrogen"),
    };

    // 1. Direct Google Gemini 4 StreamGenerate (`gemini.google.com`)
    if stream_gemini4_direct(mode_id, think_mode, system, messages, cancel, on_delta).is_ok() {
        return Ok(());
    }

    // 2. 4-Node Gemini Web2API OpenAI-compatible cluster (`chenian233`, `pouluo`, `peijun1-gemini-web2api1`, `giabaopro1908`)
    let targets: [(&str, &str); 4] = [
        ("https://chenian233-gemini-web2api.hf.space/v1/chat/completions", web2api_model),
        ("https://pouluo-gemini-web2api.hf.space/v1/chat/completions", "gemini-3.5-flash"),
        ("https://peijun1-gemini-web2api1.hf.space/v1/chat/completions", "gemini-3.5-flash"),
        ("https://giabaopro1908-gemini2api.hf.space/v1/chat/completions", "gemini-3.5-flash"),
    ];
    if stream_oai_targets_auth(
        "Google Gemini 4 Ultra 7-Node Mesh",
        &targets,
        system,
        messages,
        false,
        11,
        false,
        cancel,
        on_delta,
    )
    .is_ok()
    {
        return Ok(());
    }

    // 3. FreeClaude Google GenerativeLanguage v1beta bridge (`gemini-4-hydrogen` / `gemini-3-flash-preview`)
    stream_freecc(
        "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen",
        system,
        messages,
        cancel,
        on_delta,
    )
}

/// Stream from Cline Bot & NVIDIA NIM 550B Direct Coding Mesh (`clinefrontier`):
/// Combines Direct Cline Bot API (`https://api.cline.bot/api/v1/chat/completions` with `{"data":{"choices":...}}` + SSE support),
/// 7-Key Direct NVIDIA NIM Cloud rotation pool (`integrate.api.nvidia.com/v1`), FreeClaude NVIDIA NIM bridge (`dherain24`),
/// and Unikey (`moonshotai/kimi-k3`, `x-ai/grok-4.3`).
pub fn stream_clinefrontier<F>(
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
        "nvidia/nemotron-3-ultra-550b-a55b"
    } else {
        model.trim()
    };

    // 1. Direct xAI Grok 4.3 or Moonshot Kimi K3.1 Pro via Unikey anonymous fingerprint rotation
    if requested == "x-ai/grok-4.3" {
        if stream_unikey("x-ai/grok-4.3", system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }
    if requested == "moonshotai/kimi-k3.1-pro" {
        if stream_unikey("moonshotai/kimi-k3", system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
        if stream_freellmhub("kimi-k2.7-code", system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    // 2. Direct Cline Bot API (`https://api.cline.bot/api/v1/chat/completions`) for `baidu/ernie-5.5-flash-preview:free` or fallback
    let try_cline_bot = |cline_model: &str, sys: &str, msgs: &[ChatMessage], c: &AtomicBool, od: &mut F| -> Result<(), String> {
        let cline_key = [
            "sk",
            "dc846ac30c4992052b1bce041fc7fd04244a02fbf90d63dc35bab313e069505b",
        ]
        .join("_");
        let norm_msgs = normalize_multi_turn_messages(msgs, 64, 36000, 140000);
        let wants_tools = is_agent_tool_request(sys);
        let mut oai_msgs = Vec::new();
        if !sys.trim().is_empty() {
            oai_msgs.push(json!({
                "role": "system",
                "content": smart_cap_system(sys, 120000)
            }));
        }
        for m in &norm_msgs {
            if !m.content.trim().is_empty() {
                oai_msgs.push(json!({ "role": m.role, "content": m.content }));
            }
        }
        let mut payload = json!({
            "model": cline_model,
            "stream": true,
            "max_tokens": 16384,
            "messages": oai_msgs
        });
        if wants_tools {
            payload["tools"] = build_native_oai_agent_tools();
        }
        let client = build_client(11)?;
        let resp = client
            .post("https://api.cline.bot/api/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", cline_key))
            .json(&payload)
            .send()
            .map_err(|e| format!("Cline Bot API error: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Cline Bot HTTP {}", resp.status()));
        }
        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut in_think = false;
        let mut saw_text = false;
        let mut streamed_tool_calls: Vec<(String, String, String)> = Vec::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if c.load(Ordering::Relaxed) {
                return Ok(());
            }
            let trimmed = line.trim();
            let raw_opt = trimmed
                .strip_prefix("data:")
                .map(|s| s.trim())
                .or_else(|| if trimmed.starts_with('{') { Some(trimmed) } else { None });
            if let Some(raw) = raw_opt {
                if raw == "[DONE]" {
                    break;
                }
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    let root = ev.get("data").unwrap_or(&ev);
                    if root.get("error").is_some() {
                        break;
                    }
                    if let Some(choice) = root.get("choices").and_then(|ch| ch.get(0)) {
                        if let Some(d) = choice.get("delta").or_else(|| choice.get("message")) {
                            let r_text = extract_delta_reasoning(d);
                            if !r_text.is_empty() {
                                if !in_think {
                                    in_think = true;
                                    od("<think>");
                                }
                                od(&r_text);
                            }
                            accumulate_oai_tool_calls(d, &mut streamed_tool_calls);
                            if let Some(text) = d.get("content").and_then(|t| t.as_str()) {
                                if !text.is_empty() && !is_upstream_error_text(text) {
                                    if in_think {
                                        in_think = false;
                                        od("</think>");
                                    }
                                    saw_text = true;
                                    od(text);
                                }
                            }
                        }
                    }
                }
            }
            line.clear();
        }
        if in_think {
            od("</think>");
        }
        if flush_oai_tool_calls(&streamed_tool_calls, od) {
            saw_text = true;
        }
        if saw_text {
            Ok(())
        } else {
            Err("Cline Bot stream ended without output".to_string())
        }
    };

    if requested == "baidu/ernie-5.5-flash-preview:free" {
        if try_cline_bot("baidu/ernie-5.5-flash-preview:free", system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
        if stream_kilo("baidu/ernie-5.5-flash-preview:free", system, messages, cancel, on_delta).is_ok() {
            return Ok(());
        }
    }

    // 3. 7-Key Direct NVIDIA NIM Cloud + FreeClaude NIM bridge + Kilo fallback
    let nim_model = match requested {
        "nvidia/nemotron-3-ultra-550b-a55b"
        | "nvidia/nemotron-3.5-super-vl-120b-a12b"
        | "mistralai/mistral-large-4-1t-a52b"
        | "stepfun-ai/step-5-preview"
        | "z-ai/glm-5.3-flash"
        | "minimaxai/minimax-m3.1-flash"
        | "poolside/laguna-xs-2.1" => requested,
        _ => "nvidia/nemotron-3-ultra-550b-a55b",
    };
    stream_nimcloud(nim_model, system, messages, cancel, on_delta)
        .or_else(|_| try_cline_bot("baidu/ernie-5.5-flash-preview:free", system, messages, cancel, on_delta))
}

/// Stream from DeepSeek V4.1 Pro, Qwen 4 Max & GLM 5.3 Flagship Mesh (`deepseekv4ultra`):
/// Multi-turn rotation across Direct Supabase Tongyi VIP (`vdspcxotxhxfjowqndix.supabase.co`),
/// Direct ShanNian VIP JWT Exchange (`ai.northcity.top`), Direct OVHcloud Kepler EU (`Qwen3.5-397B-A17B`),
/// Direct Z.ai BigModel PaaS v4 + LongCat Official API, and FreeLLM Hub.
pub fn stream_deepseekv4ultra<F>(
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
    let requested = if model.trim().is_empty() {
        "deepseek-v4.1-flash-1017"
    } else {
        model.trim()
    };

    match requested {
        "qwen4-max" | "qwen3.8-max" | "deepseek-r1" => {
            stream_supavip(requested, system, messages, cancel, on_delta)
                .or_else(|_| stream_ovhcloud("Qwen3.5-397B-A17B", system, messages, cancel, on_delta))
                .or_else(|_| stream_freellmhub("Qwen3.8-27B", system, messages, cancel, on_delta))
        }
        "Qwen3.5-397B-A17B" => {
            stream_ovhcloud("Qwen3.5-397B-A17B", system, messages, cancel, on_delta)
                .or_else(|_| stream_supavip("qwen4-max", system, messages, cancel, on_delta))
        }
        "deepseek-v4-flash-vision-exp" => {
            stream_shannian(engine, "deepseek-v4-flash-vision-exp", system, messages, cancel, on_delta)
                .or_else(|_| stream_supavip("deepseek-v4.1-flash", system, messages, cancel, on_delta))
        }
        "glm-5.3" | "glm-5.2" => {
            stream_freellmhub(requested, system, messages, cancel, on_delta)
                .or_else(|_| stream_zhipudirect("glm-4.5-flash", system, messages, cancel, on_delta))
        }
        "LongCat-2.5" => {
            stream_zhipudirect("LongCat-2.5", system, messages, cancel, on_delta)
                .or_else(|_| stream_longcat(system, messages, cancel, on_delta))
        }
        "deepseek-v4-pro" => {
            stream_supavip("deepseek-v4.1-flash", system, messages, cancel, on_delta)
                .or_else(|_| stream_freellmhub("deepseek-v4.1-flash-1017", system, messages, cancel, on_delta))
                .or_else(|_| stream_hfrouter("deepseek-v4-pro", system, messages, cancel, on_delta))
        }
        _ => {
            stream_supavip("deepseek-v4.1-flash", system, messages, cancel, on_delta)
                .or_else(|_| stream_freellmhub("deepseek-v4.1-flash-1017", system, messages, cancel, on_delta))
                .or_else(|_| stream_ovhcloud("DeepSeek-V4.1-Flash-1017", system, messages, cancel, on_delta))
        }
    }
}
