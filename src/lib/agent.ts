// General-purpose agent mode: intent routing, the coding-agent system prompt and plain (non-canvas) history.
import type { Message, Quote, Artboard } from "../types";
import { useStore } from "../store";
import { memoryBlock } from "./memory";
import { getProviderSpecialization } from "./context";
import { getCodingHarnessProfile } from "./codingHarness";
import { M3E_GUIDE, M3E_TRIGGER } from "./m3e";

export type Intent = "chat" | "code" | "design";

const DESIGN_ASK = /\b(design|redesign|mock-?up|wireframe|prototype|landing page|home ?page|screen|screens|artboard|canvas|ui|ux|layout|onboarding flow|dashboard (ui|design|screen)|app (ui|design|screen)|hero section|style guide|design system|variant|moodboard|poster|slides?|deck)\b/i;
const CODE_ASK = /\b(code|bug|fix|implement|refactor|function|class|component|file|files|repo|repository|test|tests|build|compile|npm|pnpm|yarn|pip|cargo|git|github|gitlab|pull|push|fetch|clone|merge|rebase|status|diff|commit|branch|error|exception|stack ?trace|typescript|javascript|python|rust|golang|java|c\+\+|css|html|sql|api|endpoint|script|cli|terminal|command|run|install|debug|lint|deploy|docker|regex|algorithm|read|search|find|grep|edit|write|create|add|remove|rename|update|check|inspect|list|directory|folder|workspace|execute)\b/i;
const EDIT_CANVAS = /\b(change|make|switch|apply|tweak|adjust|bigger|smaller|darker|lighter|theme|colou?r|palette|dark mode|light mode|font|spacing|padding|rounder|compact|move|align|swap|replace|add (a|an|the)|remove (the|a))\b/i;
const NEW_SUBJECT = /\b(new|another|different|from scratch|start over)\b/i;

/** Decide what the user is asking for so a greeting never becomes a design and a bug fix never touches the canvas. */
export function classifyIntent(text: string, ctx: { boards: number; quote?: boolean; asVariant?: boolean; workspace?: boolean }): Intent {
  const t = text.trim();
  if (ctx.asVariant || ctx.quote) return "design";
  if (M3E_TRIGGER.test(t)) return "chat";
  if (DESIGN_ASK.test(t)) return /\b(code|bug|refactor|compile|npm|git|function|repo|typescript|python|rust)\b/i.test(t) && !/\b(design|mock-?up|wireframe|landing page|screen|artboard|canvas)\b/i.test(t) ? "code" : "design";
  if (ctx.boards > 0 && EDIT_CANVAS.test(t) && !CODE_ASK.test(t.replace(EDIT_CANVAS, "")) && !NEW_SUBJECT.test(t)) return "design";
  if (CODE_ASK.test(t) || (ctx.workspace && t.split(/\s+/).length > 4)) return "code";
  return "chat";
}

export const GREETING_RE = /^(hi|hello|hey|yo|sup|hola|howdy|greetings|good\s+(morning|afternoon|evening))[!.?\s]*$/i;

