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
    let cleaned = rel_path.trim_start_matches(['/', '\\']);
    let candidate = root_path.join(cleaned);
    for comp in Path::new(cleaned).components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err("Path traversal outside workspace root is not permitted".to_string());
        }
    }
    Ok(candidate)
}

pub fn walk_workspace(base_root: &Path, current: &Path, depth: usize) -> Vec<FileNode> {
    let skip = ignored_dirs();
    let mut nodes = Vec::new();
    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return nodes,
    };

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with(".DS_Store") || skip.contains(file_name.as_str()) {
            continue;
        }
        let path = entry.path();
        let rel = path
            .strip_prefix(base_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);

        if is_dir {
            let children = if depth > 0 {
                walk_workspace(base_root, &path, depth - 1)
            } else {
                Vec::new()
            };
            nodes.push(FileNode {
                name: file_name,
                path: rel,
                dir: true,
                children: Some(children),
                size: None,
                language: None,
                is_ui_component: None,
            });
        } else {
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            let (lang, is_ui) = detect_language(&ext);
            nodes.push(FileNode {
                name: file_name,
                path: rel,
                dir: false,
                children: None,
                size: meta.map(|m| m.len()),
                language: Some(lang.to_string()),
                is_ui_component: Some(is_ui),
            });
        }
    }

    nodes.sort_by(|a, b| {
        b.dir
            .cmp(&a.dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    nodes
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
    let max_depth = depth.unwrap_or(3).min(8);
    Ok(walk_workspace(root_path, root_path, max_depth))
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
    let workdir = if root.trim().is_empty() {
        std::env::current_dir().map_err(|e| e.to_string())?
    } else {
        PathBuf::from(&root)
    };

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd")
        .args(["/C", &cmd])
        .current_dir(&workdir)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh")
        .args(["-lc", &cmd])
        .current_dir(&workdir)
        .output()
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

pub fn search_workspace_code(root: &str, query: &str, max_results: usize) -> Vec<Value> {
    let mut matches = Vec::new();
    let root_path = Path::new(root);
    if !root_path.exists() || query.trim().is_empty() {
        return matches;
    }
    let needle = query.to_lowercase();
    let nodes = walk_workspace(root_path, root_path, 4);

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
