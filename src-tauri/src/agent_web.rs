//! Keyless `websearch` (DuckDuckGo HTML, Bing, SearXNG fallback) and `webfetch` with
//! HTML -> Markdown extraction (compact port of OpenCode `tool/html-markdown.ts`).
use serde_json::{json, Value};
use std::time::Duration;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

enum Tok {
    Text(String),
    Open(String, String, bool),
    Close(String),
}

const RAW_TEXT: [&str; 4] = ["script", "style", "noscript", "template"];

fn tokenize(html: &str) -> Vec<Tok> {
    let b = html.as_bytes();
    let mut out = Vec::new();
    let mut i = 0usize;
    let mut text_start = 0usize;
    while i < b.len() {
        if b[i] != b'<' {
            i += 1;
            continue;
        }
        if html[i..].starts_with("<!--") {
            if i > text_start {
                out.push(Tok::Text(html[text_start..i].to_string()));
            }
            match html[i + 4..].find("-->") {
                Some(e) => {
                    i = i + 4 + e + 3;
                    text_start = i;
                    continue;
                }
                None => {
                    i = b.len();
                    text_start = i;
                    break;
                }
            }
        }
        let next = b.get(i + 1).copied().unwrap_or(0);
        if !(next.is_ascii_alphabetic() || next == b'/' || next == b'!') {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut q = 0u8;
        while j < b.len() {
            let c = b[j];
            if q != 0 {
                if c == q {
                    q = 0;
                }
            } else if c == b'"' || c == b'\'' {
                q = c;
            } else if c == b'>' {
                break;
            }
            j += 1;
        }
        if j >= b.len() {
            break;
        }
        if i > text_start {
            out.push(Tok::Text(html[text_start..i].to_string()));
        }
        let inner = &html[i + 1..j];
        i = j + 1;
        text_start = i;
        if inner.starts_with('!') || inner.starts_with('?') {
            continue;
        }
        if let Some(rest) = inner.strip_prefix('/') {
            out.push(Tok::Close(rest.trim().to_ascii_lowercase()));
            continue;
        }
        let self_close = inner.trim_end().ends_with('/');
        let name_end = inner.find(|c: char| c.is_whitespace() || c == '/').unwrap_or(inner.len());
        let name = inner[..name_end].to_ascii_lowercase();
        let attrs = inner[name_end..].to_string();
        if RAW_TEXT.contains(&name.as_str()) && !self_close {
            let lower = html[i..].to_ascii_lowercase();
            let close = format!("</{}", name);
            match lower.find(&close) {
                Some(p) => {
                    let after = i + p;
                    let end = html[after..].find('>').map(|g| after + g + 1).unwrap_or(b.len());
                    out.push(Tok::Open(name.clone(), attrs, false));
                    out.push(Tok::Close(name));
                    i = end;
                    text_start = i;
                }
                None => {
                    i = b.len();
                    text_start = i;
                }
            }
            continue;
        }
        out.push(Tok::Open(name, attrs, self_close));
    }
    if text_start < b.len() {
        out.push(Tok::Text(html[text_start..].to_string()));
    }
    out
}

pub fn attr_of(raw: &str, name: &str) -> Option<String> {
    let lower = raw.to_ascii_lowercase();
    let mut from = 0usize;
    while let Some(rel) = lower[from..].find(name) {
        let s = from + rel;
        let before_ok = s == 0 || lower.as_bytes()[s - 1].is_ascii_whitespace() || lower.as_bytes()[s - 1] == b'"' || lower.as_bytes()[s - 1] == b'\'';
        let after = raw[s + name.len()..].trim_start();
        if before_ok && after.starts_with('=') {
            let v = after[1..].trim_start();
            if let Some(q) = v.chars().next().filter(|c| *c == '"' || *c == '\'') {
                let body = &v[1..];
                return body.find(q).map(|e| decode_entities(&body[..e]));
            }
            let end = v.find(|c: char| c.is_whitespace() || c == '>').unwrap_or(v.len());
            return Some(decode_entities(&v[..end]));
        }
        from = s + name.len();
    }
    None
}

pub fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(p) = rest.find('&') {
        out.push_str(&rest[..p]);
        let tail = &rest[p..];
        let Some(semi) = tail.find(';').filter(|x| *x <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let ent = &tail[1..semi];
        let rep: Option<String> = match ent {
            "amp" => Some("&".into()),
            "lt" => Some("<".into()),
            "gt" => Some(">".into()),
            "quot" => Some("\"".into()),
            "apos" => Some("'".into()),
            "nbsp" => Some(" ".into()),
            "mdash" => Some("\u{2014}".into()),
            "ndash" => Some("\u{2013}".into()),
            "hellip" => Some("\u{2026}".into()),
            "rsquo" | "lsquo" => Some("'".into()),
            "rdquo" | "ldquo" => Some("\"".into()),
            "copy" => Some("\u{a9}".into()),
            "middot" => Some("\u{b7}".into()),
            _ => ent.strip_prefix('#').and_then(|n| {
                let code = if let Some(h) = n.strip_prefix('x').or_else(|| n.strip_prefix('X')) {
                    u32::from_str_radix(h, 16).ok()
                } else {
                    n.parse::<u32>().ok()
                };
                code.and_then(char::from_u32).map(|c| c.to_string())
            }),
        };
        match rep {
            Some(r) => {
                out.push_str(&r);
                rest = &tail[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

const OMIT: [&str; 12] = ["script", "style", "noscript", "iframe", "object", "embed", "meta", "link", "template", "head", "svg", "canvas"];
const BLOCKS: [&str; 22] = [
    "address", "article", "aside", "details", "dialog", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "header",
    "main", "nav", "p", "section", "summary", "ul", "ol", "table", "tr",
];

struct Md {
    out: String,
    cell: Option<String>,
    omit: usize,
    pre: bool,
    links: Vec<Option<String>>,
    lists: Vec<(bool, usize)>,
    quotes: Vec<usize>,
    row: Vec<String>,
    rows_in_table: usize,
}

impl Md {
    fn buf(&mut self) -> &mut String {
        match self.cell.as_mut() {
            Some(c) => c,
            None => &mut self.out,
        }
    }
    fn blank(&mut self) {
        if self.cell.is_some() {
            return;
        }
        let t = self.out.trim_end_matches([' ', '\t']).len();
        self.out.truncate(t);
        if self.out.is_empty() || self.out.ends_with("\n\n") {
            return;
        }
        if self.out.ends_with('\n') {
            self.out.push('\n');
        } else {
            self.out.push_str("\n\n");
        }
    }
    fn newline(&mut self) {
        if self.cell.is_some() {
            return;
        }
        let t = self.out.trim_end_matches([' ', '\t']).len();
        self.out.truncate(t);
        if !self.out.is_empty() && !self.out.ends_with('\n') {
            self.out.push('\n');
        }
    }
    fn text(&mut self, raw: &str) {
        let s = decode_entities(raw);
        if self.pre {
            self.buf().push_str(&s);
            return;
        }
        let mut pending_space = s.starts_with(char::is_whitespace);
        let words: Vec<&str> = s.split_whitespace().collect();
        if words.is_empty() {
            if pending_space {
                let b = self.buf();
                if !b.is_empty() && !b.ends_with(char::is_whitespace) {
                    b.push(' ');
                }
            }
            return;
        }
        for (i, w) in words.iter().enumerate() {
            let b = self.buf();
            let at_start = b.is_empty() || b.ends_with('\n') || b.ends_with(' ');
            if i > 0 || (pending_space && !at_start) {
                if !b.ends_with(char::is_whitespace) {
                    b.push(' ');
                }
            }
            b.push_str(w);
            pending_space = false;
        }
        if s.ends_with(char::is_whitespace) {
            self.buf().push(' ');
        }
    }
    fn open(&mut self, name: &str, attrs: &str) {
        if OMIT.contains(&name) {
            self.omit += 1;
            return;
        }
        if self.omit > 0 {
            return;
        }
        match name {
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                self.blank();
                let n = name[1..].parse::<usize>().unwrap_or(1);
                let p = format!("{} ", "#".repeat(n));
                self.buf().push_str(&p);
            }
            "br" => {
                if self.cell.is_some() {
                    self.buf().push(' ');
                } else {
                    self.out.push_str("  \n");
                }
            }
            "hr" => {
                self.blank();
                self.out.push_str("---");
                self.blank();
            }
            "a" => {
                let href = attr_of(attrs, "href").filter(|h| !h.is_empty() && !h.starts_with('#') && !h.starts_with("javascript:"));
                if href.is_some() {
                    self.buf().push('[');
                }
                self.links.push(href);
            }
            "strong" | "b" => self.buf().push_str("**"),
            "em" | "i" => self.buf().push('*'),
            "code" if !self.pre => self.buf().push('`'),
            "pre" => {
                self.blank();
                self.out.push_str("```\n");
                self.pre = true;
            }
            "ul" | "ol" => {
                self.blank();
                self.lists.push((name == "ol", 1));
            }
            "li" => {
                self.newline();
                let depth = self.lists.len().saturating_sub(1);
                let marker = match self.lists.last_mut() {
                    Some((true, n)) => {
                        let m = format!("{}. ", n);
                        *n += 1;
                        m
                    }
                    _ => "- ".to_string(),
                };
                let line = format!("{}{}", "  ".repeat(depth), marker);
                self.buf().push_str(&line);
            }
            "blockquote" => {
                self.blank();
                self.quotes.push(self.out.len());
            }
            "img" => {
                let alt = attr_of(attrs, "alt").unwrap_or_default();
                let src = attr_of(attrs, "src").unwrap_or_default();
                if !src.is_empty() && !src.starts_with("data:") {
                    let s = format!("![{}]({})", alt, src);
                    self.buf().push_str(&s);
                }
            }
            "table" => {
                self.blank();
                self.rows_in_table = 0;
            }
            "tr" => {
                self.row.clear();
            }
            "td" | "th" => {
                self.cell = Some(String::new());
            }
            _ => {
                if BLOCKS.contains(&name) {
                    self.blank();
                }
            }
        }
    }
    fn close(&mut self, name: &str) {
        if OMIT.contains(&name) {
            self.omit = self.omit.saturating_sub(1);
            return;
        }
        if self.omit > 0 {
            return;
        }
        match name {
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => self.blank(),
            "a" => {
                if let Some(Some(h)) = self.links.pop() {
                    let s = format!("]({})", h);
                    self.buf().push_str(&s);
                }
            }
            "strong" | "b" => self.buf().push_str("**"),
            "em" | "i" => self.buf().push('*'),
            "code" if !self.pre => self.buf().push('`'),
            "pre" => {
                self.pre = false;
                if !self.out.ends_with('\n') {
                    self.out.push('\n');
                }
                self.out.push_str("```");
                self.blank();
            }
            "ul" | "ol" => {
                self.lists.pop();
                self.blank();
            }
            "blockquote" => {
                if let Some(start) = self.quotes.pop() {
                    let start = start.min(self.out.len());
                    let body = self.out[start..].trim_end().to_string();
                    self.out.truncate(start);
                    let quoted: Vec<String> = body.lines().map(|l| if l.is_empty() { ">".to_string() } else { format!("> {}", l) }).collect();
                    self.out.push_str(&quoted.join("\n"));
                    self.blank();
                }
            }
            "td" | "th" => {
                if let Some(c) = self.cell.take() {
                    self.row.push(c.trim().replace('|', "\\|"));
                }
            }
            "tr" => {
                if !self.row.is_empty() {
                    let line = format!("| {} |", self.row.join(" | "));
                    self.newline();
                    self.out.push_str(&line);
                    self.out.push('\n');
                    if self.rows_in_table == 0 {
                        let sep = format!("|{}|", vec![" --- "; self.row.len()].join("|"));
                        self.out.push_str(&sep);
                        self.out.push('\n');
                    }
                    self.rows_in_table += 1;
                    self.row.clear();
                }
            }
            "table" => self.blank(),
            _ => {
                if BLOCKS.contains(&name) {
                    self.blank();
                }
            }
        }
    }
}

pub fn html_to_markdown(html: &str) -> String {
    let mut md = Md { out: String::new(), cell: None, omit: 0, pre: false, links: Vec::new(), lists: Vec::new(), quotes: Vec::new(), row: Vec::new(), rows_in_table: 0 };
    for tok in tokenize(html) {
        match tok {
            Tok::Text(t) => {
                if md.omit == 0 {
                    md.text(&t);
                }
            }
            Tok::Open(n, a, sc) => {
                let void = matches!(n.as_str(), "br" | "hr" | "img" | "meta" | "link" | "input");
                md.open(&n, &a);
                if (sc || void) && OMIT.contains(&n.as_str()) {
                    md.omit = md.omit.saturating_sub(1);
                }
                if sc && !void && !OMIT.contains(&n.as_str()) {
                    md.close(&n);
                }
            }
            Tok::Close(n) => md.close(&n),
        }
    }
    let mut text = md.out;
    while text.contains("\n\n\n") {
        text = text.replace("\n\n\n", "\n\n");
    }
    text.lines().map(|l| l.trim_end()).collect::<Vec<_>>().join("\n").trim().to_string()
}

pub fn html_to_plain(html: &str) -> String {
    let md = html_to_markdown(html);
    let mut out = String::new();
    for line in md.lines() {
        let l = line.trim_start_matches(['#', '>', ' ']).replace("**", "").replace('`', "");
        out.push_str(&l);
        out.push('\n');
    }
    out.trim().to_string()
}

fn client(timeout_secs: u64) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())
}

/// `webfetch`: text | markdown | html. Returns `(ok, output)`.
pub fn web_fetch(url: &str, format: &str, timeout_secs: u64) -> (bool, String) {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return (false, "webfetch: URL must start with http:// or https://".to_string());
    }
    let c = match client(timeout_secs.clamp(5, 120)) {
        Ok(c) => c,
        Err(e) => return (false, format!("webfetch failed: {}", e)),
    };
    let accept = match format {
        "html" => "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "text" => "text/plain;q=1.0,text/html;q=0.8,*/*;q=0.1",
        _ => "text/markdown;q=1.0,text/html;q=0.8,text/plain;q=0.6,*/*;q=0.1",
    };
    let mut resp = c.get(url).header("Accept", accept).header("Accept-Language", "en-US,en;q=0.9").send();
    if let Ok(r) = &resp {
        if r.status().as_u16() == 403 && r.headers().get("cf-mitigated").is_some() {
            resp = c.get(url).header("User-Agent", "zeus").header("Accept", accept).send();
        }
    }
    let r = match resp {
        Ok(r) => r,
        Err(e) => return (false, format!("webfetch failed: {}", e)),
    };
    let status = r.status();
    let ctype = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_ascii_lowercase();
    if !status.is_success() {
        return (false, format!("webfetch failed: HTTP {} for {}", status.as_u16(), url));
    }
    if ctype.starts_with("image/") || ctype.contains("octet-stream") || ctype.contains("pdf") || ctype.starts_with("audio/") || ctype.starts_with("video/") {
        return (false, format!("webfetch: unsupported binary content type '{}'", ctype));
    }
    let bytes = match r.bytes() {
        Ok(b) => b,
        Err(e) => return (false, format!("webfetch failed: {}", e)),
    };
    if bytes.len() > 5 * 1024 * 1024 {
        return (false, "webfetch: response exceeds 5 MB".to_string());
    }
    let body = String::from_utf8_lossy(&bytes).to_string();
    let is_html = ctype.contains("html") || (ctype.is_empty() && body.trim_start().starts_with('<'));
    let out = match (is_html, format) {
        (true, "markdown") | (true, "") => html_to_markdown(&body),
        (true, "text") => html_to_plain(&body),
        _ => body,
    };
    (true, out)
}

// ---------------------------------------------------------------- search

pub fn pct_encode(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            o.push(b as char);
        } else if b == b' ' {
            o.push('+');
        } else {
            o.push_str(&format!("%{:02X}", b));
        }
    }
    o
}

