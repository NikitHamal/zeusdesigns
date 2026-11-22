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

function ProjectName() {
  const name = useStore((s) => s.projectName);
  const setName = useStore((s) => s.setProjectName);
  return (
    <input
      value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} aria-label="Project name"
      className="h-10 w-40 min-w-0 shrink rounded-xl border border-outline-variant bg-surface-container px-3 text-sm font-medium text-on-surface outline-none focus:border-primary @max-[900px]:hidden"
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
        className="h-10 w-36 rounded-xl border border-primary bg-surface-container px-3 text-sm font-medium outline-none"
      />
    );
  }
  return (
    <Dropdown width={230} trigger={({ toggle, open }) => (
      <button onClick={toggle} className={cn("state flex h-10 max-w-[200px] items-center gap-1.5 rounded-xl border border-outline-variant bg-surface-container px-3 text-sm font-medium text-on-surface", open && "bg-surface-high")}>
        <span className="truncate">{cur.name}</span><Icon name="expand_more" size={15} className="shrink-0 text-on-surface-variant" />
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
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-surface-container p-1 ring-1 ring-outline-variant/50">
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
  const editId = useStore((s) => s.ui.editId);
  const insertOpen = useEditor((s) => s.insertOpen);
  const patchUI = useStore((s) => s.patchUI);
  const pageId = useStore((s) => s.activePageId);
  const allBoards = useStore((s) => s.artboards);
  const sel = useStore((s) => s.sel);
  const boards = allBoards.filter((a) => a.pageId === pageId);
  const pickedBoards = boards.filter((b) => sel.includes(b.id));
  const studioActive = !!editId || insertOpen;

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
    <div className="@container relative h-full w-full overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest">
      {view === "canvas" ? <InfiniteCanvas /> : view === "grid" ? <GridView /> : <SingleView />}

      {/* header overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3.5" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pointer-events-auto flex min-w-0 shrink items-center gap-2">
          <ProjectName />
          {chatCollapsed && <IconBtn label="Show chat" tonal onClick={() => patchUI({ chatCollapsed: false })}><Icon name="left_panel_open" size={18} /></IconBtn>}
          <PageTabs />
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <Segmented
            value={view} onChange={setView}
            options={[
              { id: "canvas", icon: <Icon name="layers" size={16} />, title: "Infinite canvas" },
              { id: "grid", icon: <Icon name="grid_view" size={16} />, title: "Grid" },
              { id: "single", icon: <Icon name="crop_landscape" size={16} />, title: "Single screen" },
            ]}
          />
          <button
            onClick={() => {
              const ed = useEditor.getState();
              if (studioActive) {
                ed.setInsertOpen(false);
                if (editId) editor.finish();
              } else {
                const target = pickedBoards[0] ?? boards[0];
                if (target) {
                  ed.begin(target.id, target.html, "insert");
                  patchUI({ editId: target.id, interactId: null });
                  useStore.getState().setSel([target.id]);
                } else {
                  ed.setTab("insert");
                }
                ed.setInsertOpen(true);
              }
            }}
            title="Toggle Figma Studio Panel (Design · Insert · Layers · Code)"
            className={cn(
              "state flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors",
              studioActive
                ? "border-primary bg-primary-container text-on-primary-container"
                : "border-outline-variant bg-surface-container text-on-surface"
            )}
          >
            <Icon name="widgets" size={16} />
            <span className="@max-[900px]:hidden">Studio</span>
          </button>
          <Dropdown align="right" width={260} trigger={({ toggle }) => (
            <button onClick={toggle} disabled={boards.length === 0} className="state flex h-10 items-center gap-2 rounded-xl border border-outline-variant bg-surface-container px-3.5 text-sm font-medium text-on-surface">
              <Icon name="download" size={16} /><span className="@max-[900px]:hidden">Export</span>
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
          <Dropdown align="right" width={250} trigger={({ toggle }) => (
            <button onClick={toggle} className="state flex h-10 items-center gap-2 rounded-xl border border-outline-variant bg-surface-container px-3.5 text-sm font-medium text-on-surface">
              <Icon name="compare" size={16} /><span className="@max-[900px]:hidden">Compare</span>
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
        </div>
      </div>

      <Inspector />
      <BottomToolbar>{view === "canvas" && <ZoomControls />}</BottomToolbar>
      <CompareDialog />
    </div>
  );
}
