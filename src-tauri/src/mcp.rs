use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub id: String,
    pub name: String,
    #[serde(default = "default_transport")]
    pub transport: String, // "stdio" | "http"
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub status: String,
}

fn default_transport() -> String {
    "stdio".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub server_id: String,
    pub server_name: String,
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

pub struct McpRegistry {
    pub servers: Mutex<Vec<McpServer>>,
    pub storage_path: PathBuf,
}

impl Default for McpRegistry {
    fn default() -> Self {
        let base = std::env::var("APPDATA")
            .or_else(|_| std::env::var("HOME"))
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir());
        let dir = base.join(".zeusdesigns");
        let _ = fs::create_dir_all(&dir);
        let storage_path = dir.join("mcp_servers.json");
        let servers = if let Ok(raw) = fs::read_to_string(&storage_path) {
            serde_json::from_str::<Vec<McpServer>>(&raw).unwrap_or_default()
        } else {
            vec![
                McpServer {
                    id: "mcp-design-tokens".to_string(),
                    name: "Zeus Material 3 Design Tokens MCP".to_string(),
                    transport: "builtin".to_string(),
                    command: "builtin://design-tokens".to_string(),
                    args: vec![],
                    status: "connected".to_string(),
                },
                McpServer {
                    id: "mcp-filesystem".to_string(),
                    name: "Zeus Local Codebase Sync MCP".to_string(),
                    transport: "builtin".to_string(),
                    command: "builtin://workspace-sync".to_string(),
                    args: vec![],
                    status: "connected".to_string(),
                },
            ]
        };
        Self {
            servers: Mutex::new(servers),
            storage_path,
        }
    }
}

impl McpRegistry {
    pub fn persist(&self, list: &[McpServer]) {
        if let Ok(raw) = serde_json::to_string_pretty(list) {
            let _ = fs::write(&self.storage_path, raw);
        }
    }

    pub fn list(&self) -> Vec<McpServer> {
        self.servers.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn add(&self, name: String, command: String, args: Option<Vec<String>>, transport: Option<String>) -> Vec<McpServer> {
        self.add_with_id(None, name, command, args, transport)
    }

    pub fn add_with_id(
        &self,
        custom_id: Option<String>,
        name: String,
        command: String,
        args: Option<Vec<String>>,
        transport: Option<String>,
    ) -> Vec<McpServer> {
        let mut guard = match self.servers.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let id = custom_id.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| {
            format!(
                "mcp-{}",
                name.to_lowercase()
                    .chars()
                    .map(|c| if c.is_alphanumeric() { c } else { '-' })
                    .collect::<String>()
            )
        });
        let t = transport.unwrap_or_else(|| {
            if command.starts_with("http://") || command.starts_with("https://") {
                "http".to_string()
            } else if command.starts_with("builtin://") {
                "builtin".to_string()
            } else {
                "stdio".to_string()
            }
        });
        guard.retain(|s| s.id != id);
        guard.push(McpServer {
            id,
            name,
            transport: t,
            command,
            args: args.unwrap_or_default(),
            status: "connected".to_string(),
        });
        self.persist(&guard);
        guard.clone()
    }

    pub fn remove(&self, id: &str) -> Vec<McpServer> {
        let mut guard = match self.servers.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        guard.retain(|s| s.id != id);
        self.persist(&guard);
        guard.clone()
    }

    pub fn discover_tools(&self) -> Vec<McpTool> {
        let servers = self.list();
        let mut tools = Vec::new();
        for s in servers {
            if s.transport == "builtin" {
                if s.command.contains("design-tokens") {
                    tools.push(McpTool {
                        server_id: s.id.clone(),
                        server_name: s.name.clone(),
                        name: "get_design_tokens".to_string(),
                        description: "Retrieve Material 3 Expressive, Apple HIG, Fluent 2, or shadcn CSS custom property tokens.".to_string(),
                        input_schema: json!({
                            "type": "object",
                            "properties": {
                                "system": { "type": "string", "description": "m3-expressive | apple-hig | fluent2 | shadcn" }
                            }
                        }),
                    });
                } else if s.command.contains("workspace-sync") {
                    tools.push(McpTool {
                        server_id: s.id.clone(),
                        server_name: s.name.clone(),
                        name: "sync_artboard_to_file".to_string(),
                        description: "Synchronize a live canvas HTML/React/Kotlin screen variant directly to a file in the open local workspace.".to_string(),
                        input_schema: json!({
                            "type": "object",
                            "properties": {
                                "path": { "type": "string" },
                                "content": { "type": "string" }
                            },
                            "required": ["path", "content"]
                        }),
                    });
                }
            } else if s.transport == "stdio" {
                let key = format!("{}|{}|{:?}", s.id, s.command, s.args);
                let cached = tool_cache().lock().ok().and_then(|g| g.get(&key).cloned());
                if let Some(c) = cached {
                    tools.extend(c);
                    continue;
                }
                if let Ok(discovered) = query_stdio_mcp_tools(&s) {
                    if !discovered.is_empty() {
                        if let Ok(mut g) = tool_cache().lock() {
                            g.insert(key, discovered.clone());
                        }
                    }
                    tools.extend(discovered);
                }
            }
        }
        tools
    }
}

