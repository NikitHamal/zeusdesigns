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

#[tauri::command]
pub fn title_generate(text: String) -> String {
    let sys = "Generate a concise 3 to 5 word design conversation title summarizing the user request. Output ONLY the title words with no quotes or punctuation.";
    if let Ok(title) = chatjimmy_complete(sys, &text) {
        let cleaned = title
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .trim_matches(['"', '\'', '.', '#'])
            .to_string();
        if !cleaned.is_empty() {
            return cleaned.chars().take(60).collect();
        }
    }
    let words: Vec<&str> = text
        .split_whitespace()
        .filter(|w| !w.is_empty())
        .take(5)
        .collect();
    if words.is_empty() {
        "New Design Session".to_string()
    } else {
        words.join(" ")
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

/// Parse inline `<zeus_tool name="..." ...>...</zeus_tool>` blocks emitted by the agent
/// when `workspaceRoot` is open, executing local file/search/shell actions and emitting
/// `tool_call` + `tool_result` events back to the UI.
fn execute_inline_workspace_tools(
    app: &AppHandle,
    event_topic: &str,
    workspace_root: &str,
    full_text: &str,
    executed_ids: &mut std::collections::HashSet<String>,
) {
    let mut search_from = 0;
    while let Some(rel_start) = full_text[search_from..].find("<zeus_tool ") {
        let start = search_from + rel_start;
        let rest = &full_text[start..];
        let Some(gt) = rest.find('>') else { break };
        let Some(end_rel) = rest.find("</zeus_tool>") else { break };
        let header = &rest[11..gt];
        let body = rest[gt + 1..end_rel].trim();
        search_from = start + end_rel + 12;

        let tool_id = format!("tool-{}", start);
        if executed_ids.contains(&tool_id) {
            continue;
        }
        executed_ids.insert(tool_id.clone());

        let name = extract_attr(header, "name").unwrap_or_else(|| "workspace_tool".to_string());
        let path_arg = extract_attr(header, "path").unwrap_or_default();

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
            "read_file" => match fs_read(workspace_root.to_string(), path_arg.clone()) {
                Ok(content) => (true, content.chars().take(4000).collect::<String>()),
                Err(e) => (false, e),
            },
            "write_file" | "sync_artboard" => {
                match fs_write(workspace_root.to_string(), path_arg.clone(), body.to_string()) {
                    Ok(_) => (true, format!("Synchronized {} ({} bytes)", path_arg, body.len())),
                    Err(e) => (false, e),
                }
            }
            "search_code" => {
                let results = search_workspace_code(workspace_root, body, 15);
                (true, serde_json::to_string_pretty(&results).unwrap_or_default())
            }
            "list_dir" => {
                let p = Path::new(workspace_root);
                let tree = walk_workspace(p, p, 2);
                (true, serde_json::to_string(&tree).unwrap_or_default())
            }
            "shell" => match shell_run(workspace_root.to_string(), body.to_string()) {
                Ok(v) => (true, v.to_string()),
                Err(e) => (false, e),
            },
            "web_fetch" => {
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
            other if other.starts_with("mcp:") => {
                let reg = crate::mcp::McpRegistry::default();
                reg.invoke_tool(other, body)
            }
            _ => (false, format!("Unknown tool '{}'", name)),
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
            if !root.trim().is_empty() {
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
            if accumulated.contains("</zeus_tool>") {
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
