import { useEffect, useMemo, useState } from "react";
import { activeConv, activeProject, convArtifactCount, DEFAULT_PROJECT_ID, useStore } from "../store";
import type { ProjectFolder } from "../types";
import { nativePerf, nativeServer, openWorkspace, openWorkspaceByPath } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dialog, Dropdown, IconBtn, MenuItem } from "./ui";
import { Icon } from "./Icon";

/* icons: folder, folder_open, create_new_folder, terminal, code, save, play_arrow, delete_sweep */

function NavItem({ icon, label, onClick, active, right }: { icon: string; label: string; onClick: () => void; active?: boolean; right?: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("state flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] font-medium text-on-surface", active && "bg-surface-high")}>
      <Icon name={icon} size={18} />
      <span className="flex-1 truncate">{label}</span>
      {right}
    </button>
  );
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const convs = useStore((s) => s.conversations);
  const projects = useStore((s) => s.projects);
  const [q, setQ] = useState("");
  const projMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const results = useMemo(() => {
    const k = q.trim().toLowerCase();
    return convs
      .map((c) => {
        const hit = c.messages.find((m) => m.text.toLowerCase().includes(k));
        const pName = projMap.get(c.projectId ?? DEFAULT_PROJECT_ID) ?? "Workspace";
        return { c, hit, pName, title: c.title.toLowerCase().includes(k) || pName.toLowerCase().includes(k) };
      })
      .filter((r) => r.c.messages.length > 0 && (!k || r.title || r.hit))
      .slice(0, 30);
  }, [convs, projMap, q]);
  const go = (id: string) => {
    const st = useStore.getState();
    st.setActiveConv(id);
    st.patchUI({ showCanvas: convArtifactCount(st, id) > 0, leftTab: "chat" });
    setQ("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} className="w-[min(620px,92vw)] max-h-[70vh]">
      <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-3">
        <Icon name="search" size={22} className="text-on-surface-variant" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project chats" className="h-9 flex-1 bg-transparent text-[15px] outline-none placeholder:text-on-surface-variant/60" />
        <IconBtn label="Close" size={34} onClick={onClose}><Icon name="close" size={20} /></IconBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 && <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No chats found</div>}
        {results.map(({ c, hit, pName }) => (
          <button key={c.id} onClick={() => go(c.id)} className="state flex w-full flex-col rounded-xl px-3 py-2.5 text-left">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-high px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                <Icon name="folder" size={12} />
                {pName}
              </span>
              <span className="truncate text-sm font-medium text-on-surface">{c.title}</span>
            </div>
            {hit && q && <span className="mt-0.5 truncate text-xs text-on-surface-variant">{hit.text.replace(/\s+/g, " ").slice(0, 110)}</span>}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function ChatRow({ id, title, active, screenCount }: { id: string; title: string; active: boolean; screenCount: number }) {
  const [rename, setRename] = useState(false);
  const { setActiveConv, deleteConv, setTitle } = useStore.getState();
  const patchUI = useStore((s) => s.patchUI);
  if (rename) {
    return (
      <input
        autoFocus defaultValue={title} spellCheck={false}
        onBlur={(e) => { if (e.target.value.trim()) setTitle(id, e.target.value.trim()); setRename(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRename(false); }}
        className="h-8 w-full rounded-lg border border-primary bg-transparent px-2.5 text-[13px] outline-none"
      />
    );
  }
  return (
    <div className={cn("group relative rounded-lg", active && "bg-surface-high")}>
      <button
        onClick={() => {
          const st = useStore.getState();
          setActiveConv(id);
          patchUI({ showCanvas: convArtifactCount(st, id) > 0, leftTab: "chat" });
        }}
        onDoubleClick={() => setRename(true)}
        className="state flex h-8 w-full items-center gap-2 rounded-lg pl-2.5 pr-8 text-left text-[13px] text-on-surface"
      >
        <Icon name="chat_bubble" size={13} className={cn("shrink-0", active ? "text-primary" : "text-on-surface-variant/70")} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {screenCount > 0 && <span className="shrink-0 rounded-full bg-surface-container px-1.5 py-0.5 text-[10.5px] font-medium text-on-surface-variant group-hover:opacity-0">{screenCount}</span>}
      </button>
      <Dropdown align="right" width={170} className="!absolute right-1 top-1/2 -translate-y-1/2" trigger={({ toggle, open }) => (
        <button onClick={toggle} title="More" aria-label="More" className={cn("state grid size-6 place-items-center rounded-md text-on-surface-variant group-hover:opacity-100", open ? "opacity-100" : "opacity-0")}><Icon name="more_horiz" size={16} /></button>
      )}>
        {(close) => (
          <>
            <MenuItem icon={<Icon name="edit" size={15} />} label="Rename chat" onClick={() => { close(); setRename(true); }} />
            <MenuItem danger icon={<Icon name="delete" size={15} />} label="Delete chat" onClick={() => { close(); deleteConv(id); }} />
          </>
        )}
      </Dropdown>
    </div>
  );
}

function ProjectGroup({
  project,
  activeProj,
  activeConvId,
  convs,
  countByConv,
  onPickFolder,
}: {
  project: ProjectFolder;
  activeProj: boolean;
  activeConvId: string;
  convs: { id: string; title: string; messages: unknown[]; at: number }[];
  countByConv: Map<string, number>;
  onPickFolder: (rebindProjectId?: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const expanded = project.expanded ?? true;
  const {
    setActiveProject,
    toggleProjectExpanded,
    newConversation,
    renameProject,
    removeProject,
    patchUI,
  } = useStore.getState();

  const activateProject = () => {
    setActiveProject(project.id);
    if (project.root) {
      openWorkspaceByPath(project.root, project.name)
        .then((ws) => ws && useStore.getState().patchUI({ workspace: ws }))
        .catch(() => {});
    }
  };

  const visibleConvs = useMemo(() => {
    const sorted = [...convs].sort((a, b) => b.at - a.at);
    const nonEmpty = sorted.filter((c) => c.messages.length > 0);
    if (nonEmpty.length > 0) {
      const activeEmpty = sorted.find((c) => c.id === activeConvId && c.messages.length === 0);
      return activeEmpty ? [activeEmpty, ...nonEmpty] : nonEmpty;
    }
    return sorted.slice(0, 1);
  }, [convs, activeConvId]);

  return (
    <div className={cn("mb-1.5 rounded-xl border transition-colors", activeProj ? "border-outline-variant/70 bg-surface-container/60" : "border-transparent")}>
      <div className="group flex h-9 items-center gap-1 px-1.5">
        <button
          onClick={() => toggleProjectExpanded(project.id)}
          title={expanded ? "Collapse project" : "Expand project"}
          className="state grid size-6 shrink-0 place-items-center rounded-md text-on-surface-variant"
        >
          <Icon name={expanded ? "expand_more" : "chevron_right"} size={16} />
        </button>
        {renaming ? (
          <input
            autoFocus
            defaultValue={project.name}
            spellCheck={false}
            onBlur={(e) => {
              if (e.target.value.trim()) renameProject(project.id, e.target.value.trim());
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-primary bg-transparent px-2 text-[13px] outline-none"
          />
        ) : (
          <button
            onClick={activateProject}
            onDoubleClick={() => setRenaming(true)}
            title={project.root ? `${project.name}\n${project.root}` : `${project.name} (Click to select or bind a local folder)`}
            className="state flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left"
          >
            <Icon
              name={activeProj ? "folder_open" : "folder"}
              size={16}
              className={cn("shrink-0", activeProj ? "text-primary" : "text-on-surface-variant")}
            />
            <span className={cn("truncate text-[13px] font-semibold", activeProj ? "text-on-surface" : "text-on-surface-variant")}>
              {project.name}
            </span>
            {!project.root && (
              <span className="shrink-0 rounded bg-surface-high px-1 py-0.2 text-[9.5px] font-medium text-on-surface-variant">
                local
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => {
            activateProject();
            newConversation(project.id);
          }}
          title={`New chat in ${project.name}`}
          className="state grid size-6 shrink-0 place-items-center rounded-md text-on-surface-variant opacity-0 group-hover:opacity-100"
        >
          <Icon name="add" size={16} />
        </button>
        <Dropdown align="right" width={200} trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            title="Project actions"
            className={cn("state grid size-6 shrink-0 place-items-center rounded-md text-on-surface-variant group-hover:opacity-100", open ? "opacity-100" : "opacity-0")}
          >
            <Icon name="more_horiz" size={16} />
          </button>
        )}>
          {(close) => (
            <>
              <MenuItem icon={<Icon name="add" size={16} />} label="New chat in project" onClick={() => { close(); activateProject(); newConversation(project.id); }} />
              <MenuItem icon={<Icon name="folder_open" size={16} />} label={project.root ? "Change local folder…" : "Bind local folder…"} onClick={() => { close(); onPickFolder(project.id); }} />
              <MenuItem icon={<Icon name="account_tree" size={16} />} label="Browse project files" onClick={() => { close(); activateProject(); patchUI({ leftTab: "files", chatCollapsed: false }); }} />
              <MenuItem icon={<Icon name="terminal" size={16} />} label="Open project terminal" onClick={() => { close(); activateProject(); patchUI({ leftTab: "terminal", chatCollapsed: false }); }} />
              <MenuItem icon={<Icon name="edit" size={16} />} label="Rename project" onClick={() => { close(); setRenaming(true); }} />
              <MenuItem danger icon={<Icon name="delete" size={16} />} label="Remove project" onClick={() => { close(); removeProject(project.id); }} />
            </>
          )}
        </Dropdown>
      </div>
      {expanded && (
        <div className="space-y-0.5 pb-1.5 pl-4 pr-1.5">
          {visibleConvs.map((c) => (
            <ChatRow
              key={c.id}
              id={c.id}
              title={c.title}
              active={c.id === activeConvId}
              screenCount={countByConv.get(c.id) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const theme = useStore((s) => s.settings.theme);
  const patch = useStore((s) => s.patchSettings);
  const patchUI = useStore((s) => s.patchUI);
  const version = useStore((s) => s.ui.version);
  const update = useStore((s) => s.ui.update);
  const [ramMb, setRamMb] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => nativePerf.stats().then((s) => alive && setRamMb(s.workingSetMb)).catch(() => {});
    nativePerf.trim().then(poll).catch(poll);
    const id = setInterval(poll, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const sub = [version ? `v${version.replace(/^v/, "")}` : "Local", ramMb ? `${ramMb} MB` : ""].filter(Boolean).join(" · ");
  return (
    <Dropdown up width={248} className="w-full" trigger={({ toggle, open }) => (
      <button onClick={toggle} className={cn("state flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left", open && "bg-surface-high")}>
        <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-primary-container text-[13px] font-semibold text-on-primary-container">Z{update?.available && <i className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface-dim bg-primary" />}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-on-surface">Zeus</span><span className="block truncate text-xs text-on-surface-variant">{sub}</span></span>
        <Icon name="expand_more" size={16} className="text-on-surface-variant" />
      </button>
    )}>
      {(close) => (
        <>
          <MenuItem icon={<Icon name="settings" size={18} />} label="Settings" onClick={() => { close(); patchUI({ settingsOpen: true, settingsTab: "appearance" }); }} />
          <MenuItem icon={<Icon name="psychology" size={18} />} label="Memory" onClick={() => { close(); patchUI({ settingsOpen: true, settingsTab: "memory" }); }} />
          <MenuItem icon={<Icon name="extension" size={18} />} label="Connectors" onClick={() => { close(); patchUI({ settingsOpen: true, settingsTab: "mcp" }); }} />
          <div className="my-1.5 border-t border-outline-variant/70" />
          {([["light", "Light", "light_mode"], ["dark", "Dark", "dark_mode"], ["system", "System", "laptop"]] as const).map(([id, label, icon]) => (
            <MenuItem key={id} icon={<Icon name={icon} size={18} />} label={label} active={theme === id} onClick={() => patch({ theme: id })} />
          ))}
          <div className="my-1.5 border-t border-outline-variant/70" />
          <MenuItem icon={<Icon name={update?.available ? "system_update" : "refresh"} size={18} />} label={update?.available ? `Update to ${update.latest}` : "Check for updates"} onClick={() => { close(); patchUI({ settingsOpen: true, settingsTab: "updates" }); }} />
          <MenuItem href="https://github.com/NikitHamal/zeusdesigns/issues" icon={<Icon name="help" size={18} />} label="Get help" />
          <MenuItem href="https://github.com/NikitHamal/zeusdesigns" icon={<Icon name="open_in_new" size={18} />} label="Source code" />
        </>
      )}
    </Dropdown>
  );
}

export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const curProject = useStore(activeProject);
  const convs = useStore((s) => s.conversations);
  const pages = useStore((s) => s.pages);
  const artboards = useStore((s) => s.artboards);
  const current = useStore(activeConv);
  const ui = useStore((s) => s.ui);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const { newConversation, addOrSelectProject } = useStore.getState();
  const [search, setSearch] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);

  useEffect(() => {
    let alive = true;
    nativeServer.status().then((st) => alive && setServerRunning(st.running)).catch(() => {});
    const id = setInterval(() => {
      nativeServer.status().then((st) => alive && setServerRunning(st.running)).catch(() => {});
    }, 6000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const countByConv = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of convs) {
      const pIds = new Set(pages.filter((p) => p.convId === c.id).map((p) => p.id));
      const direct = artboards.filter((a) => pIds.has(a.pageId)).length;
      const msgBoards = new Set(c.messages.flatMap((m) => m.artboardIds ?? [])).size;
      map.set(c.id, Math.max(direct, msgBoards));
    }
    return map;
  }, [convs, pages, artboards]);

  const startNewInActiveProject = () => {
    newConversation(activeProjectId);
    patchUI({ showCanvas: false, leftTab: "chat" });
  };

  const pickProjectFolder = (rebindProjectId?: string) => {
    openWorkspace()
      .then((w) => {
        if (!w) return;
        if (rebindProjectId) {
          useStore.setState((s) => ({
            projects: s.projects.map((p) =>
              p.id === rebindProjectId ? { ...p, name: w.name, root: w.root, tree: undefined, expanded: true, at: Date.now() } : p
            ),
            activeProjectId: rebindProjectId,
            projectName: w.name,
            ui: { ...s.ui, workspace: w, leftTab: "chat" },
          }));
          notify(`Opened project folder ${w.name}`);
          return;
        }
        addOrSelectProject(w);
        notify(`Opened project ${w.name}`);
      })
      .catch((e) => notify(e.message));
  };

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-outline-variant bg-surface-dim">
      <div className="flex h-14 shrink-0 items-center justify-between gap-1 px-3">
        <div className="flex items-center gap-1">
          <IconBtn label="Hide sidebar" size={34} onClick={() => patchUI({ sidebarOpen: false })}><Icon name="left_panel_close" size={20} /></IconBtn>
          <span className="px-1 font-display text-[20px] font-semibold tracking-tight text-on-surface">Zeus</span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconBtn label="Search chats" size={32} onClick={() => setSearch(true)}><Icon name="search" size={18} /></IconBtn>
          <IconBtn label={`New chat in ${curProject?.name ?? "project"}`} size={32} onClick={startNewInActiveProject}><Icon name="add" size={19} /></IconBtn>
        </div>
      </div>

      <div className="flex items-center justify-between px-3.5 pb-1.5 pt-1">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-on-surface-variant">Projects</span>
        <button
          onClick={() => pickProjectFolder()}
          className="state inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-primary"
        >
          <Icon name="create_new_folder" size={14} />
          Add folder
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {projects.map((proj) => {
          const projConvs = convs.filter((c) => (c.projectId ?? DEFAULT_PROJECT_ID) === proj.id);
          return (
            <ProjectGroup
              key={proj.id}
              project={proj}
              activeProj={proj.id === activeProjectId}
              activeConvId={current.id}
              convs={projConvs}
              countByConv={countByConv}
              onPickFolder={pickProjectFolder}
            />
          );
        })}
      </div>

      <nav className="flex flex-col gap-0.5 border-t border-outline-variant/60 px-2 py-2">
        <NavItem
          icon="account_tree"
          label="Project files"
          active={ui.leftTab === "files"}
          onClick={() => patchUI({ leftTab: ui.leftTab === "files" ? "chat" : "files", chatCollapsed: false })}
          right={curProject?.root ? <span className="max-w-[90px] truncate font-mono text-[10.5px] text-on-surface-variant">{curProject.name}</span> : undefined}
        />
        <NavItem
          icon="terminal"
          label="Terminal"
          active={ui.leftTab === "terminal"}
          onClick={() => patchUI({ leftTab: ui.leftTab === "terminal" ? "chat" : "terminal", chatCollapsed: false })}
        />
        <NavItem icon="local_library" label="Design library" onClick={() => patchUI({ settingsOpen: true, settingsTab: "library" })} />
        <NavItem icon="extension" label="Connectors" onClick={() => patchUI({ settingsOpen: true, settingsTab: "mcp" })} />
        <NavItem
          icon="dns"
          label="Local server"
          onClick={() => patchUI({ settingsOpen: true, settingsTab: "server" })}
          right={
            <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[10.5px]", serverRunning ? "bg-primary-container text-on-primary-container" : "bg-surface-high text-on-surface-variant")}>
              {serverRunning ? ":11435" : "Off"}
            </span>
          }
        />
      </nav>
      <div className="shrink-0 border-t border-outline-variant p-2"><AccountMenu /></div>
      <SearchDialog open={search} onClose={() => setSearch(false)} />
    </aside>
  );
}
