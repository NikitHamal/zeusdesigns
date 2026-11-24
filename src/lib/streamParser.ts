// Universal Streaming Parser for Zeus Codes & OpenDesign Artifacts
// Handles:
// 1. Universal reasoning extraction (<think>, <thinking>, <thought>, <reasoning>, <|begin_of_thought|>, <details type="reasoning">, GPT-OSS Harmony analysis channel, and orphan closing </think> tags)
// 2. Complete stripping of all inline/fenced tool-call XML/JSON blocks so raw tool markup never leaks into the chat answer
// 3. OpenDesign markdown-context-aware <artifact> / <artboard> extraction (ignoring tags inside markdown code fences)
// 4. Deterministic fallback summary generation when an agent completes tool calls without trailing prose

import type { ToolCall } from "../types";

export interface ParsedBlock {
  attrs: Record<string, string>;
  html: string;
  closed: boolean;
}

export interface ParsedStreamResult {
  text: string;
  blocks: ParsedBlock[];
  reasoning: string;
  thinkOpen: boolean;
  leakedPlan?: string;
}

export function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = m[2] ?? m[3] ?? "";
  }
  return out;
}

/**
 * Compute byte ranges inside markdown fenced code blocks (``` ... ```) or inline code (`...`)
 * so `<artboard>` or `<artifact>` examples inside code blocks are never parsed as live screens.
 * Adapted from `nexu-io/open-design/apps/web/src/artifacts/markdown-context.ts`.
 */
export function computeMarkdownCodeSkipRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fenceRe = /(^|\n)(`{3,}|~{3,})([^\n]*)\n/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const lang = (m[3] ?? "").trim().toLowerCase();
    // If the model wrapped a raw <!doctype html> or <artboard> in ```html, allow normalizeStream to unpack it first
    if (lang === "xml" || lang === "markdown" || lang === "md" || lang === "txt") {
      const fence = m[2];
      const start = m.index + m[1].length;
      const closeIdx = text.indexOf(`\n${fence}`, start + m[0].length - m[1].length);
      if (closeIdx >= 0) {
        const end = closeIdx + 1 + fence.length;
        ranges.push([start, end]);
        fenceRe.lastIndex = end;
      }
    }
  }
  return ranges;
}

function isInsideRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true;
  }
  return false;
}

