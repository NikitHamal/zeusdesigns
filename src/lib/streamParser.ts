// Universal Streaming Parser for Zeus Codes & OpenDesign Artifacts
// Handles:
// 1. Universal reasoning extraction (<think>, <thinking>, <thought>, <reasoning>, <|begin_of_thought|>, <details type="reasoning">, GPT-OSS Harmony analysis channel, and orphan closing </think> tags)
// 2. Complete stripping of all inline/fenced tool-call XML/JSON blocks so raw tool markup never leaks into the chat answer
// 3. OpenDesign markdown-context-aware <artifact> / <artboard> extraction (ignoring tags inside markdown code fences)
// 4. Deterministic fallback summary generation when an agent completes tool calls without trailing prose

import type { ToolCall } from "../types";
import { DisplayText } from "./stormyAgent";

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
export function computeMarkdownCodeSkipRanges(text: string, includeInline = true): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fenceRe = /(^|\n)(`{3,}|~{3,})([^\n]*)\n/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const lang = (m[3] ?? "").trim().toLowerCase();
    const fence = m[2];
    const start = m.index + m[1].length;
    const bodyStart = start + m[0].length - m[1].length;
    const closeIdx = text.indexOf(`\n${fence}`, bodyStart);
    const end = closeIdx >= 0 ? closeIdx + 1 + fence.length : text.length;
    const inner = text.slice(bodyStart, closeIdx >= 0 ? closeIdx : text.length).trim();
    // Allow top-level ```html fences that wrap a full <!doctype html> or <artboard> document to be unpacked by normalizeStream
    const isUnpackableHtmlFence =
      lang === "html" && /^(?:<!doctype\s+html|<html[\s>]|<artboard\b|<artifact\b)/i.test(inner);
    if (!isUnpackableHtmlFence) {
      ranges.push([start, end]);
    }
    if (closeIdx >= 0) {
      fenceRe.lastIndex = end;
    } else {
      break;
    }
  }
  if (includeInline) {
    const inlineRe = /`[^`\n]+`/g;
    let im: RegExpExecArray | null;
    while ((im = inlineRe.exec(text)) !== null) {
      ranges.push([im.index, im.index + im[0].length]);
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
    const skip = computeMarkdownCodeSkipRanges(full, true);
    full = full
      .replace(/<artifact\b([^>]*)>/gi, (m, rawAttrs: string, offset: number) => {
        if (isInsideRanges(offset, skip)) return m;
        const attrs = parseAttrs(rawAttrs);
        const name = (attrs.title || attrs.name || attrs.identifier || "Artifact").replace(/"/g, "'");
        const mode = attrs.mode || "new";
        return `<artboard name="${name}" device="web" mode="${mode}">`;
      })
      .replace(/<\/artifact>/gi, (m, offset: number) => (isInsideRanges(offset, skip) ? m : "</artboard>"));
  }
  if (full.includes("<artboard")) return full;
  const m = /(^|\n)(```(?:html)?[ \t]*\n)?[ \t]*(<!doctype html|<html[\s>])/i.exec(full);
  if (!m) return full;
  const matchStart = m.index + (m[1]?.length ?? 0);
  const skip = computeMarkdownCodeSkipRanges(full, true);
  if (isInsideRanges(matchStart, skip)) return full;
  const rest = full.slice(matchStart + (m[2]?.length ?? 0));
  if (!/<(?:head|body|style|div|main|section)\b/i.test(rest)) return full;
  const title = /<title>([^<]{1,60})<\/title>/i.exec(rest)?.[1]?.trim() || "Screen";
  const open = `<artboard name="${title.replace(/"/g, "'")}" mode="new">\n`;
  const end = /<\/html>/i.exec(rest);
  if (!end) return full.slice(0, matchStart) + open + rest;
  const stop = end.index + end[0].length;
  return (
    full.slice(0, matchStart) +
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
    .replace(/<(?:zeus_tool|tool_call|function_call|ifm\|tool_call)\b[^>]*>[\s\S]*?<\/(?:zeus_tool|tool_call|function_call|ifm\|tool_call)>/gi, "")
    .replace(/<\/?(?:think|thinking|thought|reasoning|details)[^>]*>/gi, "")
    .trim();
}

