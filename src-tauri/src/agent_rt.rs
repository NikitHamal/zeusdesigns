//! Agent runtime: interactive pause/resume (`question`, `request_approval`), per-session todos,
//! permission memory, background-result inbox and the child-session registry used by subagents.
use crate::agent::InlineToolInvocation;
use crate::providers::{ChatMessage, ChatRequest, ProviderEngine};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex, OnceLock,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct Ctx {
    pub app: AppHandle,
    pub engine: Arc<ProviderEngine>,
    pub cancel: Arc<AtomicBool>,
    pub session_id: String,
    pub root_session: String,
    pub depth: u32,
    pub max_depth: u32,
    pub agent_type: String,
    pub req: ChatRequest,
    pub root: String,
}

#[derive(Clone)]
pub struct SubSession {
    pub id: String,
    pub parent: String,
    pub depth: u32,
    pub agent_type: String,
    pub provider: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub running: bool,
    pub tokens: u64,
}

fn lock<T>(m: &'static Mutex<T>) -> std::sync::MutexGuard<'static, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
pub fn waiters() -> &'static Mutex<HashMap<String, mpsc::Sender<Value>>> {
    static W: OnceLock<Mutex<HashMap<String, mpsc::Sender<Value>>>> = OnceLock::new();
    W.get_or_init(Default::default)
}
fn always() -> &'static Mutex<HashSet<String>> {
    static A: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    A.get_or_init(Default::default)
}
fn todo_store() -> &'static Mutex<HashMap<String, Vec<Value>>> {
    static T: OnceLock<Mutex<HashMap<String, Vec<Value>>>> = OnceLock::new();
    T.get_or_init(Default::default)
}
pub fn bg_inbox() -> &'static Mutex<HashMap<String, Vec<String>>> {
    static B: OnceLock<Mutex<HashMap<String, Vec<String>>>> = OnceLock::new();
    B.get_or_init(Default::default)
}
pub fn subs() -> &'static Mutex<HashMap<String, SubSession>> {
    static S: OnceLock<Mutex<HashMap<String, SubSession>>> = OnceLock::new();
    S.get_or_init(Default::default)
}
pub fn sub_cancels() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static S: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    S.get_or_init(Default::default)
}
pub fn guard<T>(m: &'static Mutex<T>) -> std::sync::MutexGuard<'static, T> {
    lock(m)
}

pub fn emit(ctx: &Ctx, topic: &str, payload: Value) {
    let _ = ctx.app.emit(topic, payload);
}

/// Emit `payload` on `topic` and block until the UI answers via `resolve` (or the turn is cancelled).
pub fn pause(ctx: &Ctx, topic: &str, id: &str, mut payload: Value) -> Option<Value> {
    let (tx, rx) = mpsc::channel::<Value>();
    lock(waiters()).insert(id.to_string(), tx);
    payload["id"] = json!(id);
    payload["sessionId"] = json!(ctx.root_session);
    payload["agentSessionId"] = json!(ctx.session_id);
    emit(ctx, topic, payload);
    loop {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(v) => return Some(v),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if ctx.cancel.load(Ordering::Relaxed) {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    lock(waiters()).remove(id);
    emit(ctx, "zeus://dock-clear", json!({ "id": id }));
    None
}

fn resolve(id: &str, v: Value) -> Result<(), String> {
    let tx = lock(waiters()).remove(id);
    match tx {
        Some(tx) => tx.send(v).map_err(|e| e.to_string()),
        None => Err("no pending request with that id".to_string()),
    }
}

#[tauri::command]
pub fn agent_answer_question(id: String, answers: Value, dismissed: Option<bool>) -> Result<(), String> {
    resolve(&id, json!({ "answers": answers, "dismissed": dismissed.unwrap_or(false) }))
}

#[tauri::command]
pub fn agent_answer_permission(id: String, decision: String) -> Result<(), String> {
    resolve(&id, json!({ "decision": decision }))
}

#[tauri::command]
pub fn agent_todos_get(session_id: String) -> Vec<Value> {
    lock(todo_store()).get(&session_id).cloned().unwrap_or_default()
}

#[tauri::command]
pub fn agent_todos_set(session_id: String, todos: Value) -> Vec<Value> {
    let items = normalize_todos(&todos);
    lock(todo_store()).insert(session_id, items.clone());
    items
}

#[tauri::command]
pub fn agent_subagent_cancel(session_id: String) {
    if let Some(f) = lock(sub_cancels()).get(&session_id) {
        f.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn agent_subagent_messages(session_id: String) -> Vec<Value> {
    lock(subs())
        .get(&session_id)
        .map(|s| s.messages.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect())
        .unwrap_or_default()
}

// ------------------------------------------------------------------ question

fn text_of(v: &Value) -> String {
    v.as_str().map(|s| s.to_string()).unwrap_or_default()
}

pub fn normalize_questions(inv: &InlineToolInvocation) -> Vec<Value> {
    let body = inv.body.trim();
    let root: Value = serde_json::from_str(body).unwrap_or_else(|_| {
        let t = if body.is_empty() { inv.path.clone() } else { body.to_string() };
        json!({ "question": t })
    });
    let list: Vec<Value> = if let Some(a) = root.get("questions").and_then(|v| v.as_array()) {
        a.clone()
    } else if root.is_array() {
        root.as_array().cloned().unwrap_or_default()
    } else {
        vec![root]
    };
    list.iter()
        .filter_map(|q| {
            let (text, base) = if let Some(s) = q.as_str() { (s.to_string(), json!({})) } else { (text_of(q.get("question").or_else(|| q.get("prompt")).or_else(|| q.get("text")).unwrap_or(&Value::Null)), q.clone()) };
            if text.trim().is_empty() {
                return None;
            }
            let options: Vec<Value> = base
                .get("options")
                .or_else(|| base.get("choices"))
                .and_then(|o| o.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|o| {
                            if let Some(s) = o.as_str() {
                                Some(json!({ "label": s, "description": "" }))
                            } else {
                                let label = text_of(o.get("label").or_else(|| o.get("title")).or_else(|| o.get("value")).unwrap_or(&Value::Null));
                                if label.is_empty() {
                                    None
                                } else {
                                    Some(json!({ "label": label, "description": text_of(o.get("description").unwrap_or(&Value::Null)) }))
                                }
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();
            let multiple = base.get("multiple").or_else(|| base.get("multi")).or_else(|| base.get("multiSelect")).and_then(|v| v.as_bool()).unwrap_or(false);
            let custom = base.get("custom").and_then(|v| v.as_bool()).unwrap_or(true);
            let header = text_of(base.get("header").unwrap_or(&Value::Null));
            Some(json!({ "question": text, "header": header, "options": options, "multiple": multiple, "custom": custom }))
        })
        .take(4)
        .collect()
}

pub fn run_question(ctx: &Ctx, inv: &InlineToolInvocation, tool_id: &str) -> (bool, String) {
    let questions = normalize_questions(inv);
    if questions.is_empty() {
        return (false, "question: no questions provided".to_string());
    }
    let answer = pause(ctx, "zeus://question", tool_id, json!({ "questions": questions, "toolId": tool_id }));
    let Some(ans) = answer else { return (false, "question: cancelled before the user answered".to_string()) };
    if ans.get("dismissed").and_then(|v| v.as_bool()).unwrap_or(false) {
        return (false, "The user dismissed the question without answering. Continue with your best judgement or explain what you need.".to_string());
    }
    let answers: Vec<Vec<String>> = ans
        .get("answers")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().map(|x| x.as_array().map(|y| y.iter().map(|z| text_of(z)).collect()).unwrap_or_else(|| vec![text_of(x)])).collect())
        .unwrap_or_default();
    let pairs: Vec<String> = questions
        .iter()
        .enumerate()
        .map(|(i, q)| {
            let a = answers.get(i).map(|v| v.join(", ")).unwrap_or_default();
            format!("\"{}\"=\"{}\"", text_of(&q["question"]), if a.is_empty() { "Unanswered".to_string() } else { a })
        })
        .collect();
    (
        true,
        format!(
            "User has answered your questions: {}. You can now continue with the user's answers in mind.\n{}",
            pairs.join(", "),
            json!({ "answers": answers })
        ),
    )
}

// ---------------------------------------------------------------- permission

pub fn danger_reason(name: &str, path: &str, body: &str) -> Option<String> {
    let n = name.trim().to_ascii_lowercase();
    let p = path.trim().replace('\\', "/");
    let is_shell = matches!(n.as_str(), "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run");
    if is_shell {
        let cmd = if body.trim().is_empty() { path } else { body }.to_ascii_lowercase();
        let patterns: [(&str, &str); 12] = [
            ("rm -rf", "Recursive force delete"),
            ("rm -fr", "Recursive force delete"),
            ("git push --force", "Force push"),
            ("git push -f", "Force push"),
            ("git reset --hard", "Hard reset discards local changes"),
            ("git clean -f", "Delete untracked files"),
            ("del /s", "Recursive delete"),
            ("rmdir /s", "Recursive delete"),
            ("remove-item -recurse", "Recursive delete"),
            ("drop table", "Drop database table"),
            ("| sh", "Pipe download into a shell"),
            ("| bash", "Pipe download into a shell"),
        ];
        for (pat, why) in patterns {
            if cmd.contains(pat) {
                return Some(why.to_string());
            }
        }
        return None;
    }
    if matches!(n.as_str(), "delete_file" | "delete" | "remove_file" | "rm" | "del" | "unlink") && (p.is_empty() || p == "." || p == "/" || p == "./") {
        return Some("Delete the whole project".to_string());
    }
    let mutating = matches!(n.as_str(), "write_file" | "write" | "create_file" | "edit_file" | "edit" | "multi_edit" | "delete_file" | "move_file" | "append_file" | "regex_replace" | "insert_at_line");
    if mutating && (p.ends_with(".pem") || p.ends_with(".key") || p.ends_with("id_rsa") || p == ".env" || p.starts_with(".env.") || p.starts_with(".git/")) {
        return Some(format!("Modify sensitive file ({})", p));
    }
    None
}

/// Returns true when the action may proceed (allow once / always, or previously always-allowed).
pub fn request_permission(ctx: &Ctx, id: &str, tool: &str, title: &str, detail: &str, reason: &str) -> bool {
    let key = format!("{}|{}", ctx.root_session, reason);
    if lock(always()).contains(&key) {
        return true;
    }
    let ans = pause(ctx, "zeus://permission", id, json!({ "tool": tool, "title": title, "detail": detail, "reason": reason }));
    match ans.as_ref().and_then(|a| a.get("decision")).and_then(|d| d.as_str()) {
        Some("once") => true,
        Some("always") => {
            lock(always()).insert(key);
            true
        }
        _ => false,
    }
}

pub fn run_request_approval(ctx: &Ctx, inv: &InlineToolInvocation, tool_id: &str) -> (bool, String) {
    let body = inv.body.trim();
    let j: Value = serde_json::from_str(body).unwrap_or_else(|_| json!({ "action": if body.is_empty() { inv.path.clone() } else { body.to_string() } }));
    let action = text_of(j.get("action").or_else(|| j.get("question")).or_else(|| j.get("title")).unwrap_or(&Value::Null));
    let detail = text_of(j.get("detail").or_else(|| j.get("description")).unwrap_or(&Value::Null));
    let reason = text_of(j.get("dangerReason").or_else(|| j.get("reason")).unwrap_or(&Value::Null));
    let action = if action.is_empty() { "Approve this action".to_string() } else { action };
    let ans = pause(ctx, "zeus://permission", tool_id, json!({ "tool": "request_approval", "title": action, "detail": detail, "reason": reason, "explicit": true }));
    match ans.as_ref().and_then(|a| a.get("decision")).and_then(|d| d.as_str()) {
        Some("once") => (true, "Approved by the user (once). Proceed with the action.".to_string()),
        Some("always") => (true, "Approved by the user (always for this session). Proceed with the action.".to_string()),
        Some(_) => (false, "Denied by the user. Do not perform this action; choose another approach or ask what to do instead.".to_string()),
        None => (false, "request_approval: cancelled before the user decided".to_string()),
    }
}

// --------------------------------------------------------------------- todos

pub fn normalize_todos(v: &Value) -> Vec<Value> {
    let list = v
        .get("todos")
        .or_else(|| v.get("tasks"))
        .or_else(|| v.get("plan"))
        .or_else(|| v.get("steps"))
        .and_then(|x| x.as_array())
        .cloned()
        .or_else(|| v.as_array().cloned())
        .unwrap_or_default();
    list.iter()
        .enumerate()
        .filter_map(|(i, t)| {
            let content = if let Some(s) = t.as_str() { s.to_string() } else { text_of(t.get("content").or_else(|| t.get("title")).or_else(|| t.get("text")).or_else(|| t.get("task")).unwrap_or(&Value::Null)) };
            if content.trim().is_empty() {
                return None;
            }
            let raw = text_of(t.get("status").or_else(|| t.get("state")).unwrap_or(&Value::Null)).to_ascii_lowercase();
            let status = match raw.as_str() {
                "in_progress" | "active" | "doing" | "running" | "in-progress" => "in_progress",
                "completed" | "done" | "complete" => "completed",
                "cancelled" | "canceled" | "skipped" => "cancelled",
                _ => "pending",
            };
            let pr = text_of(t.get("priority").unwrap_or(&Value::Null)).to_ascii_lowercase();
            let priority = if matches!(pr.as_str(), "high" | "low") { pr } else { "medium".to_string() };
            let id = t.get("id").map(|x| x.as_str().map(|s| s.to_string()).unwrap_or_else(|| x.to_string())).unwrap_or_else(|| (i + 1).to_string());
            Some(json!({ "id": id, "content": content.trim(), "status": status, "priority": priority }))
        })
        .collect()
}

fn todo_summary(todos: &[Value]) -> String {
    let open = todos.iter().filter(|t| !matches!(t["status"].as_str(), Some("completed") | Some("cancelled"))).count();
    format!("{} todos ({} open)\n{}", todos.len(), open, serde_json::to_string_pretty(todos).unwrap_or_default())
}

pub fn run_todowrite(ctx: &Ctx, inv: &InlineToolInvocation) -> (bool, String) {
    let body = inv.body.trim();
    let v: Value = serde_json::from_str(body).unwrap_or_else(|_| {
        let lines: Vec<Value> = body.lines().map(|l| l.trim().trim_start_matches(['-', '*', ' ']).to_string()).filter(|l| !l.is_empty()).map(|l| {
            let (st, txt) = if let Some(r) = l.strip_prefix("[x]") { ("completed", r.trim().to_string()) } else if let Some(r) = l.strip_prefix("[ ]") { ("pending", r.trim().to_string()) } else { ("pending", l) };
            json!({ "content": txt, "status": st })
        }).collect();
        json!({ "todos": lines })
    });
    let items = normalize_todos(&v);
    if items.is_empty() {
        return (false, "todowrite: provide todos as [{content, status, priority}]".to_string());
    }
    lock(todo_store()).insert(ctx.session_id.clone(), items.clone());
    emit(ctx, "zeus://todo", json!({ "sessionId": ctx.session_id, "todos": items }));
    (true, todo_summary(&items))
}

pub fn run_todoread(ctx: &Ctx) -> (bool, String) {
    let items = lock(todo_store()).get(&ctx.session_id).cloned().unwrap_or_default();
    if items.is_empty() {
        return (true, "0 todos\n[]".to_string());
    }
    (true, todo_summary(&items))
}

/// Drain finished background subagent results for `session` as `<background-result>` blocks.
pub fn take_background_results(session: &str) -> String {
    lock(bg_inbox()).remove(session).map(|v| v.join("\n")).unwrap_or_default()
}

/// Interactive / session-bound tools. Returns `None` for ordinary workspace tools.
pub fn dispatch(ctx: &Ctx, inv: &InlineToolInvocation, tool_id: &str) -> Option<(bool, String)> {
    match inv.name.trim().to_ascii_lowercase().as_str() {
        "question" | "ask_user" | "ask" => Some(run_question(ctx, inv, tool_id)),
        "request_approval" => Some(run_request_approval(ctx, inv, tool_id)),
        "todowrite" | "todo_write" | "update_plan" => Some(run_todowrite(ctx, inv)),
        "todoread" | "todo_read" => Some(run_todoread(ctx)),
        "subagent" | "spawn_subagent" | "task" => Some(crate::agent_sub::run(ctx, inv, tool_id)),
        _ => None,
    }
}
