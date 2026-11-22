import { quiet } from "../lib/harness";
import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Artboard } from "../types";
import { DEVICE_SIZE } from "../types";
import { cn } from "../utils/cn";
import { Dialog, IconBtn, Segmented, Thumb } from "./ui";
import { ExportMenu } from "./ExportMenu";
import { Icon } from "./Icon";
import { hasCustomScript, ShadowFrame } from "../lib/shadowRenderer";

function usePageBoards() {
  const pageId = useStore((s) => s.activePageId);
  const all = useStore((s) => s.artboards);
  return useMemo(() => all.filter((a) => a.pageId === pageId), [all, pageId]);
}

/* ---------------- Grid ---------------- */
export function GridView() {
  const boards = usePageBoards();
  const sel = useStore((s) => s.sel);
  const setSel = useStore((s) => s.setSel);
  const setView = useStore((s) => s.setView);
  if (!boards.length) return <div className="grid h-full place-items-center text-on-surface-variant">No screens on this page yet.</div>;
  return (
    <div className="h-full overflow-auto p-6 pt-20">
      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {boards.map((a, i) => {
          const width = a.device === "web" ? 360 : 230;
          return (
            <div
              key={a.id} onClick={() => setSel([a.id])} onDoubleClick={() => { setSel([a.id]); setView("single"); }}
              style={{ animationDelay: `${i * 40}ms` }}
              className={cn("anim-pop group cursor-pointer rounded-[28px] bg-surface-container p-3 transition-all hover:-translate-y-1", sel.includes(a.id) && "ring-[3px] ring-primary")}
            >
              <div className="flex justify-center overflow-hidden rounded-[20px]"><Thumb html={a.html} w={a.w} h={a.h} width={width} /></div>
              <div className="mt-2.5 flex items-center justify-between px-1">
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-on-surface">{a.name}</div><div className="text-xs text-on-surface-variant">{DEVICE_SIZE[a.device].label} · v{a.version}</div></div>
                <ExportMenu a={a} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Single ---------------- */
export function SingleView() {
  const boards = usePageBoards();
  const sel = useStore((s) => s.sel);
  const setSel = useStore((s) => s.setSel);
  const idx = Math.max(0, boards.findIndex((b) => sel.includes(b.id)));
  const a = boards[idx];
  if (!a) return <div className="grid h-full place-items-center text-on-surface-variant">No screens on this page yet.</div>;
  const avail = Math.max(300, window.innerHeight - 280);
  const sc = Math.min(1, avail / a.h);
  const go = (d: number) => setSel([boards[(idx + d + boards.length) % boards.length].id]);
  return (
    <div className="flex h-full flex-col items-center pt-20">
      <div className="flex flex-1 items-center gap-4 overflow-auto px-6">
        <IconBtn label="Previous" tonal onClick={() => go(-1)} size={48}><Icon name="chevron_left"  /></IconBtn>
        <div key={a.id} className="anim-pop overflow-hidden bg-white ring-1 ring-black/10" style={{ width: a.w * sc, height: a.h * sc, borderRadius: a.device === "mobile" ? 38 * sc : 14 }}>
          {hasCustomScript(a.html) ? (
            <iframe title={a.name} srcDoc={quiet(a.html)} sandbox="allow-scripts allow-forms allow-popups" style={{ width: a.w, height: a.h, border: 0, transform: `scale(${sc})`, transformOrigin: "0 0" }} />
          ) : (
            <ShadowFrame html={a.html} w={a.w} h={a.h} scale={sc} interactive />
          )}
        </div>
        <IconBtn label="Next" tonal onClick={() => go(1)} size={48}><Icon name="chevron_right"  /></IconBtn>
      </div>
      <div className="flex w-full items-center justify-center gap-2 overflow-auto px-6 pb-24 pt-3">
        {boards.map((b) => (
          <button key={b.id} onClick={() => setSel([b.id])} className={cn("state shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold", b.id === a.id ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant")}>{b.name}</button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Compare ---------------- */
function Pane({ a, scale, bare }: { a: Artboard; scale: number; bare?: boolean }) {
  return (
    <div className={cn("overflow-hidden bg-white", !bare && " ring-1 ring-black/10")} style={{ width: a.w * scale, height: a.h * scale, borderRadius: bare ? 0 : a.device === "mobile" ? 30 : 10 }}>
      <ShadowFrame html={a.html} w={a.w} h={a.h} scale={scale} interactive />
    </div>
  );
}

export function CompareDialog() {
  const ids = useStore((s) => s.ui.compare);
  const patchUI = useStore((s) => s.patchUI);
  const boards = usePageBoards();
  const [mode, setMode] = useState<"side" | "overlay">("side");
  const [pos, setPos] = useState(50);
  if (!ids) return null;
  const [ia, ib] = ids;
  const a = boards.find((b) => b.id === ia) ?? boards[0];
  const b = boards.find((x) => x.id === ib) ?? boards[1] ?? boards[0];
  if (!a || !b) return null;
  const availH = window.innerHeight - 260;
  const sc = (x: Artboard) => Math.min(1, availH / x.h, (window.innerWidth * 0.8) / 2 / x.w);
  const Select = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-full bg-surface-high px-3 text-sm font-medium text-on-surface outline-none">
      {boards.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
  return (
    <Dialog open onClose={() => patchUI({ compare: null })} title="Compare screens" className="h-[92vh] w-[92vw]">
      <div className="flex items-center gap-3 px-6 pb-3">
        <Select value={a.id} onChange={(v) => patchUI({ compare: [v, b.id] })} />
        <span className="text-on-surface-variant">vs</span>
        <Select value={b.id} onChange={(v) => patchUI({ compare: [a.id, v] })} />
        <span className="flex-1" />
        <Segmented value={mode} onChange={setMode} options={[{ id: "side", label: "Side by side", icon: <Icon name="view_column_2" size={14} /> }, { id: "overlay", label: "Slider", icon: <Icon name="layers" size={14} /> }]} />
      </div>
      <div className="flex flex-1 items-center justify-center gap-10 overflow-auto bg-surface-dim px-6 py-6">
        {mode === "side" ? (
          <>
            <div className="text-center"><Pane a={a} scale={sc(a)} /><div className="mt-3 text-sm font-semibold">{a.name}</div></div>
            <div className="text-center"><Pane a={b} scale={sc(b)} /><div className="mt-3 text-sm font-semibold">{b.name}</div></div>
          </>
        ) : (
          <div className="text-center">
            <div className="relative overflow-hidden rounded-2xl  ring-1 ring-black/10" style={{ width: a.w * sc(a), height: a.h * sc(a) }}>
              <Pane a={a} scale={sc(a)} bare />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}><Pane a={b} scale={sc(a)} bare /></div>
              <div className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-primary" style={{ left: `${pos}%` }}><span className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary " /></div>
            </div>
            <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(+e.target.value)} className="mt-4 w-72 accent-[var(--m-primary)]" />
            <div className="text-xs text-on-surface-variant">{a.name} / {b.name}</div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