/**
 * Neutralize inline syntax examples like `<think>...</think>` or quoted `"</think>"` so they
 * never prematurely close an active reasoning block.
 */
function neutralizeInlineThinkMentions(input: string): string {
  return input
    .replace(/<(think|thinking|thought|reasoning)>\s*(?:\.{2,}|…)\s*<\/\1>/gi, "`<$1>...</$1>`")
    .replace(/(["'`])<\/?(think|thinking|thought|reasoning)>\1/gi, "`$2`");
}

/**
 * Universal reasoning extractor and stripper.
 * Captures:
 * 1. Explicit `<think>...</think>`, `<thinking>...</thinking>`, `<thought>...</thought>`, `<reasoning>...</reasoning>`
 *    including multi-part `<think>...</think>...reasoning...</think>` when an upstream vLLM/SGLang server split `reasoning_content` early on a quoted `</think>`.
 * 2. `<|begin_of_thought|>...<|end_of_thought|>`
 * 3. `<details type="reasoning">...</details>`
 * 4. GPT-OSS Harmony `<|start|>assistant<|channel|>(?:analysis|thought)<|message|>...<|end|>`
 * 5. Orphan closing tags (`</think>`, `</thinking>`, `</thought>`, `</reasoning>`, `<|end_of_thought|>`) when an upstream server pre-opened `<think>` in the prompt template
 */
export function extractReasoningFromRaw(
  raw: string,
  extraThink = ""
): { withoutReasoning: string; reasoning: string; thinkOpen: boolean } {
  let working = neutralizeInlineThinkMentions(raw);
  const collected: string[] = [];
  if (extraThink.trim()) {
    collected.push(cleanReasoningProse(extraThink));
  }

  let thinkOpen = false;

  // 0. If the stream starts with `<think>` and has a premature `</think>` injected mid-sentence
  //    (e.g. followed by `, then emit` or followed later by another orphan `</think>`), merge up to the last `</think>`
  const leadingThinkMatch = /^\s*<(think|thinking|thought|reasoning)\b[^>]*>/i.exec(working);
  if (leadingThinkMatch) {
    const tag = leadingThinkMatch[1].toLowerCase();
    const closeTag = `</${tag}>`;
    const openEnd = leadingThinkMatch[0].length;
    const lower = working.toLowerCase();
    const firstClose = lower.indexOf(closeTag, openEnd);
    if (firstClose >= 0) {
      // Find the last non-backticked closing tag that is not preceded by a new structural opening tag at start-of-line
      let bestClose = firstClose;
      let searchFrom = firstClose + closeTag.length;
      while (searchFrom < lower.length) {
        const nextClose = lower.indexOf(closeTag, searchFrom);
        if (nextClose < 0) break;
        if (nextClose > 0 && working[nextClose - 1] === "`") {
          searchFrom = nextClose + closeTag.length;
          continue;
        }
        bestClose = nextClose;
        searchFrom = nextClose + closeTag.length;
      }
      const afterClose = working.slice(bestClose + closeTag.length);
      // If `bestClose` was immediately followed by mid-sentence continuation `, then emit` while still streaming
      const looksMidSentenceSplit = /^\s*,\s*(?:then\b|and\b|or\b)/i.test(afterClose) && !/<\/\s*think>/i.test(afterClose);
      if (looksMidSentenceSplit) {
        thinkOpen = true;
        const cleaned = cleanReasoningProse(working.slice(openEnd));
        if (cleaned) collected.push(cleaned);
        working = "";
      } else if (bestClose > firstClose) {
        const mergedBody = working.slice(openEnd, bestClose);
        const cleaned = cleanReasoningProse(mergedBody);
        if (cleaned) collected.push(cleaned);
        working = working.slice(bestClose + closeTag.length);
      }
    }
  }

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
    const closeIdx = lower.lastIndexOf(closeTag);
    if (closeIdx >= 0) {
      const charBefore = closeIdx > 0 ? working[closeIdx - 1] : "";
      const charAfter = working[closeIdx + closeTag.length] ?? "";
      if (charBefore === "`" || charAfter === "`") continue;
      const beforeClose = working.slice(0, closeIdx);
      if (!openRe.test(beforeClose)) {
        const orphanText = cleanReasoningProse(beforeClose);
        if (orphanText) collected.push(orphanText);
        working = working.slice(closeIdx + closeTag.length);
      }
    }
  }

  // 2. Paired or unclosed-tail reasoning blocks (ignoring inline-quoted `<think>` tags inside backticks)
  const pairedRe =
    /<(think|thinking|thought|reasoning)\b[^>]*>([\s\S]*?)(<\/\1>|$)|<\|begin_of_thought\|>([\s\S]*?)(<\|end_of_thought\|>|$)|<details\b[^>]*type=["']?reasoning["']?[^>]*>([\s\S]*?)(<\/details>|$)|<\|start\|>assistant<\|channel\|>(?:analysis|thought)(?:<\|message\|>)?([\s\S]*?)(<\|end\|>|<\|start\|>|$)/gi;

  working = working.replace(
    pairedRe,
    (fullMatch, _tag1, body1, close1, body2, close2, body3, close3, body4, close4, offset: number, whole: string) => {
      if (offset > 0 && whole[offset - 1] === "`") {
        return fullMatch;
      }
      // If `<think>` appears mid-sentence in prose (preceded by words on the same line) and has no closing `</think>`, ignore it
      const closeTok = close1 ?? close2 ?? close3 ?? close4 ?? "";
      if (closeTok === "" && offset > 0) {
        const lineStart = whole.lastIndexOf("\n", offset - 1) + 1;
        const prefixOnLine = whole.slice(lineStart, offset).trim();
        if (prefixOnLine.length > 0) {
          return "";
        }
      }
      const content = (body1 ?? body2 ?? body3 ?? body4 ?? "").trim();
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
    "zeus_tool|tool_call|function_call|function|invoke|antml:invoke|ifm\\|tool_calls|ifm\\|tool_call|bash|shell|python|read_file|write_file|edit_file|multi_edit|move_file|delete_file|copy_file|create_folder|insert_at_line|append_to_file|prepend_to_file|regex_replace|get_file_info|diff_files|git_status|git_diff|git_log|git_branch|git_stage|git_unstage|git_commit|security_scan|add_ui_kit|subagent|spawn_subagent|request_approval|apply_patch|websearch|todowrite|todoread|question|session_search|diagnostics|task|search_code|search_project|docs_lookup|check_syntax|update_plan|ask_user|list_dir|list_files|glob|grep|web_fetch|memory_search|memory_save|memory_edit|memory_delete";

  const notBackticked =
    (fn: (m: string) => string) =>
    (m: string, ...args: unknown[]) => {
      const offset = typeof args[args.length - 2] === "number" ? (args[args.length - 2] as number) : 0;
      const whole = typeof args[args.length - 1] === "string" ? (args[args.length - 1] as string) : "";
      if (offset > 0 && whole[offset - 1] === "`") return m;
      return fn(m);
    };

  return input
    .replace(
      new RegExp(
        `\`\`\`(?:xml|json|tool_call|bash|sh|python)?[ \\t]*\\n?\\s*<(?:${shorthandTags})\\b[^\`]*?(?:<\\/(?:${shorthandTags})>|\\/>)[ \\t]*\\n?\`\`\``,
        "gi"
      ),
      ""
    )
    .replace(/<\|start\|>assistant<\|channel\|>commentary[\s\S]*?(?:<\|end\|>|<\|return\|>|<\|call\|>|$)/gi, "")
    .replace(/<zeus_tool[^>]*\/>/gi, notBackticked(() => ""))
    .replace(/<(?:read_file|list_dir|delete_file|memory_search)\b[^>]*\/>/gi, notBackticked(() => ""))
    .replace(
      /<zeus_tool(\s+[^>]*)?>([\s\S]*?)(<\/zeus_tool>|$)/gi,
      (m, attrs: string | undefined, body: string, closeTok: string, offset: number, whole: string) => {
        if (offset > 0 && whole[offset - 1] === "`") return m;
        const a = (attrs ?? "").trim();
        // Never truncate to end-of-string on bare `<zeus_tool>` or `<zeus_tool ...>` syntax mentions
        if (!/(?:name|tool|action|cmd|path)\s*=/i.test(a)) {
          return closeTok ? "" : m;
        }
        if (body.trim() === "..." || a.includes('="..."')) {
          return closeTok ? "" : m;
        }
        if (!closeTok && offset > 0) {
          const lineStart = whole.lastIndexOf("\n", offset - 1) + 1;
          const prefixOnLine = whole.slice(lineStart, offset).trim();
          if (prefixOnLine.length > 0) return m;
        }
        return "";
      }
    )
    .replace(
      /<(tool_call|function_call)>([\s\S]*?)(<\/\1>|$)/gi,
      (m, _tag: string, body: string, closeTok: string, offset: number, whole: string) => {
        if (offset > 0 && whole[offset - 1] === "`") return m;
        if (!closeTok) {
          const lineStart = offset > 0 ? whole.lastIndexOf("\n", offset - 1) + 1 : 0;
          const prefixOnLine = whole.slice(lineStart, offset).trim();
          if (prefixOnLine.length > 0) return m;
          const trimmedBody = body.trim();
          if (trimmedBody.length > 0 && !/^[{<`"']|^[a-z0-9_]+\s*\n\s*\{/i.test(trimmedBody)) {
            return m;
          }
        }
        return "";
      }
    )
    .replace(/<function(?:=|\s+name=)[^>]*>[\s\S]*?(<\/function>|$)/gi, notBackticked(() => ""))
    .replace(/<(?:antml:)?invoke\s+name=[^>]*>[\s\S]*?(<\/(?:antml:)?invoke>|$)/gi, notBackticked(() => ""))
    .replace(/<ifm\|tool_calls>[\s\S]*?(<\/ifm\|tool_calls>|$)/gi, notBackticked(() => ""))
    .replace(/<ifm\|tool_call>[\s\S]*?(<\/ifm\|tool_call>|$)/gi, notBackticked(() => ""))
    .replace(/<\|tool_calls_section_begin\|>[\s\S]*?(<\|tool_calls_section_end\|>|$)/gi, "")
    .replace(/<\|tool_call_begin\|>[\s\S]*?(<\|tool_call_end\|>|$)/gi, "")
    .replace(/<｜tool▁calls▁begin｜>[\s\S]*?(<｜tool▁calls▁end｜>|$)/gi, "")
    .replace(/<｜tool▁call▁begin｜>[\s\S]*?(<｜tool▁call▁end｜>|$)/gi, "")
    .replace(/\[TOOL_CALLS\]\s*\[[\s\S]*?\](?=\s*\n|$)/gi, "")
    .replace(/<\|open\|>tools[\s\S]*?(?:<\|close\|>tools(?:<\|sep\|>)?|$)/gi, "")
    .replace(/<\|open\|>call[\s\S]*?(?:<\|close\|>call(?:<\|sep\|>)?|$)/gi, "")
    .replace(
      /<(bash|shell|python|read_file|write_file|edit_file|multi_edit|move_file|delete_file|search_code|search_project|docs_lookup|check_syntax|update_plan|ask_user|apply_patch|websearch|todowrite|todoread|question|session_search|diagnostics|list_dir|list_files|glob|grep|web_fetch|memory_search|memory_save|memory_edit|memory_delete)(\s+[^>]*)?>[\s\S]*?(<\/\1>|$)/gi,
      (m, _tag: string, attrs: string | undefined, closeTok: string | undefined, offset: number, whole: string) => {
        if (offset > 0 && whole[offset - 1] === "`") return m;
        if (!closeTok && !attrs) {
          const lineStart = whole.lastIndexOf("\n", offset - 1) + 1;
          const prefixOnLine = whole.slice(lineStart, offset).trim();
          if (prefixOnLine.length > 0) return m;
        }
        return "";
      }
    )
    .replace(
      /<Sequence\b[^>]*>([\s\S]*?)(<\/Sequence>|$)/gi,
      (_m, inner: string) => {
        let stepNum = 0;
        const formatted = inner.replace(
          /<Step\b([^>]*)>([\s\S]*?)(<\/Step>|$)/gi,
          (_sm, attrs: string, body: string) => {
            stepNum++;
            const title = /\btitle\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
            const subtitle = /\bsubtitle\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
            const head = [title ? `**${title}**` : "", subtitle ? `*${subtitle}*` : ""].filter(Boolean).join(" — ");
            const cleanBody = body.trim();
            return `\n${stepNum}. ${head}${cleanBody ? `\n   - ${cleanBody}` : ""}\n`;
          }
        );
        return formatted.trim() + "\n";
      }
    )
    .replace(
      /<ElicitationsGroup\b([^>]*)>([\s\S]*?)(<\/ElicitationsGroup>|$)/gi,
      (_m, attrs: string, inner: string) => {
        const msg = /\bmessage\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
        const items: string[] = [];
        inner.replace(/<Elicitation\b([^>]*)(?:\/>|>[\s\S]*?<\/Elicitation>)/gi, (_em, ea: string) => {
          const label = /\blabel\s*=\s*"([^"]*)"/i.exec(ea)?.[1] ?? "";
          if (label) items.push(`- ${label}`);
          return "";
        });
        if (!msg && !items.length) return "";
        return `\n${msg ? `**${msg}**\n` : ""}${items.join("\n")}\n`;
      }
    )
    .replace(/<Image\b([^>]*)(?:\/>|>[\s\S]*?<\/Image>)/gi, (_m, attrs: string) => {
      const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]?.trim() ?? "";
      const caption = /\bcaption\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]?.trim() ?? "";
      const alt = /\balt\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]?.trim() ?? "";
      const label = caption || alt;
      if (/^(?:https?:\/\/|data:image\/)/i.test(src)) {
        return `\n![${label.replace(/[\[\]]/g, "")}](${src})\n`;
      }
      if (!label) return "";
      const desc = caption && alt && caption !== alt ? `**${caption}** — *${alt}*` : `**${label}**`;
      return `\n> Visual: ${desc}\n`;
    })
    .replace(
      /<Sources\b[^>]*>([\s\S]*?)(<\/Sources>|$)/gi,
      (_m, inner: string) => {
        const items: string[] = [];
        inner.replace(/<Source\b([^>]*)(?:\/>|>[\s\S]*?<\/Source>)/gi, (_sm, sa: string) => {
          const title = /\btitle\s*=\s*"([^"]*)"/i.exec(sa)?.[1]?.trim() ?? "";
          const url = /\burl\s*=\s*"([^"]*)"/i.exec(sa)?.[1]?.trim() ?? "";
          if (url && title) items.push(`- [${title}](${url})`);
          else if (url) items.push(`- ${url}`);
          else if (title) items.push(`- ${title}`);
          return "";
        });
        return items.length ? `\n**Sources**\n${items.join("\n")}\n` : "";
      }
    )
    .replace(/<\/?(?:Sequence|Step|ElicitationsGroup|Elicitation|Sources|Source|Image)\b[^>]*\/?>/gi, "")
    .replace(/<\/?(?:think|thinking|thought|reasoning|zeus_tool|tool_call|function_call)\b[^>]*>/gi, notBackticked(() => ""));
}

