// Modular Per-Model Coding & Agent Harness Architecture.
// Profiles every provider + model into its optimal execution strategy (bash/python-first,
// hybrid-fast diffusion/multimodal, or guided-compact), tool-calling protocol, context budget,
// and anti-failure guardrails.

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

export interface CodingHarnessProfile {
  providerId: string;
  modelId: string;
  modelLabel: string;
  family: ModelFamily;
  style: ToolExecutionStyle;
  maxToolRounds: number;
  maxToolOutputChars: number;
  preferBashPython: boolean;
  allowMultiToolPerTurn: boolean;
  defaultEffort: Effort;
  familyDirective: string;
  workflowDirective: string;
  toolExamples: string;
}

export function detectModelFamily(providerId: string, modelId: string, label = ""): ModelFamily {
  const s = `${providerId} ${modelId} ${label}`.toLowerCase();
  if (providerId === "mercury3" || /\bmercury[-_ ]?[23]\b/.test(s)) return "mercury";
  if (/\bclaude\b|\bhaiku\b|\bsonnet\b|\bopus\b/.test(s) && !s.includes("gemini") && !s.includes("nvidia_nim")) return "claude";
  if (/\bgpt[-_ ]?(6|5|4|oss)\b|\bo[134]-/.test(s)) return "gpt";
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

  const isSmallOpen =
    family === "compact_open" &&
    !/(31b|33b|70b|27b|26b|24b)/i.test(`${modelId} ${modelLabel}`);

  const style: ToolExecutionStyle = isSmallOpen
    ? "guided_compact"
    : ["claude", "gpt", "deepseek", "kimi", "glm", "qwen", "grok", "frontier_moe"].includes(family)
    ? "bash_python_first"
    : "hybrid_fast";

  const preferBashPython = style === "bash_python_first" || family === "mercury" || family === "gemini" || family === "nemotron";
  const maxToolRounds = style === "guided_compact" ? 16 : 35;
  const maxToolOutputChars = style === "guided_compact" ? 8000 : 18000;
  const allowMultiToolPerTurn = style !== "guided_compact";
  const defaultEffort: Effort =
    family === "mercury" || family === "deepseek" || family === "kimi" || family === "claude" || family === "gpt"
      ? "high"
      : "medium";

  const familyDirective = buildFamilyDirective(family, modelLabel);
  const workflowDirective = buildWorkflowDirective(style, family);
  const toolExamples = buildToolExamples(style);

  return {
    providerId,
    modelId,
    modelLabel,
    family,
    style,
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

function buildFamilyDirective(family: ModelFamily, label: string): string {
  switch (family) {
    case "mercury":
      return `## Model Harness: ${label} (Diffusion High-Speed Architect)
- Never emit \`<zeus_tool>\` or \`<tool_call>\` tags inside \`<think>...</think>\`. Keep \`<think>\` pure plain-text reasoning.
- When asked to create or write a file (such as \`AGENTS.md\`, \`README.md\`, a script, or a module), emit \`<zeus_tool name="write_file" path="...">...</zeus_tool>\` immediately in your first turn. Do NOT call \`list_dir\` before writing a requested file when the target path is already known.
- Never repeat the same \`list_dir\` or \`read_file\` call if it returned empty or you already saw the result.`;

    case "claude":
      return `## Model Harness: ${label} (Claude Code Bash & Python Specialist)
- Operate with Claude Code discipline: prefer \`<zeus_tool name="shell">\` (bash) and \`<zeus_tool name="python">\` to inspect, transform, test, and verify code in minimal turns.
- Combine shell exploration into single compound commands (e.g., \`rg -n "symbol" src/ && git status -sb\`) instead of sequential single-file reads when mapping a codebase.
- Use \`edit_file\` for targeted single-file changes or \`python\` scripts for multi-file deterministic refactoring.`;

    case "gpt":
      return `## Model Harness: ${label} (OpenAI Codex CLI Bash & Python Profile)
- Operate like Codex CLI: you have full local \`shell\` (bash/cmd) and \`python\` execution inside the workspace.
- Prefer fast \`shell\` pipelines (\`rg\`, \`sed -n\`, \`git diff\`, test runners) and \`python\` scripts for complex code transformations, data processing, and verification.
- Make complete, root-cause fixes on the first pass and verify them by running the project's build or test suite.`;

    case "deepseek":
      return `## Model Harness: ${label} (DeepSeek V4/R1 Bash & Python Agent Profile)
- Keep \`<think>\` focused and never write literal \`<zeus_tool>\` tags inside \`<think>\`; emit tool tags only in your final response after \`</think>\`.
- Leverage your strong \`shell\` (bash) and \`python\` training: use \`<zeus_tool name="shell">\` for ripgrep/git/test commands and \`<zeus_tool name="python">\` for programmatic multi-hunk edits, AST/JSON inspection, and algorithmic verification.
- When creating a new file, call \`write_file\` directly without preliminary directory listing.`;

    case "kimi":
      return `## Model Harness: ${label} (Moonshot Kimi K2.7/K3 SWE-Agent Profile)
- Use your SWE-agent strengths: prefer compound \`shell\` commands (\`rg -n\`, \`find\`, \`pytest\`, \`npm test\`, \`cargo check\`) and \`python\` execution over slow file-by-file browsing.
- Emit raw \`<zeus_tool name="...">...</zeus_tool>\` blocks outside \`<think>\`. Do not re-run \`list_dir\` on directories already shown in \`## Project\`.`;

    case "glm":
      return `## Model Harness: ${label} (Z.ai GLM-5 Agentic Coder Profile)
- Emit \`<zeus_tool>\` blocks directly as top-level XML (never wrap \`<zeus_tool>\` inside \`\`\`xml markdown fences).
- Prefer \`<zeus_tool name="shell">\` and \`<zeus_tool name="python">\` for fast workspace inspection, batch edits, and running tests/typechecks.`;

    case "qwen":
      return `## Model Harness: ${label} (Qwen Coder Bash & Python Profile)
- Prefer \`<zeus_tool name="shell">\` (bash) and \`<zeus_tool name="python">\` for rapid code search, multi-file edits, and test verification, alongside \`edit_file\` and \`write_file\`.
- Top-level project files are already listed in \`## Project\`; jump straight to reading/editing target files or running shell/python commands.`;

    case "gemini":
      return `## Model Harness: ${label} (Gemini Long-Context Engineering Profile)
- Act decisively without asking permission: inspect target files directly, apply complete changes via \`write_file\`, \`edit_file\`, or \`python\`/\`shell\`, and run verification commands.`;

    case "nemotron":
      return `## Model Harness: ${label} (NVIDIA Nemotron 3 Software Engineering Profile)
- Keep \`<think>\` concise and never place \`<zeus_tool>\` tags inside \`<think>\`.
- Use \`shell\`, \`python\`, \`read_file\`, \`edit_file\`, and \`write_file\` directly; never call \`list_dir\` if the target file path is already known.`;

    case "mistral":
      return `## Model Harness: ${label} (Mistral / Codestral Precision Profile)
- Focus on high-speed, surgical code edits using \`edit_file\`, \`write_file\`, \`shell\`, and \`python\`. Verify changes with a build or test command before finishing.`;

    case "grok":
      return `## Model Harness: ${label} (xAI Grok 4 Engineering Profile)
- Use \`shell\` and \`python\` aggressively to inspect, edit, and test code in minimal turns. Verify your work with real command output.`;

    case "frontier_moe":
      return `## Model Harness: ${label} (Frontier Agentic Engineering Profile)
- Use \`shell\` (bash), \`python\`, \`read_file\`, \`edit_file\`, and \`write_file\` to solve tasks in minimal rounds. Never emit \`<zeus_tool>\` inside \`<think>\`.`;

    case "compact_open":
      return `## Model Harness: ${label} (Compact High-Speed Agent Profile)
- Work in direct, single-step actions. When asked to create a file, use \`<zeus_tool name="write_file" path="filename">content</zeus_tool>\` immediately. When asked to run a command or test, use \`<zeus_tool name="shell">command</zeus_tool>\`.`;
  }
}

function buildWorkflowDirective(style: ToolExecutionStyle, family: ModelFamily): string {
  if (style === "guided_compact") {
    return `## Coding Workflow
1. If the user asks to create a new file, emit \`<zeus_tool name="write_file" path="...">\` immediately (do not call \`list_dir\` first).
2. If you need to inspect or change existing code, read the target file with \`read_file\` or search with \`search_code\` / \`shell\`, then update it with \`edit_file\` or \`write_file\`.
3. Run tests or verification with \`<zeus_tool name="shell">\` or \`<zeus_tool name="python">\` when applicable.
4. Reply with 1-3 direct sentences summarizing the change.`;
  }

  return `## Coding & Agent Execution Protocol (${style === "bash_python_first" ? "Bash & Python-First" : "High-Speed Hybrid"} · ${family.toUpperCase()})
1. **Zero Wasted Turns**: Top-level files are already shown in \`## Project\`. Never call \`list_dir\` on \`.\` unless \`## Project\` is missing. When asked to create a new file (like \`AGENTS.md\` or a new module), write it immediately on Turn 1 unless you specifically need to inspect an existing file first.
2. **Bash & Python Power Tools**: You have full local \`shell\` (bash/cmd) and \`python\` (Python 3) execution in the workspace.
   - Use \`<zeus_tool name="shell">rg -n "pattern" src/ && git status -sb</zeus_tool>\` to combine search, git status, and file inspection in one turn.
   - Use \`<zeus_tool name="python">...</zeus_tool>\` whenever a Python script is faster or more reliable than manual text replacement (e.g., complex multi-file edits, regex/AST refactoring, JSON/CSV manipulation, math/algorithm checks, or test generation).
3. **Surgical File Edits**:
   - For new files or full rewrites: \`<zeus_tool name="write_file" path="relative/path">...full content...</zeus_tool>\`
   - For targeted edits to existing files: \`<zeus_tool name="edit_file" path="relative/path"><<<<<<< SEARCH\\nexact lines\\n=======\\nnew lines\\n>>>>>>> REPLACE</zeus_tool>\` (or use \`python\` for programmatic multi-hunk edits).
4. **Verify Before Finishing**: Run the relevant build, typecheck, linter, or test command via \`<zeus_tool name="shell">\` or \`<zeus_tool name="python">\`, inspect the output, and fix any errors before concluding.
5. **Concise Completion**: Once verified, stop calling tools and answer in 1 to 3 crisp sentences stating what changed and where. Never dump full files you already wrote to disk.`;
}

function buildToolExamples(style: ToolExecutionStyle): string {
  if (style === "guided_compact") {
    return [
      `- Run shell command: \`<zeus_tool name="shell">git status -sb</zeus_tool>\``,
      `- Run Python script: \`<zeus_tool name="python">import os; print(os.listdir('.'))</zeus_tool>\``,
      `- Read file: \`<zeus_tool name="read_file" path="src/index.ts" start="1" end="150"></zeus_tool>\``,
      `- Write file: \`<zeus_tool name="write_file" path="AGENTS.md"># Agents Guide...</zeus_tool>\``,
      `- Edit file: \`<zeus_tool name="edit_file" path="src/index.ts"><<<<<<< SEARCH\\nold line\\n=======\\nnew line\\n>>>>>>> REPLACE</zeus_tool>\``,
    ].join("\n");
  }

  return [
    `- \`<zeus_tool name="shell">command</zeus_tool>\` (alias: \`name="bash"\`) — run any bash/sh/cmd pipeline, git, ripgrep (\`rg\`), npm/cargo/pytest, or build command`,
    `- \`<zeus_tool name="python">python3_code</zeus_tool>\` — run multi-line Python 3 code directly via stdin (ideal for complex file edits, AST/JSON transforms, data analysis, and automated checks)`,
    `- \`<zeus_tool name="read_file" path="relative/file" start="1" end="250"></zeus_tool>\` — read file lines with line bounds`,
    `- \`<zeus_tool name="write_file" path="relative/file">complete file content</zeus_tool>\` — create or overwrite a file in 1 step`,
    `- \`<zeus_tool name="edit_file" path="relative/file"><<<<<<< SEARCH\\nexisting lines\\n=======\\nreplacement lines\\n>>>>>>> REPLACE</zeus_tool>\` — surgical search/replace (supports multiple SEARCH/REPLACE blocks)`,
    `- \`<zeus_tool name="search_code">substring_or_symbol</zeus_tool>\` — fast workspace code search (\`path:line: snippet\`)`,
    `- \`<zeus_tool name="list_dir" path="subdir"></zeus_tool>\` — list a subdirectory tree`,
  ].join("\n");
}
