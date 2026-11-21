# CONTINUITY.md

Running log across agent sessions. Newest session first. Rules live in `AGENTS.md`.

## Current state
- Engine: 8 keyless providers, custom OpenAI/Anthropic, workspace tools, memory, MCP, agent loop. Stable.
- CI: Windows build and release on every push to `main`, tag `v0.1.<run_number>`.

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
