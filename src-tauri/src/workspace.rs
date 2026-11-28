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
        "env",
        ".turbo",
        "coverage",
        "staticfiles",
        "media",
        ".cache",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".parcel-cache",
        ".vite",
        ".svelte-kit",
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

pub fn set_term_app(app: tauri::AppHandle) {
    let _ = TERM_APP.set(app);
}

fn term_cwd_map() -> &'static Mutex<std::collections::HashMap<String, PathBuf>> {
    TERM_CWD.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

fn term_emit(payload: Value) {
    if let Some(app) = TERM_APP.get() {
        let _ = tauri::Emitter::emit(app, "zeus://term", payload);
    }
}

/// Splits a leading `cd <dir>` off a command line. Returns (dir, remaining command).
fn split_leading_cd(cmd: &str) -> Option<(String, String)> {
    let t = cmd.trim();
    let lower = t.to_ascii_lowercase();
    if !(lower == "cd" || lower.starts_with("cd ") || lower.starts_with("cd\t") || lower.starts_with("chdir ")) {
        return None;
    }
    let after = if lower.starts_with("chdir ") { &t[6..] } else { &t[2..] };
    let mut end = after.len();
    let mut rest_start = after.len();
    for sep in ["&&", ";", "\n"] {
        if let Some(i) = after.find(sep) {
            if i < end {
                end = i;
                rest_start = i + sep.len();
            }
        }
    }
    let mut dir = after[..end].trim().to_string();
    if dir.to_ascii_lowercase().starts_with("/d ") {
        dir = dir[3..].trim().to_string();
    }
    let dir = dir.trim_matches('"').trim_matches('\'').to_string();
    let rest = after[rest_start..].trim().to_string();
    Some((dir, rest))
}

#[tauri::command(async)]
pub fn shell_run(root: String, cmd: String) -> Result<Value, String> {
    shell_run_as(root, cmd, "user")
}

pub fn shell_run_as(root: String, cmd: String, source: &str) -> Result<Value, String> {
    shell_run_ex(root, cmd, source, None)
}

/// Runs one command in the real shell (see `shell.rs`). Agent runs stream into the Terminal panel
/// through `zeus://term` chunk events; `timeout_ms` is clamped to 1s..10min (default 5min).
pub fn shell_run_ex(root: String, cmd: String, source: &str, timeout_ms: Option<u64>) -> Result<Value, String> {
    let base = if root.trim().is_empty() {
        std::env::current_dir().map_err(|e| e.to_string())?
    } else {
        PathBuf::from(&root)
    };
    let mirror = source == "agent";
    let id = format!("t{}-{}", std::process::id(), TERM_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    let clean_cmd = sanitize_shell_command(&cmd);
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(300_000).clamp(1_000, 600_000));
    let shell_label = crate::shell::default_shell().label();
    if mirror {
        term_emit(json!({ "id": id, "root": root, "cmd": clean_cmd, "source": source, "running": true, "shell": shell_label }));
    }
    let res = shell_exec(&root, &base, clean_cmd.clone(), &id, source, timeout);
    if mirror {
        match &res {
            Ok(v) => term_emit(json!({
                "id": id, "root": root, "cmd": clean_cmd, "source": source, "running": false,
                "code": v.get("code").cloned().unwrap_or(json!(0)),
                "stdout": v.get("stdout").cloned().unwrap_or(json!("")),
                "stderr": v.get("stderr").cloned().unwrap_or(json!("")),
                "cwd": v.get("cwd").cloned().unwrap_or(json!("")),
            })),
            Err(e) => term_emit(json!({
                "id": id, "root": root, "cmd": clean_cmd, "source": source, "running": false,
                "code": 1, "stdout": "", "stderr": e,
            })),
        }
    }
    res
}

fn is_searchable_text_file(path: &Path) -> bool {
    const MAX_SEARCH_FILE_BYTES: u64 = 512 * 1024;
    if let Ok(meta) = fs::metadata(path) {
        if !meta.is_file() || meta.len() > MAX_SEARCH_FILE_BYTES {
            return false;
        }
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    !matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "bmp" | "svg"
            | "mp4" | "webm" | "mov" | "avi" | "mp3" | "wav" | "ogg" | "flac"
            | "woff" | "woff2" | "ttf" | "otf" | "eot"
            | "pdf" | "zip" | "tar" | "gz" | "7z" | "rar" | "bz2" | "xz"
            | "sqlite" | "sqlite3" | "db" | "pyc" | "pyo" | "pyd"
            | "exe" | "dll" | "so" | "dylib" | "wasm" | "bin" | "class" | "jar"
            | "map" | "lock"
    )
}

