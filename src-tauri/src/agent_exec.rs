use crate::agent::InlineToolInvocation;
use super::agent_edit::{apply_search_replace, apply_stormy_text_edit_impl, html_to_text};
use crate::providers::{verify_model_fingerprint, ProviderEngine};
use crate::workspace::{
    audit_workspace_files, bm25_search_project, docs_lookup_reference, fs_delete, fs_move, fs_read,
    fs_write, glob_workspace_files, project_outline_of, python_run, safe_join,
    scan_workspace_security, search_workspace_code, walk_workspace, FileNode,
};
use serde_json::Value;
use std::path::Path;
pub fn resolve_workspace_root(workspace_root: &str) -> String {
    let trimmed = workspace_root.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string())
}
pub fn format_tree_compact(nodes: &[FileNode], indent: usize, out: &mut String) {
    let pad = "  ".repeat(indent);
    for n in nodes {
        if n.dir {
            out.push_str(&format!("{}{}/\n", pad, n.name));
            if let Some(children) = &n.children {
                format_tree_compact(children, indent + 1, out);
            }
        } else {
            let size_label = match n.size {
                Some(b) if b >= 1024 => format!(" ({:.1} KB)", b as f64 / 1024.0),
                Some(b) => format!(" ({} B)", b),
                None => String::new(),
            };
            out.push_str(&format!("{}{}{}\n", pad, n.name, size_label));
        }
    }
}
pub fn format_exec_result(v: &Value) -> (bool, String) {
    let code = v.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
    let stdout = v.get("stdout").and_then(|s| s.as_str()).unwrap_or("").trim_end();
    let stderr = v.get("stderr").and_then(|s| s.as_str()).unwrap_or("").trim_end();
    let mut parts = Vec::new();
    if !stdout.is_empty() {
        parts.push(stdout.to_string());
    }
    if !stderr.is_empty() {
        parts.push(if stdout.is_empty() { stderr.to_string() } else { format!("[stderr]\n{}", stderr) });
    }
    if code != 0 {
        parts.push(format!("[exit code: {}]", code));
        if let Some(sh) = v.get("shell").and_then(|s| s.as_str()) {
            let cwd = v.get("cwd").and_then(|s| s.as_str()).unwrap_or("");
            let cwd_part = if cwd.is_empty() { String::new() } else { format!(", cwd: {}", cwd) };
            parts.push(format!("[shell: {}{}]", sh, cwd_part));
        }
    }
    let text = if parts.is_empty() { format!("[exit {}] (no output)", code) } else { parts.join("\n") };
    (code == 0, text)
}
/// Appends Stormy's `ProjectTools.withQuickCheck` note when a file write/edit introduces syntax or asset issues.
pub const TOOL_OUTPUT_MAX_LINES: usize = 2_000;
pub const TOOL_OUTPUT_MAX_BYTES: usize = 50 * 1024;
pub const TOOL_OUTPUT_DIR: &str = ".zeusdesigns/tool-output";

fn count_output_lines(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }
    let bytes = text.as_bytes();
    let mut count = 1usize;
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'\n' && i + 1 < bytes.len() {
            count += 1;
        }
    }
    count
}

fn after_output_lines(text: &str, max_lines: usize) -> usize {
    let mut idx = 0usize;
    for _ in 0..max_lines {
        match text[idx..].find('\n') {
            Some(rel) => idx += rel + 1,
            None => return text.len(),
        }
    }
    idx
}

