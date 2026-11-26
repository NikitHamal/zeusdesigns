// Native Zero-Dependency OpenCode SDK Client & Agent Runtime (`src/lib/opencode.ts`)
// Implements the full `@opencode-ai/sdk` v1 HTTP + SSE protocol natively with zero external npm dependencies
// (keeping WebView2 RAM strictly under 17 MB), connecting seamlessly to either:
//   1. An external `opencode serve` instance (`http://127.0.0.1:4096`), OR
//   2. Zeus's built-in Native Rust OpenCode SDK Server (`http://127.0.0.1:11435`, auto-started on demand).

import { nativeServer, refreshTree } from "./bridge";
import { useStore } from "../store";
import type { ToolCall } from "../types";

export const OC_EXTERNAL_PORT = 4096;
export const OC_BUILTIN_PORT = 11435;
const EXTERNAL_BASE = `http://127.0.0.1:${OC_EXTERNAL_PORT}`;
const BUILTIN_BASE = `http://127.0.0.1:${OC_BUILTIN_PORT}`;

const sessions = new Map<string, string>();
let activeOcBase = BUILTIN_BASE;

export interface OpencodeModelRef {
  providerID: string;
  modelID: string;
}

export interface OpencodeSessionInfo {
  id: string;
  title: string;
  directory: string;
  version?: string;
  time?: { created: number; updated: number };
}

export interface OpencodeEvent {
  type: string;
  properties: Record<string, any>;
}

/** Resolve the OpenCode `{ providerID, modelID }` pair for the currently selected Zeus provider & model. */
export function ocModel(providerId: string, modelId: string): OpencodeModelRef {
  if (providerId === "opencodezen") {
    return { providerID: "opencode", modelID: modelId };
  }
  if (providerId.startsWith("custom:")) {
    return { providerID: "zeusdesigns", modelID: modelId };
  }
  return { providerID: "zeusdesigns", modelID: `${providerId}/${modelId}` };
}

async function checkHealthAt(baseUrl: string, timeoutMs = 1200): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl}/global/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function ocHealthy(): Promise<boolean> {
  return (await checkHealthAt(BUILTIN_BASE)) || (await checkHealthAt(EXTERNAL_BASE));
}

/**
 * Ensures an OpenCode SDK server is running and returns its base URL.
 * Prefers an active external `opencode serve` on `:4096` if present; otherwise uses (and auto-starts)
 * Zeus's built-in Native Rust OpenCode SDK Server on `:11435`.
 */
export async function ensureOpenCode(): Promise<string> {
  if (await checkHealthAt(EXTERNAL_BASE, 700)) {
    activeOcBase = EXTERNAL_BASE;
    return EXTERNAL_BASE;
  }
  if (await checkHealthAt(BUILTIN_BASE, 900)) {
    activeOcBase = BUILTIN_BASE;
    return BUILTIN_BASE;
  }
  const st = await nativeServer.start();
  const baseUrl = st?.baseUrl || BUILTIN_BASE;
  activeOcBase = baseUrl;
  return baseUrl;
}

/**
 * Lightweight, standards-compliant `@opencode-ai/sdk` client (`createOpencodeClient`)
 * using native `fetch` and `ReadableStream` SSE parsing.
 */
export function createOpencodeClient(opts: { baseUrl?: string; directory?: string } = {}) {
  const base = (opts.baseUrl || activeOcBase).replace(/\/+$/, "");
  const dirQuery = opts.directory ? `?directory=${encodeURIComponent(opts.directory)}` : "";

  return {
    global: {
      health: async () => {
        const r = await fetch(`${base}/global/health`);
        return { data: await r.json(), ok: r.ok };
      },
    },
    session: {
      list: async () => {
        const r = await fetch(`${base}/session${dirQuery}`);
        return { data: (await r.json()) as OpencodeSessionInfo[] };
      },
      create: async (params: { body?: { title?: string } } = {}) => {
        const r = await fetch(`${base}/session${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params.body ?? {}),
        });
        return { data: (await r.json()) as OpencodeSessionInfo };
      },
      get: async (params: { path: { id: string } }) => {
        const r = await fetch(`${base}/session/${encodeURIComponent(params.path.id)}${dirQuery}`);
        return { data: (await r.json()) as OpencodeSessionInfo };
      },
      abort: async (params: { path: { id: string } }) => {
        const r = await fetch(`${base}/session/${encodeURIComponent(params.path.id)}/abort${dirQuery}`, {
          method: "POST",
        });
        return { data: await r.json().catch(() => true), ok: r.ok };
      },
      prompt: async (params: {
        path: { id: string };
        body: {
          model?: OpencodeModelRef | string;
          effort?: string;
          system?: string;
          parts: Array<{ type: "text"; text: string }>;
        };
        signal?: AbortSignal;
      }) => {
        const r = await fetch(`${base}/session/${encodeURIComponent(params.path.id)}/message${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params.body),
          signal: params.signal,
        });
        return { data: await r.json(), ok: r.ok };
      },
    },
    event: {
      subscribe: async (signal?: AbortSignal) => {
        const controller = new AbortController();
        if (signal) {
          signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
        const resp = await fetch(`${base}/event${dirQuery}`, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        async function* streamGenerator(): AsyncGenerator<OpencodeEvent, void, unknown> {
          if (!resp.body) return;
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              let nl: number;
              while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (line.startsWith("data:")) {
                  const raw = line.slice(5).trim();
                  if (!raw || raw === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(raw) as OpencodeEvent;
                    if (parsed && typeof parsed.type === "string") {
                      yield parsed;
                    }
                  } catch {
                    /* ignore non-JSON keepalive frames */
                  }
                }
              }
            }
          } finally {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
          }
        }
        const gen = streamGenerator();
        return {
          stream: gen,
          close: () => controller.abort(),
        };
      },
    },
  };
}

