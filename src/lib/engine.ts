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
import { auditHtml, patchFor } from "./audit";
import { canCallModel, oneShot } from "./oneshot";
import { tokensCss } from "./designSystems";
import { isStudioTool, runStudioTool, studioBrief } from "./studio";

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */
export function buildSystemPrompt(opts: { intent?: string; device?: Device; tools?: string } = {}): string {
  const s = useStore.getState();
  const ds = getDS(s.settings.designSystemId);
  const skills = SKILLS.filter((k) => s.settings.skills.includes(k.id));
  const boards = s.artboards.filter((a) => a.pageId === s.activePageId);
  const ws = s.ui.workspace;
  return [
    harnessPrompt(ds, opts.intent, opts.device),
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

export function parseStream(full: string): { text: string; blocks: Block[] } {
  full = normalizeStream(full.replace(/<think>[\s\S]*?(<\/think>|$)/g, ""));
  full = full.replace(/<zeus_tool[\s\S]*?(<\/zeus_tool>|$)/g, ""); // agent tool calls render as chips, not text
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
    if (e < 0) { blocks.push({ attrs, html: clean(full.slice(gt + 1)), closed: false }); break; }
    blocks.push({ attrs, html: clean(full.slice(gt + 1, e)), closed: true });
    i = e + 11;
  }
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), blocks };
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
async function streamCustom(req: ChatRequest, onDelta: (t: string) => void, signal: AbortSignal) {
  const c = req.custom!;
  const base = c.baseUrl.replace(/\/+$/, "");
  const sse = async (res: Response, pick: (j: any) => string) => {
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
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try { const t = pick(JSON.parse(d)); if (t) onDelta(t); } catch { /* ignore partial */ }
      }
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
    await sse(res, (j) => (j.type === "content_block_delta" ? j.delta?.text ?? "" : ""));
  } else {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({ model: req.model, stream: true, messages: [{ role: "system", content: req.system }, ...msgs], ...(req.effort !== "medium" ? { reasoning_effort: req.effort === "max" ? "high" : req.effort } : {}) }),
    });
    await sse(res, (j) => j.choices?.[0]?.delta?.content ?? "");
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
  const convId = st.activeConvId;
  const conv = activeConv(st);
  const { settings } = st;
  const target = opts.quote?.artboardId ? st.artboards.find((a) => a.id === opts.quote!.artboardId) : undefined;

  const userMsg: Message = { id: uid(), role: "user", text: opts.text.trim(), quote: opts.quote, attachments: opts.attachments, at: Date.now() };
  const asstId = uid();
  const prov = settings.providerId.startsWith("custom:") ? null : findProvider(settings.providerId);
  const custom = settings.providerId.startsWith("custom:") ? settings.customProviders.find((c) => `custom:${c.id}` === settings.providerId) : undefined;
  const modelLabel = custom ? custom.model : prov?.models.find((m) => m.id === settings.modelId)?.label ?? settings.modelId;
  st.addMessage(convId, userMsg);
  st.addMessage(convId, { id: asstId, role: "assistant", text: "", streaming: true, model: modelLabel, at: Date.now(), tools: [], artboardIds: [] });
  st.setBusy(true);
  void learnFromText(opts.text).then((l) => { if (l.length) useStore.getState().notify(l.length === 1 ? "Saved to memory" : `Saved ${l.length} lines to memory`); });

  // instant title via ChatJimmy (micro-task engine)
  if (settings.autoTitle && !conv.titled && conv.messages.length === 0) {
    generateTitle(opts.text).then((t) => useStore.getState().setTitle(convId, t));
  }

  const boards = st.artboards.filter((a) => a.pageId === st.activePageId);
  const history = [...conv.messages, userMsg].filter((m) => !m.error).map((m) => {
    let content = m.text;
    if (m.quote) content = quoteToText(m.quote, boards) + "\n" + content;
    if (m.attachments) for (const a of m.attachments) if (a.text) content += `\n\n[Attached file: ${a.name}]\n${a.text.slice(0, 20000)}`;
    return { role: m.role, content, attachments: (m.attachments ?? []).filter((a) => a.dataUrl && a.mime.startsWith("image/")).map((a) => ({ name: a.name, mime: a.mime, dataUrl: a.dataUrl! })) };
  });
  if (target) {
    const last = history[history.length - 1];
    last.content += `\n\n<current_artboard id="${target.id}" name="${target.name}" device="${target.device}">\n${target.html.slice(0, 40000)}\n</current_artboard>\n${opts.asVariant ? 'Create this as a NEW variant (mode="new").' : 'Revise in place (mode="revise", same id).'}`;
  }

  controller = new AbortController();
  const signal = controller.signal;
  let full = "";
  const t0 = performance.now();
  const idMap = new Map<number, string>();
  const created: string[] = [];
  const lastPush = new Map<number, { t: number; len: number }>();
  const tools: ToolCall[] = [];
  const linted = new Set<number>();
  let extraThink = "";
  let thinkT0 = 0;
  let thinkEnd = 0;

  const sync = (final = false) => {
    const { text, blocks } = parseStream(extractRemember(full).clean);
    const S = useStore.getState();
    blocks.forEach((b, i) => {
      let id = idMap.get(i);
      if (!id) {
        const existing = b.attrs.mode === "revise" && b.attrs.id ? S.artboards.find((a) => a.id === b.attrs.id) : undefined;
        if (existing) {
          id = existing.id;
          S.updateArtboard(id, { loading: true });
        } else {
          const device = (["mobile", "tablet", "web"].includes(b.attrs.device) ? b.attrs.device : target?.device ?? "mobile") as Device;
          const ab = S.addArtboard({
            name: b.attrs.name || `Screen ${S.artboards.length + 1}`, device, html: "", loading: true,
            groupId: opts.asVariant && target ? target.groupId : undefined,
            w: DEVICE_SIZE[device].w, h: DEVICE_SIZE[device].h,
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
      const isRevise = b.attrs.mode === "revise" && !created.includes(id);
      const dsNow = getDS(S.settings.designSystemId);
      if (b.closed || final) {
        const out = harden(b.html, dsNow);
        if (isRevise) S.reviseArtboard(id, out.html); else S.updateArtboard(id, { html: out.html });
        S.updateArtboard(id, { loading: false });
        lastPush.set(i, { t: now, len: -1 });
        if (out.fixes.length && !linted.has(i)) {
          linted.add(i);
          tools.push({ id: uid(), name: "design_lint", args: b.attrs.name || "screen", status: "ok", output: out.fixes.join("\n") });
        }
      } else if (lp.len !== -1 && !isRevise && b.html.length > 400 && now - lp.t > 700 && b.html.length - lp.len > 300) {
        S.updateArtboard(id, { html: harden(b.html, dsNow, { partial: true }).html });
        lastPush.set(i, { t: now, len: b.html.length });
      }
    });
    const ms = performance.now() - t0;
    const thoughts = [...full.matchAll(/<think>([\s\S]*?)(<\/think>|$)/g)];
    const reasoning = [extraThink.trim(), ...thoughts.map((m) => m[1].trim())].filter(Boolean).join("\n\n");
    if (reasoning && !thinkT0) thinkT0 = performance.now();
    const thinkOpen = thoughts.length > 0 && thoughts[thoughts.length - 1][2] === "";
    if (reasoning && !thinkEnd && ((!thinkOpen && (text || blocks.length || tools.length)) || final)) thinkEnd = performance.now();
    S.patchMessage(convId, asstId, {
      reasoning: reasoning || undefined, thinkMs: thinkEnd ? Math.max(1, thinkEnd - thinkT0) : undefined,
      text, artboardIds: [...new Set([...idMap.values()])], tools: [...tools],
      stats: final ? { ms, tokens: Math.round(full.length / 4), tps: Math.round(full.length / 4 / (ms / 1000)) } : undefined,
    });
  };

  const finish = (err?: string) => {
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
            if (b && b.html.length > 300 && !signal.aborted) {
              const fixed = harden(b.html, getDS(useStore.getState().settings.designSystemId)).html;
              const again = await auditHtml(fixed, a.w, a.h);
              if (again.filter((i) => i.severe).length < severe.length) {
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
  const toolsText = nativeOn ? await toolsPrompt().catch(() => "") : "";
  const system = buildSystemPrompt({ intent: opts.text, device: target?.device, tools: toolsText });
  const req: ChatRequest = {
    requestId: uid(), provider: custom ? "custom" : settings.providerId, model: custom ? custom.model : settings.modelId, effort: settings.effort,
    system, messages: history, workspaceRoot: st.ui.workspace?.root,
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
      for (let round = 0; ; round++) {
        const roundTools: ToolCall[] = [];
        const studioRuns = new Map<string, Promise<void>>();
        let roundText = "";
        await new Promise<void>((resolve, reject) => {
          const onEvent = (e: ChatEvent) => {
            if (e.type === "delta") {
              if (roundText.includes("</zeus_tool>")) return; // a tool call ends the turn; anything after it would be invented
              const before = roundText.length;
              roundText += e.text;
              const ci = roundText.indexOf("</zeus_tool>");
              const piece = ci >= 0 ? roundText.slice(before, ci + 12) : e.text;
              if (ci >= 0) roundText = roundText.slice(0, ci + 12);
              if (piece) onDelta(piece);
            }
            else if (e.type === "reasoning") { extraThink += e.text; if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }
            else if (e.type === "tool_call") { const t: ToolCall = { id: e.id, name: e.name, args: typeof e.args === "string" ? e.args : JSON.stringify(e.args), status: "running" }; tools.push(t); roundTools.push(t);
              if (isStudioTool(e.name)) studioRuns.set(e.id, runStudioTool(e.name, t.args).then((r) => { t.status = r.ok ? "ok" : "error"; t.output = r.output; sync(); }));
              sync(); }
            else if (e.type === "tool_result") {
              if (studioRuns.has(e.id)) return; // built-in Zeus Studio tools are answered locally
              const t = tools.find((x) => x.id === e.id);
              if (t) { t.status = e.ok ? "ok" : "error"; t.output = /design-tokens|get_design_tokens/.test(t.name) ? designTokensAnswer(t.args) : e.output; }
              sync();
            }
            else if (e.type === "error") reject(new Error(e.message));
            else if (e.type === "done") resolve();
          };
          signal.addEventListener("abort", () => resolve());
          nativeChat(current, onEvent).then((c) => { nativeCancel = c; }).catch(reject);
        });
        await Promise.all(studioRuns.values());
        for (const t of roundTools) if (t.status === "running") t.status = "error";
        if (signal.aborted || round >= 4) break;
        if (!roundTools.length) {
          // Recovery: a design request that produced no artboard never reaches the canvas. Weak models do this often; ask once more, strictly.
          const produced = parseStream(extractRemember(full).clean).blocks.length > 0;
          if (produced || nudged || !DESIGN_INTENT.test(opts.text) || roundText.trim().length === 0 && round > 0) break;
          nudged = true;
          if (full.endsWith(roundText)) full = full.slice(0, full.length - roundText.length);
          msgs = [
            ...msgs,
            { role: "assistant", content: roundText },
            { role: "user", content: 'Your reply had no <artboard> block, so nothing reached the canvas. Reply again in the exact output protocol: one short sentence, then complete <artboard name="..." device="mobile|tablet|web" mode="new"> documents. No code fences, no explanation of how to build it.' },
          ];
          current = { ...req, requestId: uid(), messages: msgs };
          continue;
        }
        const closeAt = roundText.lastIndexOf("</zeus_tool>");
        const said = closeAt >= 0 ? roundText.slice(0, closeAt + 12) : roundText;
        msgs = [
          ...msgs,
          { role: "assistant", content: said },
          { role: "user", content: `Tool results:\n${roundTools.map((t) => `<tool_result name="${t.name}" ok="${t.status === "ok"}">\n${(t.output ?? "").slice(0, 6000)}\n</tool_result>`).join("\n")}\nContinue the task from these results. Do not repeat a call you already made.` },
        ];
        current = { ...req, requestId: uid(), messages: msgs };
        full += "\n\n";
      }
    } else if (custom) {
      await streamCustom(req, onDelta, signal);
    } else {
      if (prov && prov.id !== "demo") onDelta(`> Native engine not detected — **${prov.name}** runs inside the desktop app. Using the built-in demo designer here.\n\n`);
      await demoRun({ prompt: opts.text, device, target, onDelta, signal, asVariant: opts.asVariant });
    }
    if (raf) cancelAnimationFrame(raf);
    sync(true);
    useStore.getState().patchMessage(convId, asstId, { streaming: false });
    await selfCheck();
    finish();
  } catch (e) {
    if (raf) cancelAnimationFrame(raf);
    finish(signal.aborted ? undefined : (e as Error).message || "Request failed");
  }
}
