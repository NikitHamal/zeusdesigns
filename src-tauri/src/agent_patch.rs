//! OpenCode `apply_patch`: multi-file `*** Begin Patch` parser and applier
//! (`*** Add File:`, `*** Update File:`, `*** Move to:`, `*** Delete File:`, `*** End of File`).
use crate::workspace::{fs_delete, fs_read, fs_write};
use serde_json::{json, Value};

#[derive(Debug, Clone, Default)]
pub struct Chunk {
    pub context: Option<String>,
    pub old: Vec<String>,
    pub new: Vec<String>,
    pub eof: bool,
}

#[derive(Debug, Clone)]
pub enum Hunk {
    Add { path: String, content: String },
    Delete { path: String },
    Update { path: String, move_to: Option<String>, chunks: Vec<Chunk> },
}

pub fn parse_patch(text: &str) -> Result<Vec<Hunk>, String> {
    let lines: Vec<&str> = text.lines().collect();
    let begin = lines
        .iter()
        .position(|l| l.trim() == "*** Begin Patch")
        .ok_or_else(|| "apply_patch: patch must start with '*** Begin Patch'".to_string())?;
    let end = lines[begin + 1..].iter().position(|l| l.trim() == "*** End Patch").map(|p| begin + 1 + p).unwrap_or(lines.len());
    let mut hunks = Vec::new();
    let mut i = begin + 1;
    while i < end {
        let line = lines[i].trim_end();
        if let Some(p) = line.strip_prefix("*** Add File: ") {
            i += 1;
            let mut content = String::new();
            while i < end && lines[i].starts_with('+') {
                content.push_str(&lines[i][1..]);
                content.push('\n');
                i += 1;
            }
            hunks.push(Hunk::Add { path: p.trim().to_string(), content });
        } else if let Some(p) = line.strip_prefix("*** Delete File: ") {
            hunks.push(Hunk::Delete { path: p.trim().to_string() });
            i += 1;
        } else if let Some(p) = line.strip_prefix("*** Update File: ") {
            let path = p.trim().to_string();
            i += 1;
            let mut move_to = None;
            if i < end {
                if let Some(m) = lines[i].trim_end().strip_prefix("*** Move to: ") {
                    move_to = Some(m.trim().to_string());
                    i += 1;
                }
            }
            let mut chunks: Vec<Chunk> = Vec::new();
            let mut cur = Chunk::default();
            let mut cur_has = false;
            while i < end {
                let l = lines[i];
                if l.trim_end() == "*** End of File" {
                    cur.eof = true;
                    i += 1;
                    continue;
                }
                if l.starts_with("*** ") {
                    break;
                }
                if l.starts_with("@@") {
                    if cur_has || cur.context.is_some() {
                        chunks.push(std::mem::take(&mut cur));
                    }
                    cur_has = false;
                    let ctx = l[2..].trim();
                    cur.context = if ctx.is_empty() { None } else { Some(ctx.to_string()) };
                    i += 1;
                    continue;
                }
                match l.chars().next() {
                    Some(' ') => {
                        cur.old.push(l[1..].to_string());
                        cur.new.push(l[1..].to_string());
                    }
                    Some('+') => cur.new.push(l[1..].to_string()),
                    Some('-') => cur.old.push(l[1..].to_string()),
                    None => {
                        cur.old.push(String::new());
                        cur.new.push(String::new());
                    }
                    Some(_) => return Err(format!("apply_patch: invalid line in update of {}: '{}' (lines must start with ' ', '+', '-' or '@@')", path, l)),
                }
                cur_has = true;
                i += 1;
            }
            if cur_has || cur.context.is_some() {
                chunks.push(cur);
            }
            if chunks.is_empty() && move_to.is_none() {
                return Err(format!("apply_patch: Update File '{}' has no changes", path));
            }
            hunks.push(Hunk::Update { path, move_to, chunks });
        } else if line.trim().is_empty() {
            i += 1;
        } else {
            return Err(format!("apply_patch: unexpected line '{}' (expected *** Add File / Update File / Delete File)", line));
        }
    }
    if hunks.is_empty() {
        return Err("apply_patch: patch contains no file operations".to_string());
    }
    Ok(hunks)
}

pub fn patch_paths(text: &str) -> Vec<String> {
    let mut v = Vec::new();
    if let Ok(h) = parse_patch(text) {
        for x in h {
            match x {
                Hunk::Add { path, .. } | Hunk::Delete { path } => v.push(path),
                Hunk::Update { path, move_to, .. } => {
                    v.push(path);
                    if let Some(m) = move_to {
                        v.push(m);
                    }
                }
            }
        }
    }
    v
}

