// Real pseudo-terminal sessions (ConPTY on Windows) owned by the native side.
// The UI only keeps a tiny registry of open sessions; scrollback lives in Rust and is replayed on re-attach.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { isNative } from "./bridge";

export interface ShellInfo {
  id: string;
  label: string;
  path: string;
}

export interface PtyTab {
  id: string;
  projectId: string;
  title: string;
  shell: ShellInfo;
  exited?: number;
}

interface AttachInfo {
  id: string;
  scrollback: string;
}

let tabs: PtyTab[] = [];
let active: Record<string, string> = {};
const subs = new Set<() => void>();
const dataSubs = new Map<string, Set<(data: string) => void>>();
let started = false;
let version = 0;

function bump() {
  version++;
  tabs = tabs.slice();
  subs.forEach((f) => f());
}

function ensureListeners() {
  if (started || !isNative) return;
  started = true;
  void listen<{ id: string; data: string }>("zeus://pty", (ev) => {
    dataSubs.get(ev.payload.id)?.forEach((f) => f(ev.payload.data));
  });
  void listen<{ id: string; code: number }>("zeus://pty-exit", (ev) => {
    const t = tabs.find((x) => x.id === ev.payload.id);
    if (t) {
      t.exited = ev.payload.code;
      bump();
    }
  });
}

export function onPtyData(id: string, fn: (data: string) => void): () => void {
  ensureListeners();
  let set = dataSubs.get(id);
  if (!set) dataSubs.set(id, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) dataSubs.delete(id);
  };
}

export async function ptyShells(): Promise<{ default: ShellInfo; available: ShellInfo[] } | null> {
  if (!isNative) return null;
  try {
    return await invoke("term_shells");
  } catch {
    return null;
  }
}

export async function openPty(projectId: string, root: string, shell?: string, title?: string): Promise<PtyTab | null> {
  if (!isNative) return null;
  ensureListeners();
  const r = await invoke<{ id: string; shell: ShellInfo }>("pty_open", { root, shell: shell ?? null, cols: 100, rows: 28 });
  const n = tabs.filter((t) => t.projectId === projectId).length + 1;
  const tab: PtyTab = { id: r.id, projectId, shell: r.shell, title: title ?? `${r.shell.label} ${n}` };
  tabs = [...tabs, tab];
  active = { ...active, [projectId]: tab.id };
  bump();
  return tab;
}

const inflight = new Map<string, Promise<PtyTab | null>>();

/** Opens the project's first shell once, even if several effects ask at the same time. */
export function ensurePty(projectId: string, root: string): Promise<PtyTab | null> {
  const have = tabs.find((t) => t.projectId === projectId);
  if (have) return Promise.resolve(have);
  let p = inflight.get(projectId);
  if (!p) {
    p = openPty(projectId, root).finally(() => inflight.delete(projectId));
    inflight.set(projectId, p);
  }
  return p;
}

export function closePty(id: string) {
  const t = tabs.find((x) => x.id === id);
  invoke("pty_close", { id }).catch(() => {});
  tabs = tabs.filter((x) => x.id !== id);
  if (t && active[t.projectId] === id) {
    const next = tabs.filter((x) => x.projectId === t.projectId).pop();
    active = { ...active, [t.projectId]: next?.id ?? "" };
  }
  bump();
}

export function setActivePty(projectId: string, id: string) {
  active = { ...active, [projectId]: id };
  bump();
}

export const ptyApi = {
  write: (id: string, data: string) => void invoke("pty_write", { id, data }).catch(() => {}),
  resize: (id: string, cols: number, rows: number) => void invoke("pty_resize", { id, cols, rows }).catch(() => {}),
  attach: async (id: string): Promise<string> => {
    try {
      const r = await invoke<AttachInfo | null>("pty_attach", { id });
      return r?.scrollback ?? "";
    } catch {
      return "";
    }
  },
  cancelRun: (id: string) => void invoke("shell_cancel", { id }).catch(() => {}),
};

function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export function usePtyTabs(projectId: string): { tabs: PtyTab[]; active: string } {
  useSyncExternalStore(subscribe, () => version);
  return { tabs: tabs.filter((t) => t.projectId === projectId), active: active[projectId] ?? "" };
}
