import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { activeConv, useStore } from "./store";
import { applyTheme } from "./lib/theme";
import { nativeAvailable, nativeMcp, nativeMemory } from "./lib/bridge";
import { appVersion, checkForUpdate } from "./lib/updater";
import { ChatPane } from "./components/Chat";
import { CanvasPane } from "./components/CanvasPane";
import { SettingsDialog } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { IconBtn } from "./components/ui";
import { Icon } from "./components/Icon";

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const hue = useStore((s) => s.settings.hue);
  const collapsed = useStore((s) => s.ui.chatCollapsed);
  const sidebarOpen = useStore((s) => s.ui.sidebarOpen);
  const showCanvas = useStore((s) => s.ui.showCanvas);
  const toast = useStore((s) => s.ui.toast);
  const hasMessages = useStore((s) => activeConv(s).messages.length > 0);
  const patchUI = useStore((s) => s.patchUI);
  const [w, setW] = useState(() => Number(localStorage.getItem("zeus-chat-w")) || 440);
  const dragging = useRef(false);
  const split = showCanvas;

  useLayoutEffect(() => {
    applyTheme(theme, hue);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyTheme("system", hue);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [theme, hue]);

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
    <div className="flex h-full bg-surface text-on-surface">
      {sidebarOpen && <Sidebar />}
      <main className="relative flex min-w-0 flex-1 bg-surface">
        {!sidebarOpen && (
          <div className="absolute left-3 top-3 z-40">
            <IconBtn label="Show sidebar" size={36} onClick={() => patchUI({ sidebarOpen: true })}><Icon name="left_panel_open" size={20} /></IconBtn>
          </div>
        )}
        {split ? (
          <>
            {!collapsed && (
              <>
                <div style={{ width: w }} className={`min-w-0 shrink-0 ${sidebarOpen ? "" : "pl-12"}`}><ChatPane /></div>
                <div onPointerDown={startDrag} className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize">
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-outline-variant transition-colors group-hover:w-0.5 group-hover:bg-primary" />
                </div>
              </>
            )}
            <div className="min-w-0 flex-1 p-2 pl-0"><CanvasPane /></div>
          </>
        ) : hasMessages ? (
          <div className={`flex min-w-0 flex-1 justify-center ${sidebarOpen ? "" : "pl-12"}`}><div className="h-full w-full max-w-[860px]"><ChatPane /></div></div>
        ) : (
          <Home />
        )}
      </main>
      <SettingsDialog />
      {toast && <div className="anim-pop fixed bottom-24 left-1/2 z-[600] -translate-x-1/2 rounded-xl bg-inverse-surface px-5 py-3 text-sm font-medium text-inverse-on-surface">{toast}</div>}
    </div>
  );
}
