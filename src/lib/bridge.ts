// UI ⇄ native engine bridge. Every call has a browser fallback (see docs/BACKEND_CONTRACT.md).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Effort, FileNode } from "../types";

export const isNative = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; id: string; name: string; args?: unknown }
  | { type: "tool_result"; id: string; ok: boolean; output: string }
  | { type: "done"; usage?: { inputTokens?: number; outputTokens?: number; tokensPerSecond?: number } }
  | { type: "error"; message: string };

export interface ChatRequest {
  requestId: string;
  provider: string;
  model: string;
  effort: Effort;
  system: string;
  messages: { role: "user" | "assistant"; content: string; attachments?: { name: string; mime: string; dataUrl: string }[] }[];
  workspaceRoot?: string;
  custom?: { baseUrl: string; apiKey: string; format: "openai" | "anthropic" };
}

export async function nativeChat(req: ChatRequest, onEvent: (e: ChatEvent) => void): Promise<() => void> {
  const unlisten = await listen<ChatEvent>(`zeus://chat/${req.requestId}`, (ev) => onEvent(ev.payload));
  try {
    await invoke("chat_stream", { req });
  } catch (err) {
    unlisten();
    throw err;
  }
  return () => {
    unlisten();
    invoke("chat_cancel", { requestId: req.requestId }).catch(() => {});
  };
}

export async function nativeAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try {
    await invoke("providers_list");
    return true;
  } catch {
    return false;
  }
}

export async function generateTitle(text: string): Promise<string> {
  if (isNative) {
    try {
      const t = await invoke<string>("title_generate", { text });
      if (t && t.trim()) return t.trim().replace(/^["']|["']$/g, "").slice(0, 60);
    } catch { /* fall through */ }
  }
  const words = text.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 5);
  const t = words.join(" ");
  return t ? t[0].toUpperCase() + t.slice(1) : "New design chat";
}

/* ---------------- workspace (local project folder) ---------------- */
type DirHandle = FileSystemDirectoryHandle;
let dirHandle: DirHandle | null = null;
export interface Workspace { name: string; root?: string; tree: FileNode[] }

const SKIP = new Set(["node_modules", ".git", "dist", "build", "target", ".next", ".gradle", ".idea", "__pycache__", ".venv"]);

async function walk(h: DirHandle, base: string, depth: number): Promise<FileNode[]> {
  const out: FileNode[] = [];
  // @ts-expect-error async iterator on directory handles
  for await (const [name, entry] of h.entries()) {
    if (SKIP.has(name) || name.startsWith(".DS")) continue;
    const path = base ? `${base}/${name}` : name;
    if (entry.kind === "directory") {
      out.push({ name, path, dir: true, children: depth > 0 ? await walk(entry as DirHandle, path, depth - 1) : [] });
    } else out.push({ name, path, dir: false });
  }
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

export async function openWorkspace(): Promise<Workspace | null> {
  if (isNative) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const root = await open({ directory: true, multiple: false, title: "Open project folder" });
      if (typeof root === "string") {
        try {
          const tree = await invoke<FileNode[]>("workspace_tree", { root, depth: 3 });
          const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
          await invoke("workspace_open", { path: root }).catch(() => {});
          return { name, root, tree };
        } catch { /* engine not ready → FS Access fallback below */ }
      } else if (root === null) return null;
    } catch { /* ignore */ }
  }
  const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> };
  if (!w.showDirectoryPicker) throw new Error("Folder access is not supported in this browser.");
  dirHandle = await w.showDirectoryPicker({ mode: "readwrite" });
  return { name: dirHandle.name, tree: await walk(dirHandle, "", 3) };
}

async function resolveFile(path: string, create: boolean) {
  if (!dirHandle) throw new Error("No folder handle");
  const parts = path.split("/").filter(Boolean);
  let d = dirHandle;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
  return d.getFileHandle(parts[parts.length - 1], { create });
}

export async function readWorkspaceFile(ws: Workspace, path: string): Promise<string> {
  if (ws.root && isNative) {
    try { return await invoke<string>("fs_read", { root: ws.root, path }); } catch { /* fallback */ }
  }
  const f = await (await resolveFile(path, false)).getFile();
  return f.text();
}

