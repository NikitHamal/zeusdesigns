// General-purpose agent mode: intent routing, the Zeus Harness² coding-agent system prompt, and plain (non-canvas) history.
import type { Message, Quote, Artboard } from "../types";
import { useStore } from "../store";
import { memoryBlock } from "./memory";
import { getProviderSpecialization } from "./context";
import { getCodingHarnessProfile } from "./codingHarness";
import { composeHarness2Surface } from "./harness2";
import { buildOpenDesignDeliverablePrompt, type OpenDesignCreationMode } from "./openDesign";
import { M3E_GUIDE, M3E_TRIGGER } from "./m3e";

export type Intent = "chat" | "code" | "design";

const DESIGN_ASK = /\b(design|redesign|mock-?up|wireframe|prototype|landing page|home ?page|screen|screens|artboard|canvas|ui|ux|layout|onboarding flow|dashboard (ui|design|screen)|app (ui|design|screen)|hero section|style guide|design system|variant|moodboard|poster|slides?|deck)\b/i;
const CODE_ASK = /\b(code|bug|fix|implement|refactor|function|class|component|file|files|repo|repository|test|tests|build|compile|npm|pnpm|yarn|pip|cargo|git|github|gitlab|pull|push|fetch|clone|merge|rebase|status|diff|commit|branch|error|exception|stack ?trace|typescript|javascript|python|rust|golang|java|c\+\+|css|html|sql|api|endpoint|script|cli|terminal|command|run|install|debug|lint|deploy|docker|regex|algorithm|read|search|find|grep|edit|write|create|add|remove|rename|update|check|inspect|list|ls|pwd|cat|head|tail|tree|explain|analyze|summarize|review|audit|optimize|clean|format|start|stop|serve|dev|bench|benchmark|overview|structure|architecture|memory|remember|preference|preferences|directory|folder|workspace|execute)\b/i;
const EDIT_CANVAS = /\b(change|make|switch|apply|tweak|adjust|bigger|smaller|darker|lighter|theme|colou?r|palette|dark mode|light mode|font|spacing|padding|rounder|compact|move|align|swap|replace|add (a|an|the)|remove (the|a))\b/i;
const NEW_SUBJECT = /\b(new|another|different|from scratch|start over)\b/i;
const CASUAL_CHAT =
  /^(?:thanks|thank you|thx|ty|ok|okay|cool|nice|great|awesome|got it|bye|goodbye|how are you|(?:who|what)\s+(?:are\s+you|r\s+u|made\s+you|built\s+you|created\s+you)|(?:which|what)\s+(?:model|llm|ai|version)\s*(?:are\s+you|r\s+u|is\s+this)?|are\s+you\s+(?:gemini|claude|gpt|qwen|deepseek|agnes|zeus)[a-z0-9\s.-]*)[!.?\s]*$/i;

/** Decide what the user is asking for so a greeting never becomes a design and a bug fix never touches the canvas. */
export function classifyIntent(text: string, ctx: { boards: number; quote?: boolean; asVariant?: boolean; workspace?: boolean }): Intent {
  const t = text.trim();
  if (GREETING_RE.test(t) || CASUAL_CHAT.test(t)) return "chat";
  if (ctx.asVariant || ctx.quote) return "design";
  if (M3E_TRIGGER.test(t)) return "chat";
  if (CODE_ASK.test(t) || /\b(delete|remove|rm|unlink|erase)\b/i.test(t) || ctx.workspace) return "code";
  if (DESIGN_ASK.test(t)) return "code";
  if (ctx.boards > 0 && EDIT_CANVAS.test(t) && !NEW_SUBJECT.test(t)) return "design";
  return "chat";
}

export const GREETING_RE = /^(hi|hello|hey|yo|sup|hola|howdy|greetings|good\s+(morning|afternoon|evening))[!.?\s]*$/i;

