// Stormy (Oro / Orobi) Core Agent System Replica & Desktop Upgrade for ZeusDesigns.
// Ports Stormy's exact architecture:
//   - ToolAliases (canonical tool & argument normalization)
//   - AgentTools & TextToolProtocol (<tool_call><function=NAME><parameter=KEY>raw value</parameter></function></tool_call> + <zeus_tool>)
//   - ToolBatch (dependency-ordered parallel tool execution by read/write path access & barriers)
//   - ModelProfiles (MERCURY, FAST, FRONTIER, COMMUNITY, DEFAULT per-model harness tuning)
//   - StuckDetector (write-epoch-aware repeat window + fail-streak corrective nudges without arbitrary step caps)
//   - TokenEstimator, RunLedger & HistoryPruner (4-stage context pruning + deterministic run ledger folding)
//   - BriefCheck (vague greenfield request detection -> batched ask_user or autonomous decision note)
//   - ProjectInstructions & ProjectSnapshot (ORO.md / AGENTS.md / CLAUDE.md + small project file inlining)
//   - DiffUtils (unified diff computation with +/- counts and context hunks)

import type { AgentPlan, PendingApproval, PendingUserQuestion, PlanTask, ToolCall } from "../types";
import { nativeAudit, readWorkspaceFile, type Workspace } from "./bridge";

/* ------------------------------------------------------------------ */
/* 1. ToolAliases (Stormy ToolAliases.kt)                              */
/* ------------------------------------------------------------------ */
const NAME_ALIASES: Record<string, string> = {
  // craft
  load_skill: "use_skill",
  get_skill: "use_skill",
  read_skill: "use_skill",
  skill: "use_skill",
  audit_project: "check_syntax",
  review_project: "check_syntax",
  lint_project: "check_syntax",
  install_ui_kit: "add_ui_kit",
  // edits
  patch_file: "edit_file",
  str_replace: "edit_file",
  str_replace_editor: "edit_file",
  replace_in_file: "edit_file",
  edit: "edit_file",
  multiedit: "multi_edit",
  multi_edit_file: "multi_edit",
  // reads / writes
  read: "read_file",
  view: "read_file",
  view_file: "read_file",
  cat: "read_file",
  cat_file: "read_file",
  open_file: "read_file",
  read_file_lines: "read_file",
  write: "write_file",
  create_file: "write_file",
  save_file: "write_file",
  overwrite_file: "write_file",
  append_file: "write_file",
  // listing / search
  ls: "list_files",
  list: "list_files",
  list_dir: "list_files",
  dir: "list_files",
  list_directory: "list_files",
  print_tree: "list_files",
  tree: "list_files",
  find_files: "glob",
  search_files: "grep",
  search_code: "grep",
  search: "grep",
  rg: "grep",
  ripgrep: "grep",
  find_in_files: "grep",
  // moves / deletes
  rename_file: "move_file",
  mv: "move_file",
  delete: "delete_file",
  remove_file: "delete_file",
  rm: "delete_file",
  del: "delete_file",
  unlink: "delete_file",
  // misc
  fetch: "web_fetch",
  webfetch: "web_fetch",
  curl: "web_fetch",
  todowrite: "update_plan",
  todo_write: "update_plan",
  ask: "ask_user",
  question: "ask_user",
  bash: "run_command",
  shell: "run_command",
  sh: "run_command",
  cmd: "run_command",
  terminal: "run_command",
  exec: "run_command",
  run: "run_command",
  save_memory: "memory_save",
  recall_memory: "memory_search",
  task: "spawn_subagent",
  subagent: "spawn_subagent",
  cp: "copy_file",
  mkdir: "create_folder",
  create_directory: "create_folder",
  file_info: "get_file_info",
  file_outline: "get_file_info",
  stat: "get_file_info",
  compare_files: "diff_files",
  find_secrets: "security_scan",
  audit_security: "security_scan",
};

