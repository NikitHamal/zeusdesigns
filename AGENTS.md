# AGENTS.md

Operating manual for every coding agent working in `NikitHamal/zeusdesigns`. Read this and `CONTINUITY.md` before touching code.

## Product
Zeus Codes (`ZeusDesigns`) is a native Windows AI coding & software engineering app (Tauri 2, Rust, C++20 FFI, WebView2) powered by **Zeus Harness²** (`src/lib/harness2.ts`, adapted from Google Research `harness2` `c1..c8` surface) and an OpenCode-compatible native execution loop. UI is React 19 + Tailwind 4 + Zustand in `src/`. Engine is Rust in `src-tauri/src/` and C++20 in `engine/`.

## Non-negotiable laws
These apply to the app UI and to every design-system prompt, skill, template and generated screen.
1. No box shadows. Use tonal surfaces, borders and spacing for depth.
2. No emojis. Use Material Symbols icons only.
3. No "LIVE" badges.
4. No blue or purple gradients.
5. Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout.
6. Pick the option that lifts UX, DX and AX together, without breaking anything.
7. Everything shipped is real. No placeholder buttons, no dead menu items, no upgrade or paywall UI.

## Icons and type
- Icons are the official Material Symbols Rounded paths, rendered by `<Icon name="..." />` (`src/components/Icon.tsx`) as inline SVG. There is no icon font and no ligature fallback, so an icon can never render as a letter.
- `node scripts/icons.mjs` regenerates `src/lib/materialIcons.ts` and `src/lib/iconPaths.ts`. It bundles every quoted token in `src/` that is a real Material Symbol name, plus names listed in a `/* icons: a, b */` comment. Run it after adding an icon name. Icons missing from the npm package are cached in `scripts/extra-icons/`.
- Generated screens use `<i data-i="name"></i>`; the harness swaps it for the same paths.
- App fonts are bundled (no CDN): Google Sans Flex for UI, Roboto Mono for code.
- Design fonts are bundled latin variable subsets in `src/assets/fonts/design/` and listed in `src/lib/fonts.ts` (Inter, Plus Jakarta Sans, DM Sans, Manrope, Space Grotesk, Fraunces, Instrument Serif, JetBrains Mono). Shadow DOM artboards inherit them from the host document (`installDesignFonts`); iframes get `@font-face` through `quiet()`, exports through `embedFonts()`. To add a font: drop the woff2 in that folder and add one line to `DESIGN_FONTS`; the prompt, `studio_fonts` and pairings follow.
- Colors come from the M3 tokens in `src/index.css` and `src/lib/theme.ts`. Do not hard-code hex values in components.

## Design harness & Keyless Multi-Turn Context (`src/lib/harness.ts`, `src/lib/context.ts`)
Every artboard goes through `harden()` before it reaches the canvas: structure repair, offline-safe output, shadow/emoji/LIVE/blue-purple-gradient removal, icon resolution, and injection of the active design system's token + component kit (`z-*` classes, per-system overrides in `DS_KIT`). Base64 design fonts are registered once on `document.head` (`installDesignFonts`) and stripped from stored artboard HTML (`stripKitBoilerplate`) so multi-turn prompts and V8 memory stay compact (~2 KB per screen). `src/lib/context.ts` provides per-provider specializations (`getProviderSpecialization`), multi-turn `<canvas_state>` and assistant `<artboard>` reconstruction (`buildMultiTurnContext`), deterministic theme/palette override synthesis (`detectThemeOverride`, `applyThemeOverrideToHtml`), refusal recovery (`isCanvasRefusal`), real context window token estimation (`getContextWindowStats`), auto/manual conversation compaction (`compactConversation`), and automatic truncation continuations (`buildContinuationPrompt`).

## Chat activity UI (`src/components/Activity.tsx`)
All working states (`LiveStatus`, `WorkLog`, `ThinkingBlock`, `ToolRow`, `BottomToolbar`) use clean `.zshine` shimmer text with no orb or `auto_awesome` sparkle logo. `WorkLog` groups reasoning and tool steps in one collapsible card: open while streaming, collapsed to "Worked for Ns" after, with `ThinkingBlock` and each `ToolRow` independently collapsible. Reasoning comes from `<think>` blocks, provider-side reasoning deltas (`mercury3`, `k2horizon`), or extracted plan lines (`extractLeakedPlan`). On the canvas, `DesigningFx` (`Canvas.tsx`) renders a design-system-aware `BlueprintWireframe` with a diagonal `.zc-sheen` shimmer while an artboard streams.

