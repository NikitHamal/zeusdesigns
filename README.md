# ⚡ ZeusDesigns

Open-source, ultra-light **native Windows** AI design & coding workspace — a Claude Design–style
split-screen studio with an infinite multi-artboard canvas, free keyless AI providers and a full agent toolbox.

| | |
|---|---|
| **Shell / engine** | Rust + Tauri 2 (WebView2) — ~1.6 MB installer, no Electron, no bundled Chromium |
| **UI** | React + Material 3 Expressive (the app's own theme *and* a built-in design skill) |
| **Canvas** | Infinite pan/zoom, multi-artboard, live interactive mobile/tablet/web previews, variants, compare (side-by-side + slider), canvas / grid / single views, pages |
| **Tools** | Select, pan, text, frame, sticky notes, freehand pen, shapes, pin-comments with inline quoted threads, floating **Ask Zeus** bar (`Ctrl+K`) |
| **AI** | Mercury 3, Gemini Web, Qwen, K2Horizon, Motif, DeepAI, LongCat (keyless) + any OpenAI/Anthropic-compatible endpoint. ChatJimmy (20k+ tok/s) auto-titles chats |
| **Workspace** | Open any local folder; the agent reads, designs, edits and syncs live screens into real files. Persistent Memory, shell tool, MCP client |
| **Library** | Design systems: Material 3 Expressive, Material 3, Apple HIG, Fluent 2, shadcn/ui, IBM Carbon, Ant Design, Polaris, Atlassian, Neo-brutalism, Glassmorphism, Editorial, Claude Warm · 17 frontend skills |

## Download
Every push to `main` builds and publishes a Windows installer + portable `.exe` to
[Releases](../../releases/latest).

## Shortcuts
`V` select · `H` pan (or hold `Space`) · `F` frame · `T` text · `N` note · `P` pen · `S` shapes · `C` pin comment ·
`Ctrl+K` Ask Zeus · `1` fit all · `2` zoom to selection · `Ctrl+D` duplicate as variant · `Del` delete · double-click a screen to interact with it

## Native Engine Architecture (`src-tauri` + `engine/zeus_engine.cpp`)
- **Keyless AI Provider Engine (`src-tauri/src/providers.rs`, `engine/zeus_engine.cpp`)**:
  - **Mercury 3** (`chat.inceptionlabs.ai`): 1,000–2,000+ tok/s diffusion LLM with automatic `/api/session` token caching and 403 rotation.
  - **ChatJimmy** (`chatjimmy.ai/api/chat`): 20,000+ tok/s Llama 3.1 8B instant conversation title generator and micro-task engine with `<|stats|>` / `<|think|>` tag stripping and `X-Real-IP` rotation.
  - **Qwen** (`chat.qwen.ai/api/v2`): Native Android App Gateway (`X-Platform: android`, `app_waf`) with automatic `0mail.tech` account provisioning and `.zeusdesigns/qwen_pool.json` rotation.
  - **K2Horizon** (`chat.ifm.ai`): IFM/K2-Horizon-375B-A23B guest SSE stream with cumulative `<details type="reasoning">` delta extraction.
  - **Motif** (`chat.motiftech.io`): Enterprise guest SSE stream (`motif-102b`, `motif-12-7b-reasoning`) with `shared.data.conversation_id` tracking.
  - **DeepAI** (`api.deepai.org`): Pure Rust & C++20 triple-SHA-256 `tryit-{rand}-{hash}` key generator.
  - **LongCat** (`longcat.chat`): LongCat 2.5 1.6T MoE `chat-completion-oversea-V2` stream.
  - **Gemini Web** (`gemini.google.com/app`): Anonymous `FdrFJe` / `cfb2h` / `SNlM0e` warmup and `StreamGenerate` `wrb.fr` parser.
  - **Custom BYOK**: Full OpenAI-compatible (`/v1/chat/completions`) and Anthropic (`/v1/messages`) streaming support.
- **Workspace Indexer, Persistent Memory & MCP (`workspace.rs`, `memory.rs`, `mcp.rs`, `agent.rs`)**:
  - Recursive codebase indexer, safe file read/write/sync, shell execution, `.zeusdesigns/memory.json` persistence, and JSON-RPC 2.0 MCP tool discovery.

## Develop
```
npm install
npm run dev            # UI only in the browser (demo engine fallback)
npx tauri dev          # full native app (needs Rust + WebView2)
npx tauri build        # installer
```
See `docs/BACKEND_CONTRACT.md` for the UI ⇄ engine API.
