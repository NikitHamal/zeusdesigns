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

/* ------------------------------------------------------------------ */
/* Shared terminal session: one cwd per project root, used by both the */
/* Terminal panel (source "user") and the agent (source "agent").      */
/* Agent runs are mirrored to the UI through the `zeus://term` event.  */
/* ------------------------------------------------------------------ */
static TERM_APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();
static TERM_CWD: std::sync::OnceLock<Mutex<std::collections::HashMap<String, PathBuf>>> = std::sync::OnceLock::new();
static TERM_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
