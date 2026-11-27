// Stormy (Oro / Orobi) Core Agent System Replica & Desktop Upgrade for ZeusDesigns.
import { activeConv, uid, useStore } from "../store";
import { DEVICE_SIZE, type AgentPlan, type PendingApproval, type PendingUserQuestion, type ToolCall } from "../types";
import { nativeAudit, readWorkspaceFile, type Workspace } from "./bridge";
import { formatFingerprintMarkdown, verifyModelAuthenticity } from "./lmFingerprint";
import {
  ARG_ALIASES,
  computeFastDiff,
  NAME_ALIASES,
  STORMY_TOOLS_LIST,
  type ComputedDiff,
  type DiffLine,
  type StormyToolSpec,
} from "./stormyTools";

export type { StormyToolSpec, DiffLine, ComputedDiff };

/* ------------------------------------------------------------------ */
/* 1. ToolAliases (Stormy ToolAliases.kt)                              */
/* ------------------------------------------------------------------ */
export const ToolAliases = {
  canonicalName(name: string): string {
    const clean = name.trim().toLowerCase().split(".").pop() ?? name.trim().toLowerCase();
    return NAME_ALIASES[clean] ?? clean;
  },

  normalise(name: string, args: Record<string, unknown>): { name: string; args: Record<string, unknown> } {
    const raw = name.trim().toLowerCase();
    const canonical = ToolAliases.canonicalName(name);
    const renames = ARG_ALIASES[canonical] ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      const target = renames[k] ?? k;
      if (target !== k && target in args) continue;
      out[target] = v;
    }
    if (canonical === "read_file" && !("limit" in out)) {
      const endRaw = args.line_end ?? args.end_line ?? args.end;
      const end = typeof endRaw === "number" ? endRaw : Number(endRaw);
      const start = typeof out.offset === "number" ? out.offset : Number(out.offset) || 1;
      if (!Number.isNaN(end) && end >= start) {
        out.limit = end - start + 1;
      }
      delete out.line_end;
      delete out.end_line;
      delete out.end;
    }
    if (raw === "search_files" && !("literal" in out)) {
      out.literal = true;
      if (!("ignore_case" in out)) out.ignore_case = true;
    }
    return { name: canonical, args: out };
  },
};

/* ------------------------------------------------------------------ */
/* 2. AgentTools & TextToolProtocol (Stormy AgentTools.kt)             */
/* ------------------------------------------------------------------ */
export const STORMY_TOOLS: StormyToolSpec[] = STORMY_TOOLS_LIST;

export const TextToolProtocol = {
  render(wholeFiles = true): string {
    const lines = [
      "## Calling Tools (Zeus XML Protocol)",
      "Emit `<zeus_tool name=\"TOOL_NAME\" path=\"...\">...</zeus_tool>` blocks in your final response:",
      "",
      "Rules:",
      "- Values are raw text, exactly as they should be saved: never escape quotes or newlines.",
      "- File contents go in full — never `...` or `rest unchanged`.",
      "- Several calls may go in one reply; they run in dependency order after your stream completes (parallel reads, ordered writes).",
      "- After your last call, STOP. Never write a `<tool_result>` yourself and never claim a tool ran before you have its result.",
      wholeFiles
        ? "- Write each file whole in one `write_file` call, however long. Never stop halfway through a call."
        : "- For a very long file: write the first part with `write_file`, then add the rest with `write_file` and `append=true`.",
      "- When the task is done, reply with a short summary and no tool call.",
      "",
      "Available Tools (`?` = optional):",
      ...STORMY_TOOLS.map((t) => `- \`${t.signature}\` — ${t.summary}`),
    ];
    return lines.join("\n");
  },

  formatCall(name: string, argsJson: string): string {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(argsJson || "{}");
    } catch {
      parsed = { body: argsJson };
    }
    const path = typeof parsed.path === "string" ? parsed.path : "";
    const body =
      typeof parsed.body === "string"
        ? parsed.body
        : typeof parsed.content === "string"
        ? parsed.content
        : typeof parsed.command === "string"
        ? parsed.command
        : typeof parsed.script === "string"
        ? parsed.script
        : JSON.stringify(parsed);
    return `<zeus_tool name="${name}"${path ? ` path="${path}"` : ""}>${body}</zeus_tool>`;
  },

  activityLabel(name: string, subject?: string): string {
    const cleanSub = subject?.trim().split("\n")[0]?.trim() ?? "";
    const shortSub = cleanSub.length > 40 ? `...${cleanSub.slice(-39)}` : cleanSub;
    const canon = ToolAliases.canonicalName(name);
    const verbMap: Record<string, string> = {
      read_file: "Reading",
      write_file: "Writing",
      edit_file: "Editing",
      multi_edit: "Editing",
      list_files: "Listing",
      glob: "Matching",
      grep: "Grepping for",
      search_project: "Searching project",
      delete_file: "Deleting",
      move_file: "Moving",
      check_syntax: shortSub ? "Checking" : "Reviewing the project",
      use_skill: "Studying skill",
      docs_lookup: "Checking docs",
      web_fetch: "Fetching",
      run_command: "Running",
      python: "Running Python",
      memory_save: "Remembering",
      memory_search: "Recalling",
      spawn_subagent: "Delegating",
      update_plan: "Planning",
      ask_user: "Waiting for your answer",
    };
    const verb = verbMap[canon] ?? `Running ${name.replace(/_/g, " ")}`;
    if (canon === "check_syntax" && !shortSub) return verb;
    if (canon === "ask_user") return verb;
    return shortSub ? `${verb} ${shortSub}` : verb;
  },
};

