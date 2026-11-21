import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, Brain, Check, ChevronDown, Copy, FileText, Folder, FolderOpen, FolderTree, History, MessageSquare, MessageSquarePlus, PanelLeftClose, Paperclip,
  Pin, Plus, Square, ArrowUp, Sparkles, Trash2, Wrench, X, Zap, Image as ImageIcon, BookmarkPlus, Palette, ChevronRight, KeyRound, RotateCcw,
} from "lucide-react";
import { activeConv, useStore } from "../store";
import type { Attachment, FileNode, Message, Quote } from "../types";
import { sendMessage, stopGeneration } from "../lib/engine";
import { EFFORTS, findProvider, PROVIDERS } from "../lib/providers";
import { DESIGN_SYSTEMS, getDS } from "../lib/designSystems";
import { focusArtboard } from "../lib/actions";
import { nativeMemory, openWorkspace, readWorkspaceFile } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, Markdown, MenuItem, MenuLabel, Thumb } from "./ui";

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
          {q.kind === "pin" ? <><Pin size={11} /> Pinned comment</> : <><MessageSquare size={11} /> Screen</>}
          <span className="truncate normal-case tracking-normal text-on-surface-variant">· {a?.name ?? q.label}</span>
        </span>
        {q.text && <span className="mt-0.5 block truncate text-[13px] italic text-on-surface-variant">“{q.text}”</span>}
      </span>
    </button>
  );
}

