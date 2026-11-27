use crate::providers::{
    catalog, chatjimmy_complete, dispatch_stream, verify_model_fingerprint, ChatRequest,
    ModelFingerprintReport, ProviderEngine, ProviderInfo,
};
use crate::workspace::{
    audit_workspace_files, bm25_search_project, checkpoint_capture_file, docs_lookup_reference,
    fs_delete, fs_move, fs_read, fs_write, glob_workspace_files, project_outline_of, python_run,
    safe_join, search_workspace_code, shell_run, walk_workspace, FileNode,
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
pub fn provider_verify_model(
    provider: String,
    model: String,
    engine: tauri::State<'_, Arc<ProviderEngine>>,
) -> Result<ModelFingerprintReport, String> {
    verify_model_fingerprint(engine.inner(), &provider, &model)
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

/// Strip `<think>...</think>` and `<thinking>...</thinking>` blocks (including unclosed trailing think blocks
/// and multi-part reasoning split by upstream vLLM servers on quoted `<think>...</think>`)
/// so tool tags mentioned inside a model's internal reasoning trace are never executed as real tools.
pub fn strip_thinking_blocks(raw: &str) -> String {
    let mut out = raw
        .replace("<think>...</think>", "`<think>...</think>`")
        .replace("<thinking>...</thinking>", "`<thinking>...</thinking>`");
    for (open_tag, close_tag) in [
        ("<think>", "</think>"),
        ("<thinking>", "</thinking>"),
        ("<thought>", "</thought>"),
        ("<reasoning>", "</reasoning>"),
        ("<|begin_of_thought|>", "<|end_of_thought|>"),
    ] {
        let mut search_from = 0usize;
        loop {
            let lower = out.to_ascii_lowercase();
            if search_from >= lower.len() {
                break;
            }
            let Some(rel_start) = lower[search_from..].find(open_tag) else { break };
            let start = search_from + rel_start;
            // Ignore `<think>` if quoted inside inline backticks or quotes
            if start > 0 && matches!(out.as_bytes()[start - 1], b'`' | b'"' | b'\'') {
                search_from = start + open_tag.len();
                continue;
            }
            let after_open = start + open_tag.len();
            // Find the LAST non-backticked closing tag if the stream starts with `<think>` and an upstream server split early
            let mut found_end: Option<usize> = None;
            let mut scan = after_open;
            while scan < lower.len() {
                let Some(rel_end) = lower[scan..].find(close_tag) else { break };
                let cand = scan + rel_end;
                if cand > 0 && matches!(out.as_bytes()[cand - 1], b'`' | b'"' | b'\'') {
                    scan = cand + close_tag.len();
                    continue;
                }
                found_end = Some(cand);
                if start > 4 {
                    break;
                }
                scan = cand + close_tag.len();
            }
            if let Some(end_pos) = found_end {
                let end = end_pos + close_tag.len();
                let tail = out[end..].trim_start();
                if start == 0 && (tail.starts_with(", then") || tail.starts_with(", and")) && !tail.contains(close_tag) {
                    out.truncate(start);
                    break;
                }
                out.replace_range(start..end, "");
            } else {
                // If `<think>` was mentioned mid-line in prose without a closing tag, only remove the tag itself
                let line_start = out[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
                if !out[line_start..start].trim().is_empty() {
                    out.replace_range(start..after_open, "");
                    continue;
                }
                out.truncate(start);
                break;
            }
        }
    }
    // Also strip orphan prefix reasoning when an upstream template pre-opened <think> on the server
    for close_tag in ["</think>", "</thinking>", "</thought>", "</reasoning>", "<|end_of_thought|>"] {
        let lower = out.to_ascii_lowercase();
        if let Some(end_idx) = lower.rfind(close_tag) {
            if end_idx > 0 && matches!(out.as_bytes()[end_idx - 1], b'`' | b'"' | b'\'') {
                continue;
            }
            let drain_to = end_idx + close_tag.len();
            out.replace_range(0..drain_to, "");
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
            | "cat_file"
            | "view_file"
            | "open_file"
            | "read_file_lines"
            | "write_file"
            | "write"
            | "create_file"
            | "save_file"
            | "overwrite_file"
            | "append_file"
            | "sync_artboard"
            | "delete_file"
            | "delete"
            | "remove_file"
            | "rm"
            | "del"
            | "unlink"
            | "move_file"
            | "rename_file"
            | "mv"
            | "edit_file"
            | "edit"
            | "patch_file"
            | "replace_in_file"
            | "str_replace"
            | "str_replace_editor"
            | "multi_edit"
            | "multiedit"
            | "multi_edit_file"
            | "search_code"
            | "grep"
            | "rg"
            | "search"
            | "search_files"
            | "ripgrep"
            | "find_in_files"
            | "search_project"
            | "docs_lookup"
            | "list_dir"
            | "ls"
            | "dir"
            | "list_files"
            | "list_directory"
            | "print_tree"
            | "tree"
            | "glob"
            | "find_files"
            | "check_syntax"
            | "audit_project"
            | "review_project"
            | "lint_project"
            | "update_plan"
            | "todowrite"
            | "todo_write"
            | "ask_user"
            | "ask"
            | "question"
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
            | "recall_memory"
            | "memory_save"
            | "save_memory"
            | "memory_add"
            | "memory_set"
            | "memory_edit"
            | "memory_update"
            | "memory_delete"
            | "memory_remove"
            | "memory_forget"
            | "load_skill"
            | "use_skill"
            | "get_skill"
            | "read_skill"
            | "skill"
            | "subagent"
            | "spawn_subagent"
            | "task"
            | "lmfingerprint"
            | "verify_model"
            | "model_fingerprint"
    ) || name.starts_with("studio_")
        || name.starts_with("mcp:")
}

fn is_template_placeholder(name: &str, path: &str, body: &str) -> bool {
    let p = path.trim();
    let b = body.trim();
    if matches!(
        p,
        "ARG" | "relative/file" | "relative/path" | "subdir" | "sub/dir" | "filename" | "https://..." | "..." | "path/to/file"
    ) || matches!(
        b,
        "BODY"
            | "command"
            | "python3_code"
            | "python_script_code"
            | "complete file content"
            | "complete content"
            | "full_file_content"
            | "substring_or_symbol"
            | "pattern"
            | "one durable fact worth keeping"
            | "..."
    ) {
        return true;
    }
    if matches!(name, "shell" | "bash" | "sh" | "cmd" | "python" | "python3" | "py") && b.is_empty() && p.is_empty() {
        return true;
    }
    if matches!(name, "read_file" | "read" | "cat" | "write_file" | "write" | "create_file" | "edit_file" | "edit" | "patch_file") && p.is_empty() {
        return true;
    }
    if matches!(name, "write_file" | "write" | "create_file" | "edit_file" | "edit" | "patch_file") && b.is_empty() {
        return true;
    }
    false
}

pub fn parse_inline_invocations_segment(
    clean_text: &str,
    allow_unclosed_tail: bool,
    strict_placeholder_filter: bool,
) -> Vec<InlineToolInvocation> {
    let mut list = Vec::new();

    // 1. Parse `<zeus_tool ...>...</zeus_tool>` and self-closing `<zeus_tool ... />`
    // Uses depth-aware matching so `write_file`/`edit_file` bodies that document `<zeus_tool>` syntax
    // (such as `AGENTS.md`) never truncate at an inner example closing tag.
    let mut search_from = 0;
    while let Some(rel_start) = clean_text[search_from..].find("<zeus_tool") {
        let start = search_from + rel_start;
        let rest = &clean_text[start..];
        let Some(gt) = rest.find('>') else { break };
        let header = &rest[10..gt];
        let self_closing = header.trim_end().ends_with('/');
        let matched_end = if self_closing {
            None
        } else {
            let mut depth = 1usize;
            let mut scan = gt + 1;
            let mut found_end = None;
            while scan < rest.len() {
                let next_open = rest[scan..].find("<zeus_tool").map(|i| scan + i);
                let next_close = rest[scan..].find("</zeus_tool>").map(|i| scan + i);
                match (next_open, next_close) {
                    (Some(o), Some(c)) if o < c => {
                        if let Some(ogt) = rest[o..].find('>') {
                            let ohead = &rest[o + 10..o + ogt];
                            if !ohead.trim_end().ends_with('/') {
                                depth += 1;
                            }
                            scan = o + ogt + 1;
                        } else {
                            scan = c;
                        }
                    }
                    (_, Some(c)) => {
                        depth -= 1;
                        if depth == 0 {
                            found_end = Some(c);
                            break;
                        }
                        scan = c + 12;
                    }
                    _ => break,
                }
            }
            found_end.or_else(|| rest.find("</zeus_tool>"))
        };
        let (body, next_pos) = if self_closing {
            ("", start + gt + 1)
        } else if let Some(end_rel) = matched_end {
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
        let mut start_line = extract_attr(header, "start").and_then(|v| v.parse::<usize>().ok());
        let mut end_line = extract_attr(header, "end").and_then(|v| v.parse::<usize>().ok());
        let mut eff_body = if body.is_empty() {
            extract_attr(header, "content")
                .or_else(|| extract_attr(header, "text"))
                .or_else(|| extract_attr(header, "fact"))
                .or_else(|| extract_attr(header, "value"))
                .or_else(|| extract_attr(header, "code"))
                .or_else(|| extract_attr(header, "script"))
                .unwrap_or_default()
        } else {
            body.to_string()
        };

        // If the model placed `<parameter name="...">...</parameter>` tags inside `<zeus_tool>`, unpack them
        if eff_body.contains("<parameter") || eff_body.contains("<param") || eff_body.contains("<antml:parameter") {
            let mut body_out = String::new();
            let mut saw_params = false;
            for ptag in ["parameter", "param", "antml:parameter"] {
                let p_open = format!("<{}", ptag);
                let p_close = format!("</{}>", ptag);
                let mut pfrom = 0;
                while let Some(ps) = eff_body[pfrom..].find(&p_open) {
                    let pstart = pfrom + ps;
                    let prest = &eff_body[pstart..];
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
            if saw_params {
                eff_body = body_out;
            }
        }

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

        if !is_known_valid_tool(&name) || is_template_placeholder(&name, &path_arg, &eff_body) {
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
    // (including unclosed tail when vLLM strips `</tool_call>` as a stop token at end of stream)
    for (open_tag, close_tag) in [
        ("<tool_call>", "</tool_call>"),
        ("<function_call>", "</function_call>"),
    ] {
        let mut from = 0;
        while let Some(rel_start) = clean_text[from..].find(open_tag) {
            let start = from + rel_start;
            let after_open = start + open_tag.len();
            let (raw_slice, next_from) = if let Some(rel_end) = clean_text[after_open..].find(close_tag) {
                (&clean_text[after_open..after_open + rel_end], after_open + rel_end + close_tag.len())
            } else if allow_unclosed_tail && clean_text.len() > after_open + 2 {
                (&clean_text[after_open..], clean_text.len())
            } else {
                break;
            };
            let raw = raw_slice
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();
            from = next_from;

            let parsed_val = serde_json::from_str::<Value>(raw).ok().or_else(|| {
                // Support GLM-4/5 native `<tool_call>tool_name\n{"arg": "val"}</tool_call>` format
                let (first_line, rest_json) = raw.split_once('\n')?;
                let fn_name = first_line.trim();
                if fn_name.is_empty() || fn_name.contains(' ') || fn_name.starts_with('<') {
                    return None;
                }
                let args_v = serde_json::from_str::<Value>(rest_json.trim()).ok()?;
                Some(json!({ "name": fn_name, "arguments": args_v }))
            });
            if let Some(v) = parsed_val {
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
                    .or_else(|| args_obj.get("text"))
                    .or_else(|| args_obj.get("fact"))
                    .or_else(|| args_obj.get("value"))
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
                    if !is_known_valid_tool(&name) || is_template_placeholder(&name, &path, &body) {
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

    // 3. Support `<function name="...">`, `<function=name>`, `<invoke name="...">`, and `<antml:invoke name="...">` XML formats
    // (including Qwen3/GLM/Step `<tool_call><function=shell><parameter=command>...</parameter></function></tool_call>`)
    if list.is_empty() {
        for (open_tag, close_tag) in [
            ("<function", "</function>"),
            ("<invoke", "</invoke>"),
            ("<antml:invoke", "</antml:invoke>"),
        ] {
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
                for ptag in ["parameter", "param", "antml:parameter"] {
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
                } else {
                    // Unpack Stormy `<parameter=old_string>` + `<parameter=new_string>` or `<parameter=source>` + `<parameter=destination>`
                    let mut param_map = serde_json::Map::new();
                    for ptag in ["parameter", "param", "antml:parameter"] {
                        let p_open = format!("<{}", ptag);
                        let p_close = format!("</{}>", ptag);
                        let mut pfrom = 0;
                        while let Some(ps) = inner[pfrom..].find(&p_open) {
                            let pstart = pfrom + ps;
                            let prest = &inner[pstart..];
                            let Some(pgt) = prest.find('>') else { break };
                            let phead = &prest[p_open.len()..pgt];
                            let Some(pend) = prest.find(&p_close) else { break };
                            let pval = prest[pgt + 1..pend].trim_matches(|c| c == '\n' || c == '\r');
                            let pname = extract_attr(phead, "name")
                                .or_else(|| {
                                    phead
                                        .trim()
                                        .strip_prefix('=')
                                        .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string())
                                })
                                .unwrap_or_default();
                            if !pname.is_empty() {
                                param_map.insert(pname, Value::String(pval.to_string()));
                            }
                            pfrom = pstart + pend + p_close.len();
                        }
                    }
                    let old_s = param_map
                        .get("old_string")
                        .or_else(|| param_map.get("oldString"))
                        .or_else(|| param_map.get("old_str"))
                        .or_else(|| param_map.get("search"))
                        .and_then(|v| v.as_str());
                    let new_s = param_map
                        .get("new_string")
                        .or_else(|| param_map.get("newString"))
                        .or_else(|| param_map.get("new_str"))
                        .or_else(|| param_map.get("replace"))
                        .and_then(|v| v.as_str());
                    if let (Some(o), Some(n)) = (old_s, new_s) {
                        let rep_all = param_map
                            .get("replace_all")
                            .and_then(|v| v.as_str())
                            .map(|s| s.eq_ignore_ascii_case("true"))
                            .unwrap_or(false);
                        body_out = json!({
                            "old_string": o,
                            "new_string": n,
                            "replace_all": rep_all
                        })
                        .to_string();
                    } else if param_map.contains_key("edits")
                        || param_map.contains_key("questions")
                        || param_map.contains_key("tasks")
                        || param_map.contains_key("plan")
                        || param_map.contains_key("source")
                        || param_map.contains_key("destination")
                        || param_map.contains_key("symbols")
                        || param_map.contains_key("append")
                        || param_map.contains_key("paths")
                        || param_map.contains_key("include")
                    {
                        if path_arg.is_empty() {
                            if let Some(p) = param_map
                                .get("path")
                                .or_else(|| param_map.get("source"))
                                .or_else(|| param_map.get("pattern"))
                                .or_else(|| param_map.get("query"))
                                .or_else(|| param_map.get("name"))
                                .and_then(|v| v.as_str())
                            {
                                path_arg = p.to_string();
                            }
                        }
                        if let Some(off) = param_map.get("offset").and_then(|v| v.as_str()).and_then(|s| s.parse::<usize>().ok()) {
                            start_line = Some(off);
                            if let Some(lim) = param_map.get("limit").and_then(|v| v.as_str()).and_then(|s| s.parse::<usize>().ok()) {
                                end_line = Some(off + lim.saturating_sub(1));
                            }
                        }
                        body_out = Value::Object(param_map).to_string();
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
    }

    // 4. Also support direct shorthand XML tags (`<bash>...</bash>`, `<python>...</python>`, `<edit_file path="...">...</edit_file>`, etc.)
    // when a model emits `<edit_file>` or `<bash>` instead of `<zeus_tool name="...">`
    if list.is_empty() {
        for tag_name in [
            "bash",
            "shell",
            "python",
            "read_file",
            "write_file",
            "edit_file",
            "delete_file",
            "search_code",
            "list_dir",
            "web_fetch",
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
                if start > 0 && clean_text.as_bytes()[start - 1] == b'`' {
                    from = start + open_pat.len();
                    continue;
                }
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
                } else if allow_unclosed_tail && rest.len() > gt + 2 && !header.trim().is_empty() {
                    (rest[gt + 1..].trim(), clean_text.len())
                } else {
                    break;
                };
                from = next_pos;
                let mut path_arg = extract_attr(header, "path")
                    .or_else(|| extract_attr(header, "file"))
                    .or_else(|| extract_attr(header, "id"))
                    .or_else(|| extract_attr(header, "category"))
                    .or_else(|| extract_attr(header, "url"))
                    .unwrap_or_default();
                if path_arg.is_empty()
                    && matches!(tag_name, "read_file" | "list_dir" | "delete_file")
                    && !body.contains('\n')
                {
                    path_arg = body.trim_matches(|c| c == '"' || c == '\'' || c == '`').to_string();
                }
                let start_line = extract_attr(header, "start").and_then(|v| v.parse::<usize>().ok());
                let end_line = extract_attr(header, "end").and_then(|v| v.parse::<usize>().ok());
                if is_template_placeholder(tag_name, &path_arg, body) {
                    continue;
                }
                list.push(InlineToolInvocation {
                    name: tag_name.to_string(),
                    path: path_arg,
                    start_line,
                    end_line,
                    body: body.to_string(),
                    offset: start,
                });
            }
        }
    }

    // 5. Support K2-Horizon `<ifm|tool_call>NAME\n<ifm|arg_key>...</ifm|arg_key>\n<ifm|arg_value>...</ifm|arg_value>\n</ifm|tool_call>`
    // and hybrid `<ifm|tool_call>edit_file path="src/router.js">...</zeus_tool>` (even when mixed with `<zeus_tool>` in the same turn)
    {
        let open_pat = "<ifm|tool_call>";
        let mut from = 0;
        while let Some(rel_s) = clean_text[from..].find(open_pat) {
            let start = from + rel_s;
            let after_open = start + open_pat.len();
            let rest_after = &clean_text[after_open..];
            let end_ifm = rest_after.find("</ifm|tool_call>");
            let end_zeus = rest_after.find("</zeus_tool>");
            let (rel_end, close_len) = match (end_ifm, end_zeus) {
                (Some(i), Some(z)) if i < z => (i, "</ifm|tool_call>".len()),
                (_, Some(z)) => (z, "</zeus_tool>".len()),
                (Some(i), None) => (i, "</ifm|tool_call>".len()),
                (None, None) if allow_unclosed_tail && rest_after.len() > 4 => (rest_after.len(), 0),
                (None, None) => break,
            };
            let inner = &rest_after[..rel_end];
            from = after_open + rel_end + close_len;
            if !inner.contains("<ifm|arg_key>") {
                if let Some(gt) = inner.find('>') {
                    let head = inner[..gt].trim();
                    let body_part = inner[gt + 1..].trim();
                    let tool_name = head.split_whitespace().next().unwrap_or("").trim().to_string();
                    let path_attr = extract_attr(head, "path")
                        .or_else(|| extract_attr(head, "file"))
                        .unwrap_or_default();
                    if is_known_valid_tool(&tool_name) && !is_template_placeholder(&tool_name, &path_attr, body_part) {
                        list.push(InlineToolInvocation {
                            name: tool_name,
                            path: path_attr,
                            start_line: None,
                            end_line: None,
                            body: body_part.to_string(),
                            offset: start,
                        });
                        continue;
                    }
                }
            }
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
                let ve = inner[vstart..].find("</ifm|arg_value>").unwrap_or(inner.len() - vstart);
                let val = inner[vstart..vstart + ve].trim();
                afrom = (vstart + ve + "</ifm|arg_value>".len()).min(inner.len());
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
    if list.is_empty() && clean_text.contains("to=functions.") {
        let mut from = 0;
        while let Some(rel_s) = clean_text[from..].find("to=functions.") {
            let start = from + rel_s;
            let after_prefix = start + "to=functions.".len();
            let rest = &clean_text[after_prefix..];
            let name_len = rest
                .find(|c: char| c.is_whitespace() || c == '<' || c == '{')
                .unwrap_or(rest.len());
            let name = rest[..name_len].trim().to_string();
            let after_name = &rest[name_len..];
            let Some(brace_s) = after_name.find('{') else {
                from = after_prefix + name_len;
                continue;
            };
            let json_slice = &after_name[brace_s..];
            let end_tok = json_slice
                .find("<|call|>")
                .or_else(|| json_slice.find("<|end|>"))
                .or_else(|| json_slice.find("<|return|>"))
                .unwrap_or(json_slice.len());
            let candidate_json = json_slice[..end_tok].trim();
            from = after_prefix + name_len + brace_s + end_tok;
            if !name.is_empty() && (!strict_placeholder_filter || is_known_valid_tool(&name)) {
                let fake_tc = format!(
                    "<tool_call>{}</tool_call>",
                    json!({ "name": name, "arguments": serde_json::from_str::<Value>(candidate_json).unwrap_or_else(|_| json!({ "body": candidate_json })) })
                );
                list.extend(parse_inline_invocations_segment(&fake_tc, false, strict_placeholder_filter));
            }
        }
    }

    // 7. Support K2-Horizon `<|open|>call name="..."><|sep|><|open|>argument key="..."><|sep|>...<|close|>argument...<|close|>call`
    if clean_text.contains("<|open|>call") {
        let mut from = 0;
        while let Some(rel_s) = clean_text[from..].find("<|open|>call") {
            let start = from + rel_s;
            let after_open = start + "<|open|>call".len();
            let rest = &clean_text[after_open..];
            let end_call = rest.find("<|close|>call").unwrap_or(rest.len());
            let block = &rest[..end_call];
            from = after_open + (end_call + "<|close|>call".len()).min(rest.len());
            let Some(sep_idx) = block.find("<|sep|>") else { continue };
            let head = &block[..sep_idx];
            let name = extract_attr(head, "name").unwrap_or_else(|| head.trim().to_string());
            if !is_known_valid_tool(&name) {
                continue;
            }
            let mut path_arg = String::new();
            let mut body_out = String::new();
            let mut search_part = String::new();
            let mut replace_part = String::new();
            let mut afrom = sep_idx + "<|sep|>".len();
            while let Some(as_rel) = block[afrom..].find("<|open|>argument") {
                let astart = afrom + as_rel + "<|open|>argument".len();
                let arest = &block[astart..];
                let Some(asep) = arest.find("<|sep|>") else { break };
                let ahead = &arest[..asep];
                let key = extract_attr(ahead, "key")
                    .or_else(|| extract_attr(ahead, "name"))
                    .unwrap_or_default();
                let val_start = asep + "<|sep|>".len();
                let val_end = arest[val_start..]
                    .find("<|close|>argument")
                    .unwrap_or(arest.len() - val_start);
                let val = arest[val_start..val_start + val_end].trim();
                afrom = astart + (val_start + val_end + "<|close|>argument".len()).min(arest.len());
                if matches!(key.as_str(), "path" | "file" | "filePath" | "id" | "category" | "url") && path_arg.is_empty() {
                    path_arg = val.to_string();
                } else if matches!(key.as_str(), "search" | "oldString" | "old_str" | "old_string") {
                    search_part = val.to_string();
                } else if matches!(key.as_str(), "replace" | "newString" | "new_str" | "new_string") {
                    replace_part = val.to_string();
                } else if matches!(key.as_str(), "command" | "cmd" | "code" | "script" | "content" | "body" | "query" | "text" | "fact" | "value") {
                    body_out = val.to_string();
                } else if body_out.is_empty() {
                    body_out = val.to_string();
                }
            }
            if !search_part.is_empty() {
                body_out = format!("<<<<<<< SEARCH\n{}\n=======\n{}\n>>>>>>> REPLACE", search_part, replace_part);
            }
            if !is_template_placeholder(&name, &path_arg, &body_out) {
                list.push(InlineToolInvocation {
                    name,
                    path: path_arg,
                    start_line: None,
                    end_line: None,
                    body: body_out,
                    offset: start,
                });
            }
        }
    }

    // 8. Support Stormy's Kimi K2 (`<|tool_call_begin|>functions.NAME:0<|tool_call_argument_begin|>{...}<|tool_call_end|>`),
    // DeepSeek (`<｜tool▁call▁begin｜>function<｜tool▁sep｜>NAME\n{...}<｜tool▁call▁end｜>`), and Mistral (`[TOOL_CALLS][{...}]`)
    if clean_text.contains("<|tool_call_begin|>") {
        let mut from = 0;
        while let Some(rel_s) = clean_text[from..].find("<|tool_call_begin|>") {
            let start = from + rel_s;
            let after_open = start + "<|tool_call_begin|>".len();
            let rest = &clean_text[after_open..];
            let Some(arg_s) = rest.find("<|tool_call_argument_begin|>") else { break };
            let raw_name = rest[..arg_s].trim();
            let clean_name = raw_name
                .strip_prefix("functions.")
                .unwrap_or(raw_name)
                .split(':')
                .next()
                .unwrap_or("")
                .trim();
            let after_arg = arg_s + "<|tool_call_argument_begin|>".len();
            let end_call = rest[after_arg..]
                .find("<|tool_call_end|>")
                .unwrap_or(rest.len() - after_arg);
            let json_arg = rest[after_arg..after_arg + end_call].trim();
            from = after_open + (after_arg + end_call + "<|tool_call_end|>".len()).min(rest.len());
            if !clean_name.is_empty() {
                let wrapped = format!(
                    "<tool_call>{}</tool_call>",
                    json!({
                        "name": clean_name,
                        "arguments": serde_json::from_str::<Value>(json_arg).unwrap_or_else(|_| json!({ "body": json_arg }))
                    })
                );
                list.extend(parse_inline_invocations_segment(&wrapped, false, strict_placeholder_filter));
            }
        }
    }
    if clean_text.contains("<｜tool▁call▁begin｜>") {
        let mut from = 0;
        while let Some(rel_s) = clean_text[from..].find("<｜tool▁call▁begin｜>") {
            let start = from + rel_s;
            let after_open = start + "<｜tool▁call▁begin｜>".len();
            let rest = &clean_text[after_open..];
            let Some(sep_s) = rest.find("<｜tool▁sep｜>") else { break };
            let after_sep = sep_s + "<｜tool▁sep｜>".len();
            let end_call = rest[after_sep..]
                .find("<｜tool▁call▁end｜>")
                .unwrap_or(rest.len() - after_sep);
            let inner = rest[after_sep..after_sep + end_call].trim();
            from = after_open + (after_sep + end_call + "<｜tool▁call▁end｜>".len()).min(rest.len());
            let name_end = inner.find(|c: char| c.is_whitespace() || c == '{' || c == '`').unwrap_or(inner.len());
            let clean_name = inner[..name_end].trim();
            let json_part = inner[name_end..]
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();
            if !clean_name.is_empty() {
                let wrapped = format!(
                    "<tool_call>{}</tool_call>",
                    json!({
                        "name": clean_name,
                        "arguments": serde_json::from_str::<Value>(json_part).unwrap_or_else(|_| json!({ "body": json_part }))
                    })
                );
                list.extend(parse_inline_invocations_segment(&wrapped, false, strict_placeholder_filter));
            }
        }
    }
    if clean_text.contains("[TOOL_CALLS]") {
        if let Some(pos) = clean_text.find("[TOOL_CALLS]") {
            let rest = clean_text[pos + "[TOOL_CALLS]".len()..].trim();
            if rest.starts_with('[') {
                if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(rest) {
                    for item in arr {
                        let wrapped = format!("<tool_call>{}</tool_call>", item);
                        list.extend(parse_inline_invocations_segment(&wrapped, false, strict_placeholder_filter));
                    }
                }
            }
        }
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

        let req_tag = event_topic.rsplit('/').next().unwrap_or("r");
        let dedup_key = format!("{}|{}|{}|{}", inv.offset, name, path_arg, body);
        if executed_ids.contains(&dedup_key) {
            continue;
        }
        executed_ids.insert(dedup_key);
        let tool_id = format!("tool-{}-{}-{}", req_tag, executed_ids.len(), inv.offset);

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

        // Stormy Checkpoints: capture pre-image before any file mutation tool runs
        let is_file_mutation = matches!(
            name.as_str(),
            "write_file"
                | "write"
                | "create_file"
                | "save_file"
                | "overwrite_file"
                | "append_file"
                | "sync_artboard"
                | "edit_file"
                | "edit"
                | "patch_file"
                | "replace_in_file"
                | "str_replace"
                | "str_replace_editor"
                | "multi_edit"
                | "multiedit"
                | "multi_edit_file"
                | "delete_file"
                | "delete"
                | "remove_file"
                | "rm"
                | "del"
                | "unlink"
                | "move_file"
                | "rename_file"
                | "mv"
        );
        let old_content = if is_file_mutation && !path_arg.is_empty() {
            checkpoint_capture_file(&eff_root, req_tag, &format!("{} {}", name, path_arg), &path_arg);
            fs_read(eff_root.clone(), path_arg.clone()).ok()
        } else {
            None
        };

        let (ok, output) = execute_single_workspace_tool(&eff_root, &inv);

        let new_content = if ok && is_file_mutation && !path_arg.is_empty() {
            fs_read(eff_root.clone(), path_arg.clone()).ok()
        } else {
            None
        };

        let _ = app.emit(
            event_topic,
            json!({
                "type": "tool_result",
                "id": tool_id,
                "ok": ok,
                "output": output,
                "oldContent": old_content.as_ref().map(|s| if s.len() <= 80_000 { s.as_str() } else { &s[..80_000] }),
                "newContent": new_content.as_ref().map(|s| if s.len() <= 80_000 { s.as_str() } else { &s[..80_000] }),
                "checkpointId": if is_file_mutation && ok { Some(req_tag) } else { None }
            }),
        );
    }
}

/// Appends Stormy's `ProjectTools.withQuickCheck` note when a file write/edit introduces syntax or asset issues.
fn append_quick_check(eff_root: &str, rel_path: &str, base_msg: String) -> String {
    if rel_path.trim().is_empty() {
        return base_msg;
    }
    let issues = audit_workspace_files(eff_root, Some(&[rel_path.to_string()]));
    if issues.is_empty() {
        base_msg
    } else {
        format!("{}\n\n[Quick syntax check]\n{}", base_msg, issues.join("\n"))
    }
}

pub fn execute_single_workspace_tool(eff_root: &str, inv: &InlineToolInvocation) -> (bool, String) {
    let name = inv.name.trim();
    let path_arg = &inv.path;
    let body = inv.body.trim();
    let eff_root = resolve_workspace_root(eff_root);

    match name {
        "read_file" | "read" | "cat" | "cat_file" | "view_file" | "open_file" | "read_file_lines" => {
            // Support Stormy's batch `paths: ["a.ts", "b.ts"]` parameter when passed in JSON body
            let mut target_paths = Vec::new();
            if !path_arg.is_empty() {
                target_paths.push(path_arg.clone());
            }
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                        if !p.is_empty() && !target_paths.contains(&p.to_string()) {
                            target_paths.push(p.to_string());
                        }
                    }
                    if let Some(arr) = j.get("paths").and_then(|v| v.as_array()) {
                        for item in arr.iter().take(8) {
                            if let Some(s) = item.as_str() {
                                if !s.is_empty() && !target_paths.contains(&s.to_string()) {
                                    target_paths.push(s.to_string());
                                }
                            }
                        }
                    }
                }
            }
            if target_paths.is_empty() && !body.is_empty() && !body.contains('\n') {
                target_paths.push(body.trim_matches(|c| c == '"' || c == '\'').to_string());
            }
            if target_paths.is_empty() {
                return (false, "read_file: missing file path".to_string());
            }
            let start = inv.start_line.unwrap_or(1).max(1);
            let end = inv.end_line.unwrap_or(start + 1999);
            let mut sections = Vec::new();
            let mut any_ok = false;
            for tp in target_paths.iter().take(8) {
                match fs_read(eff_root.clone(), tp.clone()) {
                    Ok(content) => {
                        any_ok = true;
                        let total = content.lines().count();
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
                            if out.len() > 48000 {
                                out.push_str("\n[truncated: call read_file again with start/end or offset/limit]");
                                break;
                            }
                            out.push_str(&format!("{:>4}|{}\n", n, line));
                            last = n;
                        }
                        sections.push(format!("[{} lines {}-{} of {}]\n{}", tp, start, last, total, out));
                    }
                    Err(e) => sections.push(e),
                }
            }
            (any_ok, sections.join("\n\n"))
        }
        "multi_edit" | "multiedit" | "multi_edit_file" => {
            let Ok(content) = fs_read(eff_root.clone(), path_arg.clone()) else {
                return (false, format!("File not found: {}", path_arg));
            };
            let Ok(j) = serde_json::from_str::<Value>(body) else {
                return (false, "multi_edit: arguments must be JSON with an `edits` array".to_string());
            };
            let edits_val = j.get("edits").cloned().unwrap_or(Value::Null);
            let edits_arr: Vec<Value> = if let Some(arr) = edits_val.as_array() {
                arr.clone()
            } else if let Some(s) = edits_val.as_str() {
                serde_json::from_str::<Vec<Value>>(s).unwrap_or_default()
            } else {
                Vec::new()
            };
            if edits_arr.is_empty() {
                return (false, "multi_edit: `edits` array is empty".to_string());
            }
            let mut current = content;
            for (idx, ed) in edits_arr.iter().enumerate() {
                let old_s = ed
                    .get("old_string")
                    .or_else(|| ed.get("oldString"))
                    .or_else(|| ed.get("old_str"))
                    .or_else(|| ed.get("search"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let new_s = ed
                    .get("new_string")
                    .or_else(|| ed.get("newString"))
                    .or_else(|| ed.get("new_str"))
                    .or_else(|| ed.get("replace"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let rep_all = ed
                    .get("replace_all")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                match apply_stormy_text_edit(&current, old_s, new_s, rep_all, idx + 1) {
                    Ok(next) => current = next,
                    Err(e) => {
                        return (
                            false,
                            format!("Edit {} of {} failed, so no edits were applied: {}", idx + 1, edits_arr.len(), e),
                        );
                    }
                }
            }
            match fs_write(eff_root.clone(), path_arg.clone(), current) {
                Ok(_) => (
                    true,
                    append_quick_check(
                        &eff_root,
                        path_arg,
                        format!("Applied {} edits to {}", edits_arr.len(), path_arg),
                    ),
                ),
                Err(e) => (false, e),
            }
        }
        "edit_file" | "edit" | "patch_file" | "replace_in_file" | "str_replace" | "str_replace_editor" => {
            match fs_read(eff_root.clone(), path_arg.clone()) {
                Ok(content) => match apply_search_replace(&content, body) {
                    Ok(updated) => match fs_write(eff_root.clone(), path_arg.clone(), updated) {
                        Ok(_) => (
                            true,
                            append_quick_check(&eff_root, path_arg, format!("Edited {}", path_arg)),
                        ),
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
                Err(_) => {
                    // If the target file does not exist yet and the model called edit_file to create it,
                    // extract the REPLACE block (or full body if no markers) and write it directly.
                    let new_body = if let Ok(created) = apply_search_replace("", body) {
                        created
                    } else if !body.contains("<<<<<<<") {
                        body.to_string()
                    } else {
                        String::new()
                    };
                    if !new_body.trim().is_empty() {
                        match fs_write(eff_root.clone(), path_arg.clone(), new_body.clone()) {
                            Ok(_) => (
                                true,
                                append_quick_check(
                                    &eff_root,
                                    path_arg,
                                    format!("Created {} ({} bytes)", path_arg, new_body.len()),
                                ),
                            ),
                            Err(e) => (false, e),
                        }
                    } else {
                        (false, format!("File not found: {}. Use write_file to create a new file.", path_arg))
                    }
                }
            }
        }
        "write_file" | "write" | "create_file" | "save_file" | "overwrite_file" | "append_file" | "sync_artboard" => {
            let mut is_append = name == "append_file";
            let mut content_to_write = body.to_string();
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(app_flag) = j.get("append").and_then(|v| {
                        v.as_bool().or_else(|| v.as_str().map(|s| s.eq_ignore_ascii_case("true")))
                    }) {
                        is_append = app_flag;
                    }
                    if let Some(c) = j.get("content").or_else(|| j.get("text")).and_then(|v| v.as_str()) {
                        content_to_write = c.to_string();
                    }
                }
            }
            let final_content = if is_append {
                let existing = fs_read(eff_root.clone(), path_arg.clone()).unwrap_or_default();
                format!("{}{}", existing, content_to_write)
            } else {
                content_to_write
            };
            match fs_write(eff_root.clone(), path_arg.clone(), final_content.clone()) {
                Ok(_) => (
                    true,
                    append_quick_check(
                        &eff_root,
                        path_arg,
                        format!(
                            "{} {} ({} bytes)",
                            if is_append { "Appended to" } else { "Wrote" },
                            path_arg,
                            final_content.len()
                        ),
                    ),
                ),
                Err(e) => (false, e),
            }
        }
        "move_file" | "rename_file" | "mv" => {
            let mut src = path_arg.clone();
            let mut dst = body.to_string();
            let mut overwrite = false;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(s) = j
                        .get("source")
                        .or_else(|| j.get("old_path"))
                        .or_else(|| j.get("from"))
                        .and_then(|v| v.as_str())
                    {
                        src = s.to_string();
                    }
                    if let Some(d) = j
                        .get("destination")
                        .or_else(|| j.get("new_path"))
                        .or_else(|| j.get("to"))
                        .and_then(|v| v.as_str())
                    {
                        dst = d.to_string();
                    }
                    overwrite = j
                        .get("overwrite")
                        .and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true")))
                        .unwrap_or(false);
                }
            }
            match fs_move(eff_root.clone(), src, dst, Some(overwrite)) {
                Ok(msg) => (true, msg),
                Err(e) => (false, e),
            }
        }
        "delete_file" | "delete" | "remove_file" | "rm" | "del" | "unlink" => {
            let target_path = if !path_arg.is_empty() {
                path_arg.clone()
            } else {
                body.trim().to_string()
            };
            match fs_delete(eff_root.clone(), target_path) {
                Ok(msg) => (true, msg),
                Err(e) => (false, e),
            }
        }
        "glob" | "find_files" => {
            let mut pattern = if !path_arg.is_empty() {
                path_arg.clone()
            } else {
                body.to_string()
            };
            let mut subpath: Option<String> = None;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(pat) = j.get("pattern").or_else(|| j.get("glob")).and_then(|v| v.as_str()) {
                        pattern = pat.to_string();
                    }
                    if let Some(sp) = j.get("path").or_else(|| j.get("directory")).and_then(|v| v.as_str()) {
                        subpath = Some(sp.to_string());
                    }
                }
            }
            let files = glob_workspace_files(&eff_root, &pattern, subpath.as_deref());
            if files.is_empty() {
                (true, format!("(0 files matched glob '{}')", pattern))
            } else {
                (true, files.join("\n"))
            }
        }
        "search_project" => {
            let mut query = if !body.is_empty() {
                body.to_string()
            } else {
                path_arg.clone()
            };
            let mut limit = 8usize;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(q) = j.get("query").and_then(|v| v.as_str()) {
                        query = q.to_string();
                    }
                    if let Some(l) = j.get("limit").and_then(|v| v.as_u64()) {
                        limit = (l as usize).clamp(1, 25);
                    }
                }
            }
            let hits = bm25_search_project(&eff_root, &query, limit);
            if hits.is_empty() {
                (true, format!("No semantic/BM25 project matches for '{}'", query))
            } else {
                let formatted = hits
                    .iter()
                    .filter_map(|h| {
                        Some(format!(
                            "## {} (lines {}-{}, score {})\n{}",
                            h.get("path")?.as_str()?,
                            h.get("startLine")?.as_u64()?,
                            h.get("endLine")?.as_u64()?,
                            h.get("score")?.as_f64()?,
                            h.get("snippet")?.as_str()?
                        ))
                    })
                    .collect::<Vec<_>>()
                    .join("\n\n");
                (true, formatted)
            }
        }
        "docs_lookup" => {
            let query = if !body.is_empty() { body } else { path_arg.as_str() };
            (true, docs_lookup_reference(query))
        }
        "check_syntax" | "audit_project" | "review_project" | "lint_project" => {
            let target = if !path_arg.is_empty() {
                Some(vec![path_arg.clone()])
            } else if !body.is_empty() && !body.starts_with('{') {
                Some(vec![body.to_string()])
            } else {
                None
            };
            let findings = audit_workspace_files(&eff_root, target.as_deref());
            if findings.is_empty() {
                (true, "check_syntax: 0 errors or warnings found.".to_string())
            } else {
                (true, findings.join("\n"))
            }
        }
        "update_plan" | "todowrite" | "todo_write" => {
            let plan_payload = if !body.is_empty() { body } else { path_arg.as_str() };
            (true, format!("[Plan updated]\n{}", plan_payload))
        }
        "ask_user" | "ask" | "question" => {
            let q_payload = if !body.is_empty() { body } else { path_arg.as_str() };
            (true, format!("[Question presented to user]\n{}", q_payload))
        }
        "search_code" | "grep" | "rg" | "search" | "search_files" | "ripgrep" | "find_in_files" => {
            let mut query = if !body.is_empty() {
                body.to_string()
            } else {
                path_arg.clone()
            };
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(p) = j
                        .get("pattern")
                        .or_else(|| j.get("query"))
                        .or_else(|| j.get("search"))
                        .and_then(|v| v.as_str())
                    {
                        query = p.to_string();
                    }
                }
            }
            let results = search_workspace_code(&eff_root, &query, 30);
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
        "list_dir" | "ls" | "dir" | "list_files" | "list_directory" | "print_tree" | "tree" => {
            let p = Path::new(&eff_root);
            let mut trimmed_arg = path_arg.trim().to_string();
            let mut symbols = false;
            let mut depth = 2usize;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(pa) = j.get("path").or_else(|| j.get("directory")).and_then(|v| v.as_str()) {
                        if trimmed_arg.is_empty() {
                            trimmed_arg = pa.trim().to_string();
                        }
                    }
                    symbols = j
                        .get("symbols")
                        .and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true")))
                        .unwrap_or(false);
                    if let Some(d) = j
                        .get("depth")
                        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
                    {
                        depth = (d as usize).clamp(1, 6);
                    }
                }
            }
            let target_res = if trimmed_arg.is_empty() || trimmed_arg == "." || trimmed_arg == "./" || trimmed_arg == ".\\" {
                Ok(p.to_path_buf())
            } else {
                safe_join(&eff_root, &trimmed_arg)
            };
            match target_res {
                Err(e) => (false, e),
                Ok(target) => {
                    let tree = walk_workspace(p, &target, depth);
                    if tree.is_empty() {
                        (
                            true,
                            "Directory is empty (0 files). Proceed directly without re-listing.".to_string(),
                        )
                    } else if symbols {
                        fn format_tree_with_symbols(base: &Path, nodes: &[FileNode], indent: usize, out: &mut String) {
                            let pad = "  ".repeat(indent);
                            for n in nodes {
                                if n.dir {
                                    out.push_str(&format!("{}{}/\n", pad, n.name));
                                    if let Some(children) = &n.children {
                                        format_tree_with_symbols(base, children, indent + 1, out);
                                    }
                                } else {
                                    let outline = project_outline_of(&base.join(&n.path))
                                        .map(|s| format!(" — {}", s))
                                        .unwrap_or_default();
                                    out.push_str(&format!("{}{}{}\n", pad, n.name, outline));
                                }
                            }
                        }
                        let mut out = String::new();
                        format_tree_with_symbols(p, &tree, 0, &mut out);
                        (true, out.trim_end().to_string())
                    } else {
                        let mut out = String::new();
                        format_tree_compact(&tree, 0, &mut out);
                        (true, out.trim_end().to_string())
                    }
                }
            }
        }
        "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run" => {
            let mut cmd_str = if !body.is_empty() {
                body.to_string()
            } else {
                path_arg.clone()
            };
            // Strip upstream proxy container paths (`cd /app && ...`, `cd /home/app && ...`, `cd /workspace && ...`)
            // when those container directories do not exist locally, since `shell_run` already executes in `eff_root`.
            for prefix in [
                "cd /workspace 2>/dev/null || cd /app && ",
                "cd /app && ",
                "cd /home/app && ",
                "cd /workspace && ",
                "cd /app; ",
                "cd /home/app; ",
                "cd /workspace; ",
            ] {
                if let Some(rest) = cmd_str.trim_start().strip_prefix(prefix) {
                    if !Path::new("/app").exists() {
                        cmd_str = rest.to_string();
                        break;
                    }
                }
            }
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
            if body.trim().is_empty() || body.trim() == "{}" {
                (
                    false,
                    "memory_save error: content body is empty. Emit <zeus_tool name=\"memory_save\" path=\"preferences\">exact fact to save</zeus_tool>.".to_string(),
                )
            } else {
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
        }
        "memory_edit" | "memory_update" => {
            if body.trim().is_empty() || body.trim() == "{}" {
                (
                    false,
                    format!(
                        "memory_edit error: updated text is empty. Emit <zeus_tool name=\"memory_edit\" path=\"{}\">updated text</zeus_tool>.",
                        path_arg
                    ),
                )
            } else {
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
        "load_skill" | "skill" => {
            let skill_name = if !path_arg.is_empty() {
                path_arg.trim()
            } else {
                body.trim()
            };
            let rel = format!(".zeusdesigns/harness/skills/{}/SKILL.md", skill_name);
            if let Ok(custom_skill) = fs_read(eff_root.clone(), rel) {
                (true, format!("[Harness² Skill '{}']\n{}", skill_name, custom_skill))
            } else {
                let builtin = match skill_name {
                    "bug_hunt_verify" => "1. Read the failing test or target module directly with read_file or search_code.\n2. Identify the exact mathematical/logical mismatch.\n3. Patch in one pass with edit_file or write_file.\n4. Run the verification command via shell or python and confirm exit code 0.",
                    "python_data_pipeline" => "1. Run a single <zeus_tool name=\"python\"> script that reads the input file, deduplicates/filters/aggregates in memory, writes the output file, and prints a verification summary.",
                    "multi_file_refactor" => "1. Inspect coupled modules first.\n2. Update each file deterministically and run the test suite before finishing.",
                    _ => "Proceed directly with shell, python, read_file, edit_file, or write_file to complete the task.",
                };
                (true, format!("[Harness² Skill '{}']\n{}", skill_name, builtin))
            }
        }
        "subagent" | "task" => {
            let target_q = if !body.is_empty() { body } else { path_arg.as_str() };
            let hits = search_workspace_code(&eff_root, target_q, 15);
            if hits.is_empty() {
                let tree = walk_workspace(Path::new(&eff_root), Path::new(&eff_root), 2);
                let mut out = String::new();
                format_tree_compact(&tree, 0, &mut out);
                (true, format!("[Harness² Subagent Summary]\nWorkspace files:\n{}", out.trim_end()))
            } else {
                let formatted = hits
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
                (true, format!("[Harness² Subagent Summary for '{}']\n{}", target_q, formatted))
            }
        }
        "lmfingerprint" | "verify_model" | "model_fingerprint" => {
            let target = if !path_arg.is_empty() {
                path_arg.trim()
            } else {
                body.trim()
            };
            let (prov, mdl) = if let Some((p, m)) = target.split_once('/') {
                (p.trim(), m.trim())
            } else if !target.is_empty() {
                (target, "")
            } else {
                ("gemini4hydrogen", "gemini-4-hydrogen")
            };
            let temp_engine = ProviderEngine::default();
            match verify_model_fingerprint(&temp_engine, prov, mdl) {
                Ok(rep) => (
                    true,
                    format!(
                        "[LMFingerprint Verification Report]\nProvider: {}\nRequested Model: {}\nClaimed Family: {}\nDetected Family: {}\nUpstream Endpoint: {}\nUpstream Reported Model: {}\nProtocol Signature: {}\nVerdict: {} ({})\nCanary (17*23=391): {}\nNative Reasoning: {}\nLatency: {} ms ({} tok/s)\nFingerprint Hash: {}\nSelf-Report: {}\nSummary: {}",
                        rep.provider,
                        rep.requested_model,
                        rep.claimed_family,
                        rep.detected_family,
                        rep.upstream_endpoint,
                        rep.upstream_reported_model,
                        rep.protocol_signature,
                        rep.verdict,
                        rep.verdict_label,
                        if rep.canary_passed { "PASS" } else { "PARTIAL" },
                        if rep.has_native_reasoning { "YES" } else { "NO" },
                        rep.latency_ms,
                        rep.tokens_per_sec,
                        rep.fingerprint_hash,
                        rep.self_report,
                        rep.explanation
                    ),
                ),
                Err(e) => (false, format!("LMFingerprint probe error: {}", e)),
            }
        }
        other if other.starts_with("mcp:") => {
            let reg = crate::mcp::McpRegistry::default();
            reg.invoke_tool(other, body)
        }
        _ => (
            false,
            format!(
                "Unknown tool '{}'. Valid tools: shell (bash), python, read_file, write_file, edit_file, list_dir, search_code, web_fetch, memory_search, memory_save, memory_edit, memory_delete, load_skill, subagent, lmfingerprint.",
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

/// Stormy `TextEdits.stripLineNumberPrefixes`: strips `"  12|"` prefixes if every non-blank line has one.
fn strip_read_file_line_prefixes(text: &str) -> String {
    fn has_line_prefix(line: &str) -> Option<&str> {
        let trimmed = line.trim_start_matches(' ');
        let digits = trimmed.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits > 0 && trimmed[digits..].starts_with('|') {
            Some(&trimmed[digits + 1..])
        } else {
            None
        }
    }
    let lines: Vec<&str> = text.split('\n').collect();
    let non_blank: Vec<&&str> = lines.iter().filter(|l| !l.trim().is_empty()).collect();
    if non_blank.is_empty() || !non_blank.iter().all(|l| has_line_prefix(l).is_some()) {
        return text.to_string();
    }
    lines
        .into_iter()
        .map(|l| has_line_prefix(l).unwrap_or(l))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Stormy `TextEdits.apply`: 4-stage exact + line-trimmed + whitespace-collapsed + block-anchor edit engine.
pub fn apply_stormy_text_edit(
    content: &str,
    search_raw: &str,
    replace_raw: &str,
    replace_all: bool,
    idx: usize,
) -> Result<String, String> {
    let cleaned_search = strip_read_file_line_prefixes(search_raw);
    let cleaned_replace = if cleaned_search != search_raw {
        strip_read_file_line_prefixes(replace_raw)
    } else {
        replace_raw.to_string()
    };

    let crlf = content.contains("\r\n");
    let (search, replace) = if crlf {
        (
            cleaned_search.replace("\r\n", "\n").replace('\n', "\r\n"),
            cleaned_replace.replace("\r\n", "\n").replace('\n', "\r\n"),
        )
    } else {
        (
            cleaned_search.replace("\r\n", "\n"),
            cleaned_replace.replace("\r\n", "\n"),
        )
    };
    let count = content.matches(search.as_str()).count();
    if count == 1 || (count > 1 && replace_all) {
        return Ok(if replace_all {
            content.replace(search.as_str(), replace.as_str())
        } else {
            content.replacen(search.as_str(), replace.as_str(), 1)
        });
    }
    if count > 1 {
        let mut line_nums = Vec::new();
        let mut from = 0usize;
        while let Some(rel) = content[from..].find(search.as_str()) {
            let pos = from + rel;
            let ln = content[..pos].bytes().filter(|&b| b == b'\n').count() + 1;
            line_nums.push(ln.to_string());
            if line_nums.len() >= 6 {
                break;
            }
            from = pos + search.len();
        }
        return Err(format!(
            "edit_file: old_string/SEARCH block {} matches {} places (lines {}). Include more surrounding lines to make it unique, or set replace_all=true.",
            idx,
            count,
            line_nums.join(", ")
        ));
    }

    // Stage 2: Line-trimmed unique match when indentation/trailing whitespace differs
    let file_lines: Vec<&str> = content.lines().collect();
    let search_lines: Vec<&str> = cleaned_search.lines().map(|l| l.trim()).collect();
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
        for rl in cleaned_replace.lines() {
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

    // Stage 3: Block-anchor match (first and last lines match trimmed, middle lines share >= 80% token overlap)
    if search_lines.len() >= 3 {
        let first_t = search_lines[0];
        let last_t = search_lines[search_lines.len() - 1];
        if first_t.len() >= 3 && !last_t.is_empty() {
            let mut anchor_matches: Vec<(usize, usize)> = Vec::new();
            for a in 0..file_lines.len() {
                if file_lines[a].trim() != first_t {
                    continue;
                }
                let max_b = (file_lines.len() - 1).min(a + search_lines.len() * 2 + 2);
                for b in (a + 1)..=max_b {
                    if file_lines[b].trim() == last_t {
                        let mid_old = search_lines[1..search_lines.len() - 1].join(" ");
                        let mid_file = file_lines[a + 1..b]
                            .iter()
                            .map(|l| l.trim())
                            .collect::<Vec<_>>()
                            .join(" ");
                        let old_words: std::collections::HashSet<&str> = mid_old.split_whitespace().collect();
                        let file_words: std::collections::HashSet<&str> = mid_file.split_whitespace().collect();
                        let sim = if old_words.is_empty() && file_words.is_empty() {
                            1.0
                        } else {
                            let inter = old_words.intersection(&file_words).count() as f64;
                            let union = old_words.union(&file_words).count().max(1) as f64;
                            inter / union
                        };
                        if sim >= 0.78 {
                            anchor_matches.push((a, b));
                        }
                        break;
                    }
                }
            }
            if anchor_matches.len() == 1 {
                let (a, b) = anchor_matches[0];
                let mut rebuilt = Vec::new();
                rebuilt.extend_from_slice(&file_lines[..a]);
                for rl in cleaned_replace.lines() {
                    rebuilt.push(rl);
                }
                rebuilt.extend_from_slice(&file_lines[b + 1..]);
                let sep = if crlf { "\r\n" } else { "\n" };
                let mut joined = rebuilt.join(sep);
                if content.ends_with('\n') && !joined.ends_with('\n') {
                    joined.push_str(sep);
                }
                return Ok(joined);
            }
        }
    }

    Err(format!(
        "edit_file: SEARCH block {} not found. Read the file again and copy the lines accurately.",
        idx
    ))
}

fn replace_hunk_fuzzy(content: &str, search_raw: &str, replace_raw: &str, idx: usize) -> Result<String, String> {
    apply_stormy_text_edit(content, search_raw, replace_raw, false, idx)
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
    let mut unescaped_body = if find_marker_line(body, '<').is_none() && body.contains("\\n") {
        body.replace("\\r\\n", "\n").replace("\\n", "\n")
    } else {
        body.to_string()
    };
    // Normalize inline `=======` or `>>>>>>> REPLACE` when a model omits the newline before the marker
    for marker in ["=======\n", "=======\r\n", ">>>>>>> REPLACE", ">>>>>>> UPDATED", ">>>>>>>"] {
        if let Some(pos) = unescaped_body.find(marker) {
            if pos > 0 && unescaped_body.as_bytes()[pos - 1] != b'\n' && unescaped_body.as_bytes()[pos - 1] != b'=' && unescaped_body.as_bytes()[pos - 1] != b'>' {
                unescaped_body.insert(pos, '\n');
            }
        }
    }
    let mut out = content.to_string();
    let mut rest = unescaped_body.as_str();
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
            if out.trim().is_empty() {
                out = replace_raw.to_string();
                n += 1;
                continue;
            }
            return Err("edit_file: SEARCH block is empty".to_string());
        }
        out = replace_hunk_fuzzy(&out, search_raw, replace_raw, n + 1)?;
        n += 1;
    }
    if n > 0 {
        return Ok(out);
    }

    // Fallback 1: JSON {"oldString" / "old_str" / "search": "...", "newString" / "new_str" / "replace": "..."}
    let trimmed = unescaped_body.trim();
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
                let rep_all = j
                    .get("replace_all")
                    .or_else(|| j.get("replaceAll"))
                    .and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true")))
                    .unwrap_or(false);
                return apply_stormy_text_edit(&out, o, r, rep_all, 1);
            }
        }
    }

    // Fallback 2: When a model passes the complete replacement file content to `edit_file` without `<<<<<<<` markers
    if !trimmed.is_empty() && !trimmed.contains("<<<<") && !trimmed.contains(">>>>") && (trimmed.lines().count() >= 2 || content.lines().count() <= 3) {
        let mut full_new = trimmed
            .trim_start_matches("```javascript")
            .trim_start_matches("```typescript")
            .trim_start_matches("```python")
            .trim_start_matches("```rust")
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
            .to_string();
        if content.ends_with('\n') && !full_new.ends_with('\n') {
            full_new.push('\n');
        }
        return Ok(full_new);
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
                || stripped.contains("</antml:invoke>")
                || stripped.contains("</bash>")
                || stripped.contains("</shell>")
                || stripped.contains("</python>")
                || stripped.contains("</read_file>")
                || stripped.contains("</write_file>")
                || stripped.contains("</edit_file>")
                || stripped.contains("</multi_edit>")
                || stripped.contains("</move_file>")
                || stripped.contains("</delete_file>")
                || stripped.contains("</search_code>")
                || stripped.contains("</search_project>")
                || stripped.contains("</docs_lookup>")
                || stripped.contains("</check_syntax>")
                || stripped.contains("</update_plan>")
                || stripped.contains("</ask_user>")
                || stripped.contains("</list_dir>")
                || stripped.contains("</list_files>")
                || stripped.contains("</glob>")
                || stripped.contains("</grep>")
                || stripped.contains("</web_fetch>")
                || stripped.contains("</memory_search>")
                || stripped.contains("</memory_save>")
                || stripped.contains("</memory_edit>")
                || stripped.contains("</memory_delete>")
                || stripped.contains("</ifm|tool_call>")
                || stripped.contains("<|tool_call_end|>")
                || stripped.contains("<｜tool▁call▁end｜>")
                || (stripped.contains("<zeus_tool") && stripped.contains("/>"))
                || (stripped.contains("<read_file") && stripped.contains("/>"))
                || (stripped.contains("<list_dir") && stripped.contains("/>"))
                || (stripped.contains("<delete_file") && stripped.contains("/>"))
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
                || accumulated.contains("to=functions.")
                || accumulated.contains("<tool_call>")
                || accumulated.contains("<function_call>")
                || accumulated.contains("<function")
                || accumulated.contains("<invoke")
                || accumulated.contains("<antml:invoke")
                || accumulated.contains("<ifm|tool_call>")
                || accumulated.contains("<|tool_call_begin|>")
                || accumulated.contains("<｜tool▁call▁begin｜>")
                || accumulated.contains("[TOOL_CALLS]")
                || accumulated.contains("<bash")
                || accumulated.contains("<shell")
                || accumulated.contains("<python")
                || accumulated.contains("<read_file")
                || accumulated.contains("<write_file")
                || accumulated.contains("<edit_file")
                || accumulated.contains("<multi_edit")
                || accumulated.contains("<move_file")
                || accumulated.contains("<delete_file")
                || accumulated.contains("<search_code")
                || accumulated.contains("<search_project")
                || accumulated.contains("<docs_lookup")
                || accumulated.contains("<check_syntax")
                || accumulated.contains("<update_plan")
                || accumulated.contains("<ask_user")
                || accumulated.contains("<list_dir")
                || accumulated.contains("<list_files")
                || accumulated.contains("<glob")
                || accumulated.contains("<grep")
                || accumulated.contains("<web_fetch")
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