/* ------------------------------------------------------------------ */
/* 3. ModelProfiles (Stormy ModelProfiles.kt)                          */
/* ------------------------------------------------------------------ */
export interface StormyModelProfile {
  name: "mercury" | "fast" | "frontier" | "community" | "default";
  wholeFiles: boolean;
  qualityPasses: number;
  previewEachRound: boolean;
  visualFinalCheck: boolean;
  idleTimeoutMs: number;
  streamPushMs: number;
  maxOutputTokens?: number;
  contextBudgetTokens: number;
  inlineProjectChars: number;
  promptSection: string;
}

export const ModelProfiles = {
  MERCURY: {
    name: "mercury",
    wholeFiles: true,
    qualityPasses: 1,
    previewEachRound: true,
    visualFinalCheck: true,
    idleTimeoutMs: 90_000,
    streamPushMs: 40,
    maxOutputTokens: 32_768,
    contextBudgetTokens: 128_000,
    inlineProjectChars: 12_000,
    promptSection: `# Working at your speed (Stormy Mercury Profile)
You write very fast and your output limit is large. Work in few, complete replies:
- Start a build or multi-file change with one reply that states the plan briefly and then contains every \`write_file\` or \`edit_file\` call needed. Write each file whole in ONE \`write_file\` call, without placeholders.
- Batch independent reads or edits into a single turn.`,
  } satisfies StormyModelProfile,

  FAST: {
    name: "fast",
    wholeFiles: false,
    qualityPasses: 1,
    previewEachRound: true,
    visualFinalCheck: true,
    idleTimeoutMs: 90_000,
    streamPushMs: 50,
    contextBudgetTokens: 128_000,
    inlineProjectChars: 0,
    promptSection: "",
  } satisfies StormyModelProfile,

  FRONTIER: {
    name: "frontier",
    wholeFiles: true,
    qualityPasses: 1,
    previewEachRound: true,
    visualFinalCheck: true,
    idleTimeoutMs: 150_000,
    streamPushMs: 60,
    contextBudgetTokens: 256_000,
    inlineProjectChars: 12_000,
    promptSection: `# Long files & complete turns (Stormy Frontier Profile)
Your output limit is large: write each file whole in one \`write_file\` call, and batch independent reads or edits into a single turn.`,
  } satisfies StormyModelProfile,

  COMMUNITY: {
    name: "community",
    wholeFiles: true,
    qualityPasses: 1,
    previewEachRound: false,
    visualFinalCheck: true,
    idleTimeoutMs: 120_000,
    streamPushMs: 70,
    contextBudgetTokens: 128_000,
    inlineProjectChars: 0,
    promptSection: "",
  } satisfies StormyModelProfile,

  DEFAULT: {
    name: "default",
    wholeFiles: false,
    qualityPasses: 1,
    previewEachRound: false,
    visualFinalCheck: true,
    idleTimeoutMs: 150_000,
    streamPushMs: 80,
    contextBudgetTokens: 128_000,
    inlineProjectChars: 0,
    promptSection: "",
  } satisfies StormyModelProfile,

  forIds(providerId: string, modelId: string): StormyModelProfile {
    const p = providerId.toLowerCase();
    const m = modelId.toLowerCase();
    if (p === "mercury3" || m.includes("mercury")) return ModelProfiles.MERCURY;
    if (
      /claude-(opus|sonnet)|gpt-(5|6|\d\d)|^o[34]|gemini-(2\.5|[3-9])|grok-[4-9]|deepseek-(v[34]|r1)|qwen[34].*max|kimi-k(2|3)|glm-[45]|minimax-m[23]|agnes/i.test(
        m
      )
    ) {
      return ModelProfiles.FRONTIER;
    }
    if (/chatjimmy|groq|cerebras|flash|instant/i.test(`${p} ${m}`)) {
      return ModelProfiles.FAST;
    }
    return ModelProfiles.COMMUNITY;
  },
};

/* ------------------------------------------------------------------ */
/* 4. ToolBatch (Stormy ToolBatch.kt — Dependency-Ordered Execution)   */
/* ------------------------------------------------------------------ */
export interface ToolAccess {
  reads: Set<string>;
  writes: Set<string>;
  barrier: boolean;
}

const BARRIER_TOOLS = new Set(["ask_user", "request_approval", "run_command", "python", "open_pull_request"]);
const WRITE_PATH_KEYS: Record<string, string[]> = {
  write_file: ["path"],
  edit_file: ["path"],
  multi_edit: ["path"],
  delete_file: ["path"],
  move_file: ["source", "destination"],
};
const SCOPED_READ_TOOLS = new Set(["read_file", "list_files", "glob", "grep"]);
const READ_ONLY_TOOLS = new Set([
  "read_file",
  "list_files",
  "glob",
  "grep",
  "check_syntax",
  "web_fetch",
  "use_skill",
  "search_project",
  "docs_lookup",
  "memory_search",
  "update_plan",
]);

export function normaliseBatchPath(raw: string): string {
  const path = raw.trim().replace(/\\/g, "/");
  if (path.startsWith("/")) return "";
  const segments: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (segments.length === 0) return "";
      segments.pop();
    } else {
      segments.push(seg.toLowerCase());
    }
  }
  return segments.join("/");
}

function pathsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === "" || y === "" || x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)) return true;
    }
  }
  return false;
}

export function mustWaitForAccess(later: ToolAccess, earlier: ToolAccess): boolean {
  return (
    later.barrier ||
    earlier.barrier ||
    pathsOverlap(earlier.writes, later.reads) ||
    pathsOverlap(earlier.writes, later.writes) ||
    pathsOverlap(earlier.reads, later.writes)
  );
}

export function classifyToolAccess(call: { name: string; args?: string }): ToolAccess {
  const canon = ToolAliases.canonicalName(call.name);
  if (BARRIER_TOOLS.has(canon) || call.name.startsWith("mcp:")) {
    return { reads: new Set(), writes: new Set(), barrier: true };
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(call.args ?? "{}");
  } catch {
    parsed = {};
  }
  const { args } = ToolAliases.normalise(call.name, parsed);
  if (canon in WRITE_PATH_KEYS) {
    const keys = WRITE_PATH_KEYS[canon];
    const normPaths = keys.map((k) => (typeof args[k] === "string" ? normaliseBatchPath(args[k] as string) : ""));
    if (normPaths.some((p) => !p)) {
      return { reads: new Set(), writes: new Set(), barrier: true };
    }
    return { reads: new Set(), writes: new Set(normPaths), barrier: false };
  }
  if (SCOPED_READ_TOOLS.has(canon)) {
    const p = typeof args.path === "string" ? normaliseBatchPath(args.path) : "";
    const extra = Array.isArray(args.paths)
      ? args.paths.filter((x): x is string => typeof x === "string").map(normaliseBatchPath)
      : [];
    const reads = new Set([p, ...extra]);
    return { reads: reads.size ? reads : new Set([""]), writes: new Set(), barrier: false };
  }
  if (READ_ONLY_TOOLS.has(canon)) {
    return { reads: new Set([""]), writes: new Set(), barrier: false };
  }
  return { reads: new Set(), writes: new Set(), barrier: true };
}

export function computeToolBatchWaves<T extends { name: string; args?: string }>(
  calls: T[],
  maxParallel = 4
): number[][] {
  const accesses = calls.map(classifyToolAccess);
  const waitsFor = accesses.map((acc, j) => {
    const deps: number[] = [];
    for (let i = 0; i < j; i++) {
      if (mustWaitForAccess(acc, accesses[i])) deps.push(i);
    }
    return deps;
  });
  const finished = new Array<boolean>(calls.length).fill(false);
  const waves: number[][] = [];
  let done = 0;
  while (done < calls.length) {
    const ready: number[] = [];
    for (let i = 0; i < calls.length; i++) {
      if (ready.length >= maxParallel) break;
      if (!finished[i] && waitsFor[i].every((d) => finished[d])) {
        ready.push(i);
      }
    }
    if (ready.length === 0) break;
    for (const idx of ready) {
      finished[idx] = true;
      done++;
    }
    waves.push(ready);
  }
  return waves;
}

/* ------------------------------------------------------------------ */
/* 5. StuckDetector (Stormy StuckDetector.kt)                          */
/* ------------------------------------------------------------------ */
export interface StuckVerdict {
  note?: string;
  stop?: string;
}

const FILE_CHANGE_TOOLS = new Set(["write_file", "edit_file", "multi_edit", "delete_file", "move_file", "add_ui_kit"]);

export class StuckDetector {
  private failStreak = 0;
  private window: string[] = [];
  private writeEpoch = 0;
  private readonly repeatWindow = 30;
  private readonly stuckNudgeAfter = 3;
  private readonly stuckStopAfter = 8;
  private readonly repeatStopAfter = 6;

  record(calls: ToolCall[]): StuckVerdict {
    if (calls.length === 0) return {};
    const allFailed = calls.every((c) => c.status === "error");
    this.failStreak = allFailed ? this.failStreak + 1 : 0;

    let maxRepeats = 0;
    for (const call of calls) {
      const canon = ToolAliases.canonicalName(call.name);
      const changesFiles = FILE_CHANGE_TOOLS.has(canon);
      const sig = changesFiles
        ? `W|${canon}|${call.args ?? ""}|${call.status === "ok"}`
        : `R|${canon}|${call.args ?? ""}|${call.status}|${(call.output ?? "").slice(0, 240)}|${this.writeEpoch}`;
      if (changesFiles && call.status === "ok") {
        this.writeEpoch++;
      }
      this.window.push(sig);
      while (this.window.length > this.repeatWindow) {
        this.window.shift();
      }
      const count = this.window.filter((x) => x === sig).length;
      if (count > maxRepeats) maxRepeats = count;
    }

    const lastError = [...calls]
      .reverse()
      .find((c) => c.status === "error")
      ?.output?.split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim()
      .slice(0, 160);

    if (this.failStreak >= this.stuckStopAfter) {
      return {
        stop: `Zeus stopped because the last ${this.failStreak} tool rounds all failed${
          lastError ? ` (last error: ${lastError})` : ""
        }. Rephrase the request or switch models and retry.`,
      };
    }
    if (maxRepeats >= this.repeatStopAfter) {
      return { stop: "Zeus stopped because it kept repeating the exact same tool call with the same result." };
    }