/** Normalize <artifact ...>...</artifact> (OpenDesign/Claude format) or bare HTML documents into <artboard> blocks. */
export function normalizeStream(full: string): string {
  if (full.includes("<artifact ") || full.includes("<artifact>")) {
    full = full
      .replace(/<artifact\b([^>]*)>/gi, (_m, rawAttrs: string) => {
        const attrs = parseAttrs(rawAttrs);
        const name = (attrs.title || attrs.name || attrs.identifier || "Artifact").replace(/"/g, "'");
        const mode = attrs.mode || "new";
        return `<artboard name="${name}" device="web" mode="${mode}">`;
      })
      .replace(/<\/artifact>/gi, "</artboard>");
  }
  if (full.includes("<artboard")) return full;
  const m = /(```(?:html)?[ \t]*\n)?(<!doctype html|<html[\s>])/i.exec(full);
  if (!m) return full;
  const rest = full.slice(m.index + (m[1]?.length ?? 0));
  const title = /<title>([^<]{1,60})<\/title>/i.exec(rest)?.[1]?.trim() || "Screen";
  const open = `<artboard name="${title.replace(/"/g, "'")}" mode="new">\n`;
  const end = /<\/html>/i.exec(rest);
  if (!end) return full.slice(0, m.index) + open + rest;
  const stop = end.index + end[0].length;
  return (
    full.slice(0, m.index) +
    open +
    rest.slice(0, stop) +
    "\n</artboard>" +
    rest.slice(stop).replace(/^\s*```/, "")
  );
}

const LEAKED_PLAN_LINE =
  /^\s*(?:[-*•]\s*)?(?:\*\*)?(?:Font pairing|Signature move|Sections|Data points|Audience|Primary action)(?:\*\*)?\s*:/i;

export function extractLeakedPlan(raw: string): { cleanText: string; leakedPlan: string } {
  const lines = raw.split("\n");
  const kept: string[] = [];
  const plan: string[] = [];
  for (const line of lines) {
    if (LEAKED_PLAN_LINE.test(line)) {
      plan.push(line.trim());
    } else {
      kept.push(line);
    }
  }
  return {
    cleanText: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    leakedPlan: plan.join("\n"),
  };
}

/**
 * Strips any tool call tags inside a reasoning trace so internal `<think>` blocks stay readable prose.
 */
function cleanReasoningProse(raw: string): string {
  return raw
    .replace(/<(?:zeus_tool|tool_call|function_call|ifm\|tool_call)[\s\S]*?(?:<\/(?:zeus_tool|tool_call|function_call|ifm\|tool_call)>|$)/gi, "")
    .replace(/<\/?(?:think|thinking|thought|reasoning|details)[^>]*>/gi, "")
    .trim();
}

/**
 * Universal reasoning extractor and stripper.
 * Captures:
 * 1. Explicit `<think>...</think>`, `<thinking>...</thinking>`, `<thought>...</thought>`, `<reasoning>...</reasoning>`
 * 2. `<|begin_of_thought|>...<|end_of_thought|>`
 * 3. `<details type="reasoning">...</details>`
 * 4. GPT-OSS Harmony `<|start|>assistant<|channel|>(?:analysis|thought)<|message|>...<|end|>`
 * 5. Orphan closing tags (`</think>`, `</thinking>`, `</thought>`, `</reasoning>`, `<|end_of_thought|>`) when an upstream server pre-opened `<think>` in the prompt template
 */
export function extractReasoningFromRaw(
  raw: string,
  extraThink = ""
): { withoutReasoning: string; reasoning: string; thinkOpen: boolean } {
  let working = raw;
  const collected: string[] = [];
  if (extraThink.trim()) {
    collected.push(cleanReasoningProse(extraThink));
  }

  let thinkOpen = false;

  // 1. Handle orphan closing tags first (when no opening tag precedes the first closing tag)
  const orphanPatterns: Array<{ openRe: RegExp; closeTag: string }> = [
    { openRe: /<think>/i, closeTag: "</think>" },
    { openRe: /<thinking>/i, closeTag: "</thinking>" },
    { openRe: /<thought>/i, closeTag: "</thought>" },
    { openRe: /<reasoning>/i, closeTag: "</reasoning>" },
    { openRe: /<\|begin_of_thought\|>/i, closeTag: "<|end_of_thought|>" },
  ];

  for (const { openRe, closeTag } of orphanPatterns) {
    const lower = working.toLowerCase();
    const closeIdx = lower.indexOf(closeTag);
    if (closeIdx >= 0) {
      const beforeClose = working.slice(0, closeIdx);
      if (!openRe.test(beforeClose)) {
        const orphanText = cleanReasoningProse(beforeClose);
        if (orphanText) collected.push(orphanText);
        working = working.slice(closeIdx + closeTag.length);
      }
    }
  }

  // 2. Paired or unclosed-tail reasoning blocks
  const pairedRe =
    /<(think|thinking|thought|reasoning)\b[^>]*>([\s\S]*?)(<\/\1>|$)|<\|begin_of_thought\|>([\s\S]*?)(<\|end_of_thought\|>|$)|<details\b[^>]*type=["']?reasoning["']?[^>]*>([\s\S]*?)(<\/details>|$)|<\|start\|>assistant<\|channel\|>(?:analysis|thought)(?:<\|message\|>)?([\s\S]*?)(<\|end\|>|<\|start\|>|$)/gi;

  working = working.replace(
    pairedRe,
    (_full, _tag1, body1, close1, body2, close2, body3, close3, body4, close4) => {
      const content = (body1 ?? body2 ?? body3 ?? body4 ?? "").trim();
      const closeTok = close1 ?? close2 ?? close3 ?? close4 ?? "";
      if (closeTok === "") {
        thinkOpen = true;
      }
      const cleaned = cleanReasoningProse(content);
      if (cleaned) collected.push(cleaned);
      return "";
    }
  );

  // Deduplicate identical consecutive thought segments across rounds
  const uniqueThoughts: string[] = [];
  for (const item of collected) {
    if (item && !uniqueThoughts.includes(item)) {
      uniqueThoughts.push(item);
    }
  }

  return {
    withoutReasoning: working,
    reasoning: uniqueThoughts.join("\n\n").trim(),
    thinkOpen,
  };
}

/**
 * Strips all inline or fenced tool-call tags from visible assistant text so tool invocations
 * render exclusively as interactive WorkLog rows and never leak raw XML/JSON into the chat.
 */
export function stripToolMarkupFromText(input: string): string {
  const shorthandTags =
    "zeus_tool|tool_call|function_call|function|invoke|antml:invoke|ifm\\|tool_calls|ifm\\|tool_call|bash|shell|python|read_file|write_file|edit_file|delete_file|search_code|list_dir|web_fetch|memory_search|memory_save|memory_edit|memory_delete";

  return input
    .replace(
      new RegExp(
        `\`\`\`(?:xml|json|tool_call|bash|sh|python)?\\s*<(?:${shorthandTags})\\b[\\s\\S]*?(?:<\\/(?:${shorthandTags})>|\\/>)\\s*\`\`\``,
        "gi"
      ),
      ""
    )
    .replace(/<\|start\|>assistant<\|channel\|>commentary[\s\S]*?(?:<\|end\|>|<\|return\|>|<\|call\|>|$)/gi, "")
    .replace(/<zeus_tool[^>]*\/>/gi, "")
    .replace(/<(?:read_file|list_dir|delete_file|memory_search)\b[^>]*\/>/gi, "")
    .replace(/<zeus_tool[\s\S]*?(<\/zeus_tool>|$)/gi, "")
    .replace(/<tool_call[\s\S]*?(<\/tool_call>|$)/gi, "")
    .replace(/<function_call[\s\S]*?(<\/function_call>|$)/gi, "")
    .replace(/<function(?:=|\s+name=)[\s\S]*?(<\/function>|$)/gi, "")
    .replace(/<(?:antml:)?invoke\s+name=[\s\S]*?(<\/(?:antml:)?invoke>|$)/gi, "")
    .replace(/<ifm\|tool_calls>[\s\S]*?(<\/ifm\|tool_calls>|$)/gi, "")
    .replace(/<ifm\|tool_call>[\s\S]*?(<\/ifm\|tool_call>|$)/gi, "")
    .replace(/<\|open\|>tools[\s\S]*?(?:<\|close\|>tools(?:<\|sep\|>)?|$)/gi, "")
    .replace(/<\|open\|>call[\s\S]*?(?:<\|close\|>call(?:<\|sep\|>)?|$)/gi, "")
    .replace(
      /<(bash|shell|python|read_file|write_file|edit_file|delete_file|search_code|list_dir|web_fetch|memory_search|memory_save|memory_edit|memory_delete)(?:\s+[^>]*)?>[\s\S]*?(<\/\1>|$)/gi,
      ""
    )
    .replace(/<\/?(?:think|thinking|thought|reasoning|zeus_tool|tool_call|function_call)\b[^>]*>/gi, "");
}

