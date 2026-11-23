# CONTINUITY.md

Running log across agent sessions. Newest session first. Rules live in `AGENTS.md`.

## Current state
- Engine: 14 free keyless providers (`mercury3`, `kilo`, `qwen`, `ptero`, `unikey`, `llm7`, `pollinations`, `yqcloud`, `deepai`, `k2horizon`, `motif`, `longcat`, `geminiweb`, `chatjimmy`) with live-verified end-to-end multimodal image/file uploading (`kilo` multimodal `image_url` across `nvidia/nemotron-3.5-super-vl:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, `openrouter/free`, `inclusionai/ling-3.2-flash:free`, `particle-ai/particle-1:free`, `dots-studio/dots-3-note-preview:free` with 16k `max_tokens`; `qwen` `/api/v2/files/getstsToken` + `OSS4-HMAC-SHA256` OSS PUT + v2.1 `chats/new` model binding + `fid` + `safety: {enabled: false}` + `thinking_mode: "Auto"` `files` across `qwen4-max`, `qwen3.8-max`, `qwen3.7-max`, `qwen3.8-omni-flash`, `qwen3.5-omni-plus`, `qwen3.7-plus`; and `ptero` `/wp-json/mlp/v1/chat-stream` SSE streaming with `mode: "smart"` + `conversation_id` + `activity.thinking` extraction across `gpt-6.1-terra:voyage` and `agnes-2.5-flash:agnes`), client-side 64px–1280px image normalization (`normalizeImageDataUrl` so NVIDIA VL screening never rejects small icons), vision-aware automatic failover, and sub-19MB Win32 working-set governance (`GetProcessHeaps` + `HeapCompact` + `MEMORY_PRIORITY_VERY_LOW` + 18MB threshold). Stable.
- UI & Canvas: Docked 3-region Figma/Penpot/Onlook Studio workspace (`src/components/CanvasPane.tsx`, `src/components/Inspector.tsx`, `src/components/Canvas.tsx`, `src/lib/editor.ts`) with a docked Top Studio Bar (`Assets`, `PageTabs`, `+ Mobile`, `+ Web`, `View`, `Design System`, `Inspector`, `Compare`, `Export`, `ZoomControls`), collapsible Left Assets & Screens Rail (`LeftStudioRail` synced in `useEditor` with 8 Quick Primitives including `Image` + 39+ draggable UI blocks + Page Screen list + live expandable DOM Layer Tree with hover reorder/duplicate/hide/delete actions), docked Right 4-Tab Property Inspector (`Design`, `Insert`, `Layers`, `Code` + `Image Media` uploader & object-fit controls), OS image file drag-and-drop directly onto artboards, on-canvas element floating action toolbar (`⠿` drag-to-reorder handle + live drop line, `↑`, `↓`, `+Txt`, `+Btn`, `⊞Row`, `⊞Col`, `⧉`, `✕`) + 8-point resize handles, and strict `+` attachment button gating (`supportsAttachments(providerId, modelId)`) so only models with verified keyless image/file support display the `+` button in `<Composer>`.
- Harness & Zeus Studio: 22 built-in Zeus Studio MCP tools (adding `studio_create_frame`, `studio_clone_screen`, `studio_inspect_dom`), multimodal vision directives in `buildMultiTurnContext`, and live browser-mode streaming for CORS-enabled keyless providers (`kilo`, `llm7`, `pollinations`).
- CI: Windows build and release on every push to `main`, tag `v0.1.<run_number>`.

## Session 14
Goal: add 5+ new reliable free keyless providers with newer frontier models, implement real image/file uploading for multimodal keyless providers, show the `+` attachment button strictly on models that support image/file uploads, revamp the canvas & UI/UX into a docked Figma/Penpot/Onlook visual studio, and keep memory under 19 MB.

Shipped:
- 6 New Free Keyless Providers (14 Total) & Real Multimodal Image/File Uploading (`src-tauri/src/providers.rs`, `src-tauri/src/crypto.rs`, `src/lib/providers.ts`, `include/zeus/providers.hpp`, `engine/zeus_engine.cpp`, `engine/test_engine.cpp`, `src/lib/context.ts`, `src/lib/engine.ts`):
  - Added 6 live-verified free keyless providers:
    1. `kilo` (`Kilo Gateway`, `api.kilo.ai/api/gateway`): `nvidia/nemotron-3.5-super-vl:free` (vision), `nvidia/nemotron-3-ultra-550b-a55b:free`, `inclusionai/ling-3.2-flash:free` (vision), `baidu/ernie-5.5-flash-preview:free`, `reflection/beam-free`, `particle-ai/particle-1:free` (vision), `openrouter/free` (vision), `kilo-auto/free`.
    2. `ptero` (`Ptero Frontier`, `ptero.pro/wp-json/mlp/v1/chat` with WP nonce warming & guest token rotation): `gpt-6.1-terra:voyage` (vision), `glm-5.3-flash` (vision), `qwen3.7-flash:minirouter` (vision), `kimi-k3:apinex`.
    3. `unikey` (`Unikey Anonymous`, `getunikey.ai/api/anonymous/chat/completions` with `X-Anonymous-Fingerprint` rotation): `moonshotai/kimi-k3`, `moonshotai/kimi-k2.7-code`, `x-ai/grok-4.3`.
    4. `llm7` (`LLM7 Gateway`, `api.llm7.io/v1/chat/completions`, 400k ctx): `codestral-latest`, `gemma-3-27b`, `gpt-oss:20b`, `default`.
    5. `pollinations` (`Pollinations AI`, `text.pollinations.ai/openai`): `openai`, `openai-fast`.
    6. `yqcloud` (`YQCloud Stream`, `api.binjie.fun/api/generateStream`): `yqcloud-default`.
  - Implemented real image/file upload across all 4 multimodal keyless provider families (`kilo`, `qwen`, `deepai`, `ptero`) plus custom OpenAI/Anthropic endpoints:
    - Added pure-Rust `hmac_sha256_bytes`, `hmac_sha256_hex`, `md5_reversed_hex`, `generate_deepai_island_key`, `decode_base64`, `decode_data_url`, and `iso8601_utc_compact` in `src-tauri/src/crypto.rs`.
    - Fixed `stream_deepai` to use `generate_deepai_island_key` (reversed MD5), removed legacy `chat_style=chat` so DeepAI routes to `claude-haiku-5-5`, `gpt-6-luna`, `glm-5.3-flash`, and `gemma-4` instead of `llama-3.1-8b-instruct-turbo`, and implemented `/chat_attachments/upload` -> `attachment_uuids`.
    - Implemented `upload_qwen_attachment` in `stream_qwen_app` (`/api/v2/files/getstsToken` + `OSS4-HMAC-SHA256` signed `PUT` to Alibaba Cloud OSS + `files` array) and added `qwen3.8-omni-flash`, `qwen3.5-omni-plus`, and `qwen3.7-plus`.
- Strict `+` Attachment Icon Gating (`src/lib/providers.ts`, `src/components/Chat.tsx`, `src/components/Settings.tsx`):
  - Added `supportsAttachments(providerId, modelId)` and gated the `<Composer>` `+` button, drag-and-drop, and clipboard file paste so ONLY models with real image/file support show the `+` icon.
  - Added vision icons in `ModelPicker` and `Vision & files` badges + sub-model pills in `Settings > Models`.
- Docked Figma / Penpot / Onlook Studio Canvas Revamp & Agent Tools (`src/components/CanvasPane.tsx`, `src/components/Inspector.tsx`, `src/components/Canvas.tsx`, `src/lib/editor.ts`, `src/lib/blocks.ts`, `src/lib/studio.ts`):
  - Replaced floating header/inspector overlays with a docked 3-region Figma workspace: Top Studio Toolbar (`Assets`, `PageTabs`, `+ Mobile`, `+ Web`, `View`, `Design System`, `Inspector`, `Compare`, `Export`, `ZoomControls`), Left `Assets & Screens` Rail (8 Quick Primitives + 38+ draggable UI blocks + Page Screen navigator), and Right docked 4-tab `Inspector`.
  - Upgraded `EDIT_JS` (`src/lib/editor.ts`) with an interactive on-canvas floating action bar (`↑`, `↓`, `⧉`, `⊞`, `✕`) and 8-direction resize handles (`n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`).
  - Added `studio_create_frame`, `studio_clone_screen`, and `studio_inspect_dom` to Zeus Studio MCP (`22` tools total) and lowered the Win32 working-set ceiling to `<19 MB`.

## Session 13
Goal: fix the critical UI/canvas rendering regression where launching or rendering a conversation with saved artboards caused the entire app shell to render black text on `#141218` with transparent panels and blank white artboard rectangles on the canvas.

Shipped:
- Root-Cause Fix for Uncaught `CSSStyleSheet.replaceSync` Exception & Theme Token Initialization (`src/lib/shadowRenderer.tsx`, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/lib/theme.ts`, `src/store.ts`, `src/lib/harness.ts`, `src/components/Canvas.tsx`, `src/components/Views.tsx`, `src-tauri/tauri.conf.json`, `engine/zeus_engine.cpp`):
  - **Root cause 1 (`ShadowFrame` `replaceSync` crash aborting React's passive `useEffect` flush)**: In Session 11 (`99856ff`), `ShadowFrame` introduced `new CSSStyleSheet().replaceSync(fullCss)` without a `try/catch`. When a saved artboard contained an `@import` rule in `<style>`, `replaceSync` threw a synchronous `DOMException` (`@import rules are not allowed when creating stylesheet synchronously`) inside the child `ShadowFrame`'s `useEffect`. Because React runs child `useEffect` hooks depth-first before parent `useEffect` hooks, the uncaught exception in `Thumb`/`ShadowFrame` aborted React's `commitPassiveMountEffects` walk before `<App>`'s `useEffect(() => applyTheme(theme, hue))` and `<CanvasPane>`'s `ShadowFrame` `useEffect`s ever executed—leaving all `--m-*` CSS variables unset (transparent backgrounds over `#141218` + `#000` black text) and leaving canvas artboards as empty `div.bg-white` rectangles.
  - **Root cause 2 (`@import` semicolon regex truncation)**: In `src/lib/harness.ts`, `.replace(/@import\s+(?:url\()?["']?https?:[^;]+;?/gi, "")` stopped at the first semicolon inside Google Fonts URLs (`wght@400;500;700`), leaving `500;700&display=swap');` with an unmatched single quote `'` that corrupted the artboard's `<style>` block.
  - **Fixes**:
    1. Removed `CSSStyleSheet.replaceSync` / `adoptedStyleSheets` from `ShadowFrame` (`src/lib/shadowRenderer.tsx`) in favor of `useLayoutEffect` + direct `<style>${fullCss}</style>` injection wrapped in `try/catch`, with `host.shadowRoot` reuse, `<html>`/`<body>` class & `data-theme` forwarding, and automatic design-system token fallback when `data-zeus-kit` is absent.
    2. Added complete static `:root` dark-theme `--m-*` token definitions directly in `src/index.css`, called `applyTheme()` synchronously in `src/main.tsx` before `createRoot`, in `src/store.ts` on rehydration/`patchSettings`, and via `useLayoutEffect` in `src/App.tsx`.
    3. Updated the `@import` sanitizer in `src/lib/harness.ts`, `src/lib/shadowRenderer.tsx`, and `src/store.ts` to match full `url(...)` expressions containing semicolons and automatically heal any existing artboards in `localStorage` that had truncated `display=swap');` fragments.
    4. Replaced `bg-white` artboard wrapper backgrounds in `Canvas.tsx` and `Views.tsx` with `bg-surface-container` and restored stable WebView2 browser args (`src-tauri/tauri.conf.json`) and soft Win32 working-set trimming (`engine/zeus_engine.cpp`).

## Session 12
Goal: eliminate Turn 2+ web-scraper refusals in `mercury3` / `deepai` / `longcat` / `motif` before they ever render in the chat UI, apply multi-sheet theme and typography overrides instantaneously at turn start, and enforce a hard Win32 kernel working-set ceiling + lazy font loading so Windows Task Manager stays under 20–25 MB.

Shipped:
- Keyless Provider Multi-Turn Handshake & `<canvas_state>` Preservation (`src-tauri/src/providers.rs`, `src/lib/context.ts`, `src/lib/engine.ts`, `src/lib/studio.ts`, `src/components/Inspector.tsx`, `src/components/Activity.tsx`):
  - Added synthetic assistant harness handshakes in `stream_mercury3` and `stream_deepai` so web-scraped endpoints never fall back to their default "I am in a web chat and cannot access the canvas" persona, and wired user `effort` to `stream_mercury3`.
  - Fixed `stream_longcat` and `stream_motif` prompt assembly so `<canvas_state>` at the end of the user turn is never truncated by system-prompt character limits.
  - Added `getConversationBoards()`, pre-stream refusal buffering (`looksLikeRefusalStart`), instant pre-stream multi-sheet theme/typography synchronization in `sendMessage`, `studio_batch_patch` for multi-screen CSS selector edits, and 1-click Typography Pairing presets in `Inspector.tsx`.
- Hard Win32 Working-Set Ceiling, In-Process Services & Lazy Variable Fonts (`engine/zeus_engine.cpp`, `src-tauri/src/perf.rs`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src/lib/fonts.ts`, `src/lib/shadowRenderer.tsx`, `src/main.tsx`):
  - Updated `trim_pids_now` in `engine/zeus_engine.cpp` to compact all process heaps (`GetProcessHeaps` + `HeapCompact`), set `MEMORY_PRIORITY_VERY_LOW` (`1`), and enforce `QUOTA_LIMITS_HARDWS_MIN_DISABLE | QUOTA_LIMITS_HARDWS_MAX_ENABLE` via `SetProcessWorkingSetSizeEx` so the Windows NT kernel keeps the process tree working set capped under ~20–24 MB without rebounding.
  - Added `NetworkServiceInProcess,NetworkServiceInProcess2,StorageServiceInProcess`, `--force-gpu-mem-available-mb=24`, and V8 `--lite-mode` to WebView2 browser arguments, and switched `perf.rs` to trim at 900ms/1800ms/3000ms and every 1.2s.
  - Made `installDesignFonts()` in `src/lib/fonts.ts` lazy and incremental per family (triggered by `ShadowFrame` and `Inspector`) and cleared the inline module script DOM buffer after mount in `src/main.tsx`.

## Session 11
Goal: make keyless chat-scraped models (`mercury3`, `qwen`, `k2horizon`, `motif`, `longcat`, `geminiweb`, `deepai`, `chatjimmy`) work seamlessly across multi-turn canvas edits with real context windows, auto/manual compaction, and continuations, while eliminating per-artboard base64 font bloat and shared-DLL memory over-reporting so RAM stays under 20–30 MB.

Shipped:
- Keyless Multi-Turn Harness, Context Windows, Compaction & Continuations (`src/lib/context.ts`, `src/lib/engine.ts`, `src-tauri/src/providers.rs`, `src-tauri/src/agent.rs`, `src/components/Chat.tsx`, `src/components/Activity.tsx`):
  - Fixed the root cause of Turn 2+ canvas amnesia ("I can't directly access or edit the canvas here... Share their HTML"): `buildMultiTurnContext()` now reconstructs the assistant's previous `<artboard>` blocks in `messages` and injects all active canvas screens inside `<canvas_state>` (stripped of kit/font boilerplate via `stripKitBoilerplate()` so each screen is ~2 KB instead of 80 KB).
  - Added `detectThemeOverride()` and `applyThemeOverrideToHtml()` plus guaranteed multi-sheet theme synchronization in `engine.ts` and `studio_retheme_page`: asking "change the theme to green" (or teal, terracotta, gold, crimson, sakura, monochrome, dark/light) in Turn 2+ updates all screens on the canvas in place while preserving 100% of their layouts.
  - Added `isCanvasRefusal()` recovery, automatic mid-stream truncation continuation (`buildContinuationPrompt`), auto-compaction when context exceeds 78% of the active budget, manual `/compact` and `ContextWindowPill` breakdown popover in `Chat.tsx`, and 1-click Continue controls.
  - Replaced UTF-8-unsafe 4,000-byte system-prompt slices in `providers.rs` (`longcat`, `geminiweb`, `mercury3`) with UTF-8-safe 14,000–24,000 char budgets, and delegated `studio_*` tools in `agent.rs` without false unknown-tool errors.
- Low-Memory Footprint & Zero-Duplicate Font/Stylesheet Architecture (`src/lib/harness.ts`, `src/lib/shadowRenderer.tsx`, `src/store.ts`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src-tauri/src/perf.rs`, `engine/zeus_engine.cpp`, `src/components/Sidebar.tsx`):
  - Stopped injecting 60–120 KB of base64 `@font-face` woff2 data into every artboard's `<style data-zeus-kit>` (since `installDesignFonts()` registers them once on `document.head` for all `ShadowFrame` instances, while `quiet()` and `embedFonts()` handle iframes/exports), and added a rehydration migration in `store.ts` to purge legacy font blobs from `localStorage`.
  - Upgraded `ShadowFrame` (`src/lib/shadowRenderer.tsx`) to share compiled `CSSStyleSheet` instances via `adoptedStyleSheets`.
  - Updated `measure_tree` in `engine/zeus_engine.cpp` to query Windows 10/11 `PROCESS_MEMORY_COUNTERS_EX2.PrivateWorkingSetSize` (unshared physical RAM, matching Task Manager instead of summing shared `msedgewebview2.dll` pages 6x across child processes), set `MEMORY_PRIORITY_LOW` on child processes, added `--enable-low-end-device-mode` and V8 size optimization flags, and triggered immediate working-set trim on startup (`Sidebar.tsx` and `perf.rs`).

## Session 10
Goal: elevate the Figma/Onlook Studio experience with full-screen layout starters, component variant & icon swappers, layer tree actions, edit-mode drag-and-drop overlay, right-click canvas context menu, top-bar Design System switcher, and complete reasoning stream extraction across all providers.

Shipped:
- 36-Block UI Kit & Full-Screen Layout Starters (`src/lib/blocks.ts`, `src/components/Inspector.tsx`, `src/components/Canvas.tsx`):
  - Added `Full Layouts` category (`slot: "screen"`) with 6 complete mobile/web architectural starters (`Notes & Knowledge Base`, `Fintech Wallet & Spend`, `Fitness & Workout Tracker`, `E-Commerce Storefront`, `Web Analytics Dashboard`, `Web Sprint Kanban Board`) plus 6 new rich domain blocks (`Profile Header Card`, `Now Playing Transport`, `Pricing Tier Card`, `Kanban Task Column`, `Message Thread + Composer`, `Empty State Callout`).
  - Added edit-mode drag-and-drop capture overlay in `ArtboardView` so dragging blocks from the `Insert` panel onto an artboard works seamlessly even while an edit-mode or interactive iframe is active.
- Component Variant Switcher, Live Icon Swapper & Frame Inspector (`src/components/Inspector.tsx`, `src/lib/editor.ts`, `src/components/CanvasPane.tsx`):
  - Added 1-click Component Variant controls in the `Design` tab for `.z-btn` (`Filled`, `Tonal`, `Outline`, `Text`, `Small`, `Default`, `Large`, `Full W`), `.z-card` (`Surface`, `Tonal`, `Accent`, `Flat`), `.z-icon-btn` (`Outlined`, `Tonal`, `Filled`), and `.on` active state toggles for chips/tabs/segments/nav items.
  - Added an interactive Material Symbol Icon Swapper in the `Design` tab when any element with an SVG icon is selected, plus hover actions (`Move Up`, `Move Down`, `Duplicate`, `Visibility`, `Delete`) on every node in the `Layers` tab.
  - Upgraded the unselected state of the `Design` tab into a Frame & Design System Inspector, and added a live Design System switcher dropdown directly in the Canvas header (`CanvasPane.tsx`).
- Figma Right-Click Context Menu & Provider Reasoning Extraction (`src/components/Canvas.tsx`, `src-tauri/src/providers.rs`, `src/lib/engine.ts`):
  - Added right-click context menu on artboards and empty canvas space plus `Enter` shortcut to enter Studio Edit mode on a selected screen.
  - Added `<think>...</think>` reasoning stream extraction for Qwen (`phase == "think"`), LongCat (`reason`), Motif (`chat.reasoning`), ChatJimmy (`<|think|>`), and custom OpenAI/Anthropic endpoints (`reasoning_content` / `thinking_delta`).

## Session 9
Goal: transform the canvas into a Figma/Onlook-grade visual-first workspace so users can build UI/UX either from scratch with drag-and-drop components, auto-layout, and layers OR with AI, while upgrading Zeus Studio with agentic canvas/DOM mutation tools.

Shipped:
- Drag-and-Drop UI Component Block Library (`src/lib/blocks.ts`, `src/components/EmptyCanvas.tsx`, `src/components/BottomToolbar.tsx`):
  - Built 24+ design-system-aware UI blocks across 6 categories (`Layout & Basics`, `Navigation`, `Hero & Banners`, `Cards & Charts`, `Lists & Tables`, `Forms & Inputs`).
  - Added drag-and-drop onto any existing artboard or empty canvas space (automatically spawning a frame), plus 1-click "Blank Mobile + UI Kit" and "Blank Web + UI Kit" starters on `EmptyCanvas` and preset frame menus on the `Frame (F)` tool.
- 4-Tab Figma/Onlook Studio Dock & Visual DOM Editor (`src/components/Inspector.tsx`, `src/lib/editor.ts`, `src/components/CanvasPane.tsx`):
  - Upgraded `Inspector.tsx` into a 4-tab Studio (`Design`, `Insert`, `Layers`, `Code`) accessible from the top Canvas header (`Studio`), bottom toolbar (`I`), or any artboard header (`+` / `ads_click`).
  - Added live DOM `LayerTreeView` with click-to-select and visibility toggles, on-canvas element resize handles (`e`, `s`, `se`), `Shift+A` Auto-Layout wrapping, Figma sizing modes (`Hug`, `Fill`, `Fixed`), Design System token swatches, bundled font family picker, Undo/Redo (`Ctrl+Z` / `Ctrl+Shift+Z`), and live HTML code editing (`Code` tab).
- Smart Alignment Snapping Guides, Multi-Select Alignment & Live Re-theming (`src/components/Canvas.tsx`, `src/lib/harness.ts`, `src/store.ts`):
  - Added Figma-style smart alignment snapping guides (`guides.x`, `guides.y`) when dragging artboards or elements, plus a floating `SelectionAlignBar` (Align Left/Center/Right/Top/Middle/Bottom + Tidy Row) when 2+ items are selected.
  - Added `rethemeHtml()` in `harness.ts` and wired `patchSettings` in `store.ts` so switching the active Design System immediately re-themes all screens on the active canvas page.
- Agentic Zeus Studio MCP Tools (`src/lib/studio.ts`, `src/components/Activity.tsx`):
  - Added `studio_insert_block`, `studio_patch_screen`, `studio_arrange_canvas`, and `studio_retheme_page` so the AI agent can surgically insert components, patch selectors, arrange the canvas, and switch design systems.

## Session 8
Goal: eliminate startup window freeze ("Not Responding") and improper initial window sizing, remove the orb and `auto_awesome` chat/greeting icons in favor of clean shimmer text, innovate a Material 3 Expressive Reasoning Effort selector, replace the canvas designing animation, and guarantee complete, anti-slop screens even from weak/truncated model outputs.

Shipped:
- Startup & Window Responsiveness (`src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src-tauri/src/mcp.rs`, `src-tauri/src/agent.rs`, `src-tauri/src/workspace.rs`, `src-tauri/src/memory.rs`, `src-tauri/src/perf.rs`, `src/App.tsx`, `src/lib/tools.ts`):
  - Converted all synchronous Tauri IPC commands (`mcp_tools`, `mcp_call`, `mcp_list`, `mcp_add`, `mcp_remove`, `title_generate`, `workspace_*`, `fs_*`, `shell_run`, `memory_*`, `perf_*`) to `#[tauri::command(async)]` so no IPC call ever blocks the Win32 main UI message loop.
  - Stopped spawning external stdio MCP servers (`npx`) at app startup (`App.tsx` and `tools.ts`); cached empty/error tool discovery results and lowered stdio discovery timeout from 90s to 12s.
  - Removed `--in-process-gpu` and the 48 MB V8 heap choke from WebView2 browser args, delayed initial working-set trim until 12s post-launch, and configured the main window to open maximized (`1280x800` restored size) and focused.
- Shimmer Activity, Collapsible Reasoning & Effort Selector (`src/components/Activity.tsx`, `src/components/Chat.tsx`, `src/components/Home.tsx`, `src/components/BottomToolbar.tsx`, `src-tauri/src/providers.rs`):
  - Removed `ZeusOrb` rings/dots and `auto_awesome` sparkle icons from AI chat messages, greeting, and Ask Zeus bar; all live states use clean `.zshine` shimmer typography.
  - Added native reasoning extraction in `providers.rs` (`mercury3` `reasoning-delta` events and `k2horizon` `<details type="reasoning">` blocks) and leaked-plan extraction in `engine.ts` (`extractLeakedPlan`).
  - Built a Material 3 Expressive connected split control in the composer pairing the Model selector with a 4-bar tactile Reasoning Effort selector (1-tap horizontal segmented popover + right-click/Shift-click cycle + top-of-menu segmented bar).
- Canvas Designing Animation & Anti-Slop Harness (`src/components/Canvas.tsx`, `src/index.css`, `src/lib/harness.ts`, `src/lib/studio.ts`, `src/lib/blueprints.ts`, `src/lib/engine.ts`):
  - Replaced the scanner line and spinning conic ring with a design-system-aware `BlueprintWireframe` and diagonal `.zc-sheen` shimmer.
  - Added token reset protection (preventing model `<style>` blocks from overriding `:root` tokens or forcing `#fff` backgrounds), automatic class promotion (`CLASS_PROMOTIONS`), edge-margin protection on unclassed body children, a dedicated `notes` domain brief, and `ensureCompleteScreen()` so truncated/sparse model outputs are deterministically completed with design-system components.
  - Prevented `selfCheck` (`design_repair`) from accepting sparser or truncated repairs.

## Session 7
Goal: fix generations that still look broken on the canvas (stray FAB at the world origin, unreadable captions, no anatomy for notes-style apps).

Shipped:
- `ShadowFrame` host now uses `contain: layout paint` + `isolation: isolate`, so a model-written `position:fixed` button or bar stays inside its artboard instead of landing at the canvas origin.
- `harden()` raises any `font-size` under 11px to 11px (prompt and enforcement stay aligned).
- `blueprints.ts`: new `notes` archetype (notes, todo, habits, journal, reminders) and a fallback anatomy for requests that match nothing, with a rule that the 3 variants differ in structure.

Not done / next:
- Rust providers still drop provider-side reasoning (K2 `<details>`, ChatJimmy `<|think|>`); needs a Windows CI cycle (no Rust toolchain in the authoring sandbox).
- Memory floor: WebView2 stays above 30 MB. Replacing the webview with a native renderer is a separate multi-session rewrite and was not started; features and UI cannot be kept identical without it.

## Session 6
Goal: stop the weak-looking generations (no fonts, clipped nav, flat component use), replace the 3-dot thinking indicator, show reasoning, and rebuild the canvas designing animation.

Shipped:
- Bundled design fonts (`src/lib/fonts.ts`): 8 latin variable families inlined at build time; design systems now resolve to them instead of system fallbacks (Fraunces for editorial/claude headings, Plus Jakarta Sans for glass, Inter for shadcn/polaris/antd, Space Grotesk for neo). Exports embed the faces they use.
- Harness prompt: think-first plan, Typography section with pairings, Anti-slop section (banned patterns, one signature move, size contrast, color ratio). Studio `studio_fonts` and the brief use the bundled families.
- Kit: mobile `z-screen` with a `z-nav` pins the nav and scrolls `z-page` inside it (fixes the clipped bottom nav); row icons capped at 22px; `z-item` radius reset (fixes curved underlines).
- Chat: `ZeusOrb`, `WorkLog`, `ThinkingBlock`, `LiveStatus`; `Message.reasoning` and `thinkMs`; `reasoning` ChatEvent supported in `engine.ts`.
- Canvas: `DesigningFx` skeleton, scan sweep, travelling ring, completion sweep.

Not done / next:
- Rust providers still drop provider-side reasoning (K2 `<details>`, ChatJimmy `<|think|>`); emit `reasoning` events from `providers.rs` to surface it. Needs a Windows CI cycle.
- Memory target: the WebView2 floor is still above 30 MB. A true fix means replacing the webview with a native renderer (large rewrite, not started).
- No visual QA of the new animations on Windows yet.

## Session 5
Goal: keep Windows RAM working set under 20-30 MB without losing any features or visual quality, isolate canvases per chat, and elevate the agent harness and Zeus Studio MCP.

Shipped:
- Native Low-Memory Engine (`src-tauri/src/perf.rs`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `engine/zeus_engine.cpp`):
  - WebView2 single-process / in-process-GPU / `--renderer-process-limit=1` / 48 MB V8 cap flags set in both `main.rs` and `tauri.conf.json`.
  - C++20 Win32 process-tree working-set trimmer (`zeus_memory_stats`, `zeus_memory_trim` using `CreateToolhelp32Snapshot`, `SetProcessWorkingSetSize`, `K32EmptyWorkingSet`, `K32GetProcessMemoryInfo` across `zeusdesigns.exe` and all child `msedgewebview2.exe` processes).
  - Background `PerfGovernor` trims startup DLL pages and keeps working set under ~20-25 MB; exposed via `perf_stats`, `perf_trim`, `perf_set_auto` in Settings > Appearance and the Sidebar account footer.
- Zero-Iframe Shadow DOM Renderer (`src/lib/shadowRenderer.tsx`):
  - Replaces heavy `<iframe>` sub-documents in `<Thumb>` and `<Frame>` (except during element edit mode or custom script execution) with scoped Shadow DOM (`:host`, `--z-vh`, `--z-vw`) + interactive kit click delegation, plus viewport frustum culling on `InfiniteCanvas`.
- Per-Chat Isolated Canvases (`src/store.ts`, `src/types.ts`, `src/components/CanvasPane.tsx`, `src/components/Sidebar.tsx`):
  - Each chat owns its pages and screens (`Page.convId`, `Conversation.activePageId`), with screen count badges in the sidebar chat list.
- Harness & Zeus Studio (`src/lib/harness.ts`, `src/lib/studio.ts`, `src/lib/blueprints.ts`, `src/lib/audit.ts`):
  - 130+ icon synonym aliases (`resolveIconName`), `.z-segs`, `.z-banner`, `.z-kpi`, `.z-kv`, `.z-steps`, `.z-days`, bare `<button>`/`<input>`/`<table>` promotion, off-palette blue/purple hex remapping, deterministic audit fixes for `overflow`/`clipped`/`tap`/`sparse`.
  - 3 new Studio tools (`studio_svg_chart`, `studio_blueprint`, `studio_export_react`), inline SVG chart seeds in `studioBrief()`, 3 new blueprints (`kanban`, `chat`, `calendar`), and 1-click Copy React TSX in `ExportMenu`.

## Session 4
Goal: fix layout defects seen in the issue #1 comparison, add an in-app MCP, make the harness carry weak models, and rewrite history under one author.

Shipped:
- History rewritten so every commit and tag is authored by NikitHamal only.
- Canvas dock: toolbar and zoom controls share one centered flex row, so zoom no longer hides behind the Ask Zeus pill. Canvas header collapses labels by pane width (container query), not window width.
- Account menu: Get help and Source code use the same `MenuItem` as every other row (aligned icons); System theme uses the laptop icon.
- Zeus Studio (`src/lib/studio.ts`): built-in MCP, 11 tools (`studio_brief`, `studio_palette`, `studio_contrast`, `studio_fonts`, `studio_icons`, `studio_components`, `studio_tokens`, `studio_systems`, `studio_screens`, `studio_read_screen`, `studio_lint`). Runs in the webview, answered locally in `engine.ts` (the Rust loop returns "unknown tool", which the UI ignores for `studio_*`). Toggle in Connectors > Built in.
- Harness: `studioBrief()` is injected into every system prompt: detected product domain, audience, primary action, nav labels, bundled icons, real content seeds, optional display font, blueprint. 14 domains.
- Harness: a design request whose reply has no `<artboard>` is retried once with a strict protocol reminder; text after a tool call is dropped; tool rounds raised to 5.
- Memory: `learnFromText()` saves durable first-person facts from user messages (preferences, profile, areas) with no model call; toggle "Learn from my messages".

In flight / next:
- Rust unchanged this session; no CI risk from it. Visual QA on Windows of the dock and header at narrow widths.
- Per-chat canvases.

## Session 3
Goal: fix the poor UI polish, real icons, clipped dialogs, element-level canvas control, stale desktop icon, and a world-class agent harness.

Shipped:
- Icons: official Material Symbols SVG paths via `scripts/icons.mjs` (no font, no letter fallbacks).
- `Dropdown` and `Dialog` are portals that flip and clamp to the viewport; nothing clips.
- Harness: component kit with per-system overrides, icon resolver, design-law enforcement, structure repair, bare-HTML recovery, lint chip in chat, rewritten system prompt.
- Canvas: element edit mode with inspector, inline text edit, reorder, duplicate, delete, undo, Ask Zeus about element.
- Desktop icon: `build.rs` tracks generated icons, rust-cache key includes the icon hash, NSIS installer icon set.

In flight / next:
- Run 26 failed once at "create a release" (Resource not accessible by integration) after a clean Rust compile; run 28 on the next commit was green. Treat as a flake unless it repeats.
- Visual QA on Windows of the inspector and kit overrides for each design system.
- Per-chat canvases.

## Session 2
Goal: product-grade UI overhaul modeled on the Claude desktop and Claude Design flows (reference screenshots in issue #1), plus updater, icon, and repo hygiene.

Shipped:
- AGENTS.md and CONTINUITY.md.
- Run pruning: `scripts/prune-runs.sh` runs as the last job of `release.yml` and keeps only the latest successful run. `prune-runs.yml` is a manual trigger.
- CI stamps `0.1.<run_number>` into package.json, tauri.conf.json, Cargo.toml (`scripts/stamp-version.mjs`).
- In-app updater: `src-tauri/src/updater.rs` (`update_check`, `update_install` with `zeus://update/progress` events), `src/lib/updater.ts`, Settings > Updates, sidebar Update button, silent check at startup and every 6 hours.
- New app icon (`public/favicon.svg`, `public/app-icon.png`, Z mark, no bolt). CI regenerates native icons from the PNG.
- Material Symbols Rounded font subset (`scripts/icons.mjs`, run after adding icons) replaces lucide-react. Generated demo screens inline Material SVG paths (`scripts/screen-icons.mjs`, tokens `@@name@@` in `templates.ts`).
- Google Sans Flex (ROND 100) and Roboto Mono bundled in `src/assets/fonts`.
- Shell rewrite: sidebar (new, search, project folder, library, tools, chats, settings), home screen with composer and starters, chat + canvas split, Claude-style settings dialog.
- Design laws applied to UI, design systems, skills, templates and the system prompt. Accent seeds retired blue/violet; default hue is clay (17).

In flight / next:
- Rust compiles only in CI. Confirm the run for the updater commit is green; fix `updater.rs` first if not.
- Verify the updater end to end by installing an older release and updating to the next one.
- Visual QA of the canvas toolbar, comments panel and compare views against the Claude Design references.
- Canvas is still one project shared across chats; per-chat canvases would match Claude Design more closely.

Verification habit: headless Chromium (Playwright) screenshots of dist/index.html caught blank icons and a squeezed artboard header; do this after UI changes.

Known risks:
- The updater runs the unsigned NSIS installer from the latest GitHub release; SmartScreen may prompt.
- Adding a new icon name requires `node scripts/icons.mjs` or it renders as text.

## Session 1
Built the Tauri shell, M3 Expressive theme, canvas, chat, design systems, skills, keyless providers, workspace tools, memory, MCP.

## Session: Claude-parity UI, memory, connectors, harness v2

- Scroll indicators: invisible until hover in the app (`index.css`); hidden entirely inside every design iframe via `quiet()` (`harness.ts`), applied in `ui.tsx` Thumb, `Canvas.tsx`, `Views.tsx`, and baked into `kitCss`.
- Sidebar (`Sidebar.tsx`): New design, Search, Project folder, Library, Connectors, date-grouped chats with rename/delete menu, account menu (settings, memory, connectors, theme, updates, help, source).
- Settings (`Settings.tsx`): grouped nav. Memory (`MemoryPanel.tsx`) has four buckets (preferences, profile, topics, areas), inline edit, and a "Tell Zeus what to change" bar that asks the active model for add/remove operations (`lib/memory.ts`). Models can also write `<remember category="...">` tags; the engine strips and stores them.
- Connectors (`Connectors.tsx`, `lib/mcpCatalog.ts`): installed list with enable, test connection, remove; store of 10 real keyless MCP servers; custom command. Desktop only. Rust `mcp.rs` now does a proper initialize/initialized/request session with timeouts, wraps commands in `cmd /C` on Windows, caches tool lists, and returns real errors instead of fake success.
- Agent loop (`engine.ts`): tools are advertised via `lib/tools.ts`; after a round that called tools, results are sent back and the model continues (max 3 rounds). Unknown tools now fail instead of pretending.
- Harness v2: `lib/blueprints.ts` (anatomy per archetype), new craft rules (fill the screen, no overlap, equal rows), `lib/audit.ts` renders each screen off-screen and measures overflow, overlap, contrast, clipping, tiny text, tap targets, dead bands; severe findings trigger one repair call (`design_repair` chip) that is kept only if it reduces defects. Toggle: Settings > Appearance.
- Composer: single model+effort picker; design-system label collapses by container width so nothing clips.
