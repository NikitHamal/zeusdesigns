import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ZeusChunk, ZeusModel, ZeusProvider, ZeusRequest } from './types.js';
import { timeoutSignal } from './http.js';

// Qwen through the Android app gateway of chat.qwen.ai. The web door is
// captcha-gated; the app door only needs an account, which is provisioned over
// plain HTTPS from a throw-away mailbox and kept in a small JSON pool.

const BASE = 'https://chat.qwen.ai/api/v2';
const MAIL = 'https://api.0mail.tech/v1';
const UA =
  'Dalvik/2.1.0 (Linux; U; Android 15; 25028RN03A Build/AP3A.240905.015.A2) AliApp(QWENCHAT/2.5.1) AppType/Release AplusBridgeLite,Dalvik/2.1.0 (Linux; U; Android 15; 25028RN03A Build/AP3A.240905.015.A2)';
const APP_WAF = process.env.QWEN_APP_WAF || 'Z9Tr56YmQpXcO2K_d_3nAbJvRqMLFW8HTNjvRguWHEowM1xY';
const TARGET = 3;
const MAX_POOL = 8;
const BAD_MAIL = new Set(['cfdevelopment.online']);
const DEFAULT_MODEL = 'qwen3.8-max';

interface Account {
  email: string;
  password: string;
  device: string;
  token: string;
  created: number;
  cool_until: number;
  used: number;
}

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Date.now() / 1000;

function gwHeaders(token?: string, device = '', extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Connection: 'Keep-Alive',
    Accept: 'application/json',
    'X-Platform': 'android',
    source: 'app',
    'Accept-Language': 'en-US',
    'Cache-Control': 'no-store',
    app_waf: APP_WAF,
    'x-request-id': randomUUID(),
    'x-device-id': device || `ai${md5(randomBytes(16))}`,
    ...extra,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// ---- pool persistence (.zeusdesigns/qwen_pool.json under the data dir) ----
function poolFile(): string {
  const explicit = process.env.QWEN_POOL_FILE;
  if (explicit) return explicit;
  const dir = process.env.OD_DATA_DIR || path.join(os.homedir(), '.zeus-codes');
  return path.join(dir, 'qwen_pool.json');
}

let pool: Account[] | null = null;

function load(): Account[] {
  if (pool) return pool;
  try {
    const data = JSON.parse(fs.readFileSync(poolFile(), 'utf8'));
    pool = Array.isArray(data) ? (data as Account[]) : [];
  } catch {
    pool = [];
  }
  return pool;
}

function save(): void {
  try {
    const file = poolFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(load()), 'utf8');
    fs.renameSync(tmp, file);
  } catch { /* pool is a cache; failure to persist is non-fatal */ }
}

function jwtExp(token: string): number {
  try {
    const body = token.split('.')[1] ?? '';
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')).exp ?? 0;
  } catch {
    return 0;
  }
}

function usable(a: Account, exclude: string[] = []): boolean {
  return !!a.token && !exclude.includes(a.email) && (a.cool_until ?? 0) <= nowSec() && jwtExp(a.token) > nowSec() + 86400;
}

function cool(email: string, seconds: number): void {
  const a = load().find((x) => x.email === email);
  if (a) { a.cool_until = nowSec() + seconds; save(); }
}