export function parseStream(
  rawFull: string,
  extraThink = ""
): ParsedStreamResult {
  const { withoutReasoning, reasoning, thinkOpen } = extractReasoningFromRaw(rawFull, extraThink);
  const full = normalizeStream(stripToolMarkupFromText(withoutReasoning));
  const skipRanges = computeMarkdownCodeSkipRanges(full);

  let text = "";
  const blocks: ParsedBlock[] = [];
  let i = 0;
  for (;;) {
    const s = full.indexOf("<artboard", i);
    if (s < 0) {
      text += full.slice(i);
      break;
    }
    if (isInsideRanges(s, skipRanges)) {
      text += full.slice(i, s + 9);
      i = s + 9;
      continue;
    }
    text += full.slice(i, s);
    const gt = full.indexOf(">", s);
    if (gt < 0) break;
    const attrs = parseAttrs(full.slice(s + 9, gt));
    const e = full.indexOf("</artboard>", gt + 1);
    const clean = (h: string) =>
      h
        .replace(/^\s*```(?:html)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
    const isRealHtmlBlock = (h: string, a: Record<string, string>) => {
      if (a.name === "..." || h.startsWith('".') || h.startsWith("'.")) return false;
      return /<(?:!doctype|html|head|body|style|div|main|section|header|nav|article|canvas|svg|script|h1|h2|table|form)\b/i.test(
        h
      );
    };
    if (e < 0) {
      const candidate = clean(full.slice(gt + 1));
      if (isRealHtmlBlock(candidate, attrs)) {
        blocks.push({ attrs, html: candidate, closed: false });
      }
      break;
    }
    const candidate = clean(full.slice(gt + 1, e));
    if (isRealHtmlBlock(candidate, attrs)) {
      blocks.push({ attrs, html: candidate, closed: true });
    }
    i = e + 11;
  }

  const cleanedStray = text.replace(/^\s*(?:``|''|,,)+\s*$/gm, "").trim();
  const { cleanText, leakedPlan } = extractLeakedPlan(cleanedStray);
  const mergedReasoning = [reasoning, leakedPlan].filter(Boolean).join("\n\n").trim();

  return {
    text: cleanText,
    blocks,
    reasoning: mergedReasoning,
    thinkOpen,
    leakedPlan: leakedPlan || undefined,
  };
}

/**
 * Generates a concise, deterministic completion summary if the model finished executing tools
 * and ended the final round without emitting visible prose outside `<think>`.
 * Guarantees the assistant message never appears blank after completing work.
 */
export function synthesizeToolCompletionSummary(tools: ToolCall[]): string {
  if (!tools.length) return "";
  const parsePath = (t: ToolCall): string => {
    try {
      const j = JSON.parse(t.args ?? "{}");
      return String(j.path || j.file || "").trim();
    } catch {
      return "";
    }
  };

  const written: string[] = [];
  const edited: string[] = [];
  const deleted: string[] = [];
  const commands: string[] = [];
  const read: string[] = [];

  for (const t of tools) {
    if (t.status !== "ok") continue;
    const p = parsePath(t);
    if (/^(write_file|write|create_file|save_file)$/.test(t.name) && p) {
      if (!written.includes(p)) written.push(p);
    } else if (/^(edit_file|edit|patch_file|replace_in_file)$/.test(t.name) && p) {
      if (!edited.includes(p)) edited.push(p);
    } else if (/^(delete_file|remove_file|rm|del|unlink)$/.test(t.name) && p) {
      if (!deleted.includes(p)) deleted.push(p);
    } else if (/^(shell|bash|python|python3)$/.test(t.name)) {
      commands.push(t.name);
    } else if (/^(read_file|read|cat)$/.test(t.name) && p) {
      if (!read.includes(p)) read.push(p);
    }
  }

  const parts: string[] = [];
  if (written.length) parts.push(`Created ${written.map((f) => `\`${f}\``).join(", ")}`);
  if (edited.length) parts.push(`Updated ${edited.map((f) => `\`${f}\``).join(", ")}`);
  if (deleted.length) parts.push(`Deleted ${deleted.map((f) => `\`${f}\``).join(", ")}`);
  if (!parts.length && commands.length) {
    parts.push(`Executed ${commands.length} workspace command${commands.length > 1 ? "s" : ""}`);
  }
  if (!parts.length && read.length) {
    parts.push(`Inspected ${read.map((f) => `\`${f}\``).join(", ")}`);
  }
  return parts.length ? `${parts.join(" and ")}.` : "";
}
