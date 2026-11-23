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
| `workspace_search` | `{root, query, limit?}` | `{path, line, snippet}[]` |
| `fs_read` / `fs_write` | `{root, path, content?}` | `string` / `()` |
| `shell_run` | `{root, cmd}` | `{code, stdout, stderr}` |
| `memory_list` / `memory_add` / `memory_delete` | `{text}` / `{id}` | `MemoryItem[]` |
| `mcp_list` / `mcp_add` / `mcp_remove` / `mcp_tools` / `mcp_call` | server config / `{tool, args}` | status / tools / result |
| `perf_stats` / `perf_trim` / `perf_set_auto` | – / – / `{enabled}` | `PerfStats` / `TrimReport` / `PerfStats` |

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

## Linking the C++20 engine (`/include/zeus`, `/engine`) into the Tauri shell

The shell is Rust (Tauri 2 / WebView2). The native C++ engine plugs in through a **C ABI**:

1. Expose a flat C surface in the engine (e.g. `zeus_chat_stream(const char* req_json, void (*cb)(const char* event_json, void* ud), void* ud)`,
   `zeus_cancel`, `zeus_title`, `zeus_workspace_tree`, `zeus_memory_*`, `zeus_mcp_*`). JSON strings in/out keep ABI trivial.
2. In `src-tauri/Cargo.toml` add `cc = "1"` under `[build-dependencies]` and compile the engine in `src-tauri/build.rs`
   (`cc::Build::new().cpp(true).std("c++20").files(...).compile("zeus_engine")`) before `tauri_build::build()`.
3. In a new `src-tauri/src/engine.rs` declare the `extern "C"` functions and wrap them as `#[tauri::command]`s from the table above;
   forward callback JSON to the window with `app.emit(&format!("zeus://chat/{request_id}"), payload)`.
4. Register the commands in `lib.rs` (`invoke_handler`). The UI flips to the native path automatically as soon as
   `providers_list` resolves (`ui.nativeReady`), no UI change needed.

Provider slugs sent by the UI: `mercury3`, `kilo`, `blockrun`, `ovhcloud`, `apisfreellm`, `qwen`, `ptero`, `unikey`, `llm7`, `pollinations`, `yqcloud`, `deepai`, `k2horizon`, `motif`, `longcat`, `geminiweb`, `chatjimmy`, `custom`.
Unknown model ids must fall back to the provider's default model.
Multimodal image/file attachments (`messages[*].attachments`) are supported natively across `kilo` (`image_url`), `blockrun` (`image_url`), `ovhcloud` (`image_url`), `qwen` (`/api/v2/files/getstsToken` + `OSS4-HMAC-SHA256` OSS PUT + `files`), `deepai` (`generateIslandKey` + `/chat_attachments/upload` + `attachment_uuids`), `ptero` (`attachments`), and `custom` (OpenAI `image_url` / Anthropic `image` base64).

## Updater
- `update_check() -> { current, latest, available, pageUrl, publishedAt, installerUrl, installerName, size }` reads `releases/latest` of `NikitHamal/zeusdesigns`; `available` needs a newer tag and a `*setup.exe` asset.
- `update_install(url, name)` accepts only `https://github.com/NikitHamal/zeusdesigns/releases/download/...`, streams the installer to the temp dir emitting `zeus://update/progress { done, total }`, starts it with `/P /R /UPDATE`, then exits the app.
