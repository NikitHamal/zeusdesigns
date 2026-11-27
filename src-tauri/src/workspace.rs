use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_ui_component: Option<bool>,
}

pub struct WorkspaceState {
    pub current_root: Mutex<Option<String>>,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            current_root: Mutex::new(None),
        }
    }
}

fn ignored_dirs() -> HashSet<&'static str> {
    [
        "node_modules",
        ".git",
        "dist",
        "build",
        "target",
        ".next",
        ".gradle",
        ".idea",
        "__pycache__",
        ".venv",
        "venv",
        ".turbo",
        "coverage",
        "appdata",
        "$recycle.bin",
        "system volume information",
        ".cache",
        ".cargo",
        ".rustup",
        ".npm",
        ".pnpm-store",
        ".yarn",
        ".gradle",
        ".m2",
        "obj",
        ".dart_tool",
        "pods",
        "deriveddata",
        ".pytest_cache",
        ".mypy_cache",
        ".svelte-kit",
        ".nuxt",
        ".parcel-cache",
        "site-packages",
        "windows",
    ]
    .into_iter()
    .collect()
}

pub fn detect_language(ext: &str) -> (&'static str, bool) {
    match ext.to_ascii_lowercase().as_str() {
        "tsx" | "jsx" => ("typescriptreact", true),
        "vue" | "svelte" | "astro" => ("ui-component", true),
        "html" | "htm" => ("html", true),
        "css" | "scss" | "less" => ("stylesheet", true),
        "kt" | "kts" => ("kotlin", true),
        "xml" => ("xml", true),
        "swift" => ("swift", true),
        "dart" => ("dart", true),
        "ts" => ("typescript", false),
        "js" | "mjs" | "cjs" => ("javascript", false),
        "rs" => ("rust", false),
        "cpp" | "cc" | "cxx" | "hpp" | "h" => ("cpp", false),
        "py" => ("python", false),
        "json" => ("json", false),
        "md" | "mdx" => ("markdown", false),
        _ => ("text", false),
    }
}

pub fn safe_join(root: &str, rel_path: &str) -> Result<PathBuf, String> {
    let root_path = Path::new(root)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(root));
    let norm_rel = rel_path.trim().replace('\\', "/");
    let norm_root = root.trim().replace('\\', "/").trim_end_matches('/').to_string();
    let norm_canon = root_path
        .to_string_lossy()
        .replace('\\', "/")
        .trim_start_matches("//?/")
        .trim_end_matches('/')
        .to_string();
    let stripped = if !norm_root.is_empty() && norm_rel.starts_with(&norm_root) {
        &norm_rel[norm_root.len()..]
    } else if !norm_canon.is_empty() && norm_rel.starts_with(&norm_canon) {
        &norm_rel[norm_canon.len()..]
    } else {
        norm_rel.as_str()
    };
    let mut cleaned = stripped
        .trim_start_matches("./")
        .trim_start_matches(['/', '\\'])
        .to_string();
    // Strip hallucinated container root prefixes (`/workspace/`, `/app/`, `/project/`, `/home/user/.../`)
    // when the model invents an absolute Linux path that does not exist as a subdirectory in `root_path`.
    for container_prefix in ["workspace/", "app/", "project/"] {
        if let Some(rest) = cleaned.strip_prefix(container_prefix) {
            if !root_path.join(container_prefix.trim_end_matches('/')).exists() && !rest.is_empty() {
                cleaned = rest.to_string();
                break;
            }
        }
    }
    if (cleaned.starts_with("home/") || cleaned.starts_with("Users/") || cleaned.starts_with("root/") || cleaned.starts_with("tmp/"))
        && !root_path.join(cleaned.split('/').next().unwrap_or("")).exists()
    {
        let parts: Vec<&str> = cleaned.split('/').filter(|s| !s.is_empty()).collect();
        if let Some(src_idx) = parts.iter().position(|&p| matches!(p, "src" | "test" | "tests" | "lib" | "public" | "scripts" | "docs" | ".zeusdesigns")) {
            cleaned = parts[src_idx..].join("/");
        } else if let Some(last) = parts.last() {
            cleaned = (*last).to_string();
        }
    }
    let candidate = root_path.join(&cleaned);
    for comp in Path::new(&cleaned).components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err("Path traversal outside workspace root is not permitted".to_string());
        }
    }
    Ok(candidate)
}

const MAX_NODES: usize = 350;
const MAX_PER_DIR: usize = 180;

fn is_link_or_hidden_system(entry: &fs::DirEntry) -> bool {
    let ft = match entry.file_type() {
        Ok(t) => t,
        Err(_) => return true,
    };
    if ft.is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(m) = entry.metadata() {
            // Skip hidden/system OS junctions like "Application Data" or "Local Settings" (SYSTEM = 0x4, REPARSE+HIDDEN = 0x402)
            let attr = m.file_attributes();
            if (attr & 0x4) != 0 || ((attr & 0x400) != 0 && (attr & 0x2) != 0) {
                return true;
            }
        }
    }
    false
}

/// Refuses only bare drive roots (`C:\`) and OS system folders (`C:\Windows`), while allowing any user folder
/// (including OneDrive/junction folders and user directories) since the walker is strictly depth-1 bounded.
pub fn check_project_root(root: &Path) -> Result<(), String> {
    let canon = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    if canon.parent().is_none() {
        return Err("That is a drive root. Pick a folder inside it.".into());
    }
    let s = canon.to_string_lossy().replace('\\', "/").trim_start_matches("//?/").trim_end_matches('/').to_lowercase();
    let parts: Vec<&str> = s.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() <= 2 && parts.iter().any(|p| matches!(*p, "windows" | "system32" | "syswow64" | "$recycle.bin" | "system volume information")) {
        return Err("OS system folders cannot be opened as a project.".into());
    }
    Ok(())
}

struct Budget {
    left: usize,
    truncated: bool,
}

fn walk_budget(base_root: &Path, current: &Path, depth: usize, skip: &HashSet<&'static str>, budget: &mut Budget) -> Vec<FileNode> {
    let mut nodes = Vec::new();
    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return nodes,
    };
    let mut dirs: Vec<(String, PathBuf)> = Vec::new();
    let mut files: Vec<(String, PathBuf, u64)> = Vec::new();
    let mut seen = 0usize;
    for entry in entries.flatten() {
        seen += 1;
        if seen > MAX_PER_DIR * 8 {
            budget.truncated = true;
            break;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        if skip.contains(file_name.as_str()) || file_name.starts_with(".DS_Store") {
            continue;
        }
        if file_name.starts_with('.') && !matches!(file_name.as_str(), ".github" | ".env.example" | ".gitignore" | ".zeusdesigns" | ".eslintrc" | ".prettierrc") {
            continue;
        }
        if is_link_or_hidden_system(&entry) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            dirs.push((file_name, path));
        } else {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            files.push((file_name, path, size));
        }
    }
    dirs.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    files.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    let mut in_dir = 0usize;
    for (name, path) in dirs {
        if budget.left == 0 || in_dir >= MAX_PER_DIR {
            budget.truncated = true;
            break;
        }
        budget.left -= 1;
        in_dir += 1;
        let rel = path.strip_prefix(base_root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        let children = if depth > 0 { walk_budget(base_root, &path, depth - 1, skip, budget) } else { Vec::new() };
        nodes.push(FileNode { name, path: rel, dir: true, children: Some(children), size: None, language: None, is_ui_component: None });
    }
    for (name, path, size) in files {
        if budget.left == 0 || in_dir >= MAX_PER_DIR {
            budget.truncated = true;
            break;
        }
        budget.left -= 1;
        in_dir += 1;
        let rel = path.strip_prefix(base_root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
        let (lang, is_ui) = detect_language(&ext);
        nodes.push(FileNode { name, path: rel, dir: false, children: None, size: Some(size), language: Some(lang.to_string()), is_ui_component: Some(is_ui) });
    }
    nodes
}

pub fn walk_workspace(base_root: &Path, current: &Path, depth: usize) -> Vec<FileNode> {
    walk_workspace_n(base_root, current, depth, MAX_NODES)
}

pub fn walk_workspace_n(base_root: &Path, current: &Path, depth: usize, max_nodes: usize) -> Vec<FileNode> {
    let skip = ignored_dirs();
    let mut budget = Budget { left: max_nodes, truncated: false };
    let nodes = walk_budget(base_root, current, depth, &skip, &mut budget);
    let _ = budget.truncated;
    nodes
}

extern "C" {
    fn zeus_pick_folder_dialog(out_buf: *mut std::os::raw::c_char, out_len: usize) -> i32;
}

#[tauri::command(async)]
pub fn workspace_pick(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
) -> Result<Option<Value>, String> {
    let mut c_buf = vec![0u8; 4096];
    let rc = unsafe {
        zeus_pick_folder_dialog(
            c_buf.as_mut_ptr() as *mut std::os::raw::c_char,
            c_buf.len(),
        )
    };
    let path_buf = if rc == 1 {
        let len = c_buf.iter().position(|&b| b == 0).unwrap_or(c_buf.len());
        let s = String::from_utf8_lossy(&c_buf[..len]).trim().to_string();
        if s.is_empty() {
            return Ok(None);
        }
        PathBuf::from(s)
    } else if rc == 0 {
        return Ok(None);
    } else {
        use tauri::Manager;
        use tauri_plugin_dialog::DialogExt;
        let mut builder = app.dialog().file().set_title("Open project folder");
        if let Some(win) = app.get_webview_window("main") {
            builder = builder.set_parent(&win);
        }
        let picked = builder.blocking_pick_folder();
        let Some(fp) = picked else {
            return Ok(None);
        };
        fp.into_path()
            .map_err(|e| format!("Could not resolve selected folder path: {}", e))?
    };
    if !path_buf.exists() || !path_buf.is_dir() {
        return Err(format!("Selected folder does not exist: {}", path_buf.display()));
    }
    check_project_root(&path_buf)?;
    let root_str = path_buf.to_string_lossy().to_string();
    let name = path_buf
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| root_str.clone());
    if let Ok(mut guard) = state.current_root.lock() {
        *guard = Some(root_str.clone());
    }
    let tree = walk_workspace(&path_buf, &path_buf, 1);
    Ok(Some(json!({
        "name": name,
        "root": root_str,
        "tree": tree
    })))
}

