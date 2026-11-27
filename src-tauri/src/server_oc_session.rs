pub fn split_thinking_and_content(raw: &str) -> (String, String) {
    let mut reasoning = Vec::new();
    let mut rest = raw
        .replace("<think>...</think>", "`<think>...</think>`")
        .replace("<thinking>...</thinking>", "`<thinking>...</thinking>`");

    let clean_thought = |s: &str| -> String {
        s.replace("<think>", "")
            .replace("</think>", "")
            .replace("<thinking>", "")
            .replace("</thinking>", "")
            .trim()
            .to_string()
    };

    // 1. Handle orphan closing tags when an upstream template pre-opened `<think>` on the server
    for (open_tag, close_tag) in [
        ("<think>", "</think>"),
        ("<thinking>", "</thinking>"),
        ("<thought>", "</thought>"),
        ("<reasoning>", "</reasoning>"),
        ("<|begin_of_thought|>", "<|end_of_thought|>"),
    ] {
        let lower = rest.to_ascii_lowercase();
        if let Some(close_idx) = lower.rfind(close_tag) {
            if close_idx > 0 && matches!(rest.as_bytes()[close_idx - 1], b'`' | b'"' | b'\'') {
                continue;
            }
            let before = &lower[..close_idx];
            if !before.contains(open_tag) {
                let orphan = clean_thought(&rest[..close_idx]);
                if !orphan.is_empty() {
                    reasoning.push(orphan);
                }
                rest.replace_range(0..close_idx + close_tag.len(), "");
            }
        }
    }

    // 2. Handle paired or unclosed-tail reasoning blocks (spanning to the last `</think>` if split early)
    for (open_tag, close_tag) in [
        ("<think>", "</think>"),
        ("<thinking>", "</thinking>"),
        ("<thought>", "</thought>"),
        ("<reasoning>", "</reasoning>"),
        ("<|begin_of_thought|>", "<|end_of_thought|>"),
    ] {
        let mut search_from = 0usize;
        loop {
            let lower = rest.to_ascii_lowercase();
            if search_from >= lower.len() {
                break;
            }
            let Some(rel_start) = lower[search_from..].find(open_tag) else { break };
            let start = search_from + rel_start;
            if start > 0 && matches!(rest.as_bytes()[start - 1], b'`' | b'"' | b'\'') {
                search_from = start + open_tag.len();
                continue;
            }
            let after_open = start + open_tag.len();
            let mut found_end: Option<usize> = None;
            let mut scan = after_open;
            while scan < lower.len() {
                let Some(rel_end) = lower[scan..].find(close_tag) else { break };
                let cand = scan + rel_end;
                if cand > 0 && matches!(rest.as_bytes()[cand - 1], b'`' | b'"' | b'\'') {
                    scan = cand + close_tag.len();
                    continue;
                }
                found_end = Some(cand);
                if start > 4 {
                    break;
                }
                scan = cand + close_tag.len();
            }
            if let Some(end) = found_end {
                let tail = rest[end + close_tag.len()..].trim_start();
                if start == 0 && (tail.starts_with(", then") || tail.starts_with(", and")) && !tail.contains(close_tag) {
                    let thought = clean_thought(&rest[after_open..]);
                    if !thought.is_empty() {
                        reasoning.push(thought);
                    }
                    rest.truncate(start);
                    break;
                }
                let thought = clean_thought(&rest[after_open..end]);
                if !thought.is_empty() {
                    reasoning.push(thought);
                }
                rest.replace_range(start..end + close_tag.len(), "");
            } else {
                let line_start = rest[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
                if !rest[line_start..start].trim().is_empty() {
                    rest.replace_range(start..after_open, "");
                    continue;
                }
                let thought = clean_thought(&rest[after_open..]);
                if !thought.is_empty() {
                    reasoning.push(thought);
                }
                rest.truncate(start);
                break;
            }
        }
    }

    (reasoning.join("\n\n"), rest.trim().to_string())
}

/// Extract `<tool_call>...</tool_call>` blocks (or fallback JSON tool call blocks) from the model's answer,
/// returning `(cleaned_text_without_tool_tags, parsed_tool_calls)`.
pub fn extract_tool_calls_from_text(
    answer: &str,
    known_tool_names: &HashSet<String>,
) -> (String, Vec<ParsedToolCall>) {
    let mut cleaned = answer.to_string();
    let mut calls = Vec::new();

    // 1. Parse explicit `<tool_call>...</tool_call>` and `<function_call>...</function_call>` tags
    for (open_tag, close_tag) in [
        ("<tool_call>", "</tool_call>"),
        ("<function_call>", "</function_call>"),
    ] {
        while let Some(start) = cleaned.find(open_tag) {
            let rest = &cleaned[start + open_tag.len()..];
            let (body, remove_end) = if let Some(end_rel) = rest.find(close_tag) {
                (
                    &rest[..end_rel],
                    start + open_tag.len() + end_rel + close_tag.len(),
                )
            } else {
                (rest, cleaned.len())
            };
            let raw_json = body
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();
            if let Some(tc) = parse_single_tool_json(raw_json) {
                calls.push(tc);
            }
            cleaned.replace_range(start..remove_end, "");
        }
    }

    // 1b. Also parse `<zeus_tool name="...">...</zeus_tool>` if emitted by a scraper
    while let Some(start) = cleaned.find("<zeus_tool") {
        let rest = &cleaned[start..];
        let Some(gt) = rest.find('>') else {
            break;
        };
        let header = &rest[..gt];
        let name = header
            .split("name=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .or_else(|| header.split("name='").nth(1).and_then(|s| s.split('\'').next()))
            .unwrap_or("")
            .trim()
            .to_string();
        let path_attr = header
            .split("path=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .or_else(|| header.split("path='").nth(1).and_then(|s| s.split('\'').next()))
            .unwrap_or("")
            .trim()
            .to_string();
        let after_gt = &rest[gt + 1..];
        let (body, remove_end) = if let Some(end_rel) = after_gt.find("</zeus_tool>") {
            (&after_gt[..end_rel], start + gt + 1 + end_rel + 12)
        } else {
            (after_gt, cleaned.len())
        };
        if !name.is_empty() && !matches!(name.as_str(), "TOOL" | "tool_name" | "NAME") {
            let args_trimmed = body.trim();
            let arguments = if args_trimmed.starts_with('{') && args_trimmed.ends_with('}') {
                args_trimmed.to_string()
            } else if matches!(name.as_str(), "bash" | "shell" | "cmd" | "exec") {
                json!({ "command": if !args_trimmed.is_empty() { args_trimmed } else { &path_attr }, "description": "Execute command" }).to_string()
            } else if matches!(name.as_str(), "write" | "write_file") {
                json!({ "filePath": path_attr, "path": path_attr, "content": args_trimmed }).to_string()
            } else if matches!(name.as_str(), "read" | "read_file") {
                let p = if !path_attr.is_empty() { path_attr } else { args_trimmed.to_string() };
                json!({ "filePath": p, "path": p }).to_string()
            } else if !path_attr.is_empty() {
                json!({ "path": path_attr, "body": args_trimmed }).to_string()
            } else if args_trimmed.is_empty() {
                "{}".to_string()
            } else {
                json!({ "input": args_trimmed }).to_string()
            };
            calls.push(ParsedToolCall {
                id: format!("call_{}", random_hex(12)),
                name,
                arguments,
            });
        }
        cleaned.replace_range(start..remove_end, "");
    }

    // 1c. Also parse `<function=...>`, `<function name="...">`, `<invoke name="...">`, and `<ifm|tool_call>` via the universal agent parser
    if calls.is_empty() {
        let fallback_invs = crate::agent::parse_inline_invocations_segment(&cleaned, true, false);
        for inv in fallback_invs {
            let arguments = if inv.body.starts_with('{') && inv.body.ends_with('}') {
                inv.body.clone()
            } else if matches!(inv.name.as_str(), "bash" | "shell" | "cmd" | "exec") {
                json!({ "command": if !inv.body.is_empty() { &inv.body } else { &inv.path }, "description": "Execute command" }).to_string()
            } else if matches!(inv.name.as_str(), "write" | "write_file") {
                json!({ "filePath": inv.path, "path": inv.path, "content": inv.body }).to_string()
            } else if matches!(inv.name.as_str(), "read" | "read_file") {
                let p = if !inv.path.is_empty() { &inv.path } else { &inv.body };
                json!({ "filePath": p, "path": p }).to_string()
            } else if !inv.path.is_empty() {
                json!({ "path": inv.path, "body": inv.body }).to_string()
            } else {
                json!({ "input": inv.body }).to_string()
            };
            calls.push(ParsedToolCall {
                id: format!("call_{}", random_hex(12)),
                name: inv.name,
                arguments,
            });
        }
        if !calls.is_empty() {
            cleaned = strip_tool_xml_for_oc(&cleaned);
        }
    }

    // 2. Fallback: if tools were requested and no `<tool_call>` tag was used, check if the model emitted a standalone JSON tool call object
    if calls.is_empty() && !known_tool_names.is_empty() {
        let trimmed = cleaned
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```tool_call")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Some(tc) = parse_single_tool_json(trimmed) {
                if known_tool_names.contains(&tc.name) {
                    calls.push(tc);
                    cleaned.clear();
                }
            }
        }
    }

    (cleaned.trim().to_string(), calls)
}

fn parse_single_tool_json(raw_json: &str) -> Option<ParsedToolCall> {
    let v: Value = serde_json::from_str(raw_json).ok()?;
    let name = v
        .get("name")
        .or_else(|| v.get("tool"))
        .or_else(|| v.get("function").and_then(|f| f.get("name")))
        .and_then(|n| n.as_str())?
        .trim()
        .to_string();
    if name.is_empty() || matches!(name.as_str(), "tool_name" | "TOOL" | "NAME") {
        return None;
    }
    let args_val = v
        .get("arguments")
        .or_else(|| v.get("parameters"))
        .or_else(|| v.get("input"))
        .or_else(|| v.get("args"))
        .or_else(|| v.get("function").and_then(|f| f.get("arguments")))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let arguments = if let Some(s) = args_val.as_str() {
        s.to_string()
    } else {
        serde_json::to_string(&args_val).unwrap_or_else(|_| "{}".to_string())
    };
    let id = v
        .get("id")
        .and_then(|i| i.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("call_{}", random_hex(12)));
    Some(ParsedToolCall {
        id,
        name,
        arguments,
    })
}

/// Generate a complete, verified `opencode.json` configuration object for OpenCode.
pub fn generate_opencode_config_json(port: u16) -> Value {
    let base_url = format!("http://127.0.0.1:{}/v1", port);
    let mut models_map = serde_json::Map::new();

    for m in build_openai_models_list() {
        // Include top-level aliases and key provider/model pairs without bloating opencode.json
        if !m.id.contains('/')
            || m.id.starts_with("freecc/")
            || m.id.starts_with("kilo/")
            || m.id.starts_with("nimcloud/")
            || m.id.starts_with("unikey/")
            || m.id.starts_with("ovhcloud/")
            || m.id.starts_with("colibriqwen/")
            || m.id.starts_with("gemma4vl/")
            || m.id.starts_with("phi4cloud/")
            || m.id.starts_with("qwen/")
            || m.id.starts_with("deepai/")
        {
            models_map.insert(
                m.id.clone(),
                json!({
                    "name": m.label,
                    "tool_call": true,
                    "reasoning": m.reasoning,
                    "attachment": m.vision,
                    "temperature": true,
                    "limit": {
                        "context": m.context_window,
                        "output": m.max_output
                    }
                }),
            );
        }
    }

    json!({
        "$schema": "https://opencode.ai/config.json",
        "model": "zeusdesigns/gemini-4-hydrogen",
        "small_model": "zeusdesigns/claude-haiku-5-5",
        "provider": {
            "zeusdesigns": {
                "npm": "@ai-sdk/openai-compatible",
                "name": "ZeusDesigns Local Gateway (Free Keyless)",
                "options": {
                    "baseURL": base_url,
                    "apiKey": "zeus-local"
                },
                "models": models_map
            }
        }
    })
}

fn write_json_response(stream: &mut TcpStream, status_line: &str, body: &Value) {
    let payload = serde_json::to_string(body).unwrap_or_else(|_| "{}".to_string());
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n",
        status_line,
        payload.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(payload.as_bytes());
    let _ = stream.flush();
}

fn write_sse_headers(stream: &mut TcpStream) -> std::io::Result<()> {
    let header = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-cache\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\n\r\n";
    stream.write_all(header.as_bytes())?;
    stream.flush()
}

fn write_sse_data(stream: &mut TcpStream, data: &Value) -> std::io::Result<()> {
    let line = format!("data: {}\n\n", serde_json::to_string(data).unwrap_or_default());
    stream.write_all(line.as_bytes())?;
    stream.flush()
}

fn write_sse_event(stream: &mut TcpStream, event: &str, data: &Value) -> std::io::Result<()> {
    let line = format!(
        "event: {}\ndata: {}\n\n",
        event,
        serde_json::to_string(data).unwrap_or_default()
    );
    stream.write_all(line.as_bytes())?;
    stream.flush()
}

fn strip_tool_xml_for_oc(raw: &str) -> String {
    let mut out = crate::agent::strip_thinking_blocks(raw);
    for (open_tag, close_tag) in [
        ("<zeus_tool", "</zeus_tool>"),
        ("<tool_call>", "</tool_call>"),
        ("<function_call>", "</function_call>"),
        ("<function", "</function>"),
        ("<invoke", "</invoke>"),
        ("<ifm|tool_calls>", "</ifm|tool_calls>"),
        ("<ifm|tool_call>", "</ifm|tool_call>"),
        ("<bash", "</bash>"),
        ("<shell", "</shell>"),
        ("<python", "</python>"),
        ("<read_file", "</read_file>"),
        ("<write_file", "</write_file>"),
        ("<edit_file", "</edit_file>"),
        ("<delete_file", "</delete_file>"),
        ("<search_code", "</search_code>"),
        ("<list_dir", "</list_dir>"),
        ("<web_fetch", "</web_fetch>"),
        ("<memory_search", "</memory_search>"),
        ("<memory_save", "</memory_save>"),
        ("<memory_edit", "</memory_edit>"),
        ("<memory_delete", "</memory_delete>"),
    ] {
        let mut search_from = 0usize;
        loop {
            if search_from >= out.len() {
                break;
            }
            let Some(rel_start) = out[search_from..].find(open_tag) else { break };
            let start = search_from + rel_start;
            // Never strip or truncate if the tag is inside inline backticks (e.g. `` `<bash>` ``)
            if start > 0 && out.as_bytes()[start - 1] == b'`' {
                search_from = start + open_tag.len();
                continue;
            }
            let rest = &out[start..];
            if let Some(gt) = rest.find('>') {
                let header = &rest[open_tag.len()..gt];
                if !open_tag.ends_with('>')
                    && !header.is_empty()
                    && !header.starts_with(char::is_whitespace)
                    && !header.starts_with('/')
                    && !header.starts_with('=')
                {
                    search_from = start + gt + 1;
                    continue;
                }
                if rest[..gt].trim_end().ends_with('/') {
                    out.replace_range(start..start + gt + 1, "");
                    continue;
                }
            }
            if let Some(rel_end) = rest.find(close_tag) {
                let block = &rest[..rel_end + close_tag.len()];
                if open_tag == "<zeus_tool" && (!block.contains("name=") || block.contains(">...</zeus_tool>")) {
                    search_from = start + open_tag.len();
                    continue;
                }
                out.replace_range(start..start + rel_end + close_tag.len(), "");
            } else if matches!(open_tag, "<zeus_tool" | "<tool_call>" | "<function_call>" | "<ifm|tool_call>") {
                let line_start = out[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
                let has_prose_prefix = !out[line_start..start].trim().is_empty();
                let is_placeholder_zeus = open_tag == "<zeus_tool" && !rest.contains("name=");
                if has_prose_prefix || is_placeholder_zeus {
                    search_from = start + open_tag.len();
                    continue;
                }
                out.truncate(start);
                break;
            } else {
                search_from = start + open_tag.len();
            }
        }
    }
    out.trim().to_string()
}

