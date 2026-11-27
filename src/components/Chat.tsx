import { useEffect, useRef, useState } from "react";
import { activeConv, activeProject, useStore } from "../store";
import type { Attachment, Message, Quote } from "../types";
import { sendMessage, stopGeneration } from "../lib/engine";
import { compactConversation, getContextWindowStats } from "../lib/context";
import { supportsAttachments } from "../lib/providers";
import { ModelPicker } from "./ModelPicker";
import { focusArtboard } from "../lib/actions";
import {
  nativeCheckpoints,
  nativeMemory,
  openWorkspace,
  refreshTree,
} from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, Markdown, MenuItem, Thumb } from "./ui";
import { Icon } from "./Icon";
import { SessionHeader } from "./SessionHeader";
import { ApprovalCard, AskUserCard, Collapse, LiveStatus, PlanTimeline, WorkLog } from "./Activity";
import { FilesPanel, GitPanel, ProjectWorkspaceCard, TerminalPanel } from "./WorkspacePanels";
import { splitM3e, m3eLink, type M3eDoc } from "../lib/m3e";

export { FilesPanel, GitPanel, TerminalPanel };

/* ------------------------------------------------------------------ */
/* Message bits                                                        */
/* ------------------------------------------------------------------ */
function QuoteCard({ q, compact }: { q: Quote; compact?: boolean }) {
  const a = useStore((s) => s.artboards.find((x) => x.id === q.artboardId));
  return (
    <button
      onClick={() => q.artboardId && focusArtboard(q.artboardId)}
      className={cn("state flex w-full items-stretch gap-3 overflow-hidden rounded-[18px] border border-outline-variant/70 bg-surface-low text-left", compact ? "p-1.5" : "p-2")}
    >
      {a && <Thumb html={a.html} w={a.w} h={a.h} width={a.device === "web" ? 64 : 34} className="shrink-0 rounded-lg" />}
      <span className="min-w-0 flex-1 self-center">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          {q.kind === "pin" ? <><Icon name="push_pin" size={11} /> Pinned comment</> : q.kind === "element" ? <><Icon name="ads_click" size={11} /> Element</> : <><Icon name="chat_bubble" size={11} /> Screen</>}
          <span className="truncate normal-case tracking-normal text-on-surface-variant">· {a?.name ?? q.label}</span>
        </span>
        {q.text && <span className="mt-0.5 block truncate text-[13px] italic text-on-surface-variant">“{q.text}”</span>}
      </span>
    </button>
  );
}

const m3eOpened = new Set<string>();

/** Card for an <m3e> artifact: builds the share link, opens M3E Canvas beside the chat once, reopens on click. */
function M3eCard({ doc, id, streaming }: { doc: M3eDoc; id: string; streaming?: boolean }) {
  const patchUI = useStore((s) => s.patchUI);
  const active = useStore((s) => s.ui.m3e?.title === doc.title);
  const [state, setState] = useState<{ link?: string; error?: string }>({});
  const live = useRef(false);
  if (streaming) live.current = true;
  useEffect(() => {
    if (!doc.complete || streaming) return;
    let dead = false;
    m3eLink(doc.json).then((link) => {
      if (dead) return;
      setState({ link });
      if (live.current && !m3eOpened.has(id)) { m3eOpened.add(id); patchUI({ m3e: { title: doc.title, link }, showCanvas: false }); }
    }).catch((e: unknown) => !dead && setState({ error: e instanceof Error ? e.message : "Invalid sketch" }));
    return () => { dead = true; };
  }, [doc.json, doc.complete, streaming, id, patchUI]);
  const busy = !state.link && !state.error;
  return (
    <button
      disabled={!state.link}
      onClick={() => state.link && patchUI({ m3e: { title: doc.title, link: state.link } })}
      className={cn("flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors", active ? "border-primary bg-primary-container/40" : "border-outline-variant/60 bg-surface-low hover:bg-surface-high")}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-container text-on-primary-container"><Icon name="design_services" size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{doc.title}</span>
        <span className={cn("block text-xs text-on-surface-variant", busy && "zshine")}>{state.error ?? (busy ? "Sketching screens" : "M3E Canvas")}</span>
      </span>
      {state.link && <Icon name="chevron_right" size={18} className="text-on-surface-variant" />}
    </button>
  );
}