async function signin(email: string, password: string, device: string): Promise<string> {
  const r = await fetch(`${BASE}/auths/signin`, {
    method: 'POST',
    headers: gwHeaders(undefined, device, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password: sha256(password) }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json()) as { success?: boolean; data?: { token?: string } };
  if (!j.success || !j.data?.token) throw new Error(`Qwen sign in refused: ${JSON.stringify(j.data).slice(0, 160)}`);
  return j.data.token;
}

interface Mailbox {
  address: string;
  bodies(): Promise<string[]>;
  close(): void;
}

async function openZeroMail(): Promise<Mailbox> {
  const mh = { 'X-Session-Id': randomUUID() };
  const domains = (await (await fetch(`${MAIL}/domains`, { headers: mh, signal: AbortSignal.timeout(15_000) })).json()) as { domain: string; available?: boolean; premium?: boolean }[];
  const ok = (Array.isArray(domains) ? domains : []).filter((d) => d.available && !d.premium && !BAD_MAIL.has(d.domain)).map((d) => d.domain);
  if (!ok.length) throw new Error('temporary mail has no open domain');
  const res = await fetch(`${MAIL}/inboxes`, {
    method: 'POST',
    headers: { ...mh, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: ok[randomInt(0, ok.length)] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`mailbox creation failed (${res.status})`);
  const inbox = (await res.json()) as { id: string; address: string };
  return {
    address: inbox.address,
    async bodies() {
      const msgs = (await (await fetch(`${MAIL}/inboxes/${inbox.id}/messages`, { headers: mh, signal: AbortSignal.timeout(15_000) })).json()) as { body?: string }[];
      return (Array.isArray(msgs) ? msgs : []).map((m) => m.body ?? '');
    },
    close() { fetch(`${MAIL}/inboxes/${inbox.id}`, { method: 'DELETE', headers: mh }).catch(() => undefined); },
  };
}

// Fallback disposable mailbox (mail.tm) for when 0mail is unreachable.
const MAILTM = 'https://api.mail.tm';
async function openMailTm(): Promise<Mailbox> {
  const dj = (await (await fetch(`${MAILTM}/domains`, { signal: AbortSignal.timeout(15_000) })).json()) as { 'hydra:member'?: { domain: string; isActive?: boolean }[] };
  const domains = (dj['hydra:member'] ?? []).filter((d) => d.isActive !== false && !BAD_MAIL.has(d.domain)).map((d) => d.domain);
  if (!domains.length) throw new Error('mail.tm has no open domain');
  const local = `zeus${randomBytes(6).toString('hex')}`;
  const address = `${local}@${domains[randomInt(0, domains.length)]}`;
  const password = randomBytes(12).toString('hex');
  const json = { 'Content-Type': 'application/json' };
  const ar = await fetch(`${MAILTM}/accounts`, { method: 'POST', headers: json, body: JSON.stringify({ address, password }), signal: AbortSignal.timeout(15_000) });
  if (!ar.ok) throw new Error(`mail.tm account creation failed (${ar.status})`);
  const acct = (await ar.json()) as { id: string };
  const tr = await fetch(`${MAILTM}/token`, { method: 'POST', headers: json, body: JSON.stringify({ address, password }), signal: AbortSignal.timeout(15_000) });
  const token = ((await tr.json()) as { token?: string }).token;
  if (!token) throw new Error('mail.tm token refused');
  const auth = { Authorization: `Bearer ${token}` };
  return {
    address,
    async bodies() {
      const list = (await (await fetch(`${MAILTM}/messages`, { headers: auth, signal: AbortSignal.timeout(15_000) })).json()) as { 'hydra:member'?: { id: string }[] };
      const out: string[] = [];
      for (const m of list['hydra:member'] ?? []) {
        const full = (await (await fetch(`${MAILTM}/messages/${m.id}`, { headers: auth, signal: AbortSignal.timeout(15_000) })).json()) as { text?: string; html?: string[] | string };
        out.push(`${full.text ?? ''}\n${Array.isArray(full.html) ? full.html.join('\n') : full.html ?? ''}`);
      }
      return out;
    },
    close() { fetch(`${MAILTM}/accounts/${acct.id}`, { method: 'DELETE', headers: auth }).catch(() => undefined); },
  };
}

async function openMailbox(): Promise<Mailbox> {
  try { return await openZeroMail(); } catch (e1) {
    try { return await openMailTm(); } catch (e2) {
      throw new Error(`no temporary mailbox available (${(e1 as Error).message}; ${(e2 as Error).message})`);
    }
  }
}

async function provision(): Promise<Account> {
  const device = `ai${md5(randomBytes(16))}`;
  const box = await openMailbox();
  const email = box.address;
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const password = `Aa1!${Array.from({ length: 14 }, () => alphabet[randomInt(0, alphabet.length)]).join('')}`;
  try {
    const su = await fetch(`${BASE}/auths/signup`, {
      method: 'POST',
      headers: gwHeaders(undefined, device, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password: sha256(password), name: `Zeus ${email.slice(0, 5)}` }),
      signal: AbortSignal.timeout(30_000),
    });
    const sj = (await su.json().catch(() => ({}))) as { success?: boolean; data?: unknown };
    if (!sj.success) throw new Error(`Qwen signup refused: ${JSON.stringify(sj.data ?? '').slice(0, 160)}`);
    let link: string | null = null;
    for (let i = 0; i < 40 && !link; i++) {
      await sleep(1500);
      try {
        for (const body of await box.bodies()) {
          const hit = /https?:\/\/[^"'<>\s\])]*auths\/activate[^"'<>\s\])]*/.exec(body);
          if (hit) { link = hit[0].replace(/&amp;/g, '&'); break; }
        }
      } catch { /* keep polling */ }
    }
    if (!link) throw new Error('Qwen activation mail never arrived');
    { const ar = await fetch(link, { headers: gwHeaders(undefined, device), redirect: 'manual', signal: AbortSignal.timeout(30_000) }).catch(() => undefined); if (process.env.ZEUS_DEBUG) console.error('activate', link, ar?.status, ar?.headers.get('location')); }
    const token = await signin(email, password, device);
    return { email, password, device, token, created: nowSec(), cool_until: 0, used: 0 };
  } finally {
    box.close();
  }
}

let making: Promise<Account> | null = null;
function addAccount(): Promise<Account> {
  if (!making) {
    making = provision()
      .then((acct) => {
        const items = load();
        items.push(acct);
        items.sort((a, b) => a.created - b.created);
        if (items.length > MAX_POOL) items.splice(0, items.length - MAX_POOL);
        save();
        return acct;
      })
      .finally(() => { making = null; });
  }
  return making;
}

let topping = false;
function topUp(): void {
  if (topping) return;
  topping = true;
  void (async () => {
    try {
      while (load().filter((a) => usable(a)).length < TARGET) await addAccount();
    } catch { /* stop quietly; next acquire retries */ } finally { topping = false; }
  })();
}

async function acquire(exclude: string[] = []): Promise<Account> {
  const deadline = Date.now() + 75_000;
  for (;;) {
    const ok = load().filter((a) => usable(a, exclude)).sort((a, b) => (a.used ?? 0) - (b.used ?? 0));
    const pick = ok[0];
    if (pick) {
      pick.used = nowSec();
      save();
      if (load().filter((a) => usable(a)).length < TARGET) topUp();
      return { ...pick };
    }
    try {
      return { ...(await addAccount()) };
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`Qwen account could not be created: ${(err as Error).message}`);
      await sleep(1500);
    }
  }
}

async function renew(email: string): Promise<boolean> {
  const a = load().find((x) => x.email === email);
  if (!a) return false;
  try {
    a.token = await signin(email, a.password, a.device);
    save();
    return true;
  } catch {
    const items = load();
    const i = items.findIndex((x) => x.email === email);
    if (i >= 0) { items.splice(i, 1); save(); }
    return false;
  }
}

// ---- gateway calls ----
let modelCache: { at: number; data: ZeusModel[] } = { at: 0, data: [] };

async function listModels(): Promise<ZeusModel[]> {
  if (modelCache.data.length && Date.now() - modelCache.at < 600_000) return modelCache.data;
  try {
    const acct = await acquire();
    const r = await fetch(`${BASE}/models/`, { headers: gwHeaders(acct.token, acct.device), signal: AbortSignal.timeout(20_000) });
    const j = (await r.json()) as { data?: { data?: { id: string; name?: string; info?: { meta?: { abilities?: { thinking?: boolean } } } }[] } };
    const rows = j.data?.data ?? [];
    if (rows.length) {
      modelCache = {
        at: Date.now(),
        data: rows.map((m) => ({ id: m.id, name: m.name || m.id, reasoning: !!m.info?.meta?.abilities?.thinking })),
      };
    }
  } catch { /* fall back to cache / defaults */ }
  return modelCache.data;
}

const RATE = ['ratelimit', 'rate_limit', 'rate limit', 'quota', 'too many', 'limit exceeded', 'usage limit'];
const AUTH = ['unauthorized', 'unauthenticated', 'token', 'login', 'expired', 'invalid_auth'];

function classify(status: number, body: string): 'waf' | 'rate' | 'auth' | 'other' {
  const low = (body || '').toLowerCase();
  if (low.includes('_____tmd_____') || low.includes('rgv587') || low.includes('x5secdata')) return 'waf';
  if (status === 429 || RATE.some((k) => low.includes(k))) return 'rate';
  if (status === 401 || status === 403 || (status >= 400 && AUTH.some((k) => low.includes(k)))) return 'auth';
  return 'other';
}

class AttemptError extends Error {
  constructor(public kind: string, message: string) { super(message); }
}

function buildPrompt(messages: ZeusRequest['messages']): string {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system' && m.content);
  const last = turns[turns.length - 1]?.content ?? '';
  const earlier = turns.slice(0, -1);
  const parts: string[] = [];
  if (system) parts.push(`[System]\n${system}`);
  if (earlier.length) parts.push(`[Conversation so far]\n${earlier.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n')}`);
  return parts.length ? `${parts.join('\n\n')}\n\n[User]\n${last}` : last;
}

async function* attempt(acct: Account, model: string, text: string, thinking: boolean, signal?: AbortSignal): AsyncGenerator<ZeusChunk> {
  const hdr = (extra: Record<string, string> = {}) => gwHeaders(acct.token, acct.device, extra);
  const nr = await fetch(`${BASE}/chats/new`, {
    method: 'POST',
    headers: hdr({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ chat_mode: 'normal', project_id: '' }),
    signal: timeoutSignal(25_000, signal),
  });
  const nbody = await nr.text();
  let nj: { success?: boolean; data?: { id?: string } } = {};
  try { nj = JSON.parse(nbody); } catch { /* non-JSON */ }
  if (!nj.success || !nj.data?.id) throw new AttemptError(classify(nr.status, nbody), nbody.slice(0, 200));
  const chatId = nj.data.id;
  try {
    const ts = Math.floor(Date.now() / 1000);
    const payload = {
      stream: true, incremental_output: true, chat_id: chatId, chat_mode: 'normal', model, version: '2.1', timestamp: ts,
      share_id: '', origin_branch_message_id: '',
      messages: [{
        chat_type: 't2t', content: text, role: 'user', timestamp: ts, sub_chat_type: 't2t', models: [model], user_action: 'chat',
        extra: { meta: { subChatType: 't2t' } },
        feature_config: { output_schema: 'phase', thinking_enabled: thinking, thinking_format: 'summary', auto_thinking: false, auto_search: false },
      }],
    };
    const res = await fetch(`${BASE}/chat/completions?chat_id=${chatId}`, {
      method: 'POST',
      headers: hdr({ Accept: '*/*,text/event-stream', 'Content-Type': 'application/json; charset=UTF-8' }),
      body: JSON.stringify(payload),
      signal: timeoutSignal(300_000, signal),
    });
    if (!(res.headers.get('content-type') ?? '').includes('event-stream')) {
      const body = (await res.text()).slice(0, 500);
      throw new AttemptError(classify(res.status, body), body.slice(0, 200));
    }
    let seenThoughts = 0;
    let got = false;
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        let d: any;
        try { d = JSON.parse(line.slice(5).trim()); } catch { continue; }
        const err = d.error || (d.success === false ? d.data?.code : null);
        if (err) {
          const msg = JSON.stringify(d).slice(0, 300);
          if (got) { yield { type: 'error', error: msg }; return; }
          throw new AttemptError(classify(msg.toLowerCase().includes('limit') ? 429 : 0, msg), msg);
        }
        const delta = d.choices?.[0]?.delta ?? {};
        const phase = delta.phase;
        const content: string = delta.content ?? '';
        if (phase === 'thinking_summary') {
          const items: string[] = delta.extra?.summary_thought?.content ?? [];
          for (const t of items.slice(seenThoughts)) yield { type: 'thought', content: `${t}\n` };
          seenThoughts = Math.max(seenThoughts, items.length);
        } else if (phase === 'think' && content) {
          yield { type: 'thought', content };
        } else if (phase === 'answer' && content) {
          got = true;
          yield { type: 'text', content };
        }
      }
    }
    if (!got) throw new AttemptError('rate', 'Qwen returned an empty answer');
  } finally {
    fetch(`${BASE}/chats/${chatId}`, { method: 'DELETE', headers: hdr(), signal: AbortSignal.timeout(8000) }).catch(() => undefined);
  }
}

