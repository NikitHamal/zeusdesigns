import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Circle, Frame, Hand, Loader2, MessageCirclePlus, MousePointer2, Pencil, Send, Shapes, Sparkles, Square, StickyNote, Star, Triangle, Type, Minus, X,
} from "lucide-react";
import { useStore } from "../store";
import type { ShapeKind, Tool } from "../types";
import { sendMessage } from "../lib/engine";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn } from "./ui";

const SHAPES: { id: ShapeKind; icon: React.ReactNode; label: string }[] = [
  { id: "rect", icon: <Square size={18} />, label: "Rectangle" },
  { id: "ellipse", icon: <Circle size={18} />, label: "Ellipse" },
  { id: "triangle", icon: <Triangle size={18} />, label: "Triangle" },
  { id: "star", icon: <Star size={18} />, label: "Star" },
  { id: "line", icon: <Minus size={18} />, label: "Line" },
  { id: "arrow", icon: <ArrowRight size={18} />, label: "Arrow" },
];

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
  { id: "select", icon: <MousePointer2 size={19} />, label: "Select", key: "V" },
  { id: "hand", icon: <Hand size={19} />, label: "Pan (hold Space)", key: "H" },
  { id: "frame", icon: <Frame size={19} />, label: "Frame — draw a blank screen", key: "F" },
  { id: "text", icon: <Type size={19} />, label: "Text", key: "T" },
  { id: "note", icon: <StickyNote size={19} />, label: "Sticky note", key: "N" },
  { id: "pen", icon: <Pencil size={19} />, label: "Freehand pen", key: "P" },
];

export function BottomToolbar() {
  const tool = useStore((s) => s.tool);
  const shape = useStore((s) => s.shape);
  const setTool = useStore((s) => s.setTool);
  const setShape = useStore((s) => s.setShape);
  const sel = useStore((s) => s.sel);
  const boards = useStore((s) => s.artboards);
  const busy = useStore((s) => s.busy);
  const target = boards.find((b) => sel.includes(b.id));
  const [ask, setAsk] = useState(false);
  const [text, setText] = useState("");
  const [variant, setVariant] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (ask) input.current?.focus(); }, [ask]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setAsk(true); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({
      text: t,
      quote: target ? { kind: "artboard", artboardId: target.id, label: target.name } : undefined,
      asVariant: variant,
    });
    setText("");
    setAsk(false);
  };
  const ShapeIcon = SHAPES.find((s) => s.id === shape)!.icon;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface-container p-1.5 shadow-2xl shadow-black/20 ring-1 ring-outline-variant/50 transition-all">
        {!ask && (
          <>
            {TOOLS.slice(0, 2).map((t) => (
              <IconBtn key={t.id} label={`${t.label} (${t.key})`} active={tool === t.id} onClick={() => setTool(t.id)}>{t.icon}</IconBtn>
            ))}
            <span className="mx-0.5 h-6 w-px bg-outline-variant" />
            {TOOLS.slice(2).map((t) => (
              <IconBtn key={t.id} label={`${t.label} (${t.key})`} active={tool === t.id} onClick={() => setTool(t.id)}>{t.icon}</IconBtn>
            ))}
            <Dropdown up align="center" width={216} trigger={({ toggle }) => (
              <IconBtn label="Shapes (S)" active={tool === "shape"} onClick={() => { if (tool === "shape") toggle(); else { setShape(shape); } }}>
                {tool === "shape" ? ShapeIcon : <Shapes size={19} />}
              </IconBtn>
            )}>
              {(close) => (
                <div className="grid grid-cols-3 gap-1 p-1">
                  {SHAPES.map((s) => (
                    <button key={s.id} title={s.label} onClick={() => { setShape(s.id); close(); }} className={cn("state grid h-12 place-items-center rounded-2xl text-on-surface", shape === s.id && "bg-secondary-container text-on-secondary-container")}>{s.icon}</button>
                  ))}
                </div>
              )}
            </Dropdown>
            <IconBtn label="Pin a comment (C)" active={tool === "pin"} onClick={() => setTool("pin")}><MessageCirclePlus size={19} /></IconBtn>
            <span className="mx-0.5 h-6 w-px bg-outline-variant" />
          </>
        )}
        {ask ? (
          <div className="flex w-[min(680px,70vw)] items-center gap-1.5 pl-3 anim-fade">
            <Sparkles size={18} className="shrink-0 text-primary" />
            {target ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-container px-2.5 py-1 text-xs font-semibold text-on-primary-container">
                {target.name}
              </span>
            ) : <span className="shrink-0 rounded-full bg-surface-highest px-2.5 py-1 text-xs font-semibold text-on-surface-variant">Canvas</span>}
            <input
              ref={input} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAsk(false); }}
              placeholder={target ? "Make this…  e.g. “bolder hero, rounder cards”" : "Ask Zeus to design something…"}
              className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60"
            />
            {target && (
              <button onClick={() => setVariant((v) => !v)} title="Create as a new variant instead of editing in place" className={cn("state shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", variant ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-highest text-on-surface-variant")}>
                {variant ? "New variant" : "Edit in place"}
              </button>
            )}
            <button onClick={submit} disabled={!text.trim() || busy} className="state morph grid size-10 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            </button>
            <IconBtn label="Close" size={40} onClick={() => setAsk(false)}><X size={18} /></IconBtn>
          </div>
        ) : (
          <button onClick={() => setAsk(true)} title="Ask Zeus (Ctrl+K)" className="state morph flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary">
            <Sparkles size={16} /> Ask Zeus
            {target && <span className="max-w-24 truncate rounded-full bg-on-primary/20 px-2 py-0.5 text-[11px]">{target.name}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