fn utf8_byte_boundary(text: &str, max_bytes: usize) -> usize {
    if text.len() <= max_bytes {
        return text.len();
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    if end > 0 && end < text.len() && text.as_bytes()[end - 1] == b'\r' && text.as_bytes()[end] == b'\n' {
        end -= 1;
    }
    end
}

/// Matches OpenCode's `ToolOutput.truncate` (`MAX_LINES = 2000`, `MAX_BYTES = 50 * 1024`):
/// When tool output exceeds either limit, saves the full output to `.zeusdesigns/tool-output/tool_<id>.txt`
/// inside the workspace (or temp dir fallback) and appends `[showing lines 1-N of M; full output saved to <path>]`.
pub fn bound_tool_output_with_retention(eff_root: &str, text: String) -> String {
    let total_lines = count_output_lines(&text);
    if total_lines <= TOOL_OUTPUT_MAX_LINES && text.len() <= TOOL_OUTPUT_MAX_BYTES {
        return text;
    }
    let end = after_output_lines(&text, TOOL_OUTPUT_MAX_LINES).min(utf8_byte_boundary(&text, TOOL_OUTPUT_MAX_BYTES));
    let shown_slice = &text[..end];
    let shown = shown_slice.strip_suffix("\r\n").or_else(|| shown_slice.strip_suffix('\n')).unwrap_or(shown_slice);
    let shown_lines = count_output_lines(shown_slice);
    let last_line_cut = shown_lines > 0
        && shown.len() < text.len()
        && !text[shown.len()..].starts_with('\n')
        && !text[shown.len()..].starts_with("\r\n");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let file_name = format!("tool_{:012x}.txt", ts & 0xffffffffffff);
    let rel_file = format!("{}/{}", TOOL_OUTPUT_DIR, file_name);
    let saved_path = match safe_join(eff_root, &rel_file) {
        Ok(full_path) => {
            if let Some(parent) = full_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if std::fs::write(&full_path, &text).is_ok() {
                Ok(rel_file)
            } else {
                Err("write failed")
            }
        }
        Err(_) => Err("invalid root"),
    }
    .or_else(|_| {
        let fallback_dir = std::env::temp_dir().join("zeusdesigns").join("tool-output");
        let _ = std::fs::create_dir_all(&fallback_dir);
        let fallback_file = fallback_dir.join(&file_name);
        std::fs::write(&fallback_file, &text).map(|_| fallback_file.to_string_lossy().to_string())
    });
    let range = if shown_lines == 0 { "0 lines".to_string() } else { format!("lines 1-{}", shown_lines) };
    let cut_note = if last_line_cut { " (last line cut)" } else { "" };
    let save_note = match saved_path {
        Ok(p) => format!("full output saved to {}", p),
        Err(e) => format!("full output could not be saved: {}", e),
    };
    format!("{}\n[showing {} of {}{}; {}]", shown, range, total_lines, cut_note, save_note)
}

pub fn append_quick_check(eff_root: &str, rel_path: &str, base_msg: String) -> String {
    if rel_path.trim().is_empty() {
        return base_msg;
    }
    let issues = audit_workspace_files(eff_root, Some(&[rel_path.to_string()]));
    if issues.is_empty() { base_msg } else { format!("{}\n\n[Quick syntax check]\n{}", base_msg, issues.join("\n")) }
}
pub fn execute_single_workspace_tool(eff_root: &str, inv: &InlineToolInvocation) -> (bool, String) {
    let eff_root = resolve_workspace_root(eff_root);
    let (ok, raw_out) = execute_single_workspace_tool_inner(&eff_root, inv);
    (ok, bound_tool_output_with_retention(&eff_root, raw_out))
}
fn execute_single_workspace_tool_inner(eff_root: &str, inv: &InlineToolInvocation) -> (bool, String) {
    let name = inv.name.trim();
    let path_arg = &inv.path;
    let body = inv.body.trim();
    let eff_root = eff_root.to_string();
    match name {
        "read_file" | "read" | "cat" | "cat_file" | "view_file" | "open_file" | "read_file_lines" => {
            let mut target_paths = Vec::new();
            let mut start = inv.start_line.unwrap_or(1).max(1);
            let mut end = inv.end_line.unwrap_or(start + 1999);
            if !path_arg.is_empty() { target_paths.push(path_arg.clone()); }
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                        if !p.is_empty() && !target_paths.contains(&p.to_string()) { target_paths.push(p.to_string()); }
                    }
                    if let Some(arr) = j.get("paths").and_then(|v| v.as_array()) {
                        for item in arr.iter().take(8) {
                            if let Some(s) = item.as_str() {
                                if !s.is_empty() && !target_paths.contains(&s.to_string()) { target_paths.push(s.to_string()); }
                            }
                        }
                    }
                    if let Some(off) = j.get("offset").or_else(|| j.get("start")).and_then(|v| v.as_u64()) {
                        start = (off as usize).max(1);
                        if let Some(lim) = j.get("limit").and_then(|v| v.as_u64()) { end = start + (lim as usize).saturating_sub(1); }
                    }
                    if let Some(e) = j.get("end").and_then(|v| v.as_u64()) { end = (e as usize).max(start); }
                }
            }
            if target_paths.is_empty() && !body.is_empty() && !body.contains('\n') {
                target_paths.push(body.trim_matches(|c| c == '"' || c == '\'').to_string());
            }
            if target_paths.is_empty() { return (false, "read_file: missing file path".to_string()); }
            let mut sections = Vec::new();
            let mut any_ok = false;
            for tp in target_paths.iter().take(8) {
                match fs_read(eff_root.clone(), tp.clone()) {
                    Ok(content) => {
                        any_ok = true;
                        let total = content.lines().count();
                        let mut out = String::new();
                        let mut last = start;
                        for (i, line) in content.lines().enumerate() {
                            let n = i + 1;
                            if n < start { continue; }
                            if n > end { break; }
                            out.push_str(&format!("{:>4}|{}\n", n, line));
                            last = n;
                        }
                        sections.push(format!("[{} lines {}-{} of {}]\n{}", tp, start, last, total, out));
                    }
                    Err(e) => sections.push(e),
                }
            }
            (any_ok, sections.join("\n\n"))
        }
        "multi_edit" | "multiedit" | "multi_edit_file" => {
            let Ok(content) = fs_read(eff_root.clone(), path_arg.clone()) else {
                return (false, format!("File not found: {}", path_arg));
            };
            let Ok(j) = serde_json::from_str::<Value>(body) else {
                return (false, "multi_edit: arguments must be JSON with an `edits` array".to_string());
            };
            let edits_val = j.get("edits").cloned().unwrap_or(Value::Null);
            let edits_arr: Vec<Value> = if let Some(arr) = edits_val.as_array() {
                arr.clone()
            } else if let Some(s) = edits_val.as_str() {
                serde_json::from_str::<Vec<Value>>(s).unwrap_or_default()
            } else {
                Vec::new()
            };
            if edits_arr.is_empty() {
                return (false, "multi_edit: `edits` array is empty".to_string());
            }
            let mut current = content;
            for (idx, ed) in edits_arr.iter().enumerate() {
                let old_s = ed
                    .get("old_string")
                    .or_else(|| ed.get("oldString"))
                    .or_else(|| ed.get("old_str"))
                    .or_else(|| ed.get("search"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let new_s = ed
                    .get("new_string")
                    .or_else(|| ed.get("newString"))
                    .or_else(|| ed.get("new_str"))
                    .or_else(|| ed.get("replace"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let rep_all = ed.get("replace_all").and_then(|v| v.as_bool()).unwrap_or(false);
                match apply_stormy_text_edit_impl(&current, old_s, new_s, rep_all, idx + 1) {
                    Ok(next) => current = next,
                    Err(e) => {
                        return (
                            false,
                            format!("Edit {} of {} failed, so no edits were applied: {}", idx + 1, edits_arr.len(), e),
                        );
                    }
                }
            }
            match fs_write(eff_root.clone(), path_arg.clone(), current) {
                Ok(_) => (
                    true,
                    append_quick_check(&eff_root, path_arg, format!("Applied {} edits to {}", edits_arr.len(), path_arg)),
                ),
                Err(e) => (false, e),
            }
        }
        "edit_file" | "edit" | "patch_file" | "replace_in_file" | "str_replace" | "str_replace_editor" => {
            match fs_read(eff_root.clone(), path_arg.clone()) {
                Ok(content) => match apply_search_replace(&content, body) {
                    Ok(updated) => match fs_write(eff_root.clone(), path_arg.clone(), updated) {
                        Ok(_) => (true, append_quick_check(&eff_root, path_arg, format!("Edited {}", path_arg))),
                        Err(e) => (false, e),
                    },
                    Err(e) => {
                        let preview: String = content.chars().take(6000).collect();
                        (
                            false,
                            format!(
                                "{}\n\nCurrent content of {}:\n{}\nRetry edit_file with exact lines from above or use write_file.",
                                e, path_arg, preview
                            ),
                        )
                    }
                },
                Err(_) => {
                    let new_body = if let Ok(created) = apply_search_replace("", body) {
                        created
                    } else if !body.contains("<<<<<<<") {
                        body.to_string()
                    } else {
                        String::new()
                    };
                    if !new_body.trim().is_empty() {
                        match fs_write(eff_root.clone(), path_arg.clone(), new_body.clone()) {
                            Ok(_) => (
                                true,
                                append_quick_check(
                                    &eff_root,
                                    path_arg,
                                    format!("Created {} ({} bytes)", path_arg, new_body.len()),
                                ),
                            ),
                            Err(e) => (false, e),
                        }
                    } else {
                        (false, format!("File not found: {}. Use write_file to create a new file.", path_arg))
                    }
                }
            }
        }
        "write_file" | "write" | "create_file" | "save_file" | "overwrite_file" | "append_file" | "sync_artboard" => {
            let mut is_append = name == "append_file";
            let mut content_to_write = body.to_string();
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(app_flag) = j.get("append").and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s.eq_ignore_ascii_case("true")))) {
                        is_append = app_flag;
                    }
                    if let Some(c) = j.get("content").or_else(|| j.get("text")).and_then(|v| v.as_str()) {
                        content_to_write = c.to_string();
                    }
                }
            }
            let final_content = if is_append {
                format!("{}{}", fs_read(eff_root.clone(), path_arg.clone()).unwrap_or_default(), content_to_write)
            } else {
                content_to_write
            };
            match fs_write(eff_root.clone(), path_arg.clone(), final_content.clone()) {
                Ok(_) => (
                    true,
                    append_quick_check(&eff_root, path_arg, format!("{} {} ({} bytes)", if is_append { "Appended to" } else { "Wrote" }, path_arg, final_content.len())),
                ),
                Err(e) => (false, e),
            }
        }
        "move_file" | "rename_file" | "mv" => {
            let mut src = path_arg.clone();
            let mut dst = body.to_string();
            let mut overwrite = false;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(s) = j.get("source").or_else(|| j.get("old_path")).or_else(|| j.get("from")).and_then(|v| v.as_str()) { src = s.to_string(); }
                    if let Some(d) = j.get("destination").or_else(|| j.get("new_path")).or_else(|| j.get("to")).and_then(|v| v.as_str()) { dst = d.to_string(); }
                    overwrite = j.get("overwrite").and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true"))).unwrap_or(false);
                }
            }
            match fs_move(eff_root.clone(), src, dst, Some(overwrite)) { Ok(msg) => (true, msg), Err(e) => (false, e) }
        }
        "delete_file" | "delete" | "remove_file" | "rm" | "del" | "unlink" => {
            let target_path = if !path_arg.is_empty() { path_arg.clone() } else { body.trim().to_string() };
            match fs_delete(eff_root.clone(), target_path) { Ok(msg) => (true, msg), Err(e) => (false, e) }
        }
        "glob" | "find_files" => {
            let mut pattern = if !body.is_empty() && !body.starts_with('{') { body.to_string() } else { path_arg.clone() };
            let mut subpath: Option<String> = if !body.is_empty() && !body.starts_with('{') && !path_arg.is_empty() { Some(path_arg.clone()) } else { None };
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(pat) = j.get("pattern").or_else(|| j.get("glob")).and_then(|v| v.as_str()) { pattern = pat.to_string(); }
                    if let Some(sp) = j.get("path").or_else(|| j.get("directory")).and_then(|v| v.as_str()) { subpath = Some(sp.to_string()); }
                }
            }
            let files = glob_workspace_files(&eff_root, &pattern, subpath.as_deref());
            if files.is_empty() { (true, format!("(0 files matched glob '{}')", pattern)) } else { (true, files.join("\n")) }
        }
        "search_project" => {
            let mut query = if !body.is_empty() { body.to_string() } else { path_arg.clone() };
            let mut limit = 8usize;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(q) = j.get("query").and_then(|v| v.as_str()) { query = q.to_string(); }
                    if let Some(l) = j.get("limit").and_then(|v| v.as_u64()) { limit = (l as usize).clamp(1, 25); }
                }
            }
            let hits = bm25_search_project(&eff_root, &query, limit);
            if hits.is_empty() {
                (true, format!("No semantic/BM25 project matches for '{}'", query))
            } else {
                let formatted = hits
                    .iter()
                    .filter_map(|h| Some(format!("## {} (lines {}-{}, score {})\n{}", h.get("path")?.as_str()?, h.get("startLine")?.as_u64()?, h.get("endLine")?.as_u64()?, h.get("score")?.as_f64()?, h.get("snippet")?.as_str()?)))
                    .collect::<Vec<_>>()
                    .join("\n\n");
                (true, formatted)
            }
        }
        "docs_lookup" => (true, docs_lookup_reference(if !body.is_empty() { body } else { path_arg.as_str() })),
        "check_syntax" | "audit_project" | "review_project" | "lint_project" => {
            let target = if !path_arg.is_empty() { Some(vec![path_arg.clone()]) } else if !body.is_empty() && !body.starts_with('{') { Some(vec![body.to_string()]) } else { None };
            let findings = audit_workspace_files(&eff_root, target.as_deref());
            if findings.is_empty() { (true, "check_syntax: 0 errors or warnings found.".to_string()) } else { (true, findings.join("\n")) }
        }
        "update_plan" | "todowrite" | "todo_write" => {
            let plan_payload = if !body.is_empty() { body } else { path_arg.as_str() };
            (true, format!("[Plan updated]\n{}", plan_payload))
        }
        "ask_user" | "ask" | "question" => {
            let q_payload = if !body.is_empty() { body } else { path_arg.as_str() };
            (true, format!("[Question presented to user]\n{}", q_payload))
        }
        "request_approval" => {
            let payload = if !body.is_empty() { body } else { path_arg.as_str() };
            (true, format!("[Approval requested from user]\n{}", payload))
        }
        "copy_file" | "cp" => {
            let mut src = path_arg.clone();
            let mut dst = body.to_string();
            let mut overwrite = true;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(s) = j.get("source").or_else(|| j.get("from")).or_else(|| j.get("path")).and_then(|v| v.as_str()) {
                        src = s.to_string();
                    }
                    if let Some(d) = j.get("destination").or_else(|| j.get("to")).or_else(|| j.get("target")).and_then(|v| v.as_str()) {
                        dst = d.to_string();
                    }
                    overwrite = j.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(true);
                }
            }
            match (safe_join(&eff_root, &src), safe_join(&eff_root, &dst)) {
                (Ok(s_path), Ok(d_path)) => {
                    if !s_path.exists() {
                        (false, format!("copy_file: source '{}' not found", src))
                    } else if d_path.exists() && !overwrite {
                        (false, format!("copy_file: destination '{}' already exists", dst))
                    } else {
                        if let Some(p) = d_path.parent() {
                            let _ = std::fs::create_dir_all(p);
                        }
                        match std::fs::copy(&s_path, &d_path) {
                            Ok(bytes) => (true, format!("Copied {} -> {} ({} bytes)", src, dst, bytes)),
                            Err(e) => (false, format!("copy_file failed: {}", e)),
                        }
                    }
                }
                (Err(e), _) | (_, Err(e)) => (false, e),
            }
        }
        "create_folder" | "mkdir" | "create_directory" => {
            let target = if !path_arg.is_empty() { path_arg.clone() } else { body.trim().to_string() };
            match safe_join(&eff_root, &target) {
                Ok(dir_path) => match std::fs::create_dir_all(&dir_path) {
                    Ok(_) => (true, format!("Created folder {}", target)),
                    Err(e) => (false, format!("create_folder failed: {}", e)),
                },
                Err(e) => (false, e),
            }
        }
        "insert_at_line" => {
            let mut target = path_arg.clone();
            let mut line_num = inv.start_line.unwrap_or(1).max(1);
            let mut text_to_insert = body.to_string();
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                        target = p.to_string();
                    }
                    if let Some(ln) = j.get("line").and_then(|v| v.as_u64()) {
                        line_num = (ln as usize).max(1);
                    }
                    if let Some(c) = j.get("content").or_else(|| j.get("text")).and_then(|v| v.as_str()) {
                        text_to_insert = c.to_string();
                    }
                }
            }
            match fs_read(eff_root.clone(), target.clone()) {
                Ok(existing) => {
                    let mut lines: Vec<&str> = existing.lines().collect();
                    let idx = (line_num - 1).min(lines.len());
                    let insert_lines: Vec<&str> = text_to_insert.lines().collect();
                    for (offset, il) in insert_lines.iter().enumerate() {
                        lines.insert(idx + offset, il);
                    }
                    let updated = lines.join("\n") + if existing.ends_with('\n') { "\n" } else { "" };
                    match fs_write(eff_root.clone(), target.clone(), updated) {
                        Ok(_) => (
                            true,
                            append_quick_check(
                                &eff_root,
                                &target,
                                format!("Inserted {} line(s) at line {} in {}", insert_lines.len(), line_num, target),
                            ),
                        ),
                        Err(e) => (false, e),
                    }
                }
                Err(e) => (false, e),
            }
        }
        "append_to_file" | "prepend_to_file" => {
            let is_prepend = name == "prepend_to_file";
            let mut target = path_arg.clone();
            let mut add_text = body.to_string();
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                        target = p.to_string();
                    }
                    if let Some(c) = j.get("content").or_else(|| j.get("text")).and_then(|v| v.as_str()) {
                        add_text = c.to_string();
                    }
                }
            }
            let existing = fs_read(eff_root.clone(), target.clone()).unwrap_or_default();
            let updated = if is_prepend {
                format!("{}\n{}", add_text, existing)
            } else if existing.is_empty() || existing.ends_with('\n') {
                format!("{}{}", existing, add_text)
            } else {
                format!("{}\n{}", existing, add_text)
            };
            match fs_write(eff_root.clone(), target.clone(), updated) {
                Ok(_) => (
                    true,
                    append_quick_check(
                        &eff_root,
                        &target,
                        format!("{} {}", if is_prepend { "Prepended to" } else { "Appended to" }, target),
                    ),
                ),
                Err(e) => (false, e),
            }
        }
        "regex_replace" => {
            let mut target = path_arg.clone();
            let mut pat = String::new();
            let mut rep = String::new();
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                        target = p.to_string();
                    }
                    pat = j.get("pattern").or_else(|| j.get("search")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    rep = j.get("replacement").or_else(|| j.get("replace")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                }
            }
            match fs_read(eff_root.clone(), target.clone()) {
                Ok(existing) => match apply_stormy_text_edit_impl(&existing, &pat, &rep, true, 1) {
                    Ok(updated) => match fs_write(eff_root.clone(), target.clone(), updated) {
                        Ok(_) => (true, append_quick_check(&eff_root, &target, format!("Replaced pattern in {}", target))),
                        Err(e) => (false, e),
                    },
                    Err(e) => (false, e),
                },
                Err(e) => (false, e),
            }
        }
        "get_file_info" | "file_info" | "file_outline" | "stat" => {
            let target = if !path_arg.is_empty() { path_arg.clone() } else { body.trim().to_string() };
            match safe_join(&eff_root, &target) {
                Ok(full) => {
                    if !full.exists() {
                        (false, format!("File not found: {}", target))
                    } else {
                        let meta = std::fs::metadata(&full).ok();
                        let bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                        let outline = project_outline_of(&full).unwrap_or_else(|| format!("{} bytes", bytes));
                        (true, format!("File: {}\nSize: {} bytes\nOutline: {}", target, bytes, outline))
                    }
                }
                Err(e) => (false, e),
            }
        }
        "diff_files" | "compare_files" => {
            let mut p1 = path_arg.clone();
            let mut p2 = body.trim().to_string();
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    p1 = j.get("path1").or_else(|| j.get("source")).and_then(|v| v.as_str()).unwrap_or(&p1).to_string();
                    p2 = j.get("path2").or_else(|| j.get("destination")).and_then(|v| v.as_str()).unwrap_or(&p2).to_string();
                }
            }
            match (fs_read(eff_root.clone(), p1.clone()), fs_read(eff_root.clone(), p2.clone())) {
                (Ok(c1), Ok(c2)) => {
                    if c1 == c2 {
                        (true, format!("Files {} and {} are identical.", p1, p2))
                    } else {
                        let l1: Vec<&str> = c1.lines().collect();
                        let l2: Vec<&str> = c2.lines().collect();
                        let mut out = format!("--- {}\n+++ {}\n", p1, p2);
                        let max_l = l1.len().max(l2.len()).min(150);
                        for i in 0..max_l {
                            match (l1.get(i), l2.get(i)) {
                                (Some(a), Some(b)) if a != b => {
                                    out.push_str(&format!("-{:>4}| {}\n+{:>4}| {}\n", i + 1, a, i + 1, b));
                                }
                                (Some(a), None) => out.push_str(&format!("-{:>4}| {}\n", i + 1, a)),
                                (None, Some(b)) => out.push_str(&format!("+{:>4}| {}\n", i + 1, b)),
                                _ => {}
                            }
                        }
                        (true, out)
                    }
                }
                (Err(e), _) | (_, Err(e)) => (false, e),
            }
        }
        "git_status" | "git_diff" | "git_log" | "git_branch" | "git_stage" | "git_unstage" | "git_commit" => {
            let git_cmd = match name {
                "git_status" => "git status -sb".to_string(),
                "git_diff" => {
                    let target = if !path_arg.is_empty() { path_arg.as_str() } else { body };
                    if target.is_empty() || target.starts_with('{') {
                        "git diff --stat && git diff".to_string()
                    } else {
                        format!("git diff -- \"{}\"", target.replace('"', ""))
                    }
                }
                "git_log" => "git log --oneline -n 15".to_string(),
                "git_branch" => "git branch -a".to_string(),
                "git_stage" => {
                    let target = if !path_arg.is_empty() { path_arg.as_str() } else if !body.is_empty() { body } else { "." };
                    format!("git add -- \"{}\"", target.replace('"', ""))
                }
                "git_unstage" => {
                    let target = if !path_arg.is_empty() { path_arg.as_str() } else { body };
                    format!("git reset HEAD -- \"{}\"", target.replace('"', ""))
                }
                "git_commit" => {
                    let mut msg = if !body.is_empty() { body.to_string() } else { path_arg.clone() };
                    if body.starts_with('{') && body.ends_with('}') {
                        if let Ok(j) = serde_json::from_str::<Value>(body) {
                            if let Some(m) = j.get("message").or_else(|| j.get("title")).and_then(|v| v.as_str()) {
                                msg = m.to_string();
                            }
                        }
                    }
                    format!("git commit -m \"{}\"", msg.replace('"', "'"))
                }
                _ => "git status -sb".to_string(),
            };
            match crate::workspace::shell_run_as(eff_root.to_string(), git_cmd, "agent") {
                Ok(v) => format_exec_result(&v),
                Err(e) => (false, e),
            }
        }
        "security_scan" | "find_secrets" | "audit_security" => {
            let target = if !path_arg.is_empty() { Some(vec![path_arg.clone()]) } else { None };
            let issues = scan_workspace_security(&eff_root, target.as_deref());
            if issues.is_empty() {
                (true, "security_scan: 0 hardcoded secrets or high-risk patterns found.".to_string())
            } else {
                (true, issues.join("\n"))
            }
        }
        "search_code" | "grep" | "rg" | "search" | "search_files" | "ripgrep" | "find_in_files" => {
            let mut query = if !body.is_empty() { body.to_string() } else { path_arg.clone() };
            let mut sub_dir = if !body.is_empty() && !path_arg.is_empty() { path_arg.clone() } else { String::new() };
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(p) = j.get("pattern").or_else(|| j.get("query")).or_else(|| j.get("search")).and_then(|v| v.as_str()) { query = p.to_string(); }
                    if let Some(sp) = j.get("path").or_else(|| j.get("directory")).and_then(|v| v.as_str()) { sub_dir = sp.to_string(); }
                }
            }
            let search_root = if !sub_dir.trim().is_empty() && sub_dir.trim() != "." {
                safe_join(&eff_root, sub_dir.trim()).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| eff_root.clone())
            } else {
                eff_root.clone()
            };
            let results = search_workspace_code(&search_root, &query, 30);
            if results.is_empty() {
                (true, format!("No matches found for '{}'", query))
            } else {
                let prefix = if !sub_dir.trim().is_empty() && sub_dir.trim() != "." && search_root != eff_root {
                    format!("{}/", sub_dir.trim().trim_end_matches('/'))
                } else {
                    String::new()
                };
                let formatted = results
                    .iter()
                    .filter_map(|r| Some(format!("{}{}:{}: {}", prefix, r.get("path")?.as_str()?, r.get("line")?.as_u64()?, r.get("snippet")?.as_str()?)))
                    .collect::<Vec<_>>()
                    .join("\n");
                (true, formatted)
            }
        }
        "list_dir" | "ls" | "dir" | "list_files" | "list_directory" | "print_tree" | "tree" => {
            let p = Path::new(&eff_root);
            let mut trimmed_arg = path_arg.trim().to_string();
            let mut symbols = false;
            let mut depth = 2usize;
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(pa) = j.get("path").or_else(|| j.get("directory")).and_then(|v| v.as_str()) {
                        if trimmed_arg.is_empty() { trimmed_arg = pa.trim().to_string(); }
                    }
                    symbols = j.get("symbols").and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true"))).unwrap_or(false);
                    if let Some(d) = j.get("depth").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))) {
                        depth = (d as usize).clamp(1, 6);
                    }
                }
            }
            let target_res = if trimmed_arg.is_empty() || trimmed_arg == "." || trimmed_arg == "./" || trimmed_arg == ".\\" {
                Ok(p.to_path_buf())
            } else {
                safe_join(&eff_root, &trimmed_arg)
            };
            match target_res {
                Err(e) => (false, e),
                Ok(target) => {
                    let tree = walk_workspace(p, &target, depth);
                    if tree.is_empty() {
                        (true, "Directory is empty (0 files). Proceed directly without re-listing.".to_string())
                    } else if symbols {
                        fn format_tree_with_symbols(base: &Path, nodes: &[FileNode], indent: usize, out: &mut String) {
                            let pad = "  ".repeat(indent);
                            for n in nodes {
                                if n.dir {
                                    out.push_str(&format!("{}{}/\n", pad, n.name));
                                    if let Some(children) = &n.children { format_tree_with_symbols(base, children, indent + 1, out); }
                                } else {
                                    let outline = project_outline_of(&base.join(&n.path)).map(|s| format!(" — {}", s)).unwrap_or_default();
                                    out.push_str(&format!("{}{}{}\n", pad, n.name, outline));
                                }
                            }
                        }
                        let mut out = String::new();
                        format_tree_with_symbols(p, &tree, 0, &mut out);
                        (true, out.trim_end().to_string())
                    } else {
                        let mut out = String::new();
                        format_tree_compact(&tree, 0, &mut out);
                        (true, out.trim_end().to_string())
                    }
                }
            }
        }
        "shell" | "bash" | "sh" | "cmd" | "terminal" | "exec" | "run_command" | "run" => {
            let mut cmd_str = if !body.is_empty() { body.to_string() } else { path_arg.clone() };
            for prefix in [
                "cd /workspace 2>/dev/null || cd /app && ",
                "cd /app && ",
                "cd /home/app && ",
                "cd /workspace && ",
                "cd /app; ",
                "cd /home/app; ",
                "cd /workspace; ",
            ] {
                if let Some(rest) = cmd_str.trim_start().strip_prefix(prefix) {
                    if !Path::new("/app").exists() {
                        cmd_str = rest.to_string();
                        break;
                    }
                }
            }
            match crate::workspace::shell_run_as(eff_root.to_string(), cmd_str, "agent") {
                Ok(v) => format_exec_result(&v),
                Err(e) => (false, e),
            }
        }
        "python" | "python3" | "py" | "python_exec" | "run_python" => {
            let script = if !body.is_empty() { body.to_string() } else { path_arg.clone() };
            match python_run(eff_root.clone(), script) {
                Ok(v) => format_exec_result(&v),
                Err(e) => (false, e),
            }
        }
        "web_fetch" | "fetch" | "curl" | "webfetch" => {
            let target_url = if !path_arg.is_empty() { path_arg.as_str() } else { body };
            match reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .and_then(|c| c.get(target_url).send())
                .and_then(|r| r.text())
            {
                Ok(txt) => {
                    let readable = if txt.contains('<') { html_to_text(&txt) } else { txt };
                    (true, readable.chars().take(16000).collect::<String>())
                }
                Err(e) => (false, format!("web_fetch failed: {}", e)),
            }
        }
        "memory_search" | "memory_list" | "memory_get" | "memory_read" => {
            let store = crate::memory::MemoryStore::default();
            let cat = if matches!(path_arg.as_str(), "preferences" | "profile" | "topics" | "areas" | "all") {
                Some(path_arg.as_str())
            } else {
                None
            };
            let query = if !body.is_empty() {
                body
            } else if cat.is_none() {
                path_arg.as_str()
            } else {
                ""
            };
            let hits = store.search(query, cat, None);
            if hits.is_empty() {
                (true, "No matching memory entries found.".to_string())
            } else {
                let formatted = hits
                    .iter()
                    .take(30)
                    .map(|m| format!("{} | [{}] {}", m.id, m.category, m.text))
                    .collect::<Vec<_>>()
                    .join("\n");
                (true, formatted)
            }
        }
        "memory" | "memory_save" | "memory_add" | "memory_set" => {
            if body.trim().is_empty() || body.trim() == "{}" {
                (
                    false,
                    "memory_save error: content body is empty. Emit <zeus_tool name=\"memory_save\" path=\"preferences\">exact fact to save</zeus_tool>.".to_string(),
                )
            } else {
                let store = crate::memory::MemoryStore::default();
                let cat = if !path_arg.is_empty() {
                    Some(path_arg.clone())
                } else {
                    Some("preferences".to_string())
                };
                let items = store.add(body.to_string(), cat, None);
                let latest_id = items.last().map(|m| m.id.as_str()).unwrap_or("mem");
                (true, format!("Saved memory {} ({} total items)", latest_id, items.len()))
            }
        }
        "memory_edit" | "memory_update" => {
            if body.trim().is_empty() || body.trim() == "{}" {
                (
                    false,
                    format!(
                        "memory_edit error: updated text is empty. Emit <zeus_tool name=\"memory_edit\" path=\"{}\">updated text</zeus_tool>.",
                        path_arg
                    ),
                )
            } else {
                let store = crate::memory::MemoryStore::default();
                match store.update(path_arg, body.to_string(), None) {
                    Ok(items) => (true, format!("Updated memory '{}' ({} total items)", path_arg, items.len())),
                    Err(e) => (false, e),
                }
            }
        }
        "memory_delete" | "memory_remove" | "memory_forget" => {
            let store = crate::memory::MemoryStore::default();
            let target = if !path_arg.is_empty() { path_arg.as_str() } else { body };
            let items = store.remove(target);
            (true, format!("Removed memory '{}' ({} total items remaining)", target, items.len()))
        }
        "load_skill" | "use_skill" | "get_skill" | "read_skill" | "skill" => {
            let mut skill_name = if !path_arg.is_empty() { path_arg.trim().to_string() } else { body.trim().to_string() };
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(n) = j.get("name").or_else(|| j.get("skill")).or_else(|| j.get("topic")).and_then(|v| v.as_str()) {
                        skill_name = n.trim().to_string();
                    }
                }
            }
            let slug = skill_name.to_lowercase().replace('_', "-");
            let zeus_rel = format!(".zeusdesigns/harness/skills/{}/SKILL.md", skill_name);
            let oro_rel = format!(".oro/skills/{}.md", slug);
            if let Ok(custom_skill) = fs_read(eff_root.clone(), zeus_rel).or_else(|_| fs_read(eff_root.clone(), oro_rel)) {
                (true, format!("[Skill '{}']\n{}", skill_name, custom_skill))
            } else {
                let builtin = match slug.as_str() {
                    "bug-hunt-verify" => "1. Read the failing test or target module directly with read_file or search_code.\n2. Identify the exact mathematical/logical mismatch.\n3. Patch in one pass with edit_file or write_file.\n4. Run the verification command via shell or python and confirm exit code 0.",
                    "python-data-pipeline" => "1. Run a single <zeus_tool name=\"python\"> script that reads the input file, deduplicates/filters/aggregates in memory, writes the output file, and prints a verification summary.",
                    "multi-file-refactor" => "1. Inspect coupled modules first.\n2. Update each file deterministically and run the test suite before finishing.",
                    _ => "Proceed directly with shell, python, read_file, edit_file, or write_file to complete the task.",
                };
                (true, format!("[Skill '{}']\n{}", skill_name, builtin))
            }
        }
        "add_ui_kit" | "install_ui_kit" => {
            let kit_css = ":root { --surface: #141318; --surface-low: #1c1b20; --surface-high: #2b2930; --on-surface: #e6e1e9; --primary: #d0bcff; --on-primary: #381e72; --outline-variant: #49454f; }\n* { box-sizing: border-box; }\nbody { margin: 0; background: var(--surface); color: var(--on-surface); font-family: system-ui, sans-serif; }\n";
            let kit_js = "window.OroUI = { toggleTheme() { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; } };\n";
            let _ = fs_write(eff_root.clone(), "oro-ui/oro.css".to_string(), kit_css.to_string());
            let _ = fs_write(eff_root.clone(), "oro-ui/oro.js".to_string(), kit_js.to_string());
            (true, "Installed UI kit:\n- oro-ui/oro.css\n- oro-ui/oro.js".to_string())
        }
        "subagent" | "spawn_subagent" | "task" => {
            let mut agent_type = "explore".to_string();
            let mut target_q = if !body.is_empty() { body.to_string() } else { path_arg.clone() };
            if body.starts_with('{') && body.ends_with('}') {
                if let Ok(j) = serde_json::from_str::<Value>(body) {
                    if let Some(at) = j.get("agent_type").or_else(|| j.get("type")).and_then(|v| v.as_str()) {
                        agent_type = at.to_string();
                    }
                    if let Some(pr) = j.get("prompt").or_else(|| j.get("task")).or_else(|| j.get("query")).and_then(|v| v.as_str()) {
                        target_q = pr.to_string();
                    }
                }
            }
            if agent_type.eq_ignore_ascii_case("review") {
                let issues = audit_workspace_files(&eff_root, None);
                if issues.is_empty() {
                    (true, "[Subagent (review) Summary]\nStatic audit passed with 0 errors or warnings.".to_string())
                } else {
                    (true, format!("[Subagent (review) Summary]\n{}", issues.join("\n")))
                }
            } else {
                let bm25_hits = bm25_search_project(&eff_root, &target_q, 8);
                if !bm25_hits.is_empty() {
                    let formatted = bm25_hits
                        .iter()
                        .filter_map(|h| {
                            Some(format!(
                                "- {} (lines {}-{}): {}",
                                h.get("path")?.as_str()?,
                                h.get("startLine")?.as_u64()?,
                                h.get("endLine")?.as_u64()?,
                                h.get("snippet")?.as_str()?.replace('\n', " ")
                            ))
                        })
                        .collect::<Vec<_>>()
                        .join("\n");
                    (true, format!("[Subagent ({}) Summary for '{}']\n{}", agent_type, target_q, formatted))
                } else {
                    let tree = walk_workspace(Path::new(&eff_root), Path::new(&eff_root), 2);
                    let mut out = String::new();
                    format_tree_compact(&tree, 0, &mut out);
                    (true, format!("[Subagent ({}) Summary]\nWorkspace files:\n{}", agent_type, out.trim_end()))
                }
            }
        }
        "lmfingerprint" | "verify_model" | "model_fingerprint" => {
            let target = if !path_arg.is_empty() { path_arg.trim() } else { body.trim() };
            let (prov, mdl) = if let Some((p, m)) = target.split_once('/') {
                (p.trim(), m.trim())
            } else if !target.is_empty() {
                (target, "")
            } else {
                ("gemini4", "gemini-4-hydrogen")
            };
            let temp_engine = ProviderEngine::default();
            match verify_model_fingerprint(&temp_engine, prov, mdl) {
                Ok(rep) => (
                    true,
                    format!(
                        "[LMFingerprint Verification Report]\nProvider: {}\nRequested Model: {}\nClaimed Family: {}\nDetected Family: {}\nUpstream Endpoint: {}\nUpstream Reported Model: {}\nProtocol Signature: {}\nVerdict: {} ({})\nCanary (17*23=391): {}\nNative Reasoning: {}\nLatency: {} ms ({} tok/s)\nFingerprint Hash: {}\nSelf-Report: {}\nSummary: {}",
                        rep.provider, rep.requested_model, rep.claimed_family, rep.detected_family,
                        rep.upstream_endpoint, rep.upstream_reported_model, rep.protocol_signature,
                        rep.verdict, rep.verdict_label, if rep.canary_passed { "PASS" } else { "PARTIAL" },
                        if rep.has_native_reasoning { "YES" } else { "NO" }, rep.latency_ms, rep.tokens_per_sec,
                        rep.fingerprint_hash, rep.self_report, rep.explanation
                    ),
                ),
                Err(e) => (false, format!("LMFingerprint probe error: {}", e)),
            }
        }
        other if other.starts_with("mcp:") => crate::mcp::McpRegistry::default().invoke_tool(other, body),
        _ => (
            false,
            format!(
                "Unknown tool '{}'. Valid tools: shell (bash), python, read_file, write_file, edit_file, multi_edit, list_dir, glob, grep, search_code, search_project, check_syntax, web_fetch, memory_search, memory_save, memory_edit, memory_delete, load_skill, subagent, lmfingerprint.",
                name
            ),
        ),
    }
}
