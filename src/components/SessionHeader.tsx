import { useState, type ReactNode } from "react";
import { activeConv, activeProject, useStore } from "../store";
import { openWorkspace, openWorkspaceByPath } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dropdown, MenuItem, MenuLabel } from "./ui";
import { Icon } from "./Icon";

/* icons: code_blocks, account_tree, terminal, commit, folder_open, folder, create_new_folder, expand_more, left_panel_close */

export type DockTab = "files" | "git" | "terminal";

function PaneToggle({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md outline-none transition-colors",
        on ? "bg-surface-container text-on-surface" : "text-on-surface-variant hover:bg-surface-low hover:text-on-surface"
      )}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

export function SessionHeader({ canDock, dockOpen, dockTab, setDockOpen, setDockTab, trailing }: {
  canDock: boolean; dockOpen: boolean; dockTab: DockTab;
  setDockOpen: (v: boolean) => void; setDockTab: (t: DockTab) => void; trailing?: ReactNode;
}) {
  const conv = useStore(activeConv);
  const curProject = useStore(activeProject);
  const projects = useStore((s) => s.projects);
  const leftTab = useStore((s) => s.ui.leftTab);
  const showCanvas = useStore((s) => s.ui.showCanvas);
  const patchUI = useStore((s) => s.patchUI);
  const setTitle = useStore((s) => s.setTitle);
  const [editing, setEditing] = useState(false);

  const switchProject = (id: string) => {
    const st = useStore.getState();
    const proj = st.projects.find((p) => p.id === id);
    st.setActiveProject(id);
    if (proj?.root) openWorkspaceByPath(proj.root, proj.name).then((w) => w && useStore.getState().patchUI({ workspace: w })).catch(() => {});
  };
  const openFolder = () => {
    openWorkspace()
      .then((w) => { if (w) { useStore.getState().addOrSelectProject(w); useStore.getState().notify(`Opened project ${w.name}`); } })
      .catch((e) => useStore.getState().notify(e.message));
  };
  const pane = (tab: DockTab) => {
    if (canDock) {
      if (dockOpen && dockTab === tab) setDockOpen(false);
      else { setDockOpen(true); setDockTab(tab); }
    } else patchUI({ leftTab: leftTab === tab ? "chat" : tab, chatCollapsed: false });
  };
  const isOn = (tab: DockTab) => (canDock ? dockOpen && dockTab === tab : leftTab === tab);

  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-outline-variant px-3">
      <Dropdown width={240} trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          title={curProject?.root ?? "Switch or open project folder"}
          className={cn("oc-hairline flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-surface-low px-2 text-xs font-medium text-on-surface outline-none hover:bg-surface-container", open && "bg-surface-container")}
        >
          <Icon name="folder_open" size={14} className="text-on-surface-variant" />
          <span className="max-w-[140px] truncate">{curProject?.name ?? "Workspace"}</span>
          <Icon name="expand_more" size={14} className="text-on-surface-variant" />
        </button>
      )}>
        {(close) => (
          <>
            <MenuLabel>Projects</MenuLabel>
            {projects.map((p) => (
              <MenuItem key={p.id} icon={<Icon name={p.id === curProject?.id ? "folder_open" : "folder"} size={16} />} label={p.name} active={p.id === curProject?.id} onClick={() => { close(); switchProject(p.id); }} />
            ))}
            <div className="my-1 border-t border-outline-variant/60" />
            <MenuItem icon={<Icon name="create_new_folder" size={16} />} label="Open project folder" onClick={() => { close(); openFolder(); }} />
          </>
        )}
      </Dropdown>

      <span className="text-on-surface-variant/40">/</span>

      {editing ? (
        <input
          autoFocus defaultValue={conv.title} spellCheck={false}
          onBlur={(e) => { if (e.target.value.trim()) setTitle(conv.id, e.target.value.trim()); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
          className="h-7 min-w-0 flex-1 rounded-md border border-primary bg-surface-container px-2 text-[13.5px] font-medium outline-none"
        />
      ) : (
        <button onClick={() => setEditing(true)} title="Rename session" className="flex min-w-0 items-center rounded-md px-1.5 py-1 outline-none hover:bg-surface-low">
          <span className="truncate text-[13.5px] font-medium text-on-surface">{conv.title}</span>
        </button>
      )}

      <span className="flex-1" />
      {trailing}
      <div className="flex items-center gap-0.5">
        <PaneToggle icon="code_blocks" label="Canvas" on={showCanvas} onClick={() => patchUI({ showCanvas: !showCanvas })} />
        <PaneToggle icon="account_tree" label="Files" on={isOn("files")} onClick={() => pane("files")} />
        <PaneToggle icon="terminal" label="Terminal" on={isOn("terminal")} onClick={() => pane("terminal")} />
        <PaneToggle icon="commit" label="Review diffs" on={isOn("git")} onClick={() => pane("git")} />
      </div>
      {showCanvas && <PaneToggle icon="left_panel_close" label="Hide chat" on={false} onClick={() => patchUI({ chatCollapsed: true })} />}
    </div>
  );
}