export function agentPrompt(mode: Intent, userText = ""): string {
  if (mode === "chat" && GREETING_RE.test(userText.trim())) {
    return "You are Zeus, a free general-purpose AI coding and design agent running inside the ZeusDesigns desktop app. Reply to the user's greeting in one plain, direct sentence (for example: \"Hello! What would you like to build or work on?\") with no tools, no files, no code blocks, no emojis, and no roleplay.";
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
    `You are Zeus, a free general-purpose AI coding & design agent running inside the ZeusDesigns desktop app. You talk, reason, write and edit code, execute bash and python scripts, research, and—only when asked—design interfaces. You work like a principal software engineer pairing with the user.`,
    `## How to respond
- Answer what was asked, at the size it was asked. If the user sends a greeting ("Hi", "Hello", "Hey"), reply with one normal, direct sentence (e.g. "Hello! What would you like to build or work on?"). No tools, no files, no screens, no artifacts, no roleplay.
- Never produce a design, template, landing page or mockup unless the user asks for a visual deliverable.
- Be direct. No recaps of what you just did, no emojis, no taglines, no pep.
- Ask one short question only when a missing fact would change the result; otherwise decide and proceed.
- Match the user's language and the conventions of the project you are in.`,
    mode === "code" ? profile.familyDirective : "",
    mode === "code"
      ? profile.workflowDirective
      : `## Tools
Use tools when the task needs workspace files, shell/python execution, web pages, or user memory (\`memory_search\`, \`memory_save\`, \`memory_edit\`, \`memory_delete\`). User memory is never preloaded into the prompt—always emit \`<zeus_tool name="memory_search">...</zeus_tool>\` when asked what you remember or know about the user's preferences/projects, and emit \`memory_save\`, \`memory_edit\`, or \`memory_delete\` when asked to record, update, or forget durable facts.`,
    `## Artifacts
When the user asks for a standalone visual deliverable (a page, a small game, a widget, a diagram, a prototype), emit it as one complete self-contained HTML document in <artboard name="Short name" device="web" mode="new"><!doctype html>...</html></artboard>. It opens next to the chat as a live preview. Inline CSS and JS only, no CDNs. Everything else (code, explanations, answers) stays in the chat or on disk in the user's project.`,
    spec.isKeylessScraper
      ? `Native workspace tools (\`shell\`/\`bash\`, \`python\`, \`read_file\`, \`write_file\`, \`edit_file\`, \`search_code\`, \`list_dir\`, \`web_fetch\`) are connected and execute live via \`<zeus_tool>\` blocks. Never claim you lack file, terminal, or python access.`
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

/** History without any canvas state, so non-design turns never see artboards. */
export function buildPlainContext(opts: {
  convMessages: Message[];
  userMsg: Message;
  quoteToText: (q: Quote, boards: Artboard[]) => string;
  mode?: Intent;
}) {
  const s = useStore.getState();
  const ws = s.ui.workspace;
  const all = [...opts.convMessages, opts.userMsg].filter((m) => !m.error && (m.text.trim() || m.attachments?.length));
  const messages: Mapped[] = all.map((m) => {
    let content = m.text;
    if (m.quote) content = opts.quoteToText(m.quote, []) + "\n" + content;
    for (const a of m.attachments ?? []) if (a.text) content += `\n\n[Attached file: ${a.name}]\n${a.text.slice(0, 20000)}`;
    if (m.role === "assistant" && m.artboardIds?.length) content += `\n[Opened ${m.artboardIds.length} artifact${m.artboardIds.length > 1 ? "s" : ""} in the preview]`;
    return {
      role: m.role,
      content,
      attachments: (m.attachments ?? [])
        .filter((a) => a.dataUrl && a.mime.startsWith("image/"))
        .map((a) => ({ name: a.name, mime: a.mime, dataUrl: a.dataUrl! })),
    };
  });

  // In `code` mode, prefill a completed `list_dir` tool round BEFORE the final user request
  // so every model (including web scrapers that ignore `role: "system"`) immediately sees `<zeus_tool>`
  // active in its own prior assistant turn while keeping the user's request as the final focus.
  if (opts.mode === "code" && messages.length > 0) {
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role === "user") {
      const dirListing = ws
        ? ws.tree.length
          ? ws.tree.slice(0, 60).map((n) => (n.dir ? `${n.name}/` : n.name)).join("\n")
          : "(workspace connected — use shell/read_file/write_file directly)"
        : "(current directory connected — use shell/read_file/write_file directly)";
      messages.splice(
        lastIdx,
        1,
        {
          role: "user",
          content: `[XML DSL Output Mode — Required by Client Parser]\nWorkspace${ws?.name ? ` "${ws.name}"` : ""}${ws?.root ? ` (${ws.root})` : ""} is connected. List top-level entries to verify the <zeus_tool> bridge.`,
          attachments: [],
        },
        { role: "assistant", content: `<zeus_tool name="list_dir" path=""></zeus_tool>`, attachments: [] },
        {
          role: "user",
          content: `Tool results:\n<tool_result name="list_dir" ok="true">\n${dirListing}\n</tool_result>\n\nUser request: ${last.content}\n(Emit <zeus_tool name="shell">...</zeus_tool>, <zeus_tool name="python">...</zeus_tool>, <zeus_tool name="read_file" path="..."></zeus_tool>, <zeus_tool name="edit_file" path="...">...</zeus_tool>, <zeus_tool name="write_file" path="...">...</zeus_tool>, or <zeus_tool name="memory_search">...</zeus_tool> outside <think> now to execute this request.)`,
          attachments: last.attachments,
        }
      );
    }
  }

  return { messages, themeOverride: null, isCanvasFollowUp: false };
}