    const notes: string[] = [];
    if (this.failStreak >= this.stuckNudgeAfter && this.failStreak % this.stuckNudgeAfter === 0) {
      notes.push(
        `[Zeus: your last ${this.failStreak} tool rounds all failed. Do not repeat what failed: re-read the exact current text of the files involved, inspect the error above carefully, and try a different, smaller step.]`
      );
    }
    if (maxRepeats >= 3) {
      notes.push(
        `[Zeus: you have made this exact same call with the same result ${maxRepeats} times recently. It will not change; take a different approach or proceed to the next step.]`
      );
    }
    return notes.length > 0 ? { note: notes.join("\n") } : {};
  }
}

/* ------------------------------------------------------------------ */
/* 6. TokenEstimator, RunLedger & HistoryPruner (Stormy)               */
/* ------------------------------------------------------------------ */
export const TokenEstimator = {
  estimateText(text?: string | null): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  },
  estimateMessage(msg: { role: string; content: string }): number {
    return 4 + TokenEstimator.estimateText(msg.content);
  },
  estimateMessages(msgs: Array<{ role: string; content: string }>): number {
    return msgs.reduce((sum, m) => sum + TokenEstimator.estimateMessage(m), 0);
  },
};

export const RunLedger = {
  MAX_CHARS: 3_000,

  summarize(dropped: Array<{ role: string; content: string }>): string {
    const changed = new Map<string, Set<string>>();
    const read = new Set<string>();
    const ran = new Set<string>();
    const failures: string[] = [];
    let steps = 0;

    for (const m of dropped) {
      if (m.role === "assistant") {
        steps++;
        for (const match of m.content.matchAll(/<zeus_tool\s+name="([^"]+)"(?:\s+path="([^"]*)")?[^>]*>/gi)) {
          const name = ToolAliases.canonicalName(match[1]);
          const path = (match[2] ?? "").trim();
          if (["write_file", "edit_file", "multi_edit", "delete_file", "move_file"].includes(name) && path) {
            const set = changed.get(path) ?? new Set<string>();
            set.add(name.replace("_file", ""));
            changed.set(path, set);
          } else if (["read_file", "list_files", "glob", "grep", "search_project"].includes(name) && path) {
            read.add(path);
          } else {
            ran.add(name);
          }
        }
        for (const match of m.content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)) {
          try {
            const j = JSON.parse(match[1]);
            const name = ToolAliases.canonicalName(String(j.name ?? ""));
            const args = (j.arguments ?? {}) as Record<string, unknown>;
            const path = String(args.path ?? args.file ?? "").trim();
            if (!name) continue;
            if (["write_file", "edit_file", "multi_edit", "delete_file", "move_file"].includes(name) && path) {
              const set = changed.get(path) ?? new Set<string>();
              set.add(name.replace("_file", ""));
              changed.set(path, set);
            } else if (["read_file", "list_files", "glob", "grep", "search_project"].includes(name) && path) {
              read.add(path);
            } else {
              ran.add(name);
            }
          } catch {
            /* ignore malformed tool_call */
          }
        }
      } else if (m.role === "user" && m.content.includes('ok="false"')) {
        const errMatch = /<tool_result\s+name="([^"]+)"\s+ok="false">\s*([^\n<]+)/i.exec(m.content);
        if (errMatch) {
          failures.push(`${errMatch[1]}: ${errMatch[2].trim().slice(0, 90)}`);
        }
      }
    }

    const parts: string[] = [`[Earlier in this run (${steps} step${steps === 1 ? "" : "s"} folded into RunLedger):`];
    if (changed.size > 0) {
      const items = [...changed.entries()].slice(0, 15).map(([p, verbs]) => `${p} (${[...verbs].join("+")})`);
      parts.push(`- Changed files: ${items.join(", ")}`);
    }
    if (read.size > 0) parts.push(`- Read/searched: ${[...read].slice(0, 15).join(", ")}`);
    if (ran.size > 0) parts.push(`- Executed tools: ${[...ran].slice(0, 10).join(", ")}`);
    if (failures.length > 0) parts.push(`- Resolved earlier errors: ${failures.slice(-3).join("; ")}`);
    parts.push("Continue from the newest steps below; re-read a file before editing it if needed.]");
    return parts.join("\n").slice(0, RunLedger.MAX_CHARS);
  },
};

