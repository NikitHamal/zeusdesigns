# Zeus OpenDesign (`open-design` Experimental Branch)

Open-source, ultra-light **native Windows** Collaborative AI Design, **HyperFrames Code-to-Video**, **Open-Slide 1920×1080 Deck**, and **Zeus Harness²** Coding Workspace — adapted from [`nexu-io/open-design`](https://github.com/nexu-io/open-design) and Google Research [`harness2`](https://github.com/google-research/harness2), powered by 40 free keyless AI providers under 17 MB physical RAM.

- **Deliverable Modes**: Interactive Prototype (`1440×900` / `390×844`), **HyperFrames Video (Code-to-Video)** (`16:9` `1920×1080`, `9:16` `1080×1920`, `1:1` `1080×1080` with multi-scene timeline scrubber & client-side `.mp4`/`.webm` video recorder), **Open-Slide 1920×1080 Deck** (with slide thumbnail rail & speaker notes), **OpenMotion Kinetic Poster**, **Brand & `DESIGN.md` Kit**, and **Zeus Harness² Code Agent**.
- **Brand & `DESIGN.md` Systems**: 12 curated `DESIGN.md` brand systems (Material 3 Expressive, Claude Warm, Linear Precision, Stripe Financial, Vercel Geist, Supabase Studio, Apple HIG, Teenage Engineering Field, Porsche Weissach, Cash App Kinetic, Open-Slide Ash & Lime, Swiss International Grid) + 13 Zeus Design Systems.
- **Direct DOM Element Inspector**: Click any element in the live preview to edit text, colors, font size, or padding directly, or queue a targeted element refinement for the AI agent.

| | |
|---|---|
| **Shell / engine** | Rust + C++20 + Tauri 2 (single-process WebView2 + Win32 working-set trimmer + Shadow DOM renderer, <19 MB RAM, ~1.6 MB installer) |
| **UI** | React + Material 3 Expressive (the app's own theme *and* a built-in design skill) |
| **Canvas** | Docked Figma/Penpot/Onlook Studio with Top Bar, Left Assets & Screens Rail, Right 4-Tab Inspector (`Design`, `Insert`, `Layers`, `Code`), infinite pan/zoom, live interactive mobile/tablet/web previews, variants, compare |
| **Tools** | 8 Quick Primitives + 38+ draggable UI blocks + 6 Full Layouts, on-canvas element toolbar (`↑`, `↓`, `⧉`, `⊞`, `✕`) + 8-point resize handles, select, pan, text, frame, sticky notes, pen, shapes, pin-comments, **Ask Zeus** (`Ctrl+K`) |
| **AI** | 40 free keyless providers: OpenCode Zen, Mercury 3, FreeLLM Hub, AI Bridge Gateway, HF Router Hub, LiteLLM Frontier Hub, Gemini Web Gateway, Kilo Gateway, NVIDIA NIM Cloud, Colibri Qwen 3.6, Gemma 4 Vision Studio, Phi-4 Cloud, Llama.cpp LFM Cloud, Ollama Cloud, Gemma 4 Flagship Cluster, Frontier Lab, Liquid AI LFM, Bonsai Ternary, Unsloth Cloud, KoboldAI Cloud, BlockRun, OVHcloud AI, FreeClaude & Gemini 4, VLM Run, Together Frontier, HF Cluster, AI Horde, APIsFreeLLM, Qwen, Ptero Frontier, Unikey, LLM7, Pollinations, YQCloud, DeepAI, K2Horizon, Motif, LongCat, Gemini Web, ChatJimmy + Local OpenAI/OpenCode Server (`127.0.0.1:11435`) |
| **Workspace** | Open any local folder; the agent reads, designs, edits and syncs live screens into real files. Persistent Memory, shell tool, MCP client |
| **Library** | Design systems: Material 3 Expressive, Material 3, Apple HIG, Fluent 2, shadcn/ui, IBM Carbon, Ant Design, Polaris, Atlassian, Neo-brutalism, Glassmorphism, Editorial, Claude Warm · 17 frontend skills |

## What is inside

- **Chat and canvas**: sidebar with date-grouped chats, a split chat and infinite canvas, one model and effort picker, per-screen export, pages.
- **Memory**: four buckets (preferences, profile, topics, areas) that you can edit by hand or by telling Zeus what to change. Stored natively in `.zeusdesigns/memory.json` and added to every prompt.
- **Connectors**: Zeus Studio (built-in, offline: brief, palette, contrast, fonts, icons, components, tokens, screen lint), design token and workspace tools, plus a store of real keyless MCP servers (shadcn/ui, Magic UI, Playwright, Chrome DevTools, Context7, Fetch, DuckDuckGo, Open WebSearch, Wikipedia, MarkItDown, Filesystem, Knowledge graph, Sequential thinking, Time) and custom stdio servers. Node.js (npx) or uv (uvx) must be installed for the server you pick.
- **Harness**: per-design-system component kit, archetype blueprints, a tool loop that feeds results back to the model, and an automatic layout audit that renders each screen off-screen, measures overflow, overlap, contrast, clipping and dead space, then repairs severe defects.

## Download
Every push to `main` builds and publishes a Windows installer + portable `.exe` to
[Releases](../../releases/latest).

## Updates
The app checks the latest GitHub Release on start and from Settings > Updates, downloads the installer with progress, and restarts into the new version.

## Shortcuts
`V` select · `H` pan (or hold `Space`) · `F` frame · `T` text · `N` note · `P` pen · `S` shapes · `C` pin comment ·
`Ctrl+K` Ask Zeus · `1` fit all · `2` zoom to selection · `Ctrl+D` duplicate as variant · `Del` delete · double-click a screen to interact with it

## Agent
Chat is the default. Zeus routes each message: questions go to chat, engineering work to the coding agent (read, search, `edit_file`, write, shell, tests), and only visual deliverables to the canvas. Artifacts open beside the chat. Under the model picker, `OpenCode` runs the turn through the OpenCode SDK (`npm i -g opencode-ai`) with the free Zeus models.

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
