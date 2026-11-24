import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { ZeusChunk, ZeusModel, ZeusProvider, ZeusRequest } from './types.js';
import { timeoutSignal } from './http.js';

const API = 'https://api.deepai.org';
const SITE = 'https://deepai.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const SALT = 'hackers_become_a_little_stinkier_every_time_they_hack';

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 64);

// Anonymous "tryit" key: tryit-{n}-{sha(ua + sha(ua + sha(ua + n + salt)))}.
export function generateTryitKey(): string {
  const n = String(Math.floor(Math.random() * 100_000_000_000) + randomInt(0, 2));
  return `tryit-${n}-${sha(UA + sha(UA + sha(UA + n + SALT)))}`;
}

const THINKING = new Set(['glm-5.3-flash']);

const MODELS: ZeusModel[] = [
  { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  { id: 'gemma-4', name: 'Gemma 4' },
  { id: 'glm-5.3-flash', name: 'GLM 5.3 Flash', reasoning: true },
  { id: 'tencent-hy3', name: 'Tencent Hy3' },
  { id: 'llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
  { id: 'standard', name: 'DeepAI Standard' },
];

async function pollThinking(taskId: string, key: string, signal?: AbortSignal): Promise<string> {
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`${API}/check_chat_task_status?type=thinking-task&task_id=${encodeURIComponent(taskId)}`, {
      headers: { 'api-key': key, 'User-Agent': UA },
      signal: timeoutSignal(30_000, signal),
    });
    if (!res.ok) throw new Error(`thinking poll HTTP ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { status?: string; result?: string; text?: string; error?: string };
    if (['complete', 'completed', 'done'].includes(data.status ?? '')) return String(data.result ?? data.text ?? '');
    if (['failed', 'error'].includes(data.status ?? '')) throw new Error(data.error ?? 'thinking task failed');
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('thinking task timed out');
}

export const deepai: ZeusProvider = {
  id: 'deepai',
  label: 'DeepAI',
  models: MODELS,
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    const model = MODELS.some((m) => m.id === req.model) ? req.model : 'standard';
    const history: { role: string; content: string }[] = [];
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    if (system) history.push({ role: 'user', content: `[System Instructions]\n${system}` });
    for (const m of req.messages) if (m.role !== 'system') history.push({ role: m.role, content: m.content });
    if (!history.some((m) => m.role === 'user')) {
      yield { type: 'error', error: 'deepai: no user content to send' };
      return;
    }
    const key = generateTryitKey();
    const form = new FormData();
    form.set('chatHistory', JSON.stringify(history));
    form.set('model', model);
    form.set('session_uuid', randomUUID());
    form.set('chat_style', 'chat');
    form.set('sensitivity_request_id', randomUUID());
    form.set('hacker_is_stinky', 'very_stinky');
    if (THINKING.has(model)) form.set('thinking_support', '1');
    try {
      const res = await fetch(`${API}/hacking_is_a_serious_crime`, {
        method: 'POST',
        body: form,
        signal: timeoutSignal(180_000, req.signal),
        headers: { 'api-key': key, 'User-Agent': UA, Origin: SITE, Referer: `${SITE}/chat/` },
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        yield { type: 'error', error: `DeepAI HTTP ${res.status}: ${body}`, status: res.status };
        return;
      }
      if (THINKING.has(model) && (res.headers.get('content-type') ?? '').includes('application/json')) {
        const data = (await res.json()) as { task_id?: string };
        if (!data.task_id) {
          yield { type: 'error', error: 'deepai: thinking model returned no task_id' };
          return;
        }
        const text = await pollThinking(data.task_id, key, req.signal);
        yield { type: 'text', content: text };
        yield { type: 'done' };
        return;
      }
      // Plain text stream; a 0x1c byte starts a JSON metadata trailer.
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let sawText = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = dec.decode(value, { stream: true });
        const sep = chunk.indexOf('\x1c');
        if (sep !== -1) {
          chunk = chunk.slice(0, sep);
          if (chunk) { sawText = true; yield { type: 'text', content: chunk }; }
          await reader.cancel().catch(() => undefined);
          break;
        }
        if (chunk) { sawText = true; yield { type: 'text', content: chunk }; }
      }
      if (!sawText) {
        yield { type: 'error', error: 'deepai: stream ended without content' };
        return;
      }
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: `DeepAI request failed: ${(err as Error).message}` };
    }
  },
};