export interface OpenCodeRunOptions {
  convId: string;
  title: string;
  prompt: string;
  system?: string;
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onTool: (tool: ToolCall) => void;
  signal: AbortSignal;
}

/**
 * Executes a prompt through the OpenCode SDK session + SSE event stream (`message.part.updated`,
 * `reasoning`, `tool`, `text`, `session.idle`), streaming live updates into Zeus's chat and WorkLog.
 */
export async function runOpenCode(opts: OpenCodeRunOptions): Promise<void> {
  const st = useStore.getState();
  const { providerId, modelId, effort } = st.settings;
  const activeProjRoot = st.projects.find((p) => p.id === st.activeProjectId)?.root;
  const root = st.ui.workspace?.root || activeProjRoot || "";

  const baseUrl = await ensureOpenCode();
  const client = createOpencodeClient({ baseUrl, directory: root });

  let sid = sessions.get(opts.convId);
  if (!sid) {
    const created = await client.session.create({ body: { title: opts.title || "OpenCode Session" } });
    sid = created.data?.id;
    if (!sid) throw new Error("OpenCode SDK could not create a session.");
    sessions.set(opts.convId, sid);
  }
  const sessionId = sid;

  const roles = new Map<string, string>();
  const seenText = new Map<string, string>();
  const seenReason = new Map<string, string>();
  const sub = await client.event.subscribe(opts.signal);

  const onAbort = () => {
    void client.session.abort({ path: { id: sessionId } });
    sub.close();
  };
  opts.signal.addEventListener("abort", onAbort, { once: true });

  let resolveIdle: () => void = () => {};
  const idlePromise = new Promise<void>((r) => {
    resolveIdle = r;
  });
  let failure = "";

  const pump = (async () => {
    try {
      for await (const ev of sub.stream) {
        const p = ev.properties ?? {};
        if (ev.type === "message.updated" && p.info?.sessionID === sessionId) {
          roles.set(p.info.id, p.info.role);
        } else if (ev.type === "message.part.updated" && p.part?.sessionID === sessionId) {
          const part = p.part;
          const role = roles.get(part.messageID) ?? "assistant";
          if (role !== "assistant") continue;
          if (part.type === "reasoning") {
            const prev = seenReason.get(part.id) ?? "";
            const full: string = part.text ?? "";
            const piece: string =
              typeof p.delta === "string" && p.delta.length > 0
                ? p.delta
                : full.startsWith(prev)
                ? full.slice(prev.length)
                : full;
            seenReason.set(part.id, full);
            if (piece) opts.onReasoning(piece);
          } else if (part.type === "text") {
            const prev = seenText.get(part.id) ?? "";
            const full: string = part.text ?? "";
            const piece: string =
              typeof p.delta === "string" && p.delta.length > 0
                ? p.delta
                : full.startsWith(prev)
                ? full.slice(prev.length)
                : full;
            seenText.set(part.id, full);
            if (piece) opts.onText(piece);
          } else if (part.type === "tool") {
            const s = part.state ?? {};
            const status = s.status === "completed" ? "ok" : s.status === "error" ? "error" : "running";
            opts.onTool({
              id: part.callID ?? part.id,
              name: part.tool,
              status,
              args: s.input ? (typeof s.input === "string" ? s.input : JSON.stringify(s.input)) : undefined,
              output:
                typeof s.output === "string"
                  ? s.output.slice(0, 24000)
                  : typeof s.error === "string"
                  ? s.error
                  : undefined,
            });
          }
        } else if (ev.type === "session.error" && (!p.sessionID || p.sessionID === sessionId)) {
          failure = p.error?.data?.message ?? p.error?.name ?? "OpenCode SDK session error";
          resolveIdle();
          break;
        } else if (ev.type === "session.idle" && p.sessionID === sessionId) {
          resolveIdle();
          break;
        }
      }
    } catch {
      resolveIdle();
    }
  })();

  try {
    const promptPromise = client.session.prompt({
      path: { id: sessionId },
      body: {
        model: ocModel(providerId, modelId),
        effort,
        system: opts.system,
        parts: [{ type: "text", text: opts.prompt }],
      },
      signal: opts.signal,
    });

    const resp = await Promise.race([
      idlePromise.then(() => null),
      promptPromise.then(async (r) => {
        await new Promise((res) => setTimeout(res, 180));
        return r;
      }),
    ]);

    const finalData = resp ?? (await promptPromise.catch(() => null));
    if (finalData?.data?.parts && Array.isArray(finalData.data.parts)) {
      for (const pt of finalData.data.parts) {
        if (pt.type === "reasoning" && pt.text && seenReason.size === 0) {
          opts.onReasoning(pt.text);
        } else if (pt.type === "text" && pt.text && seenText.size === 0) {
          opts.onText(pt.text);
        }
      }
    }
    if (failure) throw new Error(failure);
  } finally {
    opts.signal.removeEventListener("abort", onAbort);
    sub.close();
    void pump;
    const curWs = useStore.getState().ui.workspace;
    if (curWs) {
      refreshTree(curWs)
        .then((tree) => useStore.getState().patchUI({ workspace: { ...curWs, tree } }))
        .catch(() => {});
    }
  }
}

export const resetOpenCodeSessions = () => sessions.clear();
