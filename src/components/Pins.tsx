import { useState } from "react";
import { Check, MessageSquarePlus, Send, Sparkles, Trash2, X } from "lucide-react";
import { useStore } from "../store";
import type { Pin } from "../types";
import { sendMessage } from "../lib/engine";
import { cn } from "../utils/cn";
import { IconBtn } from "./ui";

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
      className={cn("anim-pop absolute left-11 -top-2 w-[320px] rounded-[26px] bg-surface-container border border-outline-variant/60 shadow-2xl shadow-black/25 text-on-surface cursor-default", className)}
    >
      {children}
    </div>
  );
}

export function PinView({ pin, z }: { pin: Pin; z: number }) {
  const ab = useStore((s) => s.artboards.find((a) => a.id === pin.artboardId));
  const open = useStore((s) => s.ui.openPinId === pin.id);
  const patchUI = useStore((s) => s.patchUI);
  const { updatePin, addComment, removePin, busy } = useStore.getState();
  const [text, setText] = useState("");
  const x = (ab?.x ?? 0) + pin.x, y = (ab?.y ?? 0) + pin.y;
  const send = () => {
    const t = text.trim();
    if (!t) return;
    addComment(pin.id, { author: "user", text: t });
    setText("");
  };
  const ask = () => {
    const mine = pin.comments.filter((c) => c.author === "user").map((c) => c.text).join("\n");
    addComment(pin.id, { author: "zeus", text: "Sent to Zeus — revising this screen…" });
    patchUI({ openPinId: null });
    sendMessage({
      text: mine || "Please address this comment.",
      quote: { kind: "pin", pinId: pin.id, artboardId: pin.artboardId, label: ab?.name ?? "Canvas", text: pin.comments[0]?.text },
    });
  };
  return (
    <div className="absolute" style={{ left: x, top: y, transform: `scale(${1 / z})`, transformOrigin: "0 0", zIndex: open ? 40 : 30 }}>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => patchUI({ openPinId: open ? null : pin.id })}
        className={cn(
          "absolute -translate-x-1/2 -translate-y-full grid place-items-center size-9 rounded-full rounded-bl-[6px] font-bold text-sm shadow-lg transition-transform ease-spring duration-300 hover:scale-110",
          pin.resolved ? "bg-surface-highest text-on-surface-variant" : "bg-primary text-on-primary",
          open && "scale-110 ring-4 ring-primary/25",
        )}
        style={{ left: 0, top: 0 }}
      >
        {pin.resolved ? <Check size={16} /> : pin.n}
      </button>
      {open && (
        <Card className="-translate-y-full -mt-0" >
          <div className="flex items-center gap-2 px-4 pt-3">
            <span className="text-sm font-semibold">Comment {pin.n}</span>
            <span className="truncate rounded-full bg-secondary-container px-2.5 py-0.5 text-xs text-on-secondary-container">{ab?.name ?? "Canvas"}</span>
            <span className="flex-1" />
            <IconBtn label={pin.resolved ? "Reopen" : "Resolve"} size={30} onClick={() => updatePin(pin.id, { resolved: !pin.resolved })} active={pin.resolved}><Check size={15} /></IconBtn>
            <IconBtn label="Delete" size={30} onClick={() => removePin(pin.id)}><Trash2 size={15} /></IconBtn>
            <IconBtn label="Close" size={30} onClick={() => patchUI({ openPinId: null })}><X size={15} /></IconBtn>
          </div>
          <div className="max-h-52 space-y-2 overflow-auto px-4 py-3">
            {pin.comments.map((c) => (
              <div key={c.id} className={cn("rounded-[18px] px-3 py-2 text-[13.5px] select-text", c.author === "user" ? "bg-primary-container text-on-primary-container" : "bg-surface-high text-on-surface-variant")}>
                <div className="mb-0.5 text-[11px] font-semibold opacity-70">{c.author === "user" ? "You" : "⚡ Zeus"}</div>
                {c.text}
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2 px-3 pb-3">
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Reply…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="min-h-10 flex-1 resize-none rounded-[18px] bg-surface-high px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <IconBtn label="Reply" size={40} onClick={send}><Send size={16} /></IconBtn>
          </div>
          <div className="px-3 pb-3">
            <button onClick={ask} disabled={busy} className="state morph flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-on-primary">
              <Sparkles size={15} /> Ask Zeus to apply this
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

export function PinDraft({ x, y, artboardId, z, onDone }: { x: number; y: number; artboardId?: string; z: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const ab = useStore((s) => s.artboards.find((a) => a.id === artboardId));
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    const pin = useStore.getState().addPin({ artboardId, x, y }, t);
    useStore.getState().patchUI({ openPinId: pin.id });
    onDone();
  };
  return (
    <div className="absolute" style={{ left: (ab?.x ?? 0) + x, top: (ab?.y ?? 0) + y, transform: `scale(${1 / z})`, transformOrigin: "0 0", zIndex: 50 }}>
      <div className="absolute -translate-x-1/2 -translate-y-full grid place-items-center size-9 rounded-full rounded-bl-[6px] bg-primary text-on-primary shadow-lg animate-[pulse-ring_1.2s_ease-out_infinite]">
        <MessageSquarePlus size={16} />
      </div>
      <Card className="-translate-y-full">
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-on-surface-variant">
            <span className="font-semibold text-on-surface">New comment</span>
            <span className="truncate rounded-full bg-secondary-container px-2 py-0.5 text-on-secondary-container">{ab?.name ?? "Canvas"}</span>
          </div>
          <textarea
            autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What should change here?"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") onDone(); }}
            className="w-full resize-none rounded-[18px] bg-surface-high px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={onDone} className="state rounded-full px-4 py-2 text-sm font-medium text-on-surface-variant">Cancel</button>
            <button onClick={submit} disabled={!text.trim()} className="state morph rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary">Comment</button>
          </div>
        </div>
      </Card>
    </div>
  );
}
