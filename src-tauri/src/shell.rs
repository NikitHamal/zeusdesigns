//! OpenCode-style shell layer, free of any Tauri dependency.
//!
//! * `exec` runs one command in a real shell (Git Bash > pwsh > cmd on Windows, `$SHELL` elsewhere),
//!   streams merged output while it runs, enforces a hard timeout, supports cancellation and
//!   reports the final working directory so `cd` persists between calls.
//! * `pty_*` open genuine pseudo-terminal sessions (ConPTY on Windows) for the interactive Terminal panel.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

/* ------------------------------------------------------------------ */
/* Event sink (wired to Tauri in term.rs)                              */
/* ------------------------------------------------------------------ */
type Emitter = Box<dyn Fn(&str, Value) + Send + Sync>;
static EMITTER: OnceLock<Emitter> = OnceLock::new();
static SEQ: AtomicU64 = AtomicU64::new(1);

pub fn set_emitter(f: Emitter) {
    let _ = EMITTER.set(f);
}

pub fn emit(event: &str, payload: Value) {
    if let Some(f) = EMITTER.get() {
        f(event, payload);
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/* ------------------------------------------------------------------ */
/* Shell discovery                                                     */
/* ------------------------------------------------------------------ */
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Bash,
    Pwsh,
    WinPs,
    Cmd,
}

impl Kind {
    pub fn id(&self) -> &'static str {
        match self {
            Kind::Bash => "bash",
            Kind::Pwsh => "pwsh",
            Kind::WinPs => "powershell",
            Kind::Cmd => "cmd",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Shell {
    pub kind: Kind,
    pub path: PathBuf,
}

impl Shell {
    pub fn label(&self) -> String {
        match self.kind {
            Kind::Bash => {
                if cfg!(target_os = "windows") {
                    "Git Bash".to_string()
                } else {
                    self.path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "bash".to_string())
                }
            }
            Kind::Pwsh => "PowerShell 7".to_string(),
            Kind::WinPs => "Windows PowerShell".to_string(),
            Kind::Cmd => "Command Prompt".to_string(),
        }
    }

    pub fn info(&self) -> Value {
        json!({ "id": self.kind.id(), "label": self.label(), "path": self.path.to_string_lossy() })
    }

    /// One line the agent can be told so it writes commands for the right dialect.
    pub fn dialect_hint(&self) -> &'static str {
        match self.kind {
            Kind::Bash => "POSIX bash (use forward slashes, `&&`, pipes, heredocs)",
            Kind::Pwsh => "PowerShell 7 (use `;` or `&&`, Get-ChildItem, Select-String)",
            Kind::WinPs => "Windows PowerShell 5 (chain with `;`, no `&&`)",
            Kind::Cmd => "Windows cmd.exe (`&&` chaining, `dir`, `type`; common POSIX tools are emulated)",
        }
    }
}

/// Extra tool directories GUI-launched apps often miss (fresh installs of git, node, gh).
pub fn augmented_path() -> Option<OsString> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let mut extra: Vec<PathBuf> = vec![
        PathBuf::from(&pf).join("Git").join("cmd"),
        PathBuf::from(&pf).join("Git").join("mingw64").join("bin"),
        PathBuf::from(&pf).join("Git").join("usr").join("bin"),
        PathBuf::from(&pf).join("GitHub CLI"),
        PathBuf::from(&pf).join("nodejs"),
    ];
    if !local.is_empty() {
        extra.push(PathBuf::from(&local).join("Programs").join("Git").join("cmd"));
        extra.push(PathBuf::from(&local).join("Programs").join("Python").join("Python312"));
    }
    if !appdata.is_empty() {
        extra.push(PathBuf::from(&appdata).join("npm"));
    }
    for e in extra {
        if e.is_dir() && !paths.iter().any(|p| p.as_os_str().eq_ignore_ascii_case(e.as_os_str())) {
            paths.push(e);
        }
    }
    std::env::join_paths(paths).ok()
}