static TOOL_CACHE: OnceLock<Mutex<HashMap<String, Vec<McpTool>>>> = OnceLock::new();

fn tool_cache() -> &'static Mutex<HashMap<String, Vec<McpTool>>> {
    TOOL_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn spawn_server(server: &McpServer) -> Result<std::process::Child, String> {
    let (prog, extra): (String, Vec<String>) = if server.args.is_empty() && server.command.trim().contains(' ') {
        let mut it = server.command.split_whitespace().map(|s| s.to_string());
        let p = it.next().unwrap_or_default();
        (p, it.collect())
    } else {
        (server.command.clone(), server.args.clone())
    };
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(&prog);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = Command::new(&prog);
    cmd.args(&extra)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.spawn()
        .map_err(|e| format!("could not start '{}': {}", prog, e))
}

fn read_until_id(rx: &Receiver<Value>, id: i64, deadline: Instant) -> Result<Value, String> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return Err("MCP server timed out".to_string());
        }
        match rx.recv_timeout(deadline - now) {
            Ok(v) => {
                if v.get("id").and_then(|i| i.as_i64()) == Some(id) {
                    if let Some(e) = v.get("error") {
                        return Err(e.to_string());
                    }
                    return Ok(v.get("result").cloned().unwrap_or(Value::Null));
                }
            }
            Err(_) => return Err("MCP server closed or timed out".to_string()),
        }
    }
}

/// One full MCP session: initialize, initialized notification, a single request, then shut the server down.
fn mcp_rpc(server: &McpServer, method: &str, params: Value, secs: u64) -> Result<Value, String> {
    let mut child = spawn_server(server)?;
    let mut stdin = child.stdin.take().ok_or_else(|| "no stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "no stdout".to_string())?;
    let (tx, rx) = mpsc::channel::<Value>();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                if tx.send(v).is_err() {
                    break;
                }
            }
        }
    });
    let deadline = Instant::now() + Duration::from_secs(secs);
    let mut send = |v: Value| {
        let _ = writeln!(stdin, "{}", v);
        let _ = stdin.flush();
    };
    send(json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "ZeusDesigns", "version": "0.1.0" }
        }
    }));
    let out: Result<Value, String> = (|| {
        read_until_id(&rx, 1, deadline)?;
        send(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
        send(json!({ "jsonrpc": "2.0", "id": 2, "method": method, "params": params }));
        read_until_id(&rx, 2, deadline)
    })();
    let _ = child.kill();
    let _ = child.wait();
    out
}

fn query_stdio_mcp_tools(server: &McpServer) -> Result<Vec<McpTool>, String> {
    let res = mcp_rpc(server, "tools/list", json!({}), 90)?;
    let mut out = Vec::new();
    if let Some(arr) = res.get("tools").and_then(|t| t.as_array()) {
        for item in arr {
            out.push(McpTool {
                server_id: server.id.clone(),
                server_name: server.name.clone(),
                name: item.get("name").and_then(|n| n.as_str()).unwrap_or("tool").to_string(),
                description: item.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                input_schema: item.get("inputSchema").cloned().unwrap_or_else(|| json!({})),
            });
        }
    }
    Ok(out)
}

