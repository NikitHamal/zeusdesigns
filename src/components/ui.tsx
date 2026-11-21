import { cloneElement, isValidElement, memo, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";

/* ---------- IconBtn ---------- */
export function IconBtn({ children, label, onClick, active, className, size = 40, disabled, tonal }: {
  children: ReactNode; label: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; className?: string; size?: number; disabled?: boolean; tonal?: boolean;
}) {
  return (
    <button
      title={label} aria-label={label} onClick={onClick} disabled={disabled} style={{ width: size, height: size }}
      className={cn(
        "state morph grid place-items-center rounded-full text-on-surface-variant shrink-0 outline-none",
        active && "bg-secondary-container text-on-secondary-container rounded-[14px]",
        tonal && !active && "bg-surface-high",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Dropdown: portal menu, flips and clamps to the viewport so it can never be clipped ---------- */
export function Dropdown({ trigger, children, up, align = "left", className, width = 260 }: {
  trigger: (o: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  up?: boolean; align?: "left" | "right" | "center"; className?: string; width?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number; w: number } | null>(null);

  const place = useCallback(() => {
    const t = ref.current?.getBoundingClientRect();
    const m = menu.current;
    if (!t || !m) return;
    const pad = 8, gap = 6, vw = window.innerWidth, vh = window.innerHeight;
    const want = typeof width === "number" ? width : m.offsetWidth;
    const w = Math.min(want, vw - pad * 2);
    const h = m.scrollHeight;
    const below = vh - t.bottom - pad - gap, above = t.top - pad - gap;
    const flipUp = up ? above >= Math.min(h, 220) || above >= below : below < Math.min(h, 220) && above > below;
    const maxH = Math.max(120, flipUp ? above : below);
    const eff = Math.min(h, maxH);
    let left = align === "right" ? t.right - w : align === "center" ? t.left + t.width / 2 - w / 2 : t.left;
    left = Math.max(pad, Math.min(left, vw - w - pad));
    setPos({ left, top: flipUp ? t.top - gap - eff : t.bottom + gap, maxH, w });
  }, [align, up, width]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    const again = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(again); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!ref.current?.contains(n) && !menu.current?.contains(n)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", h);
    document.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("pointerdown", h); document.removeEventListener("keydown", k, true); };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && createPortal(
        <div
          ref={menu}
          style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.w ?? (typeof width === "number" ? width : undefined), maxHeight: pos?.maxH ?? "70vh", visibility: pos ? "visible" : "hidden" }}
          className="anim-fade z-[400] overflow-y-auto overflow-x-hidden rounded-[20px] border border-outline-variant bg-surface-container p-1.5"
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function MenuItem({ icon, label, desc, onClick, active, danger, right }: {
  icon?: ReactNode; label: string; desc?: string; onClick?: () => void; active?: boolean; danger?: boolean; right?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "state w-full flex items-center gap-3 rounded-[16px] px-3 py-2 text-left text-sm text-on-surface",
        active && "bg-secondary-container text-on-secondary-container", danger && "text-error",
      )}
    >
      {icon && <span className="grid place-items-center w-6 shrink-0 text-base">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-medium truncate">{label}</span>
        {desc && <span className="block text-xs text-on-surface-variant truncate">{desc}</span>}
      </span>
      {right}
      {active && <Icon name="check" size={16} className="shrink-0" />}
    </button>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/80">{children}</div>
);

/* ---------- Dialog: portal, always fits the window; content scrolls instead of clipping ---------- */
export function Dialog({ open, onClose, children, className, title }: { open: boolean; onClose: () => void; children: ReactNode; className?: string; title?: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="anim-fade fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        style={{ maxHeight: "calc(100vh - 32px)", maxWidth: "calc(100vw - 32px)" }}
        className={cn("anim-pop relative flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-outline-variant bg-surface text-on-surface", className)}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-2">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <IconBtn label="Close" onClick={onClose}><Icon name="close" size={20} /></IconBtn>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Segmented ---------- */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label?: string; icon?: ReactNode; title?: string }[] }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-surface-high p-1">
      {options.map((o) => (
        <button
          key={o.id} title={o.title ?? o.label} onClick={() => onChange(o.id)}
          className={cn(
            "state flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium text-on-surface-variant transition-all",
            value === o.id && "bg-primary text-on-primary ",
          )}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Thumb: scaled static preview of an artboard ---------- */
export const Thumb = memo(function Thumb({ html, w, h, width, className }: { html: string; w: number; h: number; width: number; className?: string }) {
  const sc = width / w;
  return (
    <div style={{ width, height: h * sc }} className={cn("overflow-hidden relative bg-white", className)}>
      <iframe
        title="preview" srcDoc={html} sandbox="" tabIndex={-1}
        style={{ width: w, height: h, transform: `scale(${sc})`, transformOrigin: "0 0", border: 0, pointerEvents: "none" }}
      />
    </div>
  );
});

/* ---------- Markdown (small, dependency-free) ---------- */
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!; out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>); }
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      nodes.push(<pre key={k++}><code>{buf.join("\n")}</code></pre>);
    } else if (/^#{1,3}\s/.test(l)) {
      const lvl = l.match(/^#+/)![0].length;
      const C = (["h1", "h2", "h3"] as const)[lvl - 1];
      nodes.push(<C key={k++}>{inline(l.replace(/^#+\s/, ""), `h${k}`)}</C>); i++;
    } else if (/^\s*[-*]\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s/, ""));
      nodes.push(<ul key={k++}>{items.map((it, j) => <li key={j}>{inline(it, `u${k}${j}`)}</li>)}</ul>);
    } else if (/^\s*\d+\.\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s/, ""));
      nodes.push(<ol key={k++}>{items.map((it, j) => <li key={j}>{inline(it, `o${k}${j}`)}</li>)}</ol>);
    } else if (l.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      nodes.push(<blockquote key={k++}>{inline(buf.join(" "), `q${k}`)}</blockquote>);
    } else if (!l.trim()) i++;
    else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[i])) buf.push(lines[i++]);
      nodes.push(<p key={k++}>{inline(buf.join(" "), `p${k}`)}</p>);
    }
  }
  return <div className="md text-[14.5px] text-on-surface select-text">{nodes}</div>;
}

/* ---------- Toggle ---------- */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn("relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors", on ? "bg-primary border-primary" : "bg-surface-highest border-outline")}
    >
      <span className={cn("absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-300 ease-spring", on ? "left-[24px] size-6 bg-on-primary" : "left-[6px] size-4 bg-outline")} />
    </button>
  );
}

export function withClick(node: ReactNode, fn: () => void) {
  return isValidElement(node) ? cloneElement(node as React.ReactElement<{ onClick?: () => void }>, { onClick: fn }) : node;
}
