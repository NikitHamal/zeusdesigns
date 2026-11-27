//! Tool execution after each model stream: guards, permission gate, interactive tools,
//! workspace tools, and `zeus://chat/<id>` tool_call / tool_result events.
use crate::agent::{compute_tool_batch_waves, is_mutating_or_exec_tool, parse_inline_invocations_segment, strip_thinking_blocks, InlineToolInvocation};
use crate::agent::agent_exec::{execute_single_workspace_tool, resolve_workspace_root};
use crate::agent_rt::{self, Ctx};
use crate::workspace::{checkpoint_capture_file, fs_read};
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::Emitter;

/// PreToolUse & AutonomyPolicy in-loop guard executed BEFORE any tool modifies disk or runs shell commands.
pub fn pre_tool_and_autonomy_guard(
    inv: &mut InlineToolInvocation,
    seen_reads: &mut HashSet<String>,
    approved: bool,
) -> Result<(), String> {
    let n = inv.name.trim().to_ascii_lowercase();
    let p = inv.path.trim().replace('\\', "/");
    // 1. AutonomyPolicy: block destructive root deletions or sensitive credential mutations before execution
    if !approved
        && matches!(n.as_str(), "delete_file" | "delete" | "remove_file" | "rm" | "del" | "unlink")
        && (p.is_empty() || p == "." || p == "/" || p == "./")
    {
        return Err("[Approval requested from user] Blocked root workspace deletion (`delete_file` on project root).".to_string());
    }
    if !approved
        && is_mutating_or_exec_tool(&n)
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
        // Strip Markdown auto-links `[https://...](https://...)` injected by web scrapers (e.g. Gemini)
        while let Some(lb) = cmd.find('[') {
            let after_lb = &cmd[lb + 1..];
            let Some(mid) = after_lb.find("](") else { break };
            let label = &after_lb[..mid];
            let after_mid = &after_lb[mid + 2..];
            if (label.starts_with("http://") || label.starts_with("https://"))
                && (after_mid.starts_with("http://") || after_mid.starts_with("https://"))
            {
                if let Some(rb) = after_mid.find(')') {
                    let href = &after_mid[..rb];
                    cmd = format!("{}{}{}", &cmd[..lb], href, &after_mid[rb + 1..]);
                    continue;
                }
            }
            break;
        }
        if matches!(cmd.to_ascii_lowercase().as_str(), "pause" | "cmd" | "cmd.exe" | "powershell" | "powershell.exe" | "pwsh" | "bash") {
            return Err("[Harness² PreToolUse Hook] Interactive shell session without a command is blocked.".to_string());
        }
        inv.body = cmd;
    }
    Ok(())
}

fn clip(s: &Option<String>) -> Option<String> {
    s.as_ref().map(|t| t.chars().take(80_000).collect::<String>())
}

/// Execute workspace tools AFTER stream completion in dependency-ordered waves.
pub fn execute_inline_workspace_tools(ctx: &Ctx, event_topic: &str, full_text: &str, executed_ids: &mut HashSet<String>) {
    let app = &ctx.app;
    let clean_text = strip_thinking_blocks(full_text);
    let mut invocations = parse_inline_invocations_segment(&clean_text, false, true);
    if invocations.is_empty() && clean_text.trim().len() < 80 {
        invocations = parse_inline_invocations_segment(full_text, false, true);
    }
    if invocations.is_empty() {
        return;
    }
    let eff_root = resolve_workspace_root(&ctx.root);
    let waves = compute_tool_batch_waves(&invocations);
    let mut seen_reads = HashSet::new();
    let req_tag = event_topic.rsplit('/').next().unwrap_or("r").to_string();
    for wave in waves {
        for idx in wave {
            if ctx.cancel.load(std::sync::atomic::Ordering::Relaxed) {
                return;
            }
            let mut inv = invocations[idx].clone();
            let name = inv.name.trim().to_string();
            if matches!(name.as_str(), "TOOL" | "tool_name" | "NAME" | "") {
                continue;
            }
            let dedup_key = format!("{}|{}|{}|{}", inv.offset, name, inv.path, inv.body.trim());
            if !executed_ids.insert(dedup_key) {
                continue;
            }
            let tool_id = format!("tool-{}-{}-{}", req_tag, executed_ids.len(), inv.offset);
            let mut emit_args = json!({ "path": inv.path, "body": inv.body.trim() });
            if let Some(st) = inv.start_line {
                emit_args["start"] = json!(st);
            }
            if let Some(en) = inv.end_line {
                emit_args["end"] = json!(en);
            }
            let _ = app.emit(event_topic, json!({ "type": "tool_call", "id": tool_id, "name": name, "args": emit_args }));
            if name.starts_with("studio_") || name.contains("studio_") || name == "session_search" {
                continue;
            }
            let result = |ok: bool, output: String, extra: Value| {
                let mut ev = json!({ "type": "tool_result", "id": tool_id, "ok": ok, "output": output });
                if let (Some(o), Some(e)) = (ev.as_object_mut(), extra.as_object()) {
                    for (k, v) in e {
                        o.insert(k.clone(), v.clone());
                    }
                }
                let _ = app.emit(event_topic, ev);
            };
            let lname = name.to_ascii_lowercase();
            let mut approved = false;
            if !matches!(lname.as_str(), "question" | "ask_user" | "ask" | "request_approval") {
                if let Some(reason) = agent_rt::danger_reason(&name, &inv.path, &inv.body) {
                    let detail: String = inv.body.trim().chars().take(600).collect();
                    if !agent_rt::request_permission(ctx, &tool_id, &name, &format!("Allow {}?", name), &detail, &reason) {
                        result(false, format!("[Permission denied by user] {}. Do not retry this action; choose another approach.", reason), json!({}));
                        continue;
                    }
                    approved = true;
                }
            }
            if let Err(blocked_msg) = pre_tool_and_autonomy_guard(&mut inv, &mut seen_reads, approved) {
                result(false, blocked_msg, json!({}));
                continue;
            }
            if let Some((ok, output)) = agent_rt::dispatch(ctx, &inv, &tool_id) {
                result(ok, output, json!({}));
                continue;
            }
            let is_patch = matches!(lname.as_str(), "apply_patch" | "patch");
            if is_patch {
                for p in crate::agent_patch::patch_paths(&crate::agent_patch::patch_text_of(&inv.path, &inv.body)) {
                    checkpoint_capture_file(&eff_root, &req_tag, &format!("{} {}", name, p), &p);
                }
            }
            let is_file_mutation = is_mutating_or_exec_tool(name.as_str())
                && !matches!(name.as_str(), "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run" | "python" | "python3" | "py" | "python_exec" | "run_python");
            let old_content = if is_file_mutation && !inv.path.is_empty() {
                checkpoint_capture_file(&eff_root, &req_tag, &format!("{} {}", name, inv.path), &inv.path);
                fs_read(eff_root.clone(), inv.path.clone()).ok()
            } else {
                None
            };
            let (ok, output) = execute_single_workspace_tool(&eff_root, &inv);
            let new_content = if ok && is_file_mutation && !inv.path.is_empty() { fs_read(eff_root.clone(), inv.path.clone()).ok() } else { None };
            let files = if is_patch { crate::agent_patch::take_last_files() } else { Vec::new() };
            result(
                ok,
                output,
                json!({
                    "oldContent": clip(&old_content),
                    "newContent": clip(&new_content),
                    "files": files,
                    "checkpointId": if (is_file_mutation || is_patch) && ok { Some(req_tag.clone()) } else { None }
                }),
            );
        }
    }
}