## Agent routing & Per-Model Coding Harness (`src/lib/agent.ts`, `src/lib/codingHarness.ts`, `src/lib/tools.ts`, `src/lib/opencode.ts`, `src-tauri/src/agent.rs`)
`sendMessage` classifies every turn (`classifyIntent`): `chat`, `code` or `design`. Only `design` uses the canvas harness. A new feature that needs canvas state must not leak into `chat`/`code` prompts. Never make a greeting produce an artifact (`GREETING_RE` fast-paths greetings with zero tool/artifact prompt bloat). `src/lib/codingHarness.ts` profiles every model into one of 13 families (`claude`, `gpt`, `deepseek`, `kimi`, `glm`, `qwen`, `mercury`, `gemini`, `nemotron`, `mistral`, `grok`, `frontier_moe`, `compact_open`) and three execution styles (`bash_python_first`, `hybrid_fast`, `guided_compact`). In `code` mode with an open workspace, `buildPlainContext` injects a 1-turn `<zeus_tool name="list_dir" path=""></zeus_tool>` + `<tool_result>` prefill so models immediately see `<zeus_tool>` active in their own voice and never waste Turn 1 re-listing `.`. `src-tauri/src/agent.rs` strips `<think>`/`<thinking>` before scanning for tool calls during streaming (with an end-of-stream fallback when a gateway routes valid tool calls into `reasoning_content` and leaves visible text under 80 chars), executes multi-line Python 3 scripts via stdin (`python_run`), parses both `<zeus_tool>` and `<tool_call>`/`<function_call>`, formats `list_dir`/`search_code`/`shell`/`python` cleanly, and supplies current file contents on `edit_file` mismatch. Run `node scripts/test-agent-harness.mjs` to benchmark models across complex coding tasks. The `OpenCode` runtime drives `opencode serve` through `@opencode-ai/sdk`.

## Art direction and M3E Canvas artifacts (`src/lib/direction.ts`, `src/lib/m3e.ts`)
`directionPrompt(brief)` gives every design brief one of six concrete directions plus a signature layout move; add a direction by appending to `DIRECTIONS` (keep them visually distinct, bundled fonts only, no shadows or gradients). `<m3e title="...">{json}</m3e>` is a second artifact type: the document follows lnkiai/m3e-canvas `public/agent.md`, `M3ePane` hosts the real editor through a `#docz=` share link. `M3E_TRIGGER` routes such requests to chat mode and adds `M3E_GUIDE` to the prompt. Before changing any provider catalog run `node scripts/probe-models.mjs <gateway>`.

## Zeus Studio (built-in MCP)
`src/lib/studio.ts` holds the `studio_*` tools and `studioBrief()`. Tools run in the webview and need no install; `engine.ts` answers them locally. To add a tool, append to `STUDIO_TOOLS` with a real implementation; the prompt, Connectors list and chat chip label (`TOOL_LABEL` in `Chat.tsx`) follow. Never add a tool that returns canned or fake data.

## Canvas editing & Figma/Onlook Studio (`src/components/Inspector.tsx`, `src/lib/editor.ts`, `src/lib/blocks.ts`)
The Studio panel (`Studio` button in the canvas header, `I` in the bottom toolbar, `Enter` on a selected artboard, right-click context menu, or `+` / `ads_click` on an artboard) provides 4 tabs:
- `Design`: Frame & Design System inspector when no element is selected; when an element is selected, provides Component Variant & `.on` state switchers, live Material Symbol icon swapper, Figma-style Auto-Layout controls (`Row`, `Col`, `Grid`, `Block`, pack/align, gap), Sizing (`Hug`, `Fill`, `Fixed`), Padding/Margin, Typography (bundled `DESIGN_FONTS`), Design System token fill swatches, and Corner Radius/Border.
- `Insert`: 36 draggable `.z-*` UI blocks and 6 full-screen starter layouts (`src/lib/blocks.ts`) that can be clicked or dragged onto any artboard (including in edit mode) or empty canvas space.
- `Layers`: Live DOM hierarchy tree with selection sync and inline reorder (`Up`/`Down`), duplicate, visibility, and delete actions.
- `Code`: Live HTML inspector and editor for the selected element.
Edit mode injects `src/lib/editor.ts` into the artboard with on-canvas resize handles (`e`, `s`, `se`), `Shift+A` Auto-Layout wrapping, inline text editing, Undo/Redo (`Ctrl+Z` / `Ctrl+Shift+Z`), and version history recording.

## Projects, Files, Terminal, Memory & Local Server
- Conversations live inside local `ProjectFolder` entries (`src/store.ts`, `src/components/Sidebar.tsx`, `src/components/Chat.tsx`, `src/components/Home.tsx`). Picking a folder calls `workspace_pick` (`zeus_pick_folder_dialog` on a dedicated Win32 STA thread in `engine/zeus_engine.cpp`), walks depth 1 (`workspace_list` expands subfolders lazily), and immediately transitions `App.tsx` into `ChatPane` with `ProjectWorkspaceCard` and a side-by-side docked `Project Files / Editor / Terminal` panel.
- `ChatPane` provides both a 3-way workspace switcher (`Chat` | `Files` | `Terminal`) and a docked side-by-side IDE split (`dockOpen`): `FilesPanel` includes a live file tree filter, new-file creator, and inline monospace code editor (`Ctrl+S` writes via `writeWorkspaceFile`); `TerminalPanel` executes commands in the active project folder via `nativeShell.run` (`shell_run`) with history and 1-click `Ask Zeus` output forwarding.
- The Local OpenAI & OpenCode Server (`127.0.0.1:11435`, `src-tauri/src/lib.rs`, `src-tauri/src/server.rs`) is OFF by default at launch. Users can start it in `Settings > Local server`, or `src/lib/opencode.ts` starts it on demand when the OpenCode runtime is used. In addition to `/v1/chat/completions`, `/v1/models`, `/v1/responses`, `/v1/messages`, and `/v1/opencode.json`, `server.rs` implements the OpenCode SDK server protocol (`/global/health`, `/event`, `/session`, `/session/{id}/message`, `/session/{id}/abort`) so `@opencode-ai/sdk` works natively without requiring external CLI installs.
- Never dump all saved memory items into the system prompt (`src/lib/memory.ts`, `src-tauri/src/agent.rs`). `memoryBlock()` emits only a compact count index; agents fetch, save, edit, and delete memories on demand using `<zeus_tool name="memory_search">`, `<zeus_tool name="memory_save" path="preferences">`, `<zeus_tool name="memory_edit" path="mem-id">`, and `<zeus_tool name="memory_delete" path="mem-id">`.

