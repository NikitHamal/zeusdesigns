use serde_json::Value;

/// Strips tags, scripts and styles from fetched HTML so the model reads text instead of markup.
pub fn html_to_text(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    let mut tag = String::new();
    let mut skip = false;
    for ch in html.chars() {
        if in_tag {
            if ch == '>' {
                in_tag = false;
                let t = tag.trim().to_lowercase();
                let name = t.split_whitespace().next().unwrap_or("").to_string();
                if name == "script" || name == "style" {
                    skip = true;
                } else if name == "/script" || name == "/style" {
                    skip = false;
                } else if matches!(
                    name.as_str(),
                    "p" | "/p" | "br" | "br/" | "div" | "/div" | "li" | "h1" | "h2" | "h3" | "tr" | "/tr"
                ) {
                    out.push('\n');
                }
                tag.clear();
            } else {
                tag.push(ch);
            }
        } else if ch == '<' {
            in_tag = true;
        } else if !skip {
            out.push(ch);
        }
    }
    let mut res = String::new();
    for line in out.lines() {
        let l = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if !l.is_empty() {
            res.push_str(&l);
            res.push('\n');
        }
    }
    res
}

/// Stormy `TextEdits.stripLineNumberPrefixes`: strips `"  12|"` prefixes if every non-blank line has one.
pub fn strip_read_file_line_prefixes(text: &str) -> String {
    fn has_line_prefix(line: &str) -> Option<&str> {
        let trimmed = line.trim_start_matches(' ');
        let digits = trimmed.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits > 0 && trimmed[digits..].starts_with('|') {
            Some(&trimmed[digits + 1..])
        } else {
            None
        }
    }
    let lines: Vec<&str> = text.split('\n').collect();
    let non_blank: Vec<&&str> = lines.iter().filter(|l| !l.trim().is_empty()).collect();
    if non_blank.is_empty() || !non_blank.iter().all(|l| has_line_prefix(l).is_some()) {
        return text.to_string();
    }
    lines
        .into_iter()
        .map(|l| has_line_prefix(l).unwrap_or(l))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Stormy `TextEdits.apply`: 4-stage exact + line-trimmed + whitespace-collapsed + block-anchor edit engine.
pub fn apply_stormy_text_edit_impl(
    content: &str,
    search_raw: &str,
    replace_raw: &str,
    replace_all: bool,
    idx: usize,
) -> Result<String, String> {
    let cleaned_search = strip_read_file_line_prefixes(search_raw);
    let cleaned_replace = if cleaned_search != search_raw {
        strip_read_file_line_prefixes(replace_raw)
    } else {
        replace_raw.to_string()
    };

    let crlf = content.contains("\r\n");
    let (search, replace) = if crlf {
        (
            cleaned_search.replace("\r\n", "\n").replace('\n', "\r\n"),
            cleaned_replace.replace("\r\n", "\n").replace('\n', "\r\n"),
        )
    } else {
        (
            cleaned_search.replace("\r\n", "\n"),
            cleaned_replace.replace("\r\n", "\n"),
        )
    };
    let count = content.matches(search.as_str()).count();
    if count == 1 || (count > 1 && replace_all) {
        return Ok(if replace_all {
            content.replace(search.as_str(), replace.as_str())
        } else {
            content.replacen(search.as_str(), replace.as_str(), 1)
        });
    }
    if count > 1 {
        let mut line_nums = Vec::new();
        let mut from = 0usize;
        while let Some(rel) = content[from..].find(search.as_str()) {
            let pos = from + rel;
            let ln = content[..pos].bytes().filter(|&b| b == b'\n').count() + 1;
            line_nums.push(ln.to_string());
            if line_nums.len() >= 6 {
                break;
            }
            from = pos + search.len();
        }
        return Err(format!(
            "edit_file: old_string/SEARCH block {} matches {} places (lines {}). Include more surrounding lines to make it unique, or set replace_all=true.",
            idx,
            count,
            line_nums.join(", ")
        ));
    }

    // Stage 2: Line-trimmed unique match when indentation/trailing whitespace differs
    let file_lines: Vec<&str> = content.lines().collect();
    let search_lines: Vec<&str> = cleaned_search.lines().map(|l| l.trim()).collect();
    if search_lines.is_empty() {
        return Err("edit_file: SEARCH block is empty".to_string());
    }
    let mut match_indices = Vec::new();
    if file_lines.len() >= search_lines.len() {
        for start in 0..=(file_lines.len() - search_lines.len()) {
            let matches = (0..search_lines.len()).all(|k| file_lines[start + k].trim() == search_lines[k]);
            if matches {
                match_indices.push(start);
            }
        }
    }
    if match_indices.len() == 1 {
        let start = match_indices[0];
        let mut rebuilt = Vec::new();
        rebuilt.extend_from_slice(&file_lines[..start]);
        for rl in cleaned_replace.lines() {
            rebuilt.push(rl);
        }
        rebuilt.extend_from_slice(&file_lines[start + search_lines.len()..]);
        let sep = if crlf { "\r\n" } else { "\n" };
        let mut joined = rebuilt.join(sep);
        if content.ends_with('\n') && !joined.ends_with('\n') {
            joined.push_str(sep);
        }
        return Ok(joined);
    }
    if match_indices.len() > 1 {
        return Err(format!(
            "edit_file: SEARCH block {} matches {} places (line-trimmed). Add surrounding lines so it is unique.",
            idx,
            match_indices.len()
        ));
    }

    // Stage 3: Block-anchor match (first and last lines match trimmed, middle lines share >= 80% token overlap)
    if search_lines.len() >= 3 {
        let first_t = search_lines[0];
        let last_t = search_lines[search_lines.len() - 1];
        if first_t.len() >= 3 && !last_t.is_empty() {
            let mut anchor_matches: Vec<(usize, usize)> = Vec::new();
            for a in 0..file_lines.len() {
                if file_lines[a].trim() != first_t {
                    continue;
                }
                let max_b = (file_lines.len() - 1).min(a + search_lines.len() * 2 + 2);
                for b in (a + 1)..=max_b {
                    if file_lines[b].trim() == last_t {
                        let mid_old = search_lines[1..search_lines.len() - 1].join(" ");
                        let mid_file = file_lines[a + 1..b]
                            .iter()
                            .map(|l| l.trim())
                            .collect::<Vec<_>>()
                            .join(" ");
                        let old_words: std::collections::HashSet<&str> = mid_old.split_whitespace().collect();
                        let file_words: std::collections::HashSet<&str> = mid_file.split_whitespace().collect();
                        let sim = if old_words.is_empty() && file_words.is_empty() {
                            1.0
                        } else {
                            let inter = old_words.intersection(&file_words).count() as f64;
                            let union = old_words.union(&file_words).count().max(1) as f64;
                            inter / union
                        };
                        if sim >= 0.78 {
                            anchor_matches.push((a, b));
                        }
                        break;
                    }
                }
            }
            if anchor_matches.len() == 1 {
                let (a, b) = anchor_matches[0];
                let mut rebuilt = Vec::new();
                rebuilt.extend_from_slice(&file_lines[..a]);
                for rl in cleaned_replace.lines() {
                    rebuilt.push(rl);
                }
                rebuilt.extend_from_slice(&file_lines[b + 1..]);
                let sep = if crlf { "\r\n" } else { "\n" };
                let mut joined = rebuilt.join(sep);
                if content.ends_with('\n') && !joined.ends_with('\n') {
                    joined.push_str(sep);
                }
                return Ok(joined);
            }
        }
    }

    Err(format!(
        "edit_file: SEARCH block {} not found. Read the file again and copy the lines accurately.",
        idx
    ))
}

pub fn replace_hunk_fuzzy(content: &str, search_raw: &str, replace_raw: &str, idx: usize) -> Result<String, String> {
    apply_stormy_text_edit_impl(content, search_raw, replace_raw, false, idx)
}

fn find_marker_line(text: &str, ch: char) -> Option<(usize, usize)> {
    let mut offset = 0usize;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        let count = trimmed.chars().take_while(|&c| c == ch).count();
        if count >= 4 {
            let suffix = trimmed[count..].trim().to_ascii_uppercase();
            let valid = match ch {
                '<' => suffix.is_empty() || suffix.starts_with("SEARCH") || suffix.starts_with("ORIGINAL") || suffix.starts_with("OLD") || suffix.starts_with("HEAD"),
                '=' => suffix.is_empty(),
                '>' => suffix.is_empty() || suffix.starts_with("REPLACE") || suffix.starts_with("UPDATED") || suffix.starts_with("NEW"),
                _ => false,
            };
            if valid {
                return Some((offset, offset + line.len()));
            }
        }
        offset += line.len();
    }
    None
}

