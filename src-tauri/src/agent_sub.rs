//! Real recursive subagents: child sessions, depth limit, per-agent tool policy, `sessionID`
//! follow-ups, background runs and live `zeus://subagent` events. Works for native tool-calling
//! models and keyless XML `<zeus_tool>` models (both reach us as inline `<zeus_tool>` text).
use crate::agent::{
    is_mutating_or_exec_tool, parse_inline_invocations_segment, strip_thinking_blocks,
    InlineToolInvocation,
};
use crate::agent_rt::{self, guard, Ctx, SubSession};
use crate::agent_run::pre_tool_and_autonomy_guard;
use crate::providers::{dispatch_stream, ChatMessage, ChatRequest};
use crate::workspace::{checkpoint_capture_file, fs_read};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
use std::time::Instant;

const MAX_ROUNDS: usize = 24;

#[derive(Clone, Copy, PartialEq)]
pub enum Policy {
    ReadOnly,
    Verify,
    Full,
}

pub struct AgentDef {
    pub name: String,
    pub desc: String,
    pub prompt: String,
    pub policy: Policy,
    pub model: Option<String>,
}

fn builtin(name: &str) -> Option<AgentDef> {
    let (desc, prompt, policy) = match name {
        "explore" => ("Fast read-only codebase exploration.", "Search and read the codebase to answer the question. Report concrete file paths and line numbers. Never modify files.", Policy::ReadOnly),
        "plan" => ("Read-only planning.", "Investigate the codebase and produce a concrete, ordered implementation plan with file paths. Track steps with todowrite. Never modify project files.", Policy::ReadOnly),
        "review" => ("Read-only code review.", "Review the code or diff for bugs, regressions, security problems and missing tests. Use diagnostics and git_diff. Report findings by severity with file:line. Never modify files.", Policy::ReadOnly),
        "verify" => ("Run checks and verify claims.", "Verify that the work is correct: run builds, tests and diagnostics with the shell and report exact results. Do not edit source files.", Policy::Verify),
        "general" | "coder" | "worker" => ("General purpose agent with read, write and shell access.", "Complete the delegated task end to end. Make the edits and run the commands needed, then report what changed.", Policy::Full),
        _ => return None,
    };
    Some(AgentDef { name: name.to_string(), desc: desc.to_string(), prompt: prompt.to_string(), policy, model: None })
}

fn custom_agent(root: &str, name: &str) -> Option<AgentDef> {
    if name.is_empty() || name.contains(['/', '\\', '.']) {
        return None;
    }
    let path = std::path::Path::new(root).join(".zeusdesigns/harness/sub_agents").join(name).join("AGENT.md");
    let text = std::fs::read_to_string(path).ok()?;
    let mut desc = String::new();
    let mut tools = String::new();
    let mut model = None;
    let mut body = text.as_str();
    if let Some(rest) = text.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            for line in rest[..end].lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let v = v.trim().trim_matches('"').to_string();
                    match k.trim() {
                        "description" => desc = v,
                        "tools" | "permission" | "access" => tools = v.to_ascii_lowercase(),
                        "model" => model = Some(v).filter(|m| !m.is_empty()),
                        _ => {}
                    }
                }
            }
            body = rest[end + 4..].trim_start_matches('-').trim();
        }
    }
    let policy = if tools.contains("full") || tools.contains("write") || tools.contains("edit") { Policy::Full } else if tools.contains("shell") || tools.contains("verify") { Policy::Verify } else { Policy::ReadOnly };
    Some(AgentDef { name: name.to_string(), desc: if desc.is_empty() { format!("Custom agent {}", name) } else { desc }, prompt: body.to_string(), policy, model })
}

pub fn list_custom_agents(root: &str) -> Vec<String> {
    let dir = std::path::Path::new(root).join(".zeusdesigns/harness/sub_agents");
    std::fs::read_dir(dir).map(|rd| rd.flatten().filter(|e| e.path().join("AGENT.md").exists()).filter_map(|e| e.file_name().into_string().ok()).collect()).unwrap_or_default()
}

