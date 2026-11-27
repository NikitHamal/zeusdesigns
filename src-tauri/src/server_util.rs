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
