import { useEffect, useRef, useState } from "react";
import { activeConv, useStore } from "../store";
import type { Attachment, FileNode, Message, Quote } from "../types";
import { sendMessage, stopGeneration } from "../lib/engine";
import { EFFORTS, findProvider, PROVIDERS } from "../lib/providers";
import { DESIGN_SYSTEMS, getDS } from "../lib/designSystems";
import { focusArtboard } from "../lib/actions";
import { nativeMemory, openWorkspace, readWorkspaceFile } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, Markdown, MenuItem, MenuLabel, Thumb } from "./ui";
import { Icon } from "./Icon";

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
          {q.kind === "pin" ? <><Icon name="push_pin" size={11} /> Pinned comment</> : <><Icon name="chat_bubble" size={11} /> Screen</>}
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
        <Icon name="build" size={14} className="text-primary" />
        <span className="font-mono font-medium">{t.name}</span>
        <span className="min-w-0 flex-1 truncate text-on-surface-variant">{t.args}</span>
        {t.status === "running" ? <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : t.status === "ok" ? <Icon name="check" size={14} className="text-primary" /> : <Icon name="error" size={14} className="text-error" />}
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
    <div className="anim-pop group flex gap-3">
      <Icon name="auto_awesome" size={20} fill className="mt-1 text-primary" />
      <div className="min-w-0 flex-1 space-y-2.5">
        {m.tools && m.tools.length > 0 && <div className="space-y-1.5">{m.tools.map((t) => <ToolChip key={t.id} t={t} />)}</div>}
        {m.text ? <div className={cn(m.streaming && "caret")}><Markdown text={m.text} /></div> : m.streaming && (
          <div className="flex items-center gap-2 py-1.5 text-sm text-on-surface-variant"><span className="flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="size-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 120}ms` }} />)}</span> Thinking…</div>
        )}
        {m.artboardIds && m.artboardIds.length > 0 && <ArtboardCards ids={m.artboardIds} />}
        {m.error && <div className="flex items-start gap-2 rounded-2xl bg-error-container px-3 py-2 text-[13px] text-on-error-container"><Icon name="error" size={15} className="mt-0.5 shrink-0" /><span className="select-text">{m.error}</span></div>}
        {!m.streaming && (
          <div className="flex items-center gap-1 text-xs text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100">
            <IconBtn label="Copy" size={28} onClick={() => { navigator.clipboard.writeText(m.text); notify("Copied"); }}><Icon name="content_copy" size={13} /></IconBtn>
            <IconBtn label="Retry" size={28} onClick={() => retry(m)}><Icon name="refresh" size={13} /></IconBtn>
            <IconBtn label="Remember this" size={28} onClick={async () => { const v = m.text.slice(0, 240); const l = await nativeMemory.add(v); if (l) useStore.getState().patchSettings({ memory: l.reverse() }); else addMemory(v); notify("Saved to Memory"); }}><Icon name="bookmark_add" size={13} /></IconBtn>
            {m.model && <span className="ml-1">{m.model}</span>}
            {m.stats?.tps ? <span className="rounded-full bg-surface-high px-2 py-0.5 font-medium text-on-surface-variant">{m.stats.tps.toLocaleString()} tok/s</span> : null}
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
        <Icon name={custom ? "key" : prov.icon} size={17} />
        <span className="max-w-[130px] truncate">{label}</span>
        <Icon name="expand_more" size={14} />
      </button>
    )}>
      {(close) => (
        <>
          <MenuLabel>Free models</MenuLabel>
          {PROVIDERS.filter((p) => p.role !== "title").map((p) => (
            <div key={p.id}>
              {p.models.map((m) => (
                <MenuItem
                  key={m.id} active={settings.providerId === p.id && settings.modelId === m.id}
                  icon={<Icon name={p.icon} size={18} />} label={`${m.label}`} desc={`${p.name} · ${p.speed}${m.note ? " · " + m.note : ""}`}
                  right={m.reasoning ? <Icon name="psychology" size={13} className="text-on-surface-variant" /> : undefined}
                  onClick={() => { patch({ providerId: p.id, modelId: m.id }); close(); }}
                />
              ))}
            </div>
          ))}
          <MenuLabel>Instant</MenuLabel>
          <MenuItem icon={<Icon name="rocket_launch" size={18} />} label="ChatJimmy · Llama 3.1 8B" desc="20,000+ tok/s" onClick={() => { patch({ providerId: "chatjimmy", modelId: "llama3.1-8b" }); close(); }} active={settings.providerId === "chatjimmy"} />
          <MenuLabel>Your API keys</MenuLabel>
          {settings.customProviders.map((c) => (
            <MenuItem key={c.id} icon={<Icon name="key" size={15} />} label={c.model} desc={`${c.name} · ${c.format}`} active={settings.providerId === `custom:${c.id}`} onClick={() => { patch({ providerId: `custom:${c.id}`, modelId: c.model }); close(); }} />
          ))}
          <MenuItem icon={<Icon name="add" size={15} />} label="Add OpenAI / Anthropic endpoint…" onClick={() => { patchUI({ settingsOpen: true, settingsTab: "providers" }); close(); }} />
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
        <Icon name="psychology" size={14} /> {EFFORTS.find((e) => e.id === effort)?.label}
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

export function Composer({ hero }: { hero?: boolean }) {
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
    if (!hero) return;
    const f = (e: Event) => { setText((e as CustomEvent<string>).detail); ta.current?.focus(); };
    window.addEventListener("zeus:prefill", f);
    return () => window.removeEventListener("zeus:prefill", f);
  }, [hero]);
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
    if (hero) useStore.getState().patchUI({ showCanvas: false });
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
      <div className={cn("rounded-[28px] border bg-surface-container   transition-all focus-within:border-primary/60 ", drag ? "border-primary bg-primary-container/40" : "border-outline-variant/70")}>
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
          placeholder={hero ? "How can I help you design today?" : selected ? `Reply about “${selected.name}”` : "Reply"}
          className={hero ? "block max-h-[260px] min-h-[84px] w-full resize-none bg-transparent px-5 pb-1 pt-5 text-[16px] text-on-surface outline-none placeholder:text-on-surface-variant/60" : "block max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant/60"}
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <Dropdown up width={270} trigger={({ toggle }) => <IconBtn label="Add" size={36} onClick={toggle}><Icon name="add" size={19} /></IconBtn>}>
            {(close) => (
              <>
                <MenuItem icon={<Icon name="attach_file" size={16} />} label="Attach files" onClick={() => { fileRef.current?.click(); close(); }} />
                <MenuItem icon={<Icon name="image" size={16} />} label="Add reference screenshot" onClick={() => { fileRef.current?.click(); close(); }} />
                <MenuItem icon={<Icon name="folder_open" size={16} />} label={ws ? `Project: ${ws.name}` : "Open project folder…"} onClick={() => { patchUI({ leftTab: "files" }); close(); if (!ws) openWorkspace().then((w) => w && patchUI({ workspace: w })).catch((e) => useStore.getState().notify(e.message)); }} />
                
              </>
            )}
          </Dropdown>
          <Dropdown up width={290} trigger={({ toggle }) => (
            <button onClick={toggle} title="Design system" className="state flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-on-surface-variant">
              <Icon name="palette" size={15} /><span className="hidden max-w-[90px] truncate min-[470px]:inline">{ds.name}</span>
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
          <span className="flex-1" />
          <EffortSelector />
          <ModelSelector />
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
            {n.dir ? <Icon name="folder" size={15} className="shrink-0 text-primary" /> : <Icon name="description" size={15} className="shrink-0 text-on-surface-variant" />}
            <span className="truncate">{n.name}</span>
          </button>
          {n.dir && open[n.path] && n.children && <Tree nodes={n.children} depth={depth + 1} onPick={onPick} />}
        </div>
      ))}
    </div>
  );
}

export function FilesPanel() {
  const ws = useStore((s) => s.ui.workspace);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const open = () => openWorkspace().then((w) => w && patchUI({ workspace: w })).catch((e) => notify(e.message));
  if (!ws) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <button onClick={open} className="state morph inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-medium text-on-primary"><Icon name="folder_open" size={20} /> Open folder</button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-2">
        <Icon name="folder_open" size={18} className="text-primary" /><span className="flex-1 truncate text-sm font-medium">{ws.name}</span>
        <IconBtn label="Open another folder" size={32} onClick={open}><Icon name="add" size={18} /></IconBtn>
        <IconBtn label="Disconnect" size={32} onClick={() => patchUI({ workspace: null })}><Icon name="close" size={18} /></IconBtn>
      </div>
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
  const leftTab = useStore((s) => s.ui.leftTab);
  const patchUI = useStore((s) => s.patchUI);
  const setTitle = useStore((s) => s.setTitle);
  const [editing, setEditing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = conv.messages[conv.messages.length - 1];

  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [conv.messages.length, last?.text, last?.artboardIds?.length]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        {editing ? (
          <input
            autoFocus defaultValue={conv.title} spellCheck={false}
            onBlur={(e) => { if (e.target.value.trim()) setTitle(conv.id, e.target.value.trim()); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
            className="h-9 min-w-0 flex-1 rounded-xl bg-surface-container px-3 font-display text-[16px] font-medium outline-none ring-2 ring-primary/50"
          />
        ) : (
          <button onClick={() => setEditing(true)} title="Rename" className="state flex min-w-0 items-center gap-1.5 rounded-xl px-3 py-1.5">
            <span className="truncate font-display text-[16px] font-medium text-on-surface">{conv.title}</span>
            <Icon name="edit" size={15} className="shrink-0 text-on-surface-variant" />
          </button>
        )}
        <span className="flex-1" />
        <IconBtn label={leftTab === "files" ? "Back to chat" : "Project files"} size={36} active={leftTab === "files"} onClick={() => patchUI({ leftTab: leftTab === "files" ? "chat" : "files" })}><Icon name="account_tree" size={20} /></IconBtn>
        <IconBtn label="Hide chat" size={36} onClick={() => patchUI({ chatCollapsed: true })}><Icon name="left_panel_close" size={20} /></IconBtn>
      </div>
      {leftTab === "files" ? <FilesPanel /> : (
        <div ref={scroller} onScroll={(e) => { const t = e.currentTarget; stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80; }} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3">
          {conv.messages.map((m) => <MessageView key={m.id} m={m} />)}
        </div>
      )}
      <Composer />
    </div>
  );
}