export const HistoryPruner = {
  PRUNED_TOOL_OUTPUT: "[Earlier tool output removed to save context. Run the tool again if you need it.]",
  PROTECT_RECENT_TOKENS: 48_000,
  LARGE_ARGUMENT_CHARS: 3_000,

  prune<T extends { role: "user" | "assistant"; content: string }>(messages: T[], budgetTokens = 128_000): T[] {
    if (TokenEstimator.estimateMessages(messages) <= budgetTokens) return messages;

    let tailTokens = 0;
    let protectFrom = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      tailTokens += TokenEstimator.estimateMessage(messages[i]);
      protectFrom = i;
      if (tailTokens >= HistoryPruner.PROTECT_RECENT_TOKENS) break;
    }

    const shrunk = messages.map((m, idx) => {
      if (idx >= protectFrom) return m;
      let content = m.content;
      if (m.role === "user" && content.includes("<tool_result")) {
        content = content.replace(
          /(<tool_result\b[^>]*>)([\s\S]*?)(<\/tool_result>)/gi,
          (_all, openTag: string, body: string, closeTag: string) =>
            body.length > 1200 ? `${openTag}\n${HistoryPruner.PRUNED_TOOL_OUTPUT}\n${closeTag}` : _all
        );
      } else if (m.role === "assistant" && content.length > HistoryPruner.LARGE_ARGUMENT_CHARS) {
        content = content
          .replace(
            /(<zeus_tool\s+name="(?:write_file|edit_file)"[^>]*>)([\s\S]*?)(<\/zeus_tool>)/gi,
            (_all, openTag: string, body: string, closeTag: string) =>
              body.length > HistoryPruner.LARGE_ARGUMENT_CHARS
                ? `${openTag}[file content omitted (${body.split("\n").length} lines)]${closeTag}`
                : _all
          )
          .replace(
            /(<tool_call>)([\s\S]*?)(<\/tool_call>)/gi,
            (all, openTag: string, body: string, closeTag: string) => {
              if (body.length <= HistoryPruner.LARGE_ARGUMENT_CHARS) return all;
              try {
                const j = JSON.parse(body);
                const name = ToolAliases.canonicalName(String(j.name ?? ""));
                if (name === "write_file" || name === "edit_file" || name === "multi_edit") {
                  const args = (j.arguments ?? {}) as Record<string, unknown>;
                  const path = String(args.path ?? args.file ?? "");
                  return `${openTag}${JSON.stringify({
                    name: j.name,
                    arguments: { path, note: `[file content omitted (${body.split("\n").length} lines)]` },
                  })}${closeTag}`;
                }
              } catch {
                /* keep original */
              }
              return all;
            }
          );
      }
      return content === m.content ? m : { ...m, content };
    });

    if (TokenEstimator.estimateMessages(shrunk) <= budgetTokens || shrunk.length <= 8) {
      return shrunk;
    }

    const foldEnd = Math.max(2, Math.min(shrunk.length - 6, protectFrom));
    if (foldEnd <= 2) return shrunk;
    const dropped = messages.slice(1, foldEnd);
    const ledger = RunLedger.summarize(dropped);
    const first = { ...shrunk[0], content: `${shrunk[0].content.trimEnd()}\n\n${ledger}` };
    return [first, ...shrunk.slice(foldEnd)];
  },
};

/* ------------------------------------------------------------------ */
/* 7. BriefCheck (Stormy BriefCheck.kt)                                */
/* ------------------------------------------------------------------ */
export type BriefFacet = "NAME" | "PURPOSE" | "AUDIENCE" | "SCOPE" | "LOOK" | "DATA";

const FACET_PHRASE: Record<BriefFacet, string> = {
  NAME: "its name or brand",
  PURPOSE: "what it is mainly for",
  AUDIENCE: "who it is for",
  SCOPE: "the must-have pages or features",
  LOOK: "the look and feel",
  DATA: "what data or state it must persist",
};

export interface BriefVerdict {
  vague: boolean;
  missing: BriefFacet[];
  kind?: "SITE" | "APP";
  reason: string;
}

