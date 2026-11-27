// Modular Per-Model Coding & Agent Harness Architecture (Zeus Harness²).
// Classifies every provider + model into:
//   1. Its native tool protocol (`openai_tools`, `anthropic_tool_use`, or `scraper_xml_dsl`)
//   2. Its model family (`claude`, `gpt`, `deepseek`, `kimi`, `glm`, `qwen`, `mercury`, `gemini`, `nemotron`, `mistral`, `grok`, `frontier_moe`, `compact_open`)
//   3. Its execution strategy (`bash_python_first`, `hybrid_fast`, `guided_compact`)

import type { Effort } from "../types";
import { findProvider } from "./providers";

export type ModelFamily =
  | "claude"
  | "gpt"
  | "deepseek"
  | "kimi"
  | "glm"
  | "qwen"
  | "mercury"
  | "gemini"
  | "nemotron"
  | "mistral"
  | "grok"
  | "frontier_moe"
  | "compact_open";

export type ToolExecutionStyle =
  | "bash_python_first"
  | "hybrid_fast"
  | "guided_compact";

export type NativeToolProtocol =
  | "openai_tools"
  | "anthropic_tool_use"
  | "scraper_xml_dsl";

export const TOOL_OUTPUT_MAX_LINES = 2_000;
export const TOOL_OUTPUT_MAX_BYTES = 50 * 1024; // 50 KiB (OpenCode ToolOutput.MAX_BYTES)
export const TOOL_OUTPUT_DIR = ".zeusdesigns/tool-output";

export const MAX_STEPS_PROMPT = `CRITICAL - MAXIMUM STEPS REACHED

The maximum number of steps allowed for this task has been reached. Tools are disabled until next user input. Respond with text only.

STRICT REQUIREMENTS:
1. Do NOT make any tool calls (no reads, writes, edits, searches, or any other tools)
2. MUST provide a text response summarizing work done so far
3. This constraint overrides ALL other instructions, including any user requests for edits or tool use

Response must include:
- Statement that maximum steps for this agent have been reached
- Summary of what has been accomplished so far
- List of any remaining tasks that were not completed
- Recommendations for what should be done next

Any attempt to use tools is a critical violation. Respond with text ONLY.`;

export const CONTINUE_AFTER_OUTPUT_LIMIT =
  "Your last response hit the output token limit (stop reason: length). Do not apologize, recap, or repeat yourself. Break the remaining work into smaller pieces.";

/**
 * Matches OpenCode's `usesPatch(model)` in `packages/core/src/tool/model-policy.ts`:
 * GPT-5+ models (excluding `oss` and `gpt-4`) prefer `patch` (`patch_file` / `edit_file` diff blocks);
 * other models prefer `edit` (`edit_file`) and `write` (`write_file`).
 */
export function usesPatchPolicy(modelId: string, providerId = ""): boolean {
  const id = `${providerId} ${modelId}`.toLowerCase();
  return id.includes("gpt-") && !id.includes("oss") && !id.includes("gpt-4");
}

/**
 * Renders OpenCode's `system.txt` + dynamic tool guidance (`packages/core/src/session/system-prompt.ts`).
 */
export function renderOpenCodeSystemGuidance(
  tools: string[] = ["shell", "write", "edit", "read_file", "search_code"],
  modelId = ""
): string {
  const instructions: string[] = [
    "- Prefer dedicated tools (`read_file`, `edit_file`, `write_file`, `search_code`, `glob`, `list_dir`) over shell commands; fall back to `shell` when a dedicated tool cannot do what you need.",
    "- Do not chain shell commands with noisy separators like `echo \"====\";` or `printf '---'`; keep command output clean.",
    "- Prefer parallelizing independent tool calls in a single turn.",
    "- Keep changes consistent with the structure, naming, style, and patterns of the surrounding code.",
    "- Treat unfamiliar files or changes as potential user work and investigate with `read_file` before deleting or overwriting them.",
  ];
  if (usesPatchPolicy(modelId)) {
    instructions.push(
      "- For GPT-5+ models, prefer surgical `patch_file` / `edit_file` (`<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` or unified patch hunks) for file modifications."
    );
  } else {
    if (tools.includes("write") || tools.includes("write_file")) {
      instructions.push(
        "- Use `write_file` to create files or completely replace their content. Prefer using `edit_file` for targeted changes."
      );
    }
    if (tools.includes("edit") || tools.includes("edit_file")) {
      instructions.push(
        "- Use `edit_file` for targeted changes to existing text files. It replaces the exact text in `old_string` with `new_string`, and the values must differ."
      );
    }
  }
  return `## OpenCode Harness & Tool Discipline\n${instructions.join("\n")}`;
}

