import { randomBytes } from 'node:crypto';
import type { ZeusChunk, ZeusProvider, ZeusRequest } from './types.js';
import { errorBody, fakeIp, safeJson, sseData, timeoutSignal } from './http.js';

const BASE = 'https://chat.inceptionlabs.ai';
const hex = (n: number) => randomBytes(n).toString('hex');

let cached: { token: string; exp: number } | null = null;

async function ensureToken(force: boolean, signal?: AbortSignal): Promise<string> {
  if (!force && cached && cached.exp > Date.now() + 60_000) return cached.token;
  const ip = fakeIp();
  const res = await fetch(`${BASE}/api/session`, {
    signal: timeoutSignal(12_000, signal),
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: BASE,
      Referer: `${BASE}/`,
      'Sec-CH-UA': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'X-Forwarded-For': ip,
      'X-Real-IP': ip,
    },
  });
  if (!res.ok) throw new Error(`session HTTP ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('session returned empty token');
  cached = { token: data.token, exp: Date.now() + 3_600_000 };
  return data.token;
}

export const mercury3: ZeusProvider = {
  id: 'mercury3',
  label: 'Mercury 3 (Inception)',
  models: [{ id: 'mercury-3', name: 'Mercury 3', reasoning: true }],
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    let lastError = 'Mercury 3: stream ended without text';
    for (let attempt = 0; attempt < 2; attempt++) {
      let token: string;
      try {
        token = await ensureToken(attempt > 0, req.signal);
      } catch (err) {
        lastError = `Mercury 3 session failed: ${(err as Error).message}`;
        continue;
      }
      const messages = req.messages.map((m) => ({
        id: hex(16),
        role: m.role,
        parts: [{ type: 'text', text: m.content }],
      }));
      const payload = {
        reasoningEffort: req.effort ?? 'high',
        webSearchEnabled: false,
        voiceMode: false,
        timezone: 'UTC',
        id: hex(16),
        messages,
        trigger: 'submit-message',
      };
      let sawAny = false;
      try {
        const res = await fetch(`${BASE}/api/chat`, {
          method: 'POST',
          signal: timeoutSignal(180_000, req.signal),
          headers: {
            'Content-Type': 'application/json',
            Accept: '*/*',
            Origin: BASE,
            Referer: `${BASE}/`,
            'x-session-token': token,
            Cookie: `session=${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.status === 403 && attempt === 0) {
          cached = null;
          continue;
        }
        if (!res.ok) {
          yield { type: 'error', error: `Mercury 3 HTTP ${res.status}: ${await errorBody(res)}`, status: res.status };
          return;
        }
        for await (const raw of sseData(res)) {
          if (raw === '[DONE]') break;
          const ev = safeJson(raw);
          if (!ev) continue;
          const type = String(ev.type ?? '');
          if (type === 'reasoning-delta' || type === 'reasoning') {
            const d = ev.delta ?? ev.text;
            if (typeof d === 'string' && d) { sawAny = true; yield { type: 'thought', content: d }; }
          } else if (type === 'text-delta') {
            if (typeof ev.delta === 'string' && ev.delta) { sawAny = true; yield { type: 'text', content: ev.delta }; }
          }
        }
        if (sawAny) { yield { type: 'done' }; return; }
      } catch (err) {
        if (sawAny) { yield { type: 'done' }; return; }
        lastError = `Mercury 3 request failed: ${(err as Error).message}`;
      }
    }
    yield { type: 'error', error: lastError };
  },
};
