// Stormy Tool Definitions, Aliases, and Dependency-Ordered Batch Wave Scheduler.
import type { ToolCall } from "../types";

export const NAME_ALIASES: Record<string, string> = {
  load_skill: "use_skill",
  get_skill: "use_skill",
  read_skill: "use_skill",
  skill: "use_skill",
  audit_project: "check_syntax",
  review_project: "check_syntax",
  lint_project: "check_syntax",
  install_ui_kit: "add_ui_kit",
  patch_file: "edit_file",
  str_replace: "edit_file",
  str_replace_editor: "edit_file",
  replace_in_file: "edit_file",
  edit: "edit_file",
  multiedit: "multi_edit",
  multi_edit_file: "multi_edit",
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
  rename_file: "move_file",
  mv: "move_file",
  delete: "delete_file",
  remove_file: "delete_file",
  rm: "delete_file",
  del: "delete_file",
  unlink: "delete_file",
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

export const ARG_ALIASES: Record<string, Record<string, string>> = {
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
  multi_edit: { file_path: "path", filepath: "path", file: "path" },
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
  list_files: { directory: "path", dir: "path", folder: "path", dir_path: "path" },
  glob: { glob: "pattern", directory: "path", dir: "path" },
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
  delete_file: { file_path: "path", file: "path" },
  web_fetch: { link: "url", uri: "url", path: "url" },
  ask_user: { prompt: "question", choices: "options", message: "question" },
  use_skill: { skill: "name", skill_name: "name", topic: "name", path: "name" },
};

export interface StormyToolSpec {
  name: string;
  signature: string;
  summary: string;
  readOnly: boolean;
}

export const STORMY_TOOLS_LIST: StormyToolSpec[] = [
  { name: "read_file", signature: "read_file(path: string, paths?: [string, ...], offset?: int, limit?: int)", summary: "Read a text file from the project (numbered \"<line>|<text>\", up to 8 files via paths).", readOnly: true },
  { name: "list_dir", signature: "list_dir(path?: string, depth?: int, symbols?: boolean)", summary: "List files and folders as a tree (alias: list_files); with symbols=true adds a one-line symbol outline of each file.", readOnly: true },
  { name: "glob", signature: "glob(pattern: string, path?: string)", summary: "Find files by glob pattern (e.g. \"**/*.ts\", \"src/**/*.{js,tsx}\"), most recently modified first.", readOnly: true },
  { name: "grep", signature: "grep(pattern: string, path?: string, include?: string, ignore_case?: boolean, literal?: boolean)", summary: "Search file contents with a regular expression or literal string across the project (alias: search_code).", readOnly: true },
  { name: "search_project", signature: "search_project(query: string, limit?: int)", summary: "On-device BM25 search over 40-line code chunks with camelCase splitting and synonyms.", readOnly: true },
  { name: "edit_file", signature: "edit_file(path: string, old_string: string, new_string: string, replace_all?: boolean)", summary: "Replace an exact string in a file (or <<<<<<< SEARCH / ======= / >>>>>>> REPLACE block).", readOnly: false },
  { name: "multi_edit", signature: "multi_edit(path: string, edits: [{old_string: string, new_string: string, replace_all?: boolean}, ...])", summary: "Apply several edit_file replacements to one file atomically in order.", readOnly: false },
  { name: "write_file", signature: "write_file(path: string, content: string, append?: boolean)", summary: "Create a new file or replace an existing one (parent folders created automatically).", readOnly: false },
  { name: "move_file", signature: "move_file(source: string, destination: string, overwrite?: boolean)", summary: "Move or rename a file or folder inside the project.", readOnly: false },
  { name: "delete_file", signature: "delete_file(path: string)", summary: "Delete a file or folder from the project.", readOnly: false },
  { name: "check_syntax", signature: "check_syntax(path?: string)", summary: "Static syntax and asset audit of a file or the whole project (HTML, CSS, JS/TS, JSON).", readOnly: true },
  { name: "shell", signature: "shell(command: string)", summary: "Execute a non-interactive bash/cmd command, ripgrep, git, or test suite in the project root.", readOnly: false },
  { name: "python", signature: "python(code: string)", summary: "Execute a Python 3 script via stdin in the project root for data processing or multi-file refactoring.", readOnly: false },
  { name: "update_plan", signature: "update_plan(tasks: [{title: string, state: \"pending\"|\"active\"|\"done\"|\"blocked\"|\"skipped\"}])", summary: "Publish or update the live step-by-step plan checklist pinned above the conversation.", readOnly: true },
  { name: "ask_user", signature: "ask_user(questions: [{question: string, header?: string, options?: [{label: string, recommended?: boolean}]}])", summary: "Ask the user 1-4 clarifying questions in an interactive card and wait for answers.", readOnly: true },
  { name: "docs_lookup", signature: "docs_lookup(query: string)", summary: "Look up HTML, CSS, JavaScript, or TypeScript usage patterns in the built-in offline reference.", readOnly: true },
  { name: "web_fetch", signature: "web_fetch(url: string)", summary: "Fetch a public http(s) URL and return its readable text.", readOnly: true },
  { name: "use_skill", signature: "use_skill(name: string)", summary: "Load a domain craft or engineering skill playbook on demand.", readOnly: true },
  { name: "add_ui_kit", signature: "add_ui_kit()", summary: "Install Stormy's oro-ui/oro.css and oro-ui/oro.js design token & theme kit into the project.", readOnly: false },
  { name: "spawn_subagent", signature: "spawn_subagent(agent_type: \"explore\"|\"review\"|\"verify\", prompt: string)", summary: "Delegate bounded codebase exploration or static review to an isolated Stormy subagent.", readOnly: true },
  { name: "copy_file", signature: "copy_file(source: string, destination: string, overwrite?: boolean)", summary: "Copy a file inside the project workspace.", readOnly: false },
  { name: "create_folder", signature: "create_folder(path: string)", summary: "Create a directory (and any parent directories) inside the project.", readOnly: false },
  { name: "insert_at_line", signature: "insert_at_line(path: string, line: int, content: string)", summary: "Insert lines at a 1-indexed line number in a file.", readOnly: false },
  { name: "get_file_info", signature: "get_file_info(path: string)", summary: "Return file size and a one-line symbol outline of a file.", readOnly: true },
  { name: "diff_files", signature: "diff_files(path1: string, path2: string)", summary: "Compute a unified line diff between two files in the workspace.", readOnly: true },
  { name: "git_status", signature: "git_status()", summary: "Inspect current Git branch and modified/staged/untracked files.", readOnly: true },
  { name: "git_diff", signature: "git_diff(path?: string)", summary: "Show Git diff for the workspace or a specific file.", readOnly: true },
  { name: "git_log", signature: "git_log()", summary: "Show recent Git commit history.", readOnly: true },
  { name: "security_scan", signature: "security_scan(path?: string)", summary: "Scan project files for hardcoded secrets, unsafe eval(), or unsanitized innerHTML.", readOnly: true },
];

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

export function computeFastDiff(oldContent: string, newContent: string, contextLines = 3): ComputedDiff {
  const oldLines = oldContent.replace(/\r\n/g, "\n").split("\n");
  const newLines = newContent.replace(/\r\n/g, "\n").split("\n");

  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++;
  }
  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;
  while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
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
        rawOps.push({ kind: "ctx", oldLine: start + i + 1, newLine: start + j + 1, text: ` ${midOld[i]}` });
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
        deletions++;
        rawOps.push({ kind: "del", oldLine: start + i + 1, text: `-${midOld[i]}` });
        i++;
      } else {
        additions++;
        rawOps.push({ kind: "add", newLine: start + j + 1, text: `+${midNew[j]}` });
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
    rawOps.push({ kind: "ctx", oldLine: i + 1, newLine: newIdx + 1, text: ` ${oldLines[i]}` });
  }

  return { additions, deletions, lines: rawOps.slice(0, 400) };
}

