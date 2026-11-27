import { activeConv, uid, useStore } from "../store";
import type { Artboard, Attachment, Device, Message, Quote, ToolCall } from "../types";
import { DEVICE_SIZE } from "../types";
import { getDS, tokensCss } from "./designSystems";
import { SKILLS } from "./skills";
import {
  generateTitle,
  isNative,
  nativeChat,
  nativePerf,
  readWorkspaceFile,
  refreshTree,
  type ChatEvent,
  type ChatRequest,
} from "./bridge";
import { findProvider } from "./providers";
import { canvasApi } from "./canvasApi";
import { harden, harnessPrompt } from "./harness";
import { memoryBlock, extractRemember, addMemory as saveMemory, learnFromText } from "./memory";
import { toolsPrompt } from "./tools";
import { agentPrompt, buildPlainContext, classifyIntent, GREETING_RE } from "./agent";
import { getCodingHarnessProfile } from "./codingHarness";
import { recordTrajectoryReflection, runPostToolUseHook } from "./harness2";
import {
  BriefCheck,
  DiffUtils,
  HistoryPruner,
  ModelProfiles,
  parseAskUserFromToolCall,
  parsePlanFromToolCall,
  ProjectInstructions,
  ProjectSnapshot,
  StuckDetector,
  ToolAliases,
} from "./stormyAgent";
import { runOpenCode } from "./opencode";
import { auditHtml, patchFor } from "./audit";
import { canCallModel, oneShot } from "./oneshot";
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
import {
  extractLeakedPlan,
  normalizeStream,
  parseStream,
  synthesizeToolCompletionSummary,
} from "./streamParser";
import { demoRun } from "./demoEngine";
import { formatFingerprintMarkdown, verifyModelAuthenticity } from "./lmFingerprint";
import {
  BROWSER_FALLBACK_PROVIDER_IDS,
  resolveBrowserGatewayConfig,
  streamCustom,
} from "./browserProviders";