fn is_read_tool(n: &str) -> bool {
    matches!(
        n,
        "read_file" | "read" | "cat" | "cat_file" | "view_file" | "open_file" | "read_file_lines" | "list_dir" | "ls" | "dir" | "list_files"
            | "list_directory" | "print_tree" | "tree" | "glob" | "find_files" | "grep" | "rg" | "search_code" | "search" | "search_files"
            | "ripgrep" | "find_in_files" | "search_project" | "docs_lookup" | "check_syntax" | "audit_project" | "review_project"
            | "lint_project" | "diagnostics" | "lsp" | "web_fetch" | "fetch" | "curl" | "webfetch" | "websearch" | "web_search"
            | "get_file_info" | "file_info" | "file_outline" | "stat" | "diff_files" | "compare_files" | "git_status" | "git_diff"
            | "git_log" | "git_branch" | "security_scan" | "find_secrets" | "audit_security" | "memory_search" | "memory_list"
            | "memory_get" | "memory_read" | "load_skill" | "use_skill" | "get_skill" | "read_skill" | "skill"
    )
}

pub fn tool_allowed(policy: Policy, name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    if n.starts_with("studio_") {
        return false;
    }
    if is_read_tool(&n) || matches!(n.as_str(), "todowrite" | "todoread" | "todo_write" | "todo_read" | "update_plan" | "subagent" | "spawn_subagent" | "task" | "question" | "ask_user") {
        return true;
    }
    match policy {
        Policy::ReadOnly => false,
        Policy::Verify => matches!(n.as_str(), "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run" | "python" | "python3" | "py" | "python_exec" | "run_python"),
        Policy::Full => true,
    }
}

fn policy_text(p: Policy) -> &'static str {
    match p {
        Policy::ReadOnly => "You are READ-ONLY: you may read, search, fetch and run diagnostics, but file edits and shell commands are rejected.",
        Policy::Verify => "You may read and run shell commands to verify, but file edit/write tools are rejected.",
        Policy::Full => "You have read, write and shell access inside the workspace.",
    }
}

fn arg_str(v: &Value, keys: &[&str]) -> String {
    keys.iter().find_map(|k| v.get(*k).and_then(|x| x.as_str())).unwrap_or("").trim().to_string()
}

fn short(s: &str, n: usize) -> String {
    let t: String = s.chars().take(n).collect();
    if s.chars().count() > n { format!("{}...", t) } else { t }
}