fn norm(s: &str) -> String {
    s.trim()
        .chars()
        .map(|c| match c {
            '\u{2010}'..='\u{2015}' | '\u{2212}' => '-',
            '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}' => '\'',
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => '"',
            '\u{00A0}' | '\u{2002}'..='\u{200A}' | '\u{202F}' | '\u{205F}' | '\u{3000}' => ' ',
            c => c,
        })
        .collect()
}

fn seek_from(lines: &[String], pat: &[String], from: usize) -> Option<usize> {
    if pat.is_empty() {
        return Some(from);
    }
    if pat.len() > lines.len() {
        return None;
    }
    let last = lines.len() - pat.len();
    for pass in 0..4 {
        for i in from..=last {
            let ok = pat.iter().enumerate().all(|(j, p)| {
                let l = &lines[i + j];
                match pass {
                    0 => l == p,
                    1 => l.trim_end() == p.trim_end(),
                    2 => l.trim() == p.trim(),
                    _ => norm(l) == norm(p),
                }
            });
            if ok {
                return Some(i);
            }
        }
    }
    None
}

fn seek_sequence(lines: &[String], pat: &[String], start: usize, eof: bool) -> Option<usize> {
    if eof && lines.len() >= pat.len() {
        if let Some(i) = seek_from(lines, pat, lines.len() - pat.len()) {
            return Some(i);
        }
    }
    seek_from(lines, pat, start)
}

