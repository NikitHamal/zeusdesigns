// OpenCode SDK runtime: Zeus starts `opencode serve` in the project folder and drives it through @opencode-ai/sdk,
// so the agent loop, file edits, shell and permissions are OpenCode's own while the models are Zeus's free keyless ones.
import { nativeOpenCode } from "./bridge";
import { useStore } from "../store";
import type { ToolCall } from "../types";

export const OC_PORT = 4096;
const BASE = `http://127.0.0.1:${OC_PORT}`;
const GATEWAY = "http://127.0.0.1:11435";
const sessions = new Map<string, string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sdk(directory?: string, baseUrl = activeOcBase) {
  const { createOpencodeClient } = await import("@opencode-ai/sdk/client");
  return createOpencodeClient({ baseUrl, directory });
}

export async function ocHealthy(): Promise<boolean> {
  return (await checkHealthAt(BASE)) || (await checkHealthAt(GATEWAY));
}

/** Provider/model pair OpenCode should use for the model picked in Zeus. Zen is OpenCode's own provider; everything else goes through the Zeus gateway. */
export function ocModel(providerId: string, modelId: string): { providerID: string; modelID: string } {
  if (providerId === "opencodezen") return { providerID: "opencode", modelID: modelId };
  return { providerID: "zeusdesigns", modelID: `${providerId}/${modelId}` };
}

async function buildConfig(providerId: string, modelId: string): Promise<Record<string, unknown>> {
  let cfg: Record<string, any> = {};
  try {
    cfg = await (await fetch(`${GATEWAY}/v1/opencode.json`, { signal: AbortSignal.timeout(2000) })).json();
  } catch {
    const { nativeServer } = await import("./bridge");
    await nativeServer.start();
    try {
      cfg = await (await fetch(`${GATEWAY}/v1/opencode.json`, { signal: AbortSignal.timeout(4000) })).json();
    } catch {
      throw new Error("Local server is off. Start it in Settings, Local server.");
    }
  }
  const m = ocModel(providerId, modelId);
  if (m.providerID === "zeusdesigns") {
    const models = (cfg.provider ??= {}).zeusdesigns?.models;
    if (models && !models[m.modelID]) models[m.modelID] = { name: modelId, tool_call: true, reasoning: true, attachment: false, temperature: true, limit: { context: 128000, output: 16384 } };
  }
  cfg.permission = { edit: "allow", bash: "allow", webfetch: "allow" };
  return cfg;
}

let activeOcBase = BASE;

async function checkHealthAt(url: string): Promise<boolean> {
  try { return (await fetch(`${url}/global/health`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; }
}

export async function ensureOpenCode(root: string | undefined, providerId: string, modelId: string): Promise<string> {
  if (await checkHealthAt(BASE)) {
    activeOcBase = BASE;
    return BASE;
  }
  const cfg = await buildConfig(providerId, modelId);
  const r = await nativeOpenCode.start(root ?? "", OC_PORT, JSON.stringify(cfg)).catch(() => null);
  if (r !== null) {
    for (let i = 0; i < 4; i++) {
      await sleep(300);
      if (await checkHealthAt(BASE)) {
        activeOcBase = BASE;
        return BASE;
      }
    }
  }
  // Built-in Native Rust OpenCode Server fallback on `GATEWAY` (`127.0.0.1:11435`) — works with 0 external CLI installs!
  if (await checkHealthAt(GATEWAY)) {
    activeOcBase = GATEWAY;
    return GATEWAY;
  }
  const { nativeServer } = await import("./bridge");
  const st = await nativeServer.start();
  const gw = st?.baseUrl || GATEWAY;
  activeOcBase = gw;
  return gw;
}

interface Hooks {
  onText: (t: string) => void;
  onReasoning: (t: string) => void;
  onTool: (t: ToolCall) => void;
  signal: AbortSignal;
}

/** Sends one prompt to OpenCode and streams its output into the Zeus chat. Resolves when the session goes idle. */
export async function runOpenCode(opts: { convId: string; title: string; prompt: string; system?: string } & Hooks) {
  const st = useStore.getState();
  const { providerId, modelId } = st.settings;
  const root = st.ui.workspace?.root;
  const baseUrl = await ensureOpenCode(root, providerId, modelId);
  const c = await sdk(root, baseUrl);
  let sid = sessions.get(opts.convId);
  if (!sid) {
    const created = await c.session.create({ body: { title: opts.title } });
    sid = (created.data as { id: string } | undefined)?.id;
    if (!sid) throw new Error("OpenCode could not create a session.");
    sessions.set(opts.convId, sid);
  }
  const sessionId = sid;
  const roles = new Map<string, string>();
  const seen = new Map<string, string>();
  const events = await c.event.subscribe();
  const stop = () => { void c.session.abort({ path: { id: sessionId } }); };
  opts.signal.addEventListener("abort", stop);

  let finished: () => void = () => {};
  const done = new Promise<void>((r) => { finished = r; });
  let failure = "";

  const pump = (async () => {
    try {
      for await (const raw of events.stream as AsyncIterable<unknown>) {
        const ev = raw as { type: string; properties: any };
        const p = ev.properties ?? {};
        if (ev.type === "message.updated" && p.info?.sessionID === sessionId) roles.set(p.info.id, p.info.role);
        else if (ev.type === "message.part.updated" && p.part?.sessionID === sessionId) {
          const part = p.part;
          if (roles.get(part.messageID) !== "assistant") continue;
          if (part.type === "text" || part.type === "reasoning") {
            const prev = seen.get(part.id) ?? "";
            const full: string = part.text ?? "";
            const piece: string = p.delta ?? (full.startsWith(prev) ? full.slice(prev.length) : full);
            seen.set(part.id, full);
            if (piece) (part.type === "text" ? opts.onText : opts.onReasoning)(piece);
          } else if (part.type === "tool") {
            const s = part.state ?? {};
            const status = s.status === "completed" ? "ok" : s.status === "error" ? "error" : "running";
            opts.onTool({
              id: part.callID ?? part.id, name: part.tool, status,
              args: s.input ? JSON.stringify(s.input) : undefined,
              output: typeof s.output === "string" ? s.output.slice(0, 4000) : typeof s.error === "string" ? s.error : undefined,
            });
          }
        } else if (ev.type === "session.error" && (!p.sessionID || p.sessionID === sessionId)) {
          failure = p.error?.data?.message ?? p.error?.name ?? "OpenCode reported an error";
          finished();
        } else if (ev.type === "session.idle" && p.sessionID === sessionId) finished();
      }
    } catch { finished(); }
  })();

  try {
    const sent = c.session.prompt({
      path: { id: sessionId },
      body: { model: ocModel(providerId, modelId), system: opts.system, parts: [{ type: "text", text: opts.prompt }] },
    });
    await Promise.race([done, sent.then(() => sleep(400))]);
    if (failure) throw new Error(failure);
  } finally {
    opts.signal.removeEventListener("abort", stop);
    (events as unknown as { stream: { return?: () => Promise<unknown> } }).stream.return?.();
    void pump;
    const curWs = useStore.getState().ui.workspace;
    if (curWs) {
      import("./bridge")
        .then(({ refreshTree }) => refreshTree(curWs))
        .then((tree) => useStore.getState().patchUI({ workspace: { ...curWs, tree } }))
        .catch(() => {});
    }
  }
}

export const resetOpenCodeSessions = () => sessions.clear();
