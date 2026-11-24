import { randomInt } from 'node:crypto';

export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

export const BROWSER_HEADERS: Record<string, string> = {
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': CHROME_UA,
  'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

export function fakeIp(): string {
  return `24.${randomInt(0, 10)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;
}

export function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return outer ? AbortSignal.any([t, outer]) : t;
}

// Iterate server-sent `data:` payloads (string after the prefix) from a fetch
// Response. Tolerates ragged teardown: a stream error after at least one
// payload ends iteration quietly.
export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let seen = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        seen = true;
        yield raw;
      }
    }
    const tail = buf.replace(/\r$/, '');
    if (tail.startsWith('data:') && tail.slice(5).trim()) yield tail.slice(5).trim();
  } catch (err) {
    if (!seen) throw err;
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

export function safeJson(raw: string): any {
  try { return JSON.parse(raw); } catch { return undefined; }
}

export async function errorBody(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ''; }
}
