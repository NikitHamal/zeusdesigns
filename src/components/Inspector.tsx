import { useEffect, useState } from "react";
import { useStore } from "../store";
import { editor, useEditor, type InspectorTab, type LayerNode } from "../lib/editor";
import { BLOCK_CATEGORIES, insertBlockIntoHtml, UI_BLOCKS, type BlockCategory } from "../lib/blocks";
import { applyThemeOverrideToHtml, detectThemeOverride } from "../lib/context";
import { DESIGN_SYSTEMS, getDS } from "../lib/designSystems";
import { DESIGN_FONTS, installDesignFonts } from "../lib/fonts";
import { harden, rethemeHtml, stripKitBoilerplate, UI_ICON_NAMES } from "../lib/harness";
import { canvasApi } from "../lib/canvasApi";
import { DEVICE_SIZE, type Device, type Quote } from "../types";
import { cn } from "../utils/cn";
import { IconBtn } from "./ui";
import { Icon } from "./Icon";

const toHex = (c: string): string => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c);
  if (!m) return "#000000";
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
};
const isClear = (c: string) => c === "transparent" || /rgba\(\s*\d+[,\s]+\d+[,\s]+\d+[,\s]+0\s*\)/.test(c);

const TOKEN_SWATCHES = [
  { label: "Primary", val: "var(--primary)" },
  { label: "Container", val: "var(--container)" },
  { label: "Surface", val: "var(--surface)" },
  { label: "Surface 2", val: "var(--surface-2)" },
  { label: "Bg", val: "var(--bg)" },
  { label: "Text", val: "var(--text)" },
  { label: "Muted", val: "var(--muted)" },
];

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-outline-variant/60 px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-on-surface-variant">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function Num({ label, value, onChange, min = 0, max = 999, step = 1, auto }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; auto?: boolean;
}) {
  return (
    <label className="flex h-8 items-center gap-1.5 rounded-xl bg-surface-high px-2.5 text-[11.5px] text-on-surface-variant focus-within:ring-2 focus-within:ring-primary/50">
      <span className="w-4 shrink-0 font-semibold">{label}</span>
      <input
        type="number" min={min} max={max} step={step} value={auto ? "" : Math.round(value * 100) / 100} placeholder={auto ? "auto" : undefined}
        onChange={(e) => e.target.value !== "" && onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-full min-w-0 bg-transparent text-[12.5px] font-medium text-on-surface outline-none placeholder:text-on-surface-variant/60"
      />
    </label>
  );
}

function Color({ label, value, onChange, onClear }: { label: string; value: string; onChange: (hex: string) => void; onClear?: () => void }) {
  const clear = isClear(value);
  const hex = toHex(value);
  return (
    <div className="flex h-8 items-center gap-2 rounded-xl bg-surface-high pl-1.5 pr-1 text-[12px] text-on-surface-variant">
      <label className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded-md border border-outline-variant" style={{ background: clear ? "repeating-conic-gradient(var(--m-surface-highest) 0% 25%, var(--m-surface) 0% 50%) 50% / 8px 8px" : hex }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="font-mono text-[11px] text-on-surface">{clear ? "none" : hex}</span>
      {onClear && !clear && <IconBtn label="Clear" size={24} onClick={onClear}><Icon name="close" size={13} /></IconBtn>}
    </div>
  );
}

const WEIGHTS = [[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"], [800, "Extra bold"]] as const;

function LayerTreeView({ nodes, activePath, depth = 0 }: { nodes: LayerNode[]; activePath: string; depth?: number }) {
  if (!nodes.length) return null;
  return (
    <div className="space-y-0.5">
      {nodes.map((n, i) => {
        const pKey = n.path.join(".");
        const isSel = pKey === activePath;
        const iconName =
          n.tag === "header" || n.cls.includes("appbar") || n.cls.includes("top") ? "web_asset"
            : n.tag === "nav" || n.cls.includes("nav") ? "bottom_navigation"
              : n.tag === "button" || n.cls.includes("btn") ? "ads_click"
                : n.tag === "input" || n.cls.includes("input") || n.cls.includes("field") ? "edit"
                  : n.tag === "svg" || n.cls.includes("z-i") ? "star"
                    : n.cls.includes("row") ? "arrow_forward"
                      : n.cls.includes("col") || n.cls.includes("list") ? "arrow_downward"
                        : n.cls.includes("grid") ? "grid_view"
                          : n.cls.includes("card") || n.cls.includes("hero") ? "dashboard"
                            : "layers";
        return (
          <div key={pKey + ":" + i}>
            <div
              onClick={() => editor.selectPath(n.path)}
              style={{ paddingLeft: 8 + depth * 13 }}
              className={cn(
                "group flex h-7 cursor-pointer items-center gap-1 rounded-lg pr-1 text-[12px] transition-colors",
                isSel ? "bg-primary-container font-semibold text-on-primary-container" : "text-on-surface hover:bg-surface-high"
              )}
            >
              <Icon name={iconName} size={13} className={isSel ? "text-on-primary-container" : "text-on-surface-variant"} />
              <span className={cn("min-w-0 flex-1 truncate", n.hidden && "line-through opacity-50")}>{n.label}</span>
              <span className="font-mono text-[10px] opacity-60 group-hover:hidden">{n.tag}</span>
              <div className={cn("hidden items-center gap-0.5 group-hover:flex", n.hidden && "flex")}>
                <button
                  onClick={(e) => { e.stopPropagation(); editor.movePath(n.path, -1); }}
                  title="Move up"
                  className="grid size-4 place-items-center rounded hover:bg-surface-highest"
                >
                  <Icon name="keyboard_arrow_up" size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); editor.movePath(n.path, 1); }}
                  title="Move down"
                  className="grid size-4 place-items-center rounded hover:bg-surface-highest"
                >
                  <Icon name="keyboard_arrow_down" size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); editor.duplicatePath(n.path); }}
                  title="Duplicate layer"
                  className="grid size-4 place-items-center rounded hover:bg-surface-highest"
                >
                  <Icon name="content_copy" size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); editor.toggleHide(n.path); }}
                  title={n.hidden ? "Show layer" : "Hide layer"}
                  className="grid size-4 place-items-center rounded hover:bg-surface-highest"
                >
                  <Icon name={n.hidden ? "visibility_off" : "visibility"} size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); editor.deletePath(n.path); }}
                  title="Delete layer"
                  className="grid size-4 place-items-center rounded text-error hover:bg-error-container"
                >
                  <Icon name="delete" size={11} />
                </button>
              </div>
            </div>
            {n.children.length > 0 && <LayerTreeView nodes={n.children} activePath={activePath} depth={depth + 1} />}
          </div>
        );
      })}
    </div>
  );
}