export const qwen: ZeusProvider = {
  id: 'qwen',
  label: 'Qwen (App Gateway)',
  models: [{ id: DEFAULT_MODEL, name: 'Qwen 3.8 Max', reasoning: true }],
  listModels,
  async *stream(req: ZeusRequest): AsyncGenerator<ZeusChunk> {
    const text = buildPrompt(req.messages);
    if (!text.trim()) {
      yield { type: 'error', error: 'Qwen: no user content to send' };
      return;
    }
    const model = req.model || DEFAULT_MODEL;
    const thinking = req.effort === 'high';
    const tried: string[] = [];
    let last = 'Qwen did not answer';
    for (let i = 0; i < 4; i++) {
      let acct: Account;
      try {
        acct = await acquire(tried);
      } catch (err) {
        yield { type: 'error', error: (err as Error).message };
        return;
      }
      tried.push(acct.email);
      let started = false;
      try {
        for await (const ev of attempt(acct, model, text, thinking, req.signal)) {
          if (ev.type === 'text') started = true;
          yield ev;
        }
        yield { type: 'done' };
        return;
      } catch (err) {
        const msg = (err as Error).message;
        last = msg;
        if (started || req.signal?.aborted) {
          yield { type: 'error', error: last };
          return;
        }
        if (err instanceof AttemptError) {
          if (err.kind === 'auth') {
            await renew(acct.email);
            tried.pop();
          } else if (err.kind === 'rate') cool(acct.email, 600);
          else if (err.kind === 'waf') cool(acct.email, 60);
          else {
            yield { type: 'error', error: last };
            return;
          }
        } else {
          last = `Qwen gateway unreachable: ${msg.slice(0, 160)}`;
        }
      }
    }
    yield { type: 'error', error: last };
  },
};
