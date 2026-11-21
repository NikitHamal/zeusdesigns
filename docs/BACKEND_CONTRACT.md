# ZeusDesigns — UI ⇄ Native Backend Contract

The UI (`/src`, React + Material 3 Expressive) talks to the Rust engine (`/src-tauri`) through
Tauri `invoke` commands and events. The UI wrapper lives in `src/lib/bridge.ts`; **every command has a
browser fallback** so the UI is fully usable without the engine (demo engine + localStorage).

## Commands (`invoke`)

| Command | Args | Returns |
|---|---|---|
| `app_info` | – | `{name, version, native, engine}` |
| `providers_list` | – | `ProviderInfo[]` (id, name, kind: `keyless`/`openai`/`anthropic`, models[], speed, status) |
| `chat_stream` | `ChatRequest` | `{requestId}` – stream arrives as events |
| `chat_cancel` | `{requestId}` | – |
| `title_generate` | `{text}` | `string` (ChatJimmy micro-task: ≤6 word conversation title) |
| `workspace_open` | `{path}` | `{root, name}` |
| `workspace_tree` | `{root, depth?}` | `FileNode[]` (name, path, dir, children?) |
| `fs_read` / `fs_write` | `{root, path, content?}` | `string` / `()` |
| `shell_run` | `{root, cmd}` | `{code, stdout, stderr}` |
| `memory_list` / `memory_add` / `memory_delete` | `{text}` / `{id}` | `MemoryItem[]` |
| `mcp_list` / `mcp_add` / `mcp_remove` / `mcp_tools` | server config | status / tools |

### `ChatRequest`
```ts
{ requestId: string,
  provider: string,            // "mercury3" | "motif" | "k2horizon" | "qwen" | "deepai" | "longcat" | "geminiweb" | "chatjimmy" | "custom:<id>"
  model: string,
  effort: "low" | "medium" | "high" | "max",
  system: string,              // design-system + skills + memory prompt assembled by the UI
  messages: { role: "user" | "assistant", content: string, attachments?: {name, mime, dataUrl}[] }[],
  workspaceRoot?: string,      // enables agent tools: read_file, write_file, list_dir, shell, mcp:*
  custom?: { baseUrl: string, apiKey: string, format: "openai" | "anthropic" } }
```

## Events (`listen`)

`zeus://chat/<requestId>` payload, one of:
```ts
{ type: "delta", text: string }
{ type: "tool_call", id, name, args }
{ type: "tool_result", id, ok: boolean, output: string }
{ type: "done", usage?: {inputTokens, outputTokens, tokensPerSecond} }
{ type: "error", message: string }
```

## Model output protocol (design generation)

The assistant emits live screens as tagged HTML blocks that the canvas renders in real time:

```
<artboard name="Home" device="mobile" id="optional-existing-id" mode="new|revise">
  <!doctype html>… complete self-contained HTML/CSS/JS …
</artboard>
```
`mode="revise"` + `id` replaces the HTML of an existing artboard (as a new version).
