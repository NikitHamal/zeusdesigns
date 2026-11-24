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

fn safe_join(root: &str, rel_path: &str) -> Result<PathBuf, String> {
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
    let cleaned = stripped
        .trim_start_matches("./")
        .trim_start_matches(['/', '\\']);
    let candidate = root_path.join(cleaned);
    for comp in Path::new(cleaned).components() {
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
pub fn shell_run(root: String, cmd: String) -> Result<Value, String> {
    use std::process::Stdio;
    let workdir = if root.trim().is_empty() {
        std::env::current_dir().map_err(|e| e.to_string())?
    } else {
        PathBuf::from(&root)
    };

    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .args(["/C", &cmd])
            .current_dir(&workdir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("bash")
        .args(["-lc", &cmd])
        .current_dir(&workdir)
        .stdin(Stdio::null())
        .output()
        .or_else(|_| {
            Command::new("sh")
                .args(["-lc", &cmd])
                .current_dir(&workdir)
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
                    for (idx, line) in text.lines().enumerate() {
                        if line.to_lowercase().contains(needle) {
                            out.push(json!({
                                "path": n.path,
                                "line": idx + 1,
                                "snippet": line.trim().chars().take(200).collect::<String>()
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
}

static OPENCODE_CHILD: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

/// Starts `opencode serve` for the project folder (OpenCode SDK runtime). `config` is the inline
/// OpenCode config JSON (Zeus local gateway provider + permissions) passed via OPENCODE_CONFIG_CONTENT.
#[tauri::command]
pub fn opencode_start(root: String, port: u16, config: String) -> Result<String, String> {
    use std::process::{Command, Stdio};
    let mut guard = OPENCODE_CHILD.lock().map_err(|_| "opencode state is locked".to_string())?;
    if let Some(child) = guard.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return Ok("running".to_string());
        }
    }
    let port_s = port.to_string();
    let serve: Vec<&str> = vec![
        "serve", "--port", port_s.as_str(),
        "--cors", "http://tauri.localhost",
        "--cors", "tauri://localhost",
        "--cors", "http://localhost:1420",
    ];
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg("opencode");
        c
    } else {
        Command::new("opencode")
    };
    cmd.args(serve)
        .env("OPENCODE_CONFIG_CONTENT", config)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if !root.trim().is_empty() {
        cmd.current_dir(&root);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    match cmd.spawn() {
        Ok(child) => {
            *guard = Some(child);
            Ok("started".to_string())
        }
        Err(e) => Err(format!("Could not start OpenCode ({}). Install it with: npm i -g opencode-ai", e)),
    }
}

#[tauri::command]
pub fn opencode_stop() -> Result<(), String> {
    if let Ok(mut guard) = OPENCODE_CHILD.lock() {
        if let Some(mut child) = guard.take() {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", child.id().to_string().as_str(), "/T", "/F"])
                    .creation_flags(0x08000000)
                    .output();
            }
            let _ = child.kill();
        }
    }
    Ok(())
}
