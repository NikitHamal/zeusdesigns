import { useEffect, useRef, useState } from "react";
import { FolderOpen, Moon, Settings, Sun, Zap, Cpu } from "lucide-react";
import { useStore } from "./store";
import { applyTheme } from "./lib/theme";
import { nativeAvailable, nativeMemory, openWorkspace, isNative } from "./lib/bridge";
import { findProvider } from "./lib/providers";
import { ChatPane } from "./components/Chat";
import { CanvasPane } from "./components/CanvasPane";
import { SettingsDialog } from "./components/Settings";
import { IconBtn } from "./components/ui";
import { cn } from "./utils/cn";

function TopBar() {
  const name = useStore((s) => s.projectName);
  const setName = useStore((s) => s.setProjectName);
  const ws = useStore((s) => s.ui.workspace);
  const ready = useStore((s) => s.ui.nativeReady);
  const settings = useStore((s) => s.settings);
  const patchUI = useStore((s) => s.patchUI);
  const patch = useStore((s) => s.patchSettings);
  const notify = useStore((s) => s.notify);
  const dark = settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const prov = settings.providerId.startsWith("custom:") ? null : findProvider(settings.providerId);
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 px-3">
      <div className="flex items-center gap-2.5 pl-1">
        <div className="grid size-9 place-items-center rounded-[13px] bg-primary text-on-primary"><Zap size={19} fill="currentColor" /></div>
        <span className="font-display text-[17px] font-bold tracking-tight max-sm:hidden">ZeusDesigns</span>
      </div>
      <span className="h-5 w-px bg-outline-variant" />
      <input
        value={name} onChange={(e) => setName(e.target.value)} spellCheck={false}
        className="h-9 w-[200px] rounded-full bg-transparent px-3 text-sm font-semibold text-on-surface outline-none transition-colors hover:bg-surface-container focus:bg-surface-container focus:ring-2 focus:ring-primary/40"
      />
      <span className="flex-1" />
      <button
        onClick={() => { if (ws) patchUI({ leftTab: "files", chatCollapsed: false }); else openWorkspace().then((w) => w && patchUI({ workspace: w, leftTab: "files", chatCollapsed: false })).catch((e) => notify(e.message)); }}
        className={cn("state morph flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold", ws ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-container text-on-surface-variant")}
      >
        <FolderOpen size={15} /> {ws ? ws.name : "Open project folder"}
      </button>
      <button onClick={() => patchUI({ settingsOpen: true, settingsTab: "providers" })} className="state flex h-9 items-center gap-2 rounded-full bg-surface-container px-3.5 text-[13px] font-semibold text-on-surface-variant" title={ready ? "Native engine active" : isNative ? "Engine starting…" : "Browser preview — demo engine"}>
        <span className={cn("size-2 rounded-full", ready ? "bg-green-500" : "bg-amber-500")} />
        <Cpu size={14} /> {ready ? "Native" : "Demo"} · {prov?.name ?? "Custom"}
      </button>
      <IconBtn label="Toggle theme" onClick={() => patch({ theme: dark ? "light" : "dark" })}>{dark ? <Sun size={19} /> : <Moon size={19} />}</IconBtn>
      <IconBtn label="Settings, library & memory" onClick={() => patchUI({ settingsOpen: true })}><Settings size={19} /></IconBtn>
    </header>
  );
}

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const hue = useStore((s) => s.settings.hue);
  const collapsed = useStore((s) => s.ui.chatCollapsed);
  const toast = useStore((s) => s.ui.toast);
  const patchUI = useStore((s) => s.patchUI);
  const [w, setW] = useState(() => Number(localStorage.getItem("zeus-chat-w")) || 420);
  const dragging = useRef(false);

  useEffect(() => {
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
  }, [patchUI]);
  useEffect(() => { localStorage.setItem("zeus-chat-w", String(w)); }, [w]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const mv = (ev: PointerEvent) => setW(Math.min(760, Math.max(340, ev.clientX - 8)));
    const up = () => { dragging.current = false; window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex h-full flex-col bg-surface-dim text-on-surface">
      <TopBar />
      <div className="flex min-h-0 flex-1 gap-0 px-2 pb-2">
        {!collapsed && (
          <>
            <div style={{ width: w }} className="min-w-0 shrink-0"><ChatPane /></div>
            <div onPointerDown={startDrag} className="group relative w-2 shrink-0 cursor-col-resize"><span className="absolute inset-y-[calc(50%-24px)] left-1/2 h-12 w-1 -translate-x-1/2 rounded-full bg-outline-variant opacity-0 transition-opacity group-hover:opacity-100" /></div>
          </>
        )}
        <div className="min-w-0 flex-1"><CanvasPane /></div>
      </div>
      <SettingsDialog />
      {toast && <div className="anim-pop fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 rounded-full bg-inverse-surface px-5 py-3 text-sm font-medium text-inverse-on-surface shadow-2xl">{toast}</div>}
    </div>
  );
}
