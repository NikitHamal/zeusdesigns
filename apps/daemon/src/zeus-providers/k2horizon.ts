import type { ZeusChunk, ZeusProvider, ZeusRequest } from './types.js';
import { BROWSER_HEADERS, errorBody, safeJson, sseData, timeoutSignal } from './http.js';

const BASE = 'https://chat.ifm.ai';
const DEFAULT_MODEL = 'IFM/K2-Horizon-375B-A23B';
const DEPRECATED_MODEL = 'MBZUAI-IFM/K2-Think-v2';

function stripMarkup(s: string): string {
  return s
    .replace(/<details\b[^>]*>/g, '')
    .replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/g, '')
    .replace(/<\/details>/g, '')
    .split('\n')
    .map((l) => (l.startsWith('> ') ? l.slice(2) : l))
    .join('\n')
    .trim();
}

// Content arrives cumulatively: `<details type="reasoning">…</details>answer`.
export function splitReasoning(content: string): { reasoning: string; answer: string } {
  const idx = content.lastIndexOf('</details>');
  if (idx === -1) return { reasoning: stripMarkup(content), answer: '' };
  return {
    reasoning: stripMarkup(content.slice(0, idx)),
    answer: content.slice(idx + '</details>'.length).replace(/^\n+/, ''),
  };
}

const THINKING_KEYS = ['think', 'reasoning', 'reasoning_content', 'think_fast', 'think_faster'];

export const k2horizon: ZeusProvider = {
  id: 'k2horizon',
  label: 'K2 Horizon 375B',
  models: [{ id: DEFAULT_MODEL, name: 'K2 Horizon 375B', reasoning: true }],
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    const model = req.model === DEPRECATED_MODEL || !req.model ? DEFAULT_MODEL : req.model;
    // Backend rejects assistant turns lacking a thinking field.
    const messages = req.messages.map((m) => {
      const base: Record<string, unknown> = { ...m };
      if (m.role === 'assistant' && !THINKING_KEYS.some((k) => k in base)) base.reasoning = '';
      return base;
    });
    const payload = {
      stream: true,
      model,
      messages,
      params: { reasoning_effort: req.effort ?? 'medium' },
      features: { web_search: false },
    };
    let prevReasoning = '';
    let prevAnswer = '';
    let sawAny = false;
    try {
      const res = await fetch(`${BASE}/api/guest/chat/completions`, {
        method: 'POST',
        signal: timeoutSignal(300_000, req.signal),
        headers: {
          ...BROWSER_HEADERS,
          accept: 'text/event-stream, application/json',
          'content-type': 'application/json',
          origin: BASE,
          referer: `${BASE}/guest`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        yield { type: 'error', error: `K2 Horizon error: ${await errorBody(res)}`, status: res.status };
        return;
      }
      outer: for await (const raw of sseData(res)) {
        const ev = safeJson(raw);
        if (!ev || 'task_id' in ev) continue;
        if (typeof ev.detail === 'string' && !('content' in ev)) {
          yield { type: 'error', error: `K2 Horizon: ${ev.detail.slice(0, 300)}` };
          return;
        }
        const isDone = ev.done === true;
        if (!isDone && 'choices' in ev) continue;
        if ('content' in ev) {
          sawAny = true;
          const { reasoning, answer } = splitReasoning(String(ev.content ?? ''));
          if (!isDone && reasoning.startsWith(prevReasoning)) {
            const d = reasoning.slice(prevReasoning.length);
            if (d.trim()) yield { type: 'thought', content: d };
          }
          prevReasoning = reasoning;
          const d = answer.startsWith(prevAnswer) ? answer.slice(prevAnswer.length) : answer;
          prevAnswer = answer;
          if (d.trim()) yield { type: 'text', content: d };
        }
        if (isDone) break outer;
      }
      if (!sawAny) {
        yield { type: 'error', error: 'K2 Horizon: stream ended without content' };
        return;
      }
      yield { type: 'done' };
    } catch (err) {
      if (sawAny) yield { type: 'done' };
      else yield { type: 'error', error: `stream failed: ${(err as Error).message}` };
    }
  },
};

