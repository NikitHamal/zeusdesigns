import { useEffect, useState } from "react";
import { useStore } from "../store";
import { editor, useEditor } from "../lib/editor";
import type { Quote } from "../types";
import { cn } from "../utils/cn";
import { IconBtn } from "./ui";
import { Icon } from "./Icon";

const toHex = (c: string): string => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c);
  if (!m) return "#000000";
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
};
const isClear = (c: string) => c === "transparent" || /rgba\(\s*\d+[,\s]+\d+[,\s]+\d+[,\s]+0\s*\)/.test(c);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-outline-variant px-4 py-3">
      <h4 className="mb-2.5 text-[12px] font-semibold text-on-surface-variant">{title}</h4>
      {children}
    </section>
  );
}

function Num({ label, value, onChange, min = 0, max = 999, step = 1, auto }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; auto?: boolean;
}) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-xl bg-surface-high px-2.5 text-[12px] text-on-surface-variant focus-within:ring-2 focus-within:ring-primary/50">
      <span className="w-4 shrink-0 font-medium">{label}</span>
      <input
        type="number" min={min} max={max} step={step} value={auto ? "" : Math.round(value * 100) / 100} placeholder={auto ? "auto" : undefined}
        onChange={(e) => e.target.value !== "" && onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-full min-w-0 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant/60"
      />
    </label>
  );
}

function Color({ label, value, onChange, onClear }: { label: string; value: string; onChange: (hex: string) => void; onClear?: () => void }) {
  const clear = isClear(value);
  const hex = toHex(value);
  return (
    <div className="flex h-9 items-center gap-2 rounded-xl bg-surface-high pl-1.5 pr-1 text-[12px] text-on-surface-variant">
      <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-outline-variant" style={{ background: clear ? "repeating-conic-gradient(var(--m-surface-highest) 0% 25%, var(--m-surface) 0% 50%) 50% / 8px 8px" : hex }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="font-mono text-[11px] text-on-surface">{clear ? "none" : hex}</span>
      {onClear && !clear && <IconBtn label="Clear" size={26} onClick={onClear}><Icon name="close" size={14} /></IconBtn>}
    </div>
  );
}