pub fn call_stdio_mcp_tool(server: &McpServer, tool_name: &str, args: &Value) -> Result<String, String> {
    let res = mcp_rpc(server, "tools/call", json!({ "name": tool_name, "arguments": args }), 120)?;
    let mut text = String::new();
    if let Some(arr) = res.get("content").and_then(|c| c.as_array()) {
        for part in arr {
            if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                if !text.is_empty() {
                    text.push('\n');
                }
                text.push_str(t);
            } else if let Some(ty) = part.get("type").and_then(|t| t.as_str()) {
                text.push_str(&format!("[{} content omitted]", ty));
            }
        }
    }
    if text.is_empty() {
        text = serde_json::to_string_pretty(&res).unwrap_or_default();
    }
    if res.get("isError").and_then(|b| b.as_bool()) == Some(true) {
        return Err(text);
    }
    Ok(text)
}

impl McpRegistry {
    pub fn invoke_tool(&self, spec: &str, raw_args: &str) -> (bool, String) {
        let clean = spec.strip_prefix("mcp:").unwrap_or(spec);
        if clean.contains("design-tokens") || clean == "get_design_tokens" {
            let sys = if raw_args.trim().is_empty() { "m3-expressive" } else { raw_args.trim() };
            let tokens = json!({
                "system": sys,
                "tokens": {
                    "--md-sys-color-primary": "#D0BCFF",
                    "--md-sys-color-on-primary": "#381E72",
                    "--md-sys-color-primary-container": "#4F378B",
                    "--md-sys-color-secondary-container": "#4A4458",
                    "--md-sys-color-tertiary-container": "#633B48",
                    "--md-sys-color-surface": "#141218",
                    "--md-sys-color-surface-container": "#211F26",
                    "--md-sys-motion-spring-fast": "cubic-bezier(0.22, 1.25, 0.36, 1)",
                    "--md-sys-shape-corner-extra-large": "28px"
                }
            });
            return (true, serde_json::to_string_pretty(&tokens).unwrap_or_default());
        }

        let (sid, tool) = match clean.split_once(':') {
            Some((a, b)) => (a.to_string(), b.to_string()),
            None => (String::new(), clean.to_string()),
        };
        if tool == "sync_artboard_to_file" {
            return (false, "Use the write_file tool to save a screen into the project folder".to_string());
        }
        let parsed_args: Value = serde_json::from_str(raw_args).unwrap_or_else(|_| json!({ "input": raw_args }));
        let servers = self.list();
        if let Some(s) = servers.iter().find(|s| s.transport == "stdio" && !sid.is_empty() && s.id == sid) {
            return match call_stdio_mcp_tool(s, &tool, &parsed_args) {
                Ok(o) => (true, o),
                Err(e) => (false, e),
            };
        }
        (
            false,
            format!("No connected MCP server '{}' exposes the tool '{}'", sid, tool),
        )
    }
}

#[tauri::command(async)]
pub fn mcp_call(
    tool: String,
    args: Option<String>,
    registry: tauri::State<'_, McpRegistry>,
) -> Result<Value, String> {
    let (ok, output) = registry.invoke_tool(&tool, args.as_deref().unwrap_or("{}"));
    Ok(json!({ "ok": ok, "output": output }))
}

#[tauri::command(async)]
pub fn mcp_list(registry: tauri::State<'_, McpRegistry>) -> Result<Vec<McpServer>, String> {
    Ok(registry.list())
}

#[derive(Debug, Clone, Deserialize)]
pub struct McpServerInput {
    pub id: Option<String>,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub transport: Option<String>,
}

#[tauri::command(async)]
pub fn mcp_add(
    server: Option<McpServerInput>,
    name: Option<String>,
    command: Option<String>,
    args: Option<Vec<String>>,
    transport: Option<String>,
    registry: tauri::State<'_, McpRegistry>,
) -> Result<Vec<McpServer>, String> {
    if let Some(s) = server {
        Ok(registry.add_with_id(s.id, s.name, s.command, s.args, s.transport))
    } else {
        Ok(registry.add_with_id(
            None,
            name.unwrap_or_else(|| "Custom MCP".to_string()),
            command.unwrap_or_default(),
            args,
            transport,
        ))
    }
}

#[tauri::command(async)]
pub fn mcp_remove(id: String, registry: tauri::State<'_, McpRegistry>) -> Result<Vec<McpServer>, String> {
    Ok(registry.remove(&id))
}

#[tauri::command(async)]
pub fn mcp_tools(registry: tauri::State<'_, McpRegistry>) -> Result<Vec<McpTool>, String> {
    Ok(registry.discover_tools())
}
