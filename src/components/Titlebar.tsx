import { useEffect, useState } from "react";
import { activeProject, useStore } from "../store";
import { isNative } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";

/* icons: left_panel_open, left_panel_close, search, settings, remove, crop_square, filter_none, close */

type Win = Awaited<ReturnType<typeof loadWindow>>;
const loadWindow = async () => (await import("@tauri-apps/api/window")).getCurrentWindow();

function TbBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid h-7 w-8 place-items-center rounded-md text-on-surface-variant outline-none transition-colors hover:text-on-surface",
        danger ? "hover:bg-error-container hover:text-on-error-container" : "hover:bg-surface-container"
      )}
    >
      {children}
    </button>
  );
}

function WindowControls() {
  const [win, setWin] = useState<Win | null>(null);
  const [max, setMax] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    loadWindow().then(async (w) => {
      if (dead) return;
      setWin(w);
      setMax(await w.isMaximized());
      off = await w.onResized(async () => setMax(await w.isMaximized()));
    }).catch(() => {});
    return () => { dead = true; off?.(); };
  }, []);
  if (!win) return null;
  return (
    <div className="ml-1 flex items-center">
      <TbBtn label="Minimize" onClick={() => void win.minimize()}><Icon name="remove" size={16} /></TbBtn>
      <TbBtn label={max ? "Restore" : "Maximize"} onClick={() => void win.toggleMaximize()}><Icon name={max ? "filter_none" : "crop_square"} size={14} /></TbBtn>
      <TbBtn label="Close" danger onClick={() => void win.close()}><Icon name="close" size={16} /></TbBtn>
    </div>
  );
}

export function Titlebar() {
  const sidebarOpen = useStore((s) => s.ui.sidebarOpen);
  const patchUI = useStore((s) => s.patchUI);
  const proj = useStore(activeProject);
  const label = proj?.root ? proj.root : proj?.name ?? "Workspace";
  return (
    <header data-tauri-drag-region className="oc-titlebar relative flex shrink-0 items-center gap-1 pl-2 pr-1 select-none">
      <TbBtn label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} onClick={() => patchUI({ sidebarOpen: !sidebarOpen })}>
        <Icon name={sidebarOpen ? "left_panel_close" : "left_panel_open"} size={18} />
      </TbBtn>
      <span data-tauri-drag-region className="pl-1 font-display text-[13px] font-semibold tracking-tight text-on-surface">Zeus Codes</span>
      <div data-tauri-drag-region className="pointer-events-none absolute inset-x-0 flex justify-center">
        <button
          onClick={() => window.dispatchEvent(new Event("zeus:palette"))}
          title="Command palette (Ctrl K)"
          className="oc-hairline pointer-events-auto flex h-7 w-[min(440px,36vw)] items-center gap-2 rounded-md bg-surface-low px-2.5 text-left text-[12.5px] text-on-surface-variant outline-none transition-colors hover:bg-surface-container"
        >
          <Icon name="search" size={15} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <kbd className="font-mono text-[10.5px] text-on-surface-variant/70">Ctrl K</kbd>
        </button>
      </div>
      <span data-tauri-drag-region className="flex-1" />
      <TbBtn label="Settings" onClick={() => patchUI({ settingsOpen: true, settingsTab: "appearance" })}><Icon name="settings" size={17} /></TbBtn>
      {isNative && <WindowControls />}
    </header>
  );
}