const ARG_ALIASES: Record<string, Record<string, string>> = {
  edit_file: {
    old_content: "old_string",
    old_str: "old_string",
    oldString: "old_string",
    old: "old_string",
    search: "old_string",
    find: "old_string",
    new_content: "new_string",
    new_str: "new_string",
    newString: "new_string",
    new: "new_string",
    replace: "new_string",
    replacement: "new_string",
    file_path: "path",
    filepath: "path",
    file: "path",
    filename: "path",
  },
  multi_edit: {
    file_path: "path",
    filepath: "path",
    file: "path",
  },
  read_file: {
    file_path: "path",
    filepath: "path",
    file: "path",
    filename: "path",
    start_line: "offset",
    start: "offset",
    line: "offset",
    line_start: "offset",
  },
  write_file: {
    file_path: "path",
    filepath: "path",
    file: "path",
    filename: "path",
    text: "content",
    contents: "content",
    data: "content",
    body: "content",
  },
  list_files: {
    directory: "path",
    dir: "path",
    folder: "path",
    dir_path: "path",
  },
  glob: {
    glob: "pattern",
    directory: "path",
    dir: "path",
  },
  grep: {
    query: "pattern",
    regex: "pattern",
    search: "pattern",
    file_pattern: "include",
    glob: "include",
    directory: "path",
  },
  move_file: {
    old_path: "source",
    source_path: "source",
    from: "source",
    src: "source",
    new_path: "destination",
    destination_path: "destination",
    to: "destination",
    dest: "destination",
    target: "destination",
  },
  delete_file: {
    file_path: "path",
    file: "path",
  },
  web_fetch: {
    link: "url",
    uri: "url",
    path: "url",
  },
  ask_user: {
    prompt: "question",
    choices: "options",
    message: "question",
  },
  use_skill: {
    skill: "name",
    skill_name: "name",
    topic: "name",
    path: "name",
  },
};

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
export interface StormyToolSpec {
  name: string;
  signature: string;
  summary: string;
  readOnly: boolean;
}

