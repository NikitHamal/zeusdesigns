// Zeus keyless provider contract. Every provider turns an OpenAI-shaped
// message list into an async stream of chunks; the gateway (gateway.ts)
// exposes them as OpenAI-compatible /v1 endpoints so the web UI, the BYOK
// proxy and the OpenCode agent runtime can all use them unchanged.

export interface ZeusMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ZeusModel {
  id: string;
  name: string;
  reasoning?: boolean;
}

export type ZeusChunk =
  | { type: 'text'; content: string }
  | { type: 'thought'; content: string }
  | { type: 'error'; error: string; status?: number }
  | { type: 'done' };

export interface ZeusRequest {
  messages: ZeusMessage[];
  model: string;
  effort?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
  // Stable key (usually a hash of the first user turn) providers may use to
  // pin server-side conversation state.
  conversationKey?: string;
}

export interface ZeusProvider {
  id: string;
  label: string;
  models: ZeusModel[];
  stream(req: ZeusRequest): AsyncGenerator<ZeusChunk>;
  // Optional live catalogue (e.g. Qwen serves its own model list).
  listModels?(): Promise<ZeusModel[]>;
}

export function normalizeMessages(input: unknown): ZeusMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ZeusMessage[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as { role?: unknown; content?: unknown };
    const role = String(m.role ?? '').toLowerCase();
    let content = '';
    if (typeof m.content === 'string') content = m.content;
    else if (Array.isArray(m.content)) {
      content = m.content
        .map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
        .join('');
    }
    content = content.trim();
    if (!content) continue;
    if (role === 'developer') out.push({ role: 'system', content });
    else if (role === 'system' || role === 'user' || role === 'assistant') out.push({ role, content });
    else if (role === 'tool') out.push({ role: 'user', content: `Tool result:\n${content}` });
  }
  return out;
}

// Collapse a transcript to a single prompt for providers that only accept one
// user turn per request.
export function flattenTranscript(messages: ZeusMessage[]): string {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  const last = turns[turns.length - 1];
  if (turns.length <= 1) return system ? `${system}\n\n${last?.content ?? ''}` : last?.content ?? '';
  const prior = turns
    .slice(0, -1)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  return `${system ? `${system}\n\n` : ''}Conversation so far:\n${prior}\n\nCurrent message (reply to this):\n${last?.content ?? ''}`;
}