function ToolChip({ t }: { t: NonNullable<Message["tools"]>[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-surface-low">
      <button onClick={() => setOpen(!open)} className="state flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-[13px]">
        <Wrench size={14} className="text-primary" />
        <span className="font-mono font-medium">{t.name}</span>
        <span className="min-w-0 flex-1 truncate text-on-surface-variant">{t.args}</span>
        {t.status === "running" ? <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : t.status === "ok" ? <Check size={14} className="text-primary" /> : <AlertCircle size={14} className="text-error" />}
      </button>
      {open && t.output && <pre className="max-h-48 overflow-auto px-3 pb-3 font-mono text-xs text-on-surface-variant select-text">{t.output}</pre>}
    </div>
  );
}

function ArtboardCards({ ids }: { ids: string[] }) {
  const boards = useStore((s) => s.artboards);
  const list = ids.map((id) => boards.find((b) => b.id === id)).filter(Boolean) as typeof boards;
  if (!list.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {list.map((a) => (
        <button key={a.id} onClick={() => focusArtboard(a.id)} className="state group w-[130px] shrink-0 overflow-hidden rounded-[22px] bg-surface-low p-1.5 text-left transition-transform ease-spring hover:-translate-y-0.5">
          <div className="overflow-hidden rounded-[16px]">
            <Thumb html={a.html} w={a.w} h={a.h} width={118} className={a.loading ? "opacity-60" : ""} />
          </div>
          <div className="mt-1.5 truncate px-1 text-xs font-semibold text-on-surface">{a.name}</div>
          <div className="px-1 pb-0.5 text-[10.5px] text-on-surface-variant">{a.loading ? "Designing…" : `v${a.version} · open on canvas`}</div>
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

function MessageView({ m }: { m: Message }) {
  const addMemory = useStore((s) => s.addMemory);
  const notify = useStore((s) => s.notify);
  if (m.role === "user") {
    return (
      <div className="anim-pop ml-auto flex max-w-[92%] flex-col items-end gap-1.5">
        {m.quote && <div className="w-full max-w-[330px]"><QuoteCard q={m.quote} /></div>}
        {m.attachments && m.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {m.attachments.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-surface-high px-2.5 py-1 text-xs">
                {a.dataUrl ? <img src={a.dataUrl} className="size-5 rounded object-cover" /> : <FileText size={13} />}{a.name}
              </span>
            ))}
          </div>
        )}
        <div className="select-text whitespace-pre-wrap rounded-[24px] rounded-br-[8px] bg-primary-container px-4 py-2.5 text-[14.5px] leading-relaxed text-on-primary-container">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="anim-pop group flex gap-3">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[12px] bg-primary text-on-primary"><Zap size={16} fill="currentColor" /></div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {m.tools && m.tools.length > 0 && <div className="space-y-1.5">{m.tools.map((t) => <ToolChip key={t.id} t={t} />)}</div>}
        {m.text ? <div className={cn(m.streaming && "caret")}><Markdown text={m.text} /></div> : m.streaming && (
          <div className="flex items-center gap-2 py-1.5 text-sm text-on-surface-variant"><span className="flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="size-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 120}ms` }} />)}</span> Thinking…</div>
        )}
        {m.artboardIds && m.artboardIds.length > 0 && <ArtboardCards ids={m.artboardIds} />}
        {m.error && <div className="flex items-start gap-2 rounded-2xl bg-error-container px-3 py-2 text-[13px] text-on-error-container"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span className="select-text">{m.error}</span></div>}
        {!m.streaming && (
          <div className="flex items-center gap-1 text-xs text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100">
            <IconBtn label="Copy" size={28} onClick={() => { navigator.clipboard.writeText(m.text); notify("Copied"); }}><Copy size={13} /></IconBtn>
            <IconBtn label="Retry" size={28} onClick={() => retry(m)}><RotateCcw size={13} /></IconBtn>
            <IconBtn label="Remember this" size={28} onClick={async () => { const v = m.text.slice(0, 240); const l = await nativeMemory.add(v); if (l) useStore.getState().patchSettings({ memory: l.reverse() }); else addMemory(v); notify("Saved to Memory"); }}><BookmarkPlus size={13} /></IconBtn>
            {m.model && <span className="ml-1">{m.model}</span>}
            {m.stats?.tps ? <span className="rounded-full bg-tertiary-container px-2 py-0.5 font-semibold text-on-tertiary-container">⚡ {m.stats.tps.toLocaleString()} tok/s</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */
function ModelSelector() {
  const settings = useStore((s) => s.settings);
  const patch = useStore((s) => s.patchSettings);
  const patchUI = useStore((s) => s.patchUI);
  const custom = settings.customProviders.find((c) => `custom:${c.id}` === settings.providerId);
  const prov = findProvider(settings.providerId);
  const label = custom ? custom.model : prov.models.find((m) => m.id === settings.modelId)?.label ?? settings.modelId;
  return (
    <Dropdown up width={320} trigger={({ toggle, open }) => (
      <button onClick={toggle} className={cn("state flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-on-surface-variant", open && "bg-surface-high")}>
        <span className="text-sm">{custom ? "🔑" : prov.icon}</span>
        <span className="max-w-[130px] truncate">{label}</span>
        <ChevronDown size={14} />
      </button>
    )}>
      {(close) => (
        <>
          <MenuLabel>Free · no API key</MenuLabel>
          {PROVIDERS.filter((p) => p.role !== "title").map((p) => (
            <div key={p.id}>
              {p.models.map((m) => (
                <MenuItem
                  key={m.id} active={settings.providerId === p.id && settings.modelId === m.id}
                  icon={<span style={{ color: p.color }}>{p.icon}</span>} label={`${m.label}`} desc={`${p.name} · ${p.speed}${m.note ? " · " + m.note : ""}`}
                  right={m.reasoning ? <Brain size={13} className="text-on-surface-variant" /> : undefined}
                  onClick={() => { patch({ providerId: p.id, modelId: m.id }); close(); }}
                />
              ))}
            </div>
          ))}
          <MenuLabel>Instant micro-tasks</MenuLabel>
          <MenuItem icon="🚀" label="ChatJimmy · Llama 3.1 8B" desc="20,000+ tok/s · auto-titles every chat" onClick={() => { patch({ providerId: "chatjimmy", modelId: "llama3.1-8b" }); close(); }} active={settings.providerId === "chatjimmy"} />
          <MenuLabel>Your API keys</MenuLabel>
          {settings.customProviders.map((c) => (
            <MenuItem key={c.id} icon={<KeyRound size={15} />} label={c.model} desc={`${c.name} · ${c.format}`} active={settings.providerId === `custom:${c.id}`} onClick={() => { patch({ providerId: `custom:${c.id}`, modelId: c.model }); close(); }} />
          ))}
          <MenuItem icon={<Plus size={15} />} label="Add OpenAI / Anthropic endpoint…" onClick={() => { patchUI({ settingsOpen: true, settingsTab: "providers" }); close(); }} />
        </>
      )}
    </Dropdown>
  );
}

function EffortSelector() {
  const effort = useStore((s) => s.settings.effort);
  const patch = useStore((s) => s.patchSettings);
  return (
    <Dropdown up width={240} trigger={({ toggle, open }) => (
      <button onClick={toggle} className={cn("state flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-on-surface-variant", open && "bg-surface-high")}>
        <Brain size={14} /> {EFFORTS.find((e) => e.id === effort)?.label}
      </button>
    )}>
      {(close) => (
        <>
          <MenuLabel>Thinking effort</MenuLabel>
          {EFFORTS.map((e) => <MenuItem key={e.id} label={e.label} desc={e.desc} active={effort === e.id} onClick={() => { patch({ effort: e.id }); close(); }} />)}
        </>
      )}
    </Dropdown>
  );
}

const readFile = (f: File): Promise<Attachment> => new Promise((res) => {
  const r = new FileReader();
  const base = { id: Math.random().toString(36).slice(2), name: f.name, mime: f.type || "text/plain", size: f.size };
  if (f.type.startsWith("image/")) { r.onload = () => res({ ...base, dataUrl: r.result as string }); r.readAsDataURL(f); }
  else { r.onload = () => res({ ...base, text: String(r.result).slice(0, 60000) }); r.readAsText(f); }
});

function Composer() {
  const busy = useStore((s) => s.busy);
  const dsId = useStore((s) => s.settings.designSystemId);
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

  useEffect(() => {
    const h = (e: Event) => setAtts((a) => [...a, (e as CustomEvent<Attachment>).detail]);
    window.addEventListener("zeus:attach", h);
    return () => window.removeEventListener("zeus:attach", h);
  }, []);
  useEffect(() => {
    if (ta.current) { ta.current.style.height = "0px"; ta.current.style.height = Math.min(200, ta.current.scrollHeight) + "px"; }
  }, [text]);

  const addFiles = async (files: FileList | File[]) => {
    const list = await Promise.all(Array.from(files).slice(0, 8).map(readFile));
    setAtts((a) => [...a, ...list]);
  };

  const submit = () => {
    if (busy || !text.trim()) return;
    const q = quote ?? (selected ? ({ kind: "artboard", artboardId: selected.id, label: selected.name } as Quote) : undefined);
    sendMessage({ text, attachments: atts, quote: q });
    setText(""); setAtts([]); setQuote(null);
  };

  return (
    <div
      className="relative px-3 pb-3 pt-1"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
    >
      <div className={cn("rounded-[28px] border bg-surface-container shadow-lg shadow-black/5 transition-all focus-within:border-primary/60 focus-within:shadow-primary/10", drag ? "border-primary bg-primary-container/40" : "border-outline-variant/70")}>
        {(quote || (selected && !quote)) && (
          <div className="px-2.5 pt-2.5">
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <QuoteCard compact q={quote ?? { kind: "artboard", artboardId: selected!.id, label: selected!.name }} />
              </div>
              <IconBtn label="Stop targeting this screen" size={28} onClick={() => (quote ? setQuote(null) : useStore.getState().setSel([]))}><X size={14} /></IconBtn>
            </div>
          </div>
        )}
        {atts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {atts.map((a) => (
              <span key={a.id} className="anim-pop flex items-center gap-1.5 rounded-full bg-surface-high py-1 pl-2.5 pr-1 text-xs font-medium">
                {a.dataUrl ? <img src={a.dataUrl} className="size-5 rounded object-cover" /> : <FileText size={13} />}
                <span className="max-w-32 truncate">{a.name}</span>
                <button onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))} className="grid size-5 place-items-center rounded-full hover:bg-surface-highest"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ta} value={text} rows={1} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); addFiles(f); } }}
          placeholder={selected ? `Reply about “${selected.name}”…` : "Describe a screen, flow or app to design…"}
          className="block max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant/60"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <Dropdown up width={270} trigger={({ toggle }) => <IconBtn label="Add" size={36} onClick={toggle}><Plus size={19} /></IconBtn>}>
            {(close) => (
              <>
                <MenuItem icon={<Paperclip size={16} />} label="Attach files" desc="Images, specs, code" onClick={() => { fileRef.current?.click(); close(); }} />
                <MenuItem icon={<ImageIcon size={16} />} label="Add reference screenshot" desc="Paste or drop images too" onClick={() => { fileRef.current?.click(); close(); }} />
                <MenuItem icon={<FolderOpen size={16} />} label={ws ? `Project: ${ws.name}` : "Open project folder…"} desc={ws ? "Browse files to add as context" : "Let Zeus read & edit your codebase"} onClick={() => { patchUI({ leftTab: "files" }); close(); if (!ws) openWorkspace().then((w) => w && patchUI({ workspace: w })).catch((e) => useStore.getState().notify(e.message)); }} />
                <MenuItem icon={<MessageSquarePlus size={16} />} label="Start new chat" onClick={() => { useStore.getState().newConversation(); close(); }} />
              </>
            )}
          </Dropdown>
          <Dropdown up width={290} trigger={({ toggle }) => (
            <button onClick={toggle} title="Design system" className="state flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-on-surface-variant">
              <Palette size={15} /><span className="hidden max-w-[90px] truncate min-[470px]:inline">{ds.name}</span>
            </button>
          )}>
            {(close) => (
              <>
                <MenuLabel>Design system</MenuLabel>
                {DESIGN_SYSTEMS.map((d) => (
                  <MenuItem key={d.id} label={d.name} desc={d.tagline} active={d.id === dsId} icon={<span className="size-4 rounded-full" style={{ background: `linear-gradient(135deg,${d.tokens.primary},${d.tokens.tertiary})` }} />} onClick={() => { patch({ designSystemId: d.id }); close(); }} />
                ))}
                <MenuItem icon={<ChevronRight size={15} />} label="Browse library & skills…" onClick={() => { patchUI({ settingsOpen: true, settingsTab: "library" }); close(); }} />
              </>
            )}
          </Dropdown>
          <span className="flex-1" />
          <EffortSelector />
          <ModelSelector />
          {busy ? (
            <button onClick={stopGeneration} title="Stop" className="state morph ml-1 grid size-10 place-items-center rounded-full bg-primary text-on-primary"><Square size={14} fill="currentColor" /></button>
          ) : (
            <button onClick={submit} disabled={!text.trim()} title="Send (Enter)" className="state morph ml-1 grid size-10 place-items-center rounded-[16px] bg-primary text-on-primary transition-all disabled:rounded-full disabled:bg-surface-highest disabled:text-on-surface-variant"><ArrowUp size={19} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Files (workspace) panel                                             */
/* ------------------------------------------------------------------ */
function Tree({ nodes, depth = 0, onPick }: { nodes: FileNode[]; depth?: number; onPick: (n: FileNode) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div>
      {nodes.map((n) => (
        <div key={n.path}>
          <button
            onClick={() => (n.dir ? setOpen((o) => ({ ...o, [n.path]: !o[n.path] })) : onPick(n))}
            className="state flex w-full items-center gap-2 rounded-xl py-1.5 pr-2 text-left text-[13px] text-on-surface"
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {n.dir ? <Folder size={15} className="shrink-0 text-primary" /> : <FileText size={15} className="shrink-0 text-on-surface-variant" />}
            <span className="truncate">{n.name}</span>
          </button>
          {n.dir && open[n.path] && n.children && <Tree nodes={n.children} depth={depth + 1} onPick={onPick} />}
        </div>
      ))}
    </div>
  );
}

function FilesPanel() {
  const ws = useStore((s) => s.ui.workspace);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const open = () => openWorkspace().then((w) => w && patchUI({ workspace: w })).catch((e) => notify(e.message));
  if (!ws) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <div className="mx-auto mb-4 grid size-20 place-items-center rounded-[32%] bg-tertiary-container text-on-tertiary-container"><FolderTree size={34} /></div>
          <h3 className="font-display text-xl font-semibold">Connect your codebase</h3>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-on-surface-variant">Open a local project folder so Zeus can read your code, match your design tokens, and sync live screens straight into real files.</p>
          <button onClick={open} className="state morph mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary"><FolderOpen size={18} /> Open folder</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-2">
        <FolderOpen size={16} className="text-primary" /><span className="flex-1 truncate text-sm font-semibold">{ws.name}</span>
        <IconBtn label="Open another folder" size={32} onClick={open}><Plus size={16} /></IconBtn>
        <IconBtn label="Disconnect" size={32} onClick={() => patchUI({ workspace: null })}><X size={16} /></IconBtn>
      </div>
      <p className="px-4 pb-2 text-xs text-on-surface-variant">Click a file to attach it as context for the next message.</p>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        <Tree nodes={ws.tree} onPick={async (n) => {
          try {
            const text = await readWorkspaceFile(ws, n.path);
            window.dispatchEvent(new CustomEvent("zeus:attach", { detail: { id: n.path, name: n.path, mime: "text/plain", size: text.length, text } }));
            patchUI({ leftTab: "chat" }); notify(`Attached ${n.name}`);
          } catch { notify("Can't read that file"); }
        }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chat pane                                                           */
/* ------------------------------------------------------------------ */
export function ChatPane() {
  const conv = useStore(activeConv);
  const convs = useStore((s) => s.conversations);
  const leftTab = useStore((s) => s.ui.leftTab);
  const patchUI = useStore((s) => s.patchUI);
  const { newConversation, setActiveConv, deleteConv, setTitle } = useStore.getState();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = conv.messages[conv.messages.length - 1];

  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [conv.messages.length, last?.text, last?.artboardIds?.length]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] bg-surface">
      {/* header */}
      <div className="flex items-center gap-1 px-3 pb-1 pt-3">
        <Dropdown width={330} trigger={({ toggle }) => (
          <button onClick={toggle} className="state flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5">
            <span className="max-w-[210px] truncate font-display text-[17px] font-semibold text-on-surface">{conv.title}</span>
            <ChevronDown size={15} className="shrink-0 text-on-surface-variant" />
          </button>
        )}>
          {(close) => (
            <>
              <MenuLabel>Conversations</MenuLabel>
              {convs.map((c) => (
                <MenuItem key={c.id} icon={<History size={15} />} label={c.title} desc={`${c.messages.length} messages`} active={c.id === conv.id}
                  right={<span onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }} className="grid size-7 place-items-center rounded-full hover:bg-surface-highest"><Trash2 size={13} /></span>}
                  onClick={() => { setActiveConv(c.id); close(); }} />
              ))}
              <MenuItem icon={<Pencil2 />} label="Rename current…" onClick={() => { const t = prompt("Chat title", conv.title); if (t) setTitle(conv.id, t); close(); }} />
            </>
          )}
        </Dropdown>
        <span className="flex-1" />
        <IconBtn label="New chat" onClick={() => newConversation()}><MessageSquarePlus size={19} /></IconBtn>
        <IconBtn label="Hide chat" onClick={() => patchUI({ chatCollapsed: true })}><PanelLeftClose size={19} /></IconBtn>
      </div>
      <div className="flex gap-1 px-4 pb-2">
        {([["chat", "Chat", <MessageSquare size={14} key="c" />], ["files", "Project files", <FolderTree size={14} key="f" />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => patchUI({ leftTab: id })} className={cn("state flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-all", leftTab === id ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant")}>{icon}{label}</button>
        ))}
      </div>

      {leftTab === "files" ? <FilesPanel /> : (
        <div ref={scroller} onScroll={(e) => { const t = e.currentTarget; stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80; }} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3">
          {conv.messages.length === 0 ? <Welcome /> : conv.messages.map((m) => <MessageView key={m.id} m={m} />)}
        </div>
      )}
      <Composer />
    </div>
  );
}

const Pencil2 = () => <Sparkles size={15} />;

function Welcome() {
  const ideas = ["Android banking app home screen", "Settings page for a podcast app", "Pricing page for a dev-tool SaaS", "Onboarding flow with 3 variants"];
  return (
    <div className="anim-fade flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="grid size-16 place-items-center rounded-[34%] bg-primary text-on-primary" style={{ animation: "bolt 3s ease-in-out infinite" }}><Zap size={30} fill="currentColor" /></div>
      <div>
        <h2 className="font-display text-[26px] font-bold tracking-tight">Design with Zeus</h2>
        <p className="mx-auto mt-1 max-w-[300px] text-sm text-on-surface-variant">Chat on the left, watch live screens appear on the canvas. Pin comments on any screen to iterate.</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        {ideas.map((i) => (
          <button key={i} onClick={() => sendMessage({ text: "Design a " + i.toLowerCase() })} className="state morph rounded-[20px] bg-surface-container px-4 py-3 text-left text-sm font-medium text-on-surface">{i}</button>
        ))}
      </div>
    </div>
  );
}