export const STORMY_TOOLS: StormyToolSpec[] = [
  {
    name: "read_file",
    signature: "read_file(path: string, paths?: [string, ...], offset?: int, limit?: int)",
    summary: "Read a text file from the project (numbered \"<line>|<text>\", up to 8 files via paths).",
    readOnly: true,
  },
  {
    name: "list_files",
    signature: "list_files(path?: string, depth?: int, symbols?: boolean)",
    summary: "List files and folders as a tree; with symbols=true adds a one-line symbol outline of each file.",
    readOnly: true,
  },
  {
    name: "glob",
    signature: "glob(pattern: string, path?: string)",
    summary: "Find files by glob pattern (e.g. \"**/*.ts\", \"src/**/*.{js,tsx}\"), most recently modified first.",
    readOnly: true,
  },
  {
    name: "grep",
    signature: "grep(pattern: string, path?: string, include?: string, ignore_case?: boolean, literal?: boolean)",
    summary: "Search file contents with a regular expression or literal string across the project.",
    readOnly: true,
  },
  {
    name: "search_project",
    signature: "search_project(query: string, limit?: int)",
    summary: "On-device BM25 search over 40-line code chunks with camelCase splitting and synonyms.",
    readOnly: true,
  },
  {
    name: "edit_file",
    signature: "edit_file(path: string, old_string: string, new_string: string, replace_all?: boolean)",
    summary: "Replace an exact string in a file (or <<<<<<< SEARCH / ======= / >>>>>>> REPLACE block).",
    readOnly: false,
  },
  {
    name: "multi_edit",
    signature: "multi_edit(path: string, edits: [{old_string: string, new_string: string, replace_all?: boolean}, ...])",
    summary: "Apply several edit_file replacements to one file atomically in order.",
    readOnly: false,
  },
  {
    name: "write_file",
    signature: "write_file(path: string, content: string, append?: boolean)",
    summary: "Create a new file or replace an existing one (parent folders created automatically).",
    readOnly: false,
  },
  {
    name: "move_file",
    signature: "move_file(source: string, destination: string, overwrite?: boolean)",
    summary: "Move or rename a file or folder inside the project.",
    readOnly: false,
  },
  {
    name: "delete_file",
    signature: "delete_file(path: string)",
    summary: "Delete a file or folder from the project.",
    readOnly: false,
  },
  {
    name: "check_syntax",
    signature: "check_syntax(path?: string)",
    summary: "Static syntax and asset audit of a file or the whole project (HTML, CSS, JS/TS, JSON).",
    readOnly: true,
  },
  {
    name: "shell",
    signature: "shell(command: string)",
    summary: "Execute a non-interactive bash/cmd command, ripgrep, git, or test suite in the project root.",
    readOnly: false,
  },
  {
    name: "python",
    signature: "python(script: string)",
    summary: "Execute a Python 3 script via stdin in the project root for data processing or multi-file refactoring.",
    readOnly: false,
  },
  {
    name: "update_plan",
    signature: "update_plan(tasks: [{title: string, state: \"pending\"|\"active\"|\"done\"|\"blocked\"|\"skipped\"}])",
    summary: "Publish or update the live step-by-step plan checklist pinned above the conversation.",
    readOnly: true,
  },
  {
    name: "ask_user",
    signature: "ask_user(questions: [{question: string, header?: string, options?: [{label: string, recommended?: boolean}]}])",
    summary: "Ask the user 1-4 clarifying questions in an interactive card and wait for answers.",
    readOnly: true,
  },
  {
    name: "docs_lookup",
    signature: "docs_lookup(query: string)",
    summary: "Look up HTML, CSS, JavaScript, or TypeScript usage patterns in the built-in offline reference.",
    readOnly: true,
  },
  {
    name: "web_fetch",
    signature: "web_fetch(url: string)",
    summary: "Fetch a public http(s) URL and return its readable text.",
    readOnly: true,
  },
  {
    name: "use_skill",
    signature: "use_skill(name: string)",
    summary: "Load a domain craft or engineering skill playbook on demand.",
    readOnly: true,
  },
  {
    name: "add_ui_kit",
    signature: "add_ui_kit()",
    summary: "Install Stormy's oro-ui/oro.css and oro-ui/oro.js design token & theme kit into the project.",
    readOnly: false,
  },
  {
    name: "spawn_subagent",
    signature: "spawn_subagent(agent_type: \"explore\"|\"review\"|\"verify\", prompt: string)",
    summary: "Delegate bounded codebase exploration or static review to an isolated Stormy subagent.",
    readOnly: true,
  },
  {
    name: "copy_file",
    signature: "copy_file(source: string, destination: string, overwrite?: boolean)",
    summary: "Copy a file inside the project workspace.",
    readOnly: false,
  },
  {
    name: "create_folder",
    signature: "create_folder(path: string)",
    summary: "Create a directory (and any parent directories) inside the project.",
    readOnly: false,
  },
  {
    name: "insert_at_line",
    signature: "insert_at_line(path: string, line: int, content: string)",
    summary: "Insert lines at a 1-indexed line number in a file.",
    readOnly: false,
  },
  {
    name: "get_file_info",
    signature: "get_file_info(path: string)",
    summary: "Return file size and a one-line symbol outline of a file.",
    readOnly: true,
  },
  {
    name: "diff_files",
    signature: "diff_files(path1: string, path2: string)",
    summary: "Compute a unified line diff between two files in the workspace.",
    readOnly: true,
  },
  {
    name: "git_status",
    signature: "git_status()",
    summary: "Inspect current Git branch and modified/staged/untracked files.",
    readOnly: true,
  },
  {
    name: "git_diff",
    signature: "git_diff(path?: string)",
    summary: "Show Git diff for the workspace or a specific file.",
    readOnly: true,
  },
  {
    name: "git_log",
    signature: "git_log()",
    summary: "Show recent Git commit history.",
    readOnly: true,
  },
  {
    name: "security_scan",
    signature: "security_scan(path?: string)",
    summary: "Scan project files for hardcoded secrets, unsafe eval(), or unsanitized innerHTML.",
    readOnly: true,
  },
];

