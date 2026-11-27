// Cognitive prompt compiler + context assembler (Pillars 1 and 3).
//
// compileSovereignPrompt  -> the system-prompt section: planning protocol, patch protocol, active skills.
// assembleWorkspaceState  -> the compact, authoritative user-turn block: VFS state, selected element, telemetry.
// compactCanvasState / compactHistory -> token-optimal replacements for "dump every screen, every turn".

import { routeSkills, skillSection, type RouteContext } from "./skills";
import { outlineFile } from "./vfs";
import type { BoardLike, ChatLike, RuntimeErrorPayload, SelectedElementContext, SkillMatch } from "./types";

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */
export const PROTOCOL_PROMPT = `## Zeus Sovereign protocol (extends the output protocol above)
1. PLAN FIRST. Before the first artboard, emit exactly one blueprint block. Plain text, no code, at most 12 short lines (2-3 lines for a small patch):
<zeus_plan>
Intent: who uses this and the one job it must do
Direction: the aesthetic idea in one sentence, plus the signature layout move
Tokens: surface / ink / accent as oklch() or hsl() values, display + text font from the bundled list, radius, spacing unit
Components: the hierarchy, outermost to innermost
States: hover, focus, empty, loading, error, selected, and what the user can actually do
</zeus_plan>
The plan is shown to the user as your reasoning. Never repeat it in the chat reply.
2. TWO WRITE MODES. New screen or heavy rework: a COMPLETE document, <artboard name="..." device="..." mode="new"> or mode="revise" with its id. Targeted change to an existing screen: a surgical patch,
<artboard id="<existing id>" name="<screen name>" mode="patch">
<<<<<<< SEARCH
lines copied verbatim from the current screen (2-6 lines, unique)
=======
the same lines, edited
>>>>>>> REPLACE
</artboard>
Several small blocks are fine. An empty REPLACE deletes; to insert, repeat an anchor line inside both halves. The harness matches SEARCH tolerant of indentation, but a SEARCH that is not in the screen is rejected.
3. NEVER TRUNCATE. A full write contains every line. Placeholders such as "<!-- ... rest unchanged -->", "/* existing code */" or "// ... rest of code" are detected, the original is spliced back in, and a rewrite that still loses content is rejected.
4. The structured form <zeus_artifact><zeus_action type="file|patch" path="Screen name" device="web">...</zeus_action></zeus_artifact> is accepted as an exact synonym of the artboard forms above.
5. After the closing tag of the last artboard write nothing.`;

export interface SovereignPromptInput extends RouteContext {
  /** Names of existing screens, for the patch rule. */
  boardNames?: string[];
}

export interface CompiledPrompt {
  text: string;
  skills: SkillMatch[];
}

export function compileSovereignPrompt(input: SovereignPromptInput): CompiledPrompt {
  const skills = routeSkills(input);
  const blocks = [
    PROTOCOL_PROMPT,
    skillSection(skills),
    input.hasBoards && input.boardNames?.length
      ? `Screens currently on the canvas: ${input.boardNames.slice(0, 12).map((n) => `"${n}"`).join(", ")}.`
      : "",
  ].filter(Boolean);
  return { text: blocks.join("\n\n"), skills };
}

