# AGENTS.md

Operating manual for every coding agent working in `NikitHamal/zeusdesigns`. Read this and `CONTINUITY.md` before touching code.

## Product
ZeusDesigns is a native Windows app (Tauri 2, Rust, C++20 FFI, WebView2) that pairs an agent chat with an infinite multi-artboard canvas. UI is React 19 + Tailwind 4 + Zustand in `src/`. Engine is Rust in `src-tauri/src/` and C++20 in `engine/`.

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
- Fonts are bundled through npm (no CDN): Google Sans Flex / Roboto Flex for UI, Roboto Mono for code.
- Colors come from the M3 tokens in `src/index.css` and `src/lib/theme.ts`. Do not hard-code hex values in components.

## Design harness (`src/lib/harness.ts`)
Every artboard goes through `harden()` before it reaches the canvas: structure repair, offline-safe output, shadow/emoji/LIVE/blue-purple-gradient removal, icon resolution, and injection of the active design system's token + component kit (`z-*` classes, per-system overrides in `DS_KIT`). `harnessPrompt()` is the generation prompt: protocol, laws, kit reference, craft rules, skeletons. Change a design rule in one place and it applies to prompt and enforcement together. `engine.ts` also recovers bare HTML documents that skip the `<artboard>` wrapper.

## Zeus Studio (built-in MCP)
`src/lib/studio.ts` holds the `studio_*` tools and `studioBrief()`. Tools run in the webview and need no install; `engine.ts` answers them locally. To add a tool, append to `STUDIO_TOOLS` with a real implementation; the prompt, Connectors list and chat chip label (`TOOL_LABEL` in `Chat.tsx`) follow. Never add a tool that returns canned or fake data.

## Canvas editing
Edit mode (`ads_click` button on an artboard) injects `src/lib/editor.ts` into the sandboxed iframe: hover, select, inline text edit (double-click), delete, duplicate, reorder, undo, and the inspector (`src/components/Inspector.tsx`). A whole edit session becomes one version entry. "Ask Zeus" quotes the selected element into the chat.

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