export const TextToolProtocol = {
  render(wholeFiles = true): string {
    const lines = [
      "## Calling Tools (Stormy + Zeus Dual Protocol)",
      "You can call tools using EITHER `<zeus_tool name=\"TOOL_NAME\" path=\"...\">...</zeus_tool>` OR Stormy's raw-parameter `<tool_call>` format:",
      "",
      "<tool_call>",
      "<function=TOOL_NAME>",
      "<parameter=NAME>value</parameter>",
      "</function>",
      "</tool_call>",
      "",
      "Rules:",
      "- Values are raw text, exactly as they should be saved: never escape quotes or newlines.",
      "- File contents go in full — never `...` or `rest unchanged`.",
      "- Several calls may go in one reply; they run in dependency order (parallel reads, ordered writes).",
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
    const lines = [`<tool_call>`, `<function=${name}>`];
    for (const [k, v] of Object.entries(parsed)) {
      if (v === undefined || v === null || v === "") continue;
      const valStr = typeof v === "string" ? v : JSON.stringify(v);
      if (valStr.includes("\n")) {
        lines.push(`<parameter=${k}>\n${valStr}\n</parameter>`);
      } else {
        lines.push(`<parameter=${k}>${valStr}</parameter>`);
      }
    }
    lines.push(`</function>`, `</tool_call>`);
    return lines.join("\n");
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
    qualityPasses: 3,
    previewEachRound: true,
    visualFinalCheck: true,
    idleTimeoutMs: 90_000,
    streamPushMs: 40,
    maxOutputTokens: 32_768,
    contextBudgetTokens: 128_000,
    inlineProjectChars: 120_000,
    promptSection: `# Working at your speed (Stormy Mercury Profile)
You write very fast and your output limit is large. Round trips, not output length, are what cost the user time, so work in few, complete replies:
- Start a build or multi-file change with one reply that states the plan in a few lines and then contains every \`write_file\` or \`edit_file\` call needed. Write each file whole in ONE \`write_file\` call, as long as it needs to be: never in parts, never with placeholders.
- Make every edit a change needs in that same reply; read every file you need in one turn. Files shown under "# Project files" below are their current text: you have already read them.
- After modifying web/UI files, run \`check_syntax\` or verification commands to confirm zero defects.`,
  } satisfies StormyModelProfile,

  FAST: {
    name: "fast",
    wholeFiles: false,
    qualityPasses: 3,
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
    qualityPasses: 2,
    previewEachRound: true,
    visualFinalCheck: true,
    idleTimeoutMs: 150_000,
    streamPushMs: 60,
    contextBudgetTokens: 256_000,
    inlineProjectChars: 80_000,
    promptSection: `# Long files & complete turns (Stormy Frontier Profile)
Your output limit is large: write each file whole in one \`write_file\` call, and batch independent reads or edits into a single turn. Files shown under "# Project files" below are their current text on disk.`,
  } satisfies StormyModelProfile,

  COMMUNITY: {
    name: "community",
    wholeFiles: true,
    qualityPasses: 2,
    previewEachRound: false,
    visualFinalCheck: true,
    idleTimeoutMs: 120_000,
    streamPushMs: 70,
    contextBudgetTokens: 128_000,
    inlineProjectChars: 48_000,
    promptSection: "",
  } satisfies StormyModelProfile,

  DEFAULT: {
    name: "default",
    wholeFiles: false,
    qualityPasses: 2,
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

const BARRIER_TOOLS = new Set([
  "ask_user",
  "request_approval",
  "run_command",
  "python",
  "open_pull_request",
]);

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
      if (
        x === "" ||
        y === "" ||
        x === y ||
        x.startsWith(`${y}/`) ||
        y.startsWith(`${x}/`)
      ) {
        return true;
      }
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

const FILE_CHANGE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "multi_edit",
  "delete_file",
  "move_file",
  "add_ui_kit",
]);

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
      return {
        stop: "Zeus stopped because it kept repeating the exact same tool call with the same result.",
      };
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
        for (const match of m.content.matchAll(/<function=([\w.-]+)>([\s\S]*?)<\/function>/gi)) {
          const name = ToolAliases.canonicalName(match[1]);
          const inner = match[2] ?? "";
          const pathMatch = /<parameter=path>([^\n<]+)<\/parameter>/i.exec(inner);
          const path = pathMatch?.[1]?.trim() ?? "";
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
      } else if (m.role === "user" && m.content.includes("ok=\"false\"")) {
        const errMatch = /<tool_result\s+name="([^"]+)"\s+ok="false">\s*([^\n<]+)/i.exec(m.content);
        if (errMatch) {
          failures.push(`${errMatch[1]}: ${errMatch[2].trim().slice(0, 90)}`);
        }
      }
    }

    const parts: string[] = [`[Earlier in this run (${steps} step${steps === 1 ? "" : "s"} folded into RunLedger):`];
    if (changed.size > 0) {
      const items = [...changed.entries()]
        .slice(0, 15)
        .map(([p, verbs]) => `${p} (${[...verbs].join("+")})`);
      parts.push(`- Changed files: ${items.join(", ")}`);
    }
    if (read.size > 0) {
      parts.push(`- Read/searched: ${[...read].slice(0, 15).join(", ")}`);
    }
    if (ran.size > 0) {
      parts.push(`- Executed tools: ${[...ran].slice(0, 10).join(", ")}`);
    }
    if (failures.length > 0) {
      parts.push(`- Resolved earlier errors: ${failures.slice(-3).join("; ")}`);
    }
    parts.push("Continue from the newest steps below; re-read a file before editing it if needed.]");
    return parts.join("\n").slice(0, RunLedger.MAX_CHARS);
  },
};