pub fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn b64url_decode(s: &str) -> Option<String> {
    let mut buf: u32 = 0;
    let mut bits = 0;
    let mut out = Vec::new();
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            b'=' => break,
            _ => return None,
        };
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    String::from_utf8(out).ok()
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    for t in tokenize(s) {
        if let Tok::Text(x) = t {
            out.push_str(&decode_entities(&x));
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn ddg_target(href: &str) -> String {
    if let Some(p) = href.find("uddg=") {
        let rest = &href[p + 5..];
        let end = rest.find('&').unwrap_or(rest.len());
        return pct_decode(&rest[..end]);
    }
    if href.starts_with("//") {
        return format!("https:{}", href);
    }
    href.to_string()
}

fn bing_target(href: &str) -> String {
    if href.contains("bing.com/ck/a") {
        if let Some(p) = href.find("&u=").or_else(|| href.find("?u=")) {
            let rest = &href[p + 3..];
            let end = rest.find('&').unwrap_or(rest.len());
            let v = &rest[..end];
            if let Some(enc) = v.strip_prefix("a1") {
                if let Some(u) = b64url_decode(enc) {
                    return u;
                }
            }
        }
    }
    href.to_string()
}

pub fn parse_ddg(html: &str) -> Vec<Value> {
    let mut out = Vec::new();
    let marks: Vec<usize> = html.match_indices("result__a").map(|(i, _)| i).collect();
    for (n, &m) in marks.iter().enumerate() {
        let Some(a_start) = html[..m].rfind("<a") else { continue };
        let Some(gt) = html[m..].find('>').map(|g| m + g) else { continue };
        let href = attr_of(&html[a_start + 2..gt], "href").unwrap_or_default();
        if href.is_empty() || href.contains("duckduckgo.com/y.js") || href.contains("ad_provider") {
            continue;
        }
        let Some(close) = html[gt..].find("</a>").map(|c| gt + c) else { continue };
        let title = strip_tags(&html[gt + 1..close]);
        let limit = marks.get(n + 1).copied().unwrap_or(html.len());
        let mut snippet = String::new();
        if let Some(sp) = html[close..limit].find("result__snippet") {
            let sp = close + sp;
            if let Some(sg) = html[sp..limit].find('>').map(|g| sp + g) {
                let end = html[sg..limit].find("</a>").or_else(|| html[sg..limit].find("</td>")).or_else(|| html[sg..limit].find("</div>")).map(|e| sg + e).unwrap_or(limit);
                snippet = strip_tags(&html[sg + 1..end]);
            }
        }
        let url = ddg_target(&href);
        if url.starts_with("http") && !title.is_empty() {
            out.push(json!({ "title": title, "url": url, "snippet": snippet }));
        }
    }
    out
}

pub fn parse_bing(html: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for chunk in html.split("class=\"b_algo\"").skip(1) {
        let chunk = chunk.split("class=\"b_algo\"").next().unwrap_or(chunk);
        let Some(h2) = chunk.find("<h2") else { continue };
        let Some(a) = chunk[h2..].find("<a ").map(|x| h2 + x) else { continue };
        let Some(gt) = chunk[a..].find('>').map(|x| a + x) else { continue };
        let href = attr_of(&chunk[a + 2..gt], "href").unwrap_or_default();
        let Some(close) = chunk[gt..].find("</a>").map(|x| gt + x) else { continue };
        let title = strip_tags(&chunk[gt + 1..close]);
        let mut snippet = String::new();
        if let Some(p) = chunk[close..].find("<p") {
            let ps = close + p;
            if let Some(pg) = chunk[ps..].find('>').map(|x| ps + x) {
                if let Some(pe) = chunk[pg..].find("</p>").map(|x| pg + x) {
                    snippet = strip_tags(&chunk[pg + 1..pe]);
                }
            }
        }
        let url = bing_target(&href);
        if url.starts_with("http") && !title.is_empty() {
            out.push(json!({ "title": title, "url": url, "snippet": snippet }));
        }
    }
    out
}

fn dedupe_rank(items: Vec<Value>, limit: usize) -> Vec<Value> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for it in items {
        let url = it.get("url").and_then(|v| v.as_str()).unwrap_or("").trim_end_matches('/').to_string();
        if url.is_empty() || !seen.insert(url.clone()) {
            continue;
        }
        let rank = out.len() + 1;
        out.push(json!({
            "rank": rank,
            "title": it.get("title").cloned().unwrap_or(Value::Null),
            "url": url,
            "snippet": it.get("snippet").cloned().unwrap_or(json!("")),
        }));
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Keyless web search: DuckDuckGo HTML, then Bing, then public SearXNG JSON.
pub fn websearch(query: &str, limit: usize) -> Result<Vec<Value>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("websearch: empty query".to_string());
    }
    let c = client(20)?;
    let enc = pct_encode(q);
    let mut errors = Vec::new();
    match c.get(format!("https://html.duckduckgo.com/html/?q={}", enc)).header("Accept-Language", "en-US,en;q=0.9").send().and_then(|r| r.text()) {
        Ok(t) => {
            let r = dedupe_rank(parse_ddg(&t), limit);
            if !r.is_empty() {
                return Ok(r);
            }
            errors.push("duckduckgo: no results".to_string());
        }
        Err(e) => errors.push(format!("duckduckgo: {}", e)),
    }
    match c.get(format!("https://www.bing.com/search?q={}&setlang=en&cc=us", enc)).header("Accept-Language", "en-US,en;q=0.9").send().and_then(|r| r.text()) {
        Ok(t) => {
            let r = dedupe_rank(parse_bing(&t), limit);
            if !r.is_empty() {
                return Ok(r);
            }
            errors.push("bing: no results".to_string());
        }
        Err(e) => errors.push(format!("bing: {}", e)),
    }
    for host in ["https://searx.be", "https://search.inetol.net", "https://searx.tiekoetter.com"] {
        match c.get(format!("{}/search?q={}&format=json", host, enc)).send().and_then(|r| r.json::<Value>()) {
            Ok(v) => {
                let items: Vec<Value> = v
                    .get("results")
                    .and_then(|r| r.as_array())
                    .map(|a| a.iter().map(|x| json!({ "title": x.get("title").cloned().unwrap_or(Value::Null), "url": x.get("url").cloned().unwrap_or(Value::Null), "snippet": x.get("content").cloned().unwrap_or(json!("")) })).collect())
                    .unwrap_or_default();
                let r = dedupe_rank(items, limit);
                if !r.is_empty() {
                    return Ok(r);
                }
            }
            Err(e) => errors.push(format!("searxng: {}", e)),
        }
    }
    Err(format!("websearch failed ({})", errors.join("; ")))
}

pub fn websearch_tool(query: &str, limit: usize) -> (bool, String) {
    match websearch(query, limit.clamp(1, 20)) {
        Ok(r) => (true, serde_json::to_string_pretty(&r).unwrap_or_default()),
        Err(e) => (false, e),
    }
}

/// `(query, limit)` from a JSON body or plain text.
pub fn query_of(path_arg: &str, body: &str) -> (String, usize) {
    if body.trim_start().starts_with('{') {
        if let Ok(j) = serde_json::from_str::<Value>(body) {
            let q = j.get("query").or_else(|| j.get("q")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let n = j.get("numResults").or_else(|| j.get("num_results")).or_else(|| j.get("limit")).and_then(|v| v.as_u64()).unwrap_or(8) as usize;
            if !q.is_empty() {
                return (q, n);
            }
        }
    }
    (if body.trim().is_empty() { path_arg.trim().to_string() } else { body.trim().to_string() }, 8)
}

/// `(url, format, timeout_secs)` from a JSON body or plain URL.
pub fn fetch_args_of(path_arg: &str, body: &str) -> (String, String, u64) {
    if body.trim_start().starts_with('{') {
        if let Ok(j) = serde_json::from_str::<Value>(body) {
            let url = j.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let format = j.get("format").and_then(|v| v.as_str()).unwrap_or("markdown").to_string();
            let timeout = j.get("timeout").and_then(|v| v.as_u64()).unwrap_or(30);
            if !url.is_empty() {
                return (url, format, timeout);
            }
        }
    }
    let url = if path_arg.trim().is_empty() { body.trim() } else { path_arg.trim() };
    (url.to_string(), "markdown".to_string(), 30)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn md_basic() {
        let m = html_to_markdown("<html><head><title>x</title></head><body><h1>Hi</h1><p>A <b>bold</b> <a href=\"/u\">link</a></p><ul><li>one</li><li>two</li></ul><script>var a='<b>';</script><pre>x\n y</pre></body></html>");
        assert!(m.contains("# Hi"), "{}", m);
        assert!(m.contains("A **bold** [link](/u)"), "{}", m);
        assert!(m.contains("- one\n- two"), "{}", m);
        assert!(m.contains("```\nx\n y\n```"), "{}", m);
        assert!(!m.contains("var a"), "{}", m);
    }
    #[test]
    fn table_md() {
        let m = html_to_markdown("<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>");
        assert!(m.contains("| a | b |\n| --- | --- |\n| 1 | 2 |"), "{}", m);
    }
    #[test]
    fn ddg_parse() {
        let h = "<div class=\"result\"><a rel=\"nofollow\" class=\"result__a\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=1\">Ex <b>ample</b></a><a class=\"result__snippet\" href=\"x\">Some <b>snippet</b> text</a></div>";
        let r = parse_ddg(h);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0]["url"], "https://example.com/a");
        assert_eq!(r[0]["title"], "Ex ample");
        assert_eq!(r[0]["snippet"], "Some snippet text");
    }
    #[test]
    fn bing_parse() {
        let h = "<li class=\"b_algo\"><h2><a href=\"https://example.org/p\">T</a></h2><div class=\"b_caption\"><p>Snip</p></div></li>";
        let r = parse_bing(h);
        assert_eq!(r[0]["url"], "https://example.org/p");
        assert_eq!(r[0]["snippet"], "Snip");
        assert_eq!(bing_target("https://www.bing.com/ck/a?!&&p=1&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS94&ntb=1"), "https://example.com/x");
    }
    #[test]
    #[ignore]
    fn live_search_and_fetch() {
        let r = websearch("rust programming language", 5).unwrap();
        println!("{}", serde_json::to_string_pretty(&r).unwrap());
        assert!(!r.is_empty());
        let (ok, md) = web_fetch("https://example.com", "markdown", 20);
        println!("{}", md);
        assert!(ok && md.contains("documentation examples"));
    }
}
