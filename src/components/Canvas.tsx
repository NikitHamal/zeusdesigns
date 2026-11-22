import { quiet } from "../lib/harness";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import type { Artboard, CanvasEl, Device } from "../types";
import { DEVICE_SIZE } from "../types";
import { canvasApi } from "../lib/canvasApi";
import { NOTE_COLORS, INK_COLORS } from "../lib/actions";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, MenuItem, MenuLabel } from "./ui";
import { ExportMenu } from "./ExportMenu";
import { PinDraft, PinView } from "./Pins";
import { EmptyCanvas } from "./EmptyCanvas";
import { Icon } from "./Icon";
import { editor, editorBridge, injectEditor, useEditor } from "../lib/editor";
import { insertBlockIntoHtml } from "../lib/blocks";
import { getDS } from "../lib/designSystems";
import { hasCustomScript, ShadowFrame } from "../lib/shadowRenderer";

const DEFAULT_VP = { x: 140, y: 120, z: 0.7 };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const DEV_ICON = { mobile: "smartphone", tablet: "tablet", web: "desktop_windows" } as const;

/* ------------------------------------------------------------------ */
/* Artboard (Zero-iframe Shadow DOM by default; sandboxed iframe in edit mode) */
/* ------------------------------------------------------------------ */
const Frame = memo(function Frame({ id, w, h, html, interactive, editing, culled }: { id: string; w: number; h: number; html: string; interactive: boolean; editing: boolean; culled?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState(html);
  const emitted = useRef<string | null>(null);
  const needsIframe = editing || (interactive && hasCustomScript(html));

  // entering edit mode reloads the document with the editor runtime; outside changes (AI revise, undo) reload too
  useLayoutEffect(() => { if (editing) { emitted.current = null; setDoc(html); } }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (editing && html !== emitted.current) setDoc(html); }, [html, editing]);

  useEffect(() => {
    if (!editing) return;
    const onMsg = (e: MessageEvent) => {
      const win = ref.current?.contentWindow;
      const d = e.data;
      if (!win || e.source !== win || !d || d.zeus !== "edit") return;
      const ed = useEditor.getState();
      if (d.type === "ready") editorBridge.attach(win);
      else if (d.type === "select") ed.setSel(d.info);
      else if (d.type === "tree") ed.setTree(d.tree ?? []);
      else if (d.type === "undo") editor.undo();
      else if (d.type === "redo") editor.redo();
      else if (d.type === "html") {
        const cur = useStore.getState().artboards.find((x) => x.id === id);
        if (!cur || cur.html === d.html) return;
        ed.record(cur.html);
        emitted.current = d.html;
        useStore.getState().updateArtboard(id, { html: d.html });
      }
    };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); editorBridge.attach(null); };
  }, [editing, id]);

  if (culled && !editing && !interactive) {
    return <div style={{ width: w, height: h }} className="bg-surface-container/40" />;
  }

  if (!needsIframe) {
    return <ShadowFrame html={html} w={w} h={h} interactive={interactive} />;
  }

  const src = quiet(editing ? injectEditor(doc) : html);
  return (
    <iframe
      ref={ref} title="design" srcDoc={src} sandbox="allow-scripts allow-forms allow-popups allow-modals"
      style={{ width: "100%", height: "100%", border: 0, background: "#fff", pointerEvents: interactive || editing ? "auto" : "none" }}
    />
  );
});