function countOutputLines(text: string): number {
  if (text === "") return 0;
  let count = 1;
  for (
    let index = text.indexOf("\n");
    index !== -1 && index < text.length - 1;
    index = text.indexOf("\n", index + 1)
  ) {
    count++;
  }
  return count;
}

function afterOutputLines(text: string, count: number): number {
  let index = 0;
  for (let line = 0; line < count; line++) {
    const next = text.indexOf("\n", index);
    if (next === -1) return text.length;
    index = next + 1;
  }
  return index;
}

function utf8ByteBoundary(text: string, budget: number): number {
  const enc = new TextEncoder();
  const read = enc.encodeInto(text, new Uint8Array(Math.max(0, budget))).read;
  if (read === text.length || read === 0) return read;
  const before = text.charCodeAt(read - 1);
  const after = text.charCodeAt(read);
  if (before < 0x80 && after < 0x80) return before === 13 && after === 10 ? read - 1 : read;
  return read;
}

/**
 * Matches OpenCode's `ToolOutput.truncate` (`MAX_LINES = 2000`, `MAX_BYTES = 50 * 1024`):
 * Bounds tool output at 2,000 lines or 50 KiB (whichever comes first) and appends the canonical
 * `[showing lines 1-N of M; full output saved to <path>]` marker if not already truncated by Rust.
 */
