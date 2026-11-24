import type { ZeusChunk, ZeusProvider, ZeusRequest } from './types.js';
import { errorBody, fakeIp, timeoutSignal } from './http.js';

const CHAT_URL = 'https://chatjimmy.ai/api/chat';
const STATS_RE = /<\|stats\|>[\s\S]*?<\|\/stats\|>/gi;
const THINK_RE = /<\|think\|>[\s\S]*?<\|\/think\|>/gi;

export function cleanChatJimmy(text: string): string {
  return text.replace(STATS_RE, '').replace(THINK_RE, '').trim();
}

export const chatjimmy: ZeusProvider = {
  id: 'chatjimmy',
  label: 'ChatJimmy (Llama 3.1 8B)',
  models: [{ id: 'llama3.1-8B', name: 'Llama 3.1 8B (ChatJimmy)' }],
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    if (!req.messages.some((m) => m.role === 'user')) {
      yield { type: 'error', error: 'chatjimmy: no user content to send' };
      return;
    }
    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        signal: timeoutSignal(180_000, req.signal),
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Origin: 'https://chatjimmy.ai',
          Referer: 'https://chatjimmy.ai/',
          'X-Real-IP': fakeIp(),
        },
        body: JSON.stringify({
          messages: req.messages,
          chatOptions: { selectedModel: req.model || 'llama3.1-8B', topK: 8 },
        }),
      });
      if (!res.ok) {
        yield { type: 'error', error: `chatjimmy HTTP ${res.status}: ${await errorBody(res)}`, status: res.status };
        return;
      }
      // The upstream answers in one shot (stats trailer at the end), so stream
      // raw text but hold back anything that could be the start of a trailer.
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let raw = '';
      let sent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += dec.decode(value, { stream: true });
        const cut = raw.indexOf('<|');
        const safeEnd = cut >= 0 ? cut : raw.length;
        if (safeEnd > sent) {
          yield { type: 'text', content: raw.slice(sent, safeEnd) };
          sent = safeEnd;
        }
      }
      const finalText = cleanChatJimmy(raw);
      if (!finalText) {
        yield { type: 'error', error: 'chatjimmy: stream ended without content' };
        return;
      }
      if (sent === 0) yield { type: 'text', content: finalText };
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: `chatjimmy: cannot reach upstream (${(err as Error).message})` };
    }
  },
};
