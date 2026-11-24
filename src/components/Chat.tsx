import { useEffect, useMemo, useRef, useState } from "react";
import { activeConv, activeProject, convArtifactCount, uid, useStore } from "../store";
import type { Attachment, FileNode, Message, Quote } from "../types";
import { sendMessage, stopGeneration } from "../lib/engine";
import { compactConversation, getContextWindowStats } from "../lib/context";
import { supportsAttachments } from "../lib/providers";
import { ModelPicker } from "./ModelPicker";
import { DESIGN_SYSTEMS, getDS } from "../lib/designSystems";
import { focusArtboard } from "../lib/actions";
import {
  nativeMemory,
  listWorkspaceDir,
  nativeShell,
  openWorkspace,
  openWorkspaceByPath,
  readWorkspaceFile,
  refreshTree,
  writeWorkspaceFile,
} from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, Markdown, MenuItem, MenuLabel, Thumb } from "./ui";
import { Icon } from "./Icon";
import { Collapse, LiveStatus, WorkLog } from "./Activity";
import { splitM3e, m3eLink, type M3eDoc } from "../lib/m3e";

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
          <div className="px-1 pb-0.5 text-[10.5px] text-on-surface-variant">{a.loading ? <span className="zshine font-medium">Designing…</span> : `v${a.version}`}</div>
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
  return (
    <div className="anim-pop group min-w-0 space-y-2.5">
      <WorkLog m={m} />
      {shown.text && <div className={cn(m.streaming && "caret")}><Markdown text={shown.text} /></div>}
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
              <span>System & Component Kit</span>
              <span className="font-mono text-on-surface">{fmtTok(stats.systemTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Live Canvas ({stats.canvasScreenCount} screen{stats.canvasScreenCount === 1 ? "" : "s"})</span>
              <span className="font-mono text-on-surface">{fmtTok(stats.canvasTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Chat History ({stats.messageCount} msg{stats.messageCount === 1 ? "" : "s"})</span>
              <span className="font-mono text-on-surface">{fmtTok(stats.historyTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Memory Index & Studio MCP</span>
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
  const dsId = useStore((s) => s.settings.designSystemId);
  const providerId = useStore((s) => s.settings.providerId);
  const modelId = useStore((s) => s.settings.modelId);
  const patch = useStore((s) => s.patchSettings);
  const patchUI = useStore((s) => s.patchUI);
  const ws = useStore((s) => s.ui.workspace);
  const sel = useStore((s) => s.sel);
  const boards = useStore((s) => s.artboards);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ds = getDS(dsId);
  const selected = boards.find((b) => sel.includes(b.id));
  const canAttach = supportsAttachments(providerId, modelId);

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
        <textarea
          ref={ta} value={text} rows={1} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); addFiles(f); } }}
          placeholder={hero ? "Ask Zeus to build, debug, refactor, or design in your project…" : selected ? `Reply about “${selected.name}”` : "Reply or ask Zeus to edit code, run bash/python, or design…"}
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
          <Dropdown up width={290} trigger={({ toggle }) => (
            <button onClick={toggle} title="Design system" className="state flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-on-surface-variant">
              <Icon name="palette" size={15} /><span className="hidden max-w-[110px] truncate @[520px]:inline">{ds.name}</span>
            </button>
          )}>
            {(close) => (
              <>
                <MenuLabel>Design system</MenuLabel>
                {DESIGN_SYSTEMS.map((d) => (
                  <MenuItem key={d.id} label={d.name} active={d.id === dsId} icon={<span className="size-4 rounded-full border border-outline-variant" style={{ background: d.tokens.primary }} />} onClick={() => { patch({ designSystemId: d.id }); close(); }} />
                ))}
                <MenuItem icon={<Icon name="chevron_right" size={15} />} label="Browse library & skills…" onClick={() => { patchUI({ settingsOpen: true, settingsTab: "library" }); close(); }} />
              </>
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
/* Files (workspace explorer + inline code viewer & editor)            */
/* ------------------------------------------------------------------ */
function filterTree(nodes: FileNode[], q: string): FileNode[] {
  if (!q.trim()) return nodes;
  const k = q.trim().toLowerCase();
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.dir) {
      const children = filterTree(n.children ?? [], k);
      if (children.length > 0 || n.name.toLowerCase().includes(k)) {
        out.push({ ...n, children });
      }
    } else if (n.name.toLowerCase().includes(k) || n.path.toLowerCase().includes(k)) {
      out.push(n);
    }
  }
  return out;
}

function Tree({
  nodes,
  depth = 0,
  selectedPath,
  forceOpen,
  onPick,
}: {
  nodes: FileNode[];
  depth?: number;
  selectedPath?: string;
  forceOpen?: boolean;
  onPick: (n: FileNode) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [lazy, setLazy] = useState<Record<string, FileNode[]>>({});
  const toggleDir = (n: FileNode) => {
    const willOpen = !open[n.path];
    setOpen((o) => ({ ...o, [n.path]: willOpen }));
    const ws = useStore.getState().ui.workspace;
    if (willOpen && ws && (!n.children || n.children.length === 0) && !lazy[n.path]) {
      void listWorkspaceDir(ws, n.path).then((c) => setLazy((l) => ({ ...l, [n.path]: c })));
    }
  };
  return (
    <div>
      {nodes.map((n) => {
        const isOpen = forceOpen || open[n.path];
        const isSel = selectedPath === n.path;
        return (
          <div key={n.path}>
            <button
              onClick={() => (n.dir ? toggleDir(n) : onPick(n))}
              className={cn(
                "state flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12.5px] text-on-surface",
                isSel && "bg-primary-container/50 font-medium text-on-primary-container"
              )}
              style={{ paddingLeft: 8 + depth * 13 }}
            >
              {n.dir ? (
                <Icon name={isOpen ? "folder_open" : "folder"} size={15} className="shrink-0 text-primary" />
              ) : (
                <Icon name="code" size={14} className="shrink-0 text-on-surface-variant" />
              )}
              <span className="truncate">{n.name}</span>
            </button>
            {n.dir && isOpen && (lazy[n.path] ?? n.children) && (
              <Tree nodes={lazy[n.path] ?? n.children ?? []} depth={depth + 1} selectedPath={selectedPath} forceOpen={forceOpen} onPick={onPick} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FilesPanel() {
  const ws = useStore((s) => s.ui.workspace);
  const curProject = useStore(activeProject);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const addOrSelectProject = useStore((s) => s.addOrSelectProject);
  const [q, setQ] = useState("");
  const [activeFile, setActiveFile] = useState<{ path: string; content: string; dirty: boolean } | null>(null);
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [saving, setSaving] = useState(false);

  const openFolder = () =>
    openWorkspace()
      .then((w) => {
        if (w) {
          addOrSelectProject(w);
          setActiveFile(null);
          notify(`Opened ${w.name}`);
        }
      })
      .catch((e) => notify(e.message));

  const reloadTree = async () => {
    if (!ws) return;
    const tree = await refreshTree(ws);
    patchUI({ workspace: { ...ws, tree } });
    notify("Refreshed file tree");
  };

  const openFile = async (path: string) => {
    const curWs = useStore.getState().ui.workspace;
    if (!curWs) return;
    try {
      const content = await readWorkspaceFile(curWs, path);
      setActiveFile({ path, content, dirty: false });
    } catch {
      notify(`Could not read ${path}`);
    }
  };

  useEffect(() => {
    const h = (e: Event) => {
      const p = (e as CustomEvent<string>).detail;
      if (p) void openFile(p);
    };
    window.addEventListener("zeus:open-file", h);
    return () => window.removeEventListener("zeus:open-file", h);
  }, []);

  const saveActiveFile = async () => {
    if (!ws || !activeFile) return;
    setSaving(true);
    try {
      await writeWorkspaceFile(ws, activeFile.path, activeFile.content);
      const tree = await refreshTree(ws);
      patchUI({ workspace: { ...ws, tree } });
      setActiveFile({ ...activeFile, dirty: false });
      notify(`Saved ${activeFile.path}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  const createNewFile = async () => {
    const p = newFilePath.trim().replace(/^[\\/]+/, "");
    if (!ws || !p) return;
    try {
      await writeWorkspaceFile(ws, p, "");
      const tree = await refreshTree(ws);
      patchUI({ workspace: { ...ws, tree } });
      setCreatingFile(false);
      setNewFilePath("");
      setActiveFile({ path: p, content: "", dirty: false });
      notify(`Created ${p}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to create file");
    }
  };

  const filteredTree = useMemo(() => (ws ? filterTree(ws.tree, q) : []), [ws, q]);

  if (!ws) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-surface-container text-primary">
          <Icon name="folder_open" size={24} />
        </div>
        <div className="text-base font-semibold text-on-surface">
          {curProject?.name ? `Bind a local folder to “${curProject.name}”` : "Open a local project folder"}
        </div>
        <button onClick={openFolder} className="state morph inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">
          <Icon name="folder_open" size={18} /> Pick project folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-outline-variant/60 px-3 py-2">
        <Icon name="folder_open" size={17} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-on-surface">{ws.name}</div>
          {ws.root && <div className="truncate font-mono text-[10.5px] text-on-surface-variant">{ws.root}</div>}
        </div>
        <IconBtn label="New file" size={28} onClick={() => setCreatingFile(!creatingFile)}><Icon name="add" size={16} /></IconBtn>
        <IconBtn label="Refresh files" size={28} onClick={reloadTree}><Icon name="refresh" size={15} /></IconBtn>
        <IconBtn label="Open another folder" size={28} onClick={openFolder}><Icon name="create_new_folder" size={15} /></IconBtn>
      </div>

      {creatingFile && (
        <div className="flex items-center gap-1.5 border-b border-outline-variant/60 bg-surface-low px-3 py-2">
          <input
            autoFocus
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createNewFile();
              if (e.key === "Escape") setCreatingFile(false);
            }}
            placeholder="path/to/file.ts"
            className="h-8 flex-1 rounded-lg border border-outline-variant bg-surface px-2.5 font-mono text-xs outline-none focus:border-primary"
          />
          <button onClick={createNewFile} className="state h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary">Create</button>
        </div>
      )}

      <div className="border-b border-outline-variant/50 px-3 py-1.5">
        <div className="relative flex items-center">
          <Icon name="search" size={14} className="absolute left-2.5 text-on-surface-variant" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter files…"
            className="h-7.5 w-full rounded-lg bg-surface-container pl-8 pr-2.5 text-xs outline-none placeholder:text-on-surface-variant/60"
          />
        </div>
      </div>

      {activeFile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 border-b border-outline-variant/60 bg-surface-low px-3 py-1.5">
            <button
              onClick={() => setActiveFile(null)}
              className="state inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-on-surface-variant hover:text-on-surface"
            >
              <Icon name="arrow_back" size={14} />
              Tree
            </button>
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-on-surface">
              {activeFile.path}
              {activeFile.dirty ? " *" : ""}
            </span>
            {/\.html?$/i.test(activeFile.path) && (
              <button
                onClick={() => {
                  const st = useStore.getState();
                  const ab = st.addArtboard({
                    name: activeFile.path.split("/").pop() || activeFile.path,
                    device: "web",
                    html: activeFile.content,
                    source: activeFile.path,
                  });
                  focusArtboard(ab.id);
                  notify(`Opened ${activeFile.path} on canvas`);
                }}
                className="state h-7 rounded-lg bg-secondary-container px-2.5 text-[11.5px] font-semibold text-on-secondary-container"
              >
                Open in Canvas
              </button>
            )}
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("zeus:attach", {
                    detail: {
                      id: activeFile.path,
                      name: activeFile.path,
                      mime: "text/plain",
                      size: activeFile.content.length,
                      text: activeFile.content,
                    },
                  })
                );
                patchUI({ leftTab: "chat" });
                notify(`Attached ${activeFile.path}`);
              }}
              className="state h-7 rounded-lg bg-surface-high px-2.5 text-[11.5px] font-medium text-on-surface"
            >
              Attach to chat
            </button>
            <button
              disabled={!activeFile.dirty || saving}
              onClick={saveActiveFile}
              className="state inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11.5px] font-semibold text-on-primary disabled:opacity-40"
            >
              <Icon name="save" size={13} />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <textarea
            value={activeFile.content}
            spellCheck={false}
            onChange={(e) => setActiveFile({ ...activeFile, content: e.target.value, dirty: true })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void saveActiveFile();
              }
            }}
            className="min-h-0 flex-1 resize-none bg-surface-dim p-3 font-mono text-[12px] leading-relaxed text-on-surface outline-none"
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {filteredTree.length === 0 ? (
            <div className="py-10 text-center text-xs text-on-surface-variant">No matching files</div>
          ) : (
            <Tree
              nodes={filteredTree}
              forceOpen={Boolean(q.trim())}
              onPick={(n) => void openFile(n.path)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive Project Terminal Panel                                  */
/* ------------------------------------------------------------------ */
const QUICK_COMMANDS = [
  "git status -sb",
  "npm test",
  "npm run build",
  "python3 --version",
];

export function TerminalPanel() {
  const curProject = useStore(activeProject);
  const ws = useStore((s) => s.ui.workspace);
  const allRuns = useStore((s) => s.terminalHistory);
  const { addTerminalRun, patchTerminalRun, clearTerminal, patchUI, notify } = useStore.getState();
  const [cmd, setCmd] = useState("");
  const [histIdx, setHistIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);

  const projId = curProject?.id ?? "proj-default";
  const cwd = ws?.root ?? curProject?.root ?? "";
  const runs = useMemo(() => allRuns.filter((r) => r.projectId === projId), [allRuns, projId]);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [runs.length, running]);

  const execCommand = async (commandToRun?: string) => {
    const line = (commandToRun ?? cmd).trim();
    if (!line || running) return;
    if (!commandToRun) setCmd("");
    setHistIdx(-1);
    const id = uid();
    setRunning(true);
    addTerminalRun({
      id,
      projectId: projId,
      cmd: line,
      cwd: cwd || ".",
      stdout: "",
      stderr: "",
      code: 0,
      at: Date.now(),
      running: true,
    });
    try {
      const res = await nativeShell.run(cwd, line);
      patchTerminalRun(id, {
        stdout: res.stdout,
        stderr: res.stderr,
        code: res.code,
        running: false,
      });
      if (ws) {
        refreshTree(ws).then((tree) => patchUI({ workspace: { ...ws, tree } })).catch(() => {});
      }
    } catch (e) {
      patchTerminalRun(id, {
        stderr: e instanceof Error ? e.message : String(e),
        code: 1,
        running: false,
      });
    } finally {
      setRunning(false);
    }
  };

  const sendOutputToChat = (r: { cmd: string; stdout: string; stderr: string; code: number }) => {
    const out = [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join("\n").slice(0, 8000);
    const snippet = `Terminal command \`${r.cmd}\` (exit ${r.code}):\n\`\`\`\n${out || "(no output)"}\n\`\`\`\n`;
    patchUI({ leftTab: "chat" });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("zeus:prefill", { detail: snippet }));
    }, 30);
    notify("Sent terminal output to chat composer");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon name="terminal" size={16} className="shrink-0 text-primary" />
          <span className="truncate font-mono text-xs font-medium text-on-surface">
            {curProject?.name ?? "Workspace"}
          </span>
          {cwd && <span className="truncate font-mono text-[10.5px] text-on-surface-variant">· {cwd}</span>}
        </div>
        <div className="flex items-center gap-1">
          {runs.length > 0 && (
            <IconBtn label="Clear terminal" size={28} onClick={() => clearTerminal(projId)}>
              <Icon name="delete_sweep" size={15} />
            </IconBtn>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-outline-variant/40 px-3 py-1.5">
        {QUICK_COMMANDS.map((qCmd) => (
          <button
            key={qCmd}
            disabled={running}
            onClick={() => void execCommand(qCmd)}
            className="state rounded-md bg-surface-container px-2 py-0.5 font-mono text-[11px] text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            $ {qCmd}
          </button>
        ))}
      </div>

      <div ref={outRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 font-mono text-[12px]">
        {runs.length === 0 && (
          <div className="py-8 text-center font-sans text-xs text-on-surface-variant">
            Run bash, git, test, or python commands in <span className="font-mono text-on-surface">{cwd || "."}</span>
          </div>
        )}
        {runs.map((r) => (
          <div key={r.id} className="rounded-xl border border-outline-variant/50 bg-surface-container p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-primary">$</span>
                <span className="truncate font-semibold text-on-surface">{r.cmd}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.running ? (
                  <span className="zshine text-[11px]">Running…</span>
                ) : (
                  <>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        r.code === 0 ? "bg-surface-high text-on-surface-variant" : "bg-error-container text-on-error-container"
                      )}
                    >
                      exit {r.code}
                    </span>
                    <button
                      onClick={() => sendOutputToChat(r)}
                      title="Send output to chat"
                      className="state rounded bg-surface-high px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-on-surface"
                    >
                      Ask Zeus
                    </button>
                  </>
                )}
              </div>
            </div>
            {(r.stdout || r.stderr) && (
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words border-t border-outline-variant/40 pt-2 text-[11.5px] leading-relaxed text-on-surface-variant select-text">
                {r.stdout}
                {r.stderr ? (r.stdout ? `\n${r.stderr}` : r.stderr) : ""}
              </pre>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-outline-variant/60 bg-surface p-2">
        <div className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container px-3 py-1.5 focus-within:border-primary">
          <span className="font-mono text-xs font-bold text-primary">$</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void execCommand();
              } else if (e.key === "ArrowUp" && runs.length > 0) {
                e.preventDefault();
                const nextIdx = histIdx < 0 ? runs.length - 1 : Math.max(0, histIdx - 1);
                setHistIdx(nextIdx);
                setCmd(runs[nextIdx].cmd);
              } else if (e.key === "ArrowDown" && histIdx >= 0) {
                e.preventDefault();
                const nextIdx = histIdx + 1;
                if (nextIdx >= runs.length) {
                  setHistIdx(-1);
                  setCmd("");
                } else {
                  setHistIdx(nextIdx);
                  setCmd(runs[nextIdx].cmd);
                }
              }
            }}
            placeholder={`Run command in ${curProject?.name ?? "project"}…`}
            className="h-7 flex-1 bg-transparent font-mono text-xs text-on-surface outline-none placeholder:text-on-surface-variant/60"
          />
          <button
            disabled={!cmd.trim() || running}
            onClick={() => void execCommand()}
            className="state grid size-7 place-items-center rounded-lg bg-primary text-on-primary disabled:opacity-40"
          >
            <Icon name="play_arrow" size={15} fill />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Project Workspace Overview (shown on new chat inside a project)     */
/* ------------------------------------------------------------------ */
const AGENT_TASKS = [
  { icon: "manage_search", label: "Map codebase", prompt: "Map the architecture and key files of this project." },
  { icon: "bug_report", label: "Find & fix bugs", prompt: "Inspect the codebase, run checks or tests, and fix any bugs." },
  { icon: "terminal", label: "Run tests & build", prompt: "Run the test suite or build in this project and fix any issues." },
  { icon: "description", label: "Generate AGENTS.md", prompt: "Analyze this project and create a concise AGENTS.md file." },
];

function ProjectWorkspaceCard({ onOpenDock }: { onOpenDock: (tab: "files" | "terminal", filePath?: string) => void }) {
  const ws = useStore((s) => s.ui.workspace);
  const curProject = useStore(activeProject);
  const providerId = useStore((s) => s.settings.providerId);
  const modelId = useStore((s) => s.settings.modelId);
  const topNodes = (ws?.tree ?? []).slice(0, 12);

  return (
    <div className="mx-auto my-auto flex w-full max-w-[680px] flex-col gap-4 py-6">
      <div className="rounded-2xl border border-outline-variant/60 bg-surface-low p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-container text-on-primary-container">
              <Icon name="folder_open" size={19} />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-base font-semibold text-on-surface">
                {ws?.name ?? curProject?.name ?? "Workspace"}
              </div>
              {(ws?.root ?? curProject?.root) && (
                <div className="truncate font-mono text-[11.5px] text-on-surface-variant">
                  {ws?.root ?? curProject?.root}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              title={`Zeus Harness² active for ${providerId}/${modelId}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface px-3 text-[11.5px] font-semibold text-primary"
            >
              <Icon name="bolt" size={14} />
              Zeus Harness²
            </span>
            <button
              onClick={() => onOpenDock("files")}
              className="state inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-high px-3 text-xs font-medium text-on-surface"
            >
              <Icon name="account_tree" size={14} />
              Files ({ws?.tree.length ?? 0})
            </button>
            <button
              onClick={() => onOpenDock("terminal")}
              className="state inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-high px-3 text-xs font-medium text-on-surface"
            >
              <Icon name="terminal" size={14} />
              Terminal
            </button>
          </div>
        </div>

        {topNodes.length > 0 && (
          <div className="mt-3.5 grid grid-cols-2 gap-1.5 border-t border-outline-variant/40 pt-3 sm:grid-cols-3">
            {topNodes.map((n) => (
              <button
                key={n.path}
                onClick={() => onOpenDock("files", n.dir ? undefined : n.path)}
                className="state flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-left text-xs text-on-surface"
              >
                <Icon
                  name={n.dir ? "folder" : "code"}
                  size={14}
                  className={cn("shrink-0", n.dir ? "text-primary" : "text-on-surface-variant")}
                />
                <span className="truncate font-mono text-[11.5px]">{n.name}{n.dir ? "/" : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {AGENT_TASKS.map((t) => (
          <button
            key={t.label}
            onClick={() => window.dispatchEvent(new CustomEvent("zeus:prefill", { detail: t.prompt }))}
            className="state flex h-9 items-center gap-2 rounded-xl bg-surface-container px-3 text-xs font-medium text-on-surface"
          >
            <Icon name={t.icon} size={16} className="text-primary" />
            {t.label}
          </button>
        ))}
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
  const projects = useStore((s) => s.projects);
  const ws = useStore((s) => s.ui.workspace);
  const leftTab = useStore((s) => s.ui.leftTab);
  const patchUI = useStore((s) => s.patchUI);
  const setTitle = useStore((s) => s.setTitle);
  const showCanvas = useStore((s) => s.ui.showCanvas);
  const m3eOpen = useStore((s) => !!s.ui.m3e);
  const artifacts = useStore((s) => convArtifactCount(s, s.activeConvId));
  const [editing, setEditing] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);
  const [dockTab, setDockTab] = useState<"files" | "terminal">("files");
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);
  const last = conv.messages[conv.messages.length - 1];
  const hasProjectFolder = Boolean(ws?.root || curProject?.root);
  const canSplitIde = hasProjectFolder && !showCanvas && !m3eOpen && leftTab === "chat";

  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [conv.messages.length, last?.text, last?.artboardIds?.length]);

  const switchProject = (projectId: string) => {
    const st = useStore.getState();
    const proj = st.projects.find((p) => p.id === projectId);
    st.setActiveProject(projectId);
    if (proj?.root) {
      openWorkspaceByPath(proj.root, proj.name)
        .then((w) => w && useStore.getState().patchUI({ workspace: w }))
        .catch(() => {});
    }
  };

  const openNewFolder = () => {
    openWorkspace()
      .then((w) => {
        if (w) {
          useStore.getState().addOrSelectProject(w);
          setDockOpen(true);
          setDockTab("files");
          useStore.getState().notify(`Opened project ${w.name}`);
        }
      })
      .catch((e) => useStore.getState().notify(e.message));
  };

  const handleOpenDock = (tab: "files" | "terminal", filePath?: string) => {
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
      <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-outline-variant/40 px-3">
        <Dropdown width={240} trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            title={curProject?.root ? `${curProject.name} (${curProject.root})` : "Switch or open project folder"}
            className={cn(
              "state flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface-container px-2.5 text-xs font-semibold text-on-surface",
              open && "bg-surface-high"
            )}
          >
            <Icon name="folder_open" size={15} className="text-primary" />
            <span className="max-w-[130px] truncate">{curProject?.name ?? "Workspace"}</span>
            <Icon name="expand_more" size={14} className="text-on-surface-variant" />
          </button>
        )}>
          {(close) => (
            <>
              <MenuLabel>Projects</MenuLabel>
              {projects.map((p) => (
                <MenuItem
                  key={p.id}
                  icon={<Icon name={p.id === curProject?.id ? "folder_open" : "folder"} size={16} />}
                  label={p.name}
                  active={p.id === curProject?.id}
                  onClick={() => { close(); switchProject(p.id); }}
                />
              ))}
              <div className="my-1 border-t border-outline-variant/60" />
              <MenuItem
                icon={<Icon name="create_new_folder" size={16} />}
                label="Open project folder…"
                onClick={() => { close(); openNewFolder(); }}
              />
            </>
          )}
        </Dropdown>

        <span className="text-on-surface-variant/50">/</span>

        {editing ? (
          <input
            autoFocus defaultValue={conv.title} spellCheck={false}
            onBlur={(e) => { if (e.target.value.trim()) setTitle(conv.id, e.target.value.trim()); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
            className="h-8 min-w-0 flex-1 rounded-lg border border-primary bg-surface-container px-2.5 font-display text-[14.5px] font-medium outline-none"
          />
        ) : (
          <button onClick={() => setEditing(true)} title="Rename chat" className="state flex min-w-0 items-center gap-1 rounded-lg px-2 py-1">
            <span className="truncate font-display text-[14.5px] font-medium text-on-surface">{conv.title}</span>
            <Icon name="edit" size={13} className="shrink-0 text-on-surface-variant/70" />
          </button>
        )}

        <span className="flex-1" />

        <div className="flex items-center rounded-full border border-outline-variant/60 bg-surface-low p-0.5">
          {([
            ["chat", "chat_bubble", "Chat"],
            ["files", "account_tree", "Files"],
            ["terminal", "terminal", "Terminal"],
          ] as const).map(([id, icon, label]) => {
            const on = leftTab === id;
            return (
              <button
                key={id}
                onClick={() => patchUI({ leftTab: id })}
                title={label}
                className={cn(
                  "state flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium transition-colors",
                  on ? "bg-surface-high text-on-surface font-semibold" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Icon name={icon} size={14} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>

        {hasProjectFolder && !showCanvas && !m3eOpen && leftTab === "chat" && (
          <IconBtn
            label={dockOpen ? "Hide project panel" : "Show project panel"}
            size={34}
            active={dockOpen}
            onClick={() => setDockOpen(!dockOpen)}
          >
            <Icon name="account_tree" size={18} />
          </IconBtn>
        )}

        <ContextWindowPill />
        {(artifacts > 0 || showCanvas) && (
          <IconBtn label={showCanvas ? "Close canvas" : "Open canvas"} size={34} active={showCanvas} onClick={() => patchUI({ showCanvas: !showCanvas })}><Icon name="dashboard" size={19} /></IconBtn>
        )}
        {showCanvas && <IconBtn label="Hide chat" size={34} onClick={() => patchUI({ chatCollapsed: true })}><Icon name="left_panel_close" size={19} /></IconBtn>}
      </div>

      {leftTab === "files" ? (
        <FilesPanel />
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
                    Project Files
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
                {dockTab === "files" ? <FilesPanel /> : <TerminalPanel />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
