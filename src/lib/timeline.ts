import type { Message, MessagePart, ToolCall } from "../types";
import { ToolAliases } from "./stormyAgent";
import { listenTerminal } from "./bridge";

/** Where in the streamed text / reasoning each tool call first appeared (OpenCode orders parts by arrival). */
export type PartAnchors = Map<string, { t: number; r: number }>;

export function anchorTools(anchors: PartAnchors, tools: ToolCall[], textLen: number, reasonLen: number) {
  for (const t of tools) if (!anchors.has(t.id)) anchors.set(t.id, { t: textLen, r: reasonLen });
}

/** Interleaves reasoning, text and tool calls in the order they streamed: reasoning > tool > text > tool > text. */
export function buildParts(
  text: string,
  reasoning: string,
  thinkMs: number | undefined,
  tools: ToolCall[],
  anchors: PartAnchors
): MessagePart[] {
  const parts: MessagePart[] = [];
  let tPos = 0;
  let rPos = 0;
  let msUsed = false;
  const pushReasoning = (to: number) => {
    const slice = reasoning.slice(rPos, to);
    rPos = Math.max(rPos, to);
    if (!slice.trim()) return;
    parts.push({ type: "reasoning", text: slice, ms: msUsed ? undefined : thinkMs });
    msUsed = true;
  };
  const pushText = (to: number) => {
    const slice = text.slice(tPos, to);
    tPos = Math.max(tPos, to);
    if (slice.trim()) parts.push({ type: "text", text: slice });
  };
  for (const t of tools) {
    const a = anchors.get(t.id) ?? { t: 0, r: 0 };
    pushReasoning(Math.min(a.r, reasoning.length));
    pushText(Math.min(a.t, text.length));
    parts.push({ type: "tool", toolId: t.id });
  }
  pushReasoning(reasoning.length);
  pushText(text.length);
  return parts;
}

/** Ordered parts for any message. Older messages (no `parts`) keep the reasoning > tools > text layout. */
export function partsOf(m: Message): MessagePart[] {
  if (m.parts && m.parts.length) {
    // Tools written outside the streaming loop have no part yet; they trail the ordered parts.
    const known = new Set(m.parts.flatMap((p) => (p.type === "tool" ? [p.toolId] : [])));
    const extra = (m.tools ?? []).filter((t) => !known.has(t.id));
    return extra.length ? [...m.parts, ...extra.map((t): MessagePart => ({ type: "tool", toolId: t.id }))] : m.parts;
  }
  const out: MessagePart[] = [];
  if (m.reasoning) out.push({ type: "reasoning", text: m.reasoning, ms: m.thinkMs });
  for (const t of m.tools ?? []) out.push({ type: "tool", toolId: t.id });
  if (m.text) out.push({ type: "text", text: m.text });
  return out;
}

const EXPLORE = new Set(["read_file", "list_files", "glob", "grep", "search_project", "search_code", "get_file_info"]);

export function isExploreTool(name: string): boolean {
  if (name.startsWith("mcp:")) return false;
  return EXPLORE.has(ToolAliases.canonicalName(name)) || EXPLORE.has(name);
}

export type TimelineItem =
  | { kind: "reasoning"; key: string; text: string; ms?: number; last: boolean }
  | { kind: "text"; key: string; text: string; last: boolean }
  | { kind: "tool"; key: string; tool: ToolCall }
  | { kind: "explore"; key: string; tools: ToolCall[] };

/** Folds parts into render rows; consecutive read/search tools collapse into one `Explored` group. */
export function timelineItems(m: Message): TimelineItem[] {
  const parts = partsOf(m);
  const byId = new Map((m.tools ?? []).map((t) => [t.id, t]));
  const items: TimelineItem[] = [];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    if (p.type === "reasoning") items.push({ kind: "reasoning", key: `r${i}`, text: p.text, ms: p.ms, last });
    else if (p.type === "text") items.push({ kind: "text", key: `x${i}`, text: p.text, last });
    else {
      const tool = byId.get(p.toolId);
      if (!tool) return;
      const prev = items[items.length - 1];
      if (isExploreTool(tool.name)) {
        if (prev && prev.kind === "explore") prev.tools.push(tool);
        else items.push({ kind: "explore", key: `g${tool.id}`, tools: [tool] });
      } else items.push({ kind: "tool", key: tool.id, tool });
    }
  });
  return items;
}

/* ------------------------------------------------------------------ */
/* Follow state (OpenCode `follow.ts`): following <-> detached          */
/* ------------------------------------------------------------------ */
export type FollowState = "following" | "detached";
export type FollowEvent = "wheel.up" | "touch.up" | "key.up" | "scroll.away" | "at.end" | "return";

export function transitionFollow(state: FollowState, e: FollowEvent): FollowState {
  if (e === "wheel.up" || e === "touch.up" || e === "key.up" || e === "scroll.away") return "detached";
  if (e === "return") return "following";
  return state === "detached" && e === "at.end" ? "following" : state;
}

/* ------------------------------------------------------------------ */
/* Live shell output: `zeus://term` chunks stream into the running tool */
/* ------------------------------------------------------------------ */
const SHELL = new Set(["run_command", "python"]);

export function listenLiveShell(getTools: () => ToolCall[], onUpdate: () => void): Promise<() => void> {
  let raf = 0;
  const bump = () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; onUpdate(); });
  };
  return listenTerminal((e) => {
    if (e.source !== "agent" || e.chunk === undefined) return;
    const running = getTools().filter((t) => t.status === "running" && SHELL.has(ToolAliases.canonicalName(t.name)));
    if (!running.length) return;
    const target = running[running.length - 1];
    target.output = ((target.output ?? "") + e.chunk).slice(-60_000);
    bump();
  });
}
