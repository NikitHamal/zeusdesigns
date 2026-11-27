fn shell_exec(root: &str, base: &Path, mut clean_cmd: String, id: &str, source: &str, timeout: std::time::Duration) -> Result<Value, String> {
    use crate::shell::{self, Kind};
    let key = root.to_string();
    let sh = shell::default_shell();
    let mut workdir = term_cwd_map()
        .lock()
        .ok()
        .and_then(|m| m.get(&key).cloned())
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| base.to_path_buf());

    if clean_cmd.is_empty() || matches!(clean_cmd.to_ascii_lowercase().as_str(), "pause" | "cmd" | "cmd.exe" | "powershell" | "powershell.exe" | "pwsh" | "bash" | "sh") {
        return Ok(json!({
            "code": 0,
            "stdout": format!("({} ready; pass a specific command to run)", sh.label()),
            "stderr": "",
            "cwd": workdir.to_string_lossy()
        }));
    }

    // A bare `cd <dir>` just moves the shared session; real shells handle `cd x && cmd` themselves
    // (the final directory is read back after the run).
    if let Some((dir, rest)) = split_leading_cd(&clean_cmd).filter(|(_, r)| r.is_empty() || sh.kind == Kind::Cmd) {
        if dir.is_empty() || dir == "~" {
            if rest.is_empty() {
                return Ok(json!({ "code": 0, "stdout": workdir.to_string_lossy(), "stderr": "", "cwd": workdir.to_string_lossy() }));
            }
        } else {
            let target = {
                let p = PathBuf::from(&dir);
                if p.is_absolute() { p } else { workdir.join(&dir) }
            };
            match target.canonicalize() {
                Ok(t) if t.is_dir() => {
                    #[allow(unused_mut)]
                    let mut t = t;
                    #[cfg(target_os = "windows")]
                    {
                        let s = t.to_string_lossy().to_string();
                        if let Some(stripped) = s.strip_prefix("\\\\?\\") {
                            t = PathBuf::from(stripped);
                        }
                    }
                    workdir = t.clone();
                    if let Ok(mut m) = term_cwd_map().lock() {
                        m.insert(key.clone(), t);
                    }
                    if rest.is_empty() {
                        return Ok(json!({ "code": 0, "stdout": "", "stderr": "", "cwd": workdir.to_string_lossy() }));
                    }
                    clean_cmd = rest;
                }
                _ => {
                    return Ok(json!({
                        "code": 1,
                        "stdout": "",
                        "stderr": format!("cd: no such directory: {}", dir),
                        "cwd": workdir.to_string_lossy()
                    }));
                }
            }
        }
    }

    // cmd.exe has no rg/find/grep/ls: a small in-process POSIX layer covers the common ones.
    if sh.kind == Kind::Cmd {
        if let Some(mut builtin_res) = try_builtin_posix_shell(&workdir, &clean_cmd) {
            if let Some(o) = builtin_res.as_object_mut() {
                o.insert("cwd".to_string(), json!(workdir.to_string_lossy()));
            }
            return Ok(builtin_res);
        }
    }

    let mirror = source == "agent";
    let shown_cmd = clean_cmd.clone();
    let root_owned = root.to_string();
    let on_chunk = |t: &str| {
        if mirror {
            term_emit(json!({ "id": id, "root": root_owned, "cmd": shown_cmd, "source": source, "running": true, "chunk": t }));
        }
    };
    let out = shell::exec(&sh, &clean_cmd, &workdir, timeout, id, &on_chunk)?;
    if let Some(nc) = &out.cwd {
        workdir = nc.clone();
        if let Ok(mut m) = term_cwd_map().lock() {
            m.insert(key, nc.clone());
        }
    }
    Ok(json!({
        "code": out.code,
        "stdout": out.stdout,
        "stderr": out.stderr,
        "cwd": workdir.to_string_lossy(),
        "timedOut": out.timed_out,
        "cancelled": out.cancelled,
        "shell": sh.label()
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


pub fn project_outline_of_impl(path: &Path) -> Option<String> {
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
pub fn glob_workspace_files_impl(root: &str, pattern: &str, subpath: Option<&str>) -> Vec<String> {
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
pub fn audit_workspace_files_impl(root: &str, target_paths: Option<&[String]>) -> Vec<String> {
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
pub fn bm25_search_project_impl(root: &str, query: &str, limit: usize) -> Vec<Value> {
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
pub fn docs_lookup_reference_impl(query: &str) -> String {
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