const OPT_OUT_RE = /\b(you decide|just build|surprise me|don'?t ask|no questions|whatever you think)\b/i;
const EDIT_RE = /\b(fix|bug|edit|update|change|refactor|remove|delete|rename|test|lint|check|explain|read|search|grep|git|commit|push|pull)\b/i;
const SELF_EXPLANATORY_RE = /\b(snake|tetris|pong|tic[- ]?tac[- ]?toe|calculator|stopwatch|pomodoro|todo list|flappy|2048|minesweeper|chess|clock|weather)\b/i;
const BUILD_SITE_RE = /\b(website|landing page|homepage|home page|portfolio|site|blog|storefront)\b/i;
const BUILD_APP_RE = /\b(web ?app|dashboard|application|tracker|manager|platform|tool|portal|crm)\b/i;

export const BriefCheck = {
  check(request: string, projectFresh: boolean): BriefVerdict {
    const text = request.trim();
    if (!text) return { vague: false, missing: [], reason: "empty" };
    if (!projectFresh) return { vague: false, missing: [], reason: "project already has files" };
    const lower = text.toLowerCase();
    if (OPT_OUT_RE.test(lower)) return { vague: false, missing: [], reason: "user opted out of questions" };
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words > 38) return { vague: false, missing: [], reason: "detailed request" };
    if (text.endsWith("?") || /^(what|how|why|where|when|who|can you explain)\b/i.test(lower)) {
      return { vague: false, missing: [], reason: "question" };
    }
    if (EDIT_RE.test(lower)) return { vague: false, missing: [], reason: "edit or engineering task" };
    if (SELF_EXPLANATORY_RE.test(lower)) return { vague: false, missing: [], reason: "self-explanatory app" };

    const kind: "SITE" | "APP" | undefined = BUILD_SITE_RE.test(lower)
      ? "SITE"
      : BUILD_APP_RE.test(lower)
      ? "APP"
      : undefined;
    if (!kind) return { vague: false, missing: [], reason: "not a vague greenfield build" };

    const present = new Set<BriefFacet>();
    if (/["“”'‘’][A-Z][\w\s-]{1,24}["“”'‘’]|\bcalled\s+[A-Z]|\bnamed\s+[A-Z]/.test(text)) present.add("NAME");
    if (/\bfor\s+(my|a|an|our|local|small|indie|b2b|freelance|students|developers|customers|teams)\b/i.test(lower)) {
      present.add("AUDIENCE");
      present.add("PURPOSE");
    }
    if (/\b(with|including|features?|sections?|pages?|tabs?|chart|table|auth|login|cart|booking)\b/i.test(lower)) present.add("SCOPE");
    if (/\b(dark|light|minimal|brutalist|editorial|warm|monochrome|material|fluent|hig|retro|modern)\b/i.test(lower)) present.add("LOOK");
    if (/\b(localstorage|sqlite|database|save|export|json|sync|accounts?)\b/i.test(lower)) present.add("DATA");

    const vague = present.size === 0 ? true : present.size === 1 ? words <= 22 : present.size === 2 ? words <= 12 : false;
    if (!vague) return { vague: false, missing: [], kind, reason: "sufficient detail" };

    const order: BriefFacet[] =
      kind === "SITE" ? ["NAME", "PURPOSE", "LOOK", "SCOPE", "AUDIENCE"] : ["PURPOSE", "SCOPE", "DATA", "LOOK", "AUDIENCE"];
    const missing = order.filter((f) => !present.has(f)).slice(0, 3);
    return { vague: true, missing, kind, reason: `vague (${words} words)` };
  },

  note(verdict: BriefVerdict, askBeforeBuilding = false): string | null {
    if (!verdict.vague) return null;
    const topics = verdict.missing.map((f) => FACET_PHRASE[f]).join(", ");
    if (!askBeforeBuilding) {
      return `[Zeus BriefCheck: This request is brief and "Ask before building" is off. Decide the specifics yourself (${topics}), keep them realistic and cohesive, state your choices in one concise line, and build the complete deliverable immediately.]`;
    }
    return `[Zeus BriefCheck: Before building this new ${
      verdict.kind === "SITE" ? "site" : "app"
    }, call \`ask_user\` once with 2-3 short, request-specific questions covering ${topics} (each with 2-4 options, marking the recommended option first). Wait for the user's answer before writing files.]`;
  },
};

/* ------------------------------------------------------------------ */
/* 8. ProjectInstructions & ProjectSnapshot (Stormy Context)           */
/* ------------------------------------------------------------------ */
export const ProjectInstructions = {
  FILE_NAMES: ["ORO.md", "AGENTS.md", "CLAUDE.md", ".zeusdesigns/instructions.md", ".oro/instructions.md"],
  MAX_CHARS: 12_000,

  async load(ws?: Workspace | null): Promise<string> {
    if (!ws) return "";
    const sections: string[] = [];
    let budget = ProjectInstructions.MAX_CHARS;
    for (const name of ProjectInstructions.FILE_NAMES) {
      if (budget <= 0) break;
      const topHit = ws.tree.some((n) => !n.dir && n.name.toLowerCase() === name.toLowerCase());
      if (!topHit && !name.includes("/")) continue;
      try {
        const text = await readWorkspaceFile(ws, name);
        const trimmed = (text ?? "").trim();
        if (!trimmed) continue;
        const part = trimmed.length > budget ? `${trimmed.slice(0, budget)}\n[... truncated]` : trimmed;
        sections.push(`## From ${name}\n${part}`);
        budget -= part.length;
      } catch {
        /* ignore missing file */
      }
    }
    if (!sections.length) return "";
    return `# Project instructions\nThe project's own standing instructions. Follow them; they override general defaults when they conflict, but never the user's explicit request.\n\n${sections.join("\n\n")}`;
  },
};

const SNAPSHOT_TEXT_EXT = /\.(html?|css|scss|js|mjs|cjs|ts|tsx|jsx|json|md|txt|svg|xml|vue|svelte|py|rs|toml|ya?ml)$/i;
const SNAPSHOT_LOCK_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "cargo.lock"]);

export const ProjectSnapshot = {
  async inline(ws?: Workspace | null, budgetChars = 12_000): Promise<string> {
    const cappedBudget = Math.min(budgetChars, 16_000);
    if (!ws || cappedBudget <= 0 || !ws.tree.length) return "";
    const flatFiles: string[] = [];
    const collect = (nodes: Workspace["tree"]) => {
      for (const n of nodes) {
        if (flatFiles.length > 10) return;
        if (n.dir) {
          if (n.children?.length) collect(n.children);
        } else if (SNAPSHOT_TEXT_EXT.test(n.name) && !SNAPSHOT_LOCK_FILES.has(n.name.toLowerCase())) {
          flatFiles.push(n.path);
        }
      }
    };
    collect(ws.tree);
    if (flatFiles.length === 0 || flatFiles.length > 8) return "";

    const parts: Array<{ path: string; text: string }> = [];
    let total = 0;
    for (const path of flatFiles) {
      try {
        const text = await readWorkspaceFile(ws, path);
        if (!text || text.length > 8_000 || text.includes("\u0000")) return "";
        total += text.length;
        if (total > cappedBudget) return "";
        parts.push({ path, text });
      } catch {
        return "";
      }
    }
    if (parts.length === 0) return "";
    return [
      `# Project files`,
      `Small project snapshot (${parts.length} file${parts.length === 1 ? "" : "s"}). You have already read these files and can edit them directly without calling read_file first.`,
      ...parts.map((p) => `\n## ${p.path}\n\`\`\`\n${p.text}\n\`\`\``),
    ].join("\n");
  },
};

/* ------------------------------------------------------------------ */
/* 9. DiffUtils (Stormy DiffUtils.kt — Unified Diff & +/- Counts)      */
/* ------------------------------------------------------------------ */
export const DiffUtils = {
  computeDiff: computeFastDiff,
};

import { parseApprovalPayload, parseAskUserPayload, parsePlanPayload } from "./stormyTools";

/* ------------------------------------------------------------------ */
/* 10. Plan & AskUser Parsers (Stormy PlanTimeline & AskUserCard)      */
/* ------------------------------------------------------------------ */
export function parsePlanFromToolCall(argsOrOutput: string): AgentPlan | null {
  return parsePlanPayload(argsOrOutput);
}

