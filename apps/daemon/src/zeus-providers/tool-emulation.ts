// The keyless providers are plain chat endpoints with no native function
// calling. To let the OpenCode-style agent loop drive them, tool schemas are
// injected as a text protocol and `<tool_call>` blocks are parsed back into
// OpenAI `tool_calls`.

export interface OpenAITool {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export function toolProtocolPrompt(tools: OpenAITool[]): string {
  const specs = tools
    .map((t) => t.function)
    .filter((f): f is NonNullable<OpenAITool['function']> => !!f?.name)
    .map((f) => JSON.stringify({ name: f.name, description: f.description ?? '', parameters: f.parameters ?? {} }));
  return [
    '# Tool-calling protocol',
    'You are running inside an agent harness that executes tools on the user\'s machine. Available tools (JSON schemas):',
    ...specs,
    '',
    'To use a tool, reply with one or more blocks, exactly in this form, and nothing after the last block:',
    '<tool_call>{"name": "<tool name>", "arguments": { ... }}</tool_call>',
    'Rules:',
    '- Arguments must be valid JSON matching the schema.',
    '- After you emit tool calls, stop. The harness replies with <tool_response> blocks; then continue.',
    '- Never invent tool results. Never ask the user to run commands you can run yourself.',
    '- When the task is complete, answer in plain text without any tool_call block.',
  ].join('\n');
}

interface RawMessage {
  role?: string;
  content?: unknown;
  tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
  tool_call_id?: string;
  name?: string;
}

// Rewrite tool-related turns into plain text turns the providers understand.
export function rewriteForTools(messages: RawMessage[]): RawMessage[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const calls = m.tool_calls
        .map((c) => {
          let args: unknown = {};
          try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = c.function?.arguments ?? {}; }
          return `<tool_call>${JSON.stringify({ name: c.function?.name, arguments: args })}</tool_call>`;
        })
        .join('\n');
      const text = typeof m.content === 'string' ? m.content : '';
      return { role: 'assistant', content: `${text}${text ? '\n' : ''}${calls}` };
    }
    if (m.role === 'tool') {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
      return { role: 'user', content: `<tool_response${m.name ? ` name="${m.name}"` : ''}>\n${text}\n</tool_response>` };
    }
    return m;
  });
}

export const CALL_OPEN = '<tool_call>';
const CALL_CLOSE = '</tool_call>';

export function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '');
}

// First balanced {...} starting at `from` (string-aware). Models often drop the
// closing tag, so the JSON object itself delimits the call.
function balancedObject(text: string, from: number): { json: string; end: number } | null {
  const start = text.indexOf('{', from);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { json: text.slice(start, i + 1), end: i + 1 };
  }
  return null;
}

export function parseToolCalls(text: string): { content: string; calls: ParsedToolCall[] } {
  const clean = stripThink(text);
  const calls: ParsedToolCall[] = [];
  let content = '';
  let pos = 0;
  for (;;) {
    const at = clean.indexOf(CALL_OPEN, pos);
    if (at < 0) { content += clean.slice(pos); break; }
    content += clean.slice(pos, at);
    const obj = balancedObject(clean, at + CALL_OPEN.length);
    if (!obj) { pos = at + CALL_OPEN.length; continue; }
    try {
      const parsed = JSON.parse(obj.json) as { name?: string; arguments?: unknown };
      if (parsed && typeof parsed.name === 'string') {
        const args = typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments ?? {});
        calls.push({ id: `call_${Date.now().toString(36)}_${calls.length}`, name: parsed.name, arguments: args });
      }
    } catch { /* malformed call: dropped */ }
    pos = obj.end;
    if (clean.startsWith(CALL_CLOSE, pos)) pos += CALL_CLOSE.length;
  }
  return { content: content.trim(), calls };
}
