import type { ZeusChunk, ZeusProvider, ZeusRequest } from './types.js';
import { flattenTranscript } from './types.js';
import { BROWSER_HEADERS, errorBody, safeJson, sseData, timeoutSignal } from './http.js';

const BASE = 'https://chat.motiftech.io';
const EFFORT = { low: 'small', medium: 'medium', high: 'high' } as const;

// conversation_id is tracked server-side; keep it per conversation so follow
// ups only need the newest user turn.
const conversations = new Map<string, string>();

export const motif: ZeusProvider = {
  id: 'motif',
  label: 'Motif',
  models: [
    { id: 'motif-102b', name: 'Motif 3 (102B)', reasoning: true },
    { id: 'motif-12-7b-reasoning', name: 'Motif 12.7B Reasoning', reasoning: true },
    { id: 'motif-12-7b', name: 'Motif 12.7B', reasoning: true },
    { id: 'motif-tiny', name: 'Motif Tiny' },
  ],
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    const key = req.conversationKey ? `${req.model}:${req.conversationKey}` : '';
    const known = key ? conversations.get(key) : undefined;
    const turns = req.messages.filter((m) => m.role !== 'system');
    const lastUser = [...turns].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      yield { type: 'error', error: 'motif: no user message to send' };
      return;
    }
    let query: string;
    if (known) {
      query = lastUser.content;
    } else {
      query = flattenTranscript(req.messages);
    }
    const payload = {
      query,
      conversation_id: known ?? null,
      project_id: null,
      template_id: null,
      forced_skill_names: [],
      disabled_skill_names: [],
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      mode: 'chat',
      reasoning_effort: EFFORT[req.effort ?? 'high'],
      model: req.model || 'motif-102b',
    };
    let convId = known;
    let sawText = false;
    try {
      const res = await fetch(`${BASE}/api/v1/enterprise/chat`, {
        method: 'POST',
        signal: timeoutSignal(300_000, req.signal),
        headers: {
          ...BROWSER_HEADERS,
          accept: 'text/event-stream, application/json',
          'content-type': 'application/json',
          origin: BASE,
          referer: `${BASE}/chat`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        yield { type: 'error', error: `Motif HTTP ${res.status}: ${await errorBody(res)}`, status: res.status };
        return;
      }
      for await (const raw of sseData(res)) {
        const ev = safeJson(raw);
        if (!ev) continue;
        const type = String(ev.type ?? '');
        const data = ev.data;
        if (type === 'chat.text' && typeof data === 'string' && data) {
          sawText = true;
          yield { type: 'text', content: data };
        } else if (type === 'shared.data.conversation_id' && typeof data === 'string' && data) {
          convId = data;
        } else if (type === 'shared.sign') {
          break;
        } else if (type.includes('error')) {
          yield { type: 'error', error: String(data ?? raw).slice(0, 300) };
          return;
        }
      }
      if (!sawText) {
        yield { type: 'error', error: 'motif: stream ended without content' };
        return;
      }
      if (key && convId) conversations.set(key, convId);
      yield { type: 'done' };
    } catch (err) {
      if (sawText) {
        if (key && convId) conversations.set(key, convId);
        yield { type: 'done' };
      } else {
        yield { type: 'error', error: `Motif request failed: ${(err as Error).message}` };
      }
    }
  },
};
