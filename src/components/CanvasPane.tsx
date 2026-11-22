import { useState } from "react";
import { useStore } from "../store";
import { canvasApi } from "../lib/canvasApi";
import { download, refreshTree, writeWorkspaceFile } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, MenuItem, MenuLabel, Segmented } from "./ui";
import { InfiniteCanvas } from "./Canvas";
import { BottomToolbar } from "./BottomToolbar";
import { CompareDialog, GridView, SingleView } from "./Views";
import { Icon } from "./Icon";
import { Inspector } from "./Inspector";
import { editor, useEditor } from "../lib/editor";
import { DESIGN_SYSTEMS, getDS } from "../lib/designSystems";
import { BLOCK_CATEGORIES, insertBlockIntoHtml, UI_BLOCKS, type BlockCategory } from "../lib/blocks";
import { DEVICE_SIZE, type Device } from "../types";

const DEV_ICON = { mobile: "smartphone", tablet: "tablet", web: "desktop_windows" } as const;

const QUICK_PRIMITIVES = [
  { id: "auto_row", label: "Row", icon: "arrow_forward" },
  { id: "auto_col", label: "Column", icon: "arrow_downward" },
  { id: "grid_2", label: "Grid 2x", icon: "grid_view" },
  { id: "card_surface", label: "Card", icon: "crop_landscape" },
  { id: "heading_block", label: "Heading", icon: "text_fields" },
  { id: "button_primary", label: "Button", icon: "ads_click" },
  { id: "input_field", label: "Input", icon: "edit" },
  { id: "chart_area", label: "Chart", icon: "bar_chart" },
] as const;

function ProjectName() {
  const name = useStore((s) => s.projectName);
  const setName = useStore((s) => s.setProjectName);
  return (
    <input
      value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} aria-label="Project name"
      className="h-8 w-32 min-w-0 shrink rounded-lg border border-outline-variant/60 bg-surface-low px-2.5 text-xs font-semibold text-on-surface outline-none focus:border-primary @max-[980px]:hidden"
    />
  );
}