pub fn run(ctx: &Ctx, inv: &InlineToolInvocation, tool_id: &str) -> (bool, String) {
    let body = inv.body.trim();
    let args: Value = serde_json::from_str(body).unwrap_or_else(|_| {
        if body.is_empty() { json!({ "prompt": inv.path.clone() }) } else { json!({ "prompt": body, "agent": inv.path.clone() }) }
    });
    let mut agent = arg_str(&args, &["agent", "agent_type", "subagent_type", "type"]).to_ascii_lowercase();
    if agent.is_empty() {
        agent = "explore".to_string();
    }
    let prompt = arg_str(&args, &["prompt", "task", "query", "instructions"]);
    if prompt.is_empty() {
        return (false, "subagent: `prompt` is required (include all context the child needs).".to_string());
    }
    let mut description = arg_str(&args, &["description", "title", "label"]);
    if description.is_empty() {
        description = short(&prompt.split_whitespace().take(5).collect::<Vec<_>>().join(" "), 40);
    }
    let model_ref = arg_str(&args, &["model"]);
    let resume = arg_str(&args, &["sessionID", "session_id", "sessionId", "task_id"]);
    let background = args.get("background").map(|b| b.as_bool().unwrap_or_else(|| b.as_str() == Some("true"))).unwrap_or(false);

    if ctx.depth >= ctx.max_depth {
        return (false, format!("Subagent depth limit reached ({}). Do the work in this session instead of nesting another subagent.", ctx.max_depth));
    }
    let def = match builtin(&agent).or_else(|| custom_agent(&ctx.root, &agent)) {
        Some(d) => d,
        None => {
            let mut names = vec!["explore", "plan", "review", "verify", "general"].into_iter().map(String::from).collect::<Vec<_>>();
            names.extend(list_custom_agents(&ctx.root));
            return (false, format!("Unknown agent '{}'. Available agents: {}", agent, names.join(", ")));
        }
    };

    // Provider / model: active by default, optional `provider/model[#variant]` override.
    let mut provider = ctx.req.provider.clone();
    let mut model = ctx.req.model.clone();
    let mut custom = ctx.req.custom.clone();
    if let Some(m) = Some(model_ref.clone()).filter(|m| !m.is_empty()).or_else(|| def.model.clone()) {
        if let Some((p, mm)) = m.split_once('/') {
            provider = p.trim().to_string();
            model = mm.split('#').next().unwrap_or(mm).trim().to_string();
            if provider != "custom" {
                custom = None;
            }
        } else {
            model = m.split('#').next().unwrap_or(&m).trim().to_string();
        }
    }

    // Child session: new, or resume an existing child of this session.
    let sid;
    let mut resumed = false;
    {
        let mut map = guard(agent_rt::subs());
        if !resume.is_empty() {
            match map.get_mut(&resume) {
                Some(s) if s.parent == ctx.session_id => {
                    s.messages.push(ChatMessage { role: "user".to_string(), content: prompt.clone(), attachments: vec![] });
                    sid = s.id.clone();
                    resumed = true;
                    if s.running {
                        return (true, format!("session_id: {}\nstatus: running\nYour follow-up was added to the running subagent. You will receive a <background-result kind=\"subagent\"> when it goes idle.", sid));
                    }
                    s.running = true;
                }
                Some(_) => return (false, format!("Session {} is not a child of the current session", resume)),
                None => return (false, format!("Subagent session not found: {}", resume)),
            }
        } else {
            sid = format!("sub_{}", crate::crypto::random_hex(10));
            map.insert(
                sid.clone(),
                SubSession {
                    id: sid.clone(),
                    parent: ctx.session_id.clone(),
                    depth: ctx.depth + 1,
                    agent_type: def.name.clone(),
                    provider: provider.clone(),
                    model: model.clone(),
                    messages: vec![ChatMessage { role: "user".to_string(), content: prompt.clone(), attachments: vec![] }],
                    running: true,
                    tokens: 0,
                },
            );
        }
    }

    let cancel = if background { Arc::new(AtomicBool::new(false)) } else { ctx.cancel.clone() };
    guard(agent_rt::sub_cancels()).insert(sid.clone(), cancel.clone());
    let mut child_req = ctx.req.clone();
    child_req.provider = provider.clone();
    child_req.model = model.clone();
    child_req.custom = custom;
    let child = Ctx {
        app: ctx.app.clone(),
        engine: ctx.engine.clone(),
        cancel,
        session_id: sid.clone(),
        root_session: ctx.root_session.clone(),
        depth: ctx.depth + 1,
        max_depth: ctx.max_depth,
        agent_type: def.name.clone(),
        req: child_req,
        root: ctx.root.clone(),
    };
    let meta = json!({
        "sessionId": sid, "parentToolId": tool_id, "parentSessionId": ctx.session_id, "agentType": def.name,
        "description": description, "model": model, "provider": provider, "depth": ctx.depth + 1,
        "prompt": short(&prompt, 600), "background": background, "resumed": resumed,
    });
    let mut start = meta.clone();
    start["type"] = json!("start");
    agent_rt::emit(ctx, "zeus://subagent", start);

    if background {
        let parent_root = ctx.root_session.clone();
        let (sid2, tool2, desc2) = (sid.clone(), tool_id.to_string(), description.clone());
        std::thread::spawn(move || {
            let (ok, out) = run_loop(&child, &sid2, &tool2, &def);
            let block = format!("<background-result kind=\"subagent\" session_id=\"{}\" status=\"idle\">\n<task_result>\n{}\n</task_result>\n</background-result>", sid2, out);
            guard(agent_rt::bg_inbox()).entry(parent_root).or_default().push(block);
            agent_rt::emit(&child, "zeus://subagent", json!({ "type": "background_result", "sessionId": sid2, "parentToolId": tool2, "description": desc2, "ok": ok }));
        });
        return (
            true,
            format!(
                "The subagent is working in the background (session_id: {}). You will receive a <background-result kind=\"subagent\"> message when it goes idle.\nDo NOT sleep, poll, or duplicate its work. Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.\nTo send follow-ups, call subagent again with this session_id.",
                sid
            ),
        );
    }
    let (ok, out) = run_loop(&child, &sid, tool_id, &def);
    (ok, format!("task_id: {} (pass this as session_id to continue the task)\n\n<task_result>\n{}\n</task_result>", sid, out))
}