export function parseAskUserFromToolCall(toolId: string, argsOrOutput: string): PendingUserQuestion | null {
  return parseAskUserPayload(toolId, argsOrOutput);
}

/* ------------------------------------------------------------------ */
/* 11. AutonomyPolicy & ApprovalSheet (Stormy Autonomy.kt)             */
/* ------------------------------------------------------------------ */
const MUTATING_TOOLS = new Set([
  "write_file",
  "edit_file",
  "multi_edit",
  "delete_file",
  "move_file",
  "copy_file",
  "insert_at_line",
  "append_to_file",
  "prepend_to_file",
  "regex_replace",
  "add_ui_kit",
]);

const SENSITIVE_FILE_RE = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|jks|keystore)|id_rsa.*|\.npmrc|\.git\/.*)$/i;
const RISKY_MCP_RE = /delete|drop|remove|destroy|merge|push|deploy|execute|sql|transfer|revoke|archive/i;

export const AutonomyPolicy = {
  isChange(toolName: string): boolean {
    const n = ToolAliases.canonicalName(toolName);
    return MUTATING_TOOLS.has(n) || n === "open_pull_request" || toolName.startsWith("mcp:");
  },

  dangerReason(toolName: string, argsRaw = ""): string | undefined {
    const n = ToolAliases.canonicalName(toolName);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(argsRaw || "{}");
    } catch {
      parsed = { body: argsRaw };
    }
    const path = String(parsed.path ?? parsed.source ?? "").trim();
    const dest = String(parsed.destination ?? "").trim();
    if (n === "delete_file" && (!path || path === "." || path === "/")) {
      return "Delete the whole project";
    }
    if (n === "open_pull_request") {
      return `Open a pull request${parsed.repo ? ` (${String(parsed.repo)})` : ""}`;
    }
    if (n === "move_file" && String(parsed.overwrite) === "true" && dest) {
      return `Overwrite existing file ${dest}`;
    }
    if (MUTATING_TOOLS.has(n) && (SENSITIVE_FILE_RE.test(path) || SENSITIVE_FILE_RE.test(dest))) {
      return `Modify sensitive file (${path || dest})`;
    }
    if (toolName.startsWith("mcp:") && RISKY_MCP_RE.test(toolName)) {
      return `Run external MCP action ${toolName}`;
    }
    return undefined;
  },

  describe(toolName: string, argsRaw = ""): { action: string; detail?: string } {
    const n = ToolAliases.canonicalName(toolName);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(argsRaw || "{}");
    } catch {
      parsed = { body: argsRaw };
    }
    const path = String(parsed.path ?? "").trim();
    const body = String(parsed.body ?? parsed.content ?? "").trim();
    switch (n) {
      case "write_file":
        return {
          action: `${parsed.append ? "Append to" : "Write"} ${path || "file"}`,
          detail: body.split("\n").slice(0, 14).join("\n").slice(0, 900) || undefined,
        };
      case "edit_file":
      case "multi_edit":
        return { action: `Edit ${path || "file"}`, detail: body.slice(0, 800) || undefined };
      case "delete_file":
        return { action: `Delete ${path || body || "file"}` };
      case "move_file":
        return { action: `Move ${String(parsed.source ?? path)} to ${String(parsed.destination ?? body)}` };
      case "copy_file":
        return { action: `Copy ${String(parsed.source ?? path)} to ${String(parsed.destination ?? body)}` };
      default:
        return {
          action: String(parsed.action ?? parsed.title ?? `${n} ${path}`.trim()),
          detail: String(parsed.detail ?? parsed.reason ?? body).slice(0, 600) || undefined,
        };
    }
  },
};

export function parseApprovalFromToolCall(toolId: string, toolName: string, argsOrOutput = ""): PendingApproval | null {
  const desc = AutonomyPolicy.describe(toolName, argsOrOutput);
  const danger = AutonomyPolicy.dangerReason(toolName, argsOrOutput);
  return parseApprovalPayload(toolId, toolName, argsOrOutput, desc, danger);
}