function ArtboardCards({ ids }: { ids: string[] }) {
  const boards = useStore((s) => s.artboards);
  const list = ids.map((id) => boards.find((b) => b.id === id)).filter(Boolean) as typeof boards;
  if (!list.length) return null;
  return (
    <div className="no-bar flex gap-2 overflow-x-auto pb-1">
      {list.map((a) => (
        <button key={a.id} onClick={() => focusArtboard(a.id)} className="state group w-[130px] shrink-0 overflow-hidden rounded-[22px] bg-surface-low p-1.5 text-left transition-transform ease-spring hover:-translate-y-0.5">
          <div className="overflow-hidden rounded-[16px]">
            <Thumb html={a.html} w={a.w} h={a.h} width={118} className={a.loading ? "opacity-60" : ""} />
          </div>
          <div className="mt-1.5 truncate px-1 text-xs font-semibold text-on-surface">{a.name}</div>
          <div className="px-1 pb-0.5 text-[10.5px] text-on-surface-variant">{a.loading ? <span className="zshine font-medium">Building…</span> : `v${a.version}`}</div>
        </button>
      ))}
    </div>
  );
}

function retry(m: Message) {
  const st = useStore.getState();
  if (st.busy) return;
  const c = activeConv(st);
  const idx = c.messages.findIndex((x) => x.id === m.id);
  const u = c.messages[idx - 1];
  if (!u || u.role !== "user") return;
  useStore.setState((s) => ({ conversations: s.conversations.map((cc) => (cc.id === c.id ? { ...cc, messages: cc.messages.slice(0, idx - 1) } : cc)) }));
  sendMessage({ text: u.text, attachments: u.attachments, quote: u.quote });
}

function CompactedCard({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface-low/60">
      <button
        onClick={() => setOpen(!open)}
        className="state flex w-full items-center gap-2 rounded-2xl px-3.5 py-2 text-left text-xs text-on-surface-variant"
      >
        <Icon name="inventory_2" size={14} className="shrink-0 text-primary" />
        <span className="font-semibold text-on-surface">Compacted conversation context</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-on-surface-variant/75">Preserved screens, palette & constraints</span>
        <Icon name="expand_more" size={15} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      <Collapse open={open}>
        <div className="border-t border-outline-variant/40 px-3.5 py-2.5 text-xs text-on-surface-variant">
          <Markdown text={m.text} />
        </div>
      </Collapse>
    </div>
  );
}

