# Zeus Sovereign Design Harness

Code: `src/lib/sovereign/`. UI: `src/components/HarnessControls.tsx`. Tests: `npm run test:sovereign`.

## Findings that shaped it
| Flaw in the previous harness | Sovereign answer |
| --- | --- |
| Every follow-up regenerated the whole screen, slow and lossy | `mode="patch"` SEARCH/REPLACE blocks with a 4-rung fuzzy matcher |
| `...rest unchanged` placeholders silently wiped designs | Anti-truncation guard merges the original back; a rewrite that still loses content is rejected, last good render stays |
| Whole stream re-parsed with regexes on every chunk | Push-based FSM, partial-tag hold-back, incremental session |
| Context re-sent every screen in full plus stale code dumps in history | Authoritative compact canvas state (full active screens, one-line outlines for the rest), stubbed history, summary of old turns |
| Static prompts, no pre-code planning | `<zeus_plan>` blueprint + skill router |
| Errors in previews were invisible to the model | Sandbox bridge, telemetry in the next prompt, bounded self-heal loop |
| Element picking produced raw HTML only | `ZEUS_ELEMENT_SELECTED` with component, classes, computed styles, DOM path, source locator |
| Only per-screen undo | Snapshot graph with branch-safe undo / redo / restore |

## Protocol
```
<zeus_plan> Intent / Direction / Tokens (oklch) / Components / States </zeus_plan>
<artboard name=".." device="web" mode="new|revise">COMPLETE document</artboard>
<artboard id=".." name=".." mode="patch">
<<<<<<< SEARCH
verbatim lines
=======
edited lines
>>>>>>> REPLACE
</artboard>
```
`<zeus_artifact><zeus_action type="file|patch" path="Screen" device="web">..</zeus_action></zeus_artifact>` is an exact synonym. Markdown fences that hold a document are recovered by `fallbackFiles`. `zeusToArtboards` converts everything to the legacy `<artboard>` markup, so `parseStream`, `engine.ts` and every consumer are unchanged for old output.

## Matching ladder (`patch.ts`)
exact, line-fuzzy (indent and whitespace tolerant, replacement re-indented), regex-ws (token stream, minified lines), anchor (first/last line + 70% agreement). No match means a reported failure, never a guess.

## Sandbox bridge (`bridgeScript.ts`, `host.ts`)
Injected at render time into preview iframes only. Sandbox to host messages: `ZEUS_RUNTIME_ERROR`, `ZEUS_PREVIEW_READY`, `ZEUS_ELEMENT_SELECTED`, `ZEUS_INSPECT_MODE`. Host to sandbox: `ZEUS_INSPECT_MODE`. Captures `error` (syntax vs runtime vs failed resource), `unhandledrejection`, `console.error/warn`, React boundary messages and `window.__ZEUS_REPORT_ERROR__(err, componentStack)`. The host validates and truncates every field. Static `validateDocument` also checks inline scripts with `new Function` (compile only) so a broken screen is caught even when no iframe ever runs it.

## Self-healing (`healer.ts`)
Fatal error, then a debounced repair turn once generation is idle (`skill:runtime-self-healer`, quoted board, telemetry block). At most 2 automatic attempts per user turn; "Fix with Zeus" in the banner is always available. Disable automatic repair: `localStorage.setItem("zeus-autoheal", "off")`.

## Events (`events.ts`, `harnessBus`)
`onPlanStart, onPlanDelta, onPlanEnd, onFileStart, onFileDelta, onFileEnd, onPatchApplied, onPatchFailed, onTruncationGuard, onSnapshot, onPreviewReady, onRuntimeError, onElementSelected, onSelfHealAttempt, onSelfHealResolved, onSelfHealExhausted, onSkillsRouted, onComplete`. Listeners are isolated: a throwing listener never affects generation.

## Provider independence
The harness consumes the final text stream only (the same `full` string every provider path already builds), so Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, keyless gateways and custom endpoints all behave identically.

## Dependency resolution
Zeus screens are offline-first, so stored HTML is never rewritten. Bare imports in `<script type="module">` become an `importmap` of pinned esm.sh builds at render time (`resolver.ts`: lucide-react, framer-motion, recharts, clsx, tailwind-merge, canvas-confetti, three, @radix-ui/*, and more). A failed import surfaces through the bridge as a `resource` error.