fn which(name: &str) -> Option<PathBuf> {
    let paths = augmented_path().or_else(|| std::env::var_os("PATH"))?;
    for dir in std::env::split_paths(&paths) {
        let plain = dir.join(name);
        if plain.is_file() {
            return Some(plain);
        }
        if cfg!(target_os = "windows") {
            let exe = dir.join(format!("{}.exe", name));
            if exe.is_file() {
                return Some(exe);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn git_bash() -> Option<PathBuf> {
    let mut cands: Vec<PathBuf> = Vec::new();
    if let Some(git) = which("git") {
        for anc in git.ancestors().skip(1).take(4) {
            cands.push(anc.join("bin").join("bash.exe"));
        }
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(var) {
            cands.push(PathBuf::from(pf).join("Git").join("bin").join("bash.exe"));
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        cands.push(PathBuf::from(local).join("Programs").join("Git").join("bin").join("bash.exe"));
    }
    cands.into_iter().find(|p| {
        let low = p.to_string_lossy().to_ascii_lowercase();
        p.is_file() && !low.contains("system32") && !low.contains("windowsapps")
    })
}

fn detect_all() -> Vec<Shell> {
    let mut out: Vec<Shell> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Some(p) = git_bash() {
            out.push(Shell { kind: Kind::Bash, path: p });
        }
        if let Some(p) = which("pwsh") {
            out.push(Shell { kind: Kind::Pwsh, path: p });
        }
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let ps = PathBuf::from(&root).join("System32").join("WindowsPowerShell").join("v1.0").join("powershell.exe");
        if ps.is_file() {
            out.push(Shell { kind: Kind::WinPs, path: ps });
        }
        let cmd = std::env::var_os("COMSPEC")
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .unwrap_or_else(|| PathBuf::from(&root).join("System32").join("cmd.exe"));
        out.push(Shell { kind: Kind::Cmd, path: cmd });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let from_env = std::env::var("SHELL").ok().map(PathBuf::from).filter(|p| {
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            p.is_file() && matches!(name.as_str(), "bash" | "zsh" | "sh" | "dash" | "ash")
        });
        let path = from_env
            .or_else(|| which("bash"))
            .or_else(|| which("sh"))
            .unwrap_or_else(|| PathBuf::from("/bin/sh"));
        out.push(Shell { kind: Kind::Bash, path });
        if let Some(p) = which("pwsh") {
            out.push(Shell { kind: Kind::Pwsh, path: p });
        }
    }
    out
}

pub fn available_shells() -> &'static Vec<Shell> {
    static ALL: OnceLock<Vec<Shell>> = OnceLock::new();
    ALL.get_or_init(detect_all)
}

/// Default shell for both the agent and the Terminal panel: Git Bash > pwsh > cmd > Windows PowerShell.
/// `ZEUS_SHELL` (path to a shell executable) overrides the choice.
pub fn default_shell() -> Shell {
    static DEF: OnceLock<Shell> = OnceLock::new();
    DEF.get_or_init(|| {
        if let Some(p) = std::env::var_os("ZEUS_SHELL").map(PathBuf::from).filter(|p| p.is_file()) {
            let name = p.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
            let kind = if name.starts_with("pwsh") {
                Kind::Pwsh
            } else if name.starts_with("powershell") {
                Kind::WinPs
            } else if name.starts_with("cmd") {
                Kind::Cmd
            } else {
                Kind::Bash
            };
            return Shell { kind, path: p };
        }
        let all = available_shells();
        for k in [Kind::Bash, Kind::Pwsh, Kind::Cmd, Kind::WinPs] {
            if let Some(s) = all.iter().find(|s| s.kind == k) {
                return s.clone();
            }
        }
        Shell { kind: Kind::Cmd, path: PathBuf::from("cmd.exe") }
    })
    .clone()
}

pub fn shell_by_id(id: &str) -> Shell {
    if id.is_empty() || id == "auto" {
        return default_shell();
    }
    available_shells()
        .iter()
        .find(|s| s.kind.id() == id)
        .cloned()
        .unwrap_or_else(default_shell)
}

/* ------------------------------------------------------------------ */
/* Process control                                                     */
/* ------------------------------------------------------------------ */
#[cfg(target_os = "windows")]
pub fn kill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x08000000)
        .output();
}

#[cfg(not(target_os = "windows"))]
pub fn kill_tree(pid: u32) {
    let _ = Command::new("kill").args(["-KILL", "--", &format!("-{}", pid)]).output();
    let _ = Command::new("kill").args(["-KILL", &pid.to_string()]).output();
}

type Running = Mutex<HashMap<String, (u32, Arc<AtomicBool>)>>;

fn running() -> &'static Running {
    static R: OnceLock<Running> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Stops a running `exec` by id. Returns whether something was running.
pub fn cancel(id: &str) -> bool {
    let entry = lock(running()).get(id).cloned();
    match entry {
        Some((pid, flag)) => {
            flag.store(true, Ordering::SeqCst);
            kill_tree(pid);
            true
        }
        None => false,
    }
}

pub fn cancel_all() -> usize {
    let ids: Vec<String> = lock(running()).keys().cloned().collect();
    ids.iter().filter(|id| cancel(id)).count()
}

/* ------------------------------------------------------------------ */
/* One-shot execution                                                  */
/* ------------------------------------------------------------------ */
pub struct ExecOut {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub cwd: Option<PathBuf>,
    pub timed_out: bool,
    pub cancelled: bool,
}

const BASH_PRELUDE: &str = "trap '{ pwd -W 2>/dev/null || pwd; } > \"$ZEUS_CWD_FILE\"' EXIT\n";
const PS_PRELUDE: &str = "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);$OutputEncoding=[Console]::OutputEncoding;\ntry {\n";
const PS_EPILOGUE: &str = "\n} finally { try { [System.IO.File]::WriteAllText($env:ZEUS_CWD_FILE,(Get-Location).Path) } catch {} }\nif ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n";

fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for ch in bytes.chunks(3) {
        let n = (ch[0] as u32) << 16 | (*ch.get(1).unwrap_or(&0) as u32) << 8 | *ch.get(2).unwrap_or(&0) as u32;
        s.push(T[(n >> 18 & 63) as usize] as char);
        s.push(T[(n >> 12 & 63) as usize] as char);
        s.push(if ch.len() > 1 { T[(n >> 6 & 63) as usize] as char } else { '=' });
        s.push(if ch.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    s
}

fn utf16le(s: &str) -> Vec<u8> {
    s.encode_utf16().flat_map(|u| u.to_le_bytes()).collect()
}

fn build_command(sh: &Shell, script: &str) -> Command {
    let mut c = Command::new(&sh.path);
    match sh.kind {
        Kind::Bash => {
            c.arg("-c").arg(format!("{}{}", BASH_PRELUDE, script));
        }
        Kind::Pwsh | Kind::WinPs => {
            let full = format!("{}{}{}", PS_PRELUDE, script, PS_EPILOGUE);
            c.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"])
                .arg(base64(&utf16le(&full)));
        }
        Kind::Cmd => {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                c.raw_arg(format!("/d /s /c \"{}\"", script));
            }
            #[cfg(not(target_os = "windows"))]
            {
                c.arg("-c").arg(script);
            }
        }
    }
    c
}

fn apply_env(c: &mut Command) {
    c.env("CI", "true")
        // Git must never block on a console prompt; credential helpers stay enabled.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_PAGER", "cat")
        .env("PAGER", "cat")
        .env("NPM_CONFIG_YES", "true")
        .env("PIP_NO_INPUT", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("NO_COLOR", "1")
        .env("TERM", "dumb")
        .env("MSYS_NO_PATHCONV", "1")
        .env_remove("GCM_INTERACTIVE");
    if let Some(p) = augmented_path() {
        c.env("PATH", p);
    }
}

#[derive(Default)]
struct Shared {
    combined: Vec<u8>,
    out: Vec<u8>,
    err: Vec<u8>,
}

const BUF_CAP: usize = 4 * 1024 * 1024;
const STREAM_CAP: usize = 1024 * 1024;

fn pump<R: Read + Send + 'static>(r: Option<R>, shared: Arc<Mutex<Shared>>, is_err: bool) -> Option<std::thread::JoinHandle<()>> {
    r.map(|mut r| {
        std::thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            loop {
                match r.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let mut s = lock(&shared);
                        if s.combined.len() < BUF_CAP {
                            s.combined.extend_from_slice(&chunk[..n]);
                        }
                        let dst = if is_err { &mut s.err } else { &mut s.out };
                        if dst.len() < BUF_CAP {
                            dst.extend_from_slice(&chunk[..n]);
                        }
                    }
                }
            }
        })
    })
}

