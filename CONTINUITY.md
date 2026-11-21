# CONTINUITY.md

Running log across agent sessions. Newest session first. Rules live in `AGENTS.md`.

## Current state
- Engine: 8 keyless providers, custom OpenAI/Anthropic, workspace tools, memory, MCP, agent loop. Stable.
- CI: Windows build and release on every push to `main`, tag `v0.1.<run_number>`.

## Session 2 (in progress)
Goal: product-grade UI overhaul modeled on the Claude desktop and Claude Design flows (reference screenshots in issue #1), plus updater, icon, and repo hygiene.

Plan and status:
- [x] AGENTS.md and CONTINUITY.md
- [ ] Prune rule: keep only the latest successful workflow run (`scripts/prune-runs.sh`, wired into `release.yml`)
- [ ] CI version stamping so the app knows its release number
- [ ] In-app updater: `src-tauri/src/updater.rs` (GitHub Releases check, download, run installer), Settings > Updates, sidebar indicator
- [ ] New app icon (no bolt), regenerated for installer and favicon
- [ ] Material Symbols Rounded font replaces lucide-react
- [ ] Google Sans Flex / Roboto Flex bundled
- [ ] Shell rewrite: collapsible sidebar, home screen, chat + canvas split, header
- [ ] Settings dialog rewrite (sectioned nav, search)
- [ ] Remove shadows, emojis, gradients, helper text across UI, prompts and templates

Known risks:
- Rust changes cannot be compiled in the agent sandbox. Verify through CI after each push.
- The updater downloads the NSIS installer from the latest GitHub release and starts it; it is unsigned, so Windows SmartScreen may prompt.

## Session 1
Built the Tauri shell, M3 Expressive theme, canvas, chat, design systems, skills, keyless providers, workspace tools, memory, MCP.