function PageTabs() {
  const allPages = useStore((s) => s.pages);
  const convId = useStore((s) => s.activeConvId);
  const active = useStore((s) => s.activePageId);
  const { setActivePage, addPage, renamePage, deletePage } = useStore.getState();
  const [editing, setEditing] = useState(false);
  const pages = allPages.filter((p) => !p.convId || p.convId === convId);
  const cur = pages.find((p) => p.id === active) ?? pages[0] ?? allPages[0];
  if (editing) {
    return (
      <input
        autoFocus defaultValue={cur.name} onBlur={(e) => { renamePage(cur.id, e.target.value.trim() || cur.name); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
        className="h-8 w-32 rounded-lg border border-primary bg-surface-low px-2.5 text-xs font-semibold outline-none"
      />
    );
  }
  return (
    <Dropdown width={220} trigger={({ toggle, open }) => (
      <button onClick={toggle} className={cn("state flex h-8 max-w-[160px] items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface-low px-2.5 text-xs font-semibold text-on-surface", open && "bg-surface-high")}>
        <span className="truncate">{cur.name}</span><Icon name="expand_more" size={14} className="shrink-0 text-on-surface-variant" />
      </button>
    )}>
      {(close) => (
        <>
          {pages.map((p) => <MenuItem key={p.id} label={p.name} active={p.id === active} onClick={() => { setActivePage(p.id); close(); }} />)}
          <div className="my-1.5 border-t border-outline-variant/70" />
          <MenuItem icon={<Icon name="add" size={16} />} label="New page" onClick={() => { addPage(); close(); }} />
          <MenuItem icon={<Icon name="edit" size={16} />} label="Rename page" onClick={() => { close(); setEditing(true); }} />
          {pages.length > 1 && <MenuItem danger icon={<Icon name="delete" size={16} />} label="Delete page" onClick={() => { deletePage(cur.id); close(); }} />}
        </>
      )}
    </Dropdown>
  );
}

function ZoomControls() {
  const pageId = useStore((s) => s.activePageId);
  const z = useStore((s) => s.viewport[pageId]?.z ?? 0.7);
  const sel = useStore((s) => s.sel);
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-outline-variant/60 bg-surface-low p-0.5">
      <IconBtn label="Zoom out (-)" size={28} onClick={() => canvasApi.zoomBy(1 / 1.25)}><Icon name="remove" size={14} /></IconBtn>
      <button onClick={() => canvasApi.reset()} title="Reset zoom" className="state w-11 rounded-md py-1 text-center text-[11px] font-semibold tabular-nums text-on-surface">{Math.round(z * 100)}%</button>
      <IconBtn label="Zoom in (+)" size={28} onClick={() => canvasApi.zoomBy(1.25)}><Icon name="add" size={14} /></IconBtn>
      <IconBtn label={sel.length ? "Zoom to selection (2)" : "Fit all (1)"} size={28} onClick={() => canvasApi.fit(sel.length ? sel : undefined)}><Icon name="fit_screen" size={14} /></IconBtn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Figma / Penpot Left Studio Rail: Screens, Layers & Drag-Drop Assets */
/* ------------------------------------------------------------------ */
function LeftStudioRail({ onClose }: { onClose: () => void }) {
  const [railTab, setRailTab] = useState<"assets" | "screens">("assets");
  const [cat, setCat] = useState<BlockCategory | "all">("all");
  const [q, setQ] = useState("");
  const pageId = useStore((s) => s.activePageId);
  const allBoards = useStore((s) => s.artboards);
  const sel = useStore((s) => s.sel);
  const editId = useStore((s) => s.ui.editId);
  const dsId = useStore((s) => s.settings.designSystemId);
  const boards = allBoards.filter((a) => a.pageId === pageId);
  const targetBoard = boards.find((b) => b.id === editId) ?? boards.find((b) => sel.includes(b.id)) ?? boards[0];

  const spawnFrame = (dev: Device) => {
    const st = useStore.getState();
    const sz = DEVICE_SIZE[dev];
    const pos = st.slot(st.activePageId, sz.w, sz.h);
    const ab = st.addBlankFrame(pos.x, pos.y, sz.w, sz.h);
    st.updateArtboard(ab.id, { device: dev, name: `${sz.label} Screen` });
    st.setSel([ab.id]);
    useEditor.getState().begin(ab.id, ab.html, "design");
    useEditor.getState().setInsertOpen(true);
    st.patchUI({ editId: ab.id, interactId: null });
    setTimeout(() => canvasApi.fit([ab.id]), 40);
  };

  const quickInsert = (blockId: string) => {
    const st = useStore.getState();
    const ds = getDS(dsId);
    const b = UI_BLOCKS.find((x) => x.id === blockId);
    if (!b) return;
    if (editId && targetBoard && targetBoard.id === editId && b.slot !== "screen" && b.slot !== "top" && b.slot !== "bottom" && !targetBoard.html.includes("data-zeus-empty-frame")) {
      editor.insertHtml(b.html(), "append");
      st.notify(`Inserted ${b.name}`);
      return;
    }
    if (targetBoard) {
      const dev = b.device ?? targetBoard.device;
      const updated = insertBlockIntoHtml(targetBoard.html, blockId, ds, dev);
      st.reviseArtboard(targetBoard.id, updated);
      if (b.slot === "screen") {
        st.updateArtboard(targetBoard.id, { name: b.name, device: dev, w: dev === "web" ? 1280 : 390, h: dev === "web" ? 800 : 844 });
      }
      st.setSel([targetBoard.id]);
      st.notify(`Added ${b.name} to ${targetBoard.name}`);
      return;
    }
    const dev = b.device ?? "mobile";
    const fw = dev === "web" ? 1280 : 390;
    const fh = dev === "web" ? 800 : 844;
    const pos = st.slot(st.activePageId, fw, fh);
    const ab = st.addBlankFrame(pos.x, pos.y, fw, fh);
    const updated = insertBlockIntoHtml(ab.html, blockId, ds, dev);
    st.updateArtboard(ab.id, { name: b.slot === "screen" ? b.name : "Custom Screen", device: dev, html: updated });
    st.setSel([ab.id]);
    setTimeout(() => canvasApi.fit([ab.id]), 40);
    st.notify(`Created ${b.name}`);
  };

  const filtered = UI_BLOCKS.filter((b) => {
    if (cat !== "all" && b.category !== cat) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return b.name.toLowerCase().includes(s) || b.desc.toLowerCase().includes(s);
  });

  return (
    <aside
      className="pointer-events-auto z-30 flex h-full w-[252px] shrink-0 flex-col overflow-hidden border-r border-outline-variant/60 bg-surface-container"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-1 border-b border-outline-variant/60 px-2.5 py-2">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg bg-surface-low p-0.5 text-[11.5px] font-semibold">
          <button
            onClick={() => setRailTab("assets")}
            className={cn("state flex h-6 items-center justify-center gap-1 rounded-md", railTab === "assets" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface")}
          >
            <Icon name="widgets" size={13} />
            <span>Assets</span>
          </button>
          <button
            onClick={() => setRailTab("screens")}
            className={cn("state flex h-6 items-center justify-center gap-1 rounded-md", railTab === "screens" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface")}
          >
            <Icon name="layers" size={13} />
            <span>Screens ({boards.length})</span>
          </button>
        </div>
        <IconBtn label="Hide left dock" size={26} onClick={onClose}><Icon name="close" size={14} /></IconBtn>
      </div>

      {railTab === "screens" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-2 gap-1.5 border-b border-outline-variant/50 p-2.5">
            <button
              onClick={() => spawnFrame("mobile")}
              className="state flex h-8 items-center justify-center gap-1.5 rounded-xl bg-primary-container text-xs font-semibold text-on-primary-container"
            >
              <Icon name="smartphone" size={14} /> + Mobile
            </button>
            <button
              onClick={() => spawnFrame("web")}
              className="state flex h-8 items-center justify-center gap-1.5 rounded-xl bg-surface-high text-xs font-semibold text-on-surface"
            >
              <Icon name="desktop_windows" size={14} /> + Web
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {boards.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-on-surface-variant">
                No screens on this page yet. Click + Mobile or + Web above, or drag any UI block onto the canvas.
              </div>
            ) : (
              boards.map((b) => {
                const isSelected = sel.includes(b.id);
                const isEditing = editId === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      useStore.getState().setSel([b.id]);
                      canvasApi.fit([b.id]);
                    }}
                    onDoubleClick={() => {
                      useEditor.getState().begin(b.id, b.html, "design");
                      useEditor.getState().setInsertOpen(true);
                      useStore.getState().patchUI({ editId: b.id, interactId: null });
                    }}
                    className={cn(
                      "group flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-colors",
                      isEditing
                        ? "bg-primary text-on-primary font-semibold"
                        : isSelected
                          ? "bg-primary-container text-on-primary-container font-semibold"
                          : "text-on-surface hover:bg-surface-high"
                    )}
                  >
                    <Icon name={DEV_ICON[b.device]} size={14} className="shrink-0 opacity-80" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{b.name}</div>
                      <div className="font-mono text-[10px] opacity-70">{b.w}×{b.h} · v{b.version}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditing) {
                          editor.finish();
                        } else {
                          useEditor.getState().begin(b.id, b.html, "design");
                          useEditor.getState().setInsertOpen(true);
                          useStore.getState().patchUI({ editId: b.id, interactId: null });
                        }
                      }}
                      title={isEditing ? "Finish editing" : "Edit DOM & Auto-Layout"}
                      className="grid size-6 place-items-center rounded-lg bg-black/10 hover:bg-black/20"
                    >
                      <Icon name={isEditing ? "check" : "ads_click"} size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Figma Primitives Quick Grid */}
          <div className="border-b border-outline-variant/50 p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-on-surface-variant">
              <span>Quick Primitives (Click or Drag)</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {QUICK_PRIMITIVES.map((p) => (
                <button
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-zeus-block", p.id);
                    e.dataTransfer.effectAllowed = "copy";
                    useEditor.getState().setDraggingBlockId(p.id);
                  }}
                  onDragEnd={() => useEditor.getState().setDraggingBlockId(null)}
                  onClick={() => quickInsert(p.id)}
                  title={`Click or drag ${p.label} onto canvas`}
                  className="state flex flex-col items-center justify-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-low py-1.5 text-[10.5px] font-semibold text-on-surface hover:border-primary/60 hover:bg-surface-high"
                >
                  <Icon name={p.icon} size={15} className="text-primary" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="space-y-1.5 border-b border-outline-variant/50 p-2.5">
            <label className="flex h-7 items-center gap-1.5 rounded-lg bg-surface-high px-2 text-xs text-on-surface-variant">
              <Icon name="search" size={13} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter 38+ UI blocks…"
                className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant/60"
              />
              {q && <button onClick={() => setQ("")}><Icon name="close" size={12} /></button>}
            </label>
            <div className="no-bar flex gap-1 overflow-x-auto pb-0.5">
              <button
                onClick={() => setCat("all")}
                className={cn("state shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", cat === "all" ? "bg-secondary-container text-on-secondary-container" : "bg-surface-high text-on-surface-variant")}
              >
                All
              </button>
              {BLOCK_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={cn("state shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", cat === c.id ? "bg-secondary-container text-on-secondary-container" : "bg-surface-high text-on-surface-variant")}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Draggable Component List */}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {filtered.map((b) => (
              <button
                key={b.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-zeus-block", b.id);
                  e.dataTransfer.effectAllowed = "copy";
                  useEditor.getState().setDraggingBlockId(b.id);
                }}
                onDragEnd={() => useEditor.getState().setDraggingBlockId(null)}
                onClick={() => quickInsert(b.id)}
                className="state group flex w-full items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-low p-2 text-left transition-colors hover:border-primary/60 hover:bg-surface-high"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-container/70 text-on-primary-container">
                  <Icon name={b.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-on-surface">{b.name}</span>
                  <span className="block truncate text-[10.5px] text-on-surface-variant">{b.desc}</span>
                </span>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-highest text-on-surface-variant group-hover:bg-primary group-hover:text-on-primary">
                  <Icon name="add" size={14} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

export function CanvasPane() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const chatCollapsed = useStore((s) => s.ui.chatCollapsed);
  const editId = useStore((s) => s.ui.editId);
  const insertOpen = useEditor((s) => s.insertOpen);
  const patchUI = useStore((s) => s.patchUI);
  const pageId = useStore((s) => s.activePageId);
  const allBoards = useStore((s) => s.artboards);
  const sel = useStore((s) => s.sel);
  const dsId = useStore((s) => s.settings.designSystemId);
  const patchSettings = useStore((s) => s.patchSettings);
  const ds = getDS(dsId);
  const boards = allBoards.filter((a) => a.pageId === pageId);
  const pickedBoards = boards.filter((b) => sel.includes(b.id));
  const studioActive = !!editId || insertOpen;
  const [leftRailOpen, setLeftRailOpen] = useState(false);

  const spawnBlankFrame = (dev: Device) => {
    const st = useStore.getState();
    const sz = DEVICE_SIZE[dev];
    const pos = st.slot(st.activePageId, sz.w, sz.h);
    const ab = st.addBlankFrame(pos.x, pos.y, sz.w, sz.h);
    st.updateArtboard(ab.id, { device: dev, name: `${sz.label} Frame` });
    st.setSel([ab.id]);
    useEditor.getState().begin(ab.id, ab.html, "design");
    useEditor.getState().setInsertOpen(true);
    setLeftRailOpen(true);
    st.patchUI({ editId: ab.id, interactId: null });
    setTimeout(() => canvasApi.fit([ab.id]), 40);
  };

  const arrange = (grid = false) => {
    const st = useStore.getState();
    const list = (pickedBoards.length > 1 ? pickedBoards : boards).slice();
    if (list.length < 2) return;
    const x0 = Math.min(...list.map((b) => b.x));
    const y0 = Math.min(...list.map((b) => b.y));
    const pos = new Map<string, { x: number; y: number }>();
    if (grid) {
      const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(list.length))));
      let x = x0, y = y0, rowH = 0;
      list.forEach((b, i) => {
        if (i > 0 && i % cols === 0) { x = x0; y += rowH + 100; rowH = 0; }
        pos.set(b.id, { x, y });
        x += b.w + 100;
        rowH = Math.max(rowH, b.h);
      });
    } else {
      let x = x0;
      list.forEach((b) => { pos.set(b.id, { x, y: y0 }); x += b.w + 100; });
    }
    useStore.setState({ artboards: st.artboards.map((b) => (pos.has(b.id) ? { ...b, ...pos.get(b.id)! } : b)) });
    setTimeout(() => canvasApi.fit(list.map((b) => b.id)), 30);
  };
  const exportAll = () => {
    boards.forEach((b, i) => setTimeout(() => download(`${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`, b.html, "text/html"), i * 150));
  };

  return (
    <div className="@container flex h-full w-full flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest">
      {/* Docked Figma Studio Top Toolbar */}
      <header className="z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-outline-variant/60 bg-surface-container px-3" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 shrink items-center gap-1.5">
          {chatCollapsed && <IconBtn label="Show chat" size={32} tonal onClick={() => patchUI({ chatCollapsed: false })}><Icon name="left_panel_open" size={17} /></IconBtn>}
          <button
            onClick={() => setLeftRailOpen((v) => !v)}
            title="Toggle Figma Assets & Screens Rail"
            className={cn(
              "state flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
              leftRailOpen
                ? "border-primary bg-primary-container text-on-primary-container"
                : "border-outline-variant/60 bg-surface-low text-on-surface"
            )}
          >
            <Icon name="widgets" size={15} />
            <span className="@max-[820px]:hidden">Assets</span>
          </button>
          <PageTabs />
          <ProjectName />
          <div className="flex items-center gap-1 @max-[1100px]:hidden">
            <button
              onClick={() => spawnBlankFrame("mobile")}
              title="Add blank Mobile frame (390×844)"
              className="state flex h-8 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface-low px-2 text-xs font-semibold text-on-surface hover:border-primary/60"
            >
              <Icon name="add" size={14} className="text-primary" />
              <span>Mobile</span>
            </button>
            <button
              onClick={() => spawnBlankFrame("web")}
              title="Add blank Web frame (1280×800)"
              className="state flex h-8 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface-low px-2 text-xs font-semibold text-on-surface hover:border-primary/60"
            >
              <Icon name="add" size={14} className="text-primary" />
              <span>Web</span>
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Segmented
            value={view} onChange={setView}
            options={[
              { id: "canvas", icon: <Icon name="layers" size={15} />, title: "Infinite canvas" },
              { id: "grid", icon: <Icon name="grid_view" size={15} />, title: "Grid" },
              { id: "single", icon: <Icon name="crop_landscape" size={15} />, title: "Single screen" },
            ]}
          />
          <Dropdown align="right" width={280} trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              title={`Active Design System: ${ds.name} — click to live re-theme canvas`}
              className={cn(
                "state flex h-8 items-center gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-low px-2.5 text-xs font-semibold text-on-surface",
                open && "bg-surface-high"
              )}
            >
              <span className="size-2.5 shrink-0 rounded-full border border-black/15" style={{ background: ds.tokens.primary }} />
              <span className="max-w-[115px] truncate @max-[1020px]:hidden">{ds.name}</span>
              <Icon name="expand_more" size={13} className="shrink-0 text-on-surface-variant" />
            </button>
          )}>
            {(close) => (
              <>
                <MenuLabel>Design System (live re-theme)</MenuLabel>
                {DESIGN_SYSTEMS.map((d) => (
                  <MenuItem
                    key={d.id}
                    active={d.id === dsId}
                    icon={<span className="size-3.5 rounded-full border border-black/15" style={{ background: d.tokens.primary }} />}
                    label={d.name}
                    desc={d.vendor}
                    onClick={() => {
                      patchSettings({ designSystemId: d.id });
                      useStore.getState().notify(`Switched to ${d.name}`);
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </Dropdown>
          <button
            onClick={() => {
              const ed = useEditor.getState();
              if (studioActive) {
                ed.setInsertOpen(false);
                if (editId) editor.finish();
              } else {
                const target = pickedBoards[0] ?? boards[0];
                if (target) {
                  ed.begin(target.id, target.html, "design");
                  patchUI({ editId: target.id, interactId: null });
                  useStore.getState().setSel([target.id]);
                } else {
                  ed.setTab("insert");
                }
                ed.setInsertOpen(true);
              }
            }}
            title="Toggle Right Figma Inspector (Design · Insert · Layers · Code)"
            className={cn(
              "state flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
              studioActive
                ? "border-primary bg-primary-container text-on-primary-container"
                : "border-outline-variant/60 bg-surface-low text-on-surface"
            )}
          >
            <Icon name="tune" size={15} />
            <span className="@max-[880px]:hidden">Inspector</span>
          </button>
          <Dropdown align="right" width={250} trigger={({ toggle }) => (
            <button onClick={toggle} className="state flex h-8 items-center gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-low px-2.5 text-xs font-semibold text-on-surface @max-[760px]:hidden">
              <Icon name="compare" size={15} /><span className="@max-[960px]:hidden">Compare</span>
            </button>
          )}>
            {(close) => (
              <>
                <MenuLabel>Variants</MenuLabel>
                <MenuItem icon={<Icon name="compare" size={16} />} label="Compare two screens" desc={pickedBoards.length >= 2 ? "Selected screens" : "First two on this page"} onClick={() => {
                  const l = pickedBoards.length >= 2 ? pickedBoards : boards;
                  if (l.length < 2) useStore.getState().notify("Need at least two screens to compare"); else patchUI({ compare: [l[0].id, l[1].id] });
                  close();
                }} />
                <MenuItem icon={<Icon name="layers" size={16} />} label="Line up side by side" desc="Arrange in a horizontal row" onClick={() => { arrange(false); setView("canvas"); close(); }} />
                <MenuItem icon={<Icon name="grid_view" size={16} />} label="Arrange in grid" desc="Tidy into a multi-column grid" onClick={() => { arrange(true); setView("canvas"); close(); }} />
                <MenuLabel>Page</MenuLabel>
                <MenuItem icon={<Icon name="download" size={16} />} label="Export all screens (HTML)" onClick={() => { exportAll(); close(); }} />
                <MenuItem icon={<Icon name="delete" size={16} />} danger label="Clear page" onClick={() => {
                  const st = useStore.getState();
                  st.removeArtboards(boards.map((b) => b.id));
                  useStore.setState({ elements: st.elements.filter((e) => e.pageId !== pageId), pins: st.pins.filter((p) => p.pageId !== pageId) });
                  close();
                }} />
              </>
            )}
          </Dropdown>
          <Dropdown align="right" width={260} trigger={({ toggle }) => (
            <button onClick={toggle} disabled={boards.length === 0} className="state flex h-8 items-center gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-low px-2.5 text-xs font-semibold text-on-surface disabled:opacity-40">
              <Icon name="download" size={15} /><span className="@max-[960px]:hidden">Export</span>
            </button>
          )}>
            {(close) => (
              <>
                <MenuItem icon={<Icon name="download" size={16} />} label="All screens as HTML" onClick={() => { exportAll(); close(); }} />
                <MenuItem
                  icon={<Icon name="folder_open" size={16} />} label="Save into project folder"
                  onClick={async () => {
                    close();
                    const ws = useStore.getState().ui.workspace;
                    if (!ws) { useStore.getState().notify("Open a project folder first"); return; }
                    try {
                      for (const b of boards) await writeWorkspaceFile(ws, `design/${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen"}.html`, b.html);
                      useStore.getState().patchUI({ workspace: { ...ws, tree: await refreshTree(ws) } });
                      useStore.getState().notify(`Saved ${boards.length} screen${boards.length > 1 ? "s" : ""} to design/`);
                    } catch (e) { useStore.getState().notify((e as Error).message || "Could not write files"); }
                  }}
                />
              </>
            )}
          </Dropdown>
          {view === "canvas" && <ZoomControls />}
        </div>
      </header>

      {/* Main Docked Figma Workspace Row: Left Assets/Screens Rail + Center Canvas + Right Inspector */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {leftRailOpen && view === "canvas" && <LeftStudioRail onClose={() => setLeftRailOpen(false)} />}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {view === "canvas" ? <InfiniteCanvas /> : view === "grid" ? <GridView /> : <SingleView />}
          <BottomToolbar />
        </div>
        <Inspector />
      </div>

      <CompareDialog />
    </div>
  );
}