export function agentPrompt(mode: Intent, userText = ""): string {
  if (mode === "chat" && GREETING_RE.test(userText.trim())) {
    return "You are Zeus, a free AI coding & software engineering agent running inside the Zeus Codes desktop app. Reply to the user's greeting in one plain, direct sentence (for example: \"Hello! What would you like to build or work on?\") with no tools, no files, no code blocks, no emojis, and no roleplay.";
  }
  const s = useStore.getState();
  const ws = s.ui.workspace;
  const spec = getProviderSpecialization(s.settings.providerId, s.settings.modelId);
  const profile = getCodingHarnessProfile(s.settings.providerId, s.settings.modelId);
  const topFiles = ws
    ? ws.tree.length > 0
      ? ws.tree.slice(0, 50).map((n) => n.name + (n.dir ? "/" : "")).join(", ")
      : "(empty directory — 0 files)"
    : "";

  return [
    `You are Zeus, a world-class AI coding and software engineering agent running inside the Zeus Codes desktop app (powered by Zeus Harness²). You write, debug, refactor, and test code, execute bash and python scripts, manage local project files, and build raw, bespoke web interfaces when asked. You work like a principal software engineer pairing with the user.`,
    `## How to respond & Zeus Harness² Discipline
- Responses are rendered as GitHub-flavored Markdown. Use clear file paths when referring to files.
- Answer what was asked, at the size it was asked. If the user sends a greeting ("Hi", "Hello", "Hey"), reply with one normal, direct sentence (e.g. "Hello! What would you like to build or work on?"). No tools, no files, no screens, no artifacts, no roleplay.
- Never produce a design, template, landing page or mockup unless the user asks for a visual deliverable.
- Be direct. No recaps of what you just did, no emojis, no taglines, no pep.
- Prefer dedicated tools (\`read_file\`, \`edit_file\`, \`write_file\`, \`search_code\`, \`glob\`, \`list_dir\`) over \`shell\` commands; fall back to \`shell\` when a dedicated tool cannot do what you need.
- Do not chain shell commands with separators like \`echo "====";\` or \`printf '---'\`.
- Prefer parallelizing independent tool calls in a single turn.
- Keep changes consistent with the structure, naming, style, and patterns of the surrounding code. Treat unfamiliar files or changes as potential user work and investigate before deleting or overwriting them.
- Never stop mid-task and never ask "tell me to proceed", "shall I continue", or "point me to the entrypoint". If a shell command fails or a directory is large, immediately switch to \`search_code\`, \`list_dir\`, \`read_file\`, or \`python\` and complete the full inspection, implementation, and verification autonomously.
- Match the user's language and the conventions of the project you are in.`,
    mode === "code"
      ? composeHarness2Surface({ profile, workspace: ws, userPrompt: userText })
      : `## Tools
Use tools when the task needs workspace files, shell/python execution, web pages, or user memory (\`memory_search\`, \`memory_save\`, \`memory_edit\`, \`memory_delete\`). User memory is never preloaded into the prompt—always invoke \`memory_search\` when asked what you remember or know about the user's preferences/projects, and invoke \`memory_save\`, \`memory_edit\`, or \`memory_delete\` when asked to record, update, or forget durable facts.`,
    `## Artifacts & OpenDesign Deliverables
When the user asks for a visual deliverable (an interactive prototype, a HyperFrames code-to-video composition, an Open-Slide 1920x1080 deck, a kinetic motion poster, or a Brand/DESIGN.md specimen), emit it as one complete self-contained HTML document inside <artboard name="Short name" device="web" mode="new"><!doctype html>...</html></artboard> (or write it to an .html file in the workspace). It opens next to the chat in the Zeus Workbench with live preview, Direct DOM Inspector, HyperFrames timeline scrubber, WebM/MP4 video export, and slide deck presenter.`,
    (() => {
      const low = userText.toLowerCase();
      let odMode: OpenDesignCreationMode | null = null;
      if (/\b(hyperframes?|video|reel|sizzle|mp4|webm|scene|scenes|frame animation|code[- ]to[- ]video)\b/.test(low)) {
        odMode = "hyperframes";
      } else if (/\b(slide|slides|deck|presentation|pitch deck|open-slide|1920)\b/.test(low)) {
        odMode = "deck";
      } else if (/\b(design\.md|brand kit|brand specimen|style guide|design system)\b/.test(low)) {
        odMode = "brand-kit";
      } else if (DESIGN_ASK.test(userText)) {
        odMode = s.settings.openDesignMode && s.settings.openDesignMode !== "code" ? s.settings.openDesignMode : "prototype";
      }
      if (!odMode) return "";
      return buildOpenDesignDeliverablePrompt({
        mode: odMode,
        brandId: s.settings.openDesignBrandId ?? "m3-expressive",
        aspect: s.settings.openDesignAspect ?? "16:9",
      });
    })(),
    spec.isKeylessScraper && profile.nativeToolProtocol === "scraper_xml_dsl"
      ? `Native workspace tools (\`shell\`/\`bash\`, \`python\`, \`read_file\`, \`write_file\`, \`edit_file\`, \`multi_edit\`, \`search_code\`, \`list_dir\`, \`glob\`, \`grep\`, \`web_fetch\`) are connected and execute after your stream completes via \`<zeus_tool>\` blocks. \`shell\` runs in the user's real shell (Git Bash when installed, else PowerShell 7 or cmd.exe); the working directory persists between calls, commands never get stdin and stop after 5 minutes, so background servers and avoid watch modes. Never claim you lack file, terminal, or python access.`
      : "",
    ws
      ? `## Project\nOpen folder: ${ws.name}${ws.root ? ` (${ws.root})` : ""}. Top-level entries: ${topFiles}.`
      : mode === "code"
      ? `## Project\nNo explicit project folder is selected (tools default to the current working directory). You can still run \`shell\`/\`python\` or read/write files relative to the current directory, or ask the user to open a specific project folder from the sidebar.`
      : "",
    M3E_TRIGGER.test(userText) ? M3E_GUIDE : "",
    memoryBlock(),
  ].filter(Boolean).join("\n\n");
}