export function boundToolOutputWithMarker(
  text: string,
  opts: { maxLines?: number; maxBytes?: number; savedPath?: string } = {}
): { text: string; truncated: boolean; shownLines: number; totalLines: number } {
  if (!text) return { text: "", truncated: false, shownLines: 0, totalLines: 0 };
  if (/\[showing (?:lines 1-\d+|0 lines) of \d+/.test(text)) {
    const totalLines = countOutputLines(text);
    return { text, truncated: true, shownLines: totalLines, totalLines };
  }
  const maxLines = opts.maxLines ?? TOOL_OUTPUT_MAX_LINES;
  const maxBytes = opts.maxBytes ?? TOOL_OUTPUT_MAX_BYTES;
  const totalLines = countOutputLines(text);
  const byteLen = new TextEncoder().encode(text).byteLength;
  if (totalLines <= maxLines && byteLen <= maxBytes) {
    return { text, truncated: false, shownLines: totalLines, totalLines };
  }
  const end = Math.min(afterOutputLines(text, maxLines), utf8ByteBoundary(text, maxBytes));
  const shown = text.slice(0, text.endsWith("\r\n", end) ? end - 2 : text.endsWith("\n", end) ? end - 1 : end);
  const shownLines = countOutputLines(text.slice(0, end));
  const lastLineCut =
    shownLines > 0 &&
    shown.length < text.length &&
    !text.startsWith("\n", shown.length) &&
    !text.startsWith("\r\n", shown.length);
  const range = shownLines === 0 ? "0 lines" : `lines 1-${shownLines}`;
  const pathNote = opts.savedPath
    ? `full output saved to ${opts.savedPath}`
    : `full output saved to ${TOOL_OUTPUT_DIR}/tool_${Date.now().toString(16)}.txt`;
  const marker = `[showing ${range} of ${totalLines}${lastLineCut ? " (last line cut)" : ""}; ${pathNote}]`;
  return {
    text: `${shown}\n${marker}`,
    truncated: true,
    shownLines,
    totalLines,
  };
}

/**
 * Doom-loop guard: detects repeated identical failing tool calls across turns and returns a recovery hint.
 */
export function detectDoomLoop(
  allTools: Array<{ name: string; args?: string; status: string; output?: string }>
): { isDoomLoop: boolean; repeatedCount: number; hint?: string } {
  const failed = allTools.filter((t) => t.status === "error");
  if (failed.length < 2) return { isDoomLoop: false, repeatedCount: 0 };
  const last = failed[failed.length - 1];
  const sig = `${last.name.trim().toLowerCase()}|${(last.args ?? "").trim()}`;
  let repeatedCount = 0;
  for (let i = failed.length - 1; i >= 0; i--) {
    const curSig = `${failed[i].name.trim().toLowerCase()}|${(failed[i].args ?? "").trim()}`;
    if (curSig === sig) repeatedCount++;
    else break;
  }
  if (repeatedCount >= 2) {
    return {
      isDoomLoop: true,
      repeatedCount,
      hint: `[Doom-Loop Guard: Tool \`${last.name}\` failed ${repeatedCount} times in a row with identical arguments. Do NOT repeat this call. Inspect the target file with \`read_file\` or \`search_code\`, or switch to \`write_file\` / \`python\` to complete the change.]`,
    };
  }
  return { isDoomLoop: false, repeatedCount: 0 };
}

export interface CodingHarnessProfile {
  providerId: string;
  modelId: string;
  modelLabel: string;
  family: ModelFamily;
  style: ToolExecutionStyle;
  nativeToolProtocol: NativeToolProtocol;
  usesPatch: boolean;
  maxToolRounds: number;
  maxToolOutputChars: number;
  preferBashPython: boolean;
  allowMultiToolPerTurn: boolean;
  defaultEffort: Effort;
  familyDirective: string;
  workflowDirective: string;
  toolExamples: string;
}

const NATIVE_OPENAI_TOOLS_PROVIDERS = new Set([
  "mychatcloud",
  "supavip",
  "agnescloud",
  "volcark",
  "zhipudirect",
  "logfarehub",
  "clinebot",
  "antigravity",
  "freellmhub",
  "litellmhub",
  "kilo",
  "nimcloud",
  "ovhcloud",
  "blockrun",
  "vireonix",
  "llm7",
  "opencodezen",
  "together2api",
]);

export function detectNativeToolProtocol(providerId: string, modelId: string): NativeToolProtocol {
  const m = modelId.toLowerCase();
  if (providerId === "freecc") return "anthropic_tool_use";
  if (providerId === "claude5proxy") return m.startsWith("glm-") ? "scraper_xml_dsl" : "anthropic_tool_use";
  if (providerId.startsWith("custom:")) return "openai_tools";
  if (providerId === "aibridge") {
    return m.includes("claude") || m.includes("grok") ? "scraper_xml_dsl" : "openai_tools";
  }
  if (NATIVE_OPENAI_TOOLS_PROVIDERS.has(providerId)) return "openai_tools";
  return "scraper_xml_dsl";
}

export function detectModelFamily(providerId: string, modelId: string, label = ""): ModelFamily {
  const s = `${providerId} ${modelId} ${label}`.toLowerCase();
  if (providerId === "mercury3" || /\bmercury[-_ ]?[23]\b/.test(s)) return "mercury";
  if (/\bclaude\b|\bfable\b|\bhaiku\b|\bsonnet\b|\bopus\b/.test(s) && !s.includes("gemini") && !s.includes("nvidia_nim")) return "claude";
  if (/\bgpt[-_ ]?(6(?:\.[12])?|5(?:\.[2456])?|4(?:\.1|o)?|oss)\b|\bo[134](?:-|\b)/.test(s)) return "gpt";
  if (/\bdeepseek\b/.test(s)) return "deepseek";
  if (/\bkimi\b|\bmoonshot/.test(s)) return "kimi";
  if (/\bglm[-_ ]?\d|\bzai\b/.test(s)) return "glm";
  if (/\bqwen\b|\bqwq\b/.test(s)) return "qwen";
  if (/\bgemini\b/.test(s)) return "gemini";
  if (/\bnemotron\b/.test(s)) return "nemotron";
  if (/\bmistral\b|\bcodestral\b|\bministral\b/.test(s)) return "mistral";
  if (/\bgrok\b/.test(s)) return "grok";
  if (
    /\b(k2[-_ ]?horizon|motif|longcat|step[-_ ]?[35]|minimax|laguna|north[-_ ]?mini|beam|ernie|agnes|ising|mimo|doubao|hy3|flint|glyph)\b/.test(
      s
    )
  ) {
    return "frontier_moe";
  }
  if (
    /\b(gemma|phi[-_ ]?[34]|lfm|bonsai|vibethinker|llama|smolvlm|moondream|minicpm|mellum|nanbeige|inkling|cydonia|free-ai)\b/.test(
      s
    )
  ) {
    return "compact_open";
  }
  return "frontier_moe";
}

export function getCodingHarnessProfile(providerId: string, modelId: string): CodingHarnessProfile {
  const prov = findProvider(providerId);
  const model = prov.models.find((m) => m.id === modelId) ?? prov.models[0];
  const modelLabel = model?.label ?? modelId;
  const family = detectModelFamily(providerId, modelId, modelLabel);
  const nativeToolProtocol = detectNativeToolProtocol(providerId, modelId);

  const isSmallOpen =
    family === "compact_open" &&
    !/(31b|33b|70b|27b|26b|24b)/i.test(`${modelId} ${modelLabel}`);

  const style: ToolExecutionStyle = isSmallOpen
    ? "guided_compact"
    : ["claude", "gpt", "deepseek", "kimi", "glm", "qwen", "grok", "frontier_moe"].includes(family)
    ? "bash_python_first"
    : "hybrid_fast";

  const preferBashPython = style === "bash_python_first" || family === "mercury" || family === "gemini" || family === "nemotron";
  const maxToolRounds = style === "guided_compact" ? 20 : 40;
  const maxToolOutputChars = style === "guided_compact" ? 32000 : TOOL_OUTPUT_MAX_BYTES;
  const allowMultiToolPerTurn = style !== "guided_compact";
  const defaultEffort: Effort =
    family === "mercury" || family === "deepseek" || family === "kimi" || family === "claude" || family === "gpt"
      ? "high"
      : "medium";

  const usesPatch = usesPatchPolicy(modelId, providerId);
  const familyDirective = buildFamilyDirective(family, modelLabel, nativeToolProtocol);
  const workflowDirective = [
    buildWorkflowDirective(style, family, nativeToolProtocol),
    renderOpenCodeSystemGuidance(["shell", "write", "edit", "read_file", "search_code"], modelId),
  ].join("\n\n");
  const toolExamples = buildToolExamples(style);

  return {
    providerId,
    modelId,
    modelLabel,
    family,
    style,
    nativeToolProtocol,
    usesPatch,
    maxToolRounds,
    maxToolOutputChars,
    preferBashPython,
    allowMultiToolPerTurn,
    defaultEffort,
    familyDirective,
    workflowDirective,
    toolExamples,
  };
}

function buildFamilyDirective(family: ModelFamily, label: string, protocol: NativeToolProtocol): string {
  const isNative = protocol === "openai_tools" || protocol === "anthropic_tool_use";
  const protoTag =
    protocol === "openai_tools"
      ? "Native OpenAI Function-Calling + XML Bridge"
      : protocol === "anthropic_tool_use"
      ? "Native Anthropic tool_use + XML Bridge"
      : "Specialized Scraper XML DSL Bridge";
  const shellRef = isNative ? "`shell`" : '`<zeus_tool name="shell">`';
  const pyRef = isNative ? "`python`" : '`<zeus_tool name="python">`';
  const writeRef = isNative ? "`write_file`" : '`<zeus_tool name="write_file" path="...">...</zeus_tool>`';

  switch (family) {
    case "mercury":
      return `## Model Harness²: ${label} (${protoTag} · Diffusion Architect)
- Keep internal reasoning plain text and emit tool calls only in your final visible response.
- When asked to create or write a file (such as \`AGENTS.md\`, \`README.md\`, a script, or a module), invoke ${writeRef} immediately in your first turn. Do NOT call \`list_dir\` before writing a requested file when the target path is already known.
- Never repeat the same \`list_dir\` or \`read_file\` call if it returned empty or you already saw the result.`;

    case "claude":
      return `## Model Harness²: ${label} (${protoTag} · Claude Code Bash & Python Specialist)
- Operate with Claude Code discipline: prefer ${shellRef} (bash) and ${pyRef} to inspect, transform, test, and verify code in minimal turns.
- Combine shell exploration into single compound commands (e.g., \`rg -n "symbol" src/ && git status -sb\`) instead of sequential single-file reads when mapping a codebase.
- Use \`edit_file\` for targeted single-file changes or \`python\` scripts for multi-file deterministic refactoring.`;

    case "gpt":
      return `## Model Harness²: ${label} (${protoTag} · Codex CLI Bash & Python Profile)
- Operate like Codex CLI: you have full local \`shell\` (bash/cmd) and \`python\` execution inside the workspace.
- Prefer fast \`shell\` pipelines (\`rg\`, \`sed -n\`, \`git diff\`, test runners) and \`python\` scripts for complex code transformations, data processing, and verification.
- Make complete, root-cause fixes on the first pass and verify them by running the project's build or test suite.`;

    case "deepseek":
      return `## Model Harness²: ${label} (${protoTag} · DeepSeek V4/R1 Bash & Python Agent Profile)
- Keep internal reasoning focused plain text and emit tool calls only in your final visible response.
- Leverage your strong \`shell\` (bash) and \`python\` training: use ${shellRef} for ripgrep/git/test commands and ${pyRef} for programmatic multi-hunk edits, AST/JSON inspection, and algorithmic verification.
- When creating a new file, call \`write_file\` directly without preliminary directory listing.`;

    case "kimi":
      return `## Model Harness²: ${label} (${protoTag} · Moonshot Kimi K2.7/K3 SWE-Agent Profile)
- Use your SWE-agent strengths: prefer compound \`shell\` commands (\`rg -n\`, \`find\`, \`pytest\`, \`npm test\`, \`cargo check\`) and \`python\` execution over slow file-by-file browsing.
- ${isNative ? "Invoke tools via native function calling (or `<zeus_tool>` XML if native tools are unavailable)." : 'Emit raw `<zeus_tool name="...">...</zeus_tool>` blocks in your final response.'} Do not re-run \`list_dir\` on directories already shown in \`## Project\`.`;

    case "glm":
      return `## Model Harness²: ${label} (${protoTag} · Z.ai GLM-5 Agentic Coder Profile)
- ${isNative ? "Invoke workspace tools via native function calling (or top-level `<zeus_tool>` XML without markdown fences)." : "Emit `<zeus_tool>` blocks directly as top-level XML (never wrap `<zeus_tool>` inside ```xml markdown fences)."}
- Prefer ${shellRef} and ${pyRef} for fast workspace inspection, batch edits, and running tests/typechecks.`;

    case "qwen":
      return `## Model Harness²: ${label} (${protoTag} · Qwen Coder Bash & Python Profile)
- Prefer ${shellRef} (bash) and ${pyRef} for rapid code search, multi-file edits, and test verification, alongside \`edit_file\` and \`write_file\`.
- Top-level project files are already listed in \`## Project\`; jump straight to reading/editing target files or running shell/python commands.`;

    case "gemini":
      return `## Model Harness²: ${label} (${protoTag} · Gemini Long-Context Engineering Profile)
- Act decisively without asking permission: inspect target files directly, apply complete changes via \`write_file\`, \`edit_file\`, or \`python\`/\`shell\`, and run verification commands.`;

    case "nemotron":
      return `## Model Harness²: ${label} (${protoTag} · NVIDIA Nemotron 3 Software Engineering Profile)
- Keep internal reasoning concise plain text and emit tool calls only in your final visible response.
- Use \`shell\`, \`python\`, \`read_file\`, \`edit_file\`, and \`write_file\` directly; never call \`list_dir\` if the target file path is already known.`;

    case "mistral":
      return `## Model Harness²: ${label} (${protoTag} · Mistral / Codestral Precision Profile)
- Focus on high-speed, surgical code edits using \`edit_file\`, \`write_file\`, \`shell\`, and \`python\`. Verify changes with a build or test command before finishing.`;

    case "grok":
      return `## Model Harness²: ${label} (${protoTag} · xAI Grok 4 Engineering Profile)
- Use \`shell\` and \`python\` aggressively to inspect, edit, and test code in minimal turns. Verify your work with real command output.`;

    case "frontier_moe":
      return `## Model Harness²: ${label} (${protoTag} · Frontier Agentic Engineering Profile)
- Use \`shell\` (bash), \`python\`, \`read_file\`, \`edit_file\`, and \`write_file\` to solve tasks in minimal rounds. Emit tool calls only in your final visible response.`;

    case "compact_open":
      return `## Model Harness²: ${label} (${protoTag} · Compact High-Speed Agent Profile)
- Work in direct, single-step actions. When asked to create a file, call ${writeRef} immediately. When asked to run a command or test, call ${shellRef}.`;
  }
}