export { extractLeakedPlan, normalizeStream, parseStream };

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
    boards.length
      ? `## Current canvas page\n${boards.map((a) => `- id=${a.id} name="${a.name}" device=${a.device} v${a.version}`).join("\n")}`
      : "## Current canvas page\n(empty)",
    ws
      ? `## Workspace\nOpen project folder: ${ws.name}${ws.root ? ` (${ws.root})` : ""}. Top-level files: ${ws.tree
          .slice(0, 40)
          .map((n) => n.name + (n.dir ? "/" : ""))
          .join(", ")}. Match its stack and conventions when producing code.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */
const DESIGN_INTENT =
  /(design|screen|landing|dashboard|mockup|mock-up|wireframe|\bui\b|\bux\b|layout|onboarding|\bapp\b|\bpage\b|redesign|variant|login|checkout|profile|settings page|hero)/i;
let controller: AbortController | null = null;
let nativeCancel: (() => void) | null = null;

export function stopGeneration() {
  controller?.abort();
  nativeCancel?.();
}

const quoteToText = (q: Quote, boards: Artboard[]) => {
  const a = q.artboardId ? boards.find((b) => b.id === q.artboardId) : undefined;
  if (q.kind === "element") {
    return `[Context: the user selected the element <${q.label}> inside "${a?.source ?? a?.name ?? "screen"}"${a ? ` (id=${a.id})` : ""}. Its HTML: ${q.text ?? ""}. Apply the request to this element and its associated CSS rules, leave the rest of the document untouched.]`;
  }
  return `[Context: ${q.kind === "pin" ? "pinned comment on" : "selected"} screen "${a?.name ?? q.label}"${a ? ` (id=${a.id})` : ""}${q.text ? ` — "${q.text}"` : ""}]`;
};

/**
 * Synchronizes an `.html` / `.htm` file in the workspace directly with `s.artboards` and `ArtifactWorkbench`
 * whenever the agent creates or modifies it on disk via `write_file`, `edit_file`, `python`, or `shell`.
 */
async function syncHtmlFileToWorkbench(
  relPath: string,
  convId: string,
  asstId: string,
  syncedBoardIds: Set<string>
) {
  const cleanRel = relPath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!/\.html?$/i.test(cleanRel)) return;
  const st = useStore.getState();
  const ws = st.ui.workspace;
  if (!ws) return;
  try {
    const htmlContent = await readWorkspaceFile(ws, cleanRel);
    if (!htmlContent || htmlContent.trim().length < 20) return;
    const fileName = cleanRel.split("/").pop() || cleanRel;
    const S = useStore.getState();
    const existing = S.artboards.find(
      (a) =>
        (a.source && a.source.replace(/\\/g, "/").toLowerCase() === cleanRel.toLowerCase()) ||
        a.name.toLowerCase() === fileName.toLowerCase() ||
        a.name.toLowerCase() === cleanRel.toLowerCase()
    );
    let boardId: string;
    if (existing) {
      boardId = existing.id;
      S.reviseArtboard(boardId, htmlContent);
      S.updateArtboard(boardId, { source: cleanRel, loading: false });
    } else {
      const created = S.addArtboard({
        name: fileName,
        device: "web",
        html: htmlContent,
        source: cleanRel,
        w: DEVICE_SIZE.web.w,
        h: DEVICE_SIZE.web.h,
      });
      boardId = created.id;
    }
    syncedBoardIds.add(boardId);
    S.setSel([boardId]);
    S.patchUI({ showCanvas: true });
    const msg = activeConv(useStore.getState()).messages.find((m) => m.id === asstId);
    const mergedIds = [...new Set([...(msg?.artboardIds ?? []), ...syncedBoardIds])];
    useStore.getState().patchMessage(convId, asstId, { artboardIds: mergedIds });
  } catch {
    /* ignore if file not readable */
  }
}

export async function sendMessage(opts: {
  text: string;
  attachments?: Attachment[];
  quote?: Quote;
  asVariant?: boolean;
}) {
  const st = useStore.getState();
  if (st.busy || !opts.text.trim()) return;
  if (opts.text.trim().toLowerCase() === "/compact") {
    await compactConversation({ manual: true });
    return;
  }
  const verifyMatch = /^\/(?:verify|fingerprint|lmfingerprint)(?:\s+([\w./:-]+))?$/i.exec(opts.text.trim());
  if (verifyMatch) {
    const arg = verifyMatch[1]?.trim() ?? "";
    const [targetProv, targetModel] = arg.includes("/")
      ? arg.split("/", 2)
      : [st.settings.providerId, arg || st.settings.modelId];
    const convId = st.activeConvId;
    const asstId = uid();
    const toolId = uid();
    st.addMessage(convId, {
      id: uid(),
      role: "user",
      text: opts.text.trim(),
      at: Date.now(),
    });
    st.addMessage(convId, {
      id: asstId,
      role: "assistant",
      text: "",
      streaming: true,
      model: `${targetProv}/${targetModel}`,
      at: Date.now(),
      tools: [{ id: toolId, name: "lmfingerprint", args: `${targetProv}/${targetModel}`, status: "running" }],
    });
    st.setBusy(true);
    try {
      const rep = await verifyModelAuthenticity(targetProv, targetModel);
      const md = formatFingerprintMarkdown(rep);
      useStore.getState().patchMessage(convId, asstId, {
        text: md,
        streaming: false,
        tools: [
          {
            id: toolId,
            name: "lmfingerprint",
            args: `${rep.provider}/${rep.requestedModel} -> ${rep.verdict}`,
            status: "ok",
            output: `${rep.verdictLabel}\nEndpoint: ${rep.upstreamEndpoint}\nReported model: ${rep.upstreamReportedModel}\nFP: ${rep.fingerprintHash}`,
          },
        ],
        stats: { ms: rep.latencyMs, tokens: Math.max(12, Math.round(md.length / 4)), tps: rep.tokensPerSec },
      });
    } catch (e) {
      useStore.getState().patchMessage(convId, asstId, {
        text: "",
        streaming: false,
        error: e instanceof Error ? e.message : "LMFingerprint verification failed",
        tools: [{ id: toolId, name: "lmfingerprint", args: `${targetProv}/${targetModel}`, status: "error", output: String(e) }],
      });
    } finally {
      useStore.getState().setBusy(false);
    }
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
  const target = opts.quote?.artboardId
    ? freshSt.artboards.find((a) => a.id === opts.quote!.artboardId)
    : undefined;

  const userMsg: Message = {
    id: uid(),
    role: "user",
    text: opts.text.trim(),
    quote: opts.quote,
    attachments: opts.attachments,
    at: Date.now(),
  };
  const asstId = uid();
  const prov = settings.providerId.startsWith("custom:") ? null : findProvider(settings.providerId);
  const custom = settings.providerId.startsWith("custom:")
    ? settings.customProviders.find((c) => `custom:${c.id}` === settings.providerId)
    : undefined;
  const modelLabel = custom
    ? custom.model
    : prov?.models.find((m) => m.id === settings.modelId)?.label ?? settings.modelId;
  freshSt.addMessage(convId, userMsg);
  freshSt.addMessage(convId, {
    id: asstId,
    role: "assistant",
    text: "",
    streaming: true,
    model: modelLabel,
    at: Date.now(),
    tools: [...tools],
    artboardIds: [],
  });
  freshSt.setBusy(true);
  void learnFromText(opts.text).then((l) => {
    if (l.length) {
      useStore.getState().notify(l.length === 1 ? "Saved to memory" : `Saved ${l.length} lines to memory`);
    }
  });

  if (settings.autoTitle && !conv.titled && conv.messages.length === 0) {
    generateTitle(opts.text).then((t) => useStore.getState().setTitle(convId, t));
  }

  const boards = getConversationBoards(freshSt);
  const spec = getProviderSpecialization(settings.providerId, settings.modelId);
  const mode = classifyIntent(opts.text, {
    boards: boards.length,
    quote: Boolean(opts.quote),
    asVariant: opts.asVariant,
    workspace: Boolean(freshSt.ui.workspace),
  });
  const { messages: history, themeOverride, isCanvasFollowUp } =
    mode === "design"
      ? buildMultiTurnContext({
          convMessages: conv.messages,
          userMsg,
          boards,
          target,
          asVariant: opts.asVariant,
          quoteToText,
          spec,
        })
      : buildPlainContext({ convMessages: conv.messages, userMsg, quoteToText, mode });

  controller = new AbortController();
  const signal = controller.signal;
  let full = "";
  const t0 = performance.now();
  const idMap = new Map<number, string>();
  const preSyncedIds = new Set<string>();
  const syncedWorkspaceBoardIds = new Set<string>();

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
  let extraThink = "";
  let thinkT0 = 0;
  let thinkEnd = 0;

  const sync = (final = false) => {
    const parsed = parseStream(extractRemember(full).clean, extraThink);
    const { blocks, reasoning, thinkOpen } = parsed;
    let { text } = parsed;
    if (final && !text.trim() && tools.length > 0) {
      text = synthesizeToolCompletionSummary(tools);
    }

    const S = useStore.getState();
    blocks.forEach((b, i) => {
      let id = idMap.get(i);
      const bDevice = (
        ["mobile", "tablet", "web"].includes(b.attrs.device)
          ? b.attrs.device
          : target?.device ?? boards[i]?.device ?? "mobile"
      ) as Device;
      if (!id) {
        const byId = b.attrs.id ? S.artboards.find((a) => a.id === b.attrs.id) : undefined;
        const byName =
          !byId && isCanvasFollowUp && b.attrs.name
            ? boards.find((a) => a.name.toLowerCase() === b.attrs.name.toLowerCase())
            : undefined;
        const byTarget = !byId && !byName && target && !opts.asVariant && i === 0 ? target : undefined;
        const byIndex =
          !byId &&
          !byName &&
          !byTarget &&
          isCanvasFollowUp &&
          !opts.asVariant &&
          (b.attrs.mode === "revise" || Boolean(themeOverride))
            ? boards[i]
            : undefined;
        const existing = byId ?? byName ?? byTarget ?? byIndex;
        if (existing) {
          id = existing.id;
          S.updateArtboard(id, { loading: true });
        } else {
          const ab = S.addArtboard({
            name: b.attrs.name || `Screen ${S.artboards.length + 1}`,
            device: bDevice,
            html: "",
            loading: true,
            groupId: opts.asVariant && target ? target.groupId : undefined,
            w: DEVICE_SIZE[bDevice].w,
            h: DEVICE_SIZE[bDevice].h,
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
        if (isRevise && !preSyncedIds.has(id)) S.reviseArtboard(id, finalHtml);
        else S.updateArtboard(id, { html: finalHtml });
        S.updateArtboard(id, { loading: false });
        lastPush.set(i, { t: now, len: -1 });
      } else if (
        lp.len !== -1 &&
        !isRevise &&
        b.html.length > 400 &&
        now - lp.t > 700 &&
        b.html.length - lp.len > 300
      ) {
        const partialHtml = harden(b.html, dsNow, {
          partial: true,
          intent: opts.text,
          name: b.attrs.name,
          device: bDevice,
        }).html;
        S.updateArtboard(id, {
          html: themeOverride ? applyThemeOverrideToHtml(partialHtml, themeOverride) : partialHtml,
        });
        lastPush.set(i, { t: now, len: b.html.length });
      }
    });

    const ms = performance.now() - t0;
    if (reasoning && !thinkT0) thinkT0 = performance.now();
    if (reasoning && !thinkEnd && ((!thinkOpen && (text || blocks.length || tools.length)) || final)) {
      thinkEnd = performance.now();
    }
    const hasUnclosed = final && blocks.some((b) => !b.closed);
    const allBoardIds = [...new Set([...idMap.values(), ...syncedWorkspaceBoardIds])];
    const tokEstimate = Math.max(
      1,
      Math.round((full.length + extraThink.length + tools.reduce((acc, t) => acc + (t.args?.length ?? 0), 0)) / 4)
    );
    S.patchMessage(convId, asstId, {
      reasoning: reasoning || undefined,
      thinkMs: thinkEnd ? Math.max(1, thinkEnd - thinkT0) : undefined,
      text,
      artboardIds: allBoardIds,
      tools: [...tools],
      truncated: hasUnclosed || undefined,
      stats: final ? { ms, tokens: tokEstimate, tps: Math.max(1, Math.round(tokEstimate / (ms / 1000))) } : undefined,
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
    controller = null;
    nativeCancel = null;
    void nativePerf.trim();
  };

  const designTokensAnswer = (args?: string) => {
    let sysId = useStore.getState().settings.designSystemId;
    try {
      const a = JSON.parse(args ?? "{}");
      const v = String(a.system ?? a.body ?? a.path ?? "");
      if (v) sysId = v;
    } catch {
      /* keep active */
    }
    const d = getDS(sysId.replace("m3-expressive", "m3e").replace("apple-hig", "hig").replace("fluent2", "fluent"));
    return `${d.name}\n${tokensCss(d)}`;
  };

  const selfCheck = async () => {
    if (signal.aborted || !signal.aborted) return;
    if (!useStore.getState().settings.selfCheck || signal.aborted) return;
    for (const id of [...new Set(idMap.values())].slice(0, 4)) {
      if (signal.aborted) return;
      const a = useStore.getState().artboards.find((x) => x.id === id);
      if (!a || a.html.length < 300 || a.html.includes("Empty frame")) continue;
      const chip: ToolCall = { id: uid(), name: "design_audit", args: a.name, status: "running" };
      tools.push(chip);
      sync();
      try {
        let issues = await auditHtml(a.html, a.w, a.h);
        const patched = patchFor(a.html, issues);
        if (patched !== a.html) useStore.getState().updateArtboard(id, { html: patched });
        const log = issues.map((i) => i.msg);
        const severe = issues.filter((i) => i.severe);
        if (severe.length && canCallModel() && !signal.aborted) {
          chip.name = "design_repair";
          sync();
          try {
            const cur = useStore.getState().artboards.find((x) => x.id === id)!;
            const bare = cur.html
              .replace(/<style data-zeus-kit>[\s\S]*?<\/style>/, "")
              .replace(/<script data-zeus-kit-js>[\s\S]*?<\/script>/, "");
            const raw = await Promise.race([
              oneShot(
                'You repair layout defects in one HTML screen. Fix ONLY the listed defects with the smallest possible edits. Keep content, structure, classes and CSS variables. Do not add shadows, emoji, gradients or external resources. Reply with the complete fixed document inside <artboard name="fix" mode="revise">...</artboard> and nothing else.',
                `Screen ${a.w}x${a.h}px. Defects:\n${severe.map((i) => `- ${i.msg}`).join("\n")}\n\n<artboard name="${a.name}" mode="revise">\n${bare.slice(0, 30000)}\n</artboard>`,
                { effort: "low", timeoutMs: 90000 }
              ),
              new Promise<string>((_, rej) => signal.addEventListener("abort", () => rej(new Error("stopped")))),
            ]);
            const b = parseStream(raw).blocks[0];
            if (b && b.html.length > Math.max(600, bare.length * 0.75) && !signal.aborted) {
              const fixed = harden(b.html, getDS(useStore.getState().settings.designSystemId), {
                intent: opts.text,
                name: a.name,
                device: a.device,
              }).html;
              const again = await auditHtml(fixed, a.w, a.h);
              const notSparse = !again.some((i) => i.kind === "sparse" || i.kind === "gap");
              if (notSparse && again.filter((i) => i.severe).length < severe.length) {
                useStore.getState().updateArtboard(id, { html: patchFor(fixed, again) });
                log.push(
                  `repaired: ${severe.length} defect${severe.length > 1 ? "s" : ""} fixed, ${again.filter((i) => i.severe).length} left`
                );
                issues = again;
              } else log.push("repair did not improve the screen, kept the original");
            }
          } catch (e) {
            log.push(`repair skipped: ${(e as Error).message}`);
          }
        }
        chip.status = "ok";
        chip.output = log.length ? log.join("\n") : "No layout issues";
      } catch (e) {
        chip.status = "error";
        chip.output = (e as Error).message;
      }
      sync();
    }
  };

  const nativeOn = isNative && useStore.getState().ui.nativeReady;
  const isGreeting = mode === "chat" && GREETING_RE.test(opts.text.trim());
  const stormyProfile = ModelProfiles.forIds(settings.providerId, settings.modelId);
  const toolsText = nativeOn && !isGreeting ? await toolsPrompt({ design: mode === "design" }).catch(() => "") : "";
  const projInstructions = !isGreeting ? await ProjectInstructions.load(st.ui.workspace).catch(() => "") : "";
  const projSnapshot =
    !isGreeting && mode === "code" && stormyProfile.inlineProjectChars > 0
      ? await ProjectSnapshot.inline(st.ui.workspace, stormyProfile.inlineProjectChars).catch(() => "")
      : "";
  const isProjectFresh = !st.ui.workspace || st.ui.workspace.tree.length === 0;
  const briefVerdict = !isGreeting ? BriefCheck.check(opts.text, isProjectFresh) : { vague: false, missing: [], reason: "" };
  const briefNote = BriefCheck.note(briefVerdict, Boolean((settings as { askBeforeBuilding?: boolean }).askBeforeBuilding));
  const system =
    mode === "design"
      ? [buildSystemPrompt({ intent: opts.text, device: target?.device, tools: toolsText }), projInstructions, briefNote]
          .filter(Boolean)
          .join("\n\n")
      : [agentPrompt(mode, opts.text), toolsText, projInstructions, projSnapshot, briefNote].filter(Boolean).join("\n\n");
  const activeProjRoot = st.projects.find((p) => p.id === st.activeProjectId)?.root;
  const effectiveWorkspaceRoot = st.ui.workspace?.root || activeProjRoot;
  const req: ChatRequest = {
    requestId: uid(),
    provider: custom ? "custom" : settings.providerId,
    model: custom ? custom.model : settings.modelId,
    effort: settings.effort,
    system,
    messages: history,
    workspaceRoot: effectiveWorkspaceRoot,
    custom: custom ? { baseUrl: custom.baseUrl, apiKey: custom.apiKey, format: custom.format } : undefined,
  };
  const device: Device = target?.device ?? "mobile";
  let raf = 0;
  const onDelta = (t: string) => {
    full += t;
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    }
  };

  try {
    const useOpenCodeRuntime =
      nativeOn &&
      settings.agentRuntime === "opencode" &&
      mode !== "design" &&
      !isGreeting &&
      !(opts.attachments && opts.attachments.length > 0);

    if (useOpenCodeRuntime) {
      await runOpenCode({
        convId,
        title: conv.title || opts.text.slice(0, 48),
        prompt: opts.text,
        system,
        onText: onDelta,
        onReasoning: (r) => {
          extraThink += r;
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); });
        },
        onTool: (tc) => {
          const idx = tools.findIndex((x) => x.id === tc.id);
          if (idx >= 0) tools[idx] = { ...tools[idx], ...tc };
          else tools.push(tc);
          if (tc.status === "ok" && /^(write_file|write|create_file|edit_file|edit|patch_file)$/.test(tc.name)) {
            try {
              const p = JSON.parse(tc.args ?? "{}").path;
              if (p && /\.html?$/i.test(p)) void syncHtmlFileToWorkbench(p, convId, asstId, syncedWorkspaceBoardIds);
            } catch { /* ignore */ }
          }
          sync();
        },
        signal,
      });
    } else if (nativeOn) {
      let current = req;
      let msgs: ChatRequest["messages"] = history;
      let nudgeCount = 0;
      const codingProfile = getCodingHarnessProfile(settings.providerId, settings.modelId);
      const stuckDetector = new StuckDetector();
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
                  .replace(/<(think|thinking)>\s*(?:\.{2,}|…)\s*<\/\1>/gi, (m) => " ".repeat(m.length))
                  .replace(/<(?:think|thinking)>[\s\S]*<\/(?:think|thinking)>/gi, (m) => " ".repeat(m.length))
                  .replace(/<(?:think|thinking)>[\s\S]*$/gi, (m) => " ".repeat(m.length));
              const findFakeResult = (s: string): number => {
                const clean = outsideThink(s);
                if (!roundTools.length && !/<\/(?:zeus_tool|tool_call|function_call|function|invoke|bash|shell|python|read_file|write_file|edit_file|multi_edit|move_file)>/i.test(clean)) return -1;
                for (const tag of ["<tool_result", "<tool_response"]) {
                  for (let from = 0; ; ) {
                    const i = clean.indexOf(tag, from);
                    if (i < 0) break;
                    if (i > 0 && (clean[i - 1] === "`" || clean[i - 1] === '"' || clean[i - 1] === "'")) {
                      from = i + tag.length;
                      continue;
                    }
                    return i;
                  }
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
              if (
                isCanvasFollowUp &&
                !roundText.includes("<artboard") &&
                roundText.length < 320 &&
                (looksLikeRefusalStart(roundText) || isCanvasRefusal(roundText))
              ) {
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
            } else if (e.type === "reasoning") {
              extraThink += e.text;
              if (!raf) {
                raf = requestAnimationFrame(() => {
                  raf = 0;
                  sync();
                });
              }
            } else if (e.type === "tool_call") {
              const t: ToolCall = {
                id: e.id,
                name: e.name,
                args: typeof e.args === "string" ? e.args : JSON.stringify(e.args),
                status: "running",
              };
              tools.push(t);
              roundTools.push(t);
              const canon = ToolAliases.canonicalName(e.name);
              if (canon === "update_plan") {
                const parsedPlan = parsePlanFromToolCall(t.args ?? "");
                if (parsedPlan) {
                  useStore.getState().patchMessage(convId, asstId, { plan: parsedPlan });
                }
              } else if (canon === "ask_user") {
                const parsedQ = parseAskUserFromToolCall(t.id, t.args ?? "");
                if (parsedQ) {
                  useStore.getState().patchMessage(convId, asstId, { pendingQuestion: parsedQ });
                }
              } else if (isStudioTool(e.name)) {
                studioRuns.set(
                  e.id,
                  runStudioTool(e.name, t.args).then((r) => {
                    t.status = r.ok ? "ok" : "error";
                    t.output = r.output;
                    sync();
                  })
                );
              }
              sync();
            } else if (e.type === "tool_result") {
              if (studioRuns.has(e.id)) return;
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
                const isReadTool = /^(read_file|read|cat|view_file|open_file)$/.test(t.name);
                const maxOut = isReadTool ? 48_000 : mode === "code" ? codingProfile.maxToolOutputChars : 12_000;
                const hooked = runPostToolUseHook(
                  { name: t.name, path: parsedPath, body: parsedBody },
                  { ok: e.ok, output: rawOut },
                  maxOut
                );
                t.status = hooked.ok ? "ok" : "error";
                t.output = hooked.output;
                if (e.oldContent !== undefined || e.newContent !== undefined) {
                  t.oldContent = e.oldContent ?? "";
                  t.newContent = e.newContent ?? "";
                  const d = DiffUtils.computeDiff(t.oldContent, t.newContent, 2);
                  t.additions = d.additions;
                  t.deletions = d.deletions;
                }
                if (e.checkpointId) {
                  t.checkpointId = e.checkpointId;
                  useStore.getState().patchMessage(convId, asstId, { checkpointId: e.checkpointId });
                }
                const canon = ToolAliases.canonicalName(t.name);
                if (canon === "update_plan") {
                  const parsedPlan = parsePlanFromToolCall(t.args || e.output || "");
                  if (parsedPlan) {
                    useStore.getState().patchMessage(convId, asstId, { plan: parsedPlan });
                  }
                } else if (canon === "ask_user") {
                  const parsedQ = parseAskUserFromToolCall(t.id, t.args || e.output || "");
                  if (parsedQ) {
                    useStore.getState().patchMessage(convId, asstId, { pendingQuestion: parsedQ });
                  }
                }
                if (t.name.startsWith("memory") || canon.startsWith("memory")) {
                  import("./bridge")
                    .then(({ nativeMemory }) =>
                      nativeMemory.list().then((l) => l && useStore.getState().patchSettings({ memory: [...l].reverse() }))
                    )
                    .catch(() => {});
                } else if (
                  /^(write_file|write|create_file|append_file|delete_file|remove_file|rm|del|unlink|move_file|rename_file|mv|edit_file|edit|patch_file|multi_edit|multiedit|shell|bash|python|python3)$/.test(
                    t.name
                  )
                ) {
                  const curWs = useStore.getState().ui.workspace;
                  if (curWs) {
                    refreshTree(curWs)
                      .then((tree) => useStore.getState().patchUI({ workspace: { ...curWs, tree } }))
                      .catch(() => {});
                    if (e.ok && parsedPath && /\.html?$/i.test(parsedPath)) {
                      void syncHtmlFileToWorkbench(parsedPath, convId, asstId, syncedWorkspaceBoardIds);
                    } else if (e.ok && /^(python|python3|shell|bash)$/.test(t.name)) {
                      const htmlMatch = /\.html?\b/i.exec(parsedBody);
                      if (htmlMatch) {
                        const existingHtmlBoards = useStore
                          .getState()
                          .artboards.filter((a) => a.source && /\.html?$/i.test(a.source));
                        for (const b of existingHtmlBoards) {
                          if (b.source) void syncHtmlFileToWorkbench(b.source, convId, asstId, syncedWorkspaceBoardIds);
                        }
                      }
                    }
                  }
                }
              }
              sync();
            } else if (e.type === "error") reject(new Error(e.message));
            else if (e.type === "done") resolve();
          };
          signal.addEventListener("abort", () => resolve());
          nativeChat(current, onEvent)
            .then((c) => {
              nativeCancel = c;
            })
            .catch(reject);
        }).finally(() => {
          if (!signal.aborted) {
            try {
              nativeCancel?.();
            } catch {
              /* ignore */
            }
            nativeCancel = null;
          }
        });
        await Promise.all(studioRuns.values());
        for (const t of roundTools) if (t.status === "running") t.status = "error";
        if (roundTools.some((t) => ToolAliases.canonicalName(t.name) === "ask_user")) {
          break;
        }
        const stuckVerdict = stuckDetector.record(roundTools);
        if (stuckVerdict.stop) {
          useStore.getState().patchMessage(convId, asstId, { error: stuckVerdict.stop });
          break;
        }
        if (signal.aborted || round >= (mode === "code" ? codingProfile.maxToolRounds : mode === "chat" ? 8 : 4)) break;
        if (!roundTools.length) {
          const parsedNow = parseStream(extractRemember(full).clean, extraThink);
          const produced = parsedNow.blocks.length > 0 || syncedWorkspaceBoardIds.size > 0;
          const unclosedBlock = parsedNow.blocks.find((b) => !b.closed && b.html.length > 100);

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

          const refused = isCanvasRefusal(roundText) || looksLikeRefusalStart(roundText);
          if (refused && full.endsWith(roundText)) {
            full = full.slice(0, full.length - roundText.length);
          }
          if (refused && preSyncedIds.size > 0) {
            break;
          }
          if (
            mode === "design" &&
            (!produced || refused) &&
            nudgeCount < 2 &&
            (DESIGN_INTENT.test(opts.text) || isCanvasFollowUp || refused)
          ) {
            nudgeCount++;
            if (full.endsWith(roundText)) full = full.slice(0, full.length - roundText.length);
            const targetHint =
              boards.length > 0 && isCanvasFollowUp
                ? `Revise the existing canvas screens (${boards.map((b) => `id="${b.id}" name="${b.name}"`).join(", ")}) using <artboard id="<id>" name="<name>" device="<device>" mode="revise"><!doctype html>...</html></artboard>.`
                : 'Output complete <artboard name="..." device="mobile|tablet|web" mode="new"><!doctype html>...</html></artboard> documents.';
            msgs = [
              ...msgs,
              { role: "assistant", content: refused ? "Understood, I will update the canvas screens directly." : roundText },
              {
                role: "user",
                content: `Your reply had no <artboard> block, so nothing reached the canvas. ${targetHint} Reply with one short sentence followed immediately by the <artboard> blocks.`,
              },
            ];
            current = { ...req, requestId: uid(), messages: msgs };
            continue;
          }

          const parsedRound = parseStream(roundText, extraThink);
          const cleanVisibleRound = parsedRound.text.trim();
          const hasFileOrMemMutation = tools.some((t) =>
            /^(write_file|write|create_file|edit_file|edit|patch_file|delete_file|remove_file|rm|del|unlink|python|python3|shell|bash|memory_save|memory_edit|memory_delete)$/.test(
              t.name
            )
          );
          const isInspectionPrompt =
            /\b(what'?s\s+going\s+on|see\s+what'?s|explain|summarize|summary|status|check|insepct|inspect|analyze|review|why|how\s+does|show\s+me|fetch\s+latest)\b/i.test(
              opts.text
            ) && !/\b(edit_file|write_file|remove\s+that|delete\s+the|in\s+["'`][\w./-]+\.(?:html?|tsx?|jsx?|css|py|rs|json|md)["'`]\s*,\s*(?:update|remove|change|replace|fix))\b/i.test(opts.text);
          const asksForMutation =
            !isInspectionPrompt &&
            /\b(write|create|edit|fix|update|add|remove|delete|refactor|implement|patch|save|record|deduplicate|filter|change|replace)\b/i.test(
              opts.text
            );
          const hasReadAnyFile = tools.some((t) =>
            /^(read_file|read|cat|view_file|open_file|search_code|grep|rg)$/.test(t.name) && t.status === "ok"
          );
          const lastToolFailed = tools.length > 0 && tools[tools.length - 1].status === "error";
          const deferredToUser =
            /\b(tell me to proceed|let me know if you(?:'d like| want) me to (?:proceed|continue|inspect)|shall I (?:proceed|continue)|if you want to start there|and I will inspect)\b/i.test(
              cleanVisibleRound
            ) || (lastToolFailed && !hasReadAnyFile && !hasFileOrMemMutation);
          const stoppedAfterReadOnly =
            asksForMutation && !hasFileOrMemMutation && tools.length > 0;
          const cutOffAfterThink = !cleanVisibleRound && (roundText.includes("<think") || Boolean(parsedRound.reasoning));
          const dumpedCodeWithoutWrite =
            asksForMutation &&
            !hasFileOrMemMutation &&
            (/```(?:js|javascript|ts|typescript|py|python|rust|go|cpp|c|html|css|json|md|bash|sh)\b/i.test(roundText) ||
              /\bwith\s+open\s*\(/.test(cleanVisibleRound));
          // Treat visible prose as "statedPlanOnly" when no tools have run yet or when the model defers mid-task
          const visibleAnnouncementOnly =
            tools.length === 0 &&
            cleanVisibleRound.length < 240 &&
            /\b(let'?s\s+(call|list|check|run|read|inspect|pull|fetch|search|look|verify|test|create|write|edit|delete|save|update|remove)|we\s+need\s+to\s+(call|pull|list|check|run|read|inspect|update|fix|delete|save|remove)|i\s+(will|need\s+to|should)\s+(call|list|check|run|read|inspect|pull|fetch|search|verify|test|edit|update|write))\b/i.test(
              cleanVisibleRound
            );
          const statedPlanOnly =
            cutOffAfterThink ||
            stoppedAfterReadOnly ||
            dumpedCodeWithoutWrite ||
            deferredToUser ||
            visibleAnnouncementOnly;

          if (
            (mode === "code" || Boolean(st.ui.workspace)) &&
            !produced &&
            nudgeCount < 3 &&
            (round === 0
              ? tools.length === 0 && (statedPlanOnly || !cleanVisibleRound)
              : cutOffAfterThink || stoppedAfterReadOnly || deferredToUser || dumpedCodeWithoutWrite) &&
            (statedPlanOnly ||
              /\b(write|create|edit|fix|update|add|remove|refactor|implement|run|test|debug|build|script|file|md|pull|push|fetch|clone|git|github|status|diff|check|insepct|inspect|list|read|search|find|grep)\b/i.test(
                opts.text
              ))
          ) {
            nudgeCount++;
            // Preserve any reasoning emitted during this round before trimming roundText from `full`
            const roundOnlyParsed = parseStream(roundText, "");
            if (roundOnlyParsed.reasoning) {
              extraThink = [extraThink, roundOnlyParsed.reasoning].filter(Boolean).join("\n\n");
            }
            if (roundText && full.endsWith(roundText)) {
              full = full.slice(0, full.length - roundText.length);
            }
            const inspectedFiles = tools
              .map((t) => {
                try {
                  return JSON.parse(t.args ?? "{}").path || "";
                } catch {
                  return "";
                }
              })
              .filter(Boolean);
            const targetFileHint =
              inspectedFiles[0] ||
              opts.text.match(/["'`]([\w./-]+\.(?:html?|tsx?|jsx?|css|py|rs|json|md))["'`]/i)?.[1] ||
              "";
            const specificInstruction =
              cutOffAfterThink && tools.length > 0 && !stoppedAfterReadOnly && !deferredToUser
                ? `You finished reasoning about the ${tools.length} completed tool step${tools.length > 1 ? "s" : ""}, but your stream ended before writing the visible response. Provide your clear, complete visible answer to the user now (or emit the next \`<zeus_tool>\` block if another workspace action is required).`
                : deferredToUser
                ? `Do NOT stop or ask the user "tell me to proceed". Continue inspecting the codebase right now by emitting \`<zeus_tool name="search_code">query</zeus_tool>\`, \`<zeus_tool name="list_dir" path="subdir"></zeus_tool>\`, or \`<zeus_tool name="read_file" path="..."></zeus_tool>\`.`
                : stoppedAfterReadOnly || dumpedCodeWithoutWrite
                ? `You already inspected ${targetFileHint ? `\`${targetFileHint}\`` : "the codebase"} (${tools.length} read/search step${tools.length > 1 ? "s" : ""}), but you have NOT applied the requested modification on disk yet (writing markdown code blocks in prose does not modify files). Emit \`<zeus_tool name="edit_file" path="${targetFileHint || "..."}"><<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE</zeus_tool>\` or \`<zeus_tool name="write_file" path="${targetFileHint || "..."}">...</zeus_tool>\` right now to apply the change.`
                : `Your reply stopped without emitting a \`<zeus_tool>\` block, so no command or file operation ran. Output ONLY \`<zeus_tool name="edit_file" path="...">...</zeus_tool>\`, \`<zeus_tool name="write_file" path="...">...</zeus_tool>\`, \`<zeus_tool name="shell">...</zeus_tool>\`, \`<zeus_tool name="python">...</zeus_tool>\`, or \`<zeus_tool name="read_file" path="..."></zeus_tool>\` now.`;
            msgs = [
              ...msgs,
              {
                role: "assistant",
                content:
                  cutOffAfterThink && tools.length > 0 && !stoppedAfterReadOnly && !deferredToUser
                    ? `Thought summary: ${(roundOnlyParsed.reasoning || "Analyzed tool results.").slice(0, 800)}`
                    : "Understood. I will emit the `<zeus_tool>` XML block now to execute the next step directly.",
              },
              {
                role: "user",
                content: `Original user request: ${opts.text.slice(0, 1000)}\n\n${specificInstruction}`,
              },
            ];
            current = { ...req, requestId: uid(), effort: "low", messages: msgs };
            continue;
          }
          break;
        }

        const strippedRound = parseStream(roundText).text.trim();
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
        const said = [strippedRound, canonicalTools].filter(Boolean).join("\n");
        const roundHadError = roundTools.some((t) => t.status === "error");
        const hasMutatedSoFar = tools.some((t) =>
          /^(write_file|write|create_file|edit_file|edit|patch_file|delete_file|remove_file|rm|del|unlink|python|python3|shell|bash|memory_save|memory_edit|memory_delete)$/.test(
            t.name
          ) && t.status === "ok"
        );
        const asksMut = /\b(write|create|edit|fix|update|add|remove|delete|refactor|implement|patch|save|record|deduplicate|filter|change|replace)\b/i.test(
          opts.text
        );
        const nextStepDirective = roundHadError
          ? `One or more tool calls above failed. Do NOT stop and NEVER ask the user "tell me to proceed"—immediately emit a fallback <zeus_tool> (such as <zeus_tool name="search_code">...</zeus_tool>, <zeus_tool name="list_dir" path="..."></zeus_tool>, <zeus_tool name="read_file" path="..."></zeus_tool>, or <zeus_tool name="python">...</zeus_tool>) to continue.`
          : asksMut && !hasMutatedSoFar
          ? `You have only read/searched files so far and have NOT modified any files on disk yet. Emit <zeus_tool name="edit_file" path="..."><<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE</zeus_tool> or <zeus_tool name="write_file" path="...">...</zeus_tool> (or <zeus_tool name="read_file" path="..."></zeus_tool> if you need to inspect another file first) now. Do NOT output markdown code fences instead of <zeus_tool>.`
          : `If every part of the user's request is now 100% complete and verified on disk, do NOT call any more tools and provide your complete, direct response. Otherwise, emit the next <zeus_tool> block to finish the remaining steps (never stop mid-inspection to ask "tell me to proceed" and never repeat an identical call).`;
        msgs = HistoryPruner.prune(
          [
            ...msgs,
            { role: "assistant", content: said },
            {
              role: "user",
              content: `Original user request: ${opts.text.slice(0, 1200)}\n\nTool results:\n${roundTools
                .map((t) => {
                  const isRead = /^(read_file|read|cat|view_file|open_file)$/.test(t.name);
                  const cap = isRead ? 48_000 : mode === "code" ? codingProfile.maxToolOutputChars : 12_000;
                  return `<tool_result name="${t.name}" ok="${t.status === "ok"}">\n${(t.output ?? "").slice(0, cap)}\n</tool_result>`;
                })
                .join("\n")}${stuckVerdict.note ? `\n\n${stuckVerdict.note}` : ""}\n\n${nextStepDirective}`,
            },
          ],
          stormyProfile.contextBudgetTokens
        );
        current = { ...req, requestId: uid(), messages: msgs };
        full += "\n\n";
      }
      if (mode === "code") {
        recordTrajectoryReflection({
          projectRoot: st.ui.workspace?.root,
          providerId: settings.providerId,
          modelId: settings.modelId,
          tools,
          nudged: nudgeCount > 0,
        });
      }
    } else if (custom) {
      await streamCustom(
        req,
        onDelta,
        (r) => {
          extraThink += r;
          if (!raf) {
            raf = requestAnimationFrame(() => {
              raf = 0;
              sync();
            });
          }
        },
        signal
      );
    } else if (BROWSER_FALLBACK_PROVIDER_IDS.has(settings.providerId)) {
      const cfg = resolveBrowserGatewayConfig(settings.providerId, settings.modelId);
      const browserCustom = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, format: cfg.format };
      try {
        await streamCustom(
          { ...req, model: cfg.model, custom: browserCustom },
          onDelta,
          (r) => {
            extraThink += r;
            if (!raf) {
              raf = requestAnimationFrame(() => {
                raf = 0;
                sync();
              });
            }
          },
          signal
        );
      } catch {
        await demoRun({ prompt: opts.text, device, target, onDelta, signal, asVariant: opts.asVariant });
      }
    } else {
      if (prov && prov.id !== "demo") {
        onDelta(
          `> Native engine not detected — **${prov.name}** runs inside the desktop app. Using the built-in demo designer here.\n\n`
        );
      }
      await demoRun({ prompt: opts.text, device, target, onDelta, signal, asVariant: opts.asVariant });
    }
    if (raf) cancelAnimationFrame(raf);
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
      const parsedEnd = parseStream(extractRemember(full).clean, extraThink);
      if (!parsedEnd.text.trim() || isCanvasRefusal(parsedEnd.text)) {
        const blocksOnly = full.slice(Math.max(0, full.indexOf("<artboard")));
        full = `Applied the **${themeOverride.name}** theme across ${
          targetBoards.length === 1 ? `**${targetBoards[0].name}**` : `all **${targetBoards.length} screens** on the canvas`
        } while preserving their layouts.\n\n${blocksOnly.startsWith("<artboard") ? blocksOnly : ""}`;
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
