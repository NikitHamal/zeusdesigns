# ⚡ ZeusDesigns

Open-source, ultra-light **native Windows** AI design & coding workspace — a Claude Design–style
split-screen studio with an infinite multi-artboard canvas, free keyless AI providers and a full agent toolbox.

- **Native shell:** Rust + Tauri 2 (WebView2) — ~10 MB installer, GPU-accelerated UI.
- **UI:** React + Material 3 Expressive (the app's own theme *and* a built-in design skill).
- **Canvas:** infinite pan/zoom, multi-artboard, live interactive mobile/web previews, variants, compare, grid/single views, pins, notes, pen, shapes, "Ask Zeus" bar.
- **AI:** Mercury 3, Gemini Web, Qwen, K2Horizon, Motif, DeepAI, LongCat (keyless) + any OpenAI/Anthropic-compatible endpoint. ChatJimmy (20k+ tok/s) auto-titles chats.
- **Workspace:** open any local folder, let the agent read/design/edit/sync real code. Persistent Memory, shell tools, MCP client.
- **Library:** Material 3 Expressive, Apple HIG, Fluent 2, shadcn/ui, Carbon, Ant Design, Polaris, Atlassian, Neo-brutalism, Glass & more.

## Download
Every push to `main` builds and publishes a Windows installer + portable `.exe` to
[Releases](../../releases).

## Develop
```
npm install
npm run dev            # UI only in the browser (demo engine fallback)
npx tauri dev          # full native app (needs Rust + WebView2)
npx tauri build        # installer
```
See `docs/BACKEND_CONTRACT.md` for the UI ⇄ engine API.