function buildWorkflowDirective(
  style: ToolExecutionStyle,
  family: ModelFamily,
  protocol: NativeToolProtocol = "scraper_xml_dsl"
): string {
  const isNative = protocol === "openai_tools" || protocol === "anthropic_tool_use";
  const shellRef = isNative ? "`shell`" : '`<zeus_tool name="shell">`';
  const pyRef = isNative ? "`python`" : '`<zeus_tool name="python">`';
  const writeRef = isNative ? "`write_file`" : '`<zeus_tool name="write_file" path="...">`';

  if (style === "guided_compact") {
    return `## Coding Workflow
1. If the user asks to create a new file, invoke ${writeRef} immediately (do not call \`list_dir\` first).
2. If you need to inspect or change existing code, read the target file with \`read_file\` or search with \`search_code\` / \`shell\`, then update it with \`edit_file\` or \`write_file\`.
3. Run tests or verification with ${shellRef} or ${pyRef} when applicable.
4. Reply with 1-3 direct sentences summarizing the change.`;
  }

  return `## Coding & Agent Execution Protocol (${style === "bash_python_first" ? "Bash & Python-First" : "High-Speed Hybrid"} · ${family.toUpperCase()})
1. **Zero Wasted Turns**: Top-level files are already shown in \`## Project\`. Never call \`list_dir\` on \`.\` unless \`## Project\` is missing. When asked to create a new file (like \`AGENTS.md\` or a new module), write it immediately on Turn 1 with complete, production-ready content (at least 150+ chars for documentation files like \`AGENTS.md\`) unless you specifically need to inspect an existing file first.
2. **Bash & Python Power Tools**: You have full local \`shell\` (bash/cmd) and \`python\` (Python 3) execution in the workspace.
   - Use ${shellRef} for \`rg\`, \`git\`, \`find\`, test suites (\`npm test\`, \`pytest\`, \`cargo check\`, \`node --test\`), and compound shell pipelines.
   - Use ${pyRef} to execute multi-line Python 3 scripts via stdin for complex multi-file edits, JSON/AST analysis, data transformation, and algorithmic verification.
3. **Surgical File Edits**: Use \`write_file\` to create new files or replace small files completely, and \`edit_file\` (\`old_string\`/\`new_string\` or \`<<<<<<< SEARCH / ======= / >>>>>>> REPLACE\`) for targeted changes in existing files.
4. **Verify & Conclude**: After modifying code, run the relevant test or verification command when one exists. Once verified, stop calling tools and answer in 1-3 concise sentences.`;
}