function MessageView({ m, isLast }: { m: Message; isLast?: boolean }) {
  const addMemory = useStore((s) => s.addMemory);
  const notify = useStore((s) => s.notify);
  const busy = useStore((s) => s.busy);
  if (m.compacted) {
    return <CompactedCard m={m} />;
  }
  const shown = m.role === "assistant" ? splitM3e(m.text) : { text: m.text, docs: [] as M3eDoc[] };
  if (m.role === "user") {
    return (
      <div className="anim-pop ml-auto flex max-w-[92%] flex-col items-end gap-1.5">
        {m.quote && <div className="w-full max-w-[330px]"><QuoteCard q={m.quote} /></div>}
        {m.attachments && m.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {m.attachments.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-surface-high px-2.5 py-1 text-xs">
                {a.dataUrl ? <img src={a.dataUrl} className="size-5 rounded object-cover" /> : <Icon name="description" size={13} />}{a.name}
              </span>
            ))}
          </div>
        )}
        <div className="select-text whitespace-pre-wrap rounded-[24px] rounded-br-[8px] bg-surface-high px-4 py-2.5 text-[14.5px] leading-relaxed text-on-surface">{m.text}</div>
      </div>
    );
  }
  const activeConvId = useStore((s) => s.activeConvId);
  const ws = useStore((s) => s.ui.workspace);
  const patchUI = useStore((s) => s.patchUI);

  return (
    <div className="anim-pop group min-w-0 space-y-2.5">
      {m.plan && <PlanTimeline plan={m.plan} />}
      <WorkLog m={m} />
      {shown.text && <div className={cn(m.streaming && "caret")}><Markdown text={shown.text} /></div>}
      {m.pendingQuestion && <AskUserCard convId={activeConvId} msgId={m.id} pending={m.pendingQuestion} />}
      {m.pendingApproval && <ApprovalCard convId={activeConvId} msgId={m.id} approval={m.pendingApproval} />}
      {shown.docs.map((d, i) => <M3eCard key={i} doc={d} id={`${m.id}:${i}`} streaming={m.streaming} />)}
      {m.artboardIds && m.artboardIds.length > 0 && <ArtboardCards ids={m.artboardIds} />}
      <LiveStatus m={m} />
      {m.error && <div className="flex items-start gap-2 rounded-2xl bg-error-container px-3 py-2 text-[13px] text-on-error-container"><Icon name="error" size={15} className="mt-0.5 shrink-0" /><span className="select-text">{m.error}</span></div>}
      {!m.streaming && m.truncated && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-outline-variant/60 bg-surface-low px-3 py-2 text-xs text-on-surface-variant">
          <span>Output reached the turn limit before closing the artboard.</span>
          <button
            disabled={busy}
            onClick={() => sendMessage({ text: "Continue from where you stopped and finish closing the current <artboard> and any remaining screens." })}
            className="state rounded-full bg-primary px-3 py-1 font-semibold text-on-primary disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}
      {!m.streaming && (
        <div className="flex items-center gap-1 text-xs text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn label="Copy" size={28} onClick={() => { navigator.clipboard.writeText(m.text); notify("Copied"); }}><Icon name="content_copy" size={13} /></IconBtn>
          <IconBtn label="Retry" size={28} onClick={() => retry(m)}><Icon name="refresh" size={13} /></IconBtn>
          {m.checkpointId && ws?.root && (
            <IconBtn
              label="Restore file checkpoint before this turn"
              size={28}
              onClick={async () => {
                if (!ws?.root || !m.checkpointId) return;
                const res = await nativeCheckpoints.restore(ws.root, m.checkpointId);
                if (res) {
                  const tree = await refreshTree(ws);
                  patchUI({ workspace: { ...ws, tree } });
                  notify(`Restored ${res.restoredFiles.length} file${res.restoredFiles.length === 1 ? "" : "s"}`);
                }
              }}
            >
              <Icon name="history" size={13} />
            </IconBtn>
          )}
          {isLast && (
            <IconBtn
              label="Continue generation"
              size={28}
              onClick={() => !busy && sendMessage({ text: "Continue refining or completing the design from your previous turn." })}
            >
              <Icon name="arrow_forward" size={13} />
            </IconBtn>
          )}
          <IconBtn label="Remember this" size={28} onClick={async () => { const v = m.text.slice(0, 240); const l = await nativeMemory.add(v); if (l) useStore.getState().patchSettings({ memory: l.reverse() }); else addMemory(v); notify("Saved to Memory"); }}><Icon name="bookmark_add" size={13} /></IconBtn>
          {m.model && <span className="ml-1">{m.model}</span>}
          {m.stats?.tps ? <span className="rounded-full bg-surface-high px-2 py-0.5 font-medium text-on-surface-variant">{m.stats.tps.toLocaleString()} tok/s</span> : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composer: M3 Expressive Connected Model + Effort Split Control      */
/* ------------------------------------------------------------------ */
function fmtTok(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function ContextWindowPill() {
  useStore((s) => s.activeConvId);
  useStore((s) => s.conversations);
  useStore((s) => s.artboards);
  useStore((s) => s.settings.providerId);
  useStore((s) => s.settings.modelId);
  useStore((s) => s.settings.designSystemId);
  const busy = useStore((s) => s.busy);
  const stats = getContextWindowStats();
  const canCompact = stats.messageCount >= 4 && !busy;

  return (
    <Dropdown align="right" width={288} trigger={({ toggle, open }) => (
      <button
        onClick={toggle}
        title={`Context window: ${stats.totalTokens.toLocaleString()} / ${stats.contextWindow.toLocaleString()} tokens (${stats.percentOfBudget}% of active budget)`}
        className={cn(
          "state flex h-8 items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface-low px-2.5 text-[11.5px] font-medium text-on-surface-variant",
          open && "bg-surface-high text-on-surface"
        )}
      >
        <span className="h-1.5 w-7 overflow-hidden rounded-full bg-surface-highest">
          <i
            style={{ width: `${Math.max(8, stats.percentOfBudget)}%` }}
            className={cn("block h-full rounded-full transition-all", stats.needsCompaction ? "bg-error" : "bg-primary")}
          />
        </span>
        <span className="font-mono tabular-nums">{fmtTok(stats.totalTokens)}</span>
      </button>
    )}>
      {(close) => (
        <div className="p-2.5 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-on-surface">Context Window</span>
            <span className="font-mono text-[11px] text-on-surface-variant">
              {fmtTok(stats.totalTokens)} / {fmtTok(stats.contextWindow)} tok
            </span>
          </div>
          <div className="mb-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-low">
            <div
              style={{ width: `${Math.max(4, stats.percentOfBudget)}%` }}
              className={cn("h-full rounded-full transition-all", stats.needsCompaction ? "bg-error" : "bg-primary")}
            />
          </div>
          <div className="space-y-1.5 rounded-xl bg-surface-low p-2.5 text-[11.5px] text-on-surface-variant">
            <div className="flex items-center justify-between">
              <span>Harness² System Surface (c1..c4)</span>
              <span className="font-mono text-on-surface">{fmtTok(stats.systemTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Artifacts & Previews ({stats.canvasScreenCount})</span>
              <span className="font-mono text-on-surface">{fmtTok(stats.canvasTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Chat History ({stats.messageCount} msg{stats.messageCount === 1 ? "" : "s"})</span>
              <span className="font-mono text-on-surface">{fmtTok(stats.historyTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>On-Demand Memory & MCP</span>
              <span className="font-mono text-on-surface">{fmtTok(stats.memoryTokens)}</span>
            </div>
          </div>
          {stats.compactedCount > 0 && (
            <div className="mt-2 px-1 text-[11px] text-on-surface-variant">
              Auto-compacted {stats.compactedCount} earlier message{stats.compactedCount === 1 ? "" : "s"} in this session.
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              disabled={!canCompact}
              onClick={async () => {
                await compactConversation({ manual: true });
                close();
              }}
              className="state flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 font-semibold text-on-primary disabled:bg-surface-high disabled:text-on-surface-variant/50"
            >
              <Icon name="inventory_2" size={14} />
              Compact Context (/compact)
            </button>
          </div>
        </div>
      )}
    </Dropdown>
  );
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;

const normalizeImageDataUrl = (rawUrl: string, mime: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const minDim = 64;
        const maxDim = 1280;
        const w0 = img.naturalWidth || img.width || 512;
        const h0 = img.naturalHeight || img.height || 512;
        if (w0 >= minDim && h0 >= minDim && w0 <= maxDim && h0 <= maxDim && rawUrl.length < 350000 && (mime === "image/png" || mime === "image/jpeg")) {
          resolve(rawUrl);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(w0, h0));
        const w = Math.max(minDim, Math.round(w0 * scale));
        const h = Math.max(minDim, Math.round(h0 * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch {
        resolve(rawUrl);
      }
    };
    img.onerror = () => resolve(rawUrl);
    img.src = rawUrl;
  });

const readFile = (f: File): Promise<Attachment> => new Promise((res) => {
  const r = new FileReader();
  const isImg = f.type.startsWith("image/") || IMAGE_EXT.test(f.name);
  const inferredMime = f.type || (isImg ? "image/png" : "text/plain");
  const base = { id: Math.random().toString(36).slice(2), name: f.name || "image.png", mime: inferredMime, size: f.size };
  if (isImg) {
    r.onload = async () => {
      const rawUrl = String(r.result || "");
      const normUrl = await normalizeImageDataUrl(rawUrl, inferredMime);
      const finalMime = normUrl.startsWith("data:image/jpeg") ? "image/jpeg" : inferredMime;
      res({ ...base, mime: finalMime, dataUrl: normUrl });
    };
    r.readAsDataURL(f);
  } else {
    r.onload = () => res({ ...base, text: String(r.result).slice(0, 60000) });
    r.readAsText(f);
  }
});

export function Composer({ hero }: { hero?: boolean }) {
  const busy = useStore((s) => s.busy);
  const providerId = useStore((s) => s.settings.providerId);
  const modelId = useStore((s) => s.settings.modelId);
  const patchUI = useStore((s) => s.patchUI);
  const ws = useStore((s) => s.ui.workspace);
  const sel = useStore((s) => s.sel);
  const boards = useStore((s) => s.artboards);
  const askBeforeBuilding = useStore((s) => Boolean(s.settings.askBeforeBuilding));
  const autonomy = useStore((s) => s.settings.autonomy ?? "unleashed");
  const patchSettings = useStore((s) => s.patchSettings);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [drag, setDrag] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = boards.find((b) => sel.includes(b.id));
  const canAttach = supportsAttachments(providerId, modelId);

  // Stormy FileMentionPopup (@file autocomplete from workspace tree)
  const mentionMatch = /(?:^|\s)@([\w./\\-]*)$/.exec(text);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : null;
  const flatWorkspaceFiles = (() => {
    if (!ws?.tree?.length || mentionQuery === null) return [];
    const list: Array<{ name: string; path: string; dir: boolean }> = [];
    const visit = (nodes: typeof ws.tree) => {
      for (const n of nodes) {
        if (list.length >= 200) return;
        list.push({ name: n.name, path: n.path, dir: n.dir });
        if (n.dir && n.children?.length) visit(n.children);
      }
    };
    visit(ws.tree);
    return list
      .filter((item) =>
        !mentionQuery
          ? true
          : item.name.toLowerCase().includes(mentionQuery) || item.path.toLowerCase().includes(mentionQuery)
      )
      .slice(0, 8);
  })();

  const selectMentionItem = async (item: { name: string; path: string; dir: boolean }) => {
    const nextText = text.replace(/(?:^|\s)@([\w./\\-]*)$/, (m) => {
      const lead = m.startsWith(" ") ? " " : "";
      return `${lead}@${item.path} `;
    });
    setText(nextText);
    setMentionIdx(0);
    if (!item.dir && ws) {
      try {
        const { readWorkspaceFile } = await import("../lib/bridge");
        const content = await readWorkspaceFile(ws, item.path);
        if (content) {
          setAtts((prev) =>
            prev.some((a) => a.name === item.path)
              ? prev
              : [
                  ...prev,
                  {
                    id: item.path,
                    name: item.path,
                    mime: "text/plain",
                    size: content.length,
                    text: content.slice(0, 40000),
                  },
                ]
          );
        }
      } catch {
        /* ignore */
      }
    }
    ta.current?.focus();
  };

  useEffect(() => {
    if (!canAttach && atts.length > 0) setAtts([]);
  }, [canAttach, atts.length]);

  useEffect(() => {
    const f = (e: Event) => { setText((e as CustomEvent<string>).detail); ta.current?.focus(); };
    window.addEventListener("zeus:prefill", f);
    return () => window.removeEventListener("zeus:prefill", f);
  }, []);
  useEffect(() => {
    const h = (e: Event) => { setQuote((e as CustomEvent<Quote>).detail); ta.current?.focus(); };
    window.addEventListener("zeus:quote", h);
    return () => window.removeEventListener("zeus:quote", h);
  }, []);
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<Attachment>).detail;
      const st = useStore.getState();
      if (detail.dataUrl && !supportsAttachments(st.settings.providerId, st.settings.modelId)) {
        st.notify("Select a vision-capable model (Kilo, Qwen, or Ptero) to attach images");
        return;
      }
      setAtts((a) => [...a, detail]);
    };
    window.addEventListener("zeus:attach", h);
    return () => window.removeEventListener("zeus:attach", h);
  }, []);
  useEffect(() => {
    if (ta.current) { ta.current.style.height = "0px"; ta.current.style.height = Math.min(200, ta.current.scrollHeight) + "px"; }
  }, [text]);

  const addFiles = async (files: FileList | File[]) => {
    if (!canAttach) {
      useStore.getState().notify("Select a vision-capable model (Kilo, Qwen, or Ptero) to attach images or files");
      return;
    }
    const list = await Promise.all(Array.from(files).slice(0, 8).map(readFile));
    setAtts((a) => [...a, ...list]);
  };

  const submit = () => {
    if (busy || !text.trim()) return;
    if (hero) useStore.getState().patchUI({ showCanvas: false });
    const q = quote ?? (selected ? ({ kind: "artboard", artboardId: selected.id, label: selected.name } as Quote) : undefined);
    sendMessage({ text, attachments: atts, quote: q });
    setText(""); setAtts([]); setQuote(null);
  };

  return (
    <div
      className="@container relative px-3 pb-3 pt-1"
      onDragOver={(e) => { if (!canAttach) return; e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { if (!canAttach) return; e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
    >
      <div className={cn("rounded-[28px] border bg-surface-container transition-all focus-within:border-primary/60", drag ? "border-primary bg-primary-container/40" : "border-outline-variant/70")}>
        {(quote || (selected && !quote)) && (
          <div className="px-2.5 pt-2.5">
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <QuoteCard compact q={quote ?? { kind: "artboard", artboardId: selected!.id, label: selected!.name }} />
              </div>
              <IconBtn label="Stop targeting this screen" size={28} onClick={() => (quote ? setQuote(null) : useStore.getState().setSel([]))}><Icon name="close" size={14} /></IconBtn>
            </div>
          </div>
        )}
        {atts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {atts.map((a) => (
              <span key={a.id} className="anim-pop flex items-center gap-1.5 rounded-full bg-surface-high py-1 pl-2.5 pr-1 text-xs font-medium">
                {a.dataUrl ? <img src={a.dataUrl} className="size-5 rounded object-cover" /> : <Icon name="description" size={13} />}
                <span className="max-w-32 truncate">{a.name}</span>
                <button onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))} className="grid size-5 place-items-center rounded-full hover:bg-surface-highest"><Icon name="close" size={11} /></button>
              </span>
            ))}
          </div>
        )}
        {flatWorkspaceFiles.length > 0 && (
          <div className="mx-2.5 mt-2.5 overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-high">
            <div className="flex items-center justify-between bg-surface-highest px-3 py-1.5 text-[11px] font-medium text-on-surface-variant">
              <span>Mention file or folder</span>
              <span>{flatWorkspaceFiles.length} items</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {flatWorkspaceFiles.map((item, i) => (
                <button
                  key={item.path}
                  onClick={() => void selectMentionItem(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors",
                    i === mentionIdx ? "bg-primary-container text-on-primary-container" : "text-on-surface hover:bg-surface"
                  )}
                >
                  <Icon name={item.dir ? "folder" : "description"} size={14} className="shrink-0 text-primary" />
                  <span className="font-mono font-medium">{item.name}</span>
                  {item.path !== item.name && (
                    <span className="truncate font-mono text-[11px] opacity-70">{item.path}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        <textarea
          ref={ta}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            setMentionIdx(0);
          }}
          onKeyDown={(e) => {
            if (flatWorkspaceFiles.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIdx((idx) => (idx + 1) % flatWorkspaceFiles.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIdx((idx) => (idx - 1 + flatWorkspaceFiles.length) % flatWorkspaceFiles.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                void selectMentionItem(flatWorkspaceFiles[mentionIdx] ?? flatWorkspaceFiles[0]);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); addFiles(f); } }}
          placeholder={hero ? "Ask Zeus Codes to build, debug, refactor, or type @ to mention a file…" : selected ? `Reply about “${selected.name}”` : "Ask Zeus Codes to edit files, run bash/python, or type @ to mention a file…"}
          className={hero ? "block max-h-[260px] min-h-[84px] w-full resize-none bg-transparent px-5 pb-1 pt-5 text-[16px] text-on-surface outline-none placeholder:text-on-surface-variant/60" : "block max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant/60"}
        />
        <div className="flex min-w-0 items-center gap-0.5 px-2 pb-2">
          {canAttach && (
            <>
              <input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.md,.json,.csv,.html,.tsx,.css" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <Dropdown up width={270} trigger={({ toggle }) => <IconBtn label="Add image or file" size={36} onClick={toggle}><Icon name="add" size={19} /></IconBtn>}>
                {(close) => (
                  <>
                    <MenuItem icon={<Icon name="image" size={16} />} label="Add reference screenshot" onClick={() => { fileRef.current?.click(); close(); }} />
                    <MenuItem icon={<Icon name="attach_file" size={16} />} label="Attach files" onClick={() => { fileRef.current?.click(); close(); }} />
                    <MenuItem icon={<Icon name="folder_open" size={16} />} label={ws ? `Project: ${ws.name}` : "Open project folder…"} onClick={() => { patchUI({ leftTab: "files" }); close(); if (!ws) openWorkspace().then((w) => w && useStore.getState().addOrSelectProject(w)).catch((e) => useStore.getState().notify(e.message)); }} />
                  </>
                )}
              </Dropdown>
            </>
          )}
          <Dropdown
            up
            width={280}
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                title="Stormy & Harness² Agent Settings"
                className={cn(
                  "state flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-on-surface-variant hover:text-on-surface",
                  open && "bg-surface-high text-on-surface"
                )}
              >
                <Icon name="bolt" size={15} className="text-primary" />
                <span className="hidden max-w-[130px] truncate @[520px]:inline">Harness²</span>
              </button>
            )}
          >
            {(close) => (
              <div className="space-y-2.5 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-on-surface">Autonomy</span>
                  <div className="flex rounded-full border border-outline-variant/60 bg-surface-low p-0.5 text-[11px]">
                    {(["unleashed", "leashed"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => patchSettings({ autonomy: m })}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 capitalize transition-colors",
                          autonomy === m ? "bg-primary font-semibold text-on-primary" : "text-on-surface-variant"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => patchSettings({ askBeforeBuilding: !askBeforeBuilding })}
                  className="state flex w-full items-center justify-between rounded-xl bg-surface-low px-3 py-2 text-left"
                >
                  <span className="font-medium text-on-surface">Ask before building</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                      askBeforeBuilding ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant"
                    )}
                  >
                    {askBeforeBuilding ? "On" : "Off"}
                  </span>
                </button>
                <button
                  onClick={() => {
                    close();
                    patchUI({ settingsOpen: true, settingsTab: "library" });
                  }}
                  className="state flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-high font-medium text-on-surface"
                >
                  <Icon name="tune" size={14} />
                  Configure Skills & Harness²
                </button>
              </div>
            )}
          </Dropdown>
          <span className="min-w-2 flex-1" />
          <ModelPicker />
          {busy ? (
            <button onClick={stopGeneration} title="Stop" className="state morph ml-1 grid size-10 place-items-center rounded-full bg-primary text-on-primary"><Icon name="stop" size={14} fill /></button>
          ) : (
            <button onClick={submit} disabled={!text.trim()} title="Send (Enter)" className="state morph ml-1 grid size-10 place-items-center rounded-[16px] bg-primary text-on-primary transition-all disabled:rounded-full disabled:bg-surface-highest disabled:text-on-surface-variant"><Icon name="arrow_upward" size={19} /></button>
          )}
        </div>
      </div>
    </div>
  );
}



/* ------------------------------------------------------------------ */
/* Chat pane                                                           */
/* ------------------------------------------------------------------ */
export function ChatPane() {
  const conv = useStore(activeConv);
  const curProject = useStore(activeProject);
  const ws = useStore((s) => s.ui.workspace);
  const leftTab = useStore((s) => s.ui.leftTab);
  const patchUI = useStore((s) => s.patchUI);
  const showCanvas = useStore((s) => s.ui.showCanvas);
  const m3eOpen = useStore((s) => !!s.ui.m3e);
  const [dockOpen, setDockOpen] = useState(true);
  const [dockTab, setDockTab] = useState<"files" | "git" | "terminal">("files");
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);
  const last = conv.messages[conv.messages.length - 1];
  const hasProjectFolder = Boolean(ws?.root || curProject?.root);
  const canSplitIde = hasProjectFolder && !showCanvas && !m3eOpen && leftTab === "chat";

  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [conv.messages.length, last?.text, last?.artboardIds?.length]);

  const handleOpenDock = (tab: "files" | "git" | "terminal", filePath?: string) => {
    if (!showCanvas && !m3eOpen) {
      setDockOpen(true);
      setDockTab(tab);
      patchUI({ leftTab: "chat" });
    } else {
      patchUI({ leftTab: tab });
    }
    if (filePath) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: filePath }));
      }, 30);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface">
      <SessionHeader
        canDock={canSplitIde}
        dockOpen={dockOpen}
        dockTab={dockTab}
        setDockOpen={setDockOpen}
        setDockTab={setDockTab}
        trailing={<ContextWindowPill />}
      />

      {leftTab === "files" ? (
        <FilesPanel />
      ) : leftTab === "git" ? (
        <GitPanel />
      ) : leftTab === "terminal" ? (
        <TerminalPanel />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={scroller} onScroll={(e) => { const t = e.currentTarget; stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80; setAway(!stick.current); }} className="mx-auto flex min-h-0 w-full max-w-[840px] flex-1 flex-col space-y-5 overflow-y-auto px-4 py-3">
              {conv.messages.length === 0 ? (
                <ProjectWorkspaceCard onOpenDock={handleOpenDock} />
              ) : (
                conv.messages.map((m, idx) => <MessageView key={m.id} m={m} isLast={idx === conv.messages.length - 1} />)
              )}
            </div>
            {away && (
              <div className="pointer-events-none relative h-0">
                <button
                  onClick={() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }}
                  title="Jump to latest" aria-label="Jump to latest"
                  className="state pointer-events-auto absolute -top-12 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-outline-variant bg-surface-container text-on-surface"
                ><Icon name="arrow_downward" size={18} /></button>
              </div>
            )}
            <div className="mx-auto w-full max-w-[840px]">
              <Composer />
            </div>
          </div>

          {canSplitIde && dockOpen && (
            <div className="hidden h-full w-[420px] shrink-0 flex-col border-l border-outline-variant/60 bg-surface-dim lg:flex xl:w-[480px]">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-outline-variant/50 px-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDockTab("files")}
                    className={cn(
                      "state flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium",
                      dockTab === "files" ? "bg-surface-high text-on-surface font-semibold" : "text-on-surface-variant"
                    )}
                  >
                    <Icon name="account_tree" size={14} />
                    Files
                  </button>
                  <button
                    onClick={() => setDockTab("git")}
                    className={cn(
                      "state flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium",
                      dockTab === "git" ? "bg-surface-high text-on-surface font-semibold" : "text-on-surface-variant"
                    )}
                  >
                    <Icon name="commit" size={14} />
                    Git
                  </button>
                  <button
                    onClick={() => setDockTab("terminal")}
                    className={cn(
                      "state flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium",
                      dockTab === "terminal" ? "bg-surface-high text-on-surface font-semibold" : "text-on-surface-variant"
                    )}
                  >
                    <Icon name="terminal" size={14} />
                    Terminal
                  </button>
                </div>
                <IconBtn label="Close project panel" size={28} onClick={() => setDockOpen(false)}>
                  <Icon name="close" size={15} />
                </IconBtn>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {dockTab === "files" ? <FilesPanel /> : dockTab === "git" ? <GitPanel /> : <TerminalPanel />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