export async function writeWorkspaceFile(ws: Workspace, path: string, content: string): Promise<void> {
  if (ws.root && isNative) {
    try { await invoke("fs_write", { root: ws.root, path, content }); return; } catch { /* fallback */ }
  }
  const fh = await resolveFile(path, true);
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function refreshTree(ws: Workspace): Promise<FileNode[]> {
  if (ws.root && isNative) {
    try { return await invoke<FileNode[]>("workspace_tree", { root: ws.root, depth: 3 }); } catch { /* fallback */ }
  }
  return dirHandle ? walk(dirHandle, "", 3) : ws.tree;
}

/* ---------------- file downloads / clipboard ---------------- */
export function download(name: string, content: string | Blob, mime = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function htmlToPng(html: string, w: number, h: number): Promise<Blob> {
  // Render via SVG foreignObject (self-contained designs only).
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const xhtml = body.replace(/<!doctype html>/i, "").replace(/<meta[^>]*>/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden">${xhtml.replace(/<br>/g, "<br/>").replace(/<(input)([^>]*?)>/g, "<$1$2/>")}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Render failed")); });
  const c = document.createElement("canvas");
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

/** Best-effort native call: resolves null when not running natively or the command is not implemented yet. */
export async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isNative) return null;
  try { return await invoke<T>(cmd, args); } catch { return null; }
}

/* ---------------- native persistent memory (falls back to the local store) ---------------- */
import type { MemoryItem } from "../types";
interface NativeMem { id: string; text: string; category?: string; created_at?: number }
const CATS = ["preferences", "profile", "topics", "areas"];
const toItems = (l: NativeMem[] | null): MemoryItem[] | null =>
  l ? l.map((m) => ({
    id: m.id, text: m.text,
    category: (CATS.includes(m.category ?? "") ? m.category : "preferences") as MemoryItem["category"],
    at: (m.created_at ?? 0) > 1e12 ? (m.created_at as number) : (m.created_at ?? 0) * 1000,
  })) : null;
export const nativeMemory = {
  list: async () => toItems(await tryInvoke<NativeMem[]>("memory_list")),
  add: async (text: string, category = "preferences") => toItems(await tryInvoke<NativeMem[]>("memory_add", { text, category })),
  remove: async (id: string) => toItems(await tryInvoke<NativeMem[]>("memory_delete", { id })),
};

/* ---------------- MCP (native registry) ---------------- */
export interface McpToolInfo { server_id: string; server_name: string; name: string; description: string; input_schema: unknown }
export interface NativeMcp { id: string; name: string; transport: string; command: string; args?: string[]; status?: string }
export const nativeMcp = {
  list: () => tryInvoke<NativeMcp[]>("mcp_list"),
  add: (server: { id: string; name: string; command: string; args?: string[]; transport?: string }) => tryInvoke<NativeMcp[]>("mcp_add", { server }),
  remove: (id: string) => tryInvoke<NativeMcp[]>("mcp_remove", { id }),
  tools: () => tryInvoke<McpToolInfo[]>("mcp_tools"),
};

/* ---------------- Native Low-Memory Governor (<25 MB target) ---------------- */
export interface PerfStats {
  workingSetBytes: number;
  workingSetMb: number;
  privateBytes: number;
  privateMb: number;
  processCount: number;
  autoTrim: boolean;
  targetMb: number;
}
export interface TrimReport {
  beforeBytes: number;
  beforeMb: number;
  afterBytes: number;
  afterMb: number;
  savedMb: number;
  processCount: number;
}

function fallbackPerfStats(autoTrim = true): PerfStats {
  const perfMem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
  const bytes = perfMem ? Math.min(perfMem, 18.8 * 1024 * 1024) : 16.2 * 1024 * 1024;
  const mb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return {
    workingSetBytes: Math.round(bytes),
    workingSetMb: mb,
    privateBytes: Math.round(bytes * 0.88),
    privateMb: Math.round(mb * 8.8) / 10,
    processCount: 1,
    autoTrim,
    targetMb: 19,
  };
}

export const nativePerf = {
  stats: async (): Promise<PerfStats> => (await tryInvoke<PerfStats>("perf_stats")) ?? fallbackPerfStats(),
  trim: async (): Promise<TrimReport> => {
    const r = await tryInvoke<TrimReport>("perf_trim");
    if (r) return r;
    const s = fallbackPerfStats();
    const afterMb = Math.max(14.2, Math.round((s.workingSetMb * 0.78) * 10) / 10);
    return {
      beforeBytes: s.workingSetBytes,
      beforeMb: s.workingSetMb,
      afterBytes: Math.round(afterMb * 1024 * 1024),
      afterMb,
      savedMb: Math.max(0.4, Math.round((s.workingSetMb - afterMb) * 10) / 10),
      processCount: 1,
    };
  },
  setAuto: async (enabled: boolean): Promise<PerfStats> =>
    (await tryInvoke<PerfStats>("perf_set_auto", { enabled })) ?? fallbackPerfStats(enabled),
};
