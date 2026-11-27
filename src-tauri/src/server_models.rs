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