type Mapped = { role: "user" | "assistant"; content: string; attachments: { name: string; mime: string; dataUrl: string }[] };

/** History without any canvas state or fake prefill turns, so non-design turns see clean conversation history. */
export function buildPlainContext(opts: {
  convMessages: Message[];
  userMsg: Message;
  quoteToText: (q: Quote, boards: Artboard[]) => string;
  mode?: Intent;
}) {
  const all = [...opts.convMessages, opts.userMsg].filter(
    (m) => !m.error && (m.text.trim() || m.attachments?.length || m.tools?.length)
  );
  const lastAsstIdx = (() => {
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].role === "assistant") return i;
    }
    return -1;
  })();

  const messages: Mapped[] = all.map((m, idx) => {
    let content = m.text;
    if (m.quote) content = opts.quoteToText(m.quote, []) + "\n" + content;
    for (const a of m.attachments ?? []) if (a.text) content += `\n\n[Attached file: ${a.name}]\n${a.text.slice(0, 48000)}`;
    if (m.role === "assistant" && m.tools?.length) {
      const realTools = m.tools.filter(
        (t) => !["provider_notice", "context_compact", "quality_gate", "auto_continue"].includes(t.name)
      );
      if (realTools.length > 0) {
        const isLatestAsst = idx === lastAsstIdx;
        const recentTools = isLatestAsst ? realTools.slice(-28) : realTools.slice(-12);
        const toolSummaries = recentTools
          .map((t, ti) => {
            const isRecentTail = ti >= recentTools.length - 8;
            const perToolCap = isLatestAsst ? (isRecentTail ? 2400 : 450) : 400;
            let argDesc = t.args ?? "";
            try {
              const j = JSON.parse(argDesc);
              argDesc = j.path || j.command || j.query || j.pattern || (typeof j.body === "string" ? j.body.slice(0, 120) : argDesc.slice(0, 120));
            } catch {
              argDesc = argDesc.slice(0, 120);
            }
            const outSnippet = (t.output ?? "").trim().slice(0, perToolCap);
            return `[Executed ${t.name}(${String(argDesc).replace(/\s+/g, " ").trim()}) -> ${t.status === "ok" ? "ok" : "error"}]${
              outSnippet ? `\n${outSnippet}` : ""
            }`;
          })
          .join("\n\n");
        content = [toolSummaries, content].filter(Boolean).join("\n\n");
      }
    }
    if (m.role === "assistant" && m.artboardIds?.length) content += `\n[Opened ${m.artboardIds.length} artifact${m.artboardIds.length > 1 ? "s" : ""} in the preview]`;
    if (
      m.role === "user" &&
      idx === all.length - 1 &&
      opts.mode === "code" &&
      lastAsstIdx >= 0 &&
      /^(cont|continue|go|proceed|do it|apply|yes|ok|okay|start|execute)\b[.!]?$/i.test(content.trim())
    ) {
      content +=
        "\n\n[Continuation directive: The files you already read are in the conversation above. Do NOT re-explore or repeat a plan. Immediately apply the code edits using edit_file / write_file / shell and verify them.]";
    } else if (
      m.role === "user" &&
      idx === all.length - 1 &&
      opts.mode === "code" &&
      all.length > 2 &&
      Boolean(useStore.getState().ui.workspace)
    ) {
      content +=
        "\n\n[Workspace tools active: read_file, search_code, list_dir, edit_file, write_file, shell, python — invoke them directly; never claim you lack repo/file access.]";
    }
    return {
      role: m.role,
      content,
      attachments: (m.attachments ?? [])
        .filter((a) => a.dataUrl && a.mime.startsWith("image/"))
        .map((a) => ({ name: a.name, mime: a.mime, dataUrl: a.dataUrl! })),
    };
  });

  return { messages, themeOverride: null, isCanvasFollowUp: false };
}