/* ------------------------------------------------------------------ */
/* Architectural blueprint wireframe & tonal shimmer while designing   */
/* ------------------------------------------------------------------ */
function BlueprintWireframe({ w, h, device }: { w: number; h: number; device: Device }) {
  if (device === "web") {
    return (
      <div className="flex h-full w-full flex-col justify-between p-8" style={{ gap: 24 }}>
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div className="flex items-center gap-3">
            <div className="zc-bone h-7 w-7 rounded-lg" />
            <div className="zc-bone h-5 w-28 rounded-md" />
          </div>
          <div className="flex items-center gap-3">
            <div className="zc-bone h-4 w-16 rounded-md" />
            <div className="zc-bone h-4 w-16 rounded-md" />
            <div className="zc-bone h-9 w-28 rounded-full" />
          </div>
        </div>
        <div className="grid flex-1 grid-cols-12 gap-6">
          <div className="col-span-7 flex flex-col justify-center gap-4 rounded-3xl border border-outline-variant/30 bg-surface-high/35 p-7">
            <div className="zc-bone h-4 w-24 rounded-full" />
            <div className="zc-bone h-11 w-4/5 rounded-xl" />
            <div className="zc-bone h-11 w-3/5 rounded-xl" />
            <div className="zc-bone mt-2 h-4 w-2/3 rounded-md" />
            <div className="mt-3 flex gap-3">
              <div className="zc-bone h-11 w-36 rounded-full" />
              <div className="zc-bone h-11 w-28 rounded-full" />
            </div>
          </div>
          <div className="col-span-5 flex flex-col gap-4 rounded-3xl border border-outline-variant/30 bg-surface-high/25 p-6">
            <div className="flex items-center justify-between">
              <div className="zc-bone h-4 w-24 rounded-md" />
              <div className="zc-bone h-6 w-16 rounded-full" />
            </div>
            <div className="zc-bone h-9 w-36 rounded-lg" />
            <div className="zc-bone flex-1 rounded-2xl" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-outline-variant/30 bg-surface-high/25 p-5" style={{ width: "100%", height: Math.max(110, Math.round(h * 0.18)) }}>
              <div className="zc-bone h-4 w-24 rounded-md" />
              <div className="zc-bone h-7 w-32 rounded-lg" />
              <div className="zc-bone mt-auto h-3 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  void w;
  return (
    <div className="flex h-full w-full flex-col justify-between p-5">
      {/* Appbar */}
      <div className="flex items-center justify-between pt-2">
        <div className="zc-bone h-7 w-36 rounded-lg" />
        <div className="flex gap-2">
          <div className="zc-bone h-9 w-9 rounded-full" />
          <div className="zc-bone h-9 w-9 rounded-full" />
        </div>
      </div>
      {/* Hero card */}
      <div className="mt-4 flex flex-col gap-3 rounded-[26px] border border-outline-variant/35 bg-surface-high/40 p-5">
        <div className="zc-bone h-3.5 w-24 rounded-full" />
        <div className="zc-bone h-10 w-44 rounded-xl" />
        <div className="zc-bone h-2.5 w-full rounded-full" />
        <div className="mt-1 flex items-center justify-between">
          <div className="zc-bone h-4 w-28 rounded-md" />
          <div className="zc-bone h-9 w-28 rounded-full" />
        </div>
      </div>
      {/* Filter chips */}
      <div className="mt-4 flex gap-2">
        <div className="zc-bone h-8 w-16 rounded-full" />
        <div className="zc-bone h-8 w-20 rounded-full" />
        <div className="zc-bone h-8 w-20 rounded-full" />
        <div className="zc-bone h-8 w-16 rounded-full" />
      </div>
      {/* List rows */}
      <div className="mt-4 flex flex-1 flex-col gap-2.5 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-outline-variant/25 bg-surface-high/25 p-3.5">
            <div className="zc-bone h-11 w-11 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="zc-bone h-4 w-3/5 rounded-md" />
              <div className="zc-bone h-3 w-2/5 rounded-md" />
            </div>
            <div className="zc-bone h-5 w-12 rounded-full" />
          </div>
        ))}
      </div>
      {/* Bottom nav */}
      <div className="mt-4 flex items-center justify-around rounded-2xl border-t border-outline-variant/30 pt-3 pb-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="zc-bone h-7 w-14 rounded-full" />
            <div className="zc-bone h-2.5 w-10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DesigningFx({ a, radius }: { a: Artboard; radius: number }) {
  const loading = !!a.loading;
  const prev = useRef(loading);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (prev.current && !loading) { setDone(true); const t = setTimeout(() => setDone(false), 700); prev.current = loading; return () => clearTimeout(t); }
    prev.current = loading;
  }, [loading]);
  const empty = a.html.length < 500;
  if (!loading && !done) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" style={{ borderRadius: radius }}>
      {loading && (
        <div className="zc-skel" style={{ opacity: empty ? 1 : 0.18 }}>
          <BlueprintWireframe w={a.w} h={a.h} device={a.device} />
        </div>
      )}
      {loading && <div className="zc-sheen" />}
      <div className={cn("zc-border", done && "done")} style={{ borderRadius: radius }} />
      {loading && (
        <div className=" absolute inset-x-0 bottom-5 z-[4] flex justify-center">
          <div className="zc-pill rounded-full border border-outline-variant/60 bg-surface-container/95 px-4 py-1.5 text-[12.5px] font-medium">
            <span className="zshine">Designing {a.name}…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ArtboardView({ a, z, selected, interacting, editing, culled, tool, onMoveStart, onResizeStart }: {
  a: Artboard; z: number; selected: boolean; interacting: boolean; editing: boolean; culled?: boolean; tool: string;
  onMoveStart: (e: React.PointerEvent, id: string) => void; onResizeStart: (e: React.PointerEvent, id: string) => void;
}) {
  const { updateArtboard, duplicateArtboard, removeArtboards, patchUI, restoreVersion } = useStore.getState();
  const draggingBlockId = useEditor((st) => st.draggingBlockId);
  const [renaming, setRenaming] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const s = clamp(0.8 / z, 1, 4);
  const radius = a.device === "mobile" ? 38 : a.device === "tablet" ? 26 : 12;
  const selectable = tool === "select";
  const setDevice = (d: Device) => updateArtboard(a.id, { device: d, w: DEVICE_SIZE[d].w, h: DEVICE_SIZE[d].h });

  const onDropBlock = (e: React.DragEvent) => {
    const blockId = e.dataTransfer.getData("application/x-zeus-block");
    if (!blockId) return;
    e.preventDefault();
    e.stopPropagation();
    setDropOver(false);
    const st = useStore.getState();
    const ds = getDS(st.settings.designSystemId);
    const updated = insertBlockIntoHtml(a.html, blockId, ds, a.device);
    if (editing) {
      useEditor.getState().record(a.html);
      st.updateArtboard(a.id, { html: updated });
    } else {
      st.reviseArtboard(a.id, updated);
    }
    st.setSel([a.id]);
    st.notify(`Dropped component into ${a.name}`);
  };

  return (
    <div
      className="group absolute"
      style={{ left: a.x, top: a.y, width: a.w, pointerEvents: selectable ? "auto" : "none" }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-zeus-block")) {
          e.preventDefault();
          e.stopPropagation();
          setDropOver(true);
        }
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={onDropBlock}
    >
      {/* header */}
      <div
        className="absolute left-0 flex items-center gap-1.5 select-none"
        style={{ bottom: "100%", marginBottom: 6 * s, width: a.w / s, transform: `scale(${s})`, transformOrigin: "left bottom", height: 34 }}
        onPointerDown={(e) => { if (!selectable) return; e.stopPropagation(); if ((e.target as HTMLElement).closest("button,input")) return; onMoveStart(e, a.id); }}
        onDoubleClick={() => setRenaming(true)}
      >
        <Icon name={DEV_ICON[a.device]} size={14} className={selected ? "text-primary" : "text-on-surface-variant"} />
        {renaming ? (
          <input
            autoFocus defaultValue={a.name} onBlur={(e) => { updateArtboard(a.id, { name: e.target.value || a.name }); setRenaming(false); }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-7 w-40 rounded-lg bg-surface-high px-2 text-[13px] font-semibold text-on-surface outline-none ring-2 ring-primary"
          />
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-[13px] font-semibold", selected || editing ? "text-primary" : "text-on-surface-variant")}>
            {a.name}
            <span className="ml-1.5 font-mono text-[10.5px] font-normal opacity-65">{a.w}×{a.h}</span>
          </span>
        )}
        {(a.version > 1 || a.history.length > 0) && (
          <Dropdown width={220} trigger={({ toggle }) => (
            <button onClick={toggle} className="state rounded-full bg-surface-highest px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">v{a.version}</button>
          )}>
            {(close) => (
              <>
                <MenuLabel>Version history</MenuLabel>
                <MenuItem icon={<Icon name="history" size={15} />} label={`v${a.version} · current`} active />
                {a.history.map((_, i) => ({ i, v: i + 1 })).reverse().map(({ i, v }) => (
                  <MenuItem key={i} icon={<Icon name="history" size={15} />} label={`Restore v${v}`} onClick={() => { restoreVersion(a.id, i); close(); }} />
                ))}
              </>
            )}
          </Dropdown>
        )}
        {a.source && <span className="truncate rounded-full bg-tertiary-container px-2 py-0.5 text-[10px] font-semibold text-on-tertiary-container"><Icon name="sync_alt" size={12} className="mr-1" />{a.source}</span>}
        <div className={cn("shrink-0 items-center gap-0.5 rounded-full bg-surface-container p-0.5", selected || editing ? "flex" : "hidden group-hover:flex")}>
          <IconBtn label="Insert components" size={28} active={editing && useEditor.getState().tab === "insert"} onClick={() => {
            if (a.loading) return;
            if (!editing) {
              if (useEditor.getState().artboardId) editor.finish();
              useEditor.getState().begin(a.id, a.html, "insert");
              patchUI({ editId: a.id, interactId: null });
            } else {
              useEditor.getState().setTab("insert");
            }
            useEditor.getState().setInsertOpen(true);
            useStore.getState().setSel([a.id]);
            setTimeout(() => canvasApi.fit([a.id], { right: 310 }), 40);
          }}><Icon name="add" size={15} /></IconBtn>
          <IconBtn label={editing ? "Done editing" : "Edit elements & layers"} size={28} active={editing} onClick={() => {
            if (editing) { editor.finish(); return; }
            if (useEditor.getState().artboardId) editor.finish();
            if (a.loading) return;
            useEditor.getState().begin(a.id, a.html, "design");
            patchUI({ editId: a.id, interactId: null });
            useStore.getState().setSel([a.id]);
            setTimeout(() => canvasApi.fit([a.id], { right: 310 }), 40);
          }}><Icon name="ads_click" size={14} /></IconBtn>
          <IconBtn label={interacting ? "Stop interacting" : "Interact (double-click)"} size={28} active={interacting} onClick={() => { if (editing) editor.finish(); patchUI({ interactId: interacting ? null : a.id }); }}><Icon name="touch_app" size={14} /></IconBtn>
          <IconBtn label="Duplicate as variant" size={28} onClick={() => duplicateArtboard(a.id)}><Icon name="content_copy" size={14} /></IconBtn>
          <ExportMenu a={a} size={28} />
          <Dropdown width={220} align="right" trigger={({ toggle }) => <IconBtn label="More" size={28} onClick={toggle}><Icon name="more_horiz" size={14} /></IconBtn>}>
            {(close) => (
              <>
                <MenuItem icon={<Icon name="edit" size={15} />} label="Rename" onClick={() => { setRenaming(true); close(); }} />
                <MenuItem icon={<Icon name="compare" size={15} />} label="Compare with…" onClick={() => {
                  const others = useStore.getState().artboards.filter((x) => x.id !== a.id && x.pageId === a.pageId);
                  const other = others.find((x) => x.groupId === a.groupId) ?? others[others.length - 1];
                  if (!other) { useStore.getState().notify("Duplicate or generate another screen to compare"); } else patchUI({ compare: [a.id, other.id] });
                  close();
                }} />
                <MenuLabel>Device size</MenuLabel>
                {(["mobile", "tablet", "web"] as Device[]).map((d) => (
                  <MenuItem key={d} label={DEVICE_SIZE[d].label} desc={`${DEVICE_SIZE[d].w}×${DEVICE_SIZE[d].h}`} active={a.device === d} onClick={() => { setDevice(d); close(); }} />
                ))}
                <MenuItem icon={<Icon name="delete" size={15} />} danger label="Delete" onClick={() => { removeArtboards([a.id]); close(); }} />
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* body */}
      <div
        className={cn("relative overflow-hidden bg-surface-container transition-all", dropOver ? "ring-[4px] ring-primary" : selected ? "ring-[3px] ring-primary" : "ring-1 ring-outline-variant/60")}
        style={{ width: a.w, height: a.h, borderRadius: radius }}
      >
        <Frame id={a.id} w={a.w} h={a.h} html={a.html} interactive={interacting} editing={editing} culled={culled} />
        {selectable && !interacting && !editing && (
          <div
            className="absolute inset-0 cursor-default"
            onPointerDown={(e) => { e.stopPropagation(); onMoveStart(e, a.id); }}
            onDoubleClick={() => {
              if (a.loading) return;
              if (useEditor.getState().artboardId) editor.finish();
              useEditor.getState().begin(a.id, a.html, "design");
              useEditor.getState().setInsertOpen(true);
              patchUI({ editId: a.id, interactId: null });
              useStore.getState().setSel([a.id]);
            }}
          />
        )}
        {draggingBlockId && (
          <div
            className={cn(
              "absolute inset-0 z-10 grid place-items-center transition-colors",
              dropOver ? "bg-primary/15" : "bg-transparent"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropOver(true);
            }}
            onDragLeave={() => setDropOver(false)}
            onDrop={onDropBlock}
          >
            {dropOver && (
              <div className="pointer-events-none flex items-center gap-2 rounded-full border border-primary bg-surface-container px-4 py-2 text-xs font-semibold text-primary">
                <Icon name="add" size={16} />
                <span>Drop component into {a.name}</span>
              </div>
            )}
          </div>
        )}
        <DesigningFx a={a} radius={radius} />
      </div>
      {selected && selectable && (
        <div
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, a.id); }}
          className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-full border-2 border-primary bg-surface"
          style={{ transform: `scale(${1 / z})`, transformOrigin: "center" }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas elements (notes, text, shapes, pen)                          */
/* ------------------------------------------------------------------ */
function ShapeSvg({ el }: { el: CanvasEl }) {
  const { w, h, color, shape } = el;
  const common = { fill: "none", stroke: color, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const, vectorEffect: "non-scaling-stroke" as const };
  const fill = `color-mix(in srgb, ${color} 14%, transparent)`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      {shape === "rect" && <rect x={1.5} y={1.5} width={w - 3} height={h - 3} rx={Math.min(24, w / 5, h / 5)} {...common} fill={fill} />}
      {shape === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1.5} ry={h / 2 - 1.5} {...common} fill={fill} />}
      {shape === "triangle" && <polygon points={`${w / 2},2 ${w - 2},${h - 2} 2,${h - 2}`} {...common} fill={fill} />}
      {shape === "star" && <polygon points={Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.42 : 1; const an = -Math.PI / 2 + (i * Math.PI) / 5; return `${w / 2 + Math.cos(an) * r * (w / 2 - 2)},${h / 2 + Math.sin(an) * r * (h / 2 - 2)}`; }).join(" ")} {...common} fill={fill} />}
      {(shape === "line" || shape === "arrow") && el.points && (
        <>
          <defs><marker id={`ah-${el.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={color} /></marker></defs>
          <line x1={el.points[0][0]} y1={el.points[0][1]} x2={el.points[1][0]} y2={el.points[1][1]} {...common} markerEnd={shape === "arrow" ? `url(#ah-${el.id})` : undefined} />
        </>
      )}
    </svg>
  );
}

function penPath(pts: [number, number][]) {
  if (pts.length < 2) return `M${pts[0]?.[0] ?? 0} ${pts[0]?.[1] ?? 0}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0]} ${l[1]}`;
}

function ElementView({ el, z, selected, editing, setEditing, tool, onMoveStart, onResizeStart }: {
  el: CanvasEl; z: number; selected: boolean; editing: boolean; setEditing: (id: string | null) => void; tool: string;
  onMoveStart: (e: React.PointerEvent, id: string) => void; onResizeStart: (e: React.PointerEvent, id: string) => void;
}) {
  const { updateElement } = useStore.getState();
  const selectable = tool === "select";
  const style: React.CSSProperties = { left: el.x, top: el.y, width: el.w, height: el.h, pointerEvents: selectable ? "auto" : "none" };
  return (
    <div
      className={cn("absolute", selected && "outline outline-2 outline-offset-4 outline-primary/70 rounded-md")} style={style}
      onPointerDown={(e) => { if (!selectable || editing) return; e.stopPropagation(); onMoveStart(e, el.id); }}
      onDoubleClick={() => (el.kind === "note" || el.kind === "text") && setEditing(el.id)}
    >
      {el.kind === "note" && (
        <div className="flex h-full w-full flex-col rounded-[6px] rounded-br-[34px] p-3  " style={{ background: el.color, color: "#33290a" }}>
          <textarea
            value={el.text ?? ""} readOnly={!editing} autoFocus={editing} placeholder="Sticky note…"
            onChange={(e) => updateElement(el.id, { text: e.target.value })} onBlur={() => setEditing(null)}
            className="h-full w-full resize-none bg-transparent text-[17px] leading-snug outline-none placeholder:text-black/30"
            style={{ pointerEvents: editing ? "auto" : "none", fontFamily: "var(--font-display)" }}
          />
        </div>
      )}
      {el.kind === "text" && (
        <textarea
          value={el.text ?? ""} readOnly={!editing} autoFocus={editing} placeholder="Type something"
          onChange={(e) => updateElement(el.id, { text: e.target.value, h: Math.max(40, e.target.scrollHeight) })} onBlur={() => setEditing(null)}
          className="h-full w-full resize-none overflow-hidden bg-transparent font-display text-[32px] font-semibold leading-tight outline-none placeholder:text-on-surface-variant/40"
          style={{ color: el.color, pointerEvents: editing ? "auto" : "none" }}
        />
      )}
      {el.kind === "shape" && <ShapeSvg el={el} />}
      {el.kind === "pen" && el.points && (
        <svg width={el.w} height={el.h} className="overflow-visible"><path d={penPath(el.points)} fill="none" stroke={el.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>
      )}
      {selected && selectable && el.kind !== "pen" && (
        <div
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, el.id); }}
          className="absolute -bottom-3 -right-3 size-3.5 cursor-nwse-resize rounded-full border-2 border-primary bg-surface"
          style={{ transform: `scale(${1 / z})` }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Infinite canvas                                                     */
/* ------------------------------------------------------------------ */
export function InfiniteCanvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const pageId = useStore((s) => s.activePageId);
  const vp = useStore((s) => s.viewport[pageId]) ?? DEFAULT_VP;
  const tool = useStore((s) => s.tool);
  const sel = useStore((s) => s.sel);
  const interactId = useStore((s) => s.ui.interactId);
  const editId = useStore((s) => s.ui.editId);
  const allBoards = useStore((s) => s.artboards);
  const allEls = useStore((s) => s.elements);
  const allPins = useStore((s) => s.pins);
  const boards = useMemo(() => allBoards.filter((a) => a.pageId === pageId), [allBoards, pageId]);
  const els = useMemo(() => allEls.filter((a) => a.pageId === pageId), [allEls, pageId]);
  const pins = useMemo(() => allPins.filter((a) => a.pageId === pageId), [allPins, pageId]);
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const [space, setSpace] = useState(false);
  const [draft, setDraft] = useState<{ kind: "frame" | "shape" | "pen"; x0: number; y0: number; x1: number; y1: number; pts: [number, number][] } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number; artboardId?: string } | null>(null);
  const [panning, setPanning] = useState(false);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [ctxMenu, setCtxMenu] = useState<{ cx: number; cy: number; wx: number; wy: number; boardId?: string } | null>(null);

  const setVp = useCallback((v: { x: number; y: number; z: number }) => useStore.getState().setViewport(pageId, v), [pageId]);
  const toWorld = useCallback((cx: number, cy: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
  }, []);

  /* register imperative API */
  useEffect(() => {
    canvasApi.screenToWorld = toWorld;
    canvasApi.viewCenter = () => {
      const r = rootRef.current!.getBoundingClientRect();
      return toWorld(r.left + r.width / 2, r.top + r.height / 2);
    };
    canvasApi.fit = (ids, inset) => {
      const st = useStore.getState();
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const bs = st.artboards.filter((a) => a.pageId === st.activePageId && (!ids || ids.includes(a.id)));
      const es = ids ? [] : st.elements.filter((a) => a.pageId === st.activePageId);
      const items = [...bs, ...es];
      if (!items.length) { st.setViewport(st.activePageId, DEFAULT_VP); return; }
      const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y));
      const x1 = Math.max(...items.map((i) => i.x + i.w)), y1 = Math.max(...items.map((i) => i.y + i.h));
      const pad = 90;
      const aw = r.width - (inset?.right ?? 0);
      const z = clamp(Math.min((aw - pad * 2) / (x1 - x0), (r.height - pad * 2 - 60) / (y1 - y0)), 0.08, 1);
      st.setViewport(st.activePageId, { z, x: (aw - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - 60 - (y1 - y0) * z) / 2 - y0 * z + 20 });
    };
    canvasApi.zoomBy = (f) => {
      const r = rootRef.current!.getBoundingClientRect();
      const v = vpRef.current;
      const nz = clamp(v.z * f, 0.05, 3);
      const cx = r.width / 2, cy = r.height / 2;
      setVp({ z: nz, x: cx - (cx - v.x) * (nz / v.z), y: cy - (cy - v.y) * (nz / v.z) });
    };
    canvasApi.reset = () => setVp(DEFAULT_VP);
  }, [toWorld, setVp]);

  /* wheel: pan / ctrl-zoom */
  useEffect(() => {
    const el = rootRef.current!;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const v = vpRef.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const nz = clamp(v.z * Math.exp(-e.deltaY * 0.01), 0.05, 3);
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        setVp({ z: nz, x: cx - (cx - v.x) * (nz / v.z), y: cy - (cy - v.y) * (nz / v.z) });
      } else {
        setVp({ ...v, x: v.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) });
      }
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [setVp]);

  /* keyboard */
  useEffect(() => {
    const typing = (e: KeyboardEvent) => ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const st = useStore.getState();
      if (e.code === "Space") { setSpace(true); e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "0") { e.preventDefault(); canvasApi.fit(); }
        if (e.key === "d") { e.preventDefault(); st.sel.forEach((id) => st.duplicateArtboard(id)); }
        if (e.key === "=" || e.key === "+") { e.preventDefault(); canvasApi.zoomBy(1.2); }
        if (e.key === "-") { e.preventDefault(); canvasApi.zoomBy(1 / 1.2); }
        return;
      }
      const map: Record<string, () => void> = {
        v: () => st.setTool("select"), h: () => st.setTool("hand"), t: () => st.setTool("text"), f: () => st.setTool("frame"),
        n: () => st.setTool("note"), p: () => st.setTool("pen"), s: () => st.setTool("shape"), c: () => st.setTool("pin"),
        i: () => { useEditor.getState().setTab("insert"); useEditor.getState().setInsertOpen(!useEditor.getState().insertOpen); },
        Enter: () => {
          if (st.ui.editId || st.sel.length !== 1) return;
          const b = st.artboards.find((a) => a.id === st.sel[0] && a.pageId === st.activePageId);
          if (!b || b.loading) return;
          useEditor.getState().begin(b.id, b.html, "design");
          useEditor.getState().setInsertOpen(true);
          st.patchUI({ editId: b.id, interactId: null });
          setTimeout(() => canvasApi.fit([b.id], { right: 310 }), 40);
        },
        Escape: () => { if (st.ui.editId) editor.finish(); useEditor.getState().setInsertOpen(false); st.setTool("select"); st.setSel([]); st.patchUI({ interactId: null, openPinId: null }); setDraftPin(null); setCtxMenu(null); },
        Delete: () => { st.removeArtboards(st.sel); st.removeElements(st.sel); },
        Backspace: () => { st.removeArtboards(st.sel); st.removeElements(st.sel); },
        "1": () => canvasApi.fit(), "2": () => st.sel.length && canvasApi.fit(st.sel),
      };
      map[e.key]?.();
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  /* move / resize with Figma-style smart alignment snapping */
  const onMoveStart = useCallback((e: React.PointerEvent, id: string) => {
    const st = useStore.getState();
    if (e.button !== 0) return;
    let ids = st.sel;
    if (e.shiftKey) ids = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
    else if (!ids.includes(id)) ids = [id];
    st.setSel(ids);
    if (st.ui.interactId && st.ui.interactId !== id) st.patchUI({ interactId: null });
    const start = { x: e.clientX, y: e.clientY };
    const origA = new Map(st.artboards.filter((a) => ids.includes(a.id)).map((a) => [a.id, { x: a.x, y: a.y, w: a.w, h: a.h }]));
    const origE = new Map(st.elements.filter((a) => ids.includes(a.id)).map((a) => [a.id, { x: a.x, y: a.y, w: a.w, h: a.h }]));
    const others = [
      ...st.artboards.filter((a) => a.pageId === st.activePageId && !ids.includes(a.id)),
      ...st.elements.filter((a) => a.pageId === st.activePageId && !ids.includes(a.id)),
    ];
    const primaryOrig = origA.get(id) ?? origE.get(id);
    let moved = false;
    const mv = (ev: PointerEvent) => {
      const z = vpRef.current.z;
      let dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z;
      if (!moved && Math.hypot(dx, dy) * z < 3) return;
      moved = true;
      let gx: number | undefined;
      let gy: number | undefined;
      if (primaryOrig && !ev.altKey && others.length > 0) {
        const thresh = 8 / z;
        const nx = primaryOrig.x + dx, ny = primaryOrig.y + dy;
        const xPts = [nx, nx + primaryOrig.w / 2, nx + primaryOrig.w];
        const yPts = [ny, ny + primaryOrig.h / 2, ny + primaryOrig.h];
        for (const o of others) {
          const oxs = [o.x, o.x + o.w / 2, o.x + o.w];
          const oys = [o.y, o.y + o.h / 2, o.y + o.h];
          for (const xp of xPts) {
            for (const ox of oxs) {
              if (Math.abs(xp - ox) < thresh) { dx += ox - xp; gx = ox; break; }
            }
            if (gx !== undefined) break;
          }
          for (const yp of yPts) {
            for (const oy of oys) {
              if (Math.abs(yp - oy) < thresh) { dy += oy - yp; gy = oy; break; }
            }
            if (gy !== undefined) break;
          }
        }
      }
      setGuides({ x: gx, y: gy });
      useStore.setState((s) => ({
        artboards: s.artboards.map((a) => (origA.has(a.id) ? { ...a, x: Math.round(origA.get(a.id)!.x + dx), y: Math.round(origA.get(a.id)!.y + dy) } : a)),
        elements: s.elements.map((a) => (origE.has(a.id) ? { ...a, x: Math.round(origE.get(a.id)!.x + dx), y: Math.round(origE.get(a.id)!.y + dy) } : a)),
      }));
    };
    const upH = () => { setGuides({}); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upH); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", upH);
  }, []);

  const onResizeStart = useCallback((e: React.PointerEvent, id: string) => {
    const st = useStore.getState();
    const a = st.artboards.find((x) => x.id === id);
    const el = st.elements.find((x) => x.id === id);
    const o = a ?? el;
    if (!o) return;
    const start = { x: e.clientX, y: e.clientY, w: o.w, h: o.h };
    const mv = (ev: PointerEvent) => {
      const z = vpRef.current.z;
      const w = Math.max(a ? 200 : 40, start.w + (ev.clientX - start.x) / z), h = Math.max(a ? 200 : 40, start.h + (ev.clientY - start.y) / z);
      if (a) useStore.getState().updateArtboard(id, { w, h }); else useStore.getState().updateElement(id, { w, h });
    };
    const upH = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upH); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", upH);
  }, []);

  /* root pointer: pan / marquee / create tools */
  const onPointerDown = (e: React.PointerEvent) => {
    const st = useStore.getState();
    if (e.button === 1 || (e.button === 0 && (tool === "hand" || space))) {
      e.preventDefault();
      setPanning(true);
      const s0 = { x: e.clientX, y: e.clientY, vx: vpRef.current.x, vy: vpRef.current.y };
      const mv = (ev: PointerEvent) => setVp({ ...vpRef.current, x: s0.vx + ev.clientX - s0.x, y: s0.vy + ev.clientY - s0.y });
      const upH = () => { setPanning(false); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upH); };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", upH);
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    if (tool === "select") {
      st.setSel([]);
      st.patchUI({ interactId: null, openPinId: null });
      setEditing(null);
      setDraftPin(null);
      setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      const mv = (ev: PointerEvent) => { const p = toWorld(ev.clientX, ev.clientY); setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m)); };
      const upH = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upH);
        const p = toWorld(ev.clientX, ev.clientY);
        const x0 = Math.min(w.x, p.x), x1 = Math.max(w.x, p.x), y0 = Math.min(w.y, p.y), y1 = Math.max(w.y, p.y);
        if (x1 - x0 > 4 || y1 - y0 > 4) {
          const S = useStore.getState();
          const hit = [...S.artboards, ...S.elements].filter((i) => i.pageId === S.activePageId && i.x < x1 && i.x + i.w > x0 && i.y < y1 && i.y + i.h > y0).map((i) => i.id);
          S.setSel(hit);
        }
        setMarquee(null);
      };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", upH);
      return;
    }
    if (tool === "text" || tool === "note") {
      const el = st.addElement(tool === "note"
        ? { kind: "note", x: w.x - 100, y: w.y - 100, w: 210, h: 200, color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)], text: "" }
        : { kind: "text", x: w.x, y: w.y - 20, w: 320, h: 48, color: "var(--m-on-surface)", text: "" });
      st.setSel([el.id]); setEditing(el.id); st.setTool("select");
      return;
    }
    if (tool === "pin") {
      const hit = [...st.artboards].reverse().find((a) => a.pageId === st.activePageId && w.x >= a.x && w.x <= a.x + a.w && w.y >= a.y && w.y <= a.y + a.h);
      setDraftPin(hit ? { x: w.x - hit.x, y: w.y - hit.y, artboardId: hit.id } : { x: w.x, y: w.y });
      return;
    }
    // frame | shape | pen drags
    const kind = tool === "frame" ? "frame" : tool === "shape" ? "shape" : "pen";
    const pts: [number, number][] = [[w.x, w.y]];
    setDraft({ kind, x0: w.x, y0: w.y, x1: w.x, y1: w.y, pts });
    const mv = (ev: PointerEvent) => {
      const p = toWorld(ev.clientX, ev.clientY);
      if (kind === "pen") pts.push([p.x, p.y]);
      setDraft({ kind, x0: w.x, y0: w.y, x1: p.x, y1: p.y, pts: kind === "pen" ? [...pts] : pts });
    };
    const upH = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upH);
      const p = toWorld(ev.clientX, ev.clientY);
      const S = useStore.getState();
      const x = Math.min(w.x, p.x), y = Math.min(w.y, p.y), ww = Math.abs(p.x - w.x), hh = Math.abs(p.y - w.y);
      if (kind === "frame") {
        const big = ww > 40 && hh > 40;
        const ab = S.addBlankFrame(big ? x : w.x, big ? y : w.y, big ? ww : 390, big ? hh : 844);
        S.setSel([ab.id]); S.setTool("select");
      } else if (kind === "shape") {
        const sh = S.shape;
        const line = sh === "line" || sh === "arrow";
        if (ww > 6 || hh > 6) {
          const el = S.addElement({
            kind: "shape", shape: sh, x, y, w: Math.max(ww, line ? 1 : 12), h: Math.max(hh, line ? 1 : 12), color: "var(--m-primary)",
            points: line ? [[w.x - x, w.y - y], [p.x - x, p.y - y]] : undefined,
          });
          S.setSel([el.id]); S.setTool("select");
        }
      } else if (pts.length > 2) {
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
        const bx = Math.min(...xs), by = Math.min(...ys);
        S.addElement({ kind: "pen", x: bx, y: by, w: Math.max(...xs) - bx, h: Math.max(...ys) - by, color: "var(--m-primary)", points: pts.map(([a, b2]) => [a - bx, b2 - by] as [number, number]) });
      }
      setDraft(null);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", upH);
  };

  const cursor = panning ? "grabbing" : tool === "hand" || space ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
  const dx = draft ? { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) } : null;
  const empty = !boards.length && !els.length;

  const onCanvasDrop = (e: React.DragEvent) => {
    const blockId = e.dataTransfer.getData("application/x-zeus-block");
    if (!blockId) return;
    e.preventDefault();
    useEditor.getState().setDraggingBlockId(null);
    const w = toWorld(e.clientX, e.clientY);
    const st = useStore.getState();
    const ds = getDS(st.settings.designSystemId);
    const isWeb = blockId.startsWith("starter_web_");
    const fw = isWeb ? 1280 : 390;
    const fh = isWeb ? 800 : 844;
    const ab = st.addBlankFrame(Math.round(w.x - fw / 2), Math.round(w.y - 120), fw, fh);
    const updated = insertBlockIntoHtml(ab.html, blockId, ds, isWeb ? "web" : "mobile");
    st.updateArtboard(ab.id, { name: "Custom Screen", device: isWeb ? "web" : "mobile", html: updated });
    st.setSel([ab.id]);
    st.notify("Created frame with dropped component");
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = toWorld(e.clientX, e.clientY);
    const st = useStore.getState();
    const hit = [...st.artboards].reverse().find((a) => a.pageId === st.activePageId && w.x >= a.x && w.x <= a.x + a.w && w.y >= a.y && w.y <= a.y + a.h);
    if (hit) st.setSel([hit.id]);
    setCtxMenu({
      cx: Math.min(r.width - 230, Math.max(12, e.clientX - r.left)),
      cy: Math.min(r.height - 240, Math.max(12, e.clientY - r.top)),
      wx: Math.round(w.x),
      wy: Math.round(w.y),
      boardId: hit?.id,
    });
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => { setCtxMenu(null); onPointerDown(e); }}
      onContextMenu={onContextMenu}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-zeus-block")) e.preventDefault(); }}
      onDrop={onCanvasDrop}
      className="dots relative h-full w-full overflow-hidden bg-surface-lowest touch-none"
      style={{ cursor, backgroundSize: `${28 * vp.z}px ${28 * vp.z}px`, backgroundPosition: `${vp.x}px ${vp.y}px` }}
    >
      <div className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.z})` }}>
        {boards.map((a) => {
          const sx = a.x * vp.z + vp.x, sy = a.y * vp.z + vp.y;
          const sw = a.w * vp.z, sh = a.h * vp.z;
          const vw = window.innerWidth, vh = window.innerHeight;
          const culled = boards.length > 4 && (sx + sw < -500 || sy + sh < -500 || sx > vw + 500 || sy > vh + 500);
          return (
            <ArtboardView key={a.id} a={a} z={vp.z} tool={tool} selected={sel.includes(a.id)} interacting={interactId === a.id} editing={editId === a.id} culled={culled} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />
          );
        })}
        {els.map((el) => (
          <ElementView key={el.id} el={el} z={vp.z} tool={tool} selected={sel.includes(el.id)} editing={editing === el.id} setEditing={setEditing} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />
        ))}
        {pins.map((p) => <PinView key={p.id} pin={p} z={vp.z} />)}
        {draftPin && <PinDraft {...draftPin} z={vp.z} onDone={() => { setDraftPin(null); useStore.getState().setTool("select"); }} />}
        {guides.x !== undefined && (
          <div className="pointer-events-none absolute top-[-10000px] h-[20000px] bg-primary" style={{ left: guides.x, width: Math.max(1, 1.5 / vp.z) }} />
        )}
        {guides.y !== undefined && (
          <div className="pointer-events-none absolute left-[-10000px] w-[20000px] bg-primary" style={{ top: guides.y, height: Math.max(1, 1.5 / vp.z) }} />
        )}
        {dx && draft?.kind === "frame" && <div className="pointer-events-none absolute rounded-[24px] border-2 border-dashed border-primary bg-primary/10" style={{ left: dx.x, top: dx.y, width: dx.w, height: dx.h }} />}
        {dx && draft?.kind === "shape" && <div className="pointer-events-none absolute border-2 border-primary/70 bg-primary/10" style={{ left: dx.x, top: dx.y, width: dx.w, height: dx.h, borderRadius: useStore.getState().shape === "ellipse" ? "50%" : 12 }} />}
        {draft?.kind === "pen" && (
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}><path d={penPath(draft.pts)} fill="none" stroke="var(--m-primary)" strokeWidth={4 / vp.z} strokeLinecap="round" /></svg>
        )}
        {marquee && <div className="pointer-events-none absolute border border-primary bg-primary/10" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}
      </div>
      {empty && <EmptyCanvas />}
      {ctxMenu && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ left: ctxMenu.cx, top: ctxMenu.cy }}
          className="anim-pop pointer-events-auto absolute z-40 w-[224px] rounded-2xl border border-outline-variant bg-surface-container p-1.5"
        >
          {ctxMenu.boardId ? (
            <>
              <MenuItem icon={<Icon name="ads_click" size={15} />} label="Edit elements & layers" desc="Enter" onClick={() => {
                const st = useStore.getState();
                const b = st.artboards.find((a) => a.id === ctxMenu.boardId);
                if (b && !b.loading) {
                  useEditor.getState().begin(b.id, b.html, "design");
                  useEditor.getState().setInsertOpen(true);
                  st.patchUI({ editId: b.id, interactId: null });
                  setTimeout(() => canvasApi.fit([b.id], { right: 310 }), 40);
                }
                setCtxMenu(null);
              }} />
              <MenuItem icon={<Icon name="add" size={15} />} label="Insert UI component" desc="I" onClick={() => {
                const st = useStore.getState();
                const b = st.artboards.find((a) => a.id === ctxMenu.boardId);
                if (b && !b.loading) {
                  useEditor.getState().begin(b.id, b.html, "insert");
                  useEditor.getState().setInsertOpen(true);
                  st.patchUI({ editId: b.id, interactId: null });
                }
                setCtxMenu(null);
              }} />
              <MenuItem icon={<Icon name="touch_app" size={15} />} label="Interact live preview" onClick={() => {
                useStore.getState().patchUI({ interactId: ctxMenu.boardId, editId: null });
                setCtxMenu(null);
              }} />
              <MenuItem icon={<Icon name="content_copy" size={15} />} label="Duplicate as variant" desc="Ctrl+D" onClick={() => {
                useStore.getState().duplicateArtboard(ctxMenu.boardId!);
                setCtxMenu(null);
              }} />
              <MenuItem icon={<Icon name="delete" size={15} />} danger label="Delete screen" desc="Del" onClick={() => {
                useStore.getState().removeArtboards([ctxMenu.boardId!]);
                setCtxMenu(null);
              }} />
            </>
          ) : (
            <>
              <MenuLabel>Canvas</MenuLabel>
              <MenuItem icon={<Icon name="smartphone" size={15} />} label="New Mobile Frame" desc="390×844" onClick={() => {
                const st = useStore.getState();
                const ab = st.addBlankFrame(ctxMenu.wx - 195, ctxMenu.wy - 100, 390, 844);
                st.updateArtboard(ab.id, { device: "mobile", name: "Mobile Frame" });
                st.setSel([ab.id]);
                useEditor.getState().begin(ab.id, ab.html, "insert");
                useEditor.getState().setInsertOpen(true);
                st.patchUI({ editId: ab.id, interactId: null });
                setCtxMenu(null);
              }} />
              <MenuItem icon={<Icon name="desktop_windows" size={15} />} label="New Web Frame" desc="1280×800" onClick={() => {
                const st = useStore.getState();
                const ab = st.addBlankFrame(ctxMenu.wx - 640, ctxMenu.wy - 100, 1280, 800);
                st.updateArtboard(ab.id, { device: "web", name: "Web Frame" });
                st.setSel([ab.id]);
                useEditor.getState().begin(ab.id, ab.html, "insert");
                useEditor.getState().setInsertOpen(true);
                st.patchUI({ editId: ab.id, interactId: null });
                setCtxMenu(null);
              }} />
              <MenuItem icon={<Icon name="widgets" size={15} />} label="Open Component Studio" desc="I" onClick={() => {
                useEditor.getState().setTab("insert");
                useEditor.getState().setInsertOpen(true);
                setCtxMenu(null);
              }} />
              <MenuItem icon={<Icon name="fit_screen" size={15} />} label="Fit all screens" desc="1" onClick={() => {
                canvasApi.fit();
                setCtxMenu(null);
              }} />
            </>
          )}
        </div>
      )}
      <SelectionAlignBar />
      <InkPalette />
    </div>
  );
}

/* Figma-style alignment & distribution toolbar when 2+ items are selected on the canvas */
function SelectionAlignBar() {
  const sel = useStore((s) => s.sel);
  const pageId = useStore((s) => s.activePageId);
  const boards = useStore((s) => s.artboards);
  const els = useStore((s) => s.elements);
  const items = [
    ...boards.filter((a) => a.pageId === pageId && sel.includes(a.id)),
    ...els.filter((e) => e.pageId === pageId && sel.includes(e.id)),
  ];
  if (items.length < 2) return null;

  const applyAlign = (mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "distribute") => {
    const minX = Math.min(...items.map((i) => i.x));
    const maxX = Math.max(...items.map((i) => i.x + i.w));
    const minY = Math.min(...items.map((i) => i.y));
    const maxY = Math.max(...items.map((i) => i.y + i.h));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const posMap = new Map<string, { x: number; y: number }>();
    if (mode === "distribute") {
      const sorted = [...items].sort((a, b) => a.x - b.x);
      let cursor = minX;
      for (const it of sorted) {
        posMap.set(it.id, { x: Math.round(cursor), y: Math.round(minY) });
        cursor += it.w + 80;
      }
    } else {
      for (const it of items) {
        const x =
          mode === "left" ? minX
            : mode === "center" ? Math.round(midX - it.w / 2)
              : mode === "right" ? maxX - it.w
                : it.x;
        const y =
          mode === "top" ? minY
            : mode === "middle" ? Math.round(midY - it.h / 2)
              : mode === "bottom" ? maxY - it.h
                : it.y;
        posMap.set(it.id, { x, y });
      }
    }

    useStore.setState((s) => ({
      artboards: s.artboards.map((a) => (posMap.has(a.id) ? { ...a, ...posMap.get(a.id)! } : a)),
      elements: s.elements.map((e) => (posMap.has(e.id) ? { ...e, ...posMap.get(e.id)! } : e)),
    }));
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="anim-pop pointer-events-auto absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-2.5 py-1"
    >
      <span className="px-1.5 text-xs font-semibold text-on-surface-variant">{items.length} selected</span>
      <span className="mx-0.5 h-4 w-px bg-outline-variant" />
      <IconBtn label="Align left" size={28} onClick={() => applyAlign("left")}><Icon name="format_align_left" size={15} /></IconBtn>
      <IconBtn label="Align horizontal center" size={28} onClick={() => applyAlign("center")}><Icon name="format_align_center" size={15} /></IconBtn>
      <IconBtn label="Align right" size={28} onClick={() => applyAlign("right")}><Icon name="format_align_right" size={15} /></IconBtn>
      <span className="mx-0.5 h-4 w-px bg-outline-variant" />
      <IconBtn label="Align top" size={28} onClick={() => applyAlign("top")}><Icon name="vertical_align_top" size={15} /></IconBtn>
      <IconBtn label="Align middle" size={28} onClick={() => applyAlign("middle")}><Icon name="vertical_align_center" size={15} /></IconBtn>
      <IconBtn label="Align bottom" size={28} onClick={() => applyAlign("bottom")}><Icon name="vertical_align_bottom" size={15} /></IconBtn>
      <span className="mx-0.5 h-4 w-px bg-outline-variant" />
      <button onClick={() => applyAlign("distribute")} className="state rounded-full bg-surface-high px-2.5 py-1 text-[11px] font-semibold text-on-surface">
        Tidy row
      </button>
    </div>
  );
}

/* color picker for the selected drawing/text elements */
function InkPalette() {
  const sel = useStore((s) => s.sel);
  const els = useStore((s) => s.elements);
  const chosen = els.filter((e) => sel.includes(e.id));
  if (!chosen.length) return null;
  const note = chosen.every((e) => e.kind === "note");
  const cols = note ? NOTE_COLORS : INK_COLORS;
  return (
    <div onPointerDown={(e) => e.stopPropagation()} className="anim-pop absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface-container px-3 py-2  ">
      {cols.map((c) => (
        <button key={c} onClick={() => chosen.forEach((e) => useStore.getState().updateElement(e.id, { color: c }))} className="size-6 rounded-full border-2 border-white/70 transition-transform ease-spring hover:scale-125" style={{ background: c }} />
      ))}
      <span className="mx-1 h-5 w-px bg-outline-variant" />
      <IconBtn label="Delete" size={28} onClick={() => useStore.getState().removeElements(chosen.map((e) => e.id))}><Icon name="delete" size={15} /></IconBtn>
    </div>
  );
}