pub fn search_workspace_code(root: &str, query: &str, max_results: usize) -> Vec<Value> {
    let mut matches = Vec::new();
    let root_path = Path::new(root);
    if !root_path.exists() || query.trim().is_empty() {
        return matches;
    }
    let needle = query.to_lowercase();
    let nodes = walk_workspace_n(root_path, root_path, 6, 4000);
    let started = std::time::Instant::now();
    let deadline = std::time::Duration::from_secs(5);

    fn visit(
        base: &Path,
        nodes: &[FileNode],
        needle: &str,
        out: &mut Vec<Value>,
        limit: usize,
        started: std::time::Instant,
        deadline: std::time::Duration,
    ) {
        for n in nodes {
            if out.len() >= limit || started.elapsed() >= deadline {
                return;
            }
            if n.dir {
                if let Some(children) = &n.children {
                    visit(base, children, needle, out, limit, started, deadline);
                }
            } else {
                let full = base.join(&n.path);
                if !is_searchable_text_file(&full) {
                    continue;
                }
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

    visit(root_path, &nodes, &needle, &mut matches, max_results, started, deadline);
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


pub fn project_outline_of(path: &Path) -> Option<String> { project_outline_of_impl(path) }
pub fn glob_workspace_files(root: &str, pattern: &str, subpath: Option<&str>) -> Vec<String> { glob_workspace_files_impl(root, pattern, subpath) }
pub fn audit_workspace_files(root: &str, target_paths: Option<&[String]>) -> Vec<String> { audit_workspace_files_impl(root, target_paths) }
pub fn bm25_search_project(root: &str, query: &str, limit: usize) -> Vec<Value> { bm25_search_project_impl(root, query, limit) }
pub fn docs_lookup_reference(query: &str) -> String { docs_lookup_reference_impl(query) }


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

#[tauri::command(async)]
pub fn workspace_audit(root: String, paths: Option<Vec<String>>) -> Result<Vec<String>, String> {
    Ok(audit_workspace_files(&root, paths.as_deref()))
}

#[tauri::command(async)]
pub fn workspace_git_status(root: String) -> Result<Value, String> {
    let workdir = Path::new(&root);
    if !workdir.exists() {
        return Err(format!("Workspace root not found: {}", root));
    }
    let branch_out = shell_run(root.clone(), "git rev-parse --abbrev-ref HEAD".to_string())
        .ok()
        .and_then(|v| v.get("stdout").and_then(|s| s.as_str()).map(|s| s.trim().to_string()))
        .unwrap_or_default();
    let status_out = shell_run(root.clone(), "git status --porcelain".to_string())?;
    let code = status_out.get("code").and_then(|c| c.as_i64()).unwrap_or(1);
    if code != 0 {
        return Ok(json!({
            "isRepo": false,
            "branch": "",
            "changed": [],
            "commits": []
        }));
    }
    let raw_lines = status_out.get("stdout").and_then(|s| s.as_str()).unwrap_or("");
    let mut changed = Vec::new();
    for line in raw_lines.lines() {
        if line.len() < 3 {
            continue;
        }
        let xy = &line[..2];
        let file_path = line[3..].trim().trim_matches('"').to_string();
        let staged = !xy.starts_with(' ') && !xy.starts_with('?');
        let status_code = xy.trim().to_string();
        changed.push(json!({
            "path": file_path,
            "status": if status_code.is_empty() { "M".to_string() } else { status_code },
            "staged": staged
        }));
    }
    let log_out = shell_run(
        root,
        "git log -n 12 --pretty=format:\"%h|%an|%ar|%s\"".to_string(),
    )
    .ok()
    .and_then(|v| v.get("stdout").and_then(|s| s.as_str()).map(|s| s.to_string()))
    .unwrap_or_default();
    let mut commits = Vec::new();
    for l in log_out.lines() {
        let parts: Vec<&str> = l.splitn(4, '|').collect();
        if parts.len() == 4 {
            commits.push(json!({
                "hash": parts[0],
                "author": parts[1],
                "date": parts[2],
                "message": parts[3]
            }));
        }
    }
    Ok(json!({
        "isRepo": true,
        "branch": branch_out,
        "changed": changed,
        "commits": commits
    }))
}

/// Stormy `SecurityScan`: scans workspace files for hardcoded secrets, unsafe eval/innerHTML, and risky patterns.
pub fn scan_workspace_security(root: &str, only_paths: Option<&[String]>) -> Vec<String> {
    let files: Vec<String> = match only_paths {
        Some(list) if !list.is_empty() => list.to_vec(),
        _ => glob_workspace_files(root, "**/*", None),
    };
    let mut findings = Vec::new();
    for rel in files.into_iter().take(120) {
        let Ok(full) = safe_join(root, &rel) else { continue };
        let Ok(text) = fs::read_to_string(&full) else { continue };
        for (idx, line) in text.lines().enumerate() {
            let ln = idx + 1;
            let trimmed = line.trim();
            if trimmed.starts_with("//") || trimmed.starts_with('#') {
                continue;
            }
            if (trimmed.contains("sk-proj-") || trimmed.contains("AKIA") || trimmed.contains("ghp_") || trimmed.contains("AIzaSy"))
                && !trimmed.contains("REDACTED")
                && !trimmed.contains("example")
            {
                findings.push(format!("HIGH {}:{}: Potential hardcoded API key or token detected.", rel, ln));
            }
            if trimmed.contains("eval(") {
                findings.push(format!("MEDIUM {}:{}: Dynamic `eval()` call can introduce code injection risks.", rel, ln));
            }
            if trimmed.contains("dangerouslySetInnerHTML") || (trimmed.contains(".innerHTML") && trimmed.contains('=')) {
                findings.push(format!("LOW {}:{}: Unsanitized HTML assignment (`innerHTML`) — verify input is escaped.", rel, ln));
            }
        }
        if findings.len() >= 30 {
            break;
        }
    }
    findings
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


include!("workspace_posix.rs");
include!("workspace_stormy.rs");
