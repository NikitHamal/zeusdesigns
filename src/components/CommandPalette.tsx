import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convArtifactCount, DEFAULT_PROJECT_ID, useStore } from "../store";
import { openWorkspace, openWorkspaceByPath } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";

/* icons: add, create_new_folder, left_panel_open, code_blocks, account_tree, terminal, commit, chat_bubble, light_mode, dark_mode, laptop, palette, memory, bolt, dns, psychology, extension, system_update, ads_click, folder, folder_open, settings */

type Cmd = { id: string; group: string; icon: string; label: string; hint?: string; run: () => void };

function useCommands(): Cmd[] {
  const convs = useStore((s) => s.conversations);
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const showCanvas = useStore((s) => s.ui.showCanvas);
  const leftTab = useStore((s) => s.ui.leftTab);
  return useMemo(() => {
    const st = () => useStore.getState();
    const out: Cmd[] = [];
    const pane = (tab: "chat" | "files" | "git" | "terminal") => () => st().patchUI({ leftTab: tab, chatCollapsed: false });
    out.push({ id: "new", group: "Session", icon: "add", label: "New session", run: () => { st().newConversation(activeProjectId); st().patchUI({ showCanvas: false, leftTab: "chat" }); } });
    out.push({
      id: "open-folder", group: "Session", icon: "create_new_folder", label: "Open project folder",
      run: () => { openWorkspace().then((w) => w && st().addOrSelectProject(w)).catch((e) => st().notify(e.message)); },
    });
    out.push({ id: "sidebar", group: "View", icon: "left_panel_open", label: "Toggle sidebar", run: () => st().patchUI({ sidebarOpen: !st().ui.sidebarOpen }) });
    out.push({ id: "p-chat", group: "View", icon: "chat_bubble", label: "Show chat", run: pane("chat") });
    out.push({ id: "p-canvas", group: "View", icon: "code_blocks", label: showCanvas ? "Close canvas" : "Open canvas", run: () => st().patchUI({ showCanvas: !showCanvas }) });
    out.push({ id: "p-files", group: "View", icon: "account_tree", label: "Files", run: pane(leftTab === "files" ? "chat" : "files") });
    out.push({ id: "p-term", group: "View", icon: "terminal", label: "Terminal", run: pane(leftTab === "terminal" ? "chat" : "terminal") });
    out.push({ id: "p-git", group: "View", icon: "commit", label: "Review diffs", run: pane(leftTab === "git" ? "chat" : "git") });
    if (showCanvas) out.push({ id: "ask", group: "View", icon: "ads_click", label: "Ask about selection", hint: "Ctrl Shift K", run: () => window.dispatchEvent(new Event("zeus:ask")) });
    for (const [id, label, icon] of [["light", "Light theme", "light_mode"], ["dark", "Dark theme", "dark_mode"], ["system", "System theme", "laptop"]] as const)
      out.push({ id: `theme-${id}`, group: "Appearance", icon, label, run: () => st().patchSettings({ theme: id }) });
    for (const [tab, label, icon] of [
      ["appearance", "Appearance", "palette"], ["providers", "Models and providers", "memory"], ["library", "Harness and skills", "bolt"],
      ["server", "Local server", "dns"], ["memory", "Memory", "psychology"], ["mcp", "Connectors", "extension"], ["updates", "Updates", "system_update"],
    ] as const) out.push({ id: `set-${tab}`, group: "Settings", icon, label: `Settings: ${label}`, run: () => st().patchUI({ settingsOpen: true, settingsTab: tab }) });
    for (const p of projects)
      out.push({
        id: `proj-${p.id}`, group: "Projects", icon: p.id === activeProjectId ? "folder_open" : "folder", label: p.name, hint: p.root,
        run: () => {
          st().setActiveProject(p.id);
          if (p.root) openWorkspaceByPath(p.root, p.name).then((w) => w && st().patchUI({ workspace: w })).catch(() => {});
        },
      });
    const names = new Map(projects.map((p) => [p.id, p.name]));
    [...convs].filter((c) => c.messages.length > 0).sort((a, b) => b.at - a.at).slice(0, 40).forEach((c) =>
      out.push({
        id: `conv-${c.id}`, group: "Sessions", icon: "chat_bubble", label: c.title, hint: names.get(c.projectId ?? DEFAULT_PROJECT_ID),
        run: () => { st().setActiveConv(c.id); st().patchUI({ showCanvas: convArtifactCount(st(), c.id) > 0, leftTab: "chat" }); },
      }));
    return out;
  }, [convs, projects, activeProjectId, showCanvas, leftTab]);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const cmds = useCommands();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("zeus:palette", show);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("zeus:palette", show); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setAt(0); } }, [open]);

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return cmds.filter((c) => !k || `${c.label} ${c.group} ${c.hint ?? ""}`.toLowerCase().includes(k)).slice(0, 60);
  }, [cmds, q]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at]);

  if (!open) return null;
  const run = (c?: Cmd) => { if (!c) return; setOpen(false); c.run(); };
  return createPortal(
    <div className="fixed inset-0 z-[700] flex items-start justify-center bg-black/40 pt-[14vh]" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="oc-hairline anim-fade flex max-h-[60vh] w-[min(580px,92vw)] flex-col overflow-hidden rounded-xl bg-surface">
        <div className="flex items-center gap-3 border-b border-outline-variant px-4 py-2.5">
          <Icon name="search" size={18} className="text-on-surface-variant" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(rows.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); run(rows[at]); }
            }}
            placeholder="Search commands, sessions, projects"
            className="h-8 flex-1 bg-transparent text-[14px] outline-none placeholder:text-on-surface-variant/60"
          />
        </div>
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {rows.length === 0 && <div className="px-3 py-8 text-center text-sm text-on-surface-variant">No results</div>}
          {rows.map((c, i) => (
            <div key={c.id}>
              {(i === 0 || rows[i - 1].group !== c.group) && <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-on-surface-variant">{c.group}</div>}
              <button
                data-i={i} onClick={() => run(c)} onMouseMove={() => setAt(i)}
                className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-on-surface", i === at && "bg-surface-container")}
              >
                <Icon name={c.icon} size={16} className="shrink-0 text-on-surface-variant" />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.hint && <span className="max-w-[45%] shrink-0 truncate text-[11.5px] text-on-surface-variant">{c.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