pub fn derive_new_contents(path: &str, original: &str, chunks: &[Chunk]) -> Result<String, String> {
    let crlf = original.contains("\r\n");
    let src = original.replace("\r\n", "\n");
    let mut lines: Vec<String> = src.split('\n').map(String::from).collect();
    if lines.last().map(|s| s.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    let mut reps: Vec<(usize, usize, Vec<String>)> = Vec::new();
    let mut idx = 0usize;
    for ch in chunks {
        if let Some(ctx) = &ch.context {
            match seek_sequence(&lines, &[ctx.clone()], idx, false) {
                Some(p) => idx = p + 1,
                None => return Err(format!("apply_patch: failed to find context '{}' in {}", ctx, path)),
            }
        }
        if ch.old.is_empty() {
            reps.push((lines.len(), 0, ch.new.clone()));
            continue;
        }
        let mut pat: &[String] = &ch.old;
        let mut new: &[String] = &ch.new;
        let mut found = seek_sequence(&lines, pat, idx, ch.eof);
        if found.is_none() && pat.last().map(|s| s.is_empty()).unwrap_or(false) {
            pat = &pat[..pat.len() - 1];
            if new.last().map(|s| s.is_empty()).unwrap_or(false) {
                new = &new[..new.len() - 1];
            }
            found = seek_sequence(&lines, pat, idx, ch.eof);
        }
        match found {
            Some(s) => {
                reps.push((s, pat.len(), new.to_vec()));
                idx = s + pat.len();
            }
            None => return Err(format!("apply_patch: failed to find expected lines in {}:\n{}", path, ch.old.join("\n"))),
        }
    }
    reps.sort_by_key(|r| r.0);
    for (s, n, new) in reps.into_iter().rev() {
        lines.splice(s..s + n, new);
    }
    let mut out = lines.join("\n");
    out.push('\n');
    if crlf {
        out = out.replace('\n', "\r\n");
    }
    Ok(out)
}

struct Planned {
    path: String,
    dest: Option<String>,
    old: Option<String>,
    new: Option<String>,
    kind: &'static str,
}

/// Returns `(ok, summary, files[])`. All hunks are validated before any file is written.
pub fn apply_patch(root: &str, patch: &str) -> (bool, String, Vec<Value>) {
    let hunks = match parse_patch(patch) {
        Ok(h) => h,
        Err(e) => return (false, e, vec![]),
    };
    let mut plan: Vec<Planned> = Vec::new();
    for h in hunks {
        match h {
            Hunk::Add { path, content } => {
                let old = fs_read(root.to_string(), path.clone()).ok();
                plan.push(Planned { path, dest: None, old, new: Some(content), kind: "add" });
            }
            Hunk::Delete { path } => match fs_read(root.to_string(), path.clone()) {
                Ok(old) => plan.push(Planned { path, dest: None, old: Some(old), new: None, kind: "delete" }),
                Err(e) => return (false, format!("apply_patch: cannot delete {}: {}", path, e), vec![]),
            },
            Hunk::Update { path, move_to, chunks } => {
                let old = match fs_read(root.to_string(), path.clone()) {
                    Ok(o) => o,
                    Err(e) => return (false, format!("apply_patch: cannot read {}: {}", path, e), vec![]),
                };
                let new = if chunks.is_empty() { old.clone() } else {
                    match derive_new_contents(&path, &old, &chunks) {
                        Ok(n) => n,
                        Err(e) => return (false, e, vec![]),
                    }
                };
                let kind = if move_to.is_some() { "move" } else { "update" };
                plan.push(Planned { path, dest: move_to, old: Some(old), new: Some(new), kind });
            }
        }
    }
    let mut summary = Vec::new();
    let mut files = Vec::new();
    for p in &plan {
        let target = p.dest.clone().unwrap_or_else(|| p.path.clone());
        let res = match (&p.new, p.kind) {
            (Some(c), _) => fs_write(root.to_string(), target.clone(), c.clone()).map(|_| ()),
            (None, _) => fs_delete(root.to_string(), p.path.clone()).map(|_| ()),
        };
        if let Err(e) = res {
            return (false, format!("apply_patch: failed writing {}: {} (earlier hunks in this patch may already be applied)", target, e), files);
        }
        if p.kind == "move" {
            let _ = fs_delete(root.to_string(), p.path.clone());
        }
        let tag = match p.kind {
            "add" => "A",
            "delete" => "D",
            "move" => "R",
            _ => "M",
        };
        summary.push(if p.kind == "move" { format!("R {} -> {}", p.path, target) } else { format!("{} {}", tag, target) });
        files.push(json!({
            "path": target,
            "from": p.path,
            "kind": p.kind,
            "oldContent": p.old.as_ref().map(|s| s.chars().take(80_000).collect::<String>()),
            "newContent": p.new.as_ref().map(|s| s.chars().take(80_000).collect::<String>()),
        }));
    }
    (true, format!("Success. Updated the following files:\n{}", summary.join("\n")), files)
}

thread_local! {
    static LAST_FILES: std::cell::RefCell<Vec<Value>> = const { std::cell::RefCell::new(Vec::new()) };
}

pub fn set_last_files(files: Vec<Value>) {
    LAST_FILES.with(|f| *f.borrow_mut() = files);
}

/// Per-file old/new contents from the most recent `apply_patch` on this thread (for the diff UI).
pub fn take_last_files() -> Vec<Value> {
    LAST_FILES.with(|f| std::mem::take(&mut *f.borrow_mut()))
}

/// Extract the patch text from an invocation: JSON (`patchText`/`patch`/`input`/`diff`) or raw body.
pub fn patch_text_of(path_arg: &str, body: &str) -> String {
    if body.trim_start().starts_with('{') {
        if let Ok(j) = serde_json::from_str::<Value>(body) {
            for k in ["patchText", "patch_text", "patch", "input", "diff", "text", "content"] {
                if let Some(s) = j.get(k).and_then(|v| v.as_str()) {
                    return s.to_string();
                }
            }
        }
    }
    if body.trim().is_empty() { path_arg.to_string() } else { body.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parse_and_apply_update() {
        let p = "*** Begin Patch\n*** Update File: a.py\n@@ def greet():\n-print(\"Hi\")\n+print(\"Hello\")\n*** Add File: b.txt\n+x\n+y\n*** Delete File: c.txt\n*** End Patch";
        let h = parse_patch(p).unwrap();
        assert_eq!(h.len(), 3);
        if let Hunk::Update { chunks, .. } = &h[0] {
            assert!(derive_new_contents("a.py", "nothing here\n", chunks).is_err());
            let out = derive_new_contents("a.py", "x\ndef greet():\nprint(\"Hi\")\nz\n", chunks).unwrap();
            assert_eq!(out, "x\ndef greet():\nprint(\"Hello\")\nz\n");
        } else {
            panic!();
        }
        if let Hunk::Add { content, .. } = &h[1] {
            assert_eq!(content, "x\ny\n");
        }
    }
    #[test]
    fn fuzzy_and_eof() {
        let chunks = vec![Chunk { context: None, old: vec!["b".into()], new: vec!["B".into(), "c".into()], eof: true }];
        let out = derive_new_contents("f", "a\r\nb  \r\n", &chunks).unwrap();
        assert_eq!(out, "a\r\nB\r\nc\r\n");
    }
}
