import { randomBytes, randomInt } from 'node:crypto';
import type { ZeusChunk, ZeusProvider, ZeusRequest } from './types.js';
import { flattenTranscript } from './types.js';
import { errorBody, timeoutSignal } from './http.js';

const BASE = 'https://gemini.google.com';
const STREAM = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;

interface Identity {
  cookie: string;
  fsid: string;
  bl: string;
  at: string;
  reqid: number;
  born: number;
}

let identity: Identity | null = null;

async function warm(signal?: AbortSignal): Promise<Identity | null> {
  const res = await fetch(`${BASE}/app`, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    signal: timeoutSignal(60_000, signal),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const fsid = /"FdrFJe":"([0-9-]+)"/.exec(html)?.[1] ?? '';
  const bl =
    /"cfb2h":"([^"]+)"/.exec(html)?.[1] ??
    /(boq_(?:gemini-web-uiserver|assistant-bard-web-server)_[0-9._p]+)/.exec(html)?.[1] ??
    'boq_gemini-web-uiserver_20261117.01_p0';
  const at = /"SNlM0e":"([^"]+)"/.exec(html)?.[1] ?? '';
  if (!fsid) return null;
  return { cookie, fsid, bl, at, reqid: randomInt(100_000, 1_000_000), born: Date.now() };
}

// Answer text lives in nested `rc_*` arrays of `wrb.fr` envelopes.
function parseLine(line: string): string[] {
  let arr: unknown;
  try { arr = JSON.parse(line); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const entry of arr) {
    if (!Array.isArray(entry) || entry[0] !== 'wrb.fr' || typeof entry[2] !== 'string') continue;
    let inner: unknown;
    try { inner = JSON.parse(entry[2]); } catch { continue; }
    if (!Array.isArray(inner) || inner.length < 5 || !Array.isArray(inner[4])) continue;
    for (const part of inner[4] as unknown[]) {
      if (Array.isArray(part) && typeof part[0] === 'string' && part[0].startsWith('rc_') && Array.isArray(part[1])) {
        let best = '';
        for (const t of part[1] as unknown[]) if (typeof t === 'string' && t.length > best.length) best = t;
        if (best.trim()) out.push(best);
      }
    }
  }
  return out;
}

export const geminiweb: ZeusProvider = {
  id: 'geminiweb',
  label: 'Gemini Web (Flash Lite)',
  models: [{ id: 'geminiweb/gemini-flash-lite', name: 'Gemini Flash Lite (Web)' }],
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    const prompt = flattenTranscript(req.messages);
    if (!prompt.trim()) {
      yield { type: 'error', error: 'GeminiWeb: no user content to send' };
      return;
    }
    let lastError = 'unknown error';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let sawAny = false;
      try {
        if (!identity || attempt > 0 || Date.now() - identity.born > 20 * 60_000) {
          identity = await warm(req.signal);
          if (!identity) { lastError = 'warm-up failed'; continue; }
        }
        identity.reqid += 100_000;
        const inner = JSON.stringify([
          [prompt, 0, null, null, null, null, 0],
          ['en-US'],
          ['', '', '', null, null, null, null, null, null, ''],
          '',
          randomBytes(16).toString('hex'),
          null,
          [0],
          1,
          null,
          null,
          1,
          0,
        ]);
        let url = `${BASE}${STREAM}?bl=${identity.bl}&f.sid=${identity.fsid}&hl=en-US&_reqid=${identity.reqid}&rt=c`;
        if (identity.at) url += `&at=${encodeURIComponent(identity.at)}`;
        const res = await fetch(url, {
          method: 'POST',
          signal: timeoutSignal(300_000, req.signal),
          headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            origin: BASE,
            referer: `${BASE}/`,
            'user-agent': UA,
            'x-same-domain': '1',
            ...(identity.cookie ? { cookie: identity.cookie } : {}),
          },
          body: `f.req=${encodeURIComponent(JSON.stringify([null, inner]))}&`,
        });
        if (!res.ok) {
          lastError = res.status === 400 ? 'rejected the request (400)' : `HTTP ${res.status}: ${await errorBody(res)}`;
          if (res.status === 429 || res.status >= 500) await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
          continue;
        }
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let prev = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, '');
            buf = buf.slice(nl + 1);
            if (!line.startsWith('[')) continue;
            for (const snap of parseLine(line)) {
              let delta = '';
              if (snap.startsWith(prev)) delta = snap.slice(prev.length);
              else if (!prev) delta = snap;
              if (snap.length > prev.length) prev = snap;
              if (delta) { sawAny = true; yield { type: 'text', content: delta }; }
            }
          }
        }
        if (sawAny) { yield { type: 'done' }; return; }
        lastError = 'stream ended without content';
      } catch (err) {
        if (sawAny) { yield { type: 'done' }; return; }
        lastError = `stream failed: ${(err as Error).message}`;
      }
    }
    yield { type: 'error', error: `GeminiWeb ${lastError}` };
  },
};
