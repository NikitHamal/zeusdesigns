//! Workspace diagnostics: `tsc --noEmit`, `cargo check`, `python -m py_compile` when available,
//! falling back to the built-in static audit (`audit_workspace_files`).
use crate::agent::agent_exec::format_exec_result;
use crate::workspace::{audit_workspace_files, shell_run_ex};
use std::path::Path;

fn unavailable(text: &str) -> bool {
    let t = text.to_ascii_lowercase();
    t.contains("is not recognized") || t.contains("command not found") || t.contains("could not determine executable") || t.contains("not found: tsc") || t.contains("no such file or directory") && t.contains("tsc")
}

fn cap(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}\n... (truncated)", s.chars().take(n).collect::<String>()) }
}

fn run(root: &str, label: &str, cmd: &str, timeout_ms: u64, filter: Option<&str>, sections: &mut Vec<String>) -> Option<bool> {
    match shell_run_ex(root.to_string(), cmd.to_string(), "agent", Some(timeout_ms)) {
        Ok(v) => {
            let (ok, text) = format_exec_result(&v);
            if !ok && unavailable(&text) {
                sections.push(format!("[{} unavailable]", label));
                return None;
            }
            let text = match filter {
                Some(f) if !ok => {
                    let joined = text.lines().filter(|l| l.contains(f)).collect::<Vec<_>>().join("\n");
                    if joined.is_empty() { text } else { joined }
                }
                _ => text,
            };
            sections.push(if ok { format!("[{}] 0 errors", label) } else { format!("[{}]\n{}", label, cap(&text, 8000)) });
            Some(ok)
        }
        Err(e) => {
            sections.push(format!("[{}] failed to start: {}", label, e));
            None
        }
    }
}

fn find_py(dir: &Path, out: &mut Vec<String>, root: &Path) {
    if out.len() >= 60 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if p.is_dir() {
            if matches!(name.as_str(), "node_modules" | "target" | ".git" | "venv" | ".venv" | "__pycache__" | "dist" | "build") {
                continue;
            }
            find_py(&p, out, root);
        } else if name.ends_with(".py") {
            if let Ok(rel) = p.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

pub fn diagnostics(root: &str, target: Option<String>) -> (bool, String) {
    let base = Path::new(root);
    let mut sections: Vec<String> = Vec::new();
    let mut ran = false;
    let mut failed = false;
    let t = target.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let ext = t.and_then(|s| s.rsplit('.').next()).unwrap_or("").to_ascii_lowercase();
    let want_ts = t.is_none() || matches!(ext.as_str(), "ts" | "tsx" | "js" | "jsx" | "mjs");
    let want_rs = t.is_none() || ext == "rs";
    let want_py = t.is_none() || ext == "py";
    if want_ts && base.join("tsconfig.json").exists() && base.join("package.json").exists() {
        if let Some(ok) = run(root, "tsc --noEmit", "npx --no-install tsc --noEmit --pretty false", 180_000, t.filter(|_| !ext.is_empty()), &mut sections) {
            ran = true;
            failed |= !ok;
        }
    }
    if want_rs {
        let dir = if base.join("Cargo.toml").exists() { Some("") } else if base.join("src-tauri/Cargo.toml").exists() { Some("src-tauri") } else { None };
        if let Some(d) = dir {
            let cmd = if d.is_empty() { "cargo check --message-format short".to_string() } else { format!("cd {} && cargo check --message-format short", d) };
            if let Some(ok) = run(root, "cargo check", &cmd, 400_000, None, &mut sections) {
                ran = true;
                failed |= !ok;
            }
        }
    }
    if want_py {
        let mut files = Vec::new();
        match t {
            Some(f) if ext == "py" => files.push(f.to_string()),
            _ => find_py(base, &mut files, base),
        }
        if !files.is_empty() {
            let list = files.iter().map(|f| format!("\"{}\"", f)).collect::<Vec<_>>().join(" ");
            if let Some(ok) = run(root, "python -m py_compile", &format!("python -m py_compile {}", list), 60_000, None, &mut sections) {
                ran = true;
                failed |= !ok;
            }
        }
    }
    let targets = t.map(|s| vec![s.to_string()]);
    let issues = audit_workspace_files(root, targets.as_deref());
    if !issues.is_empty() {
        sections.push(format!("[static audit]\n{}", issues.join("\n")));
    } else if !ran {
        sections.push("[static audit] 0 errors or warnings found.".to_string());
    }
    (true, if failed || !issues.is_empty() { sections.join("\n\n") } else { format!("diagnostics: clean\n{}", sections.join("\n")) })
}