export const HistoryPruner = {
  PRUNED_TOOL_OUTPUT: "[Earlier tool output removed to save context. Run the tool again if you need it.]",
  PROTECT_RECENT_TOKENS: 24_000,
  LARGE_ARGUMENT_CHARS: 1_500,

  prune<T extends { role: "user" | "assistant"; content: string }>(messages: T[], budgetTokens = 96_000): T[] {
    if (TokenEstimator.estimateMessages(messages) <= budgetTokens) return messages;

    // Protect recent tail tokens (~24k tokens)
    let tailTokens = 0;
    let protectFrom = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      tailTokens += TokenEstimator.estimateMessage(messages[i]);
      protectFrom = i;
      if (tailTokens >= HistoryPruner.PROTECT_RECENT_TOKENS) break;
    }

    // Steps 1 & 2: shrink old tool outputs and oversized write_file/edit_file bodies in older turns
    const shrunk = messages.map((m, idx) => {
      if (idx >= protectFrom) return m;
      let content = m.content;
      if (m.role === "user" && content.includes("<tool_result")) {
        content = content.replace(
          /(<tool_result\b[^>]*>)([\s\S]*?)(<\/tool_result>)/gi,
          (_all, openTag: string, body: string, closeTag: string) =>
            body.length > 400 ? `${openTag}\n${HistoryPruner.PRUNED_TOOL_OUTPUT}\n${closeTag}` : _all
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
            /(<parameter=(?:content|old_string|new_string)>)([\s\S]*?)(<\/parameter>)/gi,
            (_all, openTag: string, body: string, closeTag: string) =>
              body.length > HistoryPruner.LARGE_ARGUMENT_CHARS
                ? `${openTag}[omitted (${body.split("\n").length} lines)]${closeTag}`
                : _all
          );
      }
      return content === m.content ? m : { ...m, content };
    });

    if (TokenEstimator.estimateMessages(shrunk) <= budgetTokens || shrunk.length <= 6) {
      return shrunk;
    }

    // Step 4: Fold older middle exchanges into Stormy's deterministic RunLedger
    const foldEnd = Math.max(2, Math.min(shrunk.length - 4, protectFrom));
    if (foldEnd <= 2) return shrunk;
    const dropped = messages.slice(1, foldEnd);
    const ledger = RunLedger.summarize(dropped);
    const first = {
      ...shrunk[0],
      content: `${shrunk[0].content.trimEnd()}\n\n${ledger}`,
    };
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
    if (/\b(with|including|features?|sections?|pages?|tabs?|chart|table|auth|login|cart|booking)\b/i.test(lower)) {
      present.add("SCOPE");
    }
    if (/\b(dark|light|minimal|brutalist|editorial|warm|monochrome|material|fluent|hig|retro|modern)\b/i.test(lower)) {
      present.add("LOOK");
    }
    if (/\b(localstorage|sqlite|database|save|export|json|sync|accounts?)\b/i.test(lower)) {
      present.add("DATA");
    }

    const vague =
      present.size === 0 ? true : present.size === 1 ? words <= 22 : present.size === 2 ? words <= 12 : false;
    if (!vague) return { vague: false, missing: [], kind, reason: "sufficient detail" };

    const order: BriefFacet[] =
      kind === "SITE"
        ? ["NAME", "PURPOSE", "LOOK", "SCOPE", "AUDIENCE"]
        : ["PURPOSE", "SCOPE", "DATA", "LOOK", "AUDIENCE"];
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
  async inline(ws?: Workspace | null, budgetChars = 60_000): Promise<string> {
    if (!ws || budgetChars <= 0 || !ws.tree.length) return "";
    const flatFiles: string[] = [];
    const collect = (nodes: Workspace["tree"]) => {
      for (const n of nodes) {
        if (flatFiles.length > 24) return;
        if (n.dir) {
          if (n.children?.length) collect(n.children);
        } else if (
          SNAPSHOT_TEXT_EXT.test(n.name) &&
          !SNAPSHOT_LOCK_FILES.has(n.name.toLowerCase())
        ) {
          flatFiles.push(n.path);
        }
      }
    };
    collect(ws.tree);
    if (flatFiles.length === 0 || flatFiles.length > 18) return "";

    const parts: Array<{ path: string; text: string }> = [];
    let total = 0;
    for (const path of flatFiles) {
      try {
        const text = await readWorkspaceFile(ws, path);
        if (!text || text.length > 36_000 || text.includes("\u0000")) return "";
        total += text.length;
        if (total > budgetChars) return "";
        parts.push({ path, text });
      } catch {
        return "";
      }
    }
    if (parts.length === 0) return "";
    return [
      `# Project files`,
      `Every file of the project as the task starts (${parts.length} file${parts.length === 1 ? "" : "s"}). This is their current text on disk: you have already read them and can edit them directly without calling read_file first.`,
      ...parts.map((p) => `\n## ${p.path}\n\`\`\`\n${p.text}\n\`\`\``),
    ].join("\n");
  },
};

