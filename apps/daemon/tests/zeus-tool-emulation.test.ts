import { describe, expect, it } from 'vitest';
import { parseToolCalls, rewriteForTools } from '../src/zeus-providers/tool-emulation.js';
import { cleanChatJimmy } from '../src/zeus-providers/chatjimmy.js';
import { splitReasoning } from '../src/zeus-providers/k2horizon.js';
import { generateTryitKey } from '../src/zeus-providers/deepai.js';

describe('zeus tool emulation', () => {
  it('parses closed and unclosed tool calls', () => {
    const closed = parseToolCalls('ok <tool_call>{"name":"bash","arguments":{"command":"ls"}}</tool_call>');
    expect(closed.content).toBe('ok');
    expect(closed.calls[0]).toMatchObject({ name: 'bash', arguments: '{"command":"ls"}' });
    const open = parseToolCalls('<tool_call>{"name":"read","arguments":{"path":"a}b"}}');
    expect(open.calls[0]?.name).toBe('read');
  });

  it('drops think blocks and malformed calls', () => {
    const out = parseToolCalls('<think>x</think>hello <tool_call>{nope}</tool_call>');
    expect(out.calls).toHaveLength(0);
    expect(out.content).toContain('hello');
  });

  it('rewrites tool turns to text', () => {
    const msgs = rewriteForTools([
      { role: 'assistant', content: '', tool_calls: [{ id: '1', function: { name: 'bash', arguments: '{"command":"ls"}' } }] },
      { role: 'tool', content: 'a.txt', name: 'bash' },
    ]);
    expect(String(msgs[0]?.content)).toContain('<tool_call>');
    expect(msgs[1]?.role).toBe('user');
  });
});

describe('zeus provider helpers', () => {
  it('strips ChatJimmy trailers', () => {
    expect(cleanChatJimmy('hi<|stats|>{"a":1}<|/stats|>')).toBe('hi');
  });
  it('splits K2 reasoning from the answer', () => {
    const { reasoning, answer } = splitReasoning('<details type="reasoning">\n<summary>T</summary>\n> think\n</details>\nanswer');
    expect(reasoning).toBe('think');
    expect(answer).toBe('answer');
  });
  it('generates tryit keys', () => {
    expect(generateTryitKey()).toMatch(/^tryit-\d+-[0-9a-f]{64}$/);
  });
});