/// Sends the not-yet-streamed, valid-UTF-8 prefix of the merged output to `on_chunk`.
fn flush_stream(shared: &Mutex<Shared>, sent: &mut usize, streamed: &mut usize, last: bool, on_chunk: &dyn Fn(&str)) {
    let bytes: Vec<u8> = {
        let s = lock(shared);
        if s.combined.len() <= *sent {
            return;
        }
        s.combined[*sent..].to_vec()
    };
    let valid = if last {
        bytes.len()
    } else {
        match std::str::from_utf8(&bytes) {
            Ok(_) => bytes.len(),
            Err(e) if e.error_len().is_none() => e.valid_up_to(),
            Err(_) => bytes.len(),
        }
    };
    if valid == 0 {
        return;
    }
    *sent += valid;
    if *streamed < STREAM_CAP {
        *streamed += valid;
        on_chunk(&String::from_utf8_lossy(&bytes[..valid]));
    }
}

/// Runs `script` in `shell` inside `cwd`. `id` makes the run cancellable via `cancel`.
pub fn exec(shell: &Shell, script: &str, cwd: &Path, timeout: Duration, id: &str, on_chunk: &dyn Fn(&str)) -> Result<ExecOut, String> {
    let cwd_file = std::env::temp_dir().join(format!("zeus-cwd-{}-{}", std::process::id(), SEQ.fetch_add(1, Ordering::Relaxed)));
    let mut c = build_command(shell, script);
    apply_env(&mut c);
    c.current_dir(cwd)
        .env("ZEUS_CWD_FILE", &cwd_file)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: no external console window ever appears.
        c.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        c.process_group(0);
    }
    let mut child = c
        .spawn()
        .map_err(|e| format!("Failed to start {} ({}): {}", shell.label(), shell.path.display(), e))?;
    let pid = child.id();
    let cancelled = Arc::new(AtomicBool::new(false));
    lock(running()).insert(id.to_string(), (pid, cancelled.clone()));

    let shared = Arc::new(Mutex::new(Shared::default()));
    let h1 = pump(child.stdout.take(), shared.clone(), false);
    let h2 = pump(child.stderr.take(), shared.clone(), true);

    let start = Instant::now();
    let mut last_flush = Instant::now();
    let (mut sent, mut streamed) = (0usize, 0usize);
    let mut timed_out = false;
    let mut code = -1;
    loop {
        match child.try_wait() {
            Ok(Some(s)) => {
                code = s.code().unwrap_or(-1);
                break;
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    kill_tree(pid);
                    let _ = child.kill();
                    let _ = child.wait();
                    timed_out = true;
                    break;
                }
                if last_flush.elapsed() >= Duration::from_millis(60) {
                    flush_stream(&shared, &mut sent, &mut streamed, false, on_chunk);
                    last_flush = Instant::now();
                }
                std::thread::sleep(Duration::from_millis(15));
            }
            Err(e) => {
                lock(running()).remove(id);
                return Err(format!("Failed to wait for command: {}", e));
            }
        }
    }
    lock(running()).remove(id);

    // Give the readers a short window to drain; a background grandchild holding a pipe can't wedge us.
    let drain = Instant::now();
    while drain.elapsed() < Duration::from_millis(400) {
        let d1 = h1.as_ref().map(|h| h.is_finished()).unwrap_or(true);
        let d2 = h2.as_ref().map(|h| h.is_finished()).unwrap_or(true);
        if d1 && d2 {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    flush_stream(&shared, &mut sent, &mut streamed, true, on_chunk);

    let (stdout, mut stderr) = {
        let s = lock(&shared);
        (String::from_utf8_lossy(&s.out).to_string(), String::from_utf8_lossy(&s.err).to_string())
    };
    let was_cancelled = cancelled.load(Ordering::SeqCst);
    let note = if timed_out {
        code = 124;
        Some(format!("command timed out after {}s and was stopped (no interactive input is available)", timeout.as_secs()))
    } else if was_cancelled {
        code = 130;
        Some("command cancelled".to_string())
    } else {
        None
    };
    if let Some(n) = note {
        if !stderr.is_empty() && !stderr.ends_with('\n') {
            stderr.push('\n');
        }
        stderr.push_str(&n);
        on_chunk(&format!("\n[{}]\n", n));
    }
    let new_cwd = std::fs::read_to_string(&cwd_file)
        .ok()
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| !p.as_os_str().is_empty() && p.is_dir());
    let _ = std::fs::remove_file(&cwd_file);
    Ok(ExecOut { code, stdout, stderr, cwd: new_cwd, timed_out, cancelled: was_cancelled })
}

