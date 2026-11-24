import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZeusChunk, ZeusProvider, ZeusRequest } from './types.js';
import { safeJson, sseData, timeoutSignal } from './http.js';

const BASE = 'https://longcat.chat';
const ENDPOINT = `${BASE}/api/v1/chat-completion-oversea-V2`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const DEFAULT_MODEL = 'longcat/LongCat-2.5';
const MAX_RETRIES = 3;

type Signer = { sign(url: string, method: string, body: string): Promise<{ url: string; headers: Record<string, string> }> };
let signer: Signer | null | undefined;

// H5guard SDK runs in-process inside a vm context (apps/daemon/assets/zeus).
function loadSigner(): Signer | null {
  if (signer !== undefined) return signer;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const req = createRequire(import.meta.url);
    signer = req(path.resolve(here, '../../assets/zeus/h5guard-signer.cjs')) as Signer;
  } catch {
    signer = null;
  }
  return signer;
}

const msgId = () => randomInt(10_000_000, 100_000_000);

function buildMessages(history: { role: string; content: string }[], content: string) {
  const out: unknown[] = [];
  for (const m of history.slice(-20)) {
    if (!m.content) continue;
    if (m.role === 'user') {
      out.push({ role: 'user', events: [{ type: 'userMsg', content: m.content.slice(0, 8000), status: 'FINISHED' }], chatStatus: 'FINISHED', messageId: msgId(), idType: 'custom' });
    } else if (m.role === 'assistant') {
      out.push({ role: 'assistant', events: [{ type: 'content', content: m.content.slice(0, 8000), status: 'FINISHED' }], chatStatus: 'FINISHED', messageId: msgId(), idType: 'custom' });
    }
  }
  out.push({ role: 'user', events: [{ type: 'userMsg', content: content.slice(0, 8000), status: 'FINISHED' }], chatStatus: 'FINISHED', messageId: msgId(), idType: 'custom' });
  out.push({ role: 'assistant', events: [], chatStatus: 'LOADING', messageId: msgId(), idType: 'custom' });
  return out;
}

async function warmCookies(signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(`${BASE}/t`, { headers: { 'user-agent': UA }, signal: timeoutSignal(30_000, signal) });
    await res.arrayBuffer().catch(() => undefined);
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  } catch {
    return '';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const longcat: ZeusProvider = {
  id: 'longcat',
  label: 'LongCat 2.5',
  models: [{ id: DEFAULT_MODEL, name: 'LongCat 2.5', reasoning: true }],
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    const history = req.messages.filter((m) => m.role !== 'system');
    const system = req.messages.find((m) => m.role === 'system')?.content.slice(0, 4000) ?? '';
    let content = history[history.length - 1]?.content ?? '';
    if (system) content = `${system}\n\n${content}`.slice(0, 12000);
    if (!content) {
      yield { type: 'error', error: 'LongCat: no user content to send' };
      return;
    }
    const body = JSON.stringify({
      content: content.slice(0, 8000),
      agentId: '1',
      messages: buildMessages(history.slice(0, -1), content),
      reasonEnabled: req.effort === 'high' ? 1 : 0,
      searchEnabled: 0,
      regenerate: 0,
    });

    let lastError = 'unknown error';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let sawAny = false;
      try {
        let url = ENDPOINT;
        const headers: Record<string, string> = {
          accept: 'text/event-stream,application/json',
          'accept-language': 'en-US',
          'content-type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          'X-Client-Language': 'en',
          'm-appkey': 'fe_com.sankuai.friday.fe.longcat',
          origin: BASE,
          referer: `${BASE}/t`,
          'user-agent': UA,
        };
        const s = loadSigner();
        if (s) {
          try {
            const signed = await s.sign(ENDPOINT, 'POST', body);
            url = signed.url;
            Object.assign(headers, signed.headers);
            headers['content-type'] = 'application/json';
          } catch { /* fall through unsigned */ }
        }
        const cookie = await warmCookies(req.signal);
        if (cookie) headers.cookie = cookie;
        const res = await fetch(url, { method: 'POST', headers, body, signal: timeoutSignal(300_000, req.signal) });
        let upstreamError = '';
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          if (res.status === 429) { await sleep(2 ** attempt * 1000 + Math.random() * 1000); continue; }
          if (res.status >= 500) { await sleep(1000 + Math.random() * 1000); continue; }
          break;
        }
        if ((res.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
          const payload = safeJson(await res.text()) ?? {};
          lastError = String(payload.message || `unexpected JSON response (code ${payload.code})`);
          if (payload.code === 429) { await sleep(2 ** attempt * 1000 + Math.random() * 1000); continue; }
          break;
        }
        for await (const raw of sseData(res)) {
          const ev = safeJson(raw);
          if (!ev) continue;
          const event = ev.event ?? {};
          const type = event.type;
          if (type == null && ev.code != null && ev.code !== 0) {
            yield { type: 'error', error: `LongCat: ${ev.message || `error ${ev.code}`}` };
            return;
          }
          if (type === 'content') {
            if (event.content) { sawAny = true; yield { type: 'text', content: String(event.content) }; }
          } else if (type === 'reason' || type === 'think') {
            if (event.content) { sawAny = true; yield { type: 'thought', content: String(event.content) }; }
          } else if (type === 'eventError') {
            upstreamError = String(event.message || 'upstream error');
            break;
          }
        }
        if (sawAny) { yield { type: 'done' }; return; }
        lastError = upstreamError || 'stream ended without content';
        if (upstreamError) await sleep(1000 + Math.random() * 1000);
      } catch (err) {
        if (sawAny) { yield { type: 'done' }; return; }
        lastError = `request failed: ${(err as Error).message}`;
        await sleep(1000 + Math.random() * 1000);
      }
    }
    yield { type: 'error', error: `LongCat: ${lastError}` };
  },
};