/* ------------------------------------------------------------------ */
/* 9. DiffUtils (Stormy DiffUtils.kt — Unified Diff & +/- Counts)      */
/* ------------------------------------------------------------------ */
export interface DiffLine {
  kind: "add" | "del" | "ctx" | "hdr";
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface ComputedDiff {
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

export const DiffUtils = {
  computeDiff(oldContent: string, newContent: string, contextLines = 3): ComputedDiff {
    const oldLines = oldContent.replace(/\r\n/g, "\n").split("\n");
    const newLines = newContent.replace(/\r\n/g, "\n").split("\n");

    // Fast prefix/suffix trimming so large files diff in <1ms with near-zero memory
    let start = 0;
    while (
      start < oldLines.length &&
      start < newLines.length &&
      oldLines[start] === newLines[start]
    ) {
      start++;
    }
    let endOld = oldLines.length - 1;
    let endNew = newLines.length - 1;
    while (
      endOld >= start &&
      endNew >= start &&
      oldLines[endOld] === newLines[endNew]
    ) {
      endOld--;
      endNew--;
    }

    const midOld = oldLines.slice(start, endOld + 1);
    const midNew = newLines.slice(start, endNew + 1);

    const rawOps: DiffLine[] = [];
    const ctxBeforeStart = Math.max(0, start - contextLines);
    for (let i = ctxBeforeStart; i < start; i++) {
      rawOps.push({ kind: "ctx", oldLine: i + 1, newLine: i + 1, text: ` ${oldLines[i]}` });
    }

    let additions = 0;
    let deletions = 0;

    if (midOld.length * midNew.length <= 160_000) {
      // Standard LCS over the changed middle window
      const m = midOld.length;
      const n = midNew.length;
      const dp = new Int32Array((m + 1) * (n + 1));
      const w = n + 1;
      for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
          dp[i * w + j] =
            midOld[i] === midNew[j]
              ? 1 + dp[(i + 1) * w + (j + 1)]
              : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (midOld[i] === midNew[j]) {
          rawOps.push({
            kind: "ctx",
            oldLine: start + i + 1,
            newLine: start + j + 1,
            text: ` ${midOld[i]}`,
          });
          i++;
          j++;
        } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
          deletions++;
          rawOps.push({
            kind: "del",
            oldLine: start + i + 1,
            text: `-${midOld[i]}`,
          });
          i++;
        } else {
          additions++;
          rawOps.push({
            kind: "add",
            newLine: start + j + 1,
            text: `+${midNew[j]}`,
          });
          j++;
        }
      }
      while (i < m) {
        deletions++;
        rawOps.push({ kind: "del", oldLine: start + i + 1, text: `-${midOld[i]}` });
        i++;
      }
      while (j < n) {
        additions++;
        rawOps.push({ kind: "add", newLine: start + j + 1, text: `+${midNew[j]}` });
        j++;
      }
    } else {
      for (let i = 0; i < midOld.length; i++) {
        deletions++;
        rawOps.push({ kind: "del", oldLine: start + i + 1, text: `-${midOld[i]}` });
      }
      for (let j = 0; j < midNew.length; j++) {
        additions++;
        rawOps.push({ kind: "add", newLine: start + j + 1, text: `+${midNew[j]}` });
      }
    }

    const ctxAfterEnd = Math.min(oldLines.length, endOld + 1 + contextLines);
    for (let i = endOld + 1; i < ctxAfterEnd; i++) {
      const newIdx = endNew + 1 + (i - (endOld + 1));
      rawOps.push({
        kind: "ctx",
        oldLine: i + 1,
        newLine: newIdx + 1,
        text: ` ${oldLines[i]}`,
      });
    }

    return {
      additions,
      deletions,
      lines: rawOps.slice(0, 400),
    };
  },
};

