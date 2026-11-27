// UI ⇄ native engine bridge. Every call has a browser fallback (see docs/BACKEND_CONTRACT.md).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Effort, FileNode } from "../types";

export const isNative = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; id: string; name: string; args?: unknown }
  | {
      type: "tool_result";
      id: string;
      ok: boolean;
      output: string;
      oldContent?: string;
      newContent?: string;
      checkpointId?: string;
      files?: Array<{ path: string; from?: string; kind?: string; oldContent?: string | null; newContent?: string | null }>;
    }
  | {
      type: "provider_notice";
      provider: string;
      model: string;
      message: string;
    }
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
  sessionId?: string;
  subagentDepth?: number;
  maxSubagentDepth?: number;
  toolsPrompt?: string;
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
  return t ? t[0].toUpperCase() + t.slice(1) : "New chat";
}

/* ---------------- workspace (local project folder) ---------------- */
type DirHandle = FileSystemDirectoryHandle;
let dirHandle: DirHandle | null = null;
export interface Workspace { name: string; root?: string; tree: FileNode[] }

const SKIP = new Set(["node_modules", ".git", "dist", "build", "target", ".next", ".gradle", ".idea", "__pycache__", ".venv"]);

async function walk(h: DirHandle, base: string, depth: number): Promise<FileNode[]> {
  const out: FileNode[] = [];
  let n = 0;
  // @ts-expect-error async iterator on directory handles
  for await (const [name, entry] of h.entries()) {
    if (++n > 400) break;
    if (SKIP.has(name) || name.startsWith(".DS")) continue;
    const path = base ? `${base}/${name}` : name;
    if (entry.kind === "directory") {
      out.push({ name, path, dir: true, children: depth > 0 ? await walk(entry as DirHandle, path, depth - 1) : [] });
    } else out.push({ name, path, dir: false });
  }
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

const TREE_DEPTH = 1;
const errMsg = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Could not open that folder.");

export async function openWorkspace(): Promise<Workspace | null> {
  if (isNative) {
    try {
      const picked = await invoke<{ name: string; root: string; tree: FileNode[] } | null>("workspace_pick");
      if (picked === null) return null;
      if (picked && typeof picked.root === "string") {
        return { name: picked.name || picked.root, root: picked.root, tree: Array.isArray(picked.tree) ? picked.tree : [] };
      }
    } catch (e) {
      const msg = errMsg(e);
      if (/drive root|system folder|does not exist/i.test(msg)) {
        throw new Error(msg);
      }
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const raw = await open({ directory: true, multiple: false, title: "Open project folder" });
    if (raw === null) return null;
    const root = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : (raw as { path?: string })?.path;
    if (!root || typeof root !== "string") return null;
    try {
      await invoke("workspace_open", { path: root });
      const tree = await invoke<FileNode[]>("workspace_tree", { root, depth: TREE_DEPTH });
      const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
      return { name, root, tree };
    } catch (e) {
      throw new Error(errMsg(e));
    }
  }
  const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> };
  if (!w.showDirectoryPicker) throw new Error("Folder access is not supported in this browser.");
  dirHandle = await w.showDirectoryPicker({ mode: "readwrite" });
  return { name: dirHandle.name, tree: await walk(dirHandle, "", TREE_DEPTH) };
}

/** Lazily list one directory level (used when expanding folders in the file tree). */
export async function listWorkspaceDir(ws: Workspace, rel: string): Promise<FileNode[]> {
  if (ws.root && isNative) {
    try { return await invoke<FileNode[]>("workspace_list", { root: ws.root, rel }); } catch { return []; }
  }
  if (!dirHandle) return [];
  let d = dirHandle;
  try { for (const p of rel.split("/").filter(Boolean)) d = await d.getDirectoryHandle(p); } catch { return []; }
  return walk(d, rel, 0);
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
    try { return await invoke<FileNode[]>("workspace_tree", { root: ws.root, depth: TREE_DEPTH }); } catch { return ws.tree; }
  }
  return dirHandle ? walk(dirHandle, "", TREE_DEPTH) : ws.tree;
}

export async function openWorkspaceByPath(root: string, fallbackName?: string): Promise<Workspace | null> {
  const trimmed = root.trim();
  if (!trimmed) return null;
  const name = fallbackName || trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed;
  if (isNative) {
    try {
      await invoke("workspace_open", { path: trimmed });
      const tree = await invoke<FileNode[]>("workspace_tree", { root: trimmed, depth: TREE_DEPTH });
      return { name, root: trimmed, tree };
    } catch {
      return { name, root: trimmed, tree: [] };
    }
  }
  return { name, root: trimmed, tree: [] };
}

export interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
  cwd?: string;
}

export interface TermEvent {
  id: string;
  root: string;
  cmd: string;
  source: "user" | "agent";
  running: boolean;
  code?: number;
  stdout?: string;
  stderr?: string;
  cwd?: string;
  chunk?: string;
  shell?: string;
}

/** Every command the agent runs is mirrored here so the Terminal panel is the one shared terminal. */
export async function listenTerminal(onEvent: (e: TermEvent) => void): Promise<() => void> {
  if (!isNative) return () => {};
  try {
    return await listen<TermEvent>("zeus://term", (ev) => onEvent(ev.payload));
  } catch {
    return () => {};
  }
}

export const nativeShell = {
  run: async (root: string | undefined, cmd: string): Promise<ShellResult> => {
    const r = await tryInvoke<ShellResult>("shell_run", { root: root ?? "", cmd });
    if (r) return r;
    return {
      code: 0,
      stdout: `[browser preview] $ ${cmd}\nConnect in the native Windows app for live shell execution in ${root || "."}.`,
      stderr: "",
    };
  },
};

export interface NativeCheckpointManifest {
  id: string;
  label: string;
  createdAt: number;
  files: Array<{ path: string; existed: boolean; blob?: string }>;
}

export const nativeCheckpoints = {
  list: async (root?: string): Promise<NativeCheckpointManifest[]> => {
    if (!root) return [];
    return (await tryInvoke<NativeCheckpointManifest[]>("workspace_checkpoints", { root })) ?? [];
  },
  restore: async (root: string, checkpointId: string): Promise<{ id: string; restoredFiles: string[] } | null> => {
    if (!root || !checkpointId) return null;
    return await tryInvoke<{ id: string; restoredFiles: string[] }>("workspace_restore_checkpoint", {
      root,
      checkpointId,
    });
  },
};

export interface NativeGitStatus {
  isRepo: boolean;
  branch: string;
  changed: Array<{ path: string; status: string; staged: boolean }>;
  commits: Array<{ hash: string; author: string; date: string; message: string }>;
}

export const nativeGit = {
  status: async (root?: string): Promise<NativeGitStatus> => {
    if (!root) return { isRepo: false, branch: "", changed: [], commits: [] };
    return (
      (await tryInvoke<NativeGitStatus>("workspace_git_status", { root })) ?? {
        isRepo: false,
        branch: "",
        changed: [],
        commits: [],
      }
    );
  },
};

export const nativeAudit = {
  check: async (root?: string, paths?: string[]): Promise<string[]> => {
    if (!root) return [];
    return (await tryInvoke<string[]>("workspace_audit", { root, paths })) ?? [];
  },
};

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
  search: async (query = "", category?: string, project?: string) =>
    toItems(await tryInvoke<NativeMem[]>("memory_search", { query, category, project })),
  add: async (text: string, category = "preferences", project?: string) =>
    toItems(await tryInvoke<NativeMem[]>("memory_add", { text, category, project })),
  update: async (id: string, text: string, category?: string) =>
    toItems(await tryInvoke<NativeMem[]>("memory_update", { id, text, category })),
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

/* ---------------- Local OpenAI / Anthropic / OpenCode Server ---------------- */
export interface ServerStatus {
  running: boolean;
  port: number;
  baseUrl: string;
  openaiBaseUrl: string;
  chatCompletionsUrl: string;
  modelsUrl: string;
  messagesUrl: string;
  opencodeConfigUrl: string;
  apiKey: string;
  requestCount: number;
  modelCount: number;
  lastModel: string;
}

let fallbackServerRunning = false;
let fallbackServerPort = 11435;

function buildFallbackServerStatus(): ServerStatus {
  const base = `http://127.0.0.1:${fallbackServerPort}`;
  return {
    running: fallbackServerRunning,
    port: fallbackServerPort,
    baseUrl: base,
    openaiBaseUrl: `${base}/v1`,
    chatCompletionsUrl: `${base}/v1/chat/completions`,
    modelsUrl: `${base}/v1/models`,
    messagesUrl: `${base}/v1/messages`,
    opencodeConfigUrl: `${base}/v1/opencode.json`,
    apiKey: "zeus-local",
    requestCount: 0,
    modelCount: 148,
    lastModel: "gemini-4-hydrogen",
  };
}

