import { useState } from "react";
import { useStore } from "../store";
import type { MemoryCategory, MemoryItem } from "../types";
import { addMemory, CATEGORIES, clearMemory, editWithAI, removeMemory, updateMemory } from "../lib/memory";
import { Toggle } from "./ui";
import { Icon } from "./Icon";
import { cn } from "../utils/cn";

const ago = (t: number) => {
  if (!t) return "";
  const d = Math.max(0, Date.now() - t), m = Math.floor(d / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const dd = Math.floor(h / 24);
  return dd < 14 ? `${dd} day${dd > 1 ? "s" : ""} ago` : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function ItemRow({ m }: { m: MemoryItem }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(m.text);
  return (
    <div className="group flex items-start gap-3 border-b border-outline-variant/60 py-3 last:border-b-0">
      {edit ? (
        <textarea autoFocus value={v} rows={2} onChange={(e) => setV(e.target.value)}
          onBlur={() => { void updateMemory(m.id, v); setEdit(false); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } if (e.key === "Escape") { setV(m.text); setEdit(false); } }}
          className="min-h-[56px] flex-1 resize-none rounded-xl border border-primary bg-transparent px-3 py-2 text-sm outline-none" />
      ) : (
        <button onClick={() => setEdit(true)} className="min-w-0 flex-1 select-text text-left text-sm leading-relaxed text-on-surface">{m.text}</button>
      )}
      <span className="shrink-0 pt-0.5 text-xs text-on-surface-variant">{ago(m.at)}</span>
      <button title="Forget" aria-label="Forget" onClick={() => void removeMemory(m.id)} className="state grid size-7 shrink-0 place-items-center rounded-lg text-on-surface-variant opacity-0 group-hover:opacity-100"><Icon name="delete" size={15} /></button>
    </div>
  );
}

export function MemoryTab() {
  const mem = useStore((s) => s.settings.memory);
  const on = useStore((s) => s.settings.memoryOn);
  const learn = useStore((s) => s.settings.learnOn);
  const patch = useStore((s) => s.patchSettings);
  const notify = useStore((s) => s.notify);
  const [open, setOpen] = useState<MemoryCategory | null>(null);
  const [add, setAdd] = useState("");
  const [ask, setAsk] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const inCat = (c: MemoryCategory) => mem.filter((m) => (m.category ?? "preferences") === c && (!q.trim() || m.text.toLowerCase().includes(q.trim().toLowerCase())));
  const meta = CATEGORIES.find((c) => c.id === open);

  const submit = async () => {
    const t = ask.trim();
    if (!t || busy) return;
    setBusy(true);
    try { notify(await editWithAI(t) || "Done"); setAsk(""); } catch (e) { notify((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-6">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setOpen(null)} className={cn("state flex items-center gap-1.5 rounded-lg px-1.5 py-1", open ? "text-on-surface-variant" : "text-on-surface")}>
            {open && <Icon name="arrow_back" size={16} />}Zeus's memory
          </button>
          {meta && <><span className="text-on-surface-variant">/</span><span className="font-medium text-on-surface">{meta.label}</span></>}
        </div>

        {open === null ? (
          <>
            <div className="flex items-center gap-4 rounded-xl border border-outline-variant px-4 py-3">
              <div className="min-w-0 flex-1"><div className="text-sm font-medium text-on-surface">Use memory in every chat</div></div>
              <Toggle on={on} onChange={(v) => patch({ memoryOn: v })} />
            </div>
            <div className={cn("flex items-center gap-4 rounded-xl border border-outline-variant px-4 py-3", !on && "opacity-50")}>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium text-on-surface">Learn from my messages</div></div>
              <Toggle on={learn && on} onChange={(v) => on && patch({ learnOn: v })} />
            </div>
            {mem.length > 2 && (
              <div className="relative">
                <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memory" className="h-10 w-full rounded-xl border border-outline-variant bg-transparent pl-9 pr-3 text-sm outline-none focus:border-primary" />
              </div>
            )}
            {CATEGORIES.map((c) => {
              const l = inCat(c.id);
              return (
                <section key={c.id}>
                  <h4 className="mb-1 text-sm font-semibold text-on-surface">{c.label}</h4>
                  <button onClick={() => setOpen(c.id)} className="state flex w-full items-center gap-4 border-y border-outline-variant/60 px-1 py-3 text-left">
                    <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">{l.length ? l[0].text : c.blurb}</span>
                    <span className="shrink-0 text-xs text-on-surface-variant">{l.length ? `${l.length} · ${ago(l[0].at)}` : "Empty"}</span>
                    <Icon name="chevron_right" size={16} className="shrink-0 text-on-surface-variant" />
                  </button>
                </section>
              );
            })}
            {mem.length > 0 && <button onClick={() => void clearMemory()} className="state h-9 rounded-lg px-3 text-[13px] font-medium text-error">Forget everything</button>}
          </>
        ) : (
          <div>
            {inCat(open).length === 0 && <div className="py-8 text-center text-sm text-on-surface-variant">Nothing here yet</div>}
            {inCat(open).map((m) => <ItemRow key={m.id} m={m} />)}
            <div className="mt-3 flex gap-2">
              <input value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && add.trim()) { void addMemory(add, open); setAdd(""); } }} placeholder="Add a line" className="h-10 flex-1 rounded-xl border border-outline-variant bg-transparent px-3 text-sm outline-none focus:border-primary" />
              <button disabled={!add.trim()} onClick={() => { void addMemory(add, open); setAdd(""); }} className="state h-10 rounded-xl bg-on-surface px-4 text-sm font-medium text-surface">Add</button>
            </div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 bg-surface px-6 pb-6 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container py-1.5 pl-5 pr-1.5 focus-within:border-primary">
          <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Tell Zeus what to change" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-on-surface-variant" />
          <button onClick={submit} disabled={!ask.trim() || busy} aria-label="Apply" className="state grid size-9 place-items-center rounded-full bg-on-surface text-surface">
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-surface border-t-transparent" /> : <Icon name="arrow_upward" size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