fn system_for(ctx: &Ctx, def: &AgentDef) -> String {
    let mut s = format!(
        "You are the \"{}\" subagent of Zeus Codes, working in an isolated child session on a task delegated by a parent agent. {}\nWorkspace root: {}\nRules:\n- Work autonomously; you cannot ask the parent for clarification.\n- {}\n- Use tools to ground every claim. When finished, reply with a concise final report (findings with file paths and line numbers, or the changes you made) and do NOT call a tool in that final message.\n- Never write <tool_result> yourself.\n\n{}",
        def.name, def.desc, ctx.root, policy_text(def.policy), def.prompt
    );
    let tp = ctx.req.tools_prompt.clone().unwrap_or_default();
    if tp.trim().is_empty() {
        s.push_str("\n\n## Tools\nCall tools as `<zeus_tool name=\"read_file\" path=\"src/a.ts\"></zeus_tool>`, `<zeus_tool name=\"list_dir\" path=\"src\"></zeus_tool>`, `<zeus_tool name=\"search_code\">query</zeus_tool>`, `<zeus_tool name=\"glob\">**/*.ts</zeus_tool>`, `<zeus_tool name=\"shell\">command</zeus_tool>`, `<zeus_tool name=\"edit_file\" path=\"a.ts\">{\"old_string\":\"..\",\"new_string\":\"..\"}</zeus_tool>`, `<zeus_tool name=\"write_file\" path=\"a.ts\">content</zeus_tool>`. Stop after the closing tag so the harness can return `<tool_result>`.");
    } else {
        s.push_str("\n\n");
        s.push_str(&tp);
    }
    s
}

