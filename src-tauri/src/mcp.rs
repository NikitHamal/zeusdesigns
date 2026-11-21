use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;

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
        let mut guard = match self.servers.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let id = format!(
            "mcp-{}",
            name.to_lowercase()
                .chars()
                .map(|c| if c.is_alphanumeric() { c } else { '-' })
                .collect::<String>()
        );
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
                if let Ok(discovered) = query_stdio_mcp_tools(&s) {
                    tools.extend(discovered);
                }
            }
        }
        tools
    }
}

fn query_stdio_mcp_tools(server: &McpServer) -> Result<Vec<McpTool>, String> {
    let mut child = Command::new(&server.command)
        .args(&server.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "ZeusDesigns", "version": "0.1.0" }
            }
        });
        let list_req = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        });
        let _ = writeln!(stdin, "{}", init_req);
        let _ = writeln!(stdin, "{}", list_req);
        let _ = stdin.flush();
    }

    let mut out = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines().take(10).flatten() {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                if v.get("id").and_then(|i| i.as_i64()) == Some(2) {
                    if let Some(arr) = v
                        .get("result")
                        .and_then(|r| r.get("tools"))
                        .and_then(|t| t.as_array())
                    {
                        for item in arr {
                            out.push(McpTool {
                                server_id: server.id.clone(),
                                server_name: server.name.clone(),
                                name: item
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("tool")
                                    .to_string(),
                                description: item
                                    .get("description")
                                    .and_then(|d| d.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                input_schema: item
                                    .get("inputSchema")
                                    .cloned()
                                    .unwrap_or_else(|| json!({})),
                            });
                        }
                    }
                    break;
                }
            }
        }
    }
    let _ = child.kill();
    Ok(out)
}

#[tauri::command]
pub fn mcp_list(registry: tauri::State<'_, McpRegistry>) -> Vec<McpServer> {
    registry.list()
}

#[tauri::command]
pub fn mcp_add(
    name: String,
    command: String,
    args: Option<Vec<String>>,
    transport: Option<String>,
    registry: tauri::State<'_, McpRegistry>,
) -> Vec<McpServer> {
    registry.add(name, command, args, transport)
}

#[tauri::command]
pub fn mcp_remove(id: String, registry: tauri::State<'_, McpRegistry>) -> Vec<McpServer> {
    registry.remove(&id)
}

#[tauri::command]
pub fn mcp_tools(registry: tauri::State<'_, McpRegistry>) -> Vec<McpTool> {
    registry.discover_tools()
}