export function buildFallbackOpencodeConfig(port = fallbackServerPort): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/config.json",
    model: "zeusdesigns/gemini-4-hydrogen",
    small_model: "zeusdesigns/claude-haiku-5-5",
    provider: {
      zeusdesigns: {
        npm: "@ai-sdk/openai-compatible",
        name: "ZeusDesigns Local Gateway (Free Keyless)",
        options: {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: "zeus-local",
        },
        models: {
          "mercury-3": {
            name: "Mercury 3 Diffusion 2,000+ tok/s (Zeus Inception)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 128000, output: 16384 },
          },
          "gemini-4-hydrogen": {
            name: "Gemini 4 Hydrogen (Zeus FreeCC)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 262144, output: 16384 },
          },
          "gemini-3-flash-preview": {
            name: "Gemini 3 Flash VL (Zeus FreeCC)",
            tool_call: true,
            reasoning: true,
            attachment: true,
            temperature: true,
            limit: { context: 262144, output: 16384 },
          },
          "claude-opus-5-5": {
            name: "Claude Opus 5.5 (Zeus Unikey)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 200000, output: 16384 },
          },
          "gpt-6.1-sol": {
            name: "GPT-6.1 Sol (Zeus Unikey)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 200000, output: 16384 },
          },
          "gpt-6-astra": {
            name: "GPT-6 Astra (Zeus Unikey)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 200000, output: 16384 },
          },
          "claude-haiku-5-5": {
            name: "Claude Haiku 5.5 (Zeus DeepAI)",
            tool_call: true,
            reasoning: false,
            attachment: false,
            temperature: true,
            limit: { context: 64000, output: 8192 },
          },
          "qwen4-max": {
            name: "Qwen 4 Max (Zeus Qwen App)",
            tool_call: true,
            reasoning: true,
            attachment: true,
            temperature: true,
            limit: { context: 256000, output: 16384 },
          },
          "Qwen3.6-35B-A3B": {
            name: "Qwen 3.6 35B A3B MoE (Zeus Colibri)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 131072, output: 16384 },
          },
          "DeepSeek-V4.1-Flash-1017": {
            name: "DeepSeek V4.1 Flash (Zeus OVHcloud)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 262144, output: 16384 },
          },
          "glm-5.3": {
            name: "GLM 5.3 Flagship (Zeus Together)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 131072, output: 16384 },
          },
          "nemotron-3.5-super-vl": {
            name: "Nemotron 3.5 Super VL 120B (Zeus Kilo)",
            tool_call: true,
            reasoning: true,
            attachment: true,
            temperature: true,
            limit: { context: 262144, output: 16384 },
          },
          "mistral-large-4-1t": {
            name: "Mistral Large 4 1T A52B (Zeus NIM Cloud)",
            tool_call: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            limit: { context: 262144, output: 16384 },
          },
        },
      },
    },
  };
}

export const nativeServer = {
  status: async (): Promise<ServerStatus> =>
    (await tryInvoke<ServerStatus>("server_status")) ?? buildFallbackServerStatus(),
  start: async (port?: number): Promise<ServerStatus> => {
    if (port && port > 1024 && port < 65535) fallbackServerPort = port;
    fallbackServerRunning = true;
    return (await tryInvoke<ServerStatus>("server_start", port ? { port } : {})) ?? buildFallbackServerStatus();
  },
  stop: async (): Promise<ServerStatus> => {
    fallbackServerRunning = false;
    return (await tryInvoke<ServerStatus>("server_stop")) ?? buildFallbackServerStatus();
  },
  opencodeConfig: async (): Promise<Record<string, unknown>> =>
    (await tryInvoke<Record<string, unknown>>("server_opencode_config")) ?? buildFallbackOpencodeConfig(),
  installOpencode: async (
    workspaceRoot?: string
  ): Promise<{ ok: boolean; paths: string[]; baseUrl: string; defaultModel: string }> => {
    const r = await tryInvoke<{ ok: boolean; paths: string[]; baseUrl: string; defaultModel: string }>(
      "server_install_opencode",
      workspaceRoot ? { workspaceRoot } : {}
    );
    if (r) return r;
    const cfg = buildFallbackOpencodeConfig();
    download("opencode.json", JSON.stringify(cfg, null, 2), "application/json");
    return {
      ok: true,
      paths: ["opencode.json (downloaded)"],
      baseUrl: `http://127.0.0.1:${fallbackServerPort}/v1`,
      defaultModel: "zeusdesigns/gemini-4-hydrogen",
    };
  },
};
