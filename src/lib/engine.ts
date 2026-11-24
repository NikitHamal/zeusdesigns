import { activeConv, uid, useStore } from "../store";
import type { Artboard, Attachment, Device, Message, Quote, ToolCall } from "../types";
import { DEVICE_SIZE } from "../types";
import { getDS } from "./designSystems";
import { SKILLS } from "./skills";
import { detectArchetype, renderScreen, VARIANT_NAMES } from "./templates";
import { generateTitle, isNative, nativeChat, nativePerf, ChatEvent, ChatRequest } from "./bridge";
import { findProvider } from "./providers";
import { canvasApi } from "./canvasApi";
import { harden, harnessPrompt } from "./harness";
import { memoryBlock, extractRemember, addMemory as saveMemory, learnFromText } from "./memory";
import { toolsPrompt } from "./tools";
import { agentPrompt, buildPlainContext, classifyIntent, GREETING_RE } from "./agent";
import { getCodingHarnessProfile } from "./codingHarness";
import { recordTrajectoryReflection, runPostToolUseHook } from "./harness2";
import { auditHtml, patchFor } from "./audit";
import { canCallModel, oneShot } from "./oneshot";
import { tokensCss } from "./designSystems";
import { isStudioTool, runStudioTool, studioBrief } from "./studio";
import {
  applyThemeOverrideToHtml,
  buildContinuationPrompt,
  buildMultiTurnContext,
  compactConversation,
  getConversationBoards,
  getContextWindowStats,
  getProviderSpecialization,
  isCanvasRefusal,
  looksLikeRefusalStart,
} from "./context";

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */
export function buildSystemPrompt(opts: { intent?: string; device?: Device; tools?: string } = {}): string {
  const s = useStore.getState();
  const ds = getDS(s.settings.designSystemId);
  const spec = getProviderSpecialization(s.settings.providerId, s.settings.modelId);
  const skills = SKILLS.filter((k) => s.settings.skills.includes(k.id));
  const boards = getConversationBoards(s);
  const ws = s.ui.workspace;
  return [
    harnessPrompt(ds, opts.intent, opts.device),
    spec.specializationPrompt,
    skills.length ? `## Enabled skills\n${skills.map((k) => `### ${k.name}\n${k.prompt}`).join("\n")}` : "",
    studioBrief(opts.intent ?? "", ds, opts.device),
    memoryBlock(),
    opts.tools ?? "",
    boards.length ? `## Current canvas page\n${boards.map((a) => `- id=${a.id} name="${a.name}" device=${a.device} v${a.version}`).join("\n")}` : "## Current canvas page\n(empty)",
    ws ? `## Workspace\nOpen project folder: ${ws.name}${ws.root ? ` (${ws.root})` : ""}. Top-level files: ${ws.tree.slice(0, 40).map((n) => n.name + (n.dir ? "/" : "")).join(", ")}. Match its stack and conventions when producing code.` : "",
  ].filter(Boolean).join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Streaming parser for <artboard> blocks                              */
/* ------------------------------------------------------------------ */
interface Block { attrs: Record<string, string>; html: string; closed: boolean }

function parseAttrs(s: string) {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** Weak models often skip the <artboard> wrapper. Recover a bare HTML document (raw or fenced) as one artboard. */
export function normalizeStream(full: string): string {
  if (full.includes("<artboard")) return full;
  const m = /(```(?:html)?[ \t]*\n)?(<!doctype html|<html[\s>])/i.exec(full);
  if (!m) return full;
  const rest = full.slice(m.index + (m[1]?.length ?? 0));
  const title = /<title>([^<]{1,60})<\/title>/i.exec(rest)?.[1]?.trim() || "Screen";
  const open = `<artboard name="${title.replace(/"/g, "'")}" mode="new">\n`;
  const end = /<\/html>/i.exec(rest);
  if (!end) return full.slice(0, m.index) + open + rest;
  const stop = end.index + end[0].length;
  return full.slice(0, m.index) + open + rest.slice(0, stop) + "\n</artboard>" + rest.slice(stop).replace(/^\s*```/, "");
}

const LEAKED_PLAN_LINE = /^\s*(?:[-*•]\s*)?(?:\*\*)?(?:Font pairing|Signature move|Sections|Data points|Audience|Primary action)(?:\*\*)?\s*:/i;

export function extractLeakedPlan(raw: string): { cleanText: string; leakedPlan: string } {
  const lines = raw.split("\n");
  const kept: string[] = [];
  const plan: string[] = [];
  for (const line of lines) {
    if (LEAKED_PLAN_LINE.test(line)) {
      plan.push(line.trim());
    } else {
      kept.push(line);
    }
  }
  return { cleanText: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), leakedPlan: plan.join("\n") };
}

export function parseStream(full: string): { text: string; blocks: Block[]; leakedPlan?: string } {
  full = normalizeStream(
    full
      .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
      .replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, "")
  );
  // Strip fenced or raw tool call blocks so agent tool calls render as chips, not raw XML/JSON text
  full = full
    .replace(/```(?:xml|json|tool_call)?\s*<(?:zeus_tool|tool_call|function_call|function|invoke|ifm\|tool_calls)[\s\S]*?<\/(?:zeus_tool|tool_call|function_call|function|invoke|ifm\|tool_calls)>\s*```/gi, "")
    .replace(/<\|start\|>assistant<\|channel\|>commentary[\s\S]*?(?:<\|end\|>|<\|return\|>|<\|call\|>|$)/gi, "")
    .replace(/<zeus_tool[^>]*\/>/g, "")
    .replace(/<zeus_tool[\s\S]*?(<\/zeus_tool>|$)/g, "")
    .replace(/<tool_call[\s\S]*?(<\/tool_call>|$)/g, "")
    .replace(/<function_call[\s\S]*?(<\/function_call>|$)/g, "")
    .replace(/<function(?:=|\s+name=)[\s\S]*?(<\/function>|$)/gi, "")
    .replace(/<(?:antml:)?invoke\s+name=[\s\S]*?(<\/(?:antml:)?invoke>|$)/gi, "")
    .replace(/<ifm\|tool_calls>[\s\S]*?(<\/ifm\|tool_calls>|$)/gi, "")
    .replace(/<ifm\|tool_call>[\s\S]*?(<\/ifm\|tool_call>|$)/gi, "")
    .replace(/<\|open\|>tools[\s\S]*?(?:<\|close\|>tools(?:<\|sep\|>)?|$)/gi, "")
    .replace(/<\|open\|>call[\s\S]*?(?:<\|close\|>call(?:<\|sep\|>)?|$)/gi, "");
  let text = "";
  const blocks: Block[] = [];
  let i = 0;
  for (;;) {
    const s = full.indexOf("<artboard", i);
    if (s < 0) { text += full.slice(i); break; }
    text += full.slice(i, s);
    const gt = full.indexOf(">", s);
    if (gt < 0) break;
    const attrs = parseAttrs(full.slice(s + 9, gt));
    const e = full.indexOf("</artboard>", gt + 1);
    const clean = (h: string) => h.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const isRealHtmlBlock = (h: string, a: Record<string, string>) => {
      if (a.name === "..." || h.startsWith('".') || h.startsWith("'.")) return false;
      return /<(?:!doctype|html|head|body|style|div|main|section|header|nav|article|canvas|svg|script|h1|h2|table|form)\b/i.test(h);
    };
    if (e < 0) {
      const candidate = clean(full.slice(gt + 1));
      if (isRealHtmlBlock(candidate, attrs)) {
        blocks.push({ attrs, html: candidate, closed: false });
      }
      break;
    }
    const candidate = clean(full.slice(gt + 1, e));
    if (isRealHtmlBlock(candidate, attrs)) {
      blocks.push({ attrs, html: candidate, closed: true });
    }
    i = e + 11;
  }
  const cleanedStray = text.replace(/^\s*(?:``|''|,,)+\s*$/gm, "").trim();
  const { cleanText, leakedPlan } = extractLeakedPlan(cleanedStray);
  return { text: cleanText, blocks, leakedPlan: leakedPlan || undefined };
}

/* ------------------------------------------------------------------ */
/* Demo engine (offline template designer)                             */
/* ------------------------------------------------------------------ */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function demoRevise(html: string, instruction: string): { html: string; note: string } {
  const t = instruction.toLowerCase();
  const css: string[] = [];
  const notes: string[] = [];
  if (/dark|night/.test(t)) { css.push(":root{--bg:#111116;--surface:#1c1c24;--surface-2:#272731;--text:#f3f3f7;--muted:#a6a6b5;--outline:#3b3b48;--container:#2f2a55;--on-container:#e6deff}"); notes.push("switched to a dark palette"); }
  if (/round|soft|pill/.test(t)) { css.push(":root{--r-card:32px;--r-lg:28px;--r-md:22px;--r-btn:999px}"); notes.push("increased corner radii"); }
  if (/sharp|square|boxy/.test(t)) { css.push(":root{--r-card:4px;--r-lg:4px;--r-md:3px;--r-btn:4px}"); notes.push("squared the corners"); }
  if (/big|large|bigger|larger|readab/.test(t)) { css.push("body{font-size:17px}h1{font-size:1.2em}.btn{height:56px}"); notes.push("scaled up type and tap targets"); }
  if (/compact|dense|tight|small/.test(t)) { css.push(".scroll{gap:10px!important}.item{padding:8px 12px!important}.card{padding:12px!important}"); notes.push("tightened spacing"); }
  const colors: Record<string, [string, string, string]> = {
    red: ["#d32f2f", "#ffdad6", "#410002"], orange: ["#ef6c00", "#ffe0b2", "#3e1d00"], yellow: ["#f9a825", "#fff1b8", "#3b2f00"],
    green: ["#2e7d32", "#c8f2cb", "#00210a"], teal: ["#00796b", "#bff5ec", "#00201b"], blue: ["#1565c0", "#d3e4ff", "#001c3b"],
    purple: ["#7b1fa2", "#f3d9ff", "#2d0040"], pink: ["#d81b60", "#ffd8e6", "#3e001d"], black: ["#111111", "#e6e6e6", "#111111"],
  };
  for (const c of Object.keys(colors)) if (new RegExp(`\\b${c}\\b`).test(t)) { css.push(`:root{--primary:${colors[c][0]};--container:${colors[c][1]};--on-container:${colors[c][2]};--tertiary:${colors[c][0]}}`); notes.push(`recolored with ${c}`); break; }
  if (!css.length) { css.push(".btn{letter-spacing:.01em}"); notes.push("polished depth and spacing"); }
  const tag = `<style data-zeus-rev>${css.join("")}</style>`;
  return { html: html.includes("</head>") ? html.replace("</head>", tag + "</head>") : tag + html, note: notes.join(", ") };
}

async function demoRun(opts: {
  prompt: string; device: Device; target?: Artboard; onDelta: (t: string) => void; signal: AbortSignal; asVariant?: boolean;
}) {
  const s = useStore.getState();
  const ds = getDS(s.settings.designSystemId);
  const emit = async (text: string, chunk = 900, delay = 10) => {
    for (let i = 0; i < text.length; i += chunk) {
      if (opts.signal.aborted) return;
      opts.onDelta(text.slice(i, i + chunk));
      await sleep(delay);
    }
  };
  if (opts.target && !opts.asVariant && opts.target.html.includes("Empty frame")) {
    const arche = detectArchetype(opts.prompt, opts.target.device);
    await emit(`Filling **${opts.target.name}** with a ${arche} design in **${ds.name}**.\n\n`, 40, 12);
    await emit(`<artboard name="${arche[0].toUpperCase() + arche.slice(1)}" device="${opts.target.device}" mode="revise" id="${opts.target.id}">\n${renderScreen(ds, arche, 0, opts.target.device, "Zeus")}\n</artboard>`);
    return;
  }
  if (opts.target && !opts.asVariant) {
    const r = demoRevise(opts.target.html, opts.prompt);
    await emit(`Updated **${opts.target.name}** — ${r.note}.\n\n_Demo engine: connect a real model (Mercury 3, Qwen…) in the native app for full redesigns._\n\n`, 40, 12);
    await emit(`<artboard name="${opts.target.name}" device="${opts.target.device}" mode="revise" id="${opts.target.id}">\n${r.html}\n</artboard>`);
    return;
  }
  const device: Device = opts.target?.device ?? opts.device;
  const arche = detectArchetype(opts.prompt, device);
  const title = (opts.prompt.match(/(?:for|called|named)\s+(?:an?\s+|the\s+)?([A-Z][\w-]+(?:\s[A-Z][\w-]+)?)/)?.[1]) ?? "Zeus";
  const count = opts.target ? 1 : 3;
  await emit(`Exploring **${count === 1 ? "a new direction" : "3 directions"}** for your ${arche} ${device === "web" ? "web page" : "screen"} in **${ds.name}**:\n\n${count === 1 ? "- A fresh take on the selected screen\n" : "- **Balanced** — familiar hierarchy, calm surfaces\n- **Bold** — oversized type & expressive color blocks\n- **Compact** — denser, list-first layout\n"}\nTap around — tabs, chips, switches and hearts are live. Pin a comment or use *Ask Zeus* to refine any of them.\n\n`, 30, 14);
  for (let v = 0; v < count; v++) {
    if (opts.signal.aborted) return;
    const vi = opts.target ? (opts.target.version + 1) % 3 : v;
    const html = renderScreen(ds, arche, vi, device, title);
    await emit(`<artboard name="${arche[0].toUpperCase() + arche.slice(1)} · ${VARIANT_NAMES[vi]}" device="${device}" mode="new">\n${html}\n</artboard>\n`, 1400, 8);
  }
}

/* ------------------------------------------------------------------ */
/* Custom OpenAI / Anthropic streaming (browser fallback)              */
/* ------------------------------------------------------------------ */
async function streamCustom(req: ChatRequest, onDelta: (t: string) => void, onReasoning: (t: string) => void, signal: AbortSignal) {
  const c = req.custom!;
  const base = c.baseUrl.replace(/\/+$/, "");
  const sse = async (res: Response, pick: (j: any) => { text?: string; think?: string }) => {
    if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        const t = l.trim();
        const d = t.startsWith("data:") ? t.slice(5).trim() : t.startsWith("{") ? t : "";
        if (!d || d === "[DONE]") continue;
        try {
          const out = pick(JSON.parse(d));
          if (out.think) onReasoning(out.think);
          if (out.text) onDelta(out.text);
        } catch { /* ignore partial */ }
      }
    }
    const tail = buf.trim();
    if (tail.startsWith("{")) {
      try {
        const out = pick(JSON.parse(tail));
        if (out.think) onReasoning(out.think);
        if (out.text) onDelta(out.text);
      } catch { /* ignore partial */ }
    }
  };
  const msgs = req.messages.map((m) => {
    const imgs = (m.attachments ?? []).filter((a) => a.mime.startsWith("image/"));
    if (!imgs.length) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: c.format === "anthropic"
        ? [...imgs.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.dataUrl.split(",")[1] } })), { type: "text", text: m.content }]
        : [...imgs.map((i) => ({ type: "image_url", image_url: { url: i.dataUrl } })), { type: "text", text: m.content }],
    };
  });
  if (c.format === "anthropic") {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": c.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: req.model, max_tokens: 16000, stream: true, system: req.system, messages: msgs }),
    });
    await sse(res, (j) => (j.type === "content_block_delta" ? { text: j.delta?.text ?? "", think: j.delta?.thinking ?? "" } : {}));
  } else {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (c.apiKey) headers.authorization = `Bearer ${c.apiKey}`;
    const hasImgs = req.messages.some((m) => (m.attachments ?? []).some((a) => a.mime.startsWith("image/")));
    const effModel =
      base.includes("kilo.ai") && hasImgs && !/vl|omni|particle|dots-3|openrouter\/free/i.test(req.model)
        ? "nvidia/nemotron-3.5-super-vl:free"
        : req.model;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST", signal,
      headers,
      body: JSON.stringify({
        model: effModel,
        max_tokens: 16384,
        stream: true,
        messages: [{ role: "system", content: req.system }, ...msgs],
        ...(req.effort !== "medium" && !base.includes("kilo.ai") && !base.includes("llm7.io")
          ? { reasoning_effort: req.effort === "max" ? "high" : req.effort }
          : {}),
      }),
    });
    const tcMap = new Map<number, { name: string; args: string }>();
    await sse(res, (j) => {
      const d = j.choices?.[0]?.delta ?? j.choices?.[0]?.message;
      if (Array.isArray(d?.tool_calls)) {
        d.tool_calls.forEach((tc: any, idx: number) => {
          const i = typeof tc.index === "number" ? tc.index : idx;
          const cur = tcMap.get(i) ?? { name: "", args: "" };
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          tcMap.set(i, cur);
        });
      }
      return { text: d?.content ?? "", think: d?.reasoning_content ?? d?.reasoning ?? "" };
    });
    for (const tc of tcMap.values()) {
      if (tc.name.trim()) {
        let parsed: any = { body: tc.args };
        try { parsed = JSON.parse(tc.args); } catch { /* raw */ }
        onDelta(`\n<tool_call>${JSON.stringify({ name: tc.name.trim(), arguments: parsed })}</tool_call>`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */
const DESIGN_INTENT = /(design|screen|landing|dashboard|mockup|mock-up|wireframe|\bui\b|\bux\b|layout|onboarding|\bapp\b|\bpage\b|redesign|variant|login|checkout|profile|settings page|hero)/i;
let controller: AbortController | null = null;
let nativeCancel: (() => void) | null = null;

export function stopGeneration() {
  controller?.abort();
  nativeCancel?.();
}

const quoteToText = (q: Quote, boards: Artboard[]) => {
  const a = q.artboardId ? boards.find((b) => b.id === q.artboardId) : undefined;
  if (q.kind === "element") return `[Context: the user selected the element <${q.label}> inside screen "${a?.name ?? "screen"}"${a ? ` (id=${a.id})` : ""}. Its HTML: ${q.text ?? ""}. Apply the request to this element only, leave the rest of the screen untouched, and return the full document with mode="revise" and the same id.]`;
  return `[Context: ${q.kind === "pin" ? "pinned comment on" : "selected"} screen "${a?.name ?? q.label}"${a ? ` (id=${a.id})` : ""}${q.text ? ` — "${q.text}"` : ""}]`;
};

export async function sendMessage(opts: { text: string; attachments?: Attachment[]; quote?: Quote; asVariant?: boolean }) {
  const st = useStore.getState();
  if (st.busy || !opts.text.trim()) return;
  if (opts.text.trim().toLowerCase() === "/compact") {
    await compactConversation({ manual: true });
    return;
  }

  const convId = st.activeConvId;
  const { settings } = st;
  const tools: ToolCall[] = [];

  // Auto-compaction when multi-turn context approaches provider budget
  const ctxStats = getContextWindowStats();
  if (ctxStats.needsCompaction) {
    const compacted = await compactConversation({ convId, manual: false });
    if (compacted.compacted) {
      tools.push({
        id: uid(),
        name: "context_compact",
        args: `freed ~${compacted.savedTokens.toLocaleString()} tokens`,
        status: "ok",
        output: compacted.summary,
      });
    }
  }

  const freshSt = useStore.getState();
  const conv = activeConv(freshSt);
  const target = opts.quote?.artboardId ? freshSt.artboards.find((a) => a.id === opts.quote!.artboardId) : undefined;

  const userMsg: Message = { id: uid(), role: "user", text: opts.text.trim(), quote: opts.quote, attachments: opts.attachments, at: Date.now() };
  const asstId = uid();
  const prov = settings.providerId.startsWith("custom:") ? null : findProvider(settings.providerId);
  const custom = settings.providerId.startsWith("custom:") ? settings.customProviders.find((c) => `custom:${c.id}` === settings.providerId) : undefined;
  const modelLabel = custom ? custom.model : prov?.models.find((m) => m.id === settings.modelId)?.label ?? settings.modelId;
  freshSt.addMessage(convId, userMsg);
  freshSt.addMessage(convId, { id: asstId, role: "assistant", text: "", streaming: true, model: modelLabel, at: Date.now(), tools: [...tools], artboardIds: [] });
  freshSt.setBusy(true);
  void learnFromText(opts.text).then((l) => { if (l.length) useStore.getState().notify(l.length === 1 ? "Saved to memory" : `Saved ${l.length} lines to memory`); });

  // instant title via ChatJimmy (micro-task engine)
  if (settings.autoTitle && !conv.titled && conv.messages.length === 0) {
    generateTitle(opts.text).then((t) => useStore.getState().setTitle(convId, t));
  }

  const boards = getConversationBoards(freshSt);
  const spec = getProviderSpecialization(settings.providerId, settings.modelId);
  const mode = classifyIntent(opts.text, { boards: boards.length, quote: Boolean(opts.quote), asVariant: opts.asVariant, workspace: Boolean(freshSt.ui.workspace) });
  const { messages: history, themeOverride, isCanvasFollowUp } = mode === "design"
    ? buildMultiTurnContext({ convMessages: conv.messages, userMsg, boards, target, asVariant: opts.asVariant, quoteToText, spec })
    : buildPlainContext({ convMessages: conv.messages, userMsg, quoteToText, mode });

  controller = new AbortController();
  const signal = controller.signal;
  let full = "";
  const t0 = performance.now();
  const idMap = new Map<number, string>();
  const preSyncedIds = new Set<string>();

  // Instant pre-stream canvas synchronization for theme/palette/mode changes on existing sheets
  if (themeOverride && boards.length > 0 && !opts.asVariant) {
    const S = useStore.getState();
    const targetBoards = target ? [target] : boards;
    targetBoards.forEach((b, idx) => {
      const cur = S.artboards.find((x) => x.id === b.id);
      if (cur) {
        const themed = applyThemeOverrideToHtml(cur.html, themeOverride);
        S.reviseArtboard(b.id, themed);
        idMap.set(100 + idx, b.id);
        preSyncedIds.add(b.id);
      }
    });
    if (preSyncedIds.size > 0) {
      tools.push({
        id: uid(),
        name: "studio_retheme_page",
        args: `${themeOverride.name} · ${preSyncedIds.size} screen${preSyncedIds.size > 1 ? "s" : ""}`,
        status: "ok",
        output: `Applied ${themeOverride.name} token overrides across ${preSyncedIds.size} canvas screen(s) while preserving layout structure.`,
      });
      S.patchMessage(convId, asstId, {
        artboardIds: [...preSyncedIds],
        tools: [...tools],
      });
    }
  }
  const created: string[] = [];
  const lastPush = new Map<number, { t: number; len: number }>();
  const linted = new Set<number>();
  let extraThink = "";
  let thinkT0 = 0;
  let thinkEnd = 0;

  const sync = (final = false) => {
    const { text, blocks, leakedPlan } = parseStream(extractRemember(full).clean);
    const S = useStore.getState();
    blocks.forEach((b, i) => {
      let id = idMap.get(i);
      const bDevice = (["mobile", "tablet", "web"].includes(b.attrs.device) ? b.attrs.device : target?.device ?? boards[i]?.device ?? "mobile") as Device;
      if (!id) {
        // Match existing artboard by explicit id, by name, or by positional index during a multi-turn canvas revision
        const byId = b.attrs.id ? S.artboards.find((a) => a.id === b.attrs.id) : undefined;
        const byName = !byId && isCanvasFollowUp && b.attrs.name
          ? boards.find((a) => a.name.toLowerCase() === b.attrs.name.toLowerCase())
          : undefined;
        const byTarget = !byId && !byName && target && !opts.asVariant && i === 0 ? target : undefined;
        const byIndex = !byId && !byName && !byTarget && isCanvasFollowUp && !opts.asVariant && (b.attrs.mode === "revise" || Boolean(themeOverride))
          ? boards[i]
          : undefined;
        const existing = byId ?? byName ?? byTarget ?? byIndex;
        if (existing) {
          id = existing.id;
          S.updateArtboard(id, { loading: true });
        } else {
          const ab = S.addArtboard({
            name: b.attrs.name || `Screen ${S.artboards.length + 1}`, device: bDevice, html: "", loading: true,
            groupId: opts.asVariant && target ? target.groupId : undefined,
            w: DEVICE_SIZE[bDevice].w, h: DEVICE_SIZE[bDevice].h,
          });
          id = ab.id;
          created.push(id);
          if (created.length === 1) setTimeout(() => canvasApi.fit(created), 60);
        }
        idMap.set(i, id);
        lastPush.set(i, { t: 0, len: 0 });
      }
      const lp = lastPush.get(i)!;
      const now = performance.now();
      const isRevise = !created.includes(id);
      const dsNow = getDS(S.settings.designSystemId);
      if (b.closed || final) {
        const out = harden(b.html, dsNow, { intent: opts.text, name: b.attrs.name, device: bDevice });
        const finalHtml = themeOverride ? applyThemeOverrideToHtml(out.html, themeOverride) : out.html;
        if (isRevise && !preSyncedIds.has(id)) S.reviseArtboard(id, finalHtml); else S.updateArtboard(id, { html: finalHtml });
        S.updateArtboard(id, { loading: false });
        lastPush.set(i, { t: now, len: -1 });
        if (out.fixes.length && !linted.has(i)) {
          linted.add(i);
          tools.push({ id: uid(), name: "design_lint", args: b.attrs.name || "screen", status: "ok", output: out.fixes.join("\n") });
        }
      } else if (lp.len !== -1 && !isRevise && b.html.length > 400 && now - lp.t > 700 && b.html.length - lp.len > 300) {
        const partialHtml = harden(b.html, dsNow, { partial: true, intent: opts.text, name: b.attrs.name, device: bDevice }).html;
        S.updateArtboard(id, { html: themeOverride ? applyThemeOverrideToHtml(partialHtml, themeOverride) : partialHtml });
        lastPush.set(i, { t: now, len: b.html.length });
      }
    });
    const ms = performance.now() - t0;
    const thoughts = [...full.matchAll(/<think(?:ing)?>([\s\S]*?)(<\/think(?:ing)?>|$)/gi)];
    const reasoning = [extraThink.trim(), ...thoughts.map((m) => m[1].trim()), leakedPlan ?? ""].filter(Boolean).join("\n\n");
    if (reasoning && !thinkT0) thinkT0 = performance.now();
    const thinkOpen = thoughts.length > 0 && thoughts[thoughts.length - 1][2] === "";
    if (reasoning && !thinkEnd && ((!thinkOpen && (text || blocks.length || tools.length)) || final)) thinkEnd = performance.now();
    const hasUnclosed = final && blocks.some((b) => !b.closed);
    S.patchMessage(convId, asstId, {
      reasoning: reasoning || undefined, thinkMs: thinkEnd ? Math.max(1, thinkEnd - thinkT0) : undefined,
      text, artboardIds: [...new Set([...idMap.values()])], tools: [...tools],
      truncated: hasUnclosed || undefined,
      stats: final ? { ms, tokens: Math.round(full.length / 4), tps: Math.round(full.length / 4 / (ms / 1000)) } : undefined,
    });
  };

  const finish = (err?: string) => {
    if (mode === "chat" && GREETING_RE.test(opts.text.trim())) {
      if (full.includes("\n\n")) full = full.split(/\n\s*\n/)[0].trim();
      if (/RECEIPT:|TIMESTAMP ACCEPTED|†\s*Footnote|<artboard|<!doctype/i.test(full) || full.length > 220) {
        full = "Hello! What would you like to build, debug, or design?";
      }
    }
    sync(true);
    for (const f of extractRemember(full).found) void saveMemory(f.text, f.category);
    const S = useStore.getState();
    for (const id of idMap.values()) S.updateArtboard(id, { loading: false });
    S.patchMessage(convId, asstId, { streaming: false, ...(err ? { error: err } : {}) });
    S.setBusy(false);
    if (created.length) setTimeout(() => canvasApi.fit(created), 80);
    controller = null; nativeCancel = null;
    void nativePerf.trim();
  };

  const designTokensAnswer = (args?: string) => {
    let sysId = useStore.getState().settings.designSystemId;
    try { const a = JSON.parse(args ?? "{}"); const v = String(a.system ?? a.body ?? a.path ?? ""); if (v) sysId = v; } catch { /* keep active */ }
    const d = getDS(sysId.replace("m3-expressive", "m3e").replace("apple-hig", "hig").replace("fluent2", "fluent"));
    return `${d.name}\n${tokensCss(d)}`;
  };

  const selfCheck = async () => {
    if (!useStore.getState().settings.selfCheck || signal.aborted) return;
    for (const id of [...new Set(idMap.values())].slice(0, 4)) {
      if (signal.aborted) return;
      const a = useStore.getState().artboards.find((x) => x.id === id);
      if (!a || a.html.length < 300 || a.html.includes("Empty frame")) continue;
      const chip: ToolCall = { id: uid(), name: "design_audit", args: a.name, status: "running" };
      tools.push(chip); sync();
      try {
        let issues = await auditHtml(a.html, a.w, a.h);
        const patched = patchFor(a.html, issues);
        if (patched !== a.html) useStore.getState().updateArtboard(id, { html: patched });
        const log = issues.map((i) => i.msg);
        const severe = issues.filter((i) => i.severe);
        if (severe.length && canCallModel() && !signal.aborted) {
          chip.name = "design_repair"; sync();
          try {
            const cur = useStore.getState().artboards.find((x) => x.id === id)!;
            const bare = cur.html.replace(/<style data-zeus-kit>[\s\S]*?<\/style>/, "").replace(/<script data-zeus-kit-js>[\s\S]*?<\/script>/, "");
            const raw = await Promise.race([oneShot(
              "You repair layout defects in one HTML screen. Fix ONLY the listed defects with the smallest possible edits. Keep content, structure, classes and CSS variables. Do not add shadows, emoji, gradients or external resources. Reply with the complete fixed document inside <artboard name=\"fix\" mode=\"revise\">...</artboard> and nothing else.",
              `Screen ${a.w}x${a.h}px. Defects:\n${severe.map((i) => `- ${i.msg}`).join("\n")}\n\n<artboard name="${a.name}" mode="revise">\n${bare.slice(0, 30000)}\n</artboard>`,
              { effort: "low", timeoutMs: 90000 },
            ), new Promise<string>((_, rej) => signal.addEventListener("abort", () => rej(new Error("stopped"))))]);
            const b = parseStream(raw).blocks[0];
            if (b && b.html.length > Math.max(600, bare.length * 0.75) && !signal.aborted) {
              const fixed = harden(b.html, getDS(useStore.getState().settings.designSystemId), { intent: opts.text, name: a.name, device: a.device }).html;
              const again = await auditHtml(fixed, a.w, a.h);
              const notSparse = !again.some((i) => i.kind === "sparse" || i.kind === "gap");
              if (notSparse && again.filter((i) => i.severe).length < severe.length) {
                useStore.getState().updateArtboard(id, { html: patchFor(fixed, again) });
                log.push(`repaired: ${severe.length} defect${severe.length > 1 ? "s" : ""} fixed, ${again.filter((i) => i.severe).length} left`);
                issues = again;
              } else log.push("repair did not improve the screen, kept the original");
            }
          } catch (e) { log.push(`repair skipped: ${(e as Error).message}`); }
        }
        chip.status = "ok"; chip.output = log.length ? log.join("\n") : "No layout issues";
      } catch (e) { chip.status = "error"; chip.output = (e as Error).message; }
      sync();
    }
  };

  const nativeOn = isNative && useStore.getState().ui.nativeReady;
  const isGreeting = mode === "chat" && GREETING_RE.test(opts.text.trim());
  const toolsText = nativeOn && !isGreeting ? await toolsPrompt({ design: mode === "design" }).catch(() => "") : "";
  const system = mode === "design"
    ? buildSystemPrompt({ intent: opts.text, device: target?.device, tools: toolsText })
    : [agentPrompt(mode, opts.text), toolsText].filter(Boolean).join("\n\n");
  const activeProjRoot = st.projects.find((p) => p.id === st.activeProjectId)?.root;
  const effectiveWorkspaceRoot = st.ui.workspace?.root || activeProjRoot;
  const req: ChatRequest = {
    requestId: uid(), provider: custom ? "custom" : settings.providerId, model: custom ? custom.model : settings.modelId, effort: settings.effort,
    system, messages: history, workspaceRoot: effectiveWorkspaceRoot,
    custom: custom ? { baseUrl: custom.baseUrl, apiKey: custom.apiKey, format: custom.format } : undefined,
  };
  const device: Device = target?.device ?? "mobile";
  let raf = 0;
  const onDelta = (t: string) => {
    full += t;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); });
  };

  try {
    if (nativeOn) {
      let current = req;
      let msgs: ChatRequest["messages"] = history;
      let nudged = false;
      const codingProfile = getCodingHarnessProfile(settings.providerId, settings.modelId);
      for (let round = 0; ; round++) {
        const roundTools: ToolCall[] = [];
        const studioRuns = new Map<string, Promise<void>>();
        let roundText = "";
        let heldBuffer = "";
        await new Promise<void>((resolve, reject) => {
          const onEvent = (e: ChatEvent) => {
            if (e.type === "delta") {
              const outsideThink = (s: string) =>
                s
                  .replace(/<think>[\s\S]*?(<\/think>|$)/gi, (m) => " ".repeat(m.length))
                  .replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, (m) => " ".repeat(m.length));
              // Block only hallucinated <tool_result> / <tool_response> tags so multi-tool turns can stream completely
              const findFakeResult = (s: string): number => {
                const clean = outsideThink(s);
                for (const tag of ["<tool_result", "<tool_response"]) {
                  const i = clean.indexOf(tag);
                  if (i >= 0) return i;
                }
                return -1;
              };
              if (findFakeResult(roundText) >= 0) return;
              const before = roundText.length;
              roundText += e.text;
              const fakeAt = findFakeResult(roundText);
              const piece = fakeAt >= 0 ? roundText.slice(before, fakeAt) : e.text;
              if (fakeAt >= 0) roundText = roundText.slice(0, fakeAt);
              if (!piece) return;
              // Gate potential web-scraper refusal prefixes so they never flash in the chat UI
              if (isCanvasFollowUp && !roundText.includes("<artboard") && roundText.length < 320 && (looksLikeRefusalStart(roundText) || isCanvasRefusal(roundText))) {
                heldBuffer += piece;
                return;
              }
              if (heldBuffer) {
                const flush = heldBuffer + piece;
                heldBuffer = "";
                onDelta(flush);
              } else {
                onDelta(piece);
              }
            }
            else if (e.type === "reasoning") { extraThink += e.text; if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }
            else if (e.type === "tool_call") { const t: ToolCall = { id: e.id, name: e.name, args: typeof e.args === "string" ? e.args : JSON.stringify(e.args), status: "running" }; tools.push(t); roundTools.push(t);
              if (isStudioTool(e.name)) studioRuns.set(e.id, runStudioTool(e.name, t.args).then((r) => { t.status = r.ok ? "ok" : "error"; t.output = r.output; sync(); }));
              sync(); }
            else if (e.type === "tool_result") {
              if (studioRuns.has(e.id)) return; // built-in Zeus Studio tools are answered locally
              const t = roundTools.find((x) => x.id === e.id) ?? [...tools].reverse().find((x) => x.id === e.id);
              if (t) {
                let parsedPath = "";
                let parsedBody = "";
                try {
                  const j = JSON.parse(t.args ?? "{}");
                  parsedPath = j.path ?? "";
                  parsedBody = j.body ?? "";
                } catch {
                  parsedBody = t.args ?? "";
                }
                const rawOut = /design-tokens|get_design_tokens/.test(t.name) ? designTokensAnswer(t.args) : e.output;
                const hooked = runPostToolUseHook(
                  { name: t.name, path: parsedPath, body: parsedBody },
                  { ok: e.ok, output: rawOut },
                  mode === "code" ? codingProfile.maxToolOutputChars : 8000
                );
                t.status = hooked.ok ? "ok" : "error";
                t.output = hooked.output;
                if (t.name.startsWith("memory")) {
                  import("./bridge").then(({ nativeMemory }) =>
                    nativeMemory.list().then((l) => l && useStore.getState().patchSettings({ memory: [...l].reverse() }))
                  ).catch(() => {});
                } else if (/^(write_file|write|create_file|delete_file|remove_file|rm|del|unlink|edit_file|edit|patch_file|shell|bash|python|python3)$/.test(t.name)) {
                  const curWs = useStore.getState().ui.workspace;
                  if (curWs) {
                    import("./bridge").then(({ refreshTree }) =>
                      refreshTree(curWs).then((tree) => useStore.getState().patchUI({ workspace: { ...curWs, tree } }))
                    ).catch(() => {});
                  }
                }
              }
              sync();
            }
            else if (e.type === "error") reject(new Error(e.message));
            else if (e.type === "done") resolve();
          };
          signal.addEventListener("abort", () => resolve());
          nativeChat(current, onEvent).then((c) => { nativeCancel = c; }).catch(reject);
        }).finally(() => {
          if (!signal.aborted) {
            try { nativeCancel?.(); } catch { /* ignore */ }
            nativeCancel = null;
          }
        });
        await Promise.all(studioRuns.values());
        for (const t of roundTools) if (t.status === "running") t.status = "error";
        if (signal.aborted || round >= (mode === "code" ? codingProfile.maxToolRounds : mode === "chat" ? 8 : 4)) break;
        if (!roundTools.length) {
          const parsedNow = parseStream(extractRemember(full).clean);
          const produced = parsedNow.blocks.length > 0;
          const unclosedBlock = parsedNow.blocks.find((b) => !b.closed && b.html.length > 100);

          // 1. Auto-continuation if an <artboard> truncated mid-stream before </artboard>
          if (unclosedBlock && round < 3 && (mode === "design" || unclosedBlock.html.length > 100)) {
            tools.push({
              id: uid(),
              name: "auto_continue",
              args: unclosedBlock.attrs.name || "screen",
              status: "ok",
              output: "Continued truncated artboard HTML stream to completion",
            });
            msgs = [
              ...msgs,
              { role: "assistant", content: roundText },
              { role: "user", content: buildContinuationPrompt(unclosedBlock.attrs.name || "Screen", unclosedBlock.html) },
            ];
            current = { ...req, requestId: uid(), messages: msgs };
            continue;
          }

          // 2. Refusal recovery or missing <artboard> nudge on design/canvas follow-up turns
          const refused = isCanvasRefusal(roundText) || looksLikeRefusalStart(roundText);
          if (refused && full.endsWith(roundText)) {
            full = full.slice(0, full.length - roundText.length);
          }
          // If pre-stream theme sync already updated all canvas sheets and the scraper model only emitted a refusal, finish cleanly immediately
          if (refused && preSyncedIds.size > 0) {
            break;
          }
          if (mode === "design" && (!produced || refused) && !nudged && (DESIGN_INTENT.test(opts.text) || isCanvasFollowUp || refused)) {
            nudged = true;
            if (full.endsWith(roundText)) full = full.slice(0, full.length - roundText.length);
            const targetHint = boards.length > 0 && isCanvasFollowUp
              ? `Revise the existing canvas screens (${boards.map((b) => `id="${b.id}" name="${b.name}"`).join(", ")}) using <artboard id="<id>" name="<name>" device="<device>" mode="revise"><!doctype html>...</html></artboard>.`
              : 'Output complete <artboard name="..." device="mobile|tablet|web" mode="new"><!doctype html>...</html></artboard> documents.';
            msgs = [
              ...msgs,
              { role: "assistant", content: refused ? "Understood, I will update the canvas screens directly." : roundText },
              { role: "user", content: `Your reply had no <artboard> block, so nothing reached the canvas. ${targetHint} Reply with one short sentence followed immediately by the <artboard> blocks.` },
            ];
            current = { ...req, requestId: uid(), messages: msgs };
            continue;
          }
          // 3. Harness² Code Action, Post-Inspection Mutation & Reasoning-Cutoff Nudge
          // Ensures models never stop mid-task after only reading/listing files or cutting off right after </think>
          const cleanVisibleRound = roundText
            .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
            .replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, "")
            .trim();
          const hasFileOrMemMutation = tools.some((t) => /^(write_file|write|create_file|edit_file|edit|patch_file|python|python3|memory_save|memory_edit|memory_delete)$/.test(t.name));
          const asksForMutation = /\b(write|create|edit|fix|update|add|remove|delete|refactor|implement|patch|save|record|deduplicate|filter)\b/i.test(opts.text);
          const stoppedAfterReadOnly = asksForMutation && !hasFileOrMemMutation && tools.length > 0;
          const cutOffAfterThink = !cleanVisibleRound && (roundText.includes("<think") || extraThink.trim().length > 0);
          const dumpedCodeWithoutWrite = !hasFileOrMemMutation && (/```(?:js|javascript|ts|typescript|py|python|rust|go|cpp|c|html|css|json|md|bash|sh)\b/i.test(roundText) || /\bwith\s+open\s*\(/.test(cleanVisibleRound));
          const statedPlanOnly =
            cutOffAfterThink ||
            stoppedAfterReadOnly ||
            dumpedCodeWithoutWrite ||
            /\b(let'?s\s+(call|list|check|run|read|inspect|pull|fetch|search|look|verify|see|test|create|write|edit|delete|save|continue)|we\s+need\s+to\s+(continue|call|pull|list|check|run|read|inspect|update|fix|delete|save)|i\s+(will|need\s+to|should)\s+(call|list|check|run|read|inspect|pull|fetch|search|verify|test))\b/i.test(
              `${roundText} ${extraThink}`
            );
          if (
            (mode === "code" || Boolean(st.ui.workspace)) &&
            !produced &&
            !nudged &&
            (round === 0 || statedPlanOnly) &&
            (statedPlanOnly ||
              /\b(write|create|edit|fix|update|add|remove|refactor|implement|run|test|debug|build|script|file|md|pull|push|fetch|clone|git|github|status|diff|check|inspect|list|read|search|find|grep)\b/i.test(
                opts.text
              ))
          ) {
            nudged = true;
            if (roundText && full.endsWith(roundText)) {
              full = full.slice(0, full.length - roundText.length);
            }
            msgs = [
              ...msgs,
              {
                role: "assistant",
                content: "Understood. I will emit the `<zeus_tool>` XML block now to execute the workspace action directly.",
              },
              {
                role: "user",
                content: `Your reply stopped after planning without emitting a \`<zeus_tool>\` block, so no command or file operation ran. Output ONLY \`<zeus_tool name="shell">...</zeus_tool>\`, \`<zeus_tool name="python">...</zeus_tool>\`, \`<zeus_tool name="read_file" path="..."></zeus_tool>\`, \`<zeus_tool name="edit_file" path="...">...</zeus_tool>\`, or \`<zeus_tool name="write_file" path="...">...</zeus_tool>\` now.`,
              },
            ];
            current = { ...req, requestId: uid(), messages: msgs };
            continue;
          }
          break;
        }
        const strippedRound = roundText
          .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
          .replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, "")
          .trim();
        const canonicalTools = roundTools
          .map((t) => {
            let p = "";
            let b = "";
            try {
              const parsed = JSON.parse(t.args ?? "{}");
              p = parsed.path ?? "";
              b = parsed.body ?? "";
            } catch {
              b = t.args ?? "";
            }
            return `<zeus_tool name="${t.name}"${p ? ` path="${p}"` : ""}>${b}</zeus_tool>`;
          })
          .join("\n");
        const said =
          strippedRound.includes("</zeus_tool>") || strippedRound.includes("</tool_call>")
            ? strippedRound
            : [strippedRound, canonicalTools].filter(Boolean).join("\n");
        msgs = [
          ...msgs,
          { role: "assistant", content: said },
          { role: "user", content: `Tool results:\n${roundTools.map((t) => `<tool_result name="${t.name}" ok="${t.status === "ok"}">\n${(t.output ?? "").slice(0, mode === "code" ? codingProfile.maxToolOutputChars : 6000)}\n</tool_result>`).join("\n")}\nIf every part of the user's request is now complete and verified, do NOT call any more tools and reply with 1-2 concise sentences. Otherwise, emit the next <zeus_tool> block needed to finish the remaining steps (never repeat a call you already made).` },
        ];
        current = { ...req, requestId: uid(), messages: msgs };
        full += "\n\n";
      }
      if (mode === "code") {
        recordTrajectoryReflection({
          projectRoot: st.ui.workspace?.root,
          providerId: settings.providerId,
          modelId: settings.modelId,
          tools,
          nudged,
        });
      }
    } else if (custom) {
      await streamCustom(req, onDelta, (r) => { extraThink += r; if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }, signal);
    } else if (["kilo", "opencodezen", "nimcloud", "colibriqwen", "freellmhub", "aibridge", "hfrouter", "litellmhub", "gemweb2api", "vireonix", "gemma4vl", "phi4cloud", "llamacppcloud", "ollamacloud", "gemma4pro", "frontierlab", "liquidai", "bonsaicloud", "unslothcloud", "koboldcloud", "blockrun", "ovhcloud", "freecc", "vlmrun", "together2api", "hfcluster", "aihorde", "apisfreellm", "llm7", "pollinations"].includes(settings.providerId)) {
      const browserBase: Record<string, { baseUrl: string; apiKey: string; format?: "openai" | "anthropic" }> = {
        kilo: { baseUrl: "https://api.kilo.ai/api/gateway", apiKey: "" },
        nimcloud: { baseUrl: "https://garystu-openai-nim-proxy.hf.space/v1", apiKey: "free" },
        colibriqwen: { baseUrl: "https://kartik1302-qwen-3-6-35b-a3b.hf.space/v1", apiKey: "free" },
        freellmhub: { baseUrl: "https://bun008-freellmapi.hf.space/v1", apiKey: "" },
        aibridge: { baseUrl: "https://w902287-ai-bridge.hf.space/v1", apiKey: "" },
        opencodezen: { baseUrl: "https://opencode.ai/zen/v1", apiKey: "public" },
        hfrouter: { baseUrl: "https://cgjgj-ollamahftraemonitor.hf.space/v1", apiKey: "" },
        litellmhub: { baseUrl: "https://alchoholpad-litellm.hf.space/v1", apiKey: "" },
        gemweb2api: { baseUrl: "https://chenian233-gemini-web2api.hf.space/v1", apiKey: "" },
        vireonix: { baseUrl: "https://vireonix.ai/v1", apiKey: "" },
        gemma4vl: {
          baseUrl: settings.modelId === "gemma-4-e2b-q6k-aggressive"
            ? "https://titoo3-gemma-4-e4b-uncensored-hauhaucs-aggressive-q5-k-p.hf.space/v1"
            : settings.modelId === "gemma-4-e2b-qat-q4"
            ? "https://hispa-nico-gemma4-e2b-qat.hf.space/v1"
            : settings.modelId === "gemma-4-e2b-qat-mobile"
            ? "https://elseodelasgalletas-gemma4-e2b-qat-mobile.hf.space/v1"
            : settings.modelId === "gemma-4-e2b-it-fast"
            ? "https://gefdsv-gemma-4-e2b-it.hf.space/v1"
            : "https://will-resolute-gemma4-vision-ui.hf.space/v1",
          apiKey: "",
        },
        phi4cloud: {
          baseUrl: "https://deleriousson-llama-cpp.hf.space/v1",
          apiKey: "",
        },
        llamacppcloud: {
          baseUrl: settings.modelId === "lfm2.5-230m-instant"
            ? "https://apathy-exe-lfm2-5-230m.hf.space/v1"
            : settings.modelId === "smolvlm-500m-instruct"
            ? "https://will-resolute-gemma4-vision-ui.hf.space/v1"
            : "https://ramedde-gemma4cpu.hf.space/v1",
          apiKey: "",
        },
        ollamacloud: {
          baseUrl: settings.modelId === "gemma:7b-instruct"
            ? "https://qweret6565-ollama-server.hf.space/v1"
            : settings.modelId === "moondream:latest"
            ? "https://will-resolute-gemma4-vision-ui.hf.space/v1"
            : "https://amarbruhman-ollama-server.hf.space/v1",
          apiKey: "",
        },
        gemma4pro: {
          baseUrl: settings.modelId === "gemma-4-e4b-qat"
            ? "https://hispa-nico-gemma4-e2b.hf.space/v1"
            : "https://mikeee-gemma-4-e4b-uncensored-hauhaucs-aggressive-q5-k-p.hf.space/v1",
          apiKey: "",
        },
        frontierlab: {
          baseUrl: settings.modelId === "inkling-2-mini"
            ? "https://bananamort-inkling-2-mini.hf.space/v1"
            : settings.modelId === "nanbeige4.3-33b"
            ? "https://apathy-exe-nanbeige4-3-33b.hf.space/v1"
            : settings.modelId === "muse-glimmer-30b"
            ? "https://apathy-exe-muse-glimmer-30b.hf.space/v1"
            : settings.modelId === "xing4.0-29b-a4b"
            ? "https://apathy-exe-xing4-0-29b-a4b.hf.space/v1"
            : settings.modelId === "mellum2-12b-thinking"
            ? "https://usermma-mellum2-12b-a2-5b-thinking-abliterated.hf.space/v1"
            : settings.modelId === "nanbeige4.2-3b"
            ? "https://apathy-exe-nanbeige4-2-3b.hf.space/v1"
            : settings.modelId === "minicpm5-1b"
            ? "https://usermma-minicpm5-abliterated-q3.hf.space/v1"
            : "https://apathy-exe-qwen3-8-flash-next.hf.space/v1",
          apiKey: "",
        },
        liquidai: {
          baseUrl: settings.modelId === "lfm2.5-8b-a1b"
            ? "https://usermma-lfm2-5-8b-a1b-abliterated-q3.hf.space/v1"
            : settings.modelId === "lfm3-1.7b"
            ? "https://apathy-exe-lfm3-1-7b.hf.space/v1"
            : settings.modelId === "lfm2.5-2.6b"
            ? "https://apathy-exe-lfm2-5-2-6b.hf.space/v1"
            : "https://apathy-exe-lfm2-5-24b-a2b.hf.space/v1",
          apiKey: "",
        },
        bonsaicloud: {
          baseUrl: settings.modelId === "bonsai-8b"
            ? "https://mikeee-bonsai-8b.hf.space/v1"
            : settings.modelId === "vibethinker-3b-q4"
            ? "https://mikeee-llama-cpp-server.hf.space/v1"
            : "https://bananamort-ternary-bonsai-2-27b.hf.space/v1",
          apiKey: "",
        },
        unslothcloud: {
          baseUrl: settings.modelId === "gemma-4-e2b-ud-q4"
            ? "https://elseodelasgalletas-gemma4-e2b.hf.space/v1"
            : settings.modelId === "gemma-4-e2b-qat-ud"
            ? "https://elseodelasgalletas-gemma4-e2b-qat.hf.space/v1"
            : settings.modelId === "gemma-4-e2b-q4ks"
            ? "https://bleak-openai-compatible-server-gemma4.hf.space/v1"
            : "https://bleak-openai-compatible-server.hf.space/v1",
          apiKey: "",
        },
        koboldcloud: {
          baseUrl: settings.modelId === "koboldcpp/gemma-2-9b-it-Q5_K_M"
            ? "https://nanoph-koboldcpp-tiefighter.hf.space/v1"
            : settings.modelId === "koboldcpp/gemma-3n-E2B-it"
            ? "https://nxdev-org-koboldcpp-tiefighter.hf.space/v1"
            : "https://koboldai-koboldcpp-tiefighter.hf.space/v1",
          apiKey: "",
        },
        blockrun: { baseUrl: "https://blockrun.ai/api/v1", apiKey: "" },
        ovhcloud: { baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", apiKey: "" },
        freecc: {
          baseUrl: settings.modelId.includes("kimi-k3.1-pro")
            ? "https://dherain24-claude-proxy.hf.space"
            : "https://calkotter-free-claude-code.hf.space",
          apiKey: "free",
          format: "anthropic",
        },
        vlmrun: { baseUrl: "https://gateway.vlm.run/v1/openai", apiKey: "" },
        together2api: { baseUrl: "https://lolmaobruhhh-test.hf.space/v1", apiKey: "" },
        hfcluster: {
          baseUrl: settings.modelId === "gemma-4-e2b-q8"
            ? "https://rabu1234-gemma-4-e2b-it-gguf.hf.space/v1"
            : settings.modelId === "gemma-4-e4b-q5"
            ? "https://amirkazim-qwen-7b-chat.hf.space/v1"
            : "https://apathy-exe-qwen3-8-27b.hf.space/v1",
          apiKey: "",
        },
        aihorde: { baseUrl: "https://oai.aihorde.net/v1", apiKey: "0000000000" },
        apisfreellm: { baseUrl: "https://api.apisfreellm.com/v1", apiKey: "free" },
        llm7: { baseUrl: "https://api.llm7.io/v1", apiKey: "unused" },
        pollinations: { baseUrl: "https://text.pollinations.ai/openai", apiKey: "" },
      };
      const cfg = browserBase[settings.providerId] ?? browserBase.kilo;
      const browserModel =
        settings.providerId === "hfcluster"
          ? settings.modelId === "gemma-4-e2b-q8"
            ? "gemma-4-e2b-it-Q8_0.gguf"
            : settings.modelId === "gemma-4-e4b-q5"
            ? "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q5_K_P.gguf"
            : "/root/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-GGUF/snapshots/4af51b3542f775b0a8e4b310bfb3f17e01c306c9/Qwen3.8-27B-UD-Q8_K_XL.gguf"
          : settings.providerId === "gemma4vl"
          ? settings.modelId === "gemma-4-e2b-q6k-aggressive"
            ? "/app/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q6_K_P.gguf"
            : settings.modelId === "gemma-4-e2b-qat-q4"
            ? "huihui-ai/Huihui-gemma-4-E2B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0"
            : settings.modelId === "gemma-4-e2b-qat-mobile"
            ? "unsloth/gemma-4-E2B-it-qat-mobile-GGUF:UD-Q2_K_XL"
            : settings.modelId === "gemma-4-e2b-it-fast"
            ? "model.gguf"
            : "/models/gemma-4-E4B-it-Q4_K_M.gguf"
          : settings.providerId === "phi4cloud"
          ? "model.gguf"
          : settings.providerId === "llamacppcloud"
          ? settings.modelId === "lfm2.5-230m-instant"
            ? "/model.gguf"
            : settings.modelId === "smolvlm-500m-instruct"
            ? "/models/gemma-4-E4B-it-Q4_K_M.gguf"
            : "ngquocvinh/LFM3-1.7B-GGUF"
          : settings.providerId === "gemma4pro"
          ? settings.modelId === "gemma-4-e4b-qat"
            ? "huihui-ai/Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0"
            : "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q5_K_P.gguf"
          : settings.providerId === "frontierlab"
          ? settings.modelId === "inkling-2-mini"
            ? "/root/.cache/huggingface/hub/models--unsloth--Inkling-2-Mini-GGUF/snapshots/45fd08764f2b0bf16b03a5483a80e5c7aaec8772/Inkling-2-Mini-UD-Q4_K_XL.gguf"
            : settings.modelId === "nanbeige4.3-33b"
            ? "/root/.cache/huggingface/hub/models--bartowski--Nanbeige_Nanbeige4.3-33B-GGUF/snapshots/9beb68421fdf7be095093a6888325fa2c83ddd38/Nanbeige_Nanbeige4.3-33B-Q4_K_M.gguf"
            : settings.modelId === "muse-glimmer-30b"
            ? "/root/.cache/huggingface/hub/models--meta-models--Muse-Glimmer-30B-GGUF/snapshots/b44f1072cf75e918a1b82a3a17b45c4389b076e7/Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf"
            : settings.modelId === "xing4.0-29b-a4b"
            ? "/root/.cache/huggingface/hub/models--XingChen-AGI--Xing4.0-29B-A4B-GGUF/snapshots/006904bc1d05ae2c37f938a4abdffee27e488544/xing4_0-29b-IQ4_NL.gguf"
            : settings.modelId === "mellum2-12b-thinking"
            ? "Mellum2-12B-A2.5B-Thinking-Abliterated-Q6_K.gguf"
            : settings.modelId === "nanbeige4.2-3b"
            ? "/app/nanbeige4.2-3b-Q4_K_M.gguf"
            : settings.modelId === "minicpm5-1b"
            ? "Huihui-MiniCPM5-1B-abliterated.Q3_K_L.gguf"
            : "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf"
          : settings.providerId === "liquidai"
          ? settings.modelId === "lfm2.5-8b-a1b"
            ? "Huihui-LFM2.5-8B-A1B-abliterated.Q4_K_M.gguf"
            : settings.modelId === "lfm3-1.7b"
            ? "/root/.cache/huggingface/hub/models--LiquidAI--LFM3-1.7B-GGUF/snapshots/cd0c74c575b5c416f3011b5b4c298077f26ca8c2/LFM3-1.7B-QAD-Q4_0.gguf"
            : settings.modelId === "lfm2.5-2.6b"
            ? "/LFM2.5-2.6B-Q4_K_M.gguf"
            : "/root/.cache/huggingface/hub/models--unsloth--LFM2.5-24B-A2B-GGUF/snapshots/aacc77834f6aa568c93b4dbd6d295059736be98c/LFM2.5-24B-A2B-Q8_0.gguf"
          : settings.providerId === "bonsaicloud"
          ? settings.modelId === "bonsai-8b"
            ? "bonsai-8b"
            : settings.modelId === "vibethinker-3b-q4"
            ? "vibethinker-3b-q4"
            : "/root/.cache/huggingface/hub/models--prism-ml--Ternary-Bonsai-2-27B-gguf/snapshots/839bd57023c1558945afea70a74fa83c054f35f9/Ternary-Bonsai-2-27B-PTQ1_0.gguf"
          : settings.providerId === "unslothcloud"
          ? settings.modelId === "gemma-4-e2b-ud-q4"
            ? "unsloth/gemma-4-E2B-it-GGUF:UD-Q4_K_XL"
            : settings.modelId === "gemma-4-e2b-qat-ud"
            ? "unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL"
            : settings.modelId === "gemma-4-e2b-q4ks"
            ? "unsloth/gemma-4-E2B-it-GGUF:Q4_K_S"
            : "unsloth/Qwen3.5-4B-GGUF:Q6_K"
          : req.model;
      const browserCustom = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, format: cfg.format ?? ("openai" as const) };
      try {
        await streamCustom({ ...req, model: browserModel, custom: browserCustom }, onDelta, (r) => { extraThink += r; if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }, signal);
      } catch {
        await demoRun({ prompt: opts.text, device, target, onDelta, signal, asVariant: opts.asVariant });
      }
    } else {
      if (prov && prov.id !== "demo") onDelta(`> Native engine not detected — **${prov.name}** runs inside the desktop app. Using the built-in demo designer here.\n\n`);
      await demoRun({ prompt: opts.text, device, target, onDelta, signal, asVariant: opts.asVariant });
    }
    if (raf) cancelAnimationFrame(raf);
    // Guaranteed Multi-Sheet Theme Sync: if the user asked to change the theme/palette across the canvas
    // (or if a model only updated a subset of screens on a global theme request), synchronize all target boards in place.
    if (themeOverride && boards.length > 0 && !opts.asVariant) {
      const S = useStore.getState();
      const targetBoards = target ? [target] : boards;
      const updatedIds = new Set(idMap.values());
      let syncedCount = 0;
      targetBoards.forEach((b, idx) => {
        if (!updatedIds.has(b.id)) {
          const cur = S.artboards.find((x) => x.id === b.id);
          if (cur) {
            const themed = applyThemeOverrideToHtml(cur.html, themeOverride);
            S.reviseArtboard(b.id, themed);
            idMap.set(100 + idx, b.id);
            syncedCount++;
          }
        }
      });
      if (syncedCount > 0) {
        tools.push({
          id: uid(),
          name: "studio_retheme_page",
          args: `${themeOverride.name} · ${targetBoards.length} screen${targetBoards.length > 1 ? "s" : ""}`,
          status: "ok",
          output: `Applied ${themeOverride.name} token overrides across ${targetBoards.length} canvas screen(s) while preserving layout structure.`,
        });
      }
      const parsedEnd = parseStream(extractRemember(full).clean);
      if (!parsedEnd.text.trim() || isCanvasRefusal(parsedEnd.text)) {
        const blocksOnly = full.slice(Math.max(0, full.indexOf("<artboard")));
        full = `Applied the **${themeOverride.name}** theme across ${targetBoards.length === 1 ? `**${targetBoards[0].name}**` : `all **${targetBoards.length} screens** on the canvas`} while preserving their layouts.\n\n${blocksOnly.startsWith("<artboard") ? blocksOnly : ""}`;
      }
    }
    sync(true);
    useStore.getState().patchMessage(convId, asstId, { streaming: false });
    await selfCheck();
    finish();
  } catch (e) {
    if (raf) cancelAnimationFrame(raf);
    finish(signal.aborted ? undefined : (e as Error).message || "Request failed");
  }
}