fn run_loop(ctx: &Ctx, sid: &str, parent_tool: &str, def: &AgentDef) -> (bool, String) {
    let started = Instant::now();
    let system = system_for(ctx, def);
    let mut seen: HashSet<String> = HashSet::new();
    let mut tokens: u64 = 0;
    let mut last_text = String::new();
    let mut result: Option<(bool, String)> = None;
    for round in 0..MAX_ROUNDS {
        if ctx.cancel.load(Ordering::Relaxed) {
            result = Some((false, "Subagent cancelled.".to_string()));
            break;
        }
        let msgs = guard(agent_rt::subs()).get(sid).map(|s| s.messages.clone()).unwrap_or_default();
        let last_round = round + 1 == MAX_ROUNDS;
        let mut sys = system.clone();
        if last_round {
            sys.push_str("\n\nCRITICAL - MAXIMUM STEPS REACHED: do not call any tools. Reply with your best final report now.");
        }
        let req = ChatRequest {
            request_id: format!("{}-r{}", sid, round),
            system: sys,
            messages: msgs,
            workspace_root: Some(ctx.root.clone()),
            session_id: Some(sid.to_string()),
            subagent_depth: ctx.depth,
            ..ctx.req.clone()
        };
        let mut acc = String::new();
        let res = dispatch_stream(&ctx.engine, &req, &ctx.cancel, |d| acc.push_str(d));
        if let Err(e) = res {
            result = Some((false, format!("Subagent model error: {}", e)));
            break;
        }
        tokens += (acc.len() / 4).max(1) as u64;
        let clean = strip_thinking_blocks(&acc);
        let mut invs: Vec<InlineToolInvocation> = if last_round { vec![] } else { parse_inline_invocations_segment(&clean, false, true) };
        if invs.is_empty() && !last_round && clean.trim().len() < 80 {
            invs = parse_inline_invocations_segment(&acc, false, true);
        }
        if let Some(s) = guard(agent_rt::subs()).get_mut(sid) {
            s.tokens = tokens;
            s.messages.push(ChatMessage { role: "assistant".to_string(), content: clean.clone(), attachments: vec![] });
        }
        agent_rt::emit(ctx, "zeus://subagent", json!({ "type": "usage", "sessionId": sid, "parentToolId": parent_tool, "tokens": tokens }));
        if invs.is_empty() {
            let text = clean.trim().to_string();
            let text = if text.is_empty() { last_text.clone() } else { text };
            agent_rt::emit(ctx, "zeus://subagent", json!({ "type": "text", "sessionId": sid, "parentToolId": parent_tool, "text": short(&text, 4000) }));
            result = Some((true, if text.is_empty() { "(subagent returned no text)".to_string() } else { text }));
            break;
        }
        last_text = clean.trim().to_string();
        let mut results = String::new();
        for (n, mut inv) in invs.into_iter().take(8).enumerate() {
            let name = inv.name.trim().to_string();
            let id = format!("{}-t{}-{}", sid, round, n);
            agent_rt::emit(
                ctx,
                "zeus://subagent",
                json!({ "type": "tool_call", "sessionId": sid, "parentToolId": parent_tool, "id": id, "name": name, "args": { "path": inv.path, "body": short(inv.body.trim(), 1200) } }),
            );
            let (ok, out) = exec_one(ctx, def, &mut inv, &id, &mut seen);
            agent_rt::emit(ctx, "zeus://subagent", json!({ "type": "tool_result", "sessionId": sid, "parentToolId": parent_tool, "id": id, "ok": ok, "output": short(&out, 3000) }));
            results.push_str(&format!("<tool_result name=\"{}\" ok=\"{}\">\n{}\n</tool_result>\n", name, ok, short(&out, 24_000)));
        }
        let msg = format!("Tool results:\n{}\nContinue the task. If it is complete, give the final report without calling tools.", results);
        if let Some(s) = guard(agent_rt::subs()).get_mut(sid) {
            s.messages.push(ChatMessage { role: "user".to_string(), content: msg, attachments: vec![] });
        }
    }
    let (ok, out) = result.unwrap_or((true, if last_text.is_empty() { "Subagent stopped without a final report.".to_string() } else { last_text }));
    if let Some(s) = guard(agent_rt::subs()).get_mut(sid) {
        s.running = false;
    }
    agent_rt::emit(
        ctx,
        "zeus://subagent",
        json!({ "type": "done", "sessionId": sid, "parentToolId": parent_tool, "ok": ok, "output": short(&out, 6000), "tokens": tokens, "durationMs": started.elapsed().as_millis() as u64 }),
    );
    (ok, out)
}

fn exec_one(ctx: &Ctx, def: &AgentDef, inv: &mut InlineToolInvocation, id: &str, seen: &mut HashSet<String>) -> (bool, String) {
    let name = inv.name.trim().to_string();
    if matches!(name.as_str(), "TOOL" | "tool_name" | "NAME" | "") {
        return (false, "Invalid tool name".to_string());
    }
    if !tool_allowed(def.policy, &name) {
        return (false, format!("Tool '{}' is not permitted for the {} agent. {}", name, def.name, policy_text(def.policy)));
    }
    let danger = agent_rt::danger_reason(&name, &inv.path, &inv.body);
    let mut approved = false;
    if let Some(reason) = &danger {
        if !agent_rt::request_permission(ctx, id, &name, &format!("{} wants to run {}", def.name, name), inv.body.trim(), reason) {
            return (false, format!("[Permission denied by user] {}", reason));
        }
        approved = true;
    }
    if let Err(blocked) = pre_tool_and_autonomy_guard(inv, seen, approved) {
        return (false, blocked);
    }
    if let Some((ok, out)) = agent_rt::dispatch(ctx, inv, id) {
        return (ok, out);
    }
    if is_mutating_or_exec_tool(&name.to_ascii_lowercase()) && !inv.path.is_empty() && fs_read(ctx.root.clone(), inv.path.clone()).is_ok() {
        checkpoint_capture_file(&ctx.root, &ctx.root_session, &format!("{} {}", name, inv.path), &inv.path);
    }
    crate::agent::agent_exec::execute_single_workspace_tool(&ctx.root, inv)
}
