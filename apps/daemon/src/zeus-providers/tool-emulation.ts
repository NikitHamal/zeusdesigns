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

const CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
export const CALL_OPEN = '<tool_call>';

export function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '');
}

export function parseToolCalls(text: string): { content: string; calls: ParsedToolCall[] } {
  const clean = stripThink(text);
  const calls: ParsedToolCall[] = [];
  let i = 0;
  const content = clean
    .replace(CALL_RE, (_all, body: string) => {
      try {
        const obj = JSON.parse(body) as { name?: string; arguments?: unknown };
        if (obj && typeof obj.name === 'string') {
          const args = typeof obj.arguments === 'string' ? obj.arguments : JSON.stringify(obj.arguments ?? {});
          calls.push({ id: `call_${Date.now().toString(36)}_${i++}`, name: obj.name, arguments: args });
        }
      } catch { /* malformed call: dropped */ }
      return '';
    })
    .trim();
  return { content, calls };
}