const WEIGHTS = [[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"], [800, "Extra bold"]] as const;

export function Inspector() {
  const editId = useStore((s) => s.ui.editId);
  const sel = useEditor((s) => s.sel);
  const canUndo = useEditor((s) => s.stack.length > 0);
  const board = useStore((s) => s.artboards.find((a) => a.id === editId));
  const [text, setText] = useState("");
  const key = sel ? sel.path.join(".") + sel.tag : "";
  useEffect(() => { setText(sel?.text ?? ""); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editId || !board) return null;
  const s = sel?.s;
  const flex = !!s && /flex|grid/.test(s.display);

  const askZeus = () => {
    if (!sel) return;
    const q: Quote = { kind: "element", artboardId: board.id, label: `${sel.tag}${sel.cls ? "." + sel.cls.split(" ")[0] : ""}`, text: sel.html.replace(/\s+/g, " ").slice(0, 420) };
    useStore.getState().patchUI({ chatCollapsed: false });
    window.dispatchEvent(new CustomEvent("zeus:quote", { detail: q }));
  };

  return (
    <aside className="anim-pop pointer-events-auto absolute bottom-24 right-3 top-[68px] z-40 flex w-[284px] flex-col overflow-hidden rounded-[24px] border border-outline-variant bg-surface-container" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className="flex h-12 shrink-0 items-center gap-1 px-3">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-on-surface">{sel ? <><span className="font-mono">{sel.tag}</span>{sel.cls && <span className="text-on-surface-variant"> .{sel.cls.split(" ")[0]}</span>}</> : "Edit elements"}</span>
        <IconBtn label="Undo (Ctrl+Z)" size={32} disabled={!canUndo} onClick={() => editor.undo()}><Icon name="undo" size={18} /></IconBtn>
        <IconBtn label="Done" size={32} tonal onClick={() => editor.finish()}><Icon name="check" size={18} /></IconBtn>
      </header>

      {!sel || !s ? (
        <div className="grid flex-1 place-items-center px-8 text-center text-[14px] text-on-surface-variant">Click any element on the screen</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center gap-1 px-3 pb-3">
            <IconBtn label="Select parent (Alt+Up)" size={34} tonal onClick={editor.parent}><Icon name="arrow_upward" size={18} /></IconBtn>
            <IconBtn label="Move up" size={34} tonal onClick={() => editor.move(-1)}><Icon name="keyboard_arrow_up" size={20} /></IconBtn>
            <IconBtn label="Move down" size={34} tonal onClick={() => editor.move(1)}><Icon name="keyboard_arrow_down" size={20} /></IconBtn>
            <IconBtn label="Duplicate (Ctrl+D)" size={34} tonal onClick={editor.duplicate}><Icon name="content_copy" size={17} /></IconBtn>
            <IconBtn label="Delete (Del)" size={34} tonal onClick={editor.del}><Icon name="delete" size={18} /></IconBtn>
            <span className="flex-1" />
            <IconBtn label="Ask Zeus about this element" size={34} active onClick={askZeus}><Icon name="auto_awesome" size={18} fill /></IconBtn>
          </div>

          {sel.text !== null && (
            <Section title="Text">
              <textarea
                value={text} rows={3}
                onChange={(e) => { setText(e.target.value); editor.text(e.target.value); }}
                className="w-full resize-none rounded-xl bg-surface-high px-3 py-2 text-[13px] text-on-surface outline-none focus:ring-2 focus:ring-primary/50"
              />
            </Section>
          )}

          {sel.text !== null && (
            <Section title="Type">
              <div className="grid grid-cols-2 gap-2">
                <Num label="Aa" value={s.fs} min={8} max={200} onChange={(v) => editor.style({ "font-size": v + "px" })} />
                <select
                  value={String(Math.round(Number(s.fw) / 100) * 100)} onChange={(e) => editor.style({ "font-weight": e.target.value })}
                  className="h-9 rounded-xl bg-surface-high px-2.5 text-[13px] text-on-surface outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {WEIGHTS.map(([w, n]) => <option key={w} value={w}>{n}</option>)}
                </select>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex gap-0.5 rounded-full bg-surface-high p-0.5">
                  {([["left", "format_align_left"], ["center", "format_align_center"], ["right", "format_align_right"]] as const).map(([v, ic]) => (
                    <IconBtn key={v} label={`Align ${v}`} size={30} active={s.ta === v || (v === "left" && s.ta === "start")} onClick={() => editor.style({ "text-align": v })}><Icon name={ic} size={17} /></IconBtn>
                  ))}
                </div>
                <div className="min-w-0 flex-1"><Color label="Color" value={s.color} onChange={(c) => editor.style({ color: c })} /></div>
              </div>
            </Section>
          )}

          <Section title="Fill">
            <div className="space-y-2">
              <Color label="Background" value={s.bg} onChange={(c) => editor.style({ "background-color": c, "background-image": "none" })} onClear={() => editor.style({ "background-color": "transparent", "background-image": "none" })} />
              <div className="flex h-9 items-center gap-3 rounded-xl bg-surface-high px-3 text-[12px] text-on-surface-variant">
                <span className="w-12 shrink-0 font-medium">Opacity</span>
                <input type="range" min={0} max={100} value={Math.round(s.op * 100)} onChange={(e) => editor.style({ opacity: String(Number(e.target.value) / 100) })} className="min-w-0 flex-1 accent-[var(--m-primary)]" />
                <span className="w-8 text-right font-mono text-[11px] text-on-surface">{Math.round(s.op * 100)}</span>
              </div>
            </div>
          </Section>

          <Section title="Border">
            <div className="grid grid-cols-2 gap-2">
              <Num label="R" value={s.br} max={999} onChange={(v) => editor.style({ "border-radius": v + "px" })} />
              <Num label="W" value={s.bw} max={40} onChange={(v) => editor.style({ "border-width": v + "px", "border-style": v ? "solid" : "none" })} />
            </div>
            {s.bw > 0 && <div className="mt-2"><Color label="Border color" value={s.bc} onChange={(c) => editor.style({ "border-color": c })} /></div>}
          </Section>

          <Section title="Size">
            <div className="grid grid-cols-2 gap-2">
              <Num label="W" value={s.w} auto={s.autoW} max={4000} onChange={(v) => editor.style({ width: v + "px" })} />
              <Num label="H" value={s.h} auto={s.autoH} max={4000} onChange={(v) => editor.style({ height: v + "px" })} />
            </div>
            {(!s.autoW || !s.autoH) && (
              <button onClick={() => editor.style({ width: "", height: "" })} className="state mt-2 h-8 rounded-full px-3 text-[12px] font-medium text-primary">Reset size</button>
            )}
          </Section>

          <Section title="Spacing">
            <div className="grid grid-cols-2 gap-2">
              <Num label="T" value={s.pt} onChange={(v) => editor.style({ "padding-top": v + "px" })} />
              <Num label="R" value={s.pr} onChange={(v) => editor.style({ "padding-right": v + "px" })} />
              <Num label="B" value={s.pb} onChange={(v) => editor.style({ "padding-bottom": v + "px" })} />
              <Num label="L" value={s.pl} onChange={(v) => editor.style({ "padding-left": v + "px" })} />
            </div>
            {flex && (
              <div className="mt-2 flex items-center gap-2">
                <div className="min-w-0 flex-1"><Num label="G" value={s.gap} onChange={(v) => editor.style({ gap: v + "px" })} /></div>
                {/flex/.test(s.display) && (
                  <div className="flex gap-0.5 rounded-full bg-surface-high p-0.5">
                    <IconBtn label="Row" size={30} active={!/column/.test(s.fd)} onClick={() => editor.style({ "flex-direction": "row" })}><Icon name="arrow_forward" size={17} /></IconBtn>
                    <IconBtn label="Column" size={30} active={/column/.test(s.fd)} onClick={() => editor.style({ "flex-direction": "column" })}><Icon name="arrow_downward" size={17} /></IconBtn>
                  </div>
                )}
              </div>
            )}
          </Section>
          <div className={cn("h-3")} />
        </div>
      )}
    </aside>
  );
}
