// Sovereign Harness UI: runtime error banner with "Fix with Zeus", point-and-edit inspect toggle, and the
// snapshot (version) menu with undo / redo. All state lives in src/lib/sovereign; this file is presentation only.

import { useState } from "react";
import { useStore } from "../store";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { Dropdown, IconBtn, MenuItem, MenuLabel } from "./ui";
import { getConversationBoards } from "../lib/context";
import { requestHeal } from "../lib/sovereign/healer";
import { useSovereign } from "../lib/sovereign/state";
import { getVfs, vfsRedo, vfsRestore, vfsUndo } from "../lib/sovereign/vfsBinding";
import { MAX_AUTO_HEAL_ATTEMPTS } from "../lib/sovereign/types";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "..." : s);

/** Floating banner for the first board with an unresolved fatal error. */
export function HarnessBanner() {
  const errors = useSovereign((s) => s.errors);
  const heal = useSovereign((s) => s.heal);
  const busy = useStore((s) => s.busy);
  const boards = useStore((s) => s.artboards);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});

  const entry = Object.entries(errors)
    .map(([id, list]) => ({ id, list: list.filter((e) => e.fatal) }))
    .find((x) => x.list.length > 0 && (dismissed[x.id] ?? 0) < x.list[x.list.length - 1].at);
  if (!entry) return null;
  const board = boards.find((b) => b.id === entry.id);
  if (!board) return null;
  const err = entry.list[entry.list.length - 1];
  const h = heal[entry.id];
  const healing = h?.status === "healing" && busy;
  const exhausted = h?.status === "failed";
  const loc = err.line ? ` at line ${err.line}${err.column ? `:${err.column}` : ""}` : "";

  return (
    <div
      role="alert"
      className="absolute left-1/2 top-3 z-20 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 items-start gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container px-3.5 py-3"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Icon name={healing ? "auto_fix" : "error"} size={18} className={cn("mt-0.5 shrink-0", healing ? "text-primary" : "text-error")} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-xs font-semibold text-on-surface", healing && "zshine")}>
          {healing
            ? `Zeus is repairing ${board.name} (attempt ${h?.attempts ?? 1} of ${MAX_AUTO_HEAL_ATTEMPTS})`
            : exhausted
              ? `Automatic repair stopped in ${board.name}`
              : `${err.kind === "patch" ? "Patch did not apply" : err.kind === "truncated" ? "Rewrite rejected" : "Error"} in ${board.name}`}
        </div>
        <div className="mt-0.5 break-words font-mono text-[11px] leading-snug text-on-surface-variant">
          {clip(err.message, 220)}
          {loc}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!healing && (
          <button
            onClick={() => requestHeal(entry.id, { auto: false })}
            disabled={busy}
            className="state flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-40"
          >
            <Icon name="auto_fix" size={14} />
            Fix with Zeus
          </button>
        )}
        <IconBtn label="Dismiss" size={28} onClick={() => setDismissed((d) => ({ ...d, [entry.id]: Date.now() }))}>
          <Icon name="close" size={14} />
        </IconBtn>
      </div>
    </div>
  );
}

/** Toolbar toggle for point-and-edit mode on the selected (or first) screen. */
export function InspectToggle() {
  const on = useSovereign((s) => s.inspect.on);
  const sel = useStore((s) => s.sel);
  const toggle = () => {
    const sov = useSovereign.getState();
    if (sov.inspect.on) return sov.setInspect(false);
    const id = sel[0] ?? getConversationBoards()[0]?.id;
    if (!id) return useStore.getState().notify("Add a screen first");
    sov.setInspect(true, id);
    useStore.getState().notify("Click any element in the screen to target it. Esc cancels.");
  };
  return (
    <IconBtn label="Inspect: click an element to target your next edit" size={32} active={on} onClick={toggle}>
      <Icon name="ads_click" size={17} />
    </IconBtn>
  );
}

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

/** Snapshot history of the canvas (VFS): undo, redo, jump to any version. */
export function VersionsMenu() {
  useSovereign((s) => s.vfsRev);
  const convId = useStore((s) => s.activeConvId);
  const busy = useStore((s) => s.busy);
  const vfs = getVfs(convId);
  const list = vfs.history().slice().reverse();
  return (
    <Dropdown
      align="right"
      width={320}
      trigger={({ toggle, open }) => (
        <IconBtn label="Version history" size={32} active={open} onClick={toggle}>
          <Icon name="history" size={17} />
        </IconBtn>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Canvas versions</MenuLabel>
          <div className="flex gap-1 px-2 pb-1">
            <button
              disabled={!vfs.canUndo || busy}
              onClick={() => vfsUndo()}
              className="state flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-outline-variant/60 text-xs font-semibold text-on-surface disabled:opacity-35"
            >
              <Icon name="undo" size={14} />
              Undo
            </button>
            <button
              disabled={!vfs.canRedo || busy}
              onClick={() => vfsRedo()}
              className="state flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-outline-variant/60 text-xs font-semibold text-on-surface disabled:opacity-35"
            >
              <Icon name="redo" size={14} />
              Redo
            </button>
          </div>
          {list.length === 0 && <div className="px-4 py-3 text-xs text-on-surface-variant">Versions appear after the first design or edit.</div>}
          {list.slice(0, 20).map((snap) => {
            const stats = vfs.diff(snap.parent, snap.id).filter((d) => d.status !== "unchanged");
            const added = stats.reduce((n, d) => n + d.added, 0);
            const removed = stats.reduce((n, d) => n + d.removed, 0);
            return (
              <MenuItem
                key={snap.id}
                active={snap.id === vfs.headId}
                label={snap.label}
                desc={`v${snap.seq} · ${ago(snap.at)} · ${stats.length} file${stats.length === 1 ? "" : "s"} +${added} -${removed}`}
                onClick={() => {
                  if (!busy) vfsRestore(snap.id);
                  close();
                }}
              />
            );
          })}
        </>
      )}
    </Dropdown>
  );
}
