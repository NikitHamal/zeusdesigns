# CONTINUITY.md

Running log across agent sessions. Newest session first. Rules live in `AGENTS.md`.

## Current state
- Engine: 8 keyless providers, custom OpenAI/Anthropic, workspace tools, memory, MCP, agent loop, native Win32 working-set low-memory governor (`<25 MB` target). Stable (verified green on Windows CI run 45008395866).
- UI & Canvas: Shadow DOM zero-iframe artboard and thumbnail renderer (`src/lib/shadowRenderer.tsx`), viewport frustum culling, per-chat isolated canvases.
- CI: Windows build and release on every push to `main`, tag `v0.1.<run_number>`.

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