/* ------------------------------------------------------------------ */
/* 10. Plan & AskUser Parsers (Stormy PlanTimeline & AskUserCard)      */
/* ------------------------------------------------------------------ */
export function parsePlanFromToolCall(argsOrOutput: string): AgentPlan | null {
  try {
    const clean = argsOrOutput.replace(/^\[Plan updated\]\s*/i, "").trim();
    const j = JSON.parse(clean);
    const bodyStr = typeof j.body === "string" ? j.body.trim() : "";
    const inner = bodyStr.startsWith("{") || bodyStr.startsWith("[") ? JSON.parse(bodyStr) : j;
    const rawList = Array.isArray(inner)
      ? inner
      : Array.isArray(inner.tasks)
      ? inner.tasks
      : Array.isArray(inner.plan)
      ? inner.plan
      : Array.isArray(inner.todos)
      ? inner.todos
      : Array.isArray(inner.steps)
      ? inner.steps
      : typeof inner.tasks === "string"
      ? JSON.parse(inner.tasks)
      : null;
    if (!Array.isArray(rawList) || rawList.length === 0) return null;
    const tasks: PlanTask[] = rawList
      .map((item: Record<string, unknown>, idx: number) => {
        const title = String(item.title ?? item.step ?? item.content ?? item.description ?? `Step ${idx + 1}`).trim();
        const rawState = String(item.state ?? item.status ?? "pending").toLowerCase();
        const state: PlanTask["state"] =
          rawState === "completed" || rawState === "done"
            ? "done"
            : rawState === "in_progress" || rawState === "active" || rawState === "running"
            ? "active"
            : rawState === "blocked" || rawState === "error"
            ? "blocked"
            : rawState === "skipped" || rawState === "cancelled"
            ? "skipped"
            : "pending";
        return {
          id: String(item.id ?? `step-${idx + 1}`),
          title,
          state,
          note: typeof item.note === "string" ? item.note : undefined,
          delegatedTo: typeof item.delegatedTo === "string" ? item.delegatedTo : undefined,
        };
      })
      .filter((t) => Boolean(t.title));
    if (!tasks.length) return null;
    return { tasks, updatedAt: Date.now() };
  } catch {
    return null;
  }
}

