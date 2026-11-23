use crate::providers::{
    catalog, chatjimmy_complete, dispatch_stream, ChatRequest, ProviderEngine, ProviderInfo,
};
use crate::workspace::{
    fs_read, fs_write, python_run, search_workspace_code, shell_run, walk_workspace, FileNode,
};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn providers_list() -> Vec<ProviderInfo> {
    catalog()
}

#[tauri::command(async)]
pub fn title_generate(text: String) -> Result<String, String> {
    let snippet: String = text.chars().take(280).collect();
    let sys = "You generate short 2 to 5 word chat titles. Never answer the user message. Output only the title words.";
    let user_msg = format!(
        "Write a concise 2 to 5 word title for a conversation that starts with this message. Do NOT answer the message or write a template. Output ONLY the title (2-5 words, no quotes, no punctuation):\n\nMessage: {}\n\nTitle:",
        snippet
    );
    if let Ok(title) = chatjimmy_complete(sys, &user_msg) {
        let cleaned = title
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("")
            .trim()
            .trim_start_matches(|c: char| matches!(c, '"' | '\'' | '#' | '*' | '-' | ' '))
            .trim_end_matches(|c: char| matches!(c, '"' | '\'' | '.' | ':' | ';' | ' '))
            .replace("Title:", "")
            .trim()
            .to_string();
        let lower = cleaned.to_ascii_lowercase();
        let word_count = cleaned.split_whitespace().count();
        let looks_like_reply = lower.starts_with("here is")
            || lower.starts_with("here's")
            || lower.starts_with("sure")
            || lower.starts_with("certainly")
            || lower.starts_with("i can")
            || lower.starts_with("i'll")
            || cleaned.contains("```")
            || word_count > 7;
        if !cleaned.is_empty() && !looks_like_reply {
            return Ok(cleaned.chars().take(50).collect());
        }
    }
    let words: Vec<&str> = text
        .split_whitespace()
        .filter(|w| !w.is_empty())
        .take(5)
        .collect();
    if words.is_empty() {
        Ok("New chat".to_string())
    } else {
        let joined = words.join(" ");
        let mut chars = joined.chars();
        let titled = match chars.next() {
            Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            None => "New chat".to_string(),
        };
        Ok(titled.chars().take(50).collect())
    }
}

