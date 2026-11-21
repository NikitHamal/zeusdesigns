import { useState } from "react";
import { useStore } from "../store";
import { canvasApi } from "../lib/canvasApi";
import { download } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, MenuItem, MenuLabel, Segmented } from "./ui";
import { InfiniteCanvas } from "./Canvas";
import { BottomToolbar } from "./BottomToolbar";
import { CompareDialog, GridView, SingleView } from "./Views";
import { Icon } from "./Icon";

function ProjectName() {
  const name = useStore((s) => s.projectName);
  const setName = useStore((s) => s.setProjectName);
  return (
    <input
      value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} aria-label="Project name"
      className="h-10 w-40 rounded-full bg-surface-container px-4 text-sm font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary/40 max-xl:hidden"
    />
  );
}

function PageTabs() {
  const pages = useStore((s) => s.pages);
  const active = useStore((s) => s.activePageId);
  const { setActivePage, addPage, renamePage, deletePage } = useStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-surface-container/90 p-1   backdrop-blur">
      {pages.map((p) => (
        <div key={p.id} className="group relative flex shrink-0 items-center">
          {editing === p.id ? (
            <input
              autoFocus defaultValue={p.name} onBlur={(e) => { renamePage(p.id, e.target.value || p.name); setEditing(null); }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-8 w-28 rounded-full bg-surface-high px-3 text-[13px] font-medium outline-none ring-2 ring-primary"
            />
          ) : (
            <button
              onClick={() => setActivePage(p.id)} onDoubleClick={() => setEditing(p.id)}
              className={cn("state h-8 rounded-full px-3.5 text-[13px] font-semibold transition-all", active === p.id ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant")}
            >
              {p.name}
            </button>
          )}
          {pages.length > 1 && active === p.id && editing !== p.id && (
            <button onClick={() => deletePage(p.id)} title="Delete page" className="ml-0.5 grid size-5 place-items-center rounded-full text-on-surface-variant hover:bg-surface-highest"><Icon name="close" size={12} /></button>
          )}
        </div>
      ))}
      <IconBtn label="New page" size={32} onClick={addPage}><Icon name="add" size={16} /></IconBtn>
    </div>
  );
}

function ZoomControls() {
  const pageId = useStore((s) => s.activePageId);
  const z = useStore((s) => s.viewport[pageId]?.z ?? 0.7);
  const sel = useStore((s) => s.sel);
  return (
    <div className="absolute bottom-5 right-5 z-30 flex items-center gap-0.5 rounded-full bg-surface-container p-1   ring-1 ring-outline-variant/50" onPointerDown={(e) => e.stopPropagation()}>
      <IconBtn label="Zoom out" size={34} onClick={() => canvasApi.zoomBy(1 / 1.25)}><Icon name="remove" size={16} /></IconBtn>
      <button onClick={() => canvasApi.reset()} title="Reset zoom" className="state w-12 rounded-full py-1.5 text-center text-xs font-semibold tabular-nums text-on-surface">{Math.round(z * 100)}%</button>
      <IconBtn label="Zoom in" size={34} onClick={() => canvasApi.zoomBy(1.25)}><Icon name="add" size={16} /></IconBtn>
      <IconBtn label={sel.length ? "Zoom to selection (2)" : "Fit all (1)"} size={34} onClick={() => canvasApi.fit(sel.length ? sel : undefined)}><Icon name="fit_screen" size={16} /></IconBtn>
    </div>
  );
}

export function CanvasPane() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const chatCollapsed = useStore((s) => s.ui.chatCollapsed);
  const patchUI = useStore((s) => s.patchUI);
  const pageId = useStore((s) => s.activePageId);
  const allBoards = useStore((s) => s.artboards);
  const sel = useStore((s) => s.sel);
  const boards = allBoards.filter((a) => a.pageId === pageId);
  const pickedBoards = boards.filter((b) => sel.includes(b.id));

  const arrange = () => {
    const st = useStore.getState();
    const list = (pickedBoards.length > 1 ? pickedBoards : boards).slice();
    if (list.length < 2) return;
    let x = Math.min(...list.map((b) => b.x));
    const y = Math.min(...list.map((b) => b.y));
    const map = new Map<string, number>();
    list.forEach((b) => { map.set(b.id, x); x += b.w + 100; });
    useStore.setState({ artboards: st.artboards.map((b) => (map.has(b.id) ? { ...b, x: map.get(b.id)!, y } : b)) });
    setTimeout(() => canvasApi.fit(list.map((b) => b.id)), 30);
  };
  const exportAll = () => {
    boards.forEach((b, i) => setTimeout(() => download(`${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`, b.html, "text/html"), i * 150));
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest">
      {view === "canvas" ? <InfiniteCanvas /> : view === "grid" ? <GridView /> : <SingleView />}

      {/* header overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3.5" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <ProjectName />
          {chatCollapsed && <IconBtn label="Show chat" tonal onClick={() => patchUI({ chatCollapsed: false })}><Icon name="left_panel_open" size={18} /></IconBtn>}
          <PageTabs />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Segmented
            value={view} onChange={setView}
            options={[
              { id: "canvas", icon: <Icon name="layers" size={15} />, label: "Canvas", title: "Infinite canvas" },
              { id: "grid", icon: <Icon name="grid_view" size={15} />, label: "Grid" },
              { id: "single", icon: <Icon name="crop_landscape" size={15} />, label: "Single" },
            ]}
          />
          <Dropdown align="right" width={250} trigger={({ toggle }) => (
            <button onClick={toggle} className="state morph flex h-10 items-center gap-2 rounded-full bg-surface-container px-4 text-sm font-semibold text-on-surface  ">
              <Icon name="compare" size={16} /> Compare
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
                <MenuItem icon={<Icon name="layers" size={16} />} label="Line up side by side" desc="Arrange in a row on the canvas" onClick={() => { arrange(); setView("canvas"); close(); }} />
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
        </div>
      </div>

      {view === "canvas" && <ZoomControls />}
      <BottomToolbar />
      <CompareDialog />
    </div>
  );
}