export function Inspector() {
  const editId = useStore((s) => s.ui.editId);
  const selIds = useStore((s) => s.sel);
  const activePageId = useStore((s) => s.activePageId);
  const dsId = useStore((s) => s.settings.designSystemId);
  const sel = useEditor((s) => s.sel);
  const tree = useEditor((s) => s.tree);
  const tab = useEditor((s) => s.tab);
  const insertOpen = useEditor((s) => s.insertOpen);
  const setTab = useEditor((s) => s.setTab);
  const setInsertOpen = useEditor((s) => s.setInsertOpen);
  const canUndo = useEditor((s) => s.stack.length > 0);
  const canRedo = useEditor((s) => s.redoStack.length > 0);
  const allBoards = useStore((s) => s.artboards);
  const targetBoard = allBoards.find((a) => a.id === editId) ?? allBoards.find((a) => selIds.includes(a.id) && a.pageId === activePageId) ?? allBoards.find((a) => a.pageId === activePageId);

  const [text, setText] = useState("");
  const [codeText, setCodeText] = useState("");
  const [cat, setCat] = useState<BlockCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [iconQuery, setIconQuery] = useState("");
  const [insertWhere, setInsertWhere] = useState<"after" | "inside" | "append">("after");

  const key = sel ? sel.path.join(".") + sel.tag : "";
  useEffect(() => {
    setText(sel?.text ?? "");
    setCodeText(sel?.outerHtml ?? (targetBoard ? stripKitBoilerplate(targetBoard.html) : ""));
  }, [key, sel?.outerHtml, targetBoard?.id, targetBoard?.html]);

  const isOpen = !!editId || insertOpen;
  if (!isOpen) return null;

  const s = sel?.s;
  const flex = !!s && /flex|grid/.test(s.display);
  const activeTab: InspectorTab = !editId ? "insert" : tab;

  const askZeus = () => {
    if (!sel || !targetBoard) return;
    const q: Quote = { kind: "element", artboardId: targetBoard.id, label: `${sel.tag}${sel.cls ? "." + sel.cls.split(" ")[0] : ""}`, text: sel.html.replace(/\s+/g, " ").slice(0, 420) };
    useStore.getState().patchUI({ chatCollapsed: false });
    window.dispatchEvent(new CustomEvent("zeus:quote", { detail: q }));
  };

  const handleInsertBlock = (blockId: string) => {
    const st = useStore.getState();
    const ds = getDS(dsId);
    const b = UI_BLOCKS.find((x) => x.id === blockId);
    if (!b) return;
    // If we are in live edit mode on an artboard, insert directly via editor postMessage
    if (editId && targetBoard && targetBoard.id === editId) {
      if (b.slot === "screen" || b.slot === "top" || b.slot === "bottom" || targetBoard.html.includes("data-zeus-empty-frame")) {
        const dev = b.device ?? targetBoard.device;
        const updated = insertBlockIntoHtml(targetBoard.html, blockId, ds, dev);
        useEditor.getState().record(targetBoard.html);
        st.updateArtboard(targetBoard.id, {
          html: updated,
          ...(b.slot === "screen" ? { name: b.name, device: dev, w: dev === "web" ? 1280 : 390, h: dev === "web" ? 800 : 844 } : {}),
        });
      } else {
        editor.insertHtml(b.html(), sel ? insertWhere : "append");
      }
      st.notify(`Inserted ${b.name}`);
      return;
    }

    // If an artboard exists on the page (selected or first on page), insert into it
    if (targetBoard) {
      const dev = b.device ?? targetBoard.device;
      const updated = insertBlockIntoHtml(targetBoard.html, blockId, ds, dev);
      st.reviseArtboard(targetBoard.id, updated);
      if (b.slot === "screen") {
        st.updateArtboard(targetBoard.id, { name: b.name, device: dev, w: dev === "web" ? 1280 : 390, h: dev === "web" ? 800 : 844 });
      }
      st.setSel([targetBoard.id]);
      st.notify(`Added to ${targetBoard.name}`);
      return;
    }

    // Otherwise create a brand-new frame on the canvas and insert the block into it!
    const dev = b.device ?? "mobile";
    const fw = dev === "web" ? 1280 : 390;
    const fh = dev === "web" ? 800 : 844;
    const center = canvasApi.viewCenter();
    const ab = st.addBlankFrame(Math.round(center.x - fw / 2), Math.round(center.y - fh / 2), fw, fh);
    const updated = insertBlockIntoHtml(ab.html, blockId, ds, dev);
    st.updateArtboard(ab.id, { name: b.slot === "screen" ? b.name : "Custom Screen", device: dev, html: updated });
    st.setSel([ab.id]);
    setTimeout(() => canvasApi.fit([ab.id], { right: 310 }), 40);
    st.notify(`Created ${b.name}`);
  };

  const enterEditOnTarget = (nextTab: InspectorTab) => {
    if (!targetBoard) return;
    if (!editId) {
      useEditor.getState().begin(targetBoard.id, targetBoard.html, nextTab);
      useStore.getState().patchUI({ editId: targetBoard.id, interactId: null });
      useStore.getState().setSel([targetBoard.id]);
    } else {
      setTab(nextTab);
    }
  };

  const filteredBlocks = UI_BLOCKS.filter((b) => {
    if (cat !== "all" && b.category !== cat) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.desc.toLowerCase().includes(q) || b.category.includes(q);
  });

  return (
    <aside
      className="anim-pop pointer-events-auto absolute bottom-24 right-3 top-[68px] z-40 flex w-[304px] flex-col overflow-hidden rounded-[24px] border border-outline-variant bg-surface-container"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Top Studio Header & Tab Bar */}
      <header className="flex flex-col gap-2 border-b border-outline-variant/60 px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-on-surface">
            {editId && sel ? (
              <><span className="font-mono text-primary">{sel.tag}</span>{sel.cls && <span className="text-on-surface-variant"> .{sel.cls.split(" ")[0]}</span>}</>
            ) : targetBoard ? (
              targetBoard.name
            ) : (
              "Component Studio"
            )}
          </span>
          {editId && (
            <>
              <IconBtn label="Undo (Ctrl+Z)" size={28} disabled={!canUndo} onClick={() => editor.undo()}><Icon name="undo" size={16} /></IconBtn>
              <IconBtn label="Redo (Ctrl+Shift+Z)" size={28} disabled={!canRedo} onClick={() => editor.redo()}><Icon name="redo" size={16} /></IconBtn>
            </>
          )}
          <IconBtn
            label="Close panel"
            size={28}
            tonal
            onClick={() => {
              setInsertOpen(false);
              if (editId) editor.finish();
            }}
          >
            <Icon name={editId ? "check" : "close"} size={16} />
          </IconBtn>
        </div>

        {/* 4-Tab Switcher: Design | Insert | Layers | Code */}
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-low p-1">
          {([
            ["design", "tune", "Design"],
            ["insert", "add", "Insert"],
            ["layers", "layers", "Layers"],
            ["code", "code", "Code"],
          ] as const).map(([id, ic, lbl]) => {
            const on = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === "insert") { setTab("insert"); setInsertOpen(true); }
                  else if (targetBoard) enterEditOnTarget(id);
                }}
                disabled={id !== "insert" && !targetBoard}
                className={cn(
                  "state flex h-7 items-center justify-center gap-1 rounded-lg text-[11.5px] font-semibold transition-colors disabled:opacity-40",
                  on ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Icon name={ic} size={13} />
                <span>{lbl}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* TAB 1: INSERT (Figma / Onlook Drag & Drop Component Palette) */}
      {activeTab === "insert" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-2 border-b border-outline-variant/50 p-3">
            <label className="flex h-8 items-center gap-2 rounded-xl bg-surface-high px-2.5 text-xs text-on-surface-variant">
              <Icon name="search" size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search components (hero, nav, chart…)"
                className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant/60"
              />
              {query && <button onClick={() => setQuery("")}><Icon name="close" size={13} /></button>}
            </label>
            <div className="no-bar flex gap-1 overflow-x-auto pb-0.5">
              <button
                onClick={() => setCat("all")}
                className={cn("state shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", cat === "all" ? "bg-secondary-container text-on-secondary-container" : "bg-surface-high text-on-surface-variant")}
              >
                All
              </button>
              {BLOCK_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={cn("state shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", cat === c.id ? "bg-secondary-container text-on-secondary-container" : "bg-surface-high text-on-surface-variant")}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {editId && sel && (
              <div className="flex items-center justify-between rounded-xl bg-surface-low px-2.5 py-1 text-[11px] text-on-surface-variant">
                <span>Insert position:</span>
                <div className="flex gap-1">
                  {(["after", "inside", "append"] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setInsertWhere(w)}
                      className={cn("rounded-md px-2 py-0.5 font-semibold capitalize", insertWhere === w ? "bg-primary text-on-primary" : "hover:bg-surface-high")}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {filteredBlocks.map((b) => (
              <button
                key={b.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-zeus-block", b.id);
                  e.dataTransfer.effectAllowed = "copy";
                  useEditor.getState().setDraggingBlockId(b.id);
                }}
                onDragEnd={() => useEditor.getState().setDraggingBlockId(null)}
                onClick={() => handleInsertBlock(b.id)}
                className="state group flex w-full items-center gap-2.5 rounded-2xl border border-outline-variant/50 bg-surface-low p-2.5 text-left transition-colors hover:border-primary/60 hover:bg-surface-high"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-container/70 text-on-primary-container">
                  <Icon name={b.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-on-surface">{b.name}</span>
                  <span className="block truncate text-[11px] text-on-surface-variant">{b.desc}</span>
                </span>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-highest text-on-surface-variant group-hover:bg-primary group-hover:text-on-primary">
                  <Icon name="add" size={15} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: LAYERS (DOM Hierarchy Tree) */}
      {activeTab === "layers" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-outline-variant/50 px-3.5 py-2 text-[11.5px] text-on-surface-variant">
            <span>DOM Layer Hierarchy</span>
            <span>{tree.length} top nodes</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {tree.length === 0 ? (
              <div className="grid h-40 place-items-center px-6 text-center text-xs text-on-surface-variant">
                No layers found. Insert a component from the Insert tab.
              </div>
            ) : (
              <LayerTreeView nodes={tree} activePath={sel ? sel.path.join(".") : ""} />
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CODE (Live HTML Inspector & Editor — Element or Full Screen) */}
      {activeTab === "code" && (
        <div className="flex min-h-0 flex-1 flex-col p-3 gap-2.5">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>{sel ? `Selected <${sel.tag}> HTML` : targetBoard ? `Screen HTML (${targetBoard.name})` : "Select a screen to edit its HTML"}</span>
            {(sel || targetBoard) && (
              <button
                onClick={() => { navigator.clipboard.writeText(codeText); useStore.getState().notify("Copied HTML"); }}
                className="font-semibold text-primary hover:underline"
              >
                Copy
              </button>
            )}
          </div>
          <textarea
            value={codeText}
            onChange={(e) => setCodeText(e.target.value)}
            disabled={!sel && !targetBoard}
            spellCheck={false}
            placeholder="Inspect and edit live HTML markup…"
            className="min-h-0 flex-1 resize-none rounded-2xl border border-outline-variant/60 bg-surface-low p-3 font-mono text-[11.5px] leading-relaxed text-on-surface outline-none focus:border-primary"
          />
          <button
            disabled={(!sel && !targetBoard) || !codeText.trim()}
            onClick={() => {
              if (sel) {
                editor.replaceHtml(codeText);
                useStore.getState().notify("Updated element HTML");
              } else if (targetBoard) {
                const ds = getDS(dsId);
                const next = harden(codeText, ds, { partial: true, device: targetBoard.device }).html;
                useStore.getState().reviseArtboard(targetBoard.id, next);
                useStore.getState().notify(`Updated ${targetBoard.name} HTML`);
              }
            }}
            className="state h-9 w-full rounded-full bg-primary text-xs font-semibold text-on-primary disabled:opacity-40"
          >
            {sel ? "Apply element HTML" : "Apply screen HTML"}
          </button>
        </div>
      )}

      {/* TAB 4: DESIGN (Figma Visual & Auto-Layout Properties) */}
      {activeTab === "design" && (
        !sel || !s ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {targetBoard && (
              <>
                <Section title="Frame Properties">
                  <input
                    value={targetBoard.name}
                    onChange={(e) => useStore.getState().updateArtboard(targetBoard.id, { name: e.target.value })}
                    className="mb-2 h-8 w-full rounded-xl bg-surface-high px-2.5 text-[12.5px] font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-low p-1 text-[11px] font-semibold">
                    {(["mobile", "tablet", "web"] as Device[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => useStore.getState().updateArtboard(targetBoard.id, { device: d, w: DEVICE_SIZE[d].w, h: DEVICE_SIZE[d].h })}
                        className={cn(
                          "state h-7 rounded-lg capitalize",
                          targetBoard.device === d ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="W" value={targetBoard.w} min={240} max={2560} onChange={(v) => useStore.getState().updateArtboard(targetBoard.id, { w: v })} />
                    <Num label="H" value={targetBoard.h} min={240} max={4000} onChange={(v) => useStore.getState().updateArtboard(targetBoard.id, { h: v })} />
                  </div>
                </Section>
              </>
            )}

            <Section title="Color Theme & Surface Palette">
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ["green", "Emerald", "#1b6d3e"],
                  ["teal", "Teal", "#0f6b63"],
                  ["orange", "Clay", "#b84a1d"],
                  ["yellow", "Gold", "#8f6200"],
                  ["red", "Crimson", "#b3262e"],
                  ["pink", "Sakura", "#a83264"],
                  ["monochrome", "Mono", "#18181b"],
                  ["reset", "System", getDS(dsId).tokens.primary],
                ] as const).map(([key, lbl, swatch]) => (
                  <button
                    key={key}
                    onClick={() => {
                      const st = useStore.getState();
                      const pageBoards = st.artboards.filter((b) => b.pageId === st.activePageId);
                      if (!pageBoards.length) return;
                      if (key === "reset") {
                        const ds = getDS(dsId);
                        pageBoards.forEach((b) => {
                          const cleaned = b.html.replace(/<style\b[^>]*data-zeus-theme[^>]*>[\s\S]*?<\/style>/gi, "");
                          st.reviseArtboard(b.id, rethemeHtml(cleaned, ds));
                        });
                        st.notify(`Reset to ${ds.name} palette`);
                        return;
                      }
                      const ov = detectThemeOverride(`change theme to ${key}`, pageBoards[0]?.html ?? "");
                      if (ov) {
                        pageBoards.forEach((b) => st.reviseArtboard(b.id, applyThemeOverrideToHtml(b.html, ov)));
                        st.notify(`Applied ${lbl} theme to ${pageBoards.length} screen${pageBoards.length > 1 ? "s" : ""}`);
                      }
                    }}
                    className="state flex flex-col items-center gap-1 rounded-xl bg-surface-low py-1.5 px-1 text-[10.5px] font-semibold text-on-surface hover:bg-surface-high"
                  >
                    <span className="size-4 rounded-full border border-black/15" style={{ background: swatch }} />
                    <span className="truncate">{lbl}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {([
                  ["light mode", "light_mode", "Light Surfaces"],
                  ["dark mode", "dark_mode", "Dark Surfaces"],
                ] as const).map(([q, ic, lbl]) => (
                  <button
                    key={q}
                    onClick={() => {
                      const st = useStore.getState();
                      const pageBoards = st.artboards.filter((b) => b.pageId === st.activePageId);
                      const ov = detectThemeOverride(q, pageBoards[0]?.html ?? "");
                      if (ov && pageBoards.length) {
                        pageBoards.forEach((b) => st.reviseArtboard(b.id, applyThemeOverrideToHtml(b.html, ov)));
                        st.notify(`Switched ${pageBoards.length} screen${pageBoards.length > 1 ? "s" : ""} to ${lbl}`);
                      }
                    }}
                    className="state flex h-7 items-center justify-center gap-1.5 rounded-lg bg-surface-low text-[11px] font-semibold text-on-surface hover:bg-surface-high"
                  >
                    <Icon name={ic} size={13} />
                    <span>{lbl}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Typography Pairing">
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ["use fraunces font", "Fraunces + DM Sans", "Editorial", ["Fraunces", "DM Sans"]],
                  ["use space grotesk font", "Space Grotesk + Inter", "Technical", ["Space Grotesk", "Inter"]],
                  ["use plus jakarta font", "Plus Jakarta Sans", "Friendly", ["Plus Jakarta Sans"]],
                  ["use jetbrains mono font", "JetBrains Mono + Inter", "Developer", ["JetBrains Mono", "Inter"]],
                ] as const).map(([q, pair, tag, fams]) => (
                  <button
                    key={q}
                    onClick={() => {
                      installDesignFonts([...fams]);
                      const st = useStore.getState();
                      const pageBoards = st.artboards.filter((b) => b.pageId === st.activePageId);
                      const ov = detectThemeOverride(q, pageBoards[0]?.html ?? "");
                      if (ov && pageBoards.length) {
                        pageBoards.forEach((b) => st.reviseArtboard(b.id, applyThemeOverrideToHtml(b.html, ov)));
                        st.notify(`Applied ${pair} across ${pageBoards.length} screen${pageBoards.length > 1 ? "s" : ""}`);
                      }
                    }}
                    className="state flex flex-col items-start rounded-xl bg-surface-low px-2.5 py-1.5 text-left hover:bg-surface-high"
                  >
                    <span className="w-full truncate text-[11px] font-semibold text-on-surface">{pair}</span>
                    <span className="text-[10px] text-on-surface-variant">{tag}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Design System (Live Re-theme)">
              <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
                {DESIGN_SYSTEMS.map((d) => {
                  const on = d.id === dsId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => {
                        useStore.getState().patchSettings({ designSystemId: d.id });
                        useStore.getState().notify(`Applied ${d.name}`);
                      }}
                      className={cn(
                        "state flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors",
                        on ? "bg-primary-container font-semibold text-on-primary-container" : "bg-surface-low text-on-surface hover:bg-surface-high"
                      )}
                    >
                      <span className="size-3.5 shrink-0 rounded-full border border-black/15" style={{ background: d.tokens.primary }} />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="text-[10.5px] opacity-65">{d.vendor}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <div className="flex flex-col items-center gap-2.5 border-t border-outline-variant/60 px-5 py-5 text-center">
              <div className="text-xs text-on-surface-variant">
                Click any element on the screen to style its Auto-Layout, tokens, and typography, or insert new blocks.
              </div>
              <button
                onClick={() => setTab("insert")}
                className="state inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary"
              >
                <Icon name="add" size={15} /> Browse 36 UI Blocks & Layouts
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Quick manipulation toolbar */}
            <div className="flex items-center gap-1 px-3 pt-2.5 pb-2">
              <IconBtn label="Select parent (Alt+Up)" size={32} tonal onClick={editor.parent}><Icon name="arrow_upward" size={16} /></IconBtn>
              <IconBtn label="Move up (Up)" size={32} tonal onClick={() => editor.move(-1)}><Icon name="keyboard_arrow_up" size={18} /></IconBtn>
              <IconBtn label="Move down (Down)" size={32} tonal onClick={() => editor.move(1)}><Icon name="keyboard_arrow_down" size={18} /></IconBtn>
              <IconBtn label="Wrap in Auto-Layout Row (Shift+A)" size={32} tonal onClick={() => editor.wrap("row")}><Icon name="view_column_2" size={15} /></IconBtn>
              <IconBtn label="Duplicate (Ctrl+D)" size={32} tonal onClick={editor.duplicate}><Icon name="content_copy" size={15} /></IconBtn>
              <IconBtn label="Delete (Del)" size={32} tonal onClick={editor.del}><Icon name="delete" size={16} /></IconBtn>
              <span className="flex-1" />
              <IconBtn label="Ask Zeus about this element" size={32} active onClick={askZeus}><Icon name="chat_bubble" size={15} fill /></IconBtn>
            </div>

            {/* Component Variant & Interactive State Switcher */}
            {/\bz-(btn|card|chip|seg|tab|nav-item|day|icon-btn)\b/.test(sel.cls) && (
              <Section title="Component Variant">
                {/\bz-btn\b/.test(sel.cls) && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-low p-1 text-[11px] font-semibold">
                      {([
                        ["", "Filled"],
                        ["tonal", "Tonal"],
                        ["outline", "Outline"],
                        ["text", "Text"],
                      ] as const).map(([v, lbl]) => {
                        const on = v === "" ? !/\b(tonal|outline|text)\b/.test(sel.cls) : sel.cls.split(/\s+/).includes(v);
                        return (
                          <button
                            key={lbl}
                            onClick={() => editor.toggleClass(v, ["tonal", "outline", "text"])}
                            className={cn("state h-6 rounded-lg", on ? "bg-primary text-on-primary" : "text-on-surface-variant")}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-low p-1 text-[11px] font-semibold">
                      {([
                        ["sm", "Small"],
                        ["", "Default"],
                        ["lg", "Large"],
                        ["block", "Full W"],
                      ] as const).map(([v, lbl]) => {
                        const on = v === "" ? !/\b(sm|lg)\b/.test(sel.cls) : sel.cls.split(/\s+/).includes(v);
                        return (
                          <button
                            key={lbl}
                            onClick={() => v === "block" ? editor.toggleClass("block") : editor.toggleClass(v, ["sm", "lg"])}
                            className={cn("state h-6 rounded-lg", on ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant")}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/\bz-card\b/.test(sel.cls) && (
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-low p-1 text-[11px] font-semibold">
                    {([
                      ["", "Surface"],
                      ["tonal", "Tonal"],
                      ["accent", "Accent"],
                      ["flat", "Flat"],
                    ] as const).map(([v, lbl]) => {
                      const on = v === "" ? !/\b(tonal|accent|flat)\b/.test(sel.cls) : sel.cls.split(/\s+/).includes(v);
                      return (
                        <button
                          key={lbl}
                          onClick={() => editor.toggleClass(v, ["tonal", "accent", "flat"])}
                          className={cn("state h-6 rounded-lg", on ? "bg-primary text-on-primary" : "text-on-surface-variant")}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/\bz-icon-btn\b/.test(sel.cls) && (
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-low p-1 text-[11px] font-semibold">
                    {([
                      ["", "Outlined"],
                      ["tonal", "Tonal"],
                      ["filled", "Filled"],
                    ] as const).map(([v, lbl]) => {
                      const on = v === "" ? !/\b(tonal|filled)\b/.test(sel.cls) : sel.cls.split(/\s+/).includes(v);
                      return (
                        <button
                          key={lbl}
                          onClick={() => editor.toggleClass(v, ["tonal", "filled"])}
                          className={cn("state h-6 rounded-lg", on ? "bg-primary text-on-primary" : "text-on-surface-variant")}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/\bz-(chip|seg|tab|nav-item|day)\b/.test(sel.cls) && (
                  <button
                    onClick={() => editor.toggleClass("on")}
                    className={cn(
                      "state flex h-8 w-full items-center justify-between rounded-xl px-3 text-xs font-semibold",
                      /\bon\b/.test(sel.cls) ? "bg-primary-container text-on-primary-container" : "bg-surface-high text-on-surface-variant"
                    )}
                  >
                    <span>Active / Selected state (.on)</span>
                    <span>{/\bon\b/.test(sel.cls) ? "ON" : "OFF"}</span>
                  </button>
                )}
              </Section>
            )}

            {sel.text !== null && (
              <Section title="Content">
                <textarea
                  value={text} rows={2}
                  onChange={(e) => { setText(e.target.value); editor.text(e.target.value); }}
                  className="w-full resize-none rounded-xl bg-surface-high px-3 py-2 text-[12.5px] text-on-surface outline-none focus:ring-2 focus:ring-primary/50"
                />
              </Section>
            )}

            {/* Interactive Material Symbol Icon Swapper */}
            {sel.hasIcon && (
              <Section title="Swap Icon">
                <label className="mb-2 flex h-7 items-center gap-1.5 rounded-xl bg-surface-high px-2.5 text-[11.5px] text-on-surface-variant">
                  <Icon name="search" size={13} />
                  <input
                    value={iconQuery}
                    onChange={(e) => setIconQuery(e.target.value)}
                    placeholder="Filter 150+ bundled icons…"
                    className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant/60"
                  />
                </label>
                <div className="grid max-h-28 grid-cols-7 gap-1 overflow-y-auto rounded-xl bg-surface-low p-1.5">
                  {UI_ICON_NAMES.filter((ic) => !iconQuery.trim() || ic.includes(iconQuery.toLowerCase().trim())).slice(0, 42).map((ic) => (
                    <button
                      key={ic}
                      onClick={() => editor.swapIcon(ic)}
                      title={ic}
                      className="state grid size-8 place-items-center rounded-lg text-on-surface hover:bg-primary hover:text-on-primary"
                    >
                      <Icon name={ic} size={16} />
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* Figma Auto-Layout & Alignment */}
            <Section title="Auto Layout & Flow">
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-low p-1">
                {([
                  ["Row", "flex", "row", "arrow_forward"],
                  ["Col", "flex", "column", "arrow_downward"],
                  ["Grid", "grid", "", "grid_view"],
                  ["Block", "block", "", "crop_landscape"],
                ] as const).map(([lbl, disp, dir, ic]) => {
                  const active =
                    disp === "grid" ? /grid/.test(s.display)
                      : disp === "block" ? !/flex|grid/.test(s.display)
                        : /flex/.test(s.display) && (dir === "column" ? /column/.test(s.fd) : !/column/.test(s.fd));
                  return (
                    <button
                      key={lbl}
                      onClick={() => {
                        if (disp === "grid") editor.style({ display: "grid", "grid-template-columns": "1fr 1fr", gap: (s.gap || 12) + "px" });
                        else if (disp === "block") editor.style({ display: "block" });
                        else editor.style({ display: "flex", "flex-direction": dir, gap: (s.gap || 12) + "px" });
                      }}
                      className={cn(
                        "state flex h-7 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold",
                        active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant hover:text-on-surface"
                      )}
                    >
                      <Icon name={ic} size={13} />{lbl}
                    </button>
                  );
                })}
              </div>

              {flex && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="G" value={s.gap} onChange={(v) => editor.style({ gap: v + "px" })} />
                    <select
                      value={s.jc || "flex-start"}
                      onChange={(e) => editor.style({ "justify-content": e.target.value })}
                      className="h-8 rounded-xl bg-surface-high px-2 text-[11.5px] font-medium text-on-surface outline-none"
                    >
                      <option value="flex-start">Pack Start</option>
                      <option value="center">Center</option>
                      <option value="flex-end">Pack End</option>
                      <option value="space-between">Space Between</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-low p-1">
                    {([
                      ["flex-start", "Align Start"],
                      ["center", "Center"],
                      ["flex-end", "End"],
                      ["stretch", "Stretch"],
                    ] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        onClick={() => editor.style({ "align-items": val })}
                        className={cn(
                          "state h-6 rounded-lg text-[10.5px] font-semibold",
                          s.ai === val ? "bg-surface-highest text-on-surface" : "text-on-surface-variant"
                        )}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Figma Sizing: Fill / Hug / Fixed */}
            <Section
              title="Size"
              right={(!s.autoW || !s.autoH) && (
                <button onClick={() => editor.style({ width: "", height: "" })} className="text-[11px] font-semibold text-primary hover:underline">Reset</button>
              )}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Num label="W" value={s.w} auto={s.autoW} max={4000} onChange={(v) => editor.style({ width: v + "px" })} />
                  <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-surface-low p-0.5 text-[10px] font-semibold">
                    <button onClick={() => editor.style({ width: "fit-content" })} className={cn("rounded py-0.5", s.wMode === "auto" ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>Hug</button>
                    <button onClick={() => editor.style({ width: "100%" })} className={cn("rounded py-0.5", s.wMode === "fill" ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>Fill</button>
                    <button onClick={() => editor.style({ width: s.w + "px" })} className={cn("rounded py-0.5", s.wMode === "fixed" ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>Fixed</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Num label="H" value={s.h} auto={s.autoH} max={4000} onChange={(v) => editor.style({ height: v + "px" })} />
                  <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-surface-low p-0.5 text-[10px] font-semibold">
                    <button onClick={() => editor.style({ height: "" })} className={cn("rounded py-0.5", s.hMode === "auto" ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>Hug</button>
                    <button onClick={() => editor.style({ height: "100%" })} className={cn("rounded py-0.5", s.hMode === "fill" ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>Fill</button>
                    <button onClick={() => editor.style({ height: s.h + "px" })} className={cn("rounded py-0.5", s.hMode === "fixed" ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>Fixed</button>
                  </div>
                </div>
              </div>
            </Section>

            {/* Spacing: Padding & Margin */}
            <Section title="Padding & Margin">
              <div className="grid grid-cols-4 gap-1.5">
                <Num label="T" value={s.pt} onChange={(v) => editor.style({ "padding-top": v + "px" })} />
                <Num label="R" value={s.pr} onChange={(v) => editor.style({ "padding-right": v + "px" })} />
                <Num label="B" value={s.pb} onChange={(v) => editor.style({ "padding-bottom": v + "px" })} />
                <Num label="L" value={s.pl} onChange={(v) => editor.style({ "padding-left": v + "px" })} />
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <Num label="MT" value={s.mt} min={-200} onChange={(v) => editor.style({ "margin-top": v + "px" })} />
                <Num label="MB" value={s.mb} min={-200} onChange={(v) => editor.style({ "margin-bottom": v + "px" })} />
              </div>
            </Section>

            {/* Typography */}
            {sel.text !== null && (
              <Section title="Typography">
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const fam = e.target.value.split(",")[0].replace(/['"]/g, "").trim();
                    installDesignFonts([fam]);
                    editor.style({ "font-family": e.target.value });
                  }}
                  className="mb-2 h-8 w-full rounded-xl bg-surface-high px-2.5 text-[12px] text-on-surface outline-none"
                >
                  <option value="">Font family ({s.ff.split(",")[0].replace(/['"]/g, "")})</option>
                  <option value="var(--font)">Design System Body (--font)</option>
                  <option value="var(--heading)">Design System Heading (--heading)</option>
                  {DESIGN_FONTS.map((f) => <option key={f.family} value={`"${f.family}", sans-serif`}>{f.family} · {f.feel}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Num label="Aa" value={s.fs} min={11} max={200} onChange={(v) => editor.style({ "font-size": v + "px" })} />
                  <select
                    value={String(Math.round(Number(s.fw) / 100) * 100)} onChange={(e) => editor.style({ "font-weight": e.target.value })}
                    className="h-8 rounded-xl bg-surface-high px-2.5 text-[12px] text-on-surface outline-none"
                  >
                    {WEIGHTS.map(([w, n]) => <option key={w} value={w}>{n}</option>)}
                  </select>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-0.5 rounded-full bg-surface-high p-0.5">
                    {([["left", "format_align_left"], ["center", "format_align_center"], ["right", "format_align_right"]] as const).map(([v, ic]) => (
                      <IconBtn key={v} label={`Align ${v}`} size={28} active={s.ta === v || (v === "left" && s.ta === "start")} onClick={() => editor.style({ "text-align": v })}><Icon name={ic} size={15} /></IconBtn>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1"><Color label="Text" value={s.color} onChange={(c) => editor.style({ color: c })} /></div>
                </div>
              </Section>
            )}

            {/* Surface Fill & Design Tokens */}
            <Section title="Fill & System Tokens">
              <div className="space-y-2">
                <Color label="Fill" value={s.bg} onChange={(c) => editor.style({ "background-color": c, "background-image": "none" })} onClear={() => editor.style({ "background-color": "transparent", "background-image": "none" })} />
                <div className="flex flex-wrap gap-1">
                  {TOKEN_SWATCHES.map((t) => (
                    <button
                      key={t.val}
                      onClick={() => editor.style({ "background-color": t.val, ...(t.val === "var(--primary)" ? { color: "var(--on-primary)" } : t.val === "var(--container)" ? { color: "var(--on-container)" } : {}) })}
                      className="state rounded-full border border-outline-variant/60 bg-surface-low px-2 py-0.5 text-[10.5px] font-medium text-on-surface-variant hover:border-primary hover:text-on-surface"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex h-8 items-center gap-3 rounded-xl bg-surface-high px-3 text-[12px] text-on-surface-variant">
                  <span className="w-12 shrink-0 font-medium">Opacity</span>
                  <input type="range" min={0} max={100} value={Math.round(s.op * 100)} onChange={(e) => editor.style({ opacity: String(Number(e.target.value) / 100) })} className="min-w-0 flex-1 accent-[var(--m-primary)]" />
                  <span className="w-8 text-right font-mono text-[11px] text-on-surface">{Math.round(s.op * 100)}%</span>
                </div>
              </div>
            </Section>

            {/* Border & Corner Radius */}
            <Section title="Corner Radius & Border">
              <div className="grid grid-cols-2 gap-2">
                <Num label="R" value={s.br} max={999} onChange={(v) => editor.style({ "border-radius": v + "px" })} />
                <Num label="W" value={s.bw} max={40} onChange={(v) => editor.style({ "border-width": v + "px", "border-style": v ? "solid" : "none" })} />
              </div>
              <div className="mt-1.5 flex gap-1">
                {[0, 8, 14, 24, 999].map((r) => (
                  <button
                    key={r}
                    onClick={() => editor.style({ "border-radius": r + "px" })}
                    className="state flex-1 rounded-lg bg-surface-low py-1 text-[10.5px] font-semibold text-on-surface-variant hover:bg-surface-high hover:text-on-surface"
                  >
                    {r === 999 ? "Pill" : `${r}px`}
                  </button>
                ))}
              </div>
              {s.bw > 0 && <div className="mt-2"><Color label="Border" value={s.bc} onChange={(c) => editor.style({ "border-color": c })} /></div>}
            </Section>
            <div className="h-3" />
          </div>
        )
      )}
    </aside>
  );
}
