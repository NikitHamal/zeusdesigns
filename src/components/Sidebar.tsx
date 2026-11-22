import { useEffect, useMemo, useState } from "react";
import { activeConv, useStore } from "../store";
import { nativePerf, openWorkspace } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dialog, Dropdown, IconBtn, MenuItem } from "./ui";
import { Icon } from "./Icon";

function NavItem({ icon, label, onClick, active, right }: { icon: string; label: string; onClick: () => void; active?: boolean; right?: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("state flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-on-surface", active && "bg-surface-high")}>
      <Icon name={icon} size={20} />
      <span className="flex-1 truncate">{label}</span>
      {right}
    </button>
  );
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const convs = useStore((s) => s.conversations);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const k = q.trim().toLowerCase();
    return convs
      .map((c) => {
        const hit = c.messages.find((m) => m.text.toLowerCase().includes(k));
        return { c, hit, title: c.title.toLowerCase().includes(k) };
      })
      .filter((r) => r.c.messages.length > 0 && (!k || r.title || r.hit))
      .slice(0, 30);
  }, [convs, q]);
  const go = (id: string) => { useStore.getState().setActiveConv(id); useStore.getState().patchUI({ showCanvas: false }); setQ(""); onClose(); };
  return (
    <Dialog open={open} onClose={onClose} className="w-[min(620px,92vw)] max-h-[70vh]">
      <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-3">
        <Icon name="search" size={22} className="text-on-surface-variant" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="h-9 flex-1 bg-transparent text-[15px] outline-none placeholder:text-on-surface-variant/60" />
        <IconBtn label="Close" size={34} onClick={onClose}><Icon name="close" size={20} /></IconBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 && <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No chats found</div>}
        {results.map(({ c, hit }) => (
          <button key={c.id} onClick={() => go(c.id)} className="state flex w-full flex-col rounded-xl px-3 py-2.5 text-left">
            <span className="truncate text-sm font-medium text-on-surface">{c.title}</span>
            {hit && q && <span className="truncate text-xs text-on-surface-variant">{hit.text.replace(/\s+/g, " ").slice(0, 110)}</span>}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function group(at: number): string {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (at >= d0.getTime()) return "Today";
  if (at >= d0.getTime() - day) return "Yesterday";
  if (at >= d0.getTime() - 7 * day) return "Previous 7 days";
  return "Older";
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
        className="h-9 w-full rounded-lg border border-primary bg-transparent px-3 text-[14px] outline-none"
      />
    );
  }
  return (
    <div className={cn("group relative rounded-lg", active && "bg-surface-high")}>
      <button onClick={() => { setActiveConv(id); patchUI({ showCanvas: false }); }} onDoubleClick={() => setRename(true)} className="state flex h-9 w-full items-center gap-2 rounded-lg px-3 pr-9 text-left text-[14px] text-on-surface">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {screenCount > 0 && <span className="shrink-0 rounded-full bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant group-hover:opacity-0">{screenCount}</span>}
      </button>
      <Dropdown align="right" width={180} className="!absolute right-1 top-1/2 -translate-y-1/2" trigger={({ toggle, open }) => (
        <button onClick={toggle} title="More" aria-label="More" className={cn("state grid size-7 place-items-center rounded-md text-on-surface-variant group-hover:opacity-100", open ? "opacity-100" : "opacity-0")}><Icon name="more_horiz" size={18} /></button>
      )}>
        {(close) => (
          <>
            <MenuItem icon={<Icon name="edit" size={16} />} label="Rename" onClick={() => { close(); setRename(true); }} />
            <MenuItem danger icon={<Icon name="delete" size={16} />} label="Delete" onClick={() => { close(); deleteConv(id); }} />
          </>
        )}
      </Dropdown>
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
  const convs = useStore((s) => s.conversations);
  const pages = useStore((s) => s.pages);
  const artboards = useStore((s) => s.artboards);
  const current = useStore(activeConv);
  const ui = useStore((s) => s.ui);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const { newConversation } = useStore.getState();
  const [search, setSearch] = useState(false);
  const [open, setOpen] = useState(true);
  const list = convs.filter((c) => c.messages.length > 0);
  const split = current.messages.length > 0 || ui.showCanvas;
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
  const groups = useMemo(() => {
    const order = ["Today", "Yesterday", "Previous 7 days", "Older"];
    const m = new Map<string, typeof list>();
    for (const c of [...list].sort((a, b) => b.at - a.at)) { const g = group(c.at); m.set(g, [...(m.get(g) ?? []), c]); }
    return order.filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const);
  }, [list]);

  const startNew = () => {
    if (current.messages.length > 0) newConversation();
    patchUI({ showCanvas: false, leftTab: "chat" });
  };
  const project = () => {
    const show = () => patchUI({ leftTab: "files", chatCollapsed: false, showCanvas: true });
    if (ui.workspace) show();
    else openWorkspace().then((w) => { if (w) { patchUI({ workspace: w }); show(); } }).catch((e) => notify(e.message));
  };

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-outline-variant bg-surface-dim">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <IconBtn label="Hide sidebar" size={34} onClick={() => patchUI({ sidebarOpen: false })}><Icon name="left_panel_close" size={20} /></IconBtn>
        <span className="px-1 font-display text-[20px] font-semibold tracking-tight text-on-surface">Zeus</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        <NavItem icon="add" label="New design" onClick={startNew} active={!split} />
        <NavItem icon="search" label="Search" onClick={() => setSearch(true)} />
        <NavItem icon="folder_open" label={ui.workspace ? ui.workspace.name : "Project folder"} onClick={project} />
        <NavItem icon="local_library" label="Library" onClick={() => patchUI({ settingsOpen: true, settingsTab: "library" })} />
        <NavItem icon="extension" label="Connectors" onClick={() => patchUI({ settingsOpen: true, settingsTab: "mcp" })} />
      </nav>
      <button onClick={() => setOpen(!open)} className="state mx-2 mt-5 flex h-8 items-center gap-1 rounded-lg px-3 text-[13px] font-medium text-on-surface-variant">
        Chats<Icon name={open ? "expand_more" : "chevron_right"} size={16} />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {open && groups.map(([g, items]) => (
          <div key={g} className="mb-1">
            {groups.length > 1 && <div className="px-3 pb-1 pt-2 text-xs text-on-surface-variant/80">{g}</div>}
            {items.map((c) => <ChatRow key={c.id} id={c.id} title={c.title} active={c.id === current.id && split} screenCount={countByConv.get(c.id) ?? 0} />)}
          </div>
        ))}
        {open && list.length === 0 && <div className="px-3 py-2 text-[13px] text-on-surface-variant">No chats yet</div>}
      </div>
      <div className="shrink-0 border-t border-outline-variant p-2"><AccountMenu /></div>
      <SearchDialog open={search} onClose={() => setSearch(false)} />
    </aside>
  );
}