export type ToolCallWaveRunner = <T extends ToolCall>(calls: T[]) => number[][];

export const NAMED_HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&rarr;": "→",
  "&larr;": "←",
  "&times;": "×",
  "&bull;": "•",
  "&copy;": "©",
  "&trade;": "™",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
};

import type { AgentPlan, PendingApproval, PendingUserQuestion, PlanTask } from "../types";

export function parsePlanPayload(argsOrOutput: string): AgentPlan | null {
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

export function parseAskUserPayload(toolId: string, argsOrOutput: string): PendingUserQuestion | null {
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

export function parseApprovalPayload(
  toolId: string,
  toolName: string,
  argsOrOutput: string,
  desc: { action: string; detail?: string },
  danger?: string
): PendingApproval | null {
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

export function cleanDisplayText(text: string): string {
  if (!text || (!text.includes("\\") && !text.includes("&"))) return text;
  const literalNewlines = (text.match(/\\n/g) ?? []).length;
  const realNewlines = (text.match(/\n/g) ?? []).length;
  const decodeNewlines = literalNewlines >= 2 && (realNewlines === 0 || literalNewlines > realNewlines * 2);
  const parts = text.split("`");
  return parts
    .map((part, idx) => {
      if (idx % 2 === 1) return part;
      let out = part;
      if (decodeNewlines) {
        out = out.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
      }
      if (out.includes("\\u")) {
        out = out.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      }
      if (out.includes("&")) {
        out = out.replace(/&#(x[0-9a-fA-F]+|\d+);/g, (m, code: string) => {
          const cp = code.startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
          return !Number.isNaN(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
        });
        for (const [k, v] of Object.entries(NAMED_HTML_ENTITIES)) {
          if (out.includes(k)) out = out.split(k).join(v);
        }
      }
      return out;
    })
    .join("`");
}

function canonToolName(name: string): string {
  const clean = name.trim().toLowerCase().split(".").pop() ?? name.trim().toLowerCase();
  return NAME_ALIASES[clean] ?? clean;
}

export function formatRoundToolsForHistory(roundTools: ToolCall[], usesNativeProtocol: boolean): string {
  return roundTools
    .map((t) => {
      let p = "";
      let b = "";
      let parsedObj: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(t.args ?? "{}");
        if (parsed && typeof parsed === "object") parsedObj = parsed as Record<string, unknown>;
        p = parsed.path ?? "";
        b =
          typeof parsed.body === "string" && Object.keys(parsed).every((k) => k === "path" || k === "body")
            ? parsed.body
            : JSON.stringify(parsed);
      } catch {
        b = t.args ?? "";
      }
      if (!usesNativeProtocol) {
        return `<zeus_tool name="${t.name}"${p ? ` path="${p}"` : ""}>${b}</zeus_tool>`;
      }
      const canonName = canonToolName(t.name);
      let argsPayload: Record<string, unknown>;
      if (b.startsWith("{") && b.endsWith("}")) {
        try {
          const inner = JSON.parse(b) as Record<string, unknown>;
          argsPayload = { ...(p && !inner.path ? { path: p } : {}), ...inner };
        } catch {
          argsPayload = parsedObj ?? { ...(p ? { path: p } : {}), ...(b ? { body: b } : {}) };
        }
      } else if (canonName === "run_command" || t.name === "shell" || t.name === "bash") {
        argsPayload = { command: b || p };
      } else if (canonName === "python") {
        argsPayload = { code: b || p };
      } else if (canonName === "write_file") {
        argsPayload = { path: p, content: b };
      } else if (canonName === "read_file") {
        argsPayload = {
          path: p || b,
          ...(parsedObj?.start ? { start: parsedObj.start } : {}),
          ...(parsedObj?.end ? { end: parsedObj.end } : {}),
        };
      } else if (canonName === "grep") {
        argsPayload =
          t.name === "search_code"
            ? { query: b || p, ...(b && p ? { path: p } : {}) }
            : { pattern: b || p, ...(b && p ? { path: p } : {}) };
      } else if (canonName === "glob") {
        argsPayload = { pattern: b || p, ...(b && p ? { path: p } : {}) };
      } else if (canonName === "search_project" || canonName === "docs_lookup" || canonName === "memory_search") {
        argsPayload = { query: b || p, ...(b && p ? { path: p } : {}) };
      } else if (canonName === "memory_save" || canonName === "memory_edit") {
        argsPayload = { ...(p ? { path: p } : {}), content: b };
      } else if (canonName === "web_fetch") {
        argsPayload = { url: p || b };
      } else if (canonName === "use_skill") {
        argsPayload = { name: p || b };
      } else {
        argsPayload = { ...(p ? { path: p } : {}), ...(b ? { content: b } : {}) };
      }
      return `<tool_call>${JSON.stringify({ name: t.name, arguments: argsPayload })}</tool_call>`;
    })
    .join("\n");
}

export function summarizeRunLedgerDropped(dropped: Array<{ role: string; content: string }>, maxChars = 3000): string {
  const changed = new Map<string, Set<string>>();
  const read = new Set<string>();
  const ran = new Set<string>();
  const failures: string[] = [];
  let steps = 0;

  const recordTool = (rawName: string, path: string) => {
    const name = canonToolName(rawName);
    if (!name) return;
    if (["write_file", "edit_file", "multi_edit", "delete_file", "move_file"].includes(name) && path) {
      const set = changed.get(path) ?? new Set<string>();
      set.add(name.replace("_file", ""));
      changed.set(path, set);
    } else if (["read_file", "list_files", "glob", "grep", "search_project"].includes(name) && path) {
      read.add(path);
    } else {
      ran.add(name);
    }
  };

  for (const m of dropped) {
    if (m.role === "assistant") {
      steps++;
      for (const match of m.content.matchAll(/<zeus_tool\s+name="([^"]+)"(?:\s+path="([^"]*)")?[^>]*>/gi)) {
        recordTool(match[1], (match[2] ?? "").trim());
      }
      for (const match of m.content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)) {
        try {
          const j = JSON.parse(match[1]);
          const args = (j.arguments ?? {}) as Record<string, unknown>;
          recordTool(String(j.name ?? ""), String(args.path ?? args.file ?? "").trim());
        } catch {
          /* ignore */
        }
      }
    } else if (m.role === "user" && m.content.includes('ok="false"')) {
      const errMatch = /<tool_result\s+name="([^"]+)"\s+ok="false">\s*([^\n<]+)/i.exec(m.content);
      if (errMatch) failures.push(`${errMatch[1]}: ${errMatch[2].trim().slice(0, 90)}`);
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
  return parts.join("\n").slice(0, maxChars);
}

export function compactLargeAssistantArguments(content: string, maxArgChars = 3000): string {
  return content
    .replace(
      /(<zeus_tool\s+name="(?:write_file|edit_file)"[^>]*>)([\s\S]*?)(<\/zeus_tool>)/gi,
      (_all, openTag: string, body: string, closeTag: string) =>
        body.length > maxArgChars ? `${openTag}[file content omitted (${body.split("\n").length} lines)]${closeTag}` : _all
    )
    .replace(/(<tool_call>)([\s\S]*?)(<\/tool_call>)/gi, (all, openTag: string, body: string, closeTag: string) => {
      if (body.length <= maxArgChars) return all;
      try {
        const j = JSON.parse(body);
        const name = canonToolName(String(j.name ?? ""));
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
    });
}
