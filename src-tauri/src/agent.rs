use crate::providers::{
    catalog, chatjimmy_complete, dispatch_stream, ChatRequest, ProviderEngine, ProviderInfo,
};
use crate::workspace::{fs_read, fs_write, search_workspace_code, shell_run, walk_workspace};
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

/// Parse inline `<zeus_tool name="..." ...>...</zeus_tool>` blocks emitted by the agent
/// outside `<think>` blocks, executing local file/search/shell actions and emitting
/// `tool_call` + `tool_result` events back to the UI.
fn execute_inline_workspace_tools(
    app: &AppHandle,
    event_topic: &str,
    workspace_root: &str,
    full_text: &str,
    executed_ids: &mut std::collections::HashSet<String>,
) {
    let clean_text = strip_thinking_blocks(full_text);
    let eff_root = resolve_workspace_root(workspace_root);
    let mut search_from = 0;
    while let Some(rel_start) = clean_text[search_from..].find("<zeus_tool ") {
        let start = search_from + rel_start;
        let rest = &clean_text[start..];
        let Some(gt) = rest.find('>') else { break };
        let Some(end_rel) = rest.find("</zeus_tool>") else { break };
        let header = &rest[11..gt];
        let body = rest[gt + 1..end_rel].trim();
        search_from = start + end_rel + 12;

        let name = extract_attr(header, "name").unwrap_or_else(|| "workspace_tool".to_string());
        let path_arg = extract_attr(header, "path").unwrap_or_default();

        // Ignore literal syntax examples if a model ever echoes the template placeholder
        if matches!(name.as_str(), "TOOL" | "tool_name" | "NAME" | "") {
            continue;
        }

        let tool_id = format!("tool-{}-{}-{}", executed_ids.len() + 1, name, start);
        let dedup_key = format!("{}|{}|{}", name, path_arg, body);
        if executed_ids.contains(&dedup_key) {
            continue;
        }
        executed_ids.insert(dedup_key);

        let _ = app.emit(
            event_topic,
            json!({
                "type": "tool_call",
                "id": tool_id,
                "name": name,
                "args": { "path": path_arg, "body": body }
            }),
        );

        let (ok, output) = match name.as_str() {
            "read_file" | "read" | "cat" => match fs_read(eff_root.clone(), path_arg.clone()) {
                Ok(content) => {
                    let total = content.lines().count();
                    let start = extract_attr(header, "start").and_then(|v| v.parse::<usize>().ok()).unwrap_or(1).max(1);
                    let end = extract_attr(header, "end").and_then(|v| v.parse::<usize>().ok()).unwrap_or(usize::MAX);
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
                    (true, format!("[{} lines {}-{} of {}]\n{}", path_arg, start, last, total, out))
                }
                Err(e) => (false, e),
            },
            "edit_file" | "edit" | "patch_file" => {
                let res = fs_read(eff_root.clone(), path_arg.clone())
                    .and_then(|content| apply_search_replace(&content, body))
                    .and_then(|updated| fs_write(eff_root.clone(), path_arg.clone(), updated));
                match res {
                    Ok(_) => (true, format!("Edited {}", path_arg)),
                    Err(e) => (false, e),
                }
            }
            "write_file" | "write" | "create_file" | "sync_artboard" => {
                let target_path = if !path_arg.is_empty() {
                    path_arg.clone()
                } else {
                    extract_attr(header, "file").unwrap_or_default()
                };
                match fs_write(eff_root.clone(), target_path.clone(), body.to_string()) {
                    Ok(_) => (true, format!("Synchronized {} ({} bytes)", target_path, body.len())),
                    Err(e) => (false, e),
                }
            }
            "search_code" | "grep" | "search" => {
                let query = if !body.is_empty() { body } else { path_arg.as_str() };
                let results = search_workspace_code(&eff_root, query, 20);
                if results.is_empty() {
                    (true, format!("No matches found for '{}'", query))
                } else {
                    (true, serde_json::to_string_pretty(&results).unwrap_or_default())
                }
            }
            "list_dir" | "ls" | "list_files" => {
                let p = Path::new(&eff_root);
                if path_arg.contains("..") {
                    (false, "list_dir: path must stay inside the project".to_string())
                } else {
                    let clean_rel = path_arg.trim().trim_matches(|c| c == '.' || c == '/' || c == '\\');
                    let target = if clean_rel.is_empty() { p.to_path_buf() } else { p.join(clean_rel) };
                    let tree = walk_workspace(p, &target, 2);
                    if tree.is_empty() {
                        (true, "Directory is empty (0 files). Proceed directly without re-listing.".to_string())
                    } else {
                        (true, serde_json::to_string(&tree).unwrap_or_default())
                    }
                }
            }
            "shell" | "bash" | "cmd" | "exec" | "run_command" => {
                let cmd_str = if !body.is_empty() { body.to_string() } else { path_arg.clone() };
                match shell_run(eff_root.clone(), cmd_str) {
                    Ok(v) => (true, v.to_string()),
                    Err(e) => (false, e),
                }
            }
            "python" | "python_exec" => {
                let script = if !body.is_empty() { body } else { path_arg.as_str() };
                let py_cmd = if cfg!(windows) {
                    format!("python -c {}", serde_json::to_string(script).unwrap_or_else(|_| "\"\"".to_string()))
                } else {
                    format!("python3 -c {}", serde_json::to_string(script).unwrap_or_else(|_| "\"\"".to_string()))
                };
                match shell_run(eff_root.clone(), py_cmd) {
                    Ok(v) => (true, v.to_string()),
                    Err(e) => (false, e),
                }
            }
            "web_fetch" | "fetch" => {
                let target_url = if !path_arg.is_empty() { path_arg.as_str() } else { body };
                match reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_secs(15))
                    .build()
                    .and_then(|c| c.get(target_url).send())
                    .and_then(|r| r.text())
                {
                    Ok(txt) => {
                        let readable = if txt.contains('<') { html_to_text(&txt) } else { txt };
                        (true, readable.chars().take(8000).collect::<String>())
                    }
                    Err(e) => (false, format!("web_fetch failed: {}", e)),
                }
            }
            "memory" => {
                let store = crate::memory::MemoryStore::default();
                let items = store.add(body.to_string(), Some("agent".to_string()));
                (true, format!("Saved to persistent memory ({} total items)", items.len()))
            }
            other if other.starts_with("studio_") || other.contains("studio_") => {
                // Built-in Zeus Studio tools execute directly in the frontend webview runtime.
                continue;
            }
            other if other.starts_with("mcp:") => {
                let reg = crate::mcp::McpRegistry::default();
                reg.invoke_tool(other, body)
            }
            _ => (false, format!("Unknown tool '{}'. Valid tools: read_file, write_file, edit_file, list_dir, search_code, shell, python, web_fetch, memory.", name)),
        };

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

/// Applies one or more `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` blocks. Each SEARCH must match exactly once.
fn apply_search_replace(content: &str, body: &str) -> Result<String, String> {
    let s_tag = "<<<<<<< SEARCH";
    let m_tag = "=======";
    let r_tag = ">>>>>>> REPLACE";
    let crlf = content.contains("\r\n");
    let mut out = content.to_string();
    let mut rest = body;
    let mut n = 0usize;
    while let Some(si) = rest.find(s_tag) {
        let after_s = &rest[si + s_tag.len()..];
        let Some(mi) = after_s.find(m_tag) else {
            return Err("edit_file: missing ======= divider".to_string());
        };
        let search_raw = after_s[..mi].trim_matches(|c| c == '\n' || c == '\r');
        let after_m = &after_s[mi + m_tag.len()..];
        let Some(ri) = after_m.find(r_tag) else {
            return Err("edit_file: missing >>>>>>> REPLACE".to_string());
        };
        let replace_raw = after_m[..ri].trim_matches(|c| c == '\n' || c == '\r');
        rest = &after_m[ri + r_tag.len()..];
        if search_raw.is_empty() {
            return Err("edit_file: SEARCH block is empty".to_string());
        }
        let (search, replace) = if crlf {
            (
                search_raw.replace("\r\n", "\n").replace('\n', "\r\n"),
                replace_raw.replace("\r\n", "\n").replace('\n', "\r\n"),
            )
        } else {
            (search_raw.to_string(), replace_raw.to_string())
        };
        let count = out.matches(search.as_str()).count();
        if count == 0 {
            return Err(format!("edit_file: SEARCH block {} not found. Read the file again and copy the lines exactly.", n + 1));
        }
        if count > 1 {
            return Err(format!("edit_file: SEARCH block {} matches {} places. Add surrounding lines so it is unique.", n + 1, count));
        }
        out = out.replacen(search.as_str(), replace.as_str(), 1);
        n += 1;
    }
    if n == 0 {
        return Err("edit_file: BODY needs a <<<<<<< SEARCH / ======= / >>>>>>> REPLACE block".to_string());
    }
    Ok(out)
}

fn extract_attr(header: &str, key: &str) -> Option<String> {
    let pat = format!("{}=\"", key);
    let start = header.find(&pat)? + pat.len();
    let rest = &header[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
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

        // Inject persistent memory items and workspace/MCP agent tool instructions
        let mut enriched_req = req.clone();
        let mem_items = crate::memory::MemoryStore::default().list();
        if !mem_items.is_empty() {
            enriched_req.system.push_str("\n\n## Persistent User & Design Memory\n");
            for m in mem_items.iter().take(20) {
                enriched_req.system.push_str(&format!("- [{}] {}\n", m.category, m.text));
            }
        }
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
            if strip_thinking_blocks(&accumulated).contains("</zeus_tool>") {
                let root = enriched_req.workspace_root.as_deref().unwrap_or("");
                execute_inline_workspace_tools(
                    &app,
                    &topic,
                    root,
                    &accumulated,
                    &mut executed_tools,
                );
            }
        });

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