/* ------------------------------------------------------------------ */
/* PTY sessions                                                        */
/* ------------------------------------------------------------------ */
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    scroll: Arc<Mutex<Vec<u8>>>,
    shell: Value,
    cwd: String,
}

type Ptys = Mutex<HashMap<String, PtySession>>;

fn ptys() -> &'static Ptys {
    static P: OnceLock<Ptys> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

const SCROLL_CAP: usize = 192 * 1024;

fn pty_args(kind: Kind) -> Vec<&'static str> {
    match kind {
        Kind::Bash => vec!["--login", "-i"],
        Kind::Pwsh | Kind::WinPs => vec!["-NoLogo"],
        Kind::Cmd => vec![],
    }
}

/// Opens an interactive shell on a fresh pseudo-terminal and starts streaming `zeus://pty` events.
pub fn pty_open(shell: &Shell, cwd: &Path, cols: u16, rows: u16) -> Result<Value, String> {
    let size = PtySize { rows: rows.max(2), cols: cols.max(8), pixel_width: 0, pixel_height: 0 };
    let pair = native_pty_system().openpty(size).map_err(|e| format!("Could not open a pseudo-terminal: {}", e))?;
    let mut cb = CommandBuilder::new(&shell.path);
    for a in pty_args(shell.kind) {
        cb.arg(a);
    }
    cb.cwd(cwd);
    cb.env("TERM", "xterm-256color");
    cb.env("COLORTERM", "truecolor");
    cb.env("CHERE_INVOKING", "1");
    cb.env("MSYS_NO_PATHCONV", "1");
    cb.env("GIT_PAGER", "cat");
    if let Some(p) = augmented_path() {
        cb.env("PATH", p);
    }
    let mut child = pair
        .slave
        .spawn_command(cb)
        .map_err(|e| format!("Failed to start {}: {}", shell.label(), e))?;
    drop(pair.slave);
    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = format!("pty{}-{}", std::process::id(), SEQ.fetch_add(1, Ordering::Relaxed));
    let scroll = Arc::new(Mutex::new(Vec::<u8>::new()));
    let info = shell.info();
    lock(ptys()).insert(
        id.clone(),
        PtySession { master: pair.master, writer, killer, scroll: scroll.clone(), shell: info.clone(), cwd: cwd.to_string_lossy().to_string() },
    );

    let rid = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut carry: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    {
                        let mut sc = lock(&scroll);
                        sc.extend_from_slice(&buf[..n]);
                        if sc.len() > SCROLL_CAP {
                            let cut = sc.len() - SCROLL_CAP;
                            sc.drain(..cut);
                        }
                    }
                    carry.extend_from_slice(&buf[..n]);
                    let valid = match std::str::from_utf8(&carry) {
                        Ok(_) => carry.len(),
                        Err(e) if e.error_len().is_none() => e.valid_up_to(),
                        Err(_) => carry.len(),
                    };
                    if valid > 0 {
                        let text = String::from_utf8_lossy(&carry[..valid]).to_string();
                        carry.drain(..valid);
                        emit("zeus://pty", json!({ "id": rid, "data": text }));
                    }
                }
            }
        }
    });

    // The waiter owns the child; dropping the session afterwards closes the pseudo-console so the reader ends.
    let wid = id.clone();
    std::thread::spawn(move || {
        let code = child.wait().map(|s| s.exit_code() as i64).unwrap_or(-1);
        let removed = lock(ptys()).remove(&wid);
        drop(removed);
        emit("zeus://pty-exit", json!({ "id": wid, "code": code }));
    });

    Ok(json!({ "id": id, "shell": info, "cwd": cwd.to_string_lossy() }))
}