/* ------------------------------------------------------------------ */
/* 12. QualityGate (Stormy QualityGate.kt — End-of-Turn Auto Review)   */
/* ------------------------------------------------------------------ */
export const QualityGate = {
  MAX_LISTED: 12,

  touchedPaths(calls: ToolCall[]): string[] {
    const paths = new Set<string>();
    for (const c of calls) {
      if (c.status !== "ok") continue;
      const canon = ToolAliases.canonicalName(c.name);
      if (canon === "add_ui_kit") continue;
      if (MUTATING_TOOLS.has(canon)) {
        try {
          const j = JSON.parse(c.args ?? "{}");
          for (const k of ["path", "destination"]) {
            const p = typeof j[k] === "string" ? j[k].trim().replace(/^\.\//, "").replace(/^\/+/, "") : "";
            if (p && !p.startsWith(".zeusdesigns/")) paths.add(p);
          }
        } catch {
          /* ignore */
        }
      }
    }
    return [...paths];
  },

  async review(root: string | undefined, touched: string[]): Promise<{ blocking: string[]; prompt: string | null }> {
    if (!root || touched.length === 0) return { blocking: [], prompt: null };
    try {
      const findings = await nativeAudit.check(root, touched);
      const blocking = findings.filter((f) => f.startsWith("ERROR "));
      if (blocking.length === 0) return { blocking: [], prompt: null };
      const listed = blocking.slice(0, QualityGate.MAX_LISTED).map((b) => `- ${b}`).join("\n");
      const more =
        blocking.length > QualityGate.MAX_LISTED
          ? `\n- ... and ${blocking.length - QualityGate.MAX_LISTED} more (run check_syntax with no path to see all).`
          : "";
      const prompt = [
        `Automatic quality review (Stormy QualityGate) found ${blocking.length} blocking problem${
          blocking.length === 1 ? "" : "s"
        } in the files you changed:`,
        listed + more,
        "",
        "Fix each one now: read the relevant part of the file if needed, make the edit with `edit_file` or `write_file`, then run `check_syntax` to confirm zero errors. When everything is fixed, reply with your final summary for the user.",
      ].join("\n");
      return { blocking, prompt };
    } catch {
      return { blocking: [], prompt: null };
    }
  },
};

import { cleanDisplayText } from "./stormyTools";

/* ------------------------------------------------------------------ */
/* 13. DisplayText (Stormy DisplayText.kt — Escaped Prose Repair)      */
/* ------------------------------------------------------------------ */
export const DisplayText = {
  clean: cleanDisplayText,
};

/* ------------------------------------------------------------------ */
/* 14. Workbench HTML Sync & /verify Slash Command Helper              */
/* ------------------------------------------------------------------ */
export async function syncHtmlFileToWorkbench(relPath: string, convId: string, asstId: string, syncedBoardIds: Set<string>) {
  const cleanRel = relPath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!/\.html?$/i.test(cleanRel)) return;
  const st = useStore.getState();
  const ws = st.ui.workspace;
  if (!ws) return;
  try {
    const htmlContent = await readWorkspaceFile(ws, cleanRel);
    if (!htmlContent || htmlContent.trim().length < 20) return;
    const fileName = cleanRel.split("/").pop() || cleanRel;
    const S = useStore.getState();
    const existing = S.artboards.find(
      (a) =>
        (a.source && a.source.replace(/\\/g, "/").toLowerCase() === cleanRel.toLowerCase()) ||
        a.name.toLowerCase() === fileName.toLowerCase() ||
        a.name.toLowerCase() === cleanRel.toLowerCase()
    );
    let boardId: string;
    if (existing) {
      boardId = existing.id;
      S.reviseArtboard(boardId, htmlContent);
      S.updateArtboard(boardId, { source: cleanRel, loading: false });
    } else {
      const created = S.addArtboard({
        name: fileName,
        device: "web",
        html: htmlContent,
        source: cleanRel,
        w: DEVICE_SIZE.web.w,
        h: DEVICE_SIZE.web.h,
      });
      boardId = created.id;
    }
    syncedBoardIds.add(boardId);
    S.setSel([boardId]);
    S.patchUI({ showCanvas: true });
    const msg = activeConv(useStore.getState()).messages.find((m) => m.id === asstId);
    const mergedIds = [...new Set([...(msg?.artboardIds ?? []), ...syncedBoardIds])];
    useStore.getState().patchMessage(convId, asstId, { artboardIds: mergedIds });
  } catch {
    /* ignore if file not readable */
  }
}

export async function runVerifySlashCommand(rawText: string): Promise<boolean> {
  const verifyMatch = /^\/(?:verify|fingerprint|lmfingerprint)(?:\s+([\w./:-]+))?$/i.exec(rawText.trim());
  if (!verifyMatch) return false;
  const st = useStore.getState();
  const arg = verifyMatch[1]?.trim() ?? "";
  const [targetProv, targetModel] = arg.includes("/")
    ? arg.split("/", 2)
    : [st.settings.providerId, arg || st.settings.modelId];
  const convId = st.activeConvId;
  const asstId = uid();
  const toolId = uid();
  st.addMessage(convId, { id: uid(), role: "user", text: rawText.trim(), at: Date.now() });
  st.addMessage(convId, {
    id: asstId,
    role: "assistant",
    text: "",
    streaming: true,
    model: `${targetProv}/${targetModel}`,
    at: Date.now(),
    tools: [{ id: toolId, name: "lmfingerprint", args: `${targetProv}/${targetModel}`, status: "running" }],
  });
  st.setBusy(true);
  try {
    const rep = await verifyModelAuthenticity(targetProv, targetModel);
    const md = formatFingerprintMarkdown(rep);
    useStore.getState().patchMessage(convId, asstId, {
      text: md,
      streaming: false,
      tools: [
        {
          id: toolId,
          name: "lmfingerprint",
          args: `${rep.provider}/${rep.requestedModel} -> ${rep.verdict}`,
          status: "ok",
          output: `${rep.verdictLabel}\nEndpoint: ${rep.upstreamEndpoint}\nReported model: ${rep.upstreamReportedModel}\nFP: ${rep.fingerprintHash}`,
        },
      ],
      stats: { ms: rep.latencyMs, tokens: Math.max(12, Math.round(md.length / 4)), tps: rep.tokensPerSec },
    });
  } catch (e) {
    useStore.getState().patchMessage(convId, asstId, {
      text: "",
      streaming: false,
      error: e instanceof Error ? e.message : "LMFingerprint verification failed",
      tools: [{ id: toolId, name: "lmfingerprint", args: `${targetProv}/${targetModel}`, status: "error", output: String(e) }],
    });
  } finally {
    useStore.getState().setBusy(false);
  }
  return true;
}
