import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { ZEUS_PROVIDER_MAP, ZEUS_PROVIDERS } from './index.js';
import { normalizeMessages, type ZeusChunk, type ZeusProvider } from './types.js';
import { CALL_OPEN, parseToolCalls, rewriteForTools, toolProtocolPrompt, type OpenAITool } from './tool-emulation.js';

// OpenAI-compatible loopback gateway for the keyless providers:
//   GET  /<provider>/v1/models
//   POST /<provider>/v1/chat/completions   (stream + non-stream, tools emulated)
// Bound to 127.0.0.1 only; browser-origin requests from non-loopback pages are
// refused so random websites cannot burn the free upstreams.

export const DEFAULT_ZEUS_GATEWAY_PORT = 17873;

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

async function readBody(req: http.IncomingMessage, limit = 8 * 1024 * 1024): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function modelsFor(p: ZeusProvider) {
  let list = p.models;
  if (p.listModels) {
    try { const live = await p.listModels(); if (live.length) list = live; } catch { /* static fallback */ }
  }
  return list;
}

function conversationKey(messages: { role: string; content: string }[]): string {
  const first = messages.find((m) => m.role === 'user')?.content ?? '';
  return createHash('sha1').update(first).digest('hex').slice(0, 16);
}

async function handleChat(p: ZeusProvider, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try { body = await readBody(req); } catch (err) {
    return json(res, 400, { error: { message: (err as Error).message, type: 'invalid_request_error' } });
  }
  const tools: OpenAITool[] = Array.isArray(body.tools) ? body.tools : [];
  const useTools = tools.length > 0 && body.tool_choice !== 'none';
  let raw = Array.isArray(body.messages) ? body.messages : [];
  if (useTools) raw = [{ role: 'system', content: toolProtocolPrompt(tools) }, ...rewriteForTools(raw)];
  const messages = normalizeMessages(raw);
  if (!messages.some((m) => m.role === 'user')) {
    return json(res, 400, { error: { message: 'messages must contain a user turn', type: 'invalid_request_error' } });
  }
  const model: string = typeof body.model === 'string' && body.model ? body.model : (p.models[0]?.id ?? '');
  const effortRaw = String(body.reasoning_effort ?? '').toLowerCase();
  const effort = effortRaw === 'low' || effortRaw === 'medium' || effortRaw === 'high' ? effortRaw : undefined;
  const stream = body.stream === true;

  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const frame = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

  const chunks = p.stream({
    messages,
    model,
    ...(effort ? { effort } : {}),
    signal: abort.signal,
    conversationKey: conversationKey(messages),
  });

  if (stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(frame({ role: 'assistant', content: '' }));
    let held = ''; // text withheld while it might be the start of a tool call
    let toolMode = false;
    let full = '';
    let failed = false;
    for await (const ch of chunks as AsyncGenerator<ZeusChunk>) {
      if (ch.type === 'thought') res.write(frame({ reasoning_content: ch.content }));
      else if (ch.type === 'text') {
        full += ch.content;
        if (!useTools) { res.write(frame({ content: ch.content })); continue; }
        if (toolMode) continue;
        held += ch.content;
        const at = held.indexOf(CALL_OPEN);
        if (at >= 0) {
          if (at > 0) res.write(frame({ content: held.slice(0, at) }));
          held = '';
          toolMode = true;
          continue;
        }
        // keep any suffix that is a prefix of the opening marker
        let keep = 0;
        for (let k = Math.min(CALL_OPEN.length - 1, held.length); k > 0; k--) {
          if (CALL_OPEN.startsWith(held.slice(-k))) { keep = k; break; }
        }
        if (held.length > keep) res.write(frame({ content: held.slice(0, held.length - keep) }));
        held = held.slice(held.length - keep);
      } else if (ch.type === 'error') {
        failed = true;
        res.write(`data: ${JSON.stringify({ error: { message: ch.error, type: 'upstream_error', code: ch.status ?? 502 } })}\n\n`);
        break;
      }
    }
    if (!failed) {
      let finish = 'stop';
      if (useTools) {
        const parsed = parseToolCalls(full);
        if (!toolMode && held) res.write(frame({ content: held }));
        if (parsed.calls.length) {
          finish = 'tool_calls';
          res.write(frame({ tool_calls: parsed.calls.map((c, index) => ({ index, id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) }));
        }
      }
      res.write(frame({}, finish));
    }
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  let text = '';
  let reasoning = '';
  for await (const ch of chunks as AsyncGenerator<ZeusChunk>) {
    if (ch.type === 'text') text += ch.content;
    else if (ch.type === 'thought') reasoning += ch.content;
    else if (ch.type === 'error') {
      return json(res, ch.status && ch.status >= 400 ? ch.status : 502, { error: { message: ch.error, type: 'upstream_error' } });
    }
  }
  const parsed = useTools ? parseToolCalls(text) : { content: text, calls: [] };
  const message: Record<string, unknown> = { role: 'assistant', content: parsed.content || null };
  if (reasoning) message.reasoning_content = reasoning;
  if (parsed.calls.length) message.tool_calls = parsed.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } }));
  json(res, 200, {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{ index: 0, message, finish_reason: parsed.calls.length ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

export function createZeusGateway(): http.Server {
  return http.createServer((req, res) => {
    void (async () => {
      try {
        const origin = req.headers.origin;
        if (origin) {
          try { if (!LOOPBACK.test(new URL(origin).host)) return json(res, 403, { error: { message: 'forbidden origin' } }); }
          catch { return json(res, 403, { error: { message: 'forbidden origin' } }); }
        }
        if (!LOOPBACK.test(String(req.headers.host ?? ''))) return json(res, 403, { error: { message: 'forbidden host' } });
        const url = new URL(req.url ?? '/', 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean); // [provider, 'v1', 'models'|'chat'...]
        if (parts.length === 0 || (parts.length === 1 && parts[0] === 'providers')) {
          return json(res, 200, { providers: ZEUS_PROVIDERS.map((p) => ({ id: p.id, label: p.label, models: p.models })) });
        }
        const provider = parts[0] ? ZEUS_PROVIDER_MAP.get(parts[0]) : undefined;
        if (!provider || parts[1] !== 'v1') return json(res, 404, { error: { message: 'unknown provider' } });
        const route = parts.slice(2).join('/');
        if (req.method === 'GET' && route === 'models') {
          const list = await modelsFor(provider);
          return json(res, 200, { object: 'list', data: list.map((m) => ({ id: m.id, object: 'model', created: 0, owned_by: provider.id, name: m.name })) });
        }
        if (req.method === 'POST' && route === 'chat/completions') return await handleChat(provider, req, res);
        return json(res, 404, { error: { message: 'not found' } });
      } catch (err) {
        if (!res.headersSent) json(res, 500, { error: { message: (err as Error).message } });
        else res.end();
      }
    })();
  });
}

// Start on the configured port (OD_ZEUS_PORT), walking forward when busy.
export async function startZeusGateway(preferred = Number(process.env.OD_ZEUS_PORT) || DEFAULT_ZEUS_GATEWAY_PORT): Promise<{ server: http.Server; port: number }> {
  const server = createZeusGateway();
  for (let port = preferred; port < preferred + 10; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (e: Error) => { server.off('listening', onOk); reject(e); };
        const onOk = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onOk);
        server.listen(port, '127.0.0.1');
      });
      server.unref();
      return { server, port };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(`no free port for the Zeus gateway near ${preferred}`);
}