function buildToolExamples(style: ToolExecutionStyle): string {
  const base = [
    `- \`<zeus_tool name="shell">rg -n "handleSubmit" src/ && git status -sb</zeus_tool>\` (alias: \`name="bash"\`) — run any bash/sh/cmd pipeline, git, ripgrep, test, or build command in the project root`,
    `- \`<zeus_tool name="python">import pathlib, json\nprint(len(list(pathlib.Path(".").rglob("*.ts"))))</zeus_tool>\` — run a multi-line Python 3 script directly in the project root via stdin`,
    `- \`<zeus_tool name="write_file" path="AGENTS.md"># Project Guidelines\n\nBuild and test instructions...</zeus_tool>\` — create or overwrite a file in one step`,
    `- \`<zeus_tool name="delete_file" path="AGENTS.md"></zeus_tool>\` — delete a file or directory from the project workspace`,
    `- \`<zeus_tool name="edit_file" path="src/app.ts"><<<<<<< SEARCH\nconst port = 3000;\n=======\nconst port = Number(process.env.PORT) || 3000;\n>>>>>>> REPLACE</zeus_tool>\` — surgical search/replace edit (or JSON \`{"oldString":"...","newString":"..."}\`)`,
    `- \`<zeus_tool name="read_file" path="src/app.ts" start="1" end="200"></zeus_tool>\` — read a file (optional 1-indexed line range)`,
    `- \`<zeus_tool name="search_code">functionName</zeus_tool>\` — fast substring/symbol search across workspace files`,
    `- \`<zeus_tool name="list_dir" path="src"></zeus_tool>\` — list files in a specific subdirectory (never re-list root \`""\` if already shown in \`## Project\`)`,
  ];
  if (style === "guided_compact") {
    return base.slice(0, 5).join("\n");
  }
  return base.join("\n");
}