/* ------------------------------------------------------------------ */
/* Context blocks                                                      */
/* ------------------------------------------------------------------ */
const esc = (s: string) => s.replace(/"/g, "'");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "..." : s);

export function formatSelectedElement(el: SelectedElementContext, boardName?: string): string {
  const styles = Object.entries(el.styles)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return [
    `<selected_element board="${esc(el.boardId)}"${boardName ? ` name="${esc(boardName)}"` : ""}>`,
    `tag: ${el.tag}`,
    el.component ? `component: ${el.component}` : "",
    el.id ? `id: ${el.id}` : "",
    el.classes.length ? `classes: ${el.classes.slice(0, 12).join(" ")}` : "",
    el.text ? `text: "${clip(el.text.replace(/\s+/g, " "), 100)}"` : "",
    `dom_path: ${el.domPath}`,
    `source: ${el.sourceLocator || el.domPath}`,
    `size: ${Math.round(el.rect.w)}x${Math.round(el.rect.h)} at ${Math.round(el.rect.x)},${Math.round(el.rect.y)}`,
    styles ? `computed: ${styles}` : "",
    `html: ${clip(el.outerHtml.replace(/\s+/g, " "), 600)}`,
    "The user's request applies to THIS element and the CSS rules that style it. Patch the smallest region that contains it.",
    "</selected_element>",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTelemetry(errors: RuntimeErrorPayload[], boardName?: string): string {
  if (!errors.length) return "";
  const lines = errors.slice(-5).map((e, i) => {
    const loc = e.line ? ` at line ${e.line}${e.column ? `:${e.column}` : ""}` : "";
    return [
      `${i + 1}. [${e.kind}${e.fatal ? ", fatal" : ""}] ${clip(e.message, 300)}${loc}${e.file ? ` in ${e.file}` : ""}`,
      e.source ? `   source: ${clip(e.source.replace(/\s+/g, " "), 200)}` : "",
      e.componentStack ? `   components: ${clip(e.componentStack.replace(/\s+/g, " "), 240)}` : "",
      e.stack ? `   stack: ${clip(e.stack.split("\n").slice(0, 3).join(" | "), 280)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return `<runtime_telemetry${boardName ? ` board="${esc(boardName)}"` : ""}>\n${lines.join("\n")}\n</runtime_telemetry>`;
}

/** Which screens are "active" for this turn: named in the request, the target, or what the last turn touched. */
export function selectActiveBoards(
  userText: string,
  boards: BoardLike[],
  opts: { targetId?: string; lastTouchedIds?: string[] } = {}
): string[] {
  if (opts.targetId) return [opts.targetId];
  const t = userText.toLowerCase();
  const named = boards.filter((b) => b.name && t.includes(b.name.toLowerCase())).map((b) => b.id);
  if (named.length) return named;
  if (/\b(all|every|each|both)\b.*\b(screens?|pages?|boards?|artboards?|sheets?)\b|\b(whole|entire)\b.*\b(canvas|page|design|app)\b/.test(t)) {
    return boards.map((b) => b.id);
  }
  const touched = (opts.lastTouchedIds ?? []).filter((id) => boards.some((b) => b.id === id));
  if (touched.length) return touched;
  return boards.slice(0, 1).map((b) => b.id);
}

export function compactCanvasState(
  boards: BoardLike[],
  opts: { activeIds: string[]; maxChars: number; strip: (html: string) => string }
): string {
  const active = new Set(opts.activeIds);
  const body = boards
    .map((b) => {
      const clean = opts.strip(b.html);
      const head = `id="${esc(b.id)}" name="${esc(b.name)}" device="${esc(b.device)}" version="${b.version}"`;
      if (active.has(b.id)) {
        const shown = clean.length > opts.maxChars ? clean.slice(0, opts.maxChars) : clean;
        const note =
          clean.length > opts.maxChars
            ? `\n<!-- [${clean.length - opts.maxChars} chars omitted at the end. Patch only regions visible above.] -->`
            : "";
        return `<artboard ${head} state="full">\n${shown}${note}\n</artboard>`;
      }
      return `<artboard ${head} state="summary">${esc(outlineFile(b.name, clean))}</artboard>`;
    })
    .join("\n\n");
  return `<canvas_state count="${boards.length}" mode="authoritative">\n${body}\n</canvas_state>`;
}

const ARTBOARD_BODY = /<artboard\b([^>]*)>[\s\S]*?(?:<\/artboard>|$)/gi;

/** Replace artboard bodies in a history message with stubs. */
export function stubArtboards(content: string): string {
  return content.replace(ARTBOARD_BODY, (_m, attrs: string) => {
    const name = /name="([^"]*)"/.exec(attrs)?.[1] ?? "screen";
    return `<artboard name="${name}">[body omitted: see canvas_state]</artboard>`;
  });
}

export interface HistoryCompactOptions {
  keepRecent?: number;
  oldMaxChars?: number;
  /** True when the final user turn already carries <canvas_state> or <current_artboard>. */
  authoritativeState: boolean;
}

/**
 * Token-optimal history: full recent turns, one-line older turns, no stale code dumps, no stale images.
 * Never mutates the input.
 */
export function compactHistory<T extends ChatLike>(messages: T[], opts: HistoryCompactOptions): T[] {
  const keepRecent = opts.keepRecent ?? 4;
  const oldMax = opts.oldMaxChars ?? 420;
  const n = messages.length;
  const recentFrom = Math.max(0, n - keepRecent);
  const collapseBefore = Math.max(0, n - keepRecent * 3);
  const mapped: T[] = messages.map((m, i) => {
    if (i === n - 1) return m; // the live user turn is never touched
    let content = m.content;
    if (opts.authoritativeState || i < recentFrom) content = stubArtboards(content);
    content = content.replace(/<(?:canvas_state|current_artboard)\b[\s\S]*?<\/(?:canvas_state|current_artboard)>/gi, "[state omitted]");
    if (i < recentFrom) content = clip(content, oldMax);
    return { ...m, content, attachments: i < recentFrom ? [] : m.attachments };
  });
  if (collapseBefore <= 1) return mapped;
  const dropped = mapped.slice(0, collapseBefore);
  const rest = mapped.slice(collapseBefore);
  const asks = dropped
    .filter((m) => m.role === "user")
    .map((m) => `- ${clip(m.content.replace(/\s+/g, " "), 120)}`)
    .slice(-8);
  const firstUser = rest.findIndex((m) => m.role === "user");
  if (firstUser < 0 || asks.length === 0) return rest;
  const trimmed = rest.slice(firstUser);
  trimmed[0] = { ...trimmed[0], content: `[Earlier in this conversation the user asked:\n${asks.join("\n")}]\n\n${trimmed[0].content}` };
  return trimmed;
}

export interface WorkspaceStateInput {
  head?: { id: string; label: string; seq: number } | null;
  files?: { path: string; content: string }[];
  activePaths?: string[];
  selectedElement?: SelectedElementContext | null;
  selectedBoardName?: string;
  errors?: RuntimeErrorPayload[];
  errorBoardName?: string;
  maxFileChars?: number;
}

/** The compact block appended to the final user turn. Empty when there is nothing worth saying. */
export function assembleWorkspaceState(input: WorkspaceStateInput): string {
  const parts: string[] = [];
  if (input.head) parts.push(`version: v${input.head.seq} "${esc(input.head.label)}"`);
  if (input.files?.length) {
    const active = new Set(input.activePaths ?? []);
    const max = input.maxFileChars ?? 24000;
    const lines = input.files.map((f) =>
      active.has(f.path) && f.content.length <= max ? `[active] ${outlineFile(f.path, f.content)}` : outlineFile(f.path, f.content)
    );
    parts.push(`vfs:\n${lines.map((l) => ` - ${l}`).join("\n")}`);
  }
  if (input.selectedElement) parts.push(formatSelectedElement(input.selectedElement, input.selectedBoardName));
  if (input.errors?.length) parts.push(formatTelemetry(input.errors, input.errorBoardName));
  if (!parts.length) return "";
  return `<zeus_workspace_state>\n${parts.join("\n")}\n</zeus_workspace_state>`;
}
