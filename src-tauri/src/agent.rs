#[path = "agent_edit.rs"]
pub mod agent_edit;
#[path = "agent_exec.rs"]
pub mod agent_exec;
use crate::agent_edit::{apply_stormy_text_edit_impl, extract_attr};
pub use crate::agent_exec::{execute_single_workspace_tool, resolve_workspace_root};
use crate::providers::{
    catalog, chatjimmy_complete, dispatch_stream, verify_model_fingerprint, ChatRequest,
    ModelFingerprintReport, ProviderEngine, ProviderInfo,
};
use crate::workspace::{checkpoint_capture_file, fs_read};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
fn strip_read_file_line_prefixes(text: &str) -> String {
    crate::agent_edit::strip_read_file_line_prefixes(text)
}
pub fn apply_stormy_text_edit(
    content: &str,
    search_raw: &str,
    replace_raw: &str,
    replace_all: bool,
    idx: usize,
) -> Result<String, String> {
    let _ = strip_read_file_line_prefixes;
    apply_stormy_text_edit_impl(content, search_raw, replace_raw, replace_all, idx)
}
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
    let words: Vec<&str> = text.split_whitespace().filter(|w| !w.is_empty()).take(5).collect();
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
/// Strip `<think>...</think>` and `<thinking>...</thinking>` blocks so tool tags mentioned inside
/// a model's internal reasoning trace are never executed as real tools.
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
            if start > 0 && matches!(out.as_bytes()[start - 1], b'`' | b'"' | b'\'') {
                search_from = start + open_tag.len();
                continue;
            }
            let after_open = start + open_tag.len();
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
#[derive(Debug, Clone)]
pub struct InlineToolInvocation {
    pub name: String,
    pub path: String,
    pub start_line: Option<usize>,
    pub end_line: Option<usize>,
    pub body: String,
    pub offset: usize,
}
pub fn is_known_valid_tool(name: &str) -> bool {
    matches!(
        name,
        "read_file" | "read" | "cat" | "cat_file" | "view_file" | "open_file" | "read_file_lines"
            | "write_file" | "write" | "create_file" | "save_file" | "overwrite_file" | "append_file" | "sync_artboard"
            | "delete_file" | "delete" | "remove_file" | "rm" | "del" | "unlink"
            | "move_file" | "rename_file" | "mv"
            | "edit_file" | "edit" | "patch_file" | "replace_in_file" | "str_replace" | "str_replace_editor"
            | "multi_edit" | "multiedit" | "multi_edit_file"
            | "search_code" | "grep" | "rg" | "search" | "search_files" | "ripgrep" | "find_in_files"
            | "search_project" | "docs_lookup"
            | "list_dir" | "ls" | "dir" | "list_files" | "list_directory" | "print_tree" | "tree"
            | "glob" | "find_files"
            | "check_syntax" | "audit_project" | "review_project" | "lint_project"
            | "update_plan" | "todowrite" | "todo_write"
            | "ask_user" | "ask" | "question"
            | "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run"
            | "python" | "python3" | "py" | "python_exec" | "run_python"
            | "web_fetch" | "fetch" | "curl" | "webfetch"
            | "memory" | "memory_search" | "memory_list" | "memory_get" | "memory_read" | "recall_memory"
            | "memory_save" | "save_memory" | "memory_add" | "memory_set"
            | "memory_edit" | "memory_update"
            | "memory_delete" | "memory_remove" | "memory_forget"
            | "load_skill" | "use_skill" | "get_skill" | "read_skill" | "skill"
            | "subagent" | "spawn_subagent" | "task"
            | "add_ui_kit" | "install_ui_kit"
            | "copy_file" | "cp"
            | "create_folder" | "mkdir" | "create_directory"
            | "insert_at_line" | "append_to_file" | "prepend_to_file" | "regex_replace"
            | "get_file_info" | "file_info" | "file_outline" | "stat"
            | "diff_files" | "compare_files"
            | "git_status" | "git_diff" | "git_log" | "git_branch" | "git_stage" | "git_unstage" | "git_commit"
            | "security_scan" | "find_secrets" | "audit_security"
            | "request_approval"
            | "lmfingerprint" | "verify_model" | "model_fingerprint"
    ) || name.starts_with("studio_")
        || name.starts_with("mcp:")
}
fn is_mutating_or_exec_tool(name: &str) -> bool {
    matches!(
        name,
        "write_file" | "write" | "create_file" | "save_file" | "overwrite_file" | "append_file"
            | "append_to_file" | "prepend_to_file" | "insert_at_line" | "regex_replace"
            | "edit_file" | "edit" | "patch_file" | "replace_in_file" | "str_replace" | "str_replace_editor"
            | "multi_edit" | "multiedit" | "multi_edit_file"
            | "delete_file" | "delete" | "remove_file" | "rm" | "del" | "unlink"
            | "move_file" | "rename_file" | "mv" | "copy_file" | "cp"
            | "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run"
            | "python" | "python3" | "py" | "python_exec" | "run_python"
    )
}
fn is_template_placeholder(name: &str, path: &str, body: &str) -> bool {
    let p = path.trim();
    let b = body.trim();
    if matches!(
        p,
        "ARG" | "relative/file" | "relative/path" | "subdir" | "sub/dir" | "filename" | "https://..." | "..." | "path/to/file"
    ) || matches!(
        b,
        "BODY" | "command" | "python3_code" | "python_script_code" | "complete file content"
            | "complete content" | "full_file_content" | "substring_or_symbol" | "pattern"
            | "one durable fact worth keeping" | "..."
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
fn is_offset_covered(spans: &[(usize, usize)], pos: usize) -> bool {
    spans.iter().any(|&(s, e)| pos >= s && pos < e)
}
pub fn parse_inline_invocations_segment(
    clean_text: &str,
    allow_unclosed_tail: bool,
    strict_placeholder_filter: bool,
) -> Vec<InlineToolInvocation> {
    let mut list = Vec::new();
    let mut covered_spans: Vec<(usize, usize)> = Vec::new();
    // 1. Parse `<zeus_tool ...>...</zeus_tool>` and self-closing `<zeus_tool ... />`
    let mut search_from = 0;
    while let Some(rel_start) = clean_text[search_from..].find("<zeus_tool") {
        let start = search_from + rel_start;
        let rest = &clean_text[start..];
        let Some(gt) = rest.find('>') else { break };
        let header = &rest[10..gt];
        let name = extract_attr(header, "name").unwrap_or_default();
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
        } else if allow_unclosed_tail && !is_mutating_or_exec_tool(&name) && rest.len() > gt + 2 {
            (rest[gt + 1..].trim(), clean_text.len())
        } else {
            break;
        };
        search_from = next_pos;
        covered_spans.push((start, next_pos));
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
                    if !phead.is_empty() && !phead.starts_with(char::is_whitespace) && !phead.starts_with('=') {
                        pfrom = pstart + pgt + 1;
                        continue;
                    }
                    let Some(pend) = prest.find(&p_close) else { break };
                    let pval = prest[pgt + 1..pend].trim();
                    let pname = extract_attr(phead, "name")
                        .or_else(|| phead.trim().strip_prefix('=').map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string()))
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
                let has_structured_fields = j.get("edits").is_some()
                    || j.get("old_string").is_some()
                    || j.get("oldString").is_some()
                    || j.get("old_str").is_some()
                    || j.get("old_content").is_some()
                    || j.get("search").is_some()
                    || j.get("source").is_some()
                    || j.get("destination").is_some()
                    || j.get("old_path").is_some()
                    || j.get("new_path").is_some()
                    || j.get("from").is_some()
                    || j.get("to").is_some()
                    || j.get("path1").is_some()
                    || j.get("path2").is_some()
                    || j.get("paths").is_some()
                    || j.get("questions").is_some()
                    || j.get("question").is_some()
                    || j.get("tasks").is_some()
                    || j.get("plan").is_some()
                    || j.get("todos").is_some()
                    || j.get("steps").is_some()
                    || j.get("symbols").is_some()
                    || j.get("depth").is_some()
                    || j.get("append").is_some()
                    || j.get("limit").is_some()
                    || j.get("line").is_some()
                    || j.get("replacement").is_some()
                    || j.get("agent_type").is_some();
                if !has_structured_fields {
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
    // 2. Parse `<tool_call>{...}</tool_call>` and `<function_call>{...}</function_call>`
    for (open_tag, close_tag) in [("<tool_call>", "</tool_call>"), ("<function_call>", "</function_call>")] {
        let mut from = 0;
        while let Some(rel_start) = clean_text[from..].find(open_tag) {
            let start = from + rel_start;
            let after_open = start + open_tag.len();
            let (raw_slice, next_from) = if let Some(rel_end) = clean_text[after_open..].find(close_tag) {
                (&clean_text[after_open..after_open + rel_end], after_open + rel_end + close_tag.len())
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
                let (first_line, rest_json) = raw.split_once('\n')?;
                let fn_name = first_line.trim();
                if fn_name.is_empty() || fn_name.contains(' ') || fn_name.starts_with('<') {
                    return None;
                }
                let args_v = serde_json::from_str::<Value>(rest_json.trim()).ok()?;
                Some(json!({ "name": fn_name, "arguments": args_v }))
            });
            if let Some(v) = parsed_val {
                let name = v.get("name").or_else(|| v.get("tool")).and_then(|n| n.as_str()).unwrap_or("").to_string();
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
                    .or_else(|| args_obj.get("file_path"))
                    .or_else(|| args_obj.get("filepath"))
                    .or_else(|| args_obj.get("filename"))
                    .or_else(|| args_obj.get("directory"))
                    .or_else(|| args_obj.get("dir"))
                    .or_else(|| args_obj.get("id"))
                    .or_else(|| args_obj.get("category"))
                    .or_else(|| args_obj.get("key"))
                    .or_else(|| args_obj.get("url"))
                    .or_else(|| args_obj.get("uri"))
                    .or_else(|| args_obj.get("link"))
                    .or_else(|| args_obj.get("skill"))
                    .or_else(|| args_obj.get("skill_name"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("")
                    .to_string();
                let start_line = args_obj
                    .get("start")
                    .or_else(|| args_obj.get("offset"))
                    .or_else(|| args_obj.get("start_line"))
                    .or_else(|| args_obj.get("line_start"))
                    .or_else(|| args_obj.get("line"))
                    .and_then(|x| x.as_u64())
                    .map(|x| x as usize);
                let end_line = args_obj
                    .get("end")
                    .or_else(|| args_obj.get("end_line"))
                    .or_else(|| args_obj.get("line_end"))
                    .and_then(|x| x.as_u64())
                    .map(|x| x as usize)
                    .or_else(|| {
                        let off = start_line.unwrap_or(1);
                        let lim = args_obj.get("limit").and_then(|x| x.as_u64())? as usize;
                        Some(off + lim.saturating_sub(1))
                    });
                let has_structured = args_obj.get("edits").is_some()
                    || args_obj.get("old_string").is_some()
                    || args_obj.get("oldString").is_some()
                    || args_obj.get("old_str").is_some()
                    || args_obj.get("old_content").is_some()
                    || args_obj.get("search").is_some()
                    || args_obj.get("source").is_some()
                    || args_obj.get("destination").is_some()
                    || args_obj.get("old_path").is_some()
                    || args_obj.get("new_path").is_some()
                    || args_obj.get("from").is_some()
                    || args_obj.get("to").is_some()
                    || args_obj.get("path1").is_some()
                    || args_obj.get("path2").is_some()
                    || args_obj.get("paths").is_some()
                    || args_obj.get("questions").is_some()
                    || args_obj.get("question").is_some()
                    || args_obj.get("tasks").is_some()
                    || args_obj.get("plan").is_some()
                    || args_obj.get("todos").is_some()
                    || args_obj.get("steps").is_some()
                    || args_obj.get("symbols").is_some()
                    || args_obj.get("depth").is_some()
                    || args_obj.get("append").is_some()
                    || args_obj.get("limit").is_some()
                    || args_obj.get("line").is_some()
                    || args_obj.get("replacement").is_some()
                    || args_obj.get("agent_type").is_some();
                let body = if !has_structured {
                    if let Some(b) = args_obj
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
                    }
                } else {
                    serde_json::to_string(&args_obj).unwrap_or_default()
                };
                if !name.is_empty() {
                    if !is_known_valid_tool(&name) || is_template_placeholder(&name, &path, &body) {
                        continue;
                    }
                    covered_spans.push((start, next_from));
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
    // (Never skipped when `<zeus_tool>` is also present; uses `covered_spans` to avoid double-parsing)
    for (open_tag, close_tag) in [("<function", "</function>"), ("<invoke", "</invoke>"), ("<antml:invoke", "</antml:invoke>")] {
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
            let next_from = start + end_rel + close_tag.len();
            if is_offset_covered(&covered_spans, start) {
                from = next_from;
                continue;
            }
            let inner = rest[gt + 1..end_rel].trim();
            from = next_from;
            let name = extract_attr(header, "name")
                .or_else(|| header.trim().strip_prefix('=').map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string()))
                .unwrap_or_default();
            if name.is_empty() || (strict_placeholder_filter && !is_known_valid_tool(&name)) {
                continue;
            }
            let mut path_arg = extract_attr(header, "path").unwrap_or_default();
            let mut start_line = extract_attr(header, "start").and_then(|v| v.parse::<usize>().ok());
            let mut end_line = extract_attr(header, "end").and_then(|v| v.parse::<usize>().ok());
            let body_out = crate::agent_edit::unpack_function_parameters(inner, &mut path_arg, &mut start_line, &mut end_line);
            covered_spans.push((start, next_from));
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
    // 4. Support direct shorthand XML tags (`<bash>...</bash>`, `<edit_file path="...">...</edit_file>`, etc.)
    // even when mixed with `<zeus_tool>` in the same turn
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
            if !header.is_empty() && !header.starts_with(char::is_whitespace) && !header.starts_with('/') {
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
            if is_offset_covered(&covered_spans, start) {
                continue;
            }
            let mut path_arg = extract_attr(header, "path")
                .or_else(|| extract_attr(header, "file"))
                .or_else(|| extract_attr(header, "id"))
                .or_else(|| extract_attr(header, "category"))
                .or_else(|| extract_attr(header, "url"))
                .unwrap_or_default();
            if path_arg.is_empty() && matches!(tag_name, "read_file" | "list_dir" | "delete_file") && !body.contains('\n') {
                path_arg = body.trim_matches(|c| c == '"' || c == '\'' || c == '`').to_string();
            }
            let start_line = extract_attr(header, "start").and_then(|v| v.parse::<usize>().ok());
            let end_line = extract_attr(header, "end").and_then(|v| v.parse::<usize>().ok());
            if is_template_placeholder(tag_name, &path_arg, body) {
                continue;
            }
            covered_spans.push((start, next_pos));
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
    // 5. Support K2-Horizon <ifm|tool_call>, Kimi <|tool_call_begin|>, DeepSeek <｜tool▁call▁begin｜>, and Mistral [TOOL_CALLS]
    crate::agent_edit::parse_vendor_tool_calls(clean_text, strict_placeholder_filter, &mut list);
    list.sort_by_key(|x| x.offset);
    list
}
/// Stormy ToolBatch dependency-ordered wave scheduler in Rust:
/// Groups non-conflicting read-only calls into parallel/early waves before mutating or barrier calls.
pub fn compute_tool_batch_waves(invocations: &[InlineToolInvocation]) -> Vec<Vec<usize>> {
    let is_read_only = |name: &str| {
        matches!(
            name,
            "read_file" | "read" | "cat" | "cat_file" | "view_file" | "open_file" | "read_file_lines"
                | "list_dir" | "ls" | "dir" | "list_files" | "list_directory" | "print_tree" | "tree"
                | "glob" | "find_files" | "grep" | "rg" | "search_code" | "search" | "search_files"
                | "search_project" | "docs_lookup" | "check_syntax" | "audit_project" | "review_project"
                | "lint_project" | "web_fetch" | "fetch" | "get_file_info" | "file_info" | "file_outline"
                | "diff_files" | "compare_files" | "git_status" | "git_diff" | "git_log"
                | "security_scan" | "memory_search" | "update_plan"
        )
    };
    let mut waves: Vec<Vec<usize>> = Vec::new();
    let mut current_reads: Vec<usize> = Vec::new();
    for (idx, inv) in invocations.iter().enumerate() {
        if is_read_only(inv.name.trim()) {
            current_reads.push(idx);
            if current_reads.len() >= 4 {
                waves.push(std::mem::take(&mut current_reads));
            }
        } else {
            if !current_reads.is_empty() {
                waves.push(std::mem::take(&mut current_reads));
            }
            waves.push(vec![idx]);
        }
    }
    if !current_reads.is_empty() {
        waves.push(current_reads);
    }
    waves
}
/// PreToolUse & AutonomyPolicy in-loop guard executed BEFORE any tool modifies disk or runs shell commands.
fn pre_tool_and_autonomy_guard(
    inv: &mut InlineToolInvocation,
    seen_reads: &mut HashSet<String>,
) -> Result<(), String> {
    let n = inv.name.trim().to_ascii_lowercase();
    let p = inv.path.trim().replace('\\', "/");
    // 1. AutonomyPolicy: block destructive root deletions or sensitive credential mutations before execution
    if matches!(n.as_str(), "delete_file" | "delete" | "remove_file" | "rm" | "del" | "unlink")
        && (p.is_empty() || p == "." || p == "/" || p == "./")
    {
        return Err("[Approval requested from user] Blocked root workspace deletion (`delete_file` on project root).".to_string());
    }
    if is_mutating_or_exec_tool(&n)
        && (p.ends_with(".pem")
            || p.ends_with(".key")
            || p.ends_with("id_rsa")
            || p == ".env"
            || p.starts_with(".env.")
            || p.starts_with(".git/"))
    {
        return Err(format!(
            "[Approval requested from user] Modifying sensitive file '{}' requires explicit approval.",
            p
        ));
    }
    // 2. PreToolUse: deduplicate identical read/list/search calls in the same turn
    if matches!(
        n.as_str(),
        "list_dir" | "ls" | "dir" | "list_files" | "read_file" | "read" | "cat" | "search_code" | "grep" | "glob"
    ) {
        let sig = format!(
            "{}|{}|{}|{:?}|{:?}",
            n,
            p,
            inv.body.trim(),
            inv.start_line,
            inv.end_line
        );
        if !seen_reads.insert(sig) {
            return Err(format!(
                "[Harness² PreToolUse Hook] Duplicate {}({}) in the same turn skipped; use the result above.",
                n,
                if p.is_empty() { "." } else { &p }
            ));
        }
    }
    // 3. PreToolUse: sanitize interactive/window-spawning Windows shell commands
    if matches!(n.as_str(), "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run") {
        let mut cmd = if !inv.body.trim().is_empty() {
            inv.body.trim().to_string()
        } else {
            inv.path.trim().to_string()
        };
        for prefix in ["start \"\" ", "start cmd /k ", "start cmd /c ", "cmd /k ", "powershell -NoExit "] {
            if let Some(stripped) = cmd.strip_prefix(prefix) {
                cmd = stripped.trim().to_string();
            }
        }
        if matches!(cmd.to_ascii_lowercase().as_str(), "pause" | "cmd" | "cmd.exe" | "powershell" | "powershell.exe" | "pwsh" | "bash") {
            return Err("[Harness² PreToolUse Hook] Interactive shell session without a command is blocked.".to_string());
        }
        inv.body = cmd;
    }
    Ok(())
}
/// Execute workspace tools AFTER stream completion in dependency-ordered waves with PreToolUse & AutonomyPolicy guards.
fn execute_inline_workspace_tools(
    app: &AppHandle,
    event_topic: &str,
    workspace_root: &str,
    full_text: &str,
    executed_ids: &mut HashSet<String>,
) {
    let clean_text = strip_thinking_blocks(full_text);
    let mut invocations = parse_inline_invocations_segment(&clean_text, false, true);
    if invocations.is_empty() && clean_text.trim().len() < 80 {
        invocations = parse_inline_invocations_segment(full_text, false, true);
    }
    if invocations.is_empty() {
        return;
    }
    let eff_root = resolve_workspace_root(workspace_root);
    let waves = compute_tool_batch_waves(&invocations);
    let mut seen_reads = HashSet::new();
    for wave in waves {
        for idx in wave {
            let mut inv = invocations[idx].clone();
            let name = inv.name.trim().to_string();
            if matches!(name.as_str(), "TOOL" | "tool_name" | "NAME" | "") {
                continue;
            }
            let req_tag = event_topic.rsplit('/').next().unwrap_or("r");
            let dedup_key = format!("{}|{}|{}|{}", inv.offset, name, inv.path, inv.body.trim());
            if !executed_ids.insert(dedup_key) {
                continue;
            }
            let tool_id = format!("tool-{}-{}-{}", req_tag, executed_ids.len(), inv.offset);
            let mut emit_args = json!({
                "path": inv.path,
                "body": inv.body.trim()
            });
            if let Some(st) = inv.start_line {
                emit_args["start"] = json!(st);
            }
            if let Some(en) = inv.end_line {
                emit_args["end"] = json!(en);
            }
            let _ = app.emit(
                event_topic,
                json!({
                    "type": "tool_call",
                    "id": tool_id,
                    "name": name,
                    "args": emit_args
                }),
            );
            if name.starts_with("studio_") || name.contains("studio_") {
                continue;
            }
            if let Err(blocked_msg) = pre_tool_and_autonomy_guard(&mut inv, &mut seen_reads) {
                let _ = app.emit(
                    event_topic,
                    json!({
                        "type": "tool_result",
                        "id": tool_id,
                        "ok": false,
                        "output": blocked_msg
                    }),
                );
                continue;
            }
            let is_file_mutation = is_mutating_or_exec_tool(name.as_str())
                && !matches!(name.as_str(), "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run" | "python" | "python3" | "py" | "python_exec" | "run_python");
            let old_content = if is_file_mutation && !inv.path.is_empty() {
                checkpoint_capture_file(&eff_root, req_tag, &format!("{} {}", name, inv.path), &inv.path);
                fs_read(eff_root.clone(), inv.path.clone()).ok()
            } else {
                None
            };
            let (ok, output) = execute_single_workspace_tool(&eff_root, &inv);
            let new_content = if ok && is_file_mutation && !inv.path.is_empty() {
                fs_read(eff_root.clone(), inv.path.clone()).ok()
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
        guard.active_cancels.insert(request_id.clone(), cancel_flag.clone());
    }
    let engine_arc = engine.inner().clone();
    std::thread::spawn(move || {
        let topic = format!("zeus://chat/{}", req.request_id);
        let started = Instant::now();
        let mut accumulated = String::new();
        let mut executed_tools = HashSet::new();
        let mut enriched_req = req.clone();
        if let Some(root) = &req.workspace_root {
            if !root.trim().is_empty() && !enriched_req.system.contains("## Agent") {
                enriched_req.system.push_str(
                    "\n\n## Local Workspace Agent Tools\nYou can read or synchronize files in the open project folder by emitting `<zeus_tool name=\"write_file\" path=\"src/Screen.html\">...content...</zeus_tool>` or `<zeus_tool name=\"search_code\">query</zeus_tool>`.",
                );
            }
        }
        // Stream text and reasoning deltas ONLY; never execute workspace tools mid-delta.
        let res = dispatch_stream(&engine_arc, &enriched_req, &cancel_flag, |delta| {
            accumulated.push_str(delta);
            let _ = app.emit(
                &topic,
                json!({
                    "type": "delta",
                    "text": delta
                }),
            );
        });
        // Execute tools ONLY after stream completion in dependency-ordered waves.
        if res.is_ok() && !cancel_flag.load(Ordering::Relaxed) {
            let root = enriched_req.workspace_root.as_deref().unwrap_or("");
            execute_inline_workspace_tools(&app, &topic, root, &accumulated, &mut executed_tools);
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
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_stormy_text_edits_strips_line_numbers_and_matches_block_anchors() {
        let original = "fn alpha() {\n    let x = 10;\n    let y = 20;\n    println!(\"{}\", x + y);\n}\n";
        let numbered_old = "   1|fn alpha() {\n   2|    let x = 10;\n   3|    let y = 20;";
        let numbered_new = "   1|fn alpha() {\n   2|    let x = 42;\n   3|    let y = 20;";
        let edited = apply_stormy_text_edit(original, numbered_old, numbered_new, false, 1)
            .expect("numbered prefix edit should apply");
        assert!(edited.contains("let x = 42;"));
        let drift_old = "fn alpha() {\n  let x = 42;\n  let y = 20;\n  println!(\"{}\", x + y);\n}";
        let drift_new = "fn alpha() {\n    let x = 99;\n}";
        let anchored = apply_stormy_text_edit(&edited, drift_old, drift_new, false, 1)
            .expect("block anchor edit should apply");
        assert!(anchored.contains("let x = 99;"));
    }
    #[test]
    fn test_stormy_function_parameter_tool_call_parsing_and_mixed_tags() {
        let raw = "<zeus_tool name=\"read_file\" path=\"a.ts\"></zeus_tool>\n<tool_call>\n<function=edit_file>\n<parameter=path>index.html</parameter>\n<parameter=old_string><h1>Old</h1></parameter>\n<parameter=new_string><h1>New</h1></parameter>\n</function>\n</tool_call>\n<edit_file path=\"b.ts\"><<<<<<< SEARCH\n1\n=======\n2\n>>>>>>> REPLACE</edit_file>";
        let parsed = parse_inline_invocations_segment(raw, false, true);
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].name, "read_file");
        assert_eq!(parsed[1].name, "edit_file");
        assert_eq!(parsed[1].path, "index.html");
        assert_eq!(parsed[2].name, "edit_file");
        assert_eq!(parsed[2].path, "b.ts");
    }
    #[test]
    fn test_multiline_json_edit_file_does_not_corrupt_json() {
        let src = "def compute(a, b):\n    total = a - b\n    return total\n";
        let tool_json = serde_json::json!({
            "path": "math.py",
            "old_string": "def compute(a, b):\n    total = a - b",
            "new_string": "def compute(a, b):\n    total = a + b"
        })
        .to_string();
        let res = crate::agent_edit::apply_search_replace(src, &tool_json)
            .expect("multiline JSON edit_file should apply cleanly");
        assert_eq!(res, "def compute(a, b):\n    total = a + b\n    return total\n");
    }
}