#[tauri::command(async)]
pub fn workspace_open(
    path: String,
    state: tauri::State<'_, WorkspaceState>,
) -> Result<Value, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Directory does not exist: {}", path));
    }
    check_project_root(p)?;
    let name = p
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    if let Ok(mut guard) = state.current_root.lock() {
        *guard = Some(path.clone());
    }
    Ok(json!({
        "root": path,
        "name": name
    }))
}

#[tauri::command(async)]
pub fn workspace_tree(root: String, depth: Option<usize>) -> Result<Vec<FileNode>, String> {
    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Err(format!("Workspace root not found: {}", root));
    }
    check_project_root(root_path)?;
    let max_depth = depth.unwrap_or(1).min(3);
    Ok(walk_workspace(root_path, root_path, max_depth))
}

/// Lazy directory expansion: one level of `rel` under `root`.
#[tauri::command(async)]
pub fn workspace_list(root: String, rel: String) -> Result<Vec<FileNode>, String> {
    let dir = safe_join(&root, &rel)?;
    let base = Path::new(&root).canonicalize().unwrap_or_else(|_| PathBuf::from(&root));
    Ok(walk_workspace(&base, &dir, 0))
}

#[tauri::command(async)]
pub fn fs_read(root: String, path: String) -> Result<String, String> {
    let target = safe_join(&root, &path)?;
    fs::read_to_string(&target)
        .map_err(|e| format!("Failed to read '{}': {}", target.display(), e))
}

#[tauri::command(async)]
pub fn fs_write(root: String, path: String, content: String) -> Result<(), String> {
    let target = safe_join(&root, &path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::write(&target, content)
        .map_err(|e| format!("Failed to write '{}': {}", target.display(), e))
}

#[tauri::command(async)]
pub fn fs_delete(root: String, path: String) -> Result<String, String> {
    let target = safe_join(&root, &path)?;
    if !target.exists() {
        // Case-insensitive lookup inside parent directory (e.g. `agents.md` vs `AGENTS.md`)
        if let (Some(parent), Some(fname)) = (target.parent(), target.file_name()) {
            let want = fname.to_string_lossy().to_lowercase();
            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    if entry.file_name().to_string_lossy().to_lowercase() == want {
                        let actual = entry.path();
                        if actual.is_dir() {
                            fs::remove_dir_all(&actual)
                                .map_err(|e| format!("Failed to delete directory '{}': {}", actual.display(), e))?;
                        } else {
                            fs::remove_file(&actual)
                                .map_err(|e| format!("Failed to delete file '{}': {}", actual.display(), e))?;
                        }
                        return Ok(format!("Deleted {}", entry.file_name().to_string_lossy()));
                    }
                }
            }
        }
        return Err(format!("File not found: {}", path));
    }
    if target.is_dir() {
        fs::remove_dir_all(&target)
            .map_err(|e| format!("Failed to delete directory '{}': {}", target.display(), e))?;
    } else {
        fs::remove_file(&target)
            .map_err(|e| format!("Failed to delete file '{}': {}", target.display(), e))?;
    }
    Ok(format!("Deleted {}", path))
}

fn strip_benign_shell_redirections(cmd: &str) -> String {
    let mut s = cmd.trim().to_string();
    for suffix in [
        "2>/dev/null",
        "2> /dev/null",
        "2>nul",
        "2> nul",
        "|| true",
        "|| exit 0",
    ] {
        if let Some(stripped) = s.strip_suffix(suffix) {
            s = stripped.trim().to_string();
        }
    }
    s
}

fn match_rg_pattern(line: &str, raw_pattern: &str, case_insensitive: bool, fixed_strings: bool) -> bool {
    let pat = raw_pattern.trim();
    if pat.is_empty() {
        return false;
    }
    let hay = if case_insensitive {
        line.to_lowercase()
    } else {
        line.to_string()
    };
    let needle = if case_insensitive {
        pat.to_lowercase()
    } else {
        pat.to_string()
    };
    if fixed_strings || !needle.contains('|') {
        let clean_needle = needle
            .trim_start_matches("\\b")
            .trim_end_matches("\\b")
            .replace("\\.", ".")
            .replace("\\_", "_")
            .replace("\\-", "-");
        return hay.contains(&clean_needle);
    }
    needle
        .split('|')
        .map(|branch| {
            branch
                .trim()
                .trim_start_matches('(')
                .trim_end_matches(')')
                .trim_start_matches("\\b")
                .trim_end_matches("\\b")
                .replace("\\.", ".")
                .replace("\\_", "_")
                .replace("\\-", "-")
        })
        .filter(|b| !b.is_empty())
        .any(|b| hay.contains(&b))
}

fn glob_name_matches(file_name: &str, pattern: &str) -> bool {
    let f = file_name.to_lowercase();
    let p = pattern.trim().trim_matches(|c| c == '"' || c == '\'').to_lowercase();
    if p.is_empty() || p == "*" {
        return true;
    }
    if let Some(ext) = p.strip_prefix("*.") {
        return f.ends_with(&format!(".{}", ext));
    }
    if p.starts_with('*') && p.ends_with('*') && p.len() > 2 {
        return f.contains(&p[1..p.len() - 1]);
    }
    if let Some(prefix) = p.strip_suffix('*') {
        return f.starts_with(prefix);
    }
    if let Some(suffix) = p.strip_prefix('*') {
        return f.ends_with(suffix);
    }
    f == p || f.contains(&p)
}

