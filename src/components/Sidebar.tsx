import { useMemo, useState } from "react";
import { activeConv, useStore } from "../store";
import { openWorkspace } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Dialog, IconBtn } from "./ui";
import { Icon } from "./Icon";

function NavItem({ icon, label, onClick, active, right }: { icon: string; label: string; onClick: () => void; active?: boolean; right?: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("state flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium text-on-surface", active && "bg-surface-high")}>
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

export function Sidebar() {
  const convs = useStore((s) => s.conversations);
  const current = useStore(activeConv);
  const ui = useStore((s) => s.ui);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const theme = useStore((s) => s.settings.theme);
  const patch = useStore((s) => s.patchSettings);
  const { newConversation, setActiveConv, deleteConv } = useStore.getState();
  const [search, setSearch] = useState(false);
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const list = convs.filter((c) => c.messages.length > 0);
  const split = current.messages.length > 0 || ui.showCanvas;

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
    <aside className="flex h-full w-[288px] shrink-0 flex-col border-r border-outline-variant bg-surface-dim">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <IconBtn label="Hide sidebar" size={36} onClick={() => patchUI({ sidebarOpen: false })}><Icon name="left_panel_close" size={20} /></IconBtn>
        <span className="font-display text-[19px] font-semibold tracking-tight text-on-surface">Zeus</span>
        <span className="flex-1" />
        <IconBtn label={dark ? "Light theme" : "Dark theme"} size={36} onClick={() => patch({ theme: dark ? "light" : "dark" })}><Icon name={dark ? "light_mode" : "dark_mode"} size={20} /></IconBtn>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        <NavItem icon="add" label="New design" onClick={startNew} active={!split} />
        <NavItem icon="search" label="Search" onClick={() => setSearch(true)} />
        <NavItem icon="folder_open" label={ui.workspace ? ui.workspace.name : "Project folder"} onClick={project} />
        <NavItem icon="local_library" label="Library" onClick={() => patchUI({ settingsOpen: true, settingsTab: "library" })} />
        <NavItem icon="extension" label="Tools" onClick={() => patchUI({ settingsOpen: true, settingsTab: "mcp" })} />
      </nav>
      <div className="mt-5 px-5 pb-1 text-[13px] font-medium text-on-surface-variant">Chats</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.map((c) => (
          <div key={c.id} className={cn("group relative", c.id === current.id && split && "rounded-xl bg-surface-high")}>
            <button onClick={() => { setActiveConv(c.id); patchUI({ showCanvas: false }); }} className="state flex h-9 w-full items-center rounded-xl px-3 pr-9 text-left text-[14px] text-on-surface">
              <span className="truncate">{c.title}</span>
            </button>
            <button onClick={() => deleteConv(c.id)} title="Delete chat" aria-label="Delete chat" className="state absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-on-surface-variant opacity-0 group-hover:opacity-100">
              <Icon name="delete" size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-outline-variant p-2">
        <button onClick={() => patchUI({ settingsOpen: true, settingsTab: "providers" })} className="state flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium text-on-surface">
          <Icon name="settings" size={20} /><span className="truncate">Settings</span>
        </button>
        {ui.update?.available && (
          <button onClick={() => patchUI({ settingsOpen: true, settingsTab: "updates" })} className="state flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary">
            <Icon name="system_update" size={16} />Update
          </button>
        )}
      </div>
      <SearchDialog open={search} onClose={() => setSearch(false)} />
    </aside>
  );
}