## Repo map
- `src/App.tsx` shell: sidebar, home, workspace split.
- `src/components/` UI. `src/lib/` engine bridge, prompts, design systems, skills, updater.
- `src/store.ts` single persisted Zustand store.
- `src-tauri/src/` commands: providers, agent, workspace, memory, mcp, updater, perf (low-memory Win32 working-set governor).
- `src/lib/shadowRenderer.tsx` zero-iframe Shadow DOM renderer for artboards and thumbnails.
- `.github/workflows/release.yml` Windows build, release, and run pruning.
- `docs/BACKEND_CONTRACT.md` UI to engine contract. Update it when a command changes.

## Build and verify
- `npm ci && npm run build` must pass before every push (type-check included).
- Rust and C++ compile only in CI on `windows-latest`. After pushing, poll the run and fix failures before moving on:
  `curl -s -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/NikitHamal/zeusdesigns/actions/runs?per_page=3`
- Releases are tagged `v0.1.<run_number>`. The CI step stamps that version into `tauri.conf.json`, `Cargo.toml` and `package.json` so the in-app updater can compare versions. Do not hand-edit those version fields.

## Actions history rule
Keep exactly one finished run: the latest successful one. `scripts/prune-runs.sh` deletes every other completed run (failed, cancelled, or older successes) and runs at the end of every release workflow. A failed run stays visible only until the next run finishes. Never disable the prune step.

## Git workflow
- Small commits, conventional prefixes (`feat`, `fix`, `ci`, `docs`, `refactor`).
- Always `git pull --rebase origin main` before `git push origin HEAD:main`; another agent may be pushing.
- Push after every milestone and after CI verification.
- Never write tokens or secrets into tracked files, logs, workflows, reports or commit messages. Use environment variables or GitHub secrets.
- Do not fetch repo files through raw GitHub URLs. Clone or pull and read locally.

## Session hygiene
- Update `CONTINUITY.md` at the end of each milestone: what shipped, what is in flight, what is next, known issues.
- Keep `docs/BACKEND_CONTRACT.md` and this file accurate. Delete stale notes instead of appending.

## Shared terminal & tool rows
- `shell_run_as` (`src-tauri/src/workspace.rs`) is the single execution path for the Terminal panel (`user`) and the agent (`agent`). `cd` persists per project root, commands have a 300s hard timeout, git never blocks on a console prompt (`GIT_TERMINAL_PROMPT=0`) while Git Credential Manager and `gh` stay enabled, and common tool dirs (Git, GitHub CLI, nodejs) are appended to `PATH`. Agent runs are mirrored to `TerminalPanel` through the `zeus://term` event (`listenTerminal` in `bridge.ts`, installed in `App.tsx`).
- Tool rows in chat (`ToolCard` in `Activity.tsx`) expand and collapse in place. There is no tool detail dialog; do not add one.

## Shell and terminal (`src-tauri/src/shell.rs`, `term.rs`, `src/lib/pty.ts`)
OpenCode-style execution, no Tauri dependency in `shell.rs` (unit-testable on any OS).
- Shell choice: Git Bash, then PowerShell 7, then cmd.exe, then Windows PowerShell. `ZEUS_SHELL` overrides. Non-Windows uses `$SHELL`.
- Agent `shell` tool: one real shell process per call, merged output streamed to the Terminal panel's Zeus tab (`zeus://term` `chunk` events), 5 min hard timeout, process-tree kill, cancel via `shell_cancel`, stdin closed. Final cwd is read back (bash `trap EXIT`, PowerShell `finally`) so `cd` persists. cmd.exe keeps the small in-process rg/find/grep/ls layer.
- Terminal panel: real PTYs (`portable-pty`, ConPTY) rendered by xterm in `TerminalView.tsx`, multiple shell tabs. Rust keeps 192 KB scrollback per session and replays it on re-attach, so xterm is disposed whenever the tab is hidden to keep memory low.
- Tool output is always an inline expand/collapse row. Do not reintroduce a tool-output dialog.