/// Handle common POSIX file & search operations (`rg`, `grep`, `find`, `head`, `tail`, `wc`, `tree`, `rm`, `del`, `pwd`, `ls`, `cat`, `touch`, `mkdir`) natively
/// in Rust so Windows `cmd.exe` never fails with `'rg' is not recognized` or `FIND: Parameter format not correct`.
fn try_builtin_posix_shell(workdir: &Path, clean_cmd: &str) -> Option<Value> {
    let sanitized = strip_benign_shell_redirections(clean_cmd);
    let trimmed = sanitized.trim();
    if trimmed.contains("&&") {
        let parts: Vec<&str> = trimmed.split("&&").map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
        if parts.len() > 1 && parts.len() <= 5 {
            let mut combined_out = Vec::new();
            let mut combined_err = Vec::new();
            for part in parts {
                let res = try_builtin_posix_shell(workdir, part)?;
                let code = res.get("code").and_then(|c| c.as_i64()).unwrap_or(1);
                let out = res.get("stdout").and_then(|s| s.as_str()).unwrap_or("").trim_end();
                let err = res.get("stderr").and_then(|s| s.as_str()).unwrap_or("").trim_end();
                if !out.is_empty() {
                    combined_out.push(out.to_string());
                }
                if !err.is_empty() {
                    combined_err.push(err.to_string());
                }
                if code != 0 {
                    return Some(json!({
                        "code": code,
                        "stdout": combined_out.join("\n"),
                        "stderr": combined_err.join("\n")
                    }));
                }
            }
            return Some(json!({
                "code": 0,
                "stdout": combined_out.join("\n"),
                "stderr": combined_err.join("\n")
            }));
        }
    }
    if trimmed.contains("||") || trimmed.contains(';') || trimmed.contains('>') || trimmed.contains('<') {
        return None;
    }
    let tokens: Vec<String> = {
        let mut out = Vec::new();
        let mut cur = String::new();
        let mut quote: Option<char> = None;
        for ch in trimmed.chars() {
            match quote {
                Some(q) if ch == q => quote = None,
                Some(_) => cur.push(ch),
                None if ch == '"' || ch == '\'' => quote = Some(ch),
                None if ch.is_whitespace() => {
                    if !cur.is_empty() {
                        out.push(std::mem::take(&mut cur));
                    }
                }
                None => cur.push(ch),
            }
        }
        if !cur.is_empty() {
            out.push(cur);
        }
        out
    };
    if tokens.is_empty() {
        return None;
    }
    let prog = tokens[0].to_ascii_lowercase();
    let root_str = workdir.to_string_lossy().to_string();
    match prog.as_str() {
        "rm" | "del" | "erase" | "unlink" | "remove-item" => {
            let mut targets = Vec::new();
            for t in &tokens[1..] {
                if t.starts_with('-') || (prog == "del" && t.starts_with('/')) {
                    continue;
                }
                targets.push(t.clone());
            }
            if targets.is_empty() {
                return None;
            }
            let mut deleted = Vec::new();
            let mut errors = Vec::new();
            let force = tokens[1..].iter().any(|t| t == "-f" || t == "-rf" || t == "-fr" || t.eq_ignore_ascii_case("-force"));
            for t in targets {
                match fs_delete(root_str.clone(), t.clone()) {
                    Ok(msg) => deleted.push(msg),
                    Err(e) => {
                        if !force {
                            errors.push(e);
                        } else {
                            deleted.push(format!("Removed {} (if present)", t));
                        }
                    }
                }
            }
            if errors.is_empty() {
                Some(json!({
                    "code": 0,
                    "stdout": deleted.join("\n"),
                    "stderr": ""
                }))
            } else {
                Some(json!({
                    "code": 1,
                    "stdout": deleted.join("\n"),
                    "stderr": errors.join("\n")
                }))
            }
        }
        "pwd" => Some(json!({
            "code": 0,
            "stdout": format!("{}\n", workdir.display()),
            "stderr": ""
        })),
        "ls" => {
            let mut target_arg = String::new();
            for t in &tokens[1..] {
                if !t.starts_with('-') {
                    target_arg = t.clone();
                    break;
                }
            }
            let dir_path = if target_arg.is_empty() || target_arg == "." {
                workdir.to_path_buf()
            } else {
                safe_join(&root_str, &target_arg).ok()?
            };
            let entries = fs::read_dir(&dir_path).ok()?;
            let mut names = Vec::new();
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                let is_dir = e.path().is_dir();
                names.push(if is_dir { format!("{}/", name) } else { name });
            }
            names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
            Some(json!({
                "code": 0,
                "stdout": if names.is_empty() { "(empty directory)\n".to_string() } else { format!("{}\n", names.join("\n")) },
                "stderr": ""
            }))
        }
        "cat" => {
            let mut files = Vec::new();
            for t in &tokens[1..] {
                if !t.starts_with('-') {
                    files.push(t.clone());
                }
            }
            if files.is_empty() {
                return None;
            }
            let mut out = String::new();
            let mut errs = Vec::new();
            for f in files {
                match fs_read(root_str.clone(), f) {
                    Ok(c) => {
                        out.push_str(&c);
                        if !c.ends_with('\n') {
                            out.push('\n');
                        }
                    }
                    Err(e) => errs.push(e),
                }
            }
            Some(json!({
                "code": if errs.is_empty() { 0 } else { 1 },
                "stdout": out,
                "stderr": errs.join("\n")
            }))
        }
        "touch" => {
            let mut files = Vec::new();
            for t in &tokens[1..] {
                if !t.starts_with('-') {
                    files.push(t.clone());
                }
            }
            if files.is_empty() {
                return None;
            }
            for f in &files {
                let target = safe_join(&root_str, f).ok()?;
                if let Some(p) = target.parent() {
                    let _ = fs::create_dir_all(p);
                }
                if !target.exists() {
                    let _ = fs::write(&target, "");
                }
            }
            Some(json!({
                "code": 0,
                "stdout": format!("Touched {}\n", files.join(", ")),
                "stderr": ""
            }))
        }
        "mkdir" => {
            let mut dirs = Vec::new();
            for t in &tokens[1..] {
                if !t.starts_with('-') {
                    dirs.push(t.clone());
                }
            }
            if dirs.is_empty() {
                return None;
            }
            for d in &dirs {
                let target = safe_join(&root_str, d).ok()?;
                fs::create_dir_all(&target).ok()?;
            }
            Some(json!({
                "code": 0,
                "stdout": format!("Created directory {}\n", dirs.join(", ")),
                "stderr": ""
            }))
        }
        "rg" | "ripgrep" | "grep" => {
            let mut case_insensitive = false;
            let mut files_only = false;
            let mut fixed_strings = false;
            let mut glob_filter: Option<String> = None;
            let mut positional = Vec::new();
            let mut idx = 1usize;
            while idx < tokens.len() {
                let tok = &tokens[idx];
                if tok == "-e" || tok == "--regexp" {
                    if idx + 1 < tokens.len() {
                        positional.push(tokens[idx + 1].clone());
                        idx += 2;
                        continue;
                    }
                } else if tok == "-g" || tok == "--glob" || tok == "--include" {
                    if idx + 1 < tokens.len() {
                        glob_filter = Some(tokens[idx + 1].clone());
                        idx += 2;
                        continue;
                    }
                } else if tok == "-t" || tok == "--type" {
                    if idx + 1 < tokens.len() {
                        let tname = &tokens[idx + 1];
                        glob_filter = Some(format!("*.{}", tname));
                        idx += 2;
                        continue;
                    }
                } else if tok == "-m" || tok == "--max-count" || tok == "-A" || tok == "-B" || tok == "-C" || tok == "--max-depth" {
                    idx += 2;
                    continue;
                } else if tok.starts_with("--") {
                    if tok == "--ignore-case" || tok == "--smart-case" {
                        case_insensitive = true;
                    } else if tok == "--files-with-matches" || tok == "--files-without-match" {
                        files_only = true;
                    } else if tok == "--fixed-strings" {
                        fixed_strings = true;
                    } else if tok == "--files" {
                        let nodes = walk_workspace_n(workdir, workdir, 6, 4000);
                        let mut out_files = Vec::new();
                        fn collect_files(nodes: &[FileNode], g: Option<&str>, out: &mut Vec<String>) {
                            for n in nodes {
                                if n.dir {
                                    if let Some(ch) = &n.children {
                                        collect_files(ch, g, out);
                                    }
                                } else if g.map(|pat| glob_name_matches(&n.name, pat)).unwrap_or(true) {
                                    out.push(n.path.clone());
                                }
                            }
                        }
                        collect_files(&nodes, glob_filter.as_deref(), &mut out_files);
                        return Some(json!({
                            "code": 0,
                            "stdout": out_files.join("\n"),
                            "stderr": ""
                        }));
                    }
                } else if tok.starts_with('-') && tok.len() > 1 {
                    for ch in tok[1..].chars() {
                        match ch {
                            'i' | 'S' => case_insensitive = true,
                            'l' => files_only = true,
                            'F' => fixed_strings = true,
                            _ => {}
                        }
                    }
                } else {
                    positional.push(tok.clone());
                }
                idx += 1;
            }
            if positional.is_empty() {
                return None;
            }
            let pattern = positional[0].clone();
            let search_targets = if positional.len() > 1 {
                positional[1..].to_vec()
            } else {
                vec![".".to_string()]
            };
            let mut out_lines = Vec::new();
            let mut matched_files = Vec::new();
            for st in search_targets {
                let target_path = if st == "." || st == "./" || st.is_empty() {
                    workdir.to_path_buf()
                } else {
                    match safe_join(&root_str, &st) {
                        Ok(p) => p,
                        Err(_) => continue,
                    }
                };
                if !target_path.exists() {
                    continue;
                }
                if target_path.is_file() {
                    if let Ok(text) = fs::read_to_string(&target_path) {
                        let rel = target_path
                            .strip_prefix(workdir)
                            .unwrap_or(&target_path)
                            .to_string_lossy()
                            .replace('\\', "/");
                        for (line_idx, line) in text.lines().enumerate() {
                            if match_rg_pattern(line, &pattern, case_insensitive, fixed_strings) {
                                if files_only {
                                    if !matched_files.contains(&rel) {
                                        matched_files.push(rel.clone());
                                    }
                                    break;
                                } else {
                                    out_lines.push(format!("{}:{}:{}", rel, line_idx + 1, line.chars().take(240).collect::<String>()));
                                    if out_lines.len() >= 120 {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    let nodes = walk_workspace_n(workdir, &target_path, 6, 6000);
                    fn visit_rg(
                        base: &Path,
                        nodes: &[FileNode],
                        pattern: &str,
                        ci: bool,
                        fs_flag: bool,
                        files_only: bool,
                        glob_pat: Option<&str>,
                        out_lines: &mut Vec<String>,
                        matched_files: &mut Vec<String>,
                    ) {
                        for n in nodes {
                            if out_lines.len() >= 120 || matched_files.len() >= 120 {
                                return;
                            }
                            if n.dir {
                                if let Some(ch) = &n.children {
                                    visit_rg(base, ch, pattern, ci, fs_flag, files_only, glob_pat, out_lines, matched_files);
                                }
                            } else {
                                if let Some(gp) = glob_pat {
                                    if !glob_name_matches(&n.name, gp) {
                                        continue;
                                    }
                                }
                                let full = base.join(&n.path);
                                if let Ok(text) = fs::read_to_string(&full) {
                                    for (i, line) in text.lines().enumerate() {
                                        if match_rg_pattern(line, pattern, ci, fs_flag) {
                                            if files_only {
                                                if !matched_files.contains(&n.path) {
                                                    matched_files.push(n.path.clone());
                                                }
                                                break;
                                            } else {
                                                out_lines.push(format!(
                                                    "{}:{}:{}",
                                                    n.path,
                                                    i + 1,
                                                    line.chars().take(240).collect::<String>()
                                                ));
                                                if out_lines.len() >= 120 {
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    visit_rg(
                        workdir,
                        &nodes,
                        &pattern,
                        case_insensitive,
                        fixed_strings,
                        files_only,
                        glob_filter.as_deref(),
                        &mut out_lines,
                        &mut matched_files,
                    );
                }
            }
            let final_out = if files_only {
                matched_files.join("\n")
            } else {
                out_lines.join("\n")
            };
            Some(json!({
                "code": 0,
                "stdout": if final_out.is_empty() { format!("(0 matches for '{}')\n", pattern) } else { format!("{}\n", final_out) },
                "stderr": ""
            }))
        }
        "find" => {
            // Native POSIX `find` implementation so Windows `C:\Windows\System32\find.exe` never hijacks Unix `find`
            let mut start_dirs = Vec::new();
            let mut max_depth = 6usize;
            let mut type_filter: Option<char> = None;
            let mut name_filter: Option<String> = None;
            let mut i = 1usize;
            while i < tokens.len() {
                let t = &tokens[i];
                if t == "-maxdepth" && i + 1 < tokens.len() {
                    max_depth = tokens[i + 1].parse::<usize>().unwrap_or(6).min(8);
                    i += 2;
                    continue;
                } else if t == "-type" && i + 1 < tokens.len() {
                    type_filter = tokens[i + 1].chars().next();
                    i += 2;
                    continue;
                } else if (t == "-name" || t == "-iname") && i + 1 < tokens.len() {
                    name_filter = Some(tokens[i + 1].clone());
                    i += 2;
                    continue;
                } else if t.starts_with('-') || t == "(" || t == ")" || t == "-o" || t == "-and" {
                    i += 1;
                    continue;
                } else {
                    start_dirs.push(t.clone());
                }
                i += 1;
            }
            if start_dirs.is_empty() {
                start_dirs.push(".".to_string());
            }
            let mut results = Vec::new();
            for sd in start_dirs {
                let target = if sd == "." || sd == "./" {
                    workdir.to_path_buf()
                } else {
                    match safe_join(&root_str, &sd) {
                        Ok(p) => p,
                        Err(_) => continue,
                    }
                };
                if !target.exists() {
                    continue;
                }
                let nodes = walk_workspace_n(workdir, &target, max_depth, 4000);
                fn collect_find(
                    nodes: &[FileNode],
                    tf: Option<char>,
                    nf: Option<&str>,
                    out: &mut Vec<String>,
                ) {
                    for n in nodes {
                        if out.len() >= 250 {
                            return;
                        }
                        let type_ok = match tf {
                            Some('f') => !n.dir,
                            Some('d') => n.dir,
                            _ => true,
                        };
                        let name_ok = nf.map(|pat| glob_name_matches(&n.name, pat)).unwrap_or(true);
                        if type_ok && name_ok {
                            out.push(if n.dir { format!("{}/", n.path) } else { n.path.clone() });
                        }
                        if n.dir {
                            if let Some(ch) = &n.children {
                                collect_find(ch, tf, nf, out);
                            }
                        }
                    }
                }
                collect_find(&nodes, type_filter, name_filter.as_deref(), &mut results);
            }
            Some(json!({
                "code": 0,
                "stdout": if results.is_empty() { "(0 matching paths)\n".to_string() } else { format!("{}\n", results.join("\n")) },
                "stderr": ""
            }))
        }
        "head" | "tail" => {
            let mut n_lines = 20usize;
            let mut files = Vec::new();
            let mut i = 1usize;
            while i < tokens.len() {
                let t = &tokens[i];
                if t == "-n" && i + 1 < tokens.len() {
                    n_lines = tokens[i + 1].parse::<usize>().unwrap_or(20);
                    i += 2;
                    continue;
                } else if let Some(num_str) = t.strip_prefix("-n") {
                    if let Ok(v) = num_str.parse::<usize>() {
                        n_lines = v;
                        i += 1;
                        continue;
                    }
                } else if let Some(num_str) = t.strip_prefix('-') {
                    if let Ok(v) = num_str.parse::<usize>() {
                        n_lines = v;
                        i += 1;
                        continue;
                    }
                }
                if !t.starts_with('-') {
                    files.push(t.clone());
                }
                i += 1;
            }
            if files.is_empty() {
                return None;
            }
            let mut out = String::new();
            for f in &files {
                if let Ok(content) = fs_read(root_str.clone(), f.clone()) {
                    let all: Vec<&str> = content.lines().collect();
                    let slice: Vec<&str> = if prog == "head" {
                        all.into_iter().take(n_lines).collect()
                    } else {
                        let skip = all.len().saturating_sub(n_lines);
                        all.into_iter().skip(skip).collect()
                    };
                    out.push_str(&slice.join("\n"));
                    out.push('\n');
                }
            }
            Some(json!({
                "code": 0,
                "stdout": out,
                "stderr": ""
            }))
        }
        "tree" => {
            let target_arg = tokens.iter().skip(1).find(|t| !t.starts_with('-')).cloned().unwrap_or_default();
            let dir_path = if target_arg.is_empty() || target_arg == "." {
                workdir.to_path_buf()
            } else {
                safe_join(&root_str, &target_arg).ok()?
            };
            let nodes = walk_workspace_n(workdir, &dir_path, 3, 500);
            let mut out = Vec::new();
            fn render_tree(nodes: &[FileNode], depth: usize, out: &mut Vec<String>) {
                let pad = "  ".repeat(depth);
                for n in nodes {
                    out.push(format!("{}{}{}", pad, n.name, if n.dir { "/" } else { "" }));
                    if let Some(ch) = &n.children {
                        render_tree(ch, depth + 1, out);
                    }
                }
            }
            render_tree(&nodes, 0, &mut out);
            Some(json!({
                "code": 0,
                "stdout": format!("{}\n", out.join("\n")),
                "stderr": ""
            }))
        }
        _ => None,
    }
}

/// Sanitize AI-emitted shell commands so they never spawn an external Windows console/GUI window
/// (`start`, `cmd /k`, `powershell -NoExit`, `pause`) or block on interactive prompts.
pub fn sanitize_shell_command(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    let lower = s.to_ascii_lowercase();
    for prefix in [
        "start \"\" cmd /c ",
        "start \"\" cmd /k ",
        "start cmd /c ",
        "start cmd /k ",
        "start powershell ",
        "start \"\" ",
        "cmd /k ",
        "cmd.exe /k ",
        "cmd /c ",
        "cmd.exe /c ",
        "powershell -noexit ",
        "powershell.exe -noexit ",
    ] {
        if lower.starts_with(prefix) {
            s = s[prefix.len()..].trim().to_string();
            break;
        }
    }
    if s.to_ascii_lowercase().ends_with("&& pause") {
        let new_len = s.len().saturating_sub(8);
        s.truncate(new_len);
        s = s.trim().to_string();
    }
    for open_tag in ["```bash", "```sh", "```shell", "```cmd", "```", "<command>", "<code>", "<bash>", "<shell>"] {
        if let Some(rest) = s.strip_prefix(open_tag) {
            s = rest.trim().to_string();
        }
    }
    loop {
        let mut changed = false;
        for close_tag in ["```", "</command>", "</code>", "</bash>", "</shell>", "</zeus_tool>", "</tool_call>", "</command", "</code", "</bash", "</shell", "</zeus_tool", "<|close|>argument", "<|close|>call"] {
            if let Some(rest) = s.strip_suffix(close_tag) {
                s = rest.trim().to_string();
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    s
}

pub fn clean_python_script(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    for open_tag in ["```python3", "```python", "```py", "```", "<command>", "<code>", "<script>", "<python>", "<py>"] {
        if let Some(rest) = s.strip_prefix(open_tag) {
            s = rest.trim().to_string();
        }
    }
    loop {
        let mut changed = false;
        for close_tag in ["```", "</command>", "</code>", "</script>", "</python>", "</py>", "</bash>", "</shell>", "</zeus_tool>", "</tool_call>", "<|close|>argument", "<|close|>call"] {
            if let Some(rest) = s.strip_suffix(close_tag) {
                s = rest.trim().to_string();
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    s
}

#[tauri::command(async)]
pub fn shell_run(root: String, cmd: String) -> Result<Value, String> {
    use std::process::Stdio;
    let workdir = if root.trim().is_empty() {
        std::env::current_dir().map_err(|e| e.to_string())?
    } else {
        PathBuf::from(&root)
    };
    let clean_cmd = sanitize_shell_command(&cmd);
    if clean_cmd.is_empty() || matches!(clean_cmd.to_ascii_lowercase().as_str(), "pause" | "cmd" | "cmd.exe" | "powershell" | "powershell.exe" | "bash") {
        return Ok(json!({
            "code": 0,
            "stdout": "(non-interactive shell ready — pass a specific command to run)",
            "stderr": ""
        }));
    }

    if let Some(builtin_res) = try_builtin_posix_shell(&workdir, &clean_cmd) {
        return Ok(builtin_res);
    }

    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        // 0x08000000 = CREATE_NO_WINDOW: guarantees zero external terminal/console window popup on the PC
        Command::new("cmd")
            .args(["/d", "/s", "/c", &clean_cmd])
            .current_dir(&workdir)
            .env("CI", "true")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "never")
            .env("NPM_CONFIG_YES", "true")
            .env("PIP_NO_INPUT", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            .env("NO_COLOR", "1")
            .env("TERM", "dumb")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("bash")
        .args(["-lc", &clean_cmd])
        .current_dir(&workdir)
        .env("CI", "true")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("NPM_CONFIG_YES", "true")
        .env("PIP_NO_INPUT", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("NO_COLOR", "1")
        .env("TERM", "dumb")
        .stdin(Stdio::null())
        .output()
        .or_else(|_| {
            Command::new("sh")
                .args(["-lc", &clean_cmd])
                .current_dir(&workdir)
                .env("CI", "true")
                .env("GIT_TERMINAL_PROMPT", "0")
                .stdin(Stdio::null())
                .output()
        })
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(json!({
        "code": code,
        "stdout": stdout,
        "stderr": stderr
    }))
}

pub fn python_run(root: String, script: String) -> Result<Value, String> {
    use std::io::Write;
    use std::process::Stdio;

    let script = clean_python_script(&script);
    let workdir = if root.trim().is_empty() {
        std::env::current_dir().map_err(|e| e.to_string())?
    } else {
        PathBuf::from(&root)
    };

    let candidates: &[(&str, &[&str])] = if cfg!(target_os = "windows") {
        &[("python", &["-u", "-"]), ("python3", &["-u", "-"]), ("py", &["-3", "-u", "-"])]
    } else {
        &[("python3", &["-u", "-"]), ("python", &["-u", "-"])]
    };

    let mut last_err = String::from("Python interpreter not found");
    for (bin, args) in candidates {
        let mut cmd = Command::new(bin);
        cmd.args(*args)
            .current_dir(&workdir)
            .env("CI", "true")
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            .env("PIP_NO_INPUT", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        match cmd.spawn() {
            Ok(mut child) => {
                if let Some(mut stdin) = child.stdin.take() {
                    let _ = stdin.write_all(script.as_bytes());
                }
                let output = child
                    .wait_with_output()
                    .map_err(|e| format!("Python execution failed: {}", e))?;
                let code = output.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Ok(json!({
                    "code": code,
                    "stdout": stdout,
                    "stderr": stderr
                }));
            }
            Err(e) => {
                last_err = format!("{}: {}", bin, e);
            }
        }
    }
    Err(last_err)
}

pub fn search_workspace_code(root: &str, query: &str, max_results: usize) -> Vec<Value> {
    let mut matches = Vec::new();
    let root_path = Path::new(root);
    if !root_path.exists() || query.trim().is_empty() {
        return matches;
    }
    let needle = query.to_lowercase();
    let nodes = walk_workspace_n(root_path, root_path, 6, 6000);

    fn visit(
        base: &Path,
        nodes: &[FileNode],
        needle: &str,
        out: &mut Vec<Value>,
        limit: usize,
    ) {
        for n in nodes {
            if out.len() >= limit {
                return;
            }
            if n.dir {
                if let Some(children) = &n.children {
                    visit(base, children, needle, out, limit);
                }
            } else {
                let full = base.join(&n.path);
                if let Ok(text) = fs::read_to_string(&full) {
                    let all_lines: Vec<&str> = text.lines().collect();
                    for (idx, line) in all_lines.iter().enumerate() {
                        if line.to_lowercase().contains(needle) {
                            let ctx_start = idx.saturating_sub(2);
                            let ctx_end = (idx + 3).min(all_lines.len());
                            let ctx_snippet = (ctx_start..ctx_end)
                                .map(|i| {
                                    let marker = if i == idx { ">" } else { " " };
                                    let trimmed_l: String = all_lines[i].trim().chars().take(160).collect();
                                    format!("{}{}: {}", marker, i + 1, trimmed_l)
                                })
                                .collect::<Vec<_>>()
                                .join(" | ");
                            out.push(json!({
                                "path": n.path,
                                "line": idx + 1,
                                "snippet": ctx_snippet
                            }));
                            if out.len() >= limit {
                                return;
                            }
                        }
                    }
                }
            }
        }
    }

    visit(root_path, &nodes, &needle, &mut matches, max_results);
    matches
}

#[tauri::command(async)]
pub fn workspace_search(root: String, query: String, limit: Option<usize>) -> Result<Vec<Value>, String> {
    Ok(search_workspace_code(&root, &query, limit.unwrap_or(25).min(100)))
}

/// Stormy `move_file` (`mv` / `rename_file`): move or rename a file or folder inside the workspace.
#[tauri::command(async)]
pub fn fs_move(root: String, source: String, destination: String, overwrite: Option<bool>) -> Result<String, String> {
    let src = safe_join(&root, &source)?;
    let dst = safe_join(&root, &destination)?;
    if !src.exists() {
        return Err(format!("Source file does not exist: {}", source));
    }
    if dst.exists() && !overwrite.unwrap_or(false) {
        return Err(format!(
            "Destination already exists: {}. Pass overwrite=true to replace it.",
            destination
        ));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create destination parent dirs: {}", e))?;
    }
    if dst.exists() {
        if dst.is_dir() {
            let _ = fs::remove_dir_all(&dst);
        } else {
            let _ = fs::remove_file(&dst);
        }
    }
    fs::rename(&src, &dst)
        .map_err(|e| format!("Failed to move '{}' to '{}': {}", source, destination, e))?;
    Ok(format!("Moved {} -> {}", source, destination))
}

/// Stormy `ProjectOutline`: produces a compact one-line symbol outline of a file
/// (`list_files(symbols=true)`), extracting HTML ids/assets, CSS selectors/variables,
/// JS/TS/Rust/Python functions & classes, JSON top-level keys, or Markdown headings.
pub fn project_outline_of(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let meta = fs::metadata(path).ok()?;
    if meta.len() > 400_000 {
        return Some(format!("large file ({} KB)", meta.len() / 1024));
    }
    let text = fs::read_to_string(path).ok()?;
    let lines = text.lines().count().max(1);
    let mut parts: Vec<String> = Vec::new();

    match ext.as_str() {
        "html" | "htm" => {
            let mut ids = Vec::new();
            let mut loads = Vec::new();
            for line in text.lines() {
                if let Some(idx) = line.find("id=\"") {
                    let rest = &line[idx + 4..];
                    if let Some(end) = rest.find('"') {
                        let id = rest[..end].trim();
                        if !id.is_empty() && !ids.contains(&format!("#{}", id)) && ids.len() < 8 {
                            ids.push(format!("#{}", id));
                        }
                    }
                }
                for attr in ["src=\"", "href=\""] {
                    if let Some(idx) = line.find(attr) {
                        let rest = &line[idx + attr.len()..];
                        if let Some(end) = rest.find('"') {
                            let val = rest[..end].trim();
                            if !val.is_empty()
                                && !val.starts_with("http")
                                && !val.starts_with('#')
                                && !val.starts_with("data:")
                                && !loads.contains(&val.to_string())
                                && loads.len() < 6
                            {
                                loads.push(val.to_string());
                            }
                        }
                    }
                }
            }
            if !ids.is_empty() {
                parts.push(format!("ids: {}", ids.join(", ")));
            }
            if !loads.is_empty() {
                parts.push(format!("loads: {}", loads.join(", ")));
            }
        }
        "css" | "scss" => {
            let mut vars = Vec::new();
            let mut selectors = Vec::new();
            for line in text.lines() {
                let t = line.trim();
                if let Some(v_idx) = t.find("--") {
                    let rest = &t[v_idx..];
                    if let Some(colon) = rest.find(':') {
                        let var_name = rest[..colon].trim();
                        if var_name.len() > 2
                            && var_name.chars().skip(2).all(|c| c.is_alphanumeric() || c == '-' || c == '_')
                            && !vars.contains(&var_name.to_string())
                            && vars.len() < 6
                        {
                            vars.push(var_name.to_string());
                        }
                    }
                } else if t.ends_with('{') && !t.starts_with('@') && !t.starts_with("/*") {
                    let sel = t.trim_end_matches('{').trim();
                    if !sel.is_empty() && sel.len() < 48 && !selectors.contains(&sel.to_string()) && selectors.len() < 6 {
                        selectors.push(sel.to_string());
                    }
                }
            }
            if !selectors.is_empty() {
                parts.push(format!("selectors: {}", selectors.join(", ")));
            }
            if !vars.is_empty() {
                parts.push(format!("vars: {}", vars.join(", ")));
            }
        }
        "js" | "mjs" | "cjs" | "jsx" | "ts" | "tsx" | "py" | "rs" => {
            let mut fns = Vec::new();
            let mut classes = Vec::new();
            for line in text.lines() {
                let t = line.trim();
                let clean = t
                    .strip_prefix("export ")
                    .unwrap_or(t)
                    .strip_prefix("default ")
                    .unwrap_or(t)
                    .strip_prefix("pub ")
                    .unwrap_or(t)
                    .strip_prefix("async ")
                    .unwrap_or(t);
                if let Some(rest) = clean
                    .strip_prefix("function ")
                    .or_else(|| clean.strip_prefix("fn "))
                    .or_else(|| clean.strip_prefix("def "))
                {
                    let name: String = rest
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect();
                    if !name.is_empty() && !fns.contains(&name) && fns.len() < 8 {
                        fns.push(name);
                    }
                } else if let Some(rest) = clean
                    .strip_prefix("class ")
                    .or_else(|| clean.strip_prefix("struct "))
                    .or_else(|| clean.strip_prefix("interface "))
                    .or_else(|| clean.strip_prefix("type "))
                {
                    let name: String = rest
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect();
                    if !name.is_empty() && !classes.contains(&name) && classes.len() < 6 {
                        classes.push(name);
                    }
                } else if (clean.starts_with("const ") || clean.starts_with("let "))
                    && (clean.contains("=>") || clean.contains("= function"))
                {
                    let after_kw = clean
                        .strip_prefix("const ")
                        .or_else(|| clean.strip_prefix("let "))
                        .unwrap_or("");
                    let name: String = after_kw
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect();
                    if !name.is_empty() && !fns.contains(&name) && fns.len() < 8 {
                        fns.push(name);
                    }
                }
            }
            if !fns.is_empty() {
                parts.push(format!("functions: {}", fns.join(", ")));
            }
            if !classes.is_empty() {
                parts.push(format!("types: {}", classes.join(", ")));
            }
        }
        "json" => {
            if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&text) {
                let keys: Vec<String> = map.keys().take(8).cloned().collect();
                if !keys.is_empty() {
                    parts.push(format!("keys: {}", keys.join(", ")));
                }
            }
        }
        "md" | "mdx" => {
            if let Some(h) = text.lines().find(|l| l.trim_start().starts_with('#')) {
                let title = h.trim_start_matches('#').trim();
                if !title.is_empty() {
                    parts.push(format!("\"{}\"", title));
                }
            }
        }
        _ => {}
    }

    let summary = if parts.is_empty() {
        format!("{} lines", lines)
    } else {
        format!("{} lines · {}", lines, parts.join(" · "))
    };
    Some(if summary.len() > 170 {
        format!("{}...", &summary[..167])
    } else {
        summary
    })
}

/// Stormy `glob` tool: match files by glob pattern (`**/*.ts`, `src/**/*.{js,tsx}`, `*.html`),
/// returning paths sorted by most recently modified first.
pub fn glob_workspace_files(root: &str, pattern: &str, subpath: Option<&str>) -> Vec<String> {
    let base = Path::new(root);
    if !base.exists() {
        return Vec::new();
    }
    let start_dir = match subpath.filter(|s| !s.trim().is_empty() && *s != ".") {
        Some(rel) => safe_join(root, rel).unwrap_or_else(|_| base.to_path_buf()),
        None => base.to_path_buf(),
    };
    let nodes = walk_workspace_n(base, &start_dir, 8, 5000);
    let mut matched: Vec<(String, u64)> = Vec::new();

    fn match_glob_path(rel_path: &str, file_name: &str, raw_pat: &str) -> bool {
        let pat = raw_pat.trim().replace('\\', "/");
        if pat.is_empty() || pat == "*" || pat == "**/*" {
            return true;
        }
        // Expand brace patterns like `*.{js,ts,tsx}`
        if let (Some(b_open), Some(b_close)) = (pat.find('{'), pat.find('}')) {
            if b_open < b_close {
                let prefix = &pat[..b_open];
                let suffix = &pat[b_close + 1..];
                for alt in pat[b_open + 1..b_close].split(',') {
                    let expanded = format!("{}{}{}", prefix, alt.trim(), suffix);
                    if match_glob_path(rel_path, file_name, &expanded) {
                        return true;
                    }
                }
                return false;
            }
        }
        if let Some(after_starstar) = pat.strip_prefix("**/") {
            return glob_name_matches(file_name, after_starstar) || glob_name_matches(rel_path, after_starstar);
        }
        if pat.contains('/') {
            let parts: Vec<&str> = pat.split("/**/").collect();
            if parts.len() == 2 {
                let dir_prefix = parts[0].trim_matches('/');
                let tail = parts[1];
                return rel_path.to_lowercase().starts_with(&dir_prefix.to_lowercase())
                    && (glob_name_matches(file_name, tail) || glob_name_matches(rel_path, tail));
            }
            return glob_name_matches(rel_path, &pat);
        }
        glob_name_matches(file_name, &pat)
    }

    fn collect_glob(base: &Path, nodes: &[FileNode], pat: &str, out: &mut Vec<(String, u64)>) {
        for n in nodes {
            if n.dir {
                if let Some(ch) = &n.children {
                    collect_glob(base, ch, pat, out);
                }
            } else if match_glob_path(&n.path, &n.name, pat) {
                let mtime = fs::metadata(base.join(&n.path))
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since( std::time::UNIX_EPOCH ).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push((n.path.clone(), mtime));
            }
        }
    }

    collect_glob(base, &nodes, pattern, &mut matched);
    matched.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    matched.into_iter().take(200).map(|(p, _)| p).collect()
}

/// Stormy `QualityAuditor` (`check_syntax` & `ProjectTools.withQuickCheck`):
/// high-precision static syntax and structure auditor for HTML, CSS, JS/TS, and JSON files.
pub fn audit_workspace_files(root: &str, target_paths: Option<&[String]>) -> Vec<String> {
    let base = Path::new(root);
    if !base.exists() {
        return Vec::new();
    }
    let files: Vec<String> = if let Some(paths) = target_paths.filter(|p| !p.is_empty()) {
        paths.to_vec()
    } else {
        glob_workspace_files(root, "**/*", None)
    };
    let mut findings = Vec::new();

    for rel in files.into_iter().take(60) {
        let Ok(full) = safe_join(root, &rel) else { continue };
        if !full.is_file() {
            continue;
        }
        let ext = full
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let Ok(text) = fs::read_to_string(&full) else { continue };
        match ext.as_str() {
            "json" => {
                if let Err(e) = serde_json::from_str::<Value>(&text) {
                    findings.push(format!("ERROR {}: Invalid JSON ({})", rel, e));
                }
            }
            "html" | "htm" => {
                let lower = text.to_lowercase();
                if text.len() > 80 && !lower.contains("</html>") && (lower.contains("<html") || lower.contains("<!doctype")) {
                    findings.push(format!("ERROR {}: HTML document appears truncated (missing </html>).", rel));
                }
                // Check referenced local <script src="..."> and <link href="...">
                for attr in ["src=\"", "href=\""] {
                    let mut from = 0usize;
                    while let Some(pos) = text[from..].find(attr) {
                        let start = from + pos + attr.len();
                        let rest = &text[start..];
                        let Some(end) = rest.find('"') else { break };
                        let href = rest[..end].trim();
                        from = start + end + 1;
                        if href.is_empty()
                            || href.starts_with("http://")
                            || href.starts_with("https://")
                            || href.starts_with("//")
                            || href.starts_with('#')
                            || href.starts_with("data:")
                            || href.starts_with("mailto:")
                            || href.starts_with("tel:")
                            || href.starts_with("javascript:")
                        {
                            continue;
                        }
                        let clean_ref = href.split(['?', '#']).next().unwrap_or(href);
                        if clean_ref.ends_with(".css") || clean_ref.ends_with(".js") {
                            let resolved = full.parent().unwrap_or(base).join(clean_ref);
                            let root_resolved = base.join(clean_ref.trim_start_matches('/'));
                            if !resolved.exists() && !root_resolved.exists() {
                                findings.push(format!(
                                    "ERROR {}: Referenced asset '{}' does not exist in the project.",
                                    rel, clean_ref
                                ));
                            }
                        }
                    }
                }
            }
            "css" => {
                let opens = text.chars().filter(|&c| c == '{').count();
                let closes = text.chars().filter(|&c| c == '}').count();
                if opens != closes {
                    findings.push(format!(
                        "ERROR {}: Unbalanced braces in stylesheet ({} '{{' vs {} '}}').",
                        rel, opens, closes
                    ));
                }
            }
            "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx" => {
                let opens = text.chars().filter(|&c| c == '{').count();
                let closes = text.chars().filter(|&c| c == '}').count();
                if opens.abs_diff(closes) > 2 {
                    findings.push(format!(
                        "TIP {}: Brace count mismatch ({} '{{' vs {} '}}') — check for unclosed blocks or truncation.",
                        rel, opens, closes
                    ));
                }
            }
            _ => {}
        }
    }
    findings
}

/// Stormy `ProjectSearch`: on-device BM25 search over 40-line overlapping chunks (8-line overlap)
/// with camelCase/kebab-case/snake_case splitting, light stemming, and code/web synonym expansion.
pub fn bm25_search_project(root: &str, query: &str, limit: usize) -> Vec<Value> {
    let base = Path::new(root);
    if !base.exists() || query.trim().is_empty() {
        return Vec::new();
    }

    fn stem_word(w: &str) -> String {
        if w.len() > 5 && w.ends_with("ing") {
            w[..w.len() - 3].to_string()
        } else if w.len() > 4 && w.ends_with("es") {
            w[..w.len() - 2].to_string()
        } else if w.len() > 3 && w.ends_with('s') && !w.ends_with("ss") {
            w[..w.len() - 1].to_string()
        } else if w.len() > 4 && w.ends_with("ed") {
            w[..w.len() - 2].to_string()
        } else {
            w.to_string()
        }
    }

    fn tokenize_code(text: &str) -> Vec<String> {
        let mut spaced = String::with_capacity(text.len() + 16);
        let chars: Vec<char> = text.chars().collect();
        for i in 0..chars.len() {
            let c = chars[i];
            if i > 0 && c.is_ascii_uppercase() && chars[i - 1].is_ascii_lowercase() {
                spaced.push(' ');
            }
            if c.is_ascii_alphanumeric() {
                spaced.push(c.to_ascii_lowercase());
            } else {
                spaced.push(' ');
            }
        }
        let stop = [
            "the", "and", "for", "with", "that", "this", "from", "into", "what", "where", "find",
        ];
        spaced
            .split_whitespace()
            .filter(|w| w.len() > 1 && !stop.contains(w))
            .map(stem_word)
            .collect()
    }

    fn expand_synonyms(terms: &[String]) -> Vec<(String, f64)> {
        let mut out: Vec<(String, f64)> = Vec::new();
        for t in terms {
            if !out.iter().any(|(k, _)| k == t) {
                out.push((t.clone(), 1.0));
            }
        }
        let syn_table: &[(&str, &[&str])] = &[
            ("nav", &["navbar", "navigation", "menu", "header"]),
            ("menu", &["nav", "navbar", "sidebar", "dropdown"]),
            ("button", &["btn", "cta", "action"]),
            ("image", &["img", "picture", "photo", "icon", "svg"]),
            ("pricing", &["price", "plan", "tier", "billing"]),
            ("footer", &["bottom", "copyright"]),
            ("hero", &["banner", "headline", "header"]),
            ("color", &["colour", "theme", "palette", "token"]),
            ("dark", &["theme", "mode", "light"]),
            ("form", &["input", "submit", "field", "validation"]),
            ("auth", &["login", "token", "session", "user", "password"]),
            ("route", &["router", "endpoint", "handler", "path", "api"]),
            ("style", &["css", "class", "stylesheet"]),
            ("script", &["function", "handler", "event"]),
            ("test", &["spec", "assert", "expect", "verify"]),
        ];
        for t in terms {
            for (k, syns) in syn_table {
                if t == k {
                    for s in *syns {
                        let st = stem_word(s);
                        if !out.iter().any(|(existing, _)| existing == &st) {
                            out.push((st, 0.5));
                        }
                    }
                }
            }
        }
        out
    }

    let q_terms = expand_synonyms(&tokenize_code(query));
    if q_terms.is_empty() {
        return Vec::new();
    }

    struct ChunkDoc {
        path: String,
        start_line: usize,
        end_line: usize,
        text: String,
        tf: std::collections::HashMap<String, usize>,
        len: usize,
    }

    let all_files = glob_workspace_files(root, "**/*", None);
    let mut chunks: Vec<ChunkDoc> = Vec::new();
    const CHUNK_LINES: usize = 40;
    const OVERLAP_LINES: usize = 8;

    for rel in all_files.into_iter().take(250) {
        let Ok(full) = safe_join(root, &rel) else { continue };
        let Ok(meta) = fs::metadata(&full) else { continue };
        if !meta.is_file() || meta.len() > 350_000 {
            continue;
        }
        let Ok(content) = fs::read_to_string(&full) else { continue };
        let lines: Vec<&str> = content.lines().collect();
        if lines.is_empty() {
            continue;
        }
        let path_toks = tokenize_code(&rel);
        let mut i = 0usize;
        while i < lines.len() {
            let end = (i + CHUNK_LINES).min(lines.len());
            let slice_text = lines[i..end].join("\n");
            let mut toks = tokenize_code(&slice_text);
            toks.extend(path_toks.iter().cloned());
            let doc_len = toks.len().max(1);
            let mut tf = std::collections::HashMap::new();
            for tok in toks {
                *tf.entry(tok).or_insert(0) += 1;
            }
            chunks.push(ChunkDoc {
                path: rel.clone(),
                start_line: i + 1,
                end_line: end,
                text: slice_text,
                tf,
                len: doc_len,
            });
            if end >= lines.len() {
                break;
            }
            i += CHUNK_LINES - OVERLAP_LINES;
        }
    }

    if chunks.is_empty() {
        return Vec::new();
    }

    let n_docs = chunks.len() as f64;
    let avg_len = (chunks.iter().map(|c| c.len).sum::<usize>() as f64) / n_docs;
    let k1 = 1.4_f64;
    let b = 0.72_f64;

    let mut df_map = std::collections::HashMap::new();
    for (t, _) in &q_terms {
        let df = chunks.iter().filter(|c| c.tf.contains_key(t)).count();
        df_map.insert(t.clone(), df as f64);
    }

    let mut scored: Vec<(f64, &ChunkDoc)> = Vec::new();
    for c in &chunks {
        let mut score = 0.0_f64;
        for (t, w) in &q_terms {
            let Some(&f) = c.tf.get(t) else { continue };
            let df = *df_map.get(t).unwrap_or(&0.0);
            let idf = (1.0 + (n_docs - df + 0.5) / (df + 0.5)).ln();
            let f_f64 = f as f64;
            score += w * idf * (f_f64 * (k1 + 1.0)) / (f_f64 + k1 * (1.0 - b + b * (c.len as f64) / avg_len));
        }
        if q_terms.iter().any(|(t, _)| c.path.to_lowercase().contains(t)) {
            score *= 1.3;
        }
        if score > 0.0 {
            scored.push((score, c));
        }
    }

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut seen_buckets = HashSet::new();
    let mut results = Vec::new();
    for (score, c) in scored {
        let bucket = format!("{}:{}", c.path, c.start_line / 20);
        if seen_buckets.contains(&bucket) {
            continue;
        }
        seen_buckets.insert(bucket);
        let c_lines: Vec<&str> = c.text.lines().collect();
        let best_idx = c_lines
            .iter()
            .enumerate()
            .max_by_key(|(_, l)| {
                let low = l.to_lowercase();
                q_terms.iter().filter(|(t, _)| low.contains(t.as_str())).count()
            })
            .map(|(idx, _)| idx)
            .unwrap_or(0);
        let s_from = best_idx.saturating_sub(1);
        let s_to = (best_idx + 3).min(c_lines.len());
        let snippet: String = c_lines[s_from..s_to].join("\n").chars().take(360).collect();
        results.push(json!({
            "path": c.path,
            "startLine": c.start_line,
            "endLine": c.end_line,
            "score": (score * 100.0).round() / 100.0,
            "snippet": snippet
        }));
        if results.len() >= limit {
            break;
        }
    }
    results
}

/// Stormy `WebDocs`: built-in offline reference lookup for HTML, CSS, JavaScript, TypeScript, and UI patterns.
pub fn docs_lookup_reference(query: &str) -> String {
    let q = query.to_lowercase();
    let entries: &[(&str, &str, &str, &str)] = &[
        (
            "dialog / modal",
            "HTML <dialog>",
            "Native accessible modal dialog with backdrop and Escape handling.",
            "<dialog id=\"sheet\">\n  <form method=\"dialog\">\n    <h2>Settings</h2>\n    <button value=\"cancel\">Cancel</button>\n    <button value=\"ok\">Save</button>\n  </form>\n</dialog>\n<script>\n  const d = document.getElementById('sheet');\n  openBtn.onclick = () => d.showModal();\n</script>",
        ),
        (
            "grid auto-fit / responsive cards",
            "CSS Grid",
            "Responsive fluid card grid without media queries.",
            ".grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));\n  gap: 1rem;\n}",
        ),
        (
            "sticky header / navigation",
            "CSS Layout",
            "Sticky top navigation bar with surface border.",
            ".site-header {\n  position: sticky;\n  top: 0;\n  z-index: 40;\n  background: var(--surface, #141318);\n  border-bottom: 1px solid var(--outline-variant, #48454e);\n}",
        ),
        (
            "dark mode / theme tokens",
            "CSS Custom Properties",
            "Theme toggle using data-theme attribute and CSS variables.",
            ":root, [data-theme=\"light\"] {\n  --bg: #fdf8fd;\n  --fg: #1c1b1f;\n}\n[data-theme=\"dark\"] {\n  --bg: #141318;\n  --fg: #e6e1e9;\n}",
        ),
        (
            "fetch / async JSON API",
            "JavaScript Fetch",
            "Fetch JSON with timeout, status check, and error handling.",
            "async function requestJson(url, opts = {}) {\n  const res = await fetch(url, {\n    headers: { 'Content-Type': 'application/json', ...opts.headers },\n    ...opts,\n  });\n  if (!res.ok) throw new Error(`HTTP ${res.status}`);\n  return res.json();\n}",
        ),
    ];
    let mut matched = Vec::new();
    for (title, kind, summary, example) in entries {
        if q.split_whitespace().any(|w| {
            title.to_lowercase().contains(w)
                || kind.to_lowercase().contains(w)
                || summary.to_lowercase().contains(w)
        }) {
            matched.push(format!("### {} ({})\n{}\n```\n{}\n```", title, kind, summary, example));
        }
    }
    if matched.is_empty() {
        entries
            .iter()
            .take(2)
            .map(|(title, kind, summary, example)| format!("### {} ({})\n{}\n```\n{}\n```", title, kind, summary, example))
            .collect::<Vec<_>>()
            .join("\n\n")
    } else {
        matched.join("\n\n")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointFileEntry {
    pub path: String,
    pub existed: bool,
    pub blob: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointManifest {
    pub id: String,
    pub label: String,
    pub created_at: u64,
    pub files: Vec<CheckpointFileEntry>,
}

/// Stormy `Checkpoints.Recorder.capture`: copy-on-first-write pre-image capture before a tool mutates `rel_path`.
pub fn checkpoint_capture_file(root: &str, checkpoint_id: &str, label: &str, rel_path: &str) {
    let base = Path::new(root);
    if !base.exists() || checkpoint_id.trim().is_empty() {
        return;
    }
    let clean_rel = rel_path.trim().replace('\\', "/").trim_start_matches("./").trim_start_matches('/').to_string();
    if clean_rel.is_empty() || clean_rel.starts_with(".zeusdesigns/") || clean_rel.starts_with(".git/") {
        return;
    }
    let cp_dir = base.join(".zeusdesigns").join("checkpoints").join(checkpoint_id);
    let manifest_path = cp_dir.join("manifest.json");
    let mut manifest: CheckpointManifest = if manifest_path.exists() {
        fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| CheckpointManifest {
                id: checkpoint_id.to_string(),
                label: label.chars().take(80).collect(),
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
                files: Vec::new(),
            })
    } else {
        CheckpointManifest {
            id: checkpoint_id.to_string(),
            label: label.chars().take(80).collect(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            files: Vec::new(),
        }
    };

    if manifest.files.iter().any(|f| f.path.eq_ignore_ascii_case(&clean_rel)) {
        return;
    }
    if manifest.files.len() >= 100 {
        return;
    }

    let Ok(target) = safe_join(root, &clean_rel) else { return };
    let _ = fs::create_dir_all(&cp_dir);
    if target.is_file() {
        let size = fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
        if size <= 1_000_000 {
            let blob_name = format!("f{}", manifest.files.len());
            if fs::copy(&target, cp_dir.join(&blob_name)).is_ok() {
                manifest.files.push(CheckpointFileEntry {
                    path: clean_rel,
                    existed: true,
                    blob: Some(blob_name),
                });
            }
        }
    } else {
        manifest.files.push(CheckpointFileEntry {
            path: clean_rel,
            existed: false,
            blob: None,
        });
    }

    if let Ok(serialized) = serde_json::to_string_pretty(&manifest) {
        let _ = fs::write(&manifest_path, serialized);
    }
}

#[tauri::command(async)]
pub fn workspace_checkpoints(root: String) -> Result<Vec<CheckpointManifest>, String> {
    let cp_base = Path::new(&root).join(".zeusdesigns").join("checkpoints");
    if !cp_base.exists() {
        return Ok(Vec::new());
    }
    let mut list: Vec<CheckpointManifest> = Vec::new();
    if let Ok(entries) = fs::read_dir(&cp_base) {
        for e in entries.flatten() {
            let m_path = e.path().join("manifest.json");
            if let Ok(txt) = fs::read_to_string(&m_path) {
                if let Ok(m) = serde_json::from_str::<CheckpointManifest>(&txt) {
                    if !m.files.is_empty() {
                        list.push(m);
                    }
                }
            }
        }
    }
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(list.into_iter().take(30).collect())
}

#[tauri::command(async)]
pub fn workspace_restore_checkpoint(root: String, checkpoint_id: String) -> Result<Value, String> {
    let cp_dir = Path::new(&root).join(".zeusdesigns").join("checkpoints").join(&checkpoint_id);
    let m_path = cp_dir.join("manifest.json");
    let txt = fs::read_to_string(&m_path).map_err(|_| format!("Checkpoint '{}' not found", checkpoint_id))?;
    let manifest: CheckpointManifest = serde_json::from_str(&txt).map_err(|e| e.to_string())?;
    let mut restored_files = Vec::new();
    for f in &manifest.files {
        let Ok(target) = safe_join(&root, &f.path) else { continue };
        if f.existed {
            if let Some(blob) = &f.blob {
                let blob_path = cp_dir.join(blob);
                if blob_path.exists() {
                    if let Some(parent) = target.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if fs::copy(&blob_path, &target).is_ok() {
                        restored_files.push(f.path.clone());
                    }
                }
            }
        } else if target.is_file() {
            if fs::remove_file(&target).is_ok() {
                restored_files.push(f.path.clone());
            }
        }
    }
    Ok(json!({
        "id": manifest.id,
        "restoredFiles": restored_files
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language_ui_components() {
        assert_eq!(detect_language("tsx"), ("typescriptreact", true));
        assert_eq!(detect_language("kt"), ("kotlin", true));
        assert_eq!(detect_language("rs"), ("rust", false));
    }

    #[test]
    fn test_safe_join_blocks_traversal() {
        assert!(safe_join("/tmp", "../etc/passwd").is_err());
        assert!(safe_join("/tmp", "src/App.tsx").is_ok());
    }

    #[test]
    fn test_sanitize_shell_command_strips_window_spawners() {
        assert_eq!(sanitize_shell_command("start cmd /c npm test && pause"), "npm test");
        assert_eq!(sanitize_shell_command("cmd /k git status -sb"), "git status -sb");
    }

    #[test]
    fn test_builtin_posix_rg_and_find_on_windows() {
        let workdir = Path::new(".");
        let rg_res = try_builtin_posix_shell(
            workdir,
            "rg -i --files-with-matches \"sanitize_shell_command|safe_join\" src/",
        )
        .expect("rg should be handled by builtin posix shell");
        assert_eq!(rg_res.get("code").and_then(|c| c.as_i64()), Some(0));
        let out = rg_res.get("stdout").and_then(|s| s.as_str()).unwrap_or("");
        assert!(out.contains("workspace.rs"));

        let find_res = try_builtin_posix_shell(workdir, "find src -maxdepth 2 -type f -name \"*.rs\"")
            .expect("find should be handled by builtin posix shell");
        assert_eq!(find_res.get("code").and_then(|c| c.as_i64()), Some(0));
        let find_out = find_res.get("stdout").and_then(|s| s.as_str()).unwrap_or("");
        assert!(find_out.contains("workspace.rs"));
    }

    #[test]
    fn test_stormy_project_outline_and_bm25_search() {
        let outline = project_outline_of(Path::new("src/workspace.rs")).unwrap_or_default();
        assert!(outline.contains("lines"));
        let hits = bm25_search_project("src", "sanitize_shell_command", 5);
        assert!(!hits.is_empty());
        let globbed = glob_workspace_files(".", "**/*.rs", Some("src"));
        assert!(globbed.iter().any(|p| p.contains("workspace.rs")));
    }
}
