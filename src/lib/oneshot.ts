// One-shot model call used for background jobs (memory edits, layout repair). Streams nothing to the UI.
import { uid, useStore } from "../store";
import type { Effort } from "../types";
import { isNative, nativeChat, type ChatRequest } from "./bridge";

export function activeCustom() {
  const { settings } = useStore.getState();
  return settings.providerId.startsWith("custom:") ? settings.customProviders.find((c) => `custom:${c.id}` === settings.providerId) : undefined;
}

const BROWSER_KEYLESS: Record<string, { baseUrl: string; apiKey: string; format: "openai" | "anthropic" }> = {
  kilo: { baseUrl: "https://api.kilo.ai/api/gateway", apiKey: "", format: "openai" },
  blockrun: { baseUrl: "https://blockrun.ai/api/v1", apiKey: "", format: "openai" },
  ovhcloud: { baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", apiKey: "", format: "openai" },
  freecc: { baseUrl: "https://calkotter-free-claude-code.hf.space", apiKey: "free", format: "anthropic" },
  vlmrun: { baseUrl: "https://gateway.vlm.run/v1/openai", apiKey: "", format: "openai" },
  together2api: { baseUrl: "https://lolmaobruhhh-test.hf.space/v1", apiKey: "", format: "openai" },
  aihorde: { baseUrl: "https://oai.aihorde.net/v1", apiKey: "0000000000", format: "openai" },
  apisfreellm: { baseUrl: "https://api.apisfreellm.com/v1", apiKey: "free", format: "openai" },
  llm7: { baseUrl: "https://api.llm7.io/v1", apiKey: "unused", format: "openai" },
  pollinations: { baseUrl: "https://text.pollinations.ai/openai", apiKey: "", format: "openai" },
};

export function canCallModel(): boolean {
  const s = useStore.getState();
  return !!activeCustom() || (isNative && s.ui.nativeReady) || Boolean(BROWSER_KEYLESS[s.settings.providerId]);
}

export async function oneShot(system: string, user: string, opts: { effort?: Effort; timeoutMs?: number } = {}): Promise<string> {
  const { settings, ui } = useStore.getState();
  const browserFallback = BROWSER_KEYLESS[settings.providerId];
  const custom = activeCustom() ?? (browserFallback ? { id: settings.providerId, name: settings.providerId, model: settings.modelId, ...browserFallback } : undefined);
  const req: ChatRequest = {
    requestId: uid(), provider: custom ? "custom" : settings.providerId, model: custom ? custom.model : settings.modelId,
    effort: opts.effort ?? "low", system, messages: [{ role: "user", content: user }],
    custom: custom ? { baseUrl: custom.baseUrl, apiKey: custom.apiKey, format: custom.format } : undefined,
  };
  const limit = opts.timeoutMs ?? 120000;
  if (isNative && ui.nativeReady) {
    return new Promise<string>((resolve, reject) => {
      let out = "";
      let cancel: (() => void) | null = null;
      let settled = false;
      const end = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); setTimeout(() => cancel?.(), 0); fn(); };
      const timer = setTimeout(() => end(() => reject(new Error("The model took too long to answer"))), limit);
      nativeChat(req, (e) => {
        if (e.type === "delta") out += e.text;
        else if (e.type === "done") end(() => resolve(out));
        else if (e.type === "error") end(() => reject(new Error(e.message)));
      }).then((c) => { cancel = c; if (settled) c(); }).catch((err) => end(() => reject(err)));
    });
  }
  if (custom) {
    const base = custom.baseUrl.replace(/\/+$/, "");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), limit);
    try {
      if (custom.format === "anthropic") {
        const r = await fetch(`${base}/v1/messages`, {
          method: "POST", signal: ctl.signal,
          headers: { "content-type": "application/json", "x-api-key": custom.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: custom.model, max_tokens: 16000, system, messages: [{ role: "user", content: user }] }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? r.statusText);
        return (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
      }
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${custom.apiKey}` },
        body: JSON.stringify({ model: custom.model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? r.statusText);
      return j.choices?.[0]?.message?.content ?? "";
    } finally { clearTimeout(timer); }
  }
  throw new Error("Connect a model to use this");
}