pub fn pty_write(id: &str, data: &str) -> Result<(), String> {
    let mut map = lock(ptys());
    let s = map.get_mut(id).ok_or_else(|| "terminal session has ended".to_string())?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

pub fn pty_resize(id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let map = lock(ptys());
    let s = map.get(id).ok_or_else(|| "terminal session has ended".to_string())?;
    s.master
        .resize(PtySize { rows: rows.max(2), cols: cols.max(8), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

pub fn pty_close(id: &str) {
    let removed = lock(ptys()).remove(id);
    if let Some(mut s) = removed {
        let _ = s.killer.kill();
    }
}

/// Replays what a session printed so far (used when the Terminal panel is re-opened).
pub fn pty_attach(id: &str) -> Option<Value> {
    let map = lock(ptys());
    let s = map.get(id)?;
    let text = String::from_utf8_lossy(&lock(&s.scroll)).to_string();
    Some(json!({ "id": id, "shell": s.shell, "cwd": s.cwd, "scrollback": text }))
}

pub fn pty_close_all() {
    let ids: Vec<String> = lock(ptys()).keys().cloned().collect();
    for id in ids {
        pty_close(&id);
    }
}

pub fn pty_alive(id: &str) -> bool {
    lock(ptys()).contains_key(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_reference() {
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"Ma"), "TWE=");
        assert_eq!(base64(b"M"), "TQ==");
    }

    #[test]
    fn exec_streams_and_tracks_cwd() {
        let sh = default_shell();
        let dir = std::env::temp_dir();
        let chunks = Mutex::new(String::new());
        let out = exec(&sh, "echo hello; echo oops 1>&2; cd /; exit 3", &dir, Duration::from_secs(10), "t1", &|t| chunks.lock().unwrap().push_str(t)).unwrap();
        assert_eq!(out.code, 3);
        assert!(out.stdout.contains("hello"));
        assert!(out.stderr.contains("oops"));
        assert!(chunks.lock().unwrap().contains("hello"));
        assert_eq!(out.cwd.as_deref(), Some(Path::new("/")));
    }

    #[test]
    fn exec_times_out() {
        let sh = default_shell();
        let out = exec(&sh, "sleep 30", &std::env::temp_dir(), Duration::from_millis(300), "t2", &|_| {}).unwrap();
        assert!(out.timed_out);
        assert_eq!(out.code, 124);
    }

    #[test]
    fn pty_roundtrip() {
        let sh = default_shell();
        let v = pty_open(&sh, &std::env::temp_dir(), 80, 24).unwrap();
        let id = v["id"].as_str().unwrap().to_string();
        pty_write(&id, "echo zeus_pty_ok\n").unwrap();
        let mut seen = false;
        for _ in 0..60 {
            std::thread::sleep(Duration::from_millis(100));
            if let Some(a) = pty_attach(&id) {
                if a["scrollback"].as_str().unwrap_or("").matches("zeus_pty_ok").count() >= 2 {
                    seen = true;
                    break;
                }
            }
        }
        pty_close(&id);
        assert!(seen);
    }
}