#[tauri::command]
pub fn chat_cancel(
    request_id: String,
    engine: tauri::State<'_, Arc<ProviderEngine>>,
) -> Result<(), String> {
    if let Ok(guard) = engine.state.lock() {
        if let Some(flag) = guard.active_cancels.get(&request_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

/// Strip `<think>...</think>` and `<thinking>...</thinking>` blocks (including unclosed trailing think blocks)
/// so tool tags mentioned inside a model's internal reasoning trace are never executed as real tools.
pub fn strip_thinking_blocks(raw: &str) -> String {
    let mut out = raw.to_string();
    for (open_tag, close_tag) in [("<think>", "</think>"), ("<thinking>", "</thinking>")] {
        loop {
            let lower = out.to_ascii_lowercase();
            let Some(start) = lower.find(open_tag) else { break };
            let after_open = start + open_tag.len();
            if let Some(rel_end) = lower[after_open..].find(close_tag) {
                let end = after_open + rel_end + close_tag.len();
                out.replace_range(start..end, "");
            } else {
                out.truncate(start);
                break;
            }
        }
    }
    out
}

fn resolve_workspace_root(workspace_root: &str) -> String {
    let trimmed = workspace_root.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string())
}

#[derive(Debug, Clone)]
pub struct InlineToolInvocation {
    pub name: String,
    pub path: String,
    pub start_line: Option<usize>,
    pub end_line: Option<usize>,
    pub body: String,
    pub offset: usize,
}

fn format_tree_compact(nodes: &[FileNode], indent: usize, out: &mut String) {
    let pad = "  ".repeat(indent);
    for n in nodes {
        if n.dir {
            out.push_str(&format!("{}{}/\n", pad, n.name));
            if let Some(children) = &n.children {
                format_tree_compact(children, indent + 1, out);
            }
        } else {
            let size_label = match n.size {
                Some(b) if b >= 1024 => format!(" ({:.1} KB)", b as f64 / 1024.0),
                Some(b) => format!(" ({} B)", b),
                None => String::new(),
            };
            out.push_str(&format!("{}{}{}\n", pad, n.name, size_label));
        }
    }
}

fn format_exec_result(v: &Value) -> (bool, String) {
    let code = v.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
    let stdout = v.get("stdout").and_then(|s| s.as_str()).unwrap_or("").trim_end();
    let stderr = v.get("stderr").and_then(|s| s.as_str()).unwrap_or("").trim_end();
    let mut parts = Vec::new();
    if !stdout.is_empty() {
        parts.push(stdout.to_string());
    }
    if !stderr.is_empty() {
        parts.push(if stdout.is_empty() {
            stderr.to_string()
        } else {
            format!("[stderr]\n{}", stderr)
        });
    }
    if code != 0 {
        parts.push(format!("[exit code: {}]", code));
    }
    let text = if parts.is_empty() {
        format!("[exit {}] (no output)", code)
    } else {
        parts.join("\n")
    };
    (code == 0, text)
}

fn is_known_valid_tool(name: &str) -> bool {
    matches!(
        name,
        "read_file"
            | "read"
            | "cat"
            | "view_file"
            | "open_file"
            | "write_file"
            | "write"
            | "create_file"
            | "save_file"
            | "overwrite_file"
            | "sync_artboard"
            | "edit_file"
            | "edit"
            | "patch_file"
            | "replace_in_file"
            | "str_replace"
            | "search_code"
            | "grep"
            | "rg"
            | "search"
            | "ripgrep"
            | "find_in_files"
            | "list_dir"
            | "ls"
            | "dir"
            | "list_files"
            | "glob"
            | "find_files"
            | "shell"
            | "bash"
            | "sh"
            | "cmd"
            | "terminal"
            | "exec"
            | "run_command"
            | "run"
            | "python"
            | "python3"
            | "py"
            | "python_exec"
            | "run_python"
            | "web_fetch"
            | "fetch"
            | "curl"
            | "webfetch"
            | "memory"
            | "memory_search"
            | "memory_list"
            | "memory_get"
            | "memory_read"
            | "memory_save"
            | "memory_add"
            | "memory_set"
            | "memory_edit"
            | "memory_update"
            | "memory_delete"
            | "memory_remove"
            | "memory_forget"
    ) || name.starts_with("studio_")
        || name.starts_with("mcp:")
}

fn is_template_placeholder(path: &str, body: &str) -> bool {
    matches!(
        path,
        "ARG" | "relative/file" | "relative/path" | "subdir" | "sub/dir" | "filename" | "https://..."
    ) || matches!(
        body,
        "BODY"
            | "command"
            | "python3_code"
            | "python_script_code"
            | "complete file content"
            | "full_file_content"
            | "substring_or_symbol"
            | "pattern"
            | "one durable fact worth keeping"
    )
}

pub fn parse_inline_invocations_segment(
    clean_text: &str,
    allow_unclosed_tail: bool,
    strict_placeholder_filter: bool,
) -> Vec<InlineToolInvocation> {
    let mut list = Vec::new();

    // 1. Parse `<zeus_tool ...>...</zeus_tool>` and self-closing `<zeus_tool ... />`
    let mut search_from = 0;
    while let Some(rel_start) = clean_text[search_from..].find("<zeus_tool") {
        let start = search_from + rel_start;
        let rest = &clean_text[start..];
        let Some(gt) = rest.find('>') else { break };
        let header = &rest[10..gt];
        let self_closing = header.trim_end().ends_with('/');
        let (body, next_pos) = if self_closing {
            ("", start + gt + 1)
        } else if let Some(end_rel) = rest.find("</zeus_tool>") {
            (rest[gt + 1..end_rel].trim(), start + end_rel + 12)
        } else if allow_unclosed_tail && rest.len() > gt + 2 {
            (rest[gt + 1..].trim(), clean_text.len())
        } else {
            break;
        };
        search_from = next_pos;

        let name = extract_attr(header, "name").unwrap_or_default();
        let mut path_arg = extract_attr(header, "path")
            .or_else(|| extract_attr(header, "file"))
            .or_else(|| extract_attr(header, "id"))
            .or_else(|| extract_attr(header, "category"))
            .or_else(|| extract_attr(header, "key"))
            .or_else(|| extract_attr(header, "query"))
            .or_else(|| extract_attr(header, "cmd"))
            .or_else(|| extract_attr(header, "command"))
            .or_else(|| extract_attr(header, "url"))
            .unwrap_or_default();
        let start_line = extract_attr(header, "start").and_then(|v| v.parse::<usize>().ok());
        let end_line = extract_attr(header, "end").and_then(|v| v.parse::<usize>().ok());
        let mut eff_body = body.to_string();

        // If the model placed a JSON object inside `<zeus_tool>`, unpack common fields
        if eff_body.starts_with('{') && eff_body.ends_with('}') {
            if let Ok(j) = serde_json::from_str::<Value>(&eff_body) {
                if path_arg.is_empty() {
                    if let Some(p) = j
                        .get("path")
                        .or_else(|| j.get("file"))
                        .or_else(|| j.get("filePath"))
                        .or_else(|| j.get("id"))
                        .or_else(|| j.get("category"))
                        .or_else(|| j.get("key"))
                        .or_else(|| j.get("url"))
                        .and_then(|v| v.as_str())
                    {
                        path_arg = p.to_string();
                    }
                }
                if let Some(c) = j
                    .get("content")
                    .or_else(|| j.get("text"))
                    .or_else(|| j.get("fact"))
                    .or_else(|| j.get("value"))
                    .or_else(|| j.get("command"))
                    .or_else(|| j.get("cmd"))
                    .or_else(|| j.get("script"))
                    .or_else(|| j.get("code"))
                    .or_else(|| j.get("query"))
                    .or_else(|| j.get("pattern"))
                    .or_else(|| j.get("body"))
                    .and_then(|v| v.as_str())
                {
                    eff_body = c.to_string();
                }
            }
        } else if path_arg.is_empty()
            && matches!(name.as_str(), "read_file" | "read" | "cat" | "list_dir" | "ls")
            && !eff_body.contains('\n')
        {
            path_arg = eff_body.trim_matches(|c| c == '"' || c == '\'' || c == '`').to_string();
        }

        if strict_placeholder_filter
            && (!is_known_valid_tool(&name) || is_template_placeholder(&path_arg, &eff_body))
        {
            continue;
        }
        list.push(InlineToolInvocation {
            name,
            path: path_arg,
            start_line,
            end_line,
            body: eff_body,
            offset: start,
        });
    }

    // 2. Also parse `<tool_call>{...}</tool_call>` and `<function_call>{...}</function_call>`
    for (open_tag, close_tag) in [
        ("<tool_call>", "</tool_call>"),
        ("<function_call>", "</function_call>"),
    ] {
        let mut from = 0;
        while let Some(rel_start) = clean_text[from..].find(open_tag) {
            let start = from + rel_start;
            let after_open = start + open_tag.len();
            let Some(rel_end) = clean_text[after_open..].find(close_tag) else { break };
            let raw = clean_text[after_open..after_open + rel_end]
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();
            from = after_open + rel_end + close_tag.len();

            if let Ok(v) = serde_json::from_str::<Value>(raw) {
                let name = v
                    .get("name")
                    .or_else(|| v.get("tool"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let args = v
                    .get("arguments")
                    .or_else(|| v.get("parameters"))
                    .or_else(|| v.get("input"))
                    .or_else(|| v.get("args"))
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                let args_obj = if let Some(s) = args.as_str() {
                    serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({ "body": s }))
                } else {
                    args
                };
                let path = args_obj
                    .get("path")
                    .or_else(|| args_obj.get("file"))
                    .or_else(|| args_obj.get("filePath"))
                    .or_else(|| args_obj.get("url"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("")
                    .to_string();
                let start_line = args_obj.get("start").and_then(|x| x.as_u64()).map(|x| x as usize);
                let end_line = args_obj.get("end").and_then(|x| x.as_u64()).map(|x| x as usize);
                let body = if let Some(b) = args_obj
                    .get("command")
                    .or_else(|| args_obj.get("cmd"))
                    .or_else(|| args_obj.get("script"))
                    .or_else(|| args_obj.get("code"))
                    .or_else(|| args_obj.get("content"))
                    .or_else(|| args_obj.get("query"))
                    .or_else(|| args_obj.get("pattern"))
                    .or_else(|| args_obj.get("body"))
                    .and_then(|x| x.as_str())
                {
                    b.to_string()
                } else {
                    serde_json::to_string(&args_obj).unwrap_or_default()
                };
                if !name.is_empty() {
                    if strict_placeholder_filter
                        && (!is_known_valid_tool(&name) || is_template_placeholder(&path, &body))
                    {
                        continue;
                    }
                    list.push(InlineToolInvocation {
                        name,
                        path,
                        start_line,
                        end_line,
                        body,
                        offset: start,
                    });
                }
            }
        }
    }

    // 3. Support `<function name="...">`, `<function=name>`, and `<invoke name="...">` XML formats
    // (including Qwen3/GLM/Step `<tool_call><function=shell><parameter=command>...</parameter></function></tool_call>`)
    if list.is_empty() {
        for (open_tag, close_tag) in [("<function", "</function>"), ("<invoke", "</invoke>")] {
            let mut from = 0;
            while let Some(rel_s) = clean_text[from..].find(open_tag) {
                let start = from + rel_s;
                let rest = &clean_text[start..];
                let Some(gt) = rest.find('>') else { break };
                let header = &rest[open_tag.len()..gt];
                if header.starts_with("_call") {
                    from = start + gt + 1;
                    continue;
                }
                let Some(end_rel) = rest.find(close_tag) else { break };
                let inner = rest[gt + 1..end_rel].trim();
                from = start + end_rel + close_tag.len();
                let name = extract_attr(header, "name")
                    .or_else(|| {
                        header
                            .trim()
                            .strip_prefix('=')
                            .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string())
                    })
                    .unwrap_or_default();
                if name.is_empty() || (strict_placeholder_filter && !is_known_valid_tool(&name)) {
                    continue;
                }
                let mut path_arg = extract_attr(header, "path").unwrap_or_default();
                let mut start_line = extract_attr(header, "start").and_then(|v| v.parse::<usize>().ok());
                let mut end_line = extract_attr(header, "end").and_then(|v| v.parse::<usize>().ok());
                let mut body_out = String::new();
                let mut saw_params = false;
                for ptag in ["parameter", "param"] {
                    let p_open = format!("<{}", ptag);
                    let p_close = format!("</{}>", ptag);
                    let mut pfrom = 0;
                    while let Some(ps) = inner[pfrom..].find(&p_open) {
                        let pstart = pfrom + ps;
                        let prest = &inner[pstart..];
                        let Some(pgt) = prest.find('>') else { break };
                        let phead = &prest[p_open.len()..pgt];
                        if !phead.is_empty()
                            && !phead.starts_with(char::is_whitespace)
                            && !phead.starts_with('=')
                        {
                            pfrom = pstart + pgt + 1;
                            continue;
                        }
                        let Some(pend) = prest.find(&p_close) else { break };
                        let pval = prest[pgt + 1..pend].trim();
                        let pname = extract_attr(phead, "name")
                            .or_else(|| {
                                phead
                                    .trim()
                                    .strip_prefix('=')
                                    .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string())
                            })
                            .unwrap_or_default();
                        saw_params = true;
                        if matches!(pname.as_str(), "path" | "file" | "filePath" | "id" | "category" | "url") && path_arg.is_empty() {
                            path_arg = pval.to_string();
                        } else if pname == "start" {
                            start_line = pval.parse::<usize>().ok();
                        } else if pname == "end" {
                            end_line = pval.parse::<usize>().ok();
                        } else if matches!(pname.as_str(), "content" | "body" | "command" | "cmd" | "script" | "code" | "query" | "pattern" | "text" | "fact" | "value") {
                            body_out = pval.to_string();
                        } else if body_out.is_empty() && path_arg.is_empty() {
                            body_out = pval.to_string();
                        }
                        pfrom = pstart + pend + p_close.len();
                    }
                }
                if !saw_params {
                    body_out = inner.to_string();
                }
                list.push(InlineToolInvocation {
                    name,
                    path: path_arg,
                    start_line,
                    end_line,
                    body: body_out,
                    offset: start,
                });
            }
        }
    }

    // 4. Also support direct shorthand XML tags (`<bash>...</bash>`, `<python>...</python>`, `<memory_search>...</memory_search>`, etc.)
    // when a model emits `<bash>` instead of `<zeus_tool name="bash">`
    if list.is_empty() {
        for tag_name in [
            "bash",
            "shell",
            "python",
            "memory_search",
            "memory_save",
            "memory_edit",
            "memory_delete",
        ] {
            let open_pat = format!("<{}", tag_name);
            let close_pat = format!("</{}>", tag_name);
            let mut from = 0;
            while let Some(rel_s) = clean_text[from..].find(&open_pat) {
                let start = from + rel_s;
                let rest = &clean_text[start..];
                let Some(gt) = rest.find('>') else { break };
                let header = &rest[open_pat.len()..gt];
                if !header.is_empty()
                    && !header.starts_with(char::is_whitespace)
                    && !header.starts_with('/')
                {
                    from = start + gt + 1;
                    continue;
                }
                let self_closing = header.trim_end().ends_with('/');
                let (body, next_pos) = if self_closing {
                    ("", start + gt + 1)
                } else if let Some(end_rel) = rest.find(&close_pat) {
                    (rest[gt + 1..end_rel].trim(), start + end_rel + close_pat.len())
                } else {
                    break;
                };
                from = next_pos;
                let path_arg = extract_attr(header, "path")
                    .or_else(|| extract_attr(header, "id"))
                    .or_else(|| extract_attr(header, "category"))
                    .unwrap_or_default();
                if strict_placeholder_filter && is_template_placeholder(&path_arg, body) {
                    continue;
                }
                list.push(InlineToolInvocation {
                    name: tag_name.to_string(),
                    path: path_arg,
                    start_line: None,
                    end_line: None,
                    body: body.to_string(),
                    offset: start,
                });
            }
        }
    }

    // 5. Support K2-Horizon `<ifm|tool_call>NAME\n<ifm|arg_key>...</ifm|arg_key>\n<ifm|arg_value>...</ifm|arg_value>\n</ifm|tool_call>`
    if list.is_empty() {
        let open_pat = "<ifm|tool_call>";
        let close_pat = "</ifm|tool_call>";
        let mut from = 0;
        while let Some(rel_s) = clean_text[from..].find(open_pat) {
            let start = from + rel_s;
            let after_open = start + open_pat.len();
            let Some(rel_end) = clean_text[after_open..].find(close_pat) else { break };
            let inner = &clean_text[after_open..after_open + rel_end];
            from = after_open + rel_end + close_pat.len();
            let name_end = inner.find('<').unwrap_or(inner.len());
            let name = inner[..name_end].trim().to_string();
            if name.is_empty() || (strict_placeholder_filter && !is_known_valid_tool(&name)) {
                continue;
            }
            let mut path_arg = String::new();
            let mut start_line = None;
            let mut end_line = None;
            let mut body_out = String::new();
            let mut afrom = name_end;
            while let Some(ks) = inner[afrom..].find("<ifm|arg_key>") {
                let kstart = afrom + ks + "<ifm|arg_key>".len();
                let Some(ke) = inner[kstart..].find("</ifm|arg_key>") else { break };
                let key = inner[kstart..kstart + ke].trim();
                let after_k = kstart + ke + "</ifm|arg_key>".len();
                let Some(vs) = inner[after_k..].find("<ifm|arg_value>") else { break };
                let vstart = after_k + vs + "<ifm|arg_value>".len();
                let Some(ve) = inner[vstart..].find("</ifm|arg_value>") else { break };
                let val = inner[vstart..vstart + ve].trim();
                afrom = vstart + ve + "</ifm|arg_value>".len();
                if matches!(key, "path" | "file" | "filePath" | "id" | "category" | "url") && path_arg.is_empty() {
                    path_arg = val.to_string();
                } else if key == "start" {
                    start_line = val.parse::<usize>().ok();
                } else if key == "end" {
                    end_line = val.parse::<usize>().ok();
                } else if matches!(key, "command" | "cmd" | "code" | "script" | "content" | "body" | "query" | "pattern" | "text") {
                    body_out = val.to_string();
                } else if body_out.is_empty() {
                    body_out = val.to_string();
                }
            }
            list.push(InlineToolInvocation {
                name,
                path: path_arg,
                start_line,
                end_line,
                body: body_out,
                offset: start,
            });
        }
    }

    // 6. Support GPT-OSS Harmony `<|channel|>commentary to=zeus_tool name="shell" >...</zeus_tool>` or `to=functions.NAME ...<|message|>{...}`
    if list.is_empty() && clean_text.contains("to=zeus_tool") {
        let normalized = clean_text.replace("to=zeus_tool", "<zeus_tool");
        return parse_inline_invocations_segment(&normalized, allow_unclosed_tail, strict_placeholder_filter);
    }

    list.sort_by_key(|x| x.offset);
    list
}

/// Parse inline `<zeus_tool>` or `<tool_call>` blocks emitted by the agent
/// outside `<think>` blocks (with end-of-stream fallback if an upstream gateway routed valid
/// tool calls into `<think>`), executing local file/search/shell/python actions.
fn execute_inline_workspace_tools(
    app: &AppHandle,
    event_topic: &str,
    workspace_root: &str,
    full_text: &str,
    executed_ids: &mut std::collections::HashSet<String>,
    stream_ended: bool,
) {
    let clean_text = strip_thinking_blocks(full_text);
    let mut invocations = parse_inline_invocations_segment(&clean_text, stream_ended, true);
    if invocations.is_empty() && stream_ended && clean_text.trim().len() < 80 {
        // Fallback when an upstream gateway routes the model's <zeus_tool> call into reasoning_content (<think>)
        // and leaves the visible content empty or minimal.
        invocations = parse_inline_invocations_segment(full_text, false, true);
    }
    let eff_root = resolve_workspace_root(workspace_root);
    for inv in invocations {
        let name = inv.name.trim().to_string();
        let path_arg = inv.path.clone();
        let body = inv.body.trim();

        // Ignore literal syntax examples if a model ever echoes a template placeholder
        if matches!(name.as_str(), "TOOL" | "tool_name" | "NAME" | "") {
            continue;
        }

        let dedup_key = format!("{}|{}|{}|{}", inv.offset, name, path_arg, body);
        if executed_ids.contains(&dedup_key) {
            continue;
        }
        executed_ids.insert(dedup_key);
        let tool_id = format!("tool-{}-{}", executed_ids.len(), inv.offset);

        let _ = app.emit(
            event_topic,
            json!({
                "type": "tool_call",
                "id": tool_id,
                "name": name,
                "args": { "path": path_arg, "body": body }
            }),
        );

        if name.starts_with("studio_") || name.contains("studio_") {
            // Built-in Zeus Studio tools execute directly in the frontend webview runtime after receiving tool_call.
            continue;
        }

        let (ok, output) = execute_single_workspace_tool(&eff_root, &inv);

        let _ = app.emit(
            event_topic,
            json!({
                "type": "tool_result",
                "id": tool_id,
                "ok": ok,
                "output": output
            }),
        );
    }
}

pub fn execute_single_workspace_tool(eff_root: &str, inv: &InlineToolInvocation) -> (bool, String) {
    let name = inv.name.trim();
    let path_arg = &inv.path;
    let body = inv.body.trim();
    let eff_root = resolve_workspace_root(eff_root);

    match name {
        "read_file" | "read" | "cat" | "view_file" | "open_file" => {
            match fs_read(eff_root.clone(), path_arg.clone()) {
                Ok(content) => {
                    let total = content.lines().count();
                    let start = inv.start_line.unwrap_or(1).max(1);
                    let end = inv.end_line.unwrap_or(usize::MAX);
                    let mut out = String::new();
                    let mut last = start;
                    for (i, line) in content.lines().enumerate() {
                        let n = i + 1;
                        if n < start {
                            continue;
                        }
                        if n > end {
                            break;
                        }
                        if out.len() > 40000 {
                            out.push_str("\n[truncated: call read_file again with start/end]");
                            break;
                        }
                        out.push_str(line);
                        out.push('\n');
                        last = n;
                    }
                    (
                        true,
                        format!("[{} lines {}-{} of {}]\n{}", path_arg, start, last, total, out),
                    )
                }
                Err(e) => (false, e),
            }
        }
        "edit_file" | "edit" | "patch_file" | "replace_in_file" | "str_replace" => {
            match fs_read(eff_root.clone(), path_arg.clone()) {
                Ok(content) => match apply_search_replace(&content, body) {
                    Ok(updated) => match fs_write(eff_root.clone(), path_arg.clone(), updated) {
                        Ok(_) => (true, format!("Edited {}", path_arg)),
                        Err(e) => (false, e),
                    },
                    Err(e) => {
                        let preview: String = content.chars().take(6000).collect();
                        (
                            false,
                            format!(
                                "{}\n\nCurrent content of {}:\n{}\nRetry edit_file with exact lines from above or use write_file.",
                                e, path_arg, preview
                            ),
                        )
                    }
                },
                Err(e) => (false, e),
            }
        }
        "write_file" | "write" | "create_file" | "save_file" | "overwrite_file" | "sync_artboard" => {
            match fs_write(eff_root.clone(), path_arg.clone(), body.to_string()) {
                Ok(_) => (
                    true,
                    format!("Synchronized {} ({} bytes)", path_arg, body.len()),
                ),
                Err(e) => (false, e),
            }
        }
        "search_code" | "grep" | "rg" | "search" | "ripgrep" | "find_in_files" => {
            let query = if !body.is_empty() { body } else { path_arg.as_str() };
            let results = search_workspace_code(&eff_root, query, 25);
            if results.is_empty() {
                (true, format!("No matches found for '{}'", query))
            } else {
                let formatted = results
                    .iter()
                    .filter_map(|r| {
                        Some(format!(
                            "{}:{}: {}",
                            r.get("path")?.as_str()?,
                            r.get("line")?.as_u64()?,
                            r.get("snippet")?.as_str()?
                        ))
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                (true, formatted)
            }
        }
        "list_dir" | "ls" | "dir" | "list_files" | "glob" | "find_files" => {
            let p = Path::new(&eff_root);
            if path_arg.contains("..") {
                (false, "list_dir: path must stay inside the project".to_string())
            } else {
                let clean_rel = path_arg
                    .trim()
                    .trim_matches(|c| c == '.' || c == '/' || c == '\\');
                let target = if clean_rel.is_empty() {
                    p.to_path_buf()
                } else {
                    p.join(clean_rel)
                };
                let tree = walk_workspace(p, &target, 2);
                if tree.is_empty() {
                    (
                        true,
                        "Directory is empty (0 files). Proceed directly without re-listing."
                            .to_string(),
                    )
                } else {
                    let mut out = String::new();
                    format_tree_compact(&tree, 0, &mut out);
                    (true, out.trim_end().to_string())
                }
            }
        }
        "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run" => {
            let cmd_str = if !body.is_empty() {
                body.to_string()
            } else {
                path_arg.clone()
            };
            match shell_run(eff_root.clone(), cmd_str) {
                Ok(v) => format_exec_result(&v),
                Err(e) => (false, e),
            }
        }
        "python" | "python3" | "py" | "python_exec" | "run_python" => {
            let script = if !body.is_empty() {
                body.to_string()
            } else {
                path_arg.clone()
            };
            match python_run(eff_root.clone(), script) {
                Ok(v) => format_exec_result(&v),
                Err(e) => (false, e),
            }
        }
        "web_fetch" | "fetch" | "curl" | "webfetch" => {
            let target_url = if !path_arg.is_empty() {
                path_arg.as_str()
            } else {
                body
            };
            match reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .and_then(|c| c.get(target_url).send())
                .and_then(|r| r.text())
            {
                Ok(txt) => {
                    let readable = if txt.contains('<') {
                        html_to_text(&txt)
                    } else {
                        txt
                    };
                    (true, readable.chars().take(8000).collect::<String>())
                }
                Err(e) => (false, format!("web_fetch failed: {}", e)),
            }
        }
        "memory_search" | "memory_list" | "memory_get" | "memory_read" => {
            let store = crate::memory::MemoryStore::default();
            let cat = if matches!(
                path_arg.as_str(),
                "preferences" | "profile" | "topics" | "areas" | "all"
            ) {
                Some(path_arg.as_str())
            } else {
                None
            };
            let query = if !body.is_empty() {
                body
            } else if cat.is_none() {
                path_arg.as_str()
            } else {
                ""
            };
            let hits = store.search(query, cat, None);
            if hits.is_empty() {
                (true, "No matching memory entries found.".to_string())
            } else {
                let formatted = hits
                    .iter()
                    .take(30)
                    .map(|m| format!("{} | [{}] {}", m.id, m.category, m.text))
                    .collect::<Vec<_>>()
                    .join("\n");
                (true, formatted)
            }
        }
        "memory" | "memory_save" | "memory_add" | "memory_set" => {
            let store = crate::memory::MemoryStore::default();
            let cat = if !path_arg.is_empty() {
                Some(path_arg.clone())
            } else {
                Some("preferences".to_string())
            };
            let items = store.add(body.to_string(), cat, None);
            let latest_id = items.last().map(|m| m.id.as_str()).unwrap_or("mem");
            (
                true,
                format!(
                    "Saved memory {} ({} total items)",
                    latest_id,
                    items.len()
                ),
            )
        }
        "memory_edit" | "memory_update" => {
            let store = crate::memory::MemoryStore::default();
            match store.update(path_arg, body.to_string(), None) {
                Ok(items) => (
                    true,
                    format!(
                        "Updated memory '{}' ({} total items)",
                        path_arg,
                        items.len()
                    ),
                ),
                Err(e) => (false, e),
            }
        }
        "memory_delete" | "memory_remove" | "memory_forget" => {
            let store = crate::memory::MemoryStore::default();
            let target = if !path_arg.is_empty() {
                path_arg.as_str()
            } else {
                body
            };
            let items = store.remove(target);
            (
                true,
                format!(
                    "Removed memory '{}' ({} total items remaining)",
                    target,
                    items.len()
                ),
            )
        }
        other if other.starts_with("mcp:") => {
            let reg = crate::mcp::McpRegistry::default();
            reg.invoke_tool(other, body)
        }
        _ => (
            false,
            format!(
                "Unknown tool '{}'. Valid tools: shell (bash), python, read_file, write_file, edit_file, list_dir, search_code, web_fetch, memory_search, memory_save, memory_edit, memory_delete.",
                name
            ),
        ),
    }
}

/// Strips tags, scripts and styles from fetched HTML so the model reads text instead of markup.
fn html_to_text(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    let mut tag = String::new();
    let mut skip = false;
    for ch in html.chars() {
        if in_tag {
            if ch == '>' {
                in_tag = false;
                let t = tag.trim().to_lowercase();
                let name = t.split_whitespace().next().unwrap_or("").to_string();
                if name == "script" || name == "style" {
                    skip = true;
                } else if name == "/script" || name == "/style" {
                    skip = false;
                } else if matches!(
                    name.as_str(),
                    "p" | "/p" | "br" | "br/" | "div" | "/div" | "li" | "h1" | "h2" | "h3" | "tr" | "/tr"
                ) {
                    out.push('\n');
                }
                tag.clear();
            } else {
                tag.push(ch);
            }
        } else if ch == '<' {
            in_tag = true;
        } else if !skip {
            out.push(ch);
        }
    }
    let mut res = String::new();
    for line in out.lines() {
        let l = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if !l.is_empty() {
            res.push_str(&l);
            res.push('\n');
        }
    }
    res
}

fn replace_hunk_fuzzy(content: &str, search_raw: &str, replace_raw: &str, idx: usize) -> Result<String, String> {
    let crlf = content.contains("\r\n");
    let (search, replace) = if crlf {
        (
            search_raw.replace("\r\n", "\n").replace('\n', "\r\n"),
            replace_raw.replace("\r\n", "\n").replace('\n', "\r\n"),
        )
    } else {
        (search_raw.replace("\r\n", "\n"), replace_raw.replace("\r\n", "\n"))
    };
    let count = content.matches(search.as_str()).count();
    if count == 1 {
        return Ok(content.replacen(search.as_str(), replace.as_str(), 1));
    }
    if count > 1 {
        return Err(format!(
            "edit_file: SEARCH block {} matches {} places. Add surrounding lines so it is unique.",
            idx, count
        ));
    }

    // Fallback: line-trimmed whitespace-insensitive match when exact whitespace/indentation differs slightly
    let file_lines: Vec<&str> = content.lines().collect();
    let search_lines: Vec<&str> = search_raw.lines().map(|l| l.trim()).collect();
    if search_lines.is_empty() {
        return Err("edit_file: SEARCH block is empty".to_string());
    }
    let mut match_indices = Vec::new();
    if file_lines.len() >= search_lines.len() {
        for start in 0..=(file_lines.len() - search_lines.len()) {
            let matches = (0..search_lines.len()).all(|k| file_lines[start + k].trim() == search_lines[k]);
            if matches {
                match_indices.push(start);
            }
        }
    }
    if match_indices.len() == 1 {
        let start = match_indices[0];
        let mut rebuilt = Vec::new();
        rebuilt.extend_from_slice(&file_lines[..start]);
        for rl in replace_raw.lines() {
            rebuilt.push(rl);
        }
        rebuilt.extend_from_slice(&file_lines[start + search_lines.len()..]);
        let sep = if crlf { "\r\n" } else { "\n" };
        let mut joined = rebuilt.join(sep);
        if content.ends_with('\n') && !joined.ends_with('\n') {
            joined.push_str(sep);
        }
        return Ok(joined);
    }
    if match_indices.len() > 1 {
        return Err(format!(
            "edit_file: SEARCH block {} matches {} places (line-trimmed). Add surrounding lines so it is unique.",
            idx,
            match_indices.len()
        ));
    }
    Err(format!(
        "edit_file: SEARCH block {} not found. Read the file again and copy the lines accurately.",
        idx
    ))
}

fn find_marker_line(text: &str, ch: char) -> Option<(usize, usize)> {
    let mut offset = 0usize;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        let count = trimmed.chars().take_while(|&c| c == ch).count();
        if count >= 4 {
            let suffix = trimmed[count..].trim().to_ascii_uppercase();
            let valid = match ch {
                '<' => suffix.is_empty() || suffix.starts_with("SEARCH") || suffix.starts_with("ORIGINAL") || suffix.starts_with("OLD") || suffix.starts_with("HEAD"),
                '=' => suffix.is_empty(),
                '>' => suffix.is_empty() || suffix.starts_with("REPLACE") || suffix.starts_with("UPDATED") || suffix.starts_with("NEW"),
                _ => false,
            };
            if valid {
                return Some((offset, offset + line.len()));
            }
        }
        offset += line.len();
    }
    None
}

/// Applies one or more `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` blocks (or flexible 4..9 marker variants or JSON `oldString`/`newString` edits),
/// with automatic line-trimmed fuzzy fallback when exact whitespace differs.
fn apply_search_replace(content: &str, body: &str) -> Result<String, String> {
    let mut out = content.to_string();
    let mut rest = body;
    let mut n = 0usize;
    while let Some((_s_start, s_end)) = find_marker_line(rest, '<') {
        let after_s = &rest[s_end..];
        let Some((m_start, m_end)) = find_marker_line(after_s, '=') else {
            return Err("edit_file: missing ======= divider".to_string());
        };
        let search_raw = after_s[..m_start].trim_matches(|c| c == '\n' || c == '\r');
        let after_m = &after_s[m_end..];
        let (r_start, r_end) = find_marker_line(after_m, '>').unwrap_or((after_m.len(), after_m.len()));
        let replace_raw = after_m[..r_start].trim_matches(|c| c == '\n' || c == '\r');
        rest = &after_m[r_end..];
        if search_raw.is_empty() {
            return Err("edit_file: SEARCH block is empty".to_string());
        }
        out = replace_hunk_fuzzy(&out, search_raw, replace_raw, n + 1)?;
        n += 1;
    }
    if n > 0 {
        return Ok(out);
    }

    // Fallback: JSON {"oldString" / "old_str" / "search": "...", "newString" / "new_str" / "replace": "..."}
    let trimmed = body.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        if let Ok(j) = serde_json::from_str::<Value>(trimmed) {
            let old_s = j
                .get("oldString")
                .or_else(|| j.get("old_str"))
                .or_else(|| j.get("old_string"))
                .or_else(|| j.get("search"))
                .and_then(|v| v.as_str());
            let new_s = j
                .get("newString")
                .or_else(|| j.get("new_str"))
                .or_else(|| j.get("new_string"))
                .or_else(|| j.get("replace"))
                .and_then(|v| v.as_str());
            if let (Some(o), Some(r)) = (old_s, new_s) {
                return replace_hunk_fuzzy(&out, o, r, 1);
            }
        }
    }

    Err("edit_file: BODY needs a <<<<<<< SEARCH / ======= / >>>>>>> REPLACE block".to_string())
}

fn extract_attr(header: &str, key: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let pat = format!("{}={}", key, quote);
        if let Some(idx) = header.find(&pat) {
            let start = idx + pat.len();
            let rest = &header[start..];
            if let Some(end) = rest.find(quote) {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

#[tauri::command]
pub fn chat_stream(
    req: ChatRequest,
    app: AppHandle,
    engine: tauri::State<'_, Arc<ProviderEngine>>,
) -> Result<Value, String> {
    let request_id = req.request_id.clone();
    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = engine.state.lock() {
        guard
            .active_cancels
            .insert(request_id.clone(), cancel_flag.clone());
    }

    let engine_arc = engine.inner().clone();
    std::thread::spawn(move || {
        let topic = format!("zeus://chat/{}", req.request_id);
        let started = Instant::now();
        let mut accumulated = String::new();
        let mut executed_tools = std::collections::HashSet::new();

        // Never dump whole memory into the prompt; the agent fetches/records/edits memory on demand via memory_* tools.
        let mut enriched_req = req.clone();
        if let Some(root) = &req.workspace_root {
            if !root.trim().is_empty() && !enriched_req.system.contains("## Agent tools") {
                enriched_req.system.push_str(
                    "\n\n## Local Workspace Agent Tools\nYou can read or synchronize files in the open project folder by emitting `<zeus_tool name=\"write_file\" path=\"src/Screen.html\">...content...</zeus_tool>` or `<zeus_tool name=\"search_code\">query</zeus_tool>`.",
                );
            }
        }

        let res = dispatch_stream(&engine_arc, &enriched_req, &cancel_flag, |delta| {
            accumulated.push_str(delta);
            let _ = app.emit(
                &topic,
                json!({
                    "type": "delta",
                    "text": delta
                }),
            );
            let stripped = strip_thinking_blocks(&accumulated);
            if stripped.contains("</zeus_tool>")
                || stripped.contains("</tool_call>")
                || stripped.contains("</function_call>")
                || stripped.contains("</function>")
                || stripped.contains("</invoke>")
                || stripped.contains("</bash>")
                || stripped.contains("</shell>")
                || stripped.contains("</python>")
                || stripped.contains("</memory_search>")
                || stripped.contains("</memory_save>")
                || stripped.contains("</memory_edit>")
                || stripped.contains("</memory_delete>")
                || stripped.contains("</ifm|tool_call>")
                || (stripped.contains("<zeus_tool") && stripped.contains("/>"))
            {
                let root = enriched_req.workspace_root.as_deref().unwrap_or("");
                execute_inline_workspace_tools(
                    &app,
                    &topic,
                    root,
                    &accumulated,
                    &mut executed_tools,
                    false,
                );
            }
        });

        if res.is_ok()
            && (accumulated.contains("<zeus_tool")
                || accumulated.contains("to=zeus_tool")
                || accumulated.contains("<tool_call>")
                || accumulated.contains("<function_call>")
                || accumulated.contains("<function")
                || accumulated.contains("<invoke")
                || accumulated.contains("<ifm|tool_call>")
                || accumulated.contains("<bash")
                || accumulated.contains("<shell")
                || accumulated.contains("<python")
                || accumulated.contains("<memory_"))
        {
            let root = enriched_req.workspace_root.as_deref().unwrap_or("");
            execute_inline_workspace_tools(
                &app,
                &topic,
                root,
                &accumulated,
                &mut executed_tools,
                true,
            );
        }

        let elapsed_secs = started.elapsed().as_secs_f64().max(0.05);
        let out_tokens = (accumulated.len() / 4).max(1);
        let tps = (out_tokens as f64 / elapsed_secs).round() as u64;

        match res {
            Ok(()) => {
                let _ = app.emit(
                    &topic,
                    json!({
                        "type": "done",
                        "usage": {
                            "inputTokens": enriched_req.system.len() / 4,
                            "outputTokens": out_tokens,
                            "tokensPerSecond": tps
                        }
                    }),
                );
            }
            Err(err) => {
                let _ = app.emit(
                    &topic,
                    json!({
                        "type": "error",
                        "message": err
                    }),
                );
            }
        }

        if let Ok(mut guard) = engine_arc.state.lock() {
            guard.active_cancels.remove(&req.request_id);
        }
    });

    Ok(json!({ "requestId": request_id }))
}