/// Applies one or more `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` blocks (or flexible 4..9 marker variants or JSON `oldString`/`newString` edits),
/// with automatic line-trimmed fuzzy fallback when exact whitespace differs.
pub fn apply_search_replace(content: &str, body: &str) -> Result<String, String> {
    let mut unescaped_body = if find_marker_line(body, '<').is_none() && body.contains("\\n") {
        body.replace("\\r\\n", "\n").replace("\\n", "\n")
    } else {
        body.to_string()
    };
    for marker in ["=======\n", "=======\r\n", ">>>>>>> REPLACE", ">>>>>>> UPDATED", ">>>>>>>"] {
        if let Some(pos) = unescaped_body.find(marker) {
            if pos > 0
                && unescaped_body.as_bytes()[pos - 1] != b'\n'
                && unescaped_body.as_bytes()[pos - 1] != b'='
                && unescaped_body.as_bytes()[pos - 1] != b'>'
            {
                unescaped_body.insert(pos, '\n');
            }
        }
    }
    let mut out = content.to_string();
    let mut rest = unescaped_body.as_str();
    let mut n = 0usize;
    while let Some((_s_start, s_end)) = find_marker_line(rest, '<') {
        let after_s = &rest[s_end..];
        let Some((m_start, m_end)) = find_marker_line(after_s, '=') else {
            return Err("edit_file: missing ======= divider".to_string());
        };
        let search_raw = after_s[..m_start].trim_matches(|c| c == '\n' || c == '\r');
        let after_m = &after_s[m_end..];
        let (r_start, r_end) = find_marker_line(after_m, '>').unwrap_or((after_m.len(), after_m.len()));
        let replace_raw = after_m[..r_start].trim_matches(|c| c == '\n' || c == '\r');
        rest = &after_m[r_end..];
        if search_raw.is_empty() {
            if out.trim().is_empty() {
                out = replace_raw.to_string();
                n += 1;
                continue;
            }
            return Err("edit_file: SEARCH block is empty".to_string());
        }
        out = replace_hunk_fuzzy(&out, search_raw, replace_raw, n + 1)?;
        n += 1;
    }
    if n > 0 {
        return Ok(out);
    }

    let trimmed = unescaped_body.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        if let Ok(j) = serde_json::from_str::<Value>(trimmed) {
            let old_s = j
                .get("oldString")
                .or_else(|| j.get("old_str"))
                .or_else(|| j.get("old_string"))
                .or_else(|| j.get("search"))
                .and_then(|v| v.as_str());
            let new_s = j
                .get("newString")
                .or_else(|| j.get("new_str"))
                .or_else(|| j.get("new_string"))
                .or_else(|| j.get("replace"))
                .and_then(|v| v.as_str());
            if let (Some(o), Some(r)) = (old_s, new_s) {
                let rep_all = j
                    .get("replace_all")
                    .or_else(|| j.get("replaceAll"))
                    .and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true")))
                    .unwrap_or(false);
                return apply_stormy_text_edit_impl(&out, o, r, rep_all, 1);
            }
        }
    }

    if !trimmed.is_empty()
        && !trimmed.contains("<<<<")
        && !trimmed.contains(">>>>")
        && (trimmed.lines().count() >= 2 || content.lines().count() <= 3)
    {
        let mut full_new = trimmed
            .trim_start_matches("```javascript")
            .trim_start_matches("```typescript")
            .trim_start_matches("```python")
            .trim_start_matches("```rust")
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
            .to_string();
        if content.ends_with('\n') && !full_new.ends_with('\n') {
            full_new.push('\n');
        }
        return Ok(full_new);
    }

    Err("edit_file: BODY needs a <<<<<<< SEARCH / ======= / >>>>>>> REPLACE block".to_string())
}

pub fn extract_attr(header: &str, key: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let pat = format!("{}={}", key, quote);
        if let Some(idx) = header.find(&pat) {
            let start = idx + pat.len();
            let rest = &header[start..];
            if let Some(end) = rest.find(quote) {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}