export function parseAskUserFromToolCall(toolId: string, argsOrOutput: string): PendingUserQuestion | null {
  try {
    const clean = argsOrOutput.replace(/^\[Question presented to user\]\s*/i, "").trim();
    const j = JSON.parse(clean);
    const bodyStr = typeof j.body === "string" ? j.body.trim() : "";
    const inner = bodyStr.startsWith("{") || bodyStr.startsWith("[") ? JSON.parse(bodyStr) : j;
    const rawQuestions = Array.isArray(inner.questions)
      ? inner.questions
      : typeof inner.questions === "string"
      ? JSON.parse(inner.questions)
      : inner.question
      ? [inner]
      : null;
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return null;
    return {
      id: toolId,
      questions: rawQuestions.slice(0, 6).map((q: Record<string, unknown>, i: number) => ({
        id: String(q.id ?? `q-${i + 1}`),
        header: typeof q.header === "string" ? q.header : undefined,
        question: String(q.question ?? q.prompt ?? q.title ?? "Select an option"),
        options: Array.isArray(q.options)
          ? q.options.map((opt: unknown) =>
              typeof opt === "string"
                ? { label: opt }
                : {
                    label: String((opt as Record<string, unknown>).label ?? (opt as Record<string, unknown>).value ?? ""),
                    description:
                      typeof (opt as Record<string, unknown>).description === "string"
                        ? ((opt as Record<string, unknown>).description as string)
                        : undefined,
                    recommended: Boolean((opt as Record<string, unknown>).recommended),
                  }
            )
          : [],
      })),
    };
  } catch {
    return null;
  }
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
        return {
          action: `Edit ${path || "file"}`,
          detail: body.slice(0, 800) || undefined,
        };
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
  try {
    const clean = argsOrOutput.replace(/^\[Approval requested from user\]\s*/i, "").trim();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(clean);
      if (typeof parsed.body === "string" && parsed.body.trim().startsWith("{")) {
        parsed = { ...parsed, ...JSON.parse(parsed.body) };
      }
    } catch {
      parsed = { action: clean };
    }
    const desc = AutonomyPolicy.describe(toolName, argsOrOutput);
    const danger = AutonomyPolicy.dangerReason(toolName, argsOrOutput);
    return {
      id: toolId,
      toolName,
      action: String(parsed.action ?? parsed.question ?? desc.action),
      detail: typeof parsed.detail === "string" ? parsed.detail : desc.detail,
      dangerReason: typeof parsed.dangerReason === "string" ? parsed.dangerReason : danger,
    };
  } catch {
    return null;
  }
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
