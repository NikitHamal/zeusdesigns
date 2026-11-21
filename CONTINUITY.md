# CONTINUITY.md

Running log across agent sessions. Newest session first. Rules live in `AGENTS.md`.

## Current state
- Engine: 8 keyless providers, custom OpenAI/Anthropic, workspace tools, memory, MCP, agent loop. Stable.
- CI: Windows build and release on every push to `main`, tag `v0.1.<run_number>`.

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

Known risks:
- The updater runs the unsigned NSIS installer from the latest GitHub release; SmartScreen may prompt.
- Adding a new icon name requires `node scripts/icons.mjs` or it renders as text.

## Session 1
Built the Tauri shell, M3 Expressive theme, canvas, chat, design systems, skills, keyless providers, workspace tools, memory, MCP.