export function parseStream(
  rawFull: string,
  extraThink = ""
): ParsedStreamResult {
  const { withoutReasoning, reasoning, thinkOpen } = extractReasoningFromRaw(rawFull, extraThink);
  const full = normalizeStream(stripToolMarkupFromText(withoutReasoning));
  const skipRanges = computeMarkdownCodeSkipRanges(full, true);

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
    if (gt < 0) {
      text += full.slice(s);
      break;
    }
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
      } else {
        text += full.slice(s);
      }
      break;
    }
    const candidate = clean(full.slice(gt + 1, e));
    if (isRealHtmlBlock(candidate, attrs)) {
      blocks.push({ attrs, html: candidate, closed: true });
    } else {
      text += full.slice(s, e + 11);
    }
    i = e + 11;
  }

  const cleanedStray = DisplayText.clean(text.replace(/^\s*(?:``|''|,,)+\s*$/gm, "").trim());
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
  const searched: string[] = [];
  const failed: string[] = [];

  const commandSnippets: string[] = [];
  let lastCommandOutput = "";

  for (const t of tools) {
    if (t.status !== "ok") {
      if (t.status === "error") failed.push(t.name);
      continue;
    }
    const p = parsePath(t);
    if (/^(write_file|write|create_file|save_file)$/.test(t.name) && p) {
      if (!written.includes(p)) written.push(p);
    } else if (/^(edit_file|edit|patch_file|replace_in_file)$/.test(t.name) && p) {
      if (!edited.includes(p)) edited.push(p);
    } else if (/^(delete_file|remove_file|rm|del|unlink)$/.test(t.name) && p) {
      if (!deleted.includes(p)) deleted.push(p);
    } else if (/^(shell|bash|python|python3)$/.test(t.name)) {
      commands.push(t.name);
      try {
        const j = JSON.parse(t.args ?? "{}");
        const cmd = String(j.body || j.command || j.path || "").trim().split("\n")[0]?.slice(0, 72);
        if (cmd && !commandSnippets.includes(cmd)) commandSnippets.push(cmd);
      } catch {
        const rawCmd = (t.args ?? "").trim().split("\n")[0]?.slice(0, 72);
        if (rawCmd && !commandSnippets.includes(rawCmd)) commandSnippets.push(rawCmd);
      }
      if (t.output && !t.output.includes("(no output)")) {
        lastCommandOutput = t.output
          .replace(/\n\n\.\.\.\s*\[Harness²[\s\S]*$/, "")
          .trim()
          .slice(0, 600);
      }
    } else if (/^(read_file|read|cat)$/.test(t.name) && p) {
      if (!read.includes(p)) read.push(p);
    } else if (/^(search_code|grep|rg|search_project|glob|list_dir|list_files)$/.test(t.name)) {
      let q = p;
      if (!q) {
        try {
          const j = JSON.parse(t.args ?? "{}");
          q = String(j.query || j.pattern || j.body || "").trim().slice(0, 48);
        } catch {
          q = (t.args ?? "").trim().slice(0, 48);
        }
      }
      const label = q || ".";
      if (!searched.includes(label)) searched.push(label);
    }
  }

  const parts: string[] = [];
  if (written.length) parts.push(`Created ${written.map((f) => `\`${f}\``).join(", ")}`);
  if (edited.length) parts.push(`Updated ${edited.map((f) => `\`${f}\``).join(", ")}`);
  if (deleted.length) parts.push(`Deleted ${deleted.map((f) => `\`${f}\``).join(", ")}`);
  if (!parts.length && commands.length) {
    const cmdList = commandSnippets.slice(-3).map((c) => `\`${c}\``).join(", ");
    parts.push(
      `Executed ${commands.length} workspace command${commands.length > 1 ? "s" : ""}${cmdList ? ` (${cmdList})` : ""}`
    );
  }
  if (!parts.length && read.length) {
    parts.push(`Inspected ${read.map((f) => `\`${f}\``).join(", ")}`);
  }
  if (!parts.length && searched.length) {
    parts.push(`Searched ${searched.slice(-3).map((q) => `\`${q}\``).join(", ")}`);
  }
  if (!parts.length && failed.length) {
    parts.push(
      `${failed.length} tool call${failed.length > 1 ? "s" : ""} failed (${failed.slice(-3).map((f) => `\`${f}\``).join(", ")})`
    );
  }
  if (!parts.length) return "";
  const headline = `${parts.join(" and ")}.`;
  if (!written.length && !edited.length && !deleted.length && lastCommandOutput) {
    return `${headline}\n\n\`\`\`text\n${lastCommandOutput}\n\`\`\``;
  }
  return headline;
}
