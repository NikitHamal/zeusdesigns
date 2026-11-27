import { startAgentBridge } from "./lib/agentState";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { activeConv, useStore } from "./store";
import { applyTheme } from "./lib/theme";
import { listenTerminal, nativeAvailable, nativeMcp, nativeMemory, openWorkspaceByPath } from "./lib/bridge";
import { appVersion, checkForUpdate } from "./lib/updater";
import { ChatPane } from "./components/Chat";
import { ArtifactWorkbench } from "./components/ArtifactWorkbench";
import {
  OpenDesignBrandSystemsView,
  OpenDesignDeliverablesView,
  OpenDesignSkillsView,
} from "./components/OpenDesignViews";
import { SettingsDialog } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { Titlebar } from "./components/Titlebar";
import { CommandPalette } from "./components/CommandPalette";

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const hue = useStore((s) => s.settings.hue);
  const collapsed = useStore((s) => s.ui.chatCollapsed);
  const sidebarOpen = useStore((s) => s.ui.sidebarOpen);
  const showCanvas = useStore((s) => s.ui.showCanvas);
  const leftTab = useStore((s) => s.ui.leftTab);
  const odTab = useStore((s) => s.ui.odTab ?? "studio");
  const toast = useStore((s) => s.ui.toast);
  const hasMessages = useStore((s) => activeConv(s).messages.length > 0);
  const patchUI = useStore((s) => s.patchUI);
  const [w, setW] = useState(() => Number(localStorage.getItem("zeus-chat-w")) || 440);
  const dragging = useRef(false);
  const m3eOpen = useStore((s) => !!s.ui.m3e);
  const split = showCanvas || m3eOpen;

  useLayoutEffect(() => {
    applyTheme(theme, hue);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyTheme("system", hue);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [theme, hue]);

  useEffect(() => { startAgentBridge(); }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    void listenTerminal((e) => {
      const st = useStore.getState();
      const proj = st.projects.find((p) => p.root && p.root === e.root) ?? st.projects.find((p) => p.id === st.activeProjectId) ?? st.projects[0];
      const projectId = proj?.id ?? "proj-default";
      const prev = st.terminalHistory.find((r) => r.id === e.id);
      if (e.chunk !== undefined) {
        // Live output: append while the command runs (capped so a noisy build can't grow the heap).
        const next = ((prev?.stdout ?? "") + e.chunk).slice(-200_000);
        if (prev) st.patchTerminalRun(e.id, { stdout: next, running: true });
        else
          st.addTerminalRun({ id: e.id, projectId, cmd: e.cmd, cwd: e.root || ".", stdout: next, stderr: "", code: 0, at: Date.now(), running: true, source: "agent" });
        return;
      }
      if (prev) {
        st.patchTerminalRun(e.id, {
          stdout: e.stdout ?? prev.stdout,
          stderr: e.stderr ?? "",
          code: e.code ?? 0,
          cwd: e.cwd || undefined,
          running: e.running,
        });
      } else {
        st.addTerminalRun({
          id: e.id,
          projectId,
          cmd: e.cmd,
          cwd: e.cwd || e.root || ".",
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? "",
          code: e.code ?? 0,
          at: Date.now(),
          running: e.running,
          source: "agent",
        });
      }
    }).then((fn) => {
      if (dead) fn();
      else off = fn;
    });
    return () => {
      dead = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    nativeAvailable().then((ok) => patchUI({ nativeReady: ok }));
    nativeMemory.list().then((l) => l && useStore.getState().patchSettings({ memory: l.reverse() }));
    appVersion().then((version) => patchUI({ version }));
    nativeMcp.list().then((native) => {
      if (!native) return;
      const st = useStore.getState();
      const mine = st.settings.mcp;
      const add = native.filter((n) => n.transport === "stdio" && !mine.some((m) => m.id === n.id)).map((n) => ({ id: n.id, name: n.name, transport: "stdio" as const, command: n.command, args: n.args ?? [], enabled: false }));
      if (add.length) st.patchSettings({ mcp: [...mine, ...add] });
      for (const m of mine) if (m.enabled && !native.some((n) => n.id === m.id)) void nativeMcp.add({ id: m.id, name: m.name, command: m.command, args: m.args, transport: "stdio" });
    });
    const check = () => checkForUpdate().then((update) => {
      patchUI({ update });
      if (update.available) useStore.getState().notify(`Update ${update.latest} is available`);
    }).catch(() => {});
    const first = setTimeout(check, 4000);
    const every = setInterval(check, 6 * 60 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [patchUI]);
  // Trees are never persisted; rebuild the active project's tree (bounded) whenever the project changes.
  const activeRoot = useStore((s) => (s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0])?.root);
  const activeName = useStore((s) => (s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0])?.name);
  useEffect(() => {
    if (!activeRoot) return;
    let live = true;
    openWorkspaceByPath(activeRoot, activeName).then((ws) => {
      if (live && ws) useStore.getState().patchUI({ workspace: ws });
    }).catch(() => {});
    return () => { live = false; };
  }, [activeRoot, activeName]);
  useEffect(() => { localStorage.setItem("zeus-chat-w", String(w)); }, [w]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const left = sidebarOpen ? 272 : 0;
    const mv = (ev: PointerEvent) => setW(Math.min(760, Math.max(340, ev.clientX - left)));
    const up = () => { dragging.current = false; window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex h-full flex-col bg-surface text-on-surface">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
      {sidebarOpen && <Sidebar />}
      <main className="relative flex min-w-0 flex-1 bg-surface">
        {odTab === "design-systems" ? (
          <OpenDesignBrandSystemsView />
        ) : odTab === "skills" ? (
          <OpenDesignSkillsView />
        ) : odTab === "deliverables" ? (
          <OpenDesignDeliverablesView />
        ) : split ? (
          <>
            {!collapsed && (
              <>
                <div style={{ width: w }} className={`min-w-0 shrink-0 `}><ChatPane /></div>
                <div onPointerDown={startDrag} className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize">
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-outline-variant transition-colors group-hover:w-0.5 group-hover:bg-primary" />
                </div>
              </>
            )}
            <div className="min-w-0 flex-1 p-2 pl-0"><ArtifactWorkbench /></div>
          </>
        ) : hasMessages || leftTab !== "chat" || Boolean(activeRoot) ? (
          <div className={`flex min-w-0 flex-1 justify-center `}><div className="h-full w-full"><ChatPane /></div></div>
        ) : (
          <Home />
        )}
      </main>
      </div>
      <SettingsDialog />
      <CommandPalette />
      {toast && <div className="anim-pop fixed bottom-24 left-1/2 z-[600] -translate-x-1/2 rounded-xl bg-inverse-surface px-5 py-3 text-sm font-medium text-inverse-on-surface">{toast}</div>}
    </div>
  );
}