fn handle_opencode_session_message(
    stream: &mut TcpStream,
    raw_path: &str,
    session_id: &str,
    body_bytes: &[u8],
    engine: Arc<ProviderEngine>,
    server_state: Arc<LocalServerState>,
) {
    let req_json: Value = serde_json::from_slice(body_bytes).unwrap_or_else(|_| json!({}));
    let dir_q = raw_path
        .split('?')
        .nth(1)
        .and_then(|q| {
            q.split('&').find_map(|kv| {
                let (k, v) = kv.split_once('=')?;
                if k == "directory" {
                    Some(percent_decode(v))
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();

    let model_str = req_json
        .get("model")
        .and_then(|m| {
            if let Some(s) = m.as_str() {
                Some(s.to_string())
            } else {
                let pid = m.get("providerID").and_then(|x| x.as_str()).unwrap_or("zeusdesigns");
                let mid = m.get("modelID").and_then(|x| x.as_str()).unwrap_or("mercury-3");
                if pid == "opencode" {
                    Some(format!("opencodezen/{}", mid))
                } else if mid.contains('/') {
                    Some(mid.to_string())
                } else {
                    Some(format!("{}/{}", pid, mid))
                }
            }
        })
        .unwrap_or_else(|| "mercury3/mercury-3".to_string());
    let (provider_id, upstream_model) = resolve_provider_and_model(&model_str);

    let user_text = req_json
        .get("parts")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .or_else(|| req_json.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();

    let custom_sys = req_json
        .get("system")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    let mut workdir = dir_q;
    let mut history: Vec<ChatMessage> = Vec::new();
    if let Ok(mut guard) = server_state.oc_sessions.lock() {
        let entry = guard.entry(session_id.to_string()).or_insert_with(|| OcSession {
            id: session_id.to_string(),
            title: "OpenCode Session".to_string(),
            directory: workdir.clone(),
            messages: Vec::new(),
            created: now_secs(),
        });
        if workdir.is_empty() && !entry.directory.is_empty() {
            workdir = entry.directory.clone();
        } else if !workdir.is_empty() {
            entry.directory = workdir.clone();
        }
        entry.messages.push(ChatMessage {
            role: "user".to_string(),
            content: user_text.clone(),
            attachments: Vec::new(),
        });
        history = entry.messages.clone();
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut cguard) = server_state.oc_cancels.lock() {
        cguard.insert(session_id.to_string(), cancel_flag.clone());
    }

    let asst_msg_id = format!("msg_{}", random_hex(10));
    server_state.broadcast_oc_event(json!({
        "type": "message.updated",
        "properties": {
            "info": {
                "id": asst_msg_id,
                "sessionID": session_id,
                "role": "assistant"
            }
        }
    }));

    let eff_dir = if workdir.trim().is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    } else {
        workdir.clone()
    };
    let top_nodes = crate::workspace::walk_workspace(
        std::path::Path::new(&eff_dir),
        std::path::Path::new(&eff_dir),
        1,
    );
    let top_listing = if top_nodes.is_empty() {
        "(empty directory — 0 files)".to_string()
    } else {
        top_nodes
            .iter()
            .take(50)
            .map(|n| if n.dir { format!("{}/", n.name) } else { n.name.clone() })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let norm_user_q = user_text
        .trim()
        .to_ascii_lowercase()
        .trim_end_matches(|c: char| matches!(c, '!' | '.' | '?' | ' '))
        .to_string();
    let is_greeting = matches!(
        norm_user_q.as_str(),
        "hi" | "hello" | "hey" | "yo" | "sup" | "hola" | "howdy" | "greetings" | "good morning" | "good afternoon" | "good evening"
            | "who are you" | "who r u" | "what model are you" | "which model are you" | "which model r u" | "what model r u" | "what model is this"
    );
    let uses_native_fn_tools = custom_sys.contains("Native Function Calling");
    if !is_greeting && history.len() == 1 && !uses_native_fn_tools {
        let orig_user = history[0].content.clone();
        history = vec![
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "[XML DSL Output Mode — Required by Client Parser]\nWorkspace ({}) is connected. List top-level entries to verify the <zeus_tool> bridge.",
                    eff_dir
                ),
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "assistant".to_string(),
                content: "Workspace is connected. I will check the directory listing first.\n<zeus_tool name=\"list_dir\" path=\"\"></zeus_tool>".to_string(),
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "Tool results:\n<tool_result name=\"list_dir\" ok=\"true\">\n{}\n</tool_result>\n\nUser request: {}\n(If this request requires a shell command, python script, file read/write/edit, or memory lookup, emit the required <zeus_tool> XML block in your response; if no workspace tool is needed, answer the user directly.)",
                    top_listing, orig_user
                ),
                attachments: Vec::new(),
            },
        ];
    }

    let tool_sys = format!(
        "You are Zeus running inside the ZeusDesigns Native OpenCode SDK Agent Runtime.\nOpen project folder: {}.\n## Agent tools\nKeep internal reasoning plain text, emit tool blocks in your final response, and stop immediately after </zeus_tool>:\n- <zeus_tool name=\"shell\">command</zeus_tool> (alias: name=\"bash\")\n- <zeus_tool name=\"python\">python3_code</zeus_tool>\n- <zeus_tool name=\"read_file\" path=\"relative/file\" start=\"1\" end=\"250\"></zeus_tool>\n- <zeus_tool name=\"write_file\" path=\"relative/file\">complete file content</zeus_tool>\n- <zeus_tool name=\"edit_file\" path=\"relative/file\"><<<<<<< SEARCH\\nexisting\\n=======\\nreplacement\\n>>>>>>> REPLACE</zeus_tool>\n- <zeus_tool name=\"delete_file\" path=\"relative/file\"></zeus_tool>\n- <zeus_tool name=\"search_code\">query</zeus_tool>\n- <zeus_tool name=\"list_dir\" path=\"subdir\"></zeus_tool>\n- <zeus_tool name=\"memory_search\">query</zeus_tool> | <zeus_tool name=\"memory_save\" path=\"preferences\">fact</zeus_tool> | <zeus_tool name=\"memory_edit\" path=\"id\">fact</zeus_tool> | <zeus_tool name=\"memory_delete\" path=\"id\"></zeus_tool>",
        eff_dir
    );
    let system_prompt = if custom_sys.trim().is_empty() {
        tool_sys
    } else if custom_sys.contains("## Agent Tools") || custom_sys.contains("## Agent tools") || custom_sys.contains("## Calling Tools") {
        custom_sys
    } else {
        format!("{}\n\n{}", custom_sys, tool_sys)
    };

    let req_effort = req_json
        .get("effort")
        .and_then(|e| e.as_str())
        .unwrap_or("high")
        .to_string();

    let mut final_clean_answer = String::new();
    let mut final_reasoning = String::new();
    let mut nudged = false;
    for round in 0..32usize {
        if cancel_flag.load(Ordering::Relaxed) {
            break;
        }
        let is_final_oc_step = round == 31;
        let step_system = if is_final_oc_step {
            format!(
                "{}\n\nCRITICAL - MAXIMUM STEPS REACHED\nThe maximum number of steps allowed for this task has been reached. Tools are disabled until next user input. Respond with text only summarizing work accomplished so far, remaining tasks, and next recommendations.",
                system_prompt
            )
        } else {
            system_prompt.clone()
        };
        let chat_req = ChatRequest {
            request_id: format!("oc-{}-{}", session_id, round),
            provider: provider_id.clone(),
            model: upstream_model.clone(),
            effort: if round > 0 { "low".to_string() } else { req_effort.clone() },
            system: step_system,
            messages: history.clone(),
            workspace_root: if workdir.is_empty() { None } else { Some(workdir.clone()) },
            custom: None,
            ..Default::default()
        };

        let mut round_raw = String::new();
        let text_part_id = format!("prt_txt_{}_{}", round, random_hex(6));
        let reason_part_id = format!("prt_rsn_{}_{}", round, random_hex(6));
        let mut prev_vis = String::new();
        let mut prev_rsn = String::new();

        let res = dispatch_stream(&engine, &chat_req, &cancel_flag, |delta| {
            round_raw.push_str(delta);
            let (rsn, vis_raw) = split_thinking_and_content(&round_raw);
            if rsn.len() > prev_rsn.len() {
                let d = rsn[prev_rsn.len()..].to_string();
                prev_rsn = rsn.clone();
                server_state.broadcast_oc_event(json!({
                    "type": "message.part.updated",
                    "properties": {
                        "part": {
                            "id": reason_part_id,
                            "sessionID": session_id,
                            "messageID": asst_msg_id,
                            "type": "reasoning",
                            "text": rsn
                        },
                        "delta": d
                    }
                }));
            }
            let vis_clean = strip_tool_xml_for_oc(&vis_raw);
            if vis_clean.len() > prev_vis.len() && !vis_raw.contains("<zeus_tool") && !vis_raw.contains("<tool_call>") {
                let d = vis_clean[prev_vis.len()..].to_string();
                prev_vis = vis_clean.clone();
                server_state.broadcast_oc_event(json!({
                    "type": "message.part.updated",
                    "properties": {
                        "part": {
                            "id": text_part_id,
                            "sessionID": session_id,
                            "messageID": asst_msg_id,
                            "type": "text",
                            "text": vis_clean
                        },
                        "delta": d
                    }
                }));
            }
        });

        if let Err(err) = res {
            server_state.broadcast_oc_event(json!({
                "type": "session.error",
                "properties": {
                    "sessionID": session_id,
                    "error": { "name": "ProviderError", "data": { "message": err } }
                }
            }));
            break;
        }

        if !prev_rsn.trim().is_empty() {
            if final_reasoning.is_empty() {
                final_reasoning = prev_rsn.trim().to_string();
            } else if !final_reasoning.contains(prev_rsn.trim()) {
                final_reasoning.push_str("\n\n");
                final_reasoning.push_str(prev_rsn.trim());
            }
        }

        let clean_no_think = crate::agent::strip_thinking_blocks(&round_raw);
        let mut invocations = if is_final_oc_step {
            Vec::new()
        } else {
            crate::agent::parse_inline_invocations_segment(&clean_no_think, true, true)
        };
        if !is_final_oc_step && invocations.is_empty() && clean_no_think.trim().len() < 80 {
            invocations = crate::agent::parse_inline_invocations_segment(&round_raw, false, true);
        }

        let vis_final = strip_tool_xml_for_oc(&clean_no_think);
        if !vis_final.is_empty() {
            if vis_final != prev_vis {
                let delta = if vis_final.starts_with(&prev_vis) {
                    vis_final[prev_vis.len()..].to_string()
                } else {
                    vis_final.clone()
                };
                server_state.broadcast_oc_event(json!({
                    "type": "message.part.updated",
                    "properties": {
                        "part": {
                            "id": text_part_id,
                            "sessionID": session_id,
                            "messageID": asst_msg_id,
                            "type": "text",
                            "text": vis_final
                        },
                        "delta": delta
                    }
                }));
            }
            final_clean_answer = vis_final.clone();
        }

        if invocations.is_empty() {
            let stated_plan_only = vis_final.trim().is_empty()
                || (round == 0
                    && vis_final.len() < 220
                    && (vis_final.to_ascii_lowercase().contains("i will ")
                        || vis_final.to_ascii_lowercase().contains("let's ")
                        || vis_final.to_ascii_lowercase().contains("let me ")));
            if !is_greeting && !nudged && stated_plan_only {
                nudged = true;
                if round == 0 && !vis_final.trim().is_empty() {
                    history.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: "Understood. I will emit the `<zeus_tool>` XML block now to execute the workspace action directly.".to_string(),
                        attachments: Vec::new(),
                    });
                    history.push(ChatMessage {
                        role: "user".to_string(),
                        content: "Your reply stopped after planning without emitting a `<zeus_tool>` block, so no command or file operation ran. Emit the required `<zeus_tool>` block now (or provide your complete final answer if no workspace action is needed).".to_string(),
                        attachments: Vec::new(),
                    });
                } else {
                    history.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: format!("Thought summary: {}", prev_rsn.chars().take(600).collect::<String>()),
                        attachments: Vec::new(),
                    });
                    history.push(ChatMessage {
                        role: "user".to_string(),
                        content: "You finished your internal reasoning. Now provide your clear, complete visible answer to the user (or emit the next `<zeus_tool>` block if a workspace action is required).".to_string(),
                        attachments: Vec::new(),
                    });
                }
                continue;
            }
            history.push(ChatMessage {
                role: "assistant".to_string(),
                content: final_clean_answer.clone(),
                attachments: Vec::new(),
            });
            break;
        }

        let mut canonical_calls = Vec::new();
        let mut tool_results_block = String::from("Tool results:\n");
        for (t_idx, inv) in invocations.iter().enumerate() {
            let call_id = format!("call_{}_{}_{}", round, t_idx, random_hex(4));
            let input_obj = json!({
                "path": inv.path,
                "body": inv.body
            });
            server_state.broadcast_oc_event(json!({
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "id": call_id,
                        "callID": call_id,
                        "sessionID": session_id,
                        "messageID": asst_msg_id,
                        "type": "tool",
                        "tool": inv.name,
                        "state": {
                            "status": "running",
                            "input": input_obj
                        }
                    }
                }
            }));

            let (ok, output) = crate::agent::execute_single_workspace_tool(&workdir, inv);
            server_state.broadcast_oc_event(json!({
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "id": call_id,
                        "callID": call_id,
                        "sessionID": session_id,
                        "messageID": asst_msg_id,
                        "type": "tool",
                        "tool": inv.name,
                        "state": {
                            "status": if ok { "completed" } else { "error" },
                            "input": input_obj,
                            "output": output,
                            "error": if ok { Value::Null } else { Value::String(output.clone()) }
                        }
                    }
                }
            }));

            if uses_native_fn_tools {
                canonical_calls.push(format!(
                    "<tool_call>{}</tool_call>",
                    json!({
                        "name": inv.name,
                        "arguments": { "path": inv.path, "body": inv.body }
                    })
                ));
            } else {
                canonical_calls.push(format!(
                    "<zeus_tool name=\"{}\" path=\"{}\">{}</zeus_tool>",
                    inv.name, inv.path, inv.body
                ));
            }
            tool_results_block.push_str(&format!(
                "<tool_result name=\"{}\" ok=\"{}\">\n{}\n</tool_result>\n",
                inv.name, ok, output
            ));
        }
        if uses_native_fn_tools {
            tool_results_block.push_str("Continue from these tool results. Invoke the next tool if more steps are needed, or provide the final response.");
        } else {
            tool_results_block.push_str("Continue from these tool results. Emit another <zeus_tool> if more steps are needed, or provide the final response.");
        }
        history.push(ChatMessage {
            role: "assistant".to_string(),
            content: canonical_calls.join("\n"),
            attachments: Vec::new(),
        });
        history.push(ChatMessage {
            role: "user".to_string(),
            content: tool_results_block,
            attachments: Vec::new(),
        });
    }

    if let Ok(mut guard) = server_state.oc_sessions.lock() {
        if let Some(sess) = guard.get_mut(session_id) {
            sess.messages = history;
        }
    }

    server_state.broadcast_oc_event(json!({
        "type": "session.idle",
        "properties": { "sessionID": session_id }
    }));

    let mut final_parts = Vec::new();
    if !final_reasoning.is_empty() {
        final_parts.push(json!({
            "id": format!("prt_rsn_final_{}", random_hex(6)),
            "sessionID": session_id,
            "messageID": asst_msg_id,
            "type": "reasoning",
            "text": final_reasoning
        }));
    }
    final_parts.push(json!({
        "id": format!("prt_final_{}", random_hex(6)),
        "sessionID": session_id,
        "messageID": asst_msg_id,
        "type": "text",
        "text": final_clean_answer
    }));

    write_json_response(
        stream,
        "200 OK",
        &json!({
            "info": {
                "id": asst_msg_id,
                "sessionID": session_id,
                "role": "assistant"
            },
            "parts": final_parts
        }),
    );
}
