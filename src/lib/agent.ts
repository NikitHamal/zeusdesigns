// General-purpose agent mode: intent routing, the coding-agent system prompt and plain (non-canvas) history.
import type { Message, Quote, Artboard } from "../types";
import { useStore } from "../store";
import { memoryBlock } from "./memory";
import { getProviderSpecialization } from "./context";
import { getCodingHarnessProfile } from "./codingHarness";
import { M3E_GUIDE, M3E_TRIGGER } from "./m3e";

export type Intent = "chat" | "code" | "design";

const DESIGN_ASK = /\b(design|redesign|mock-?up|wireframe|prototype|landing page|home ?page|screen|screens|artboard|canvas|ui|ux|layout|onboarding flow|dashboard (ui|design|screen)|app (ui|design|screen)|hero section|style guide|design system|variant|moodboard|poster|slides?|deck)\b/i;
const CODE_ASK = /\b(code|bug|fix|implement|refactor|function|class|component|file|files|repo|repository|test|tests|build|compile|npm|pnpm|yarn|pip|cargo|git|commit|branch|error|exception|stack ?trace|typescript|javascript|python|rust|golang|java|c\+\+|css|html|sql|api|endpoint|script|cli|terminal|command|run|install|debug|lint|deploy|docker|regex|algorithm|read|search|find|grep|edit|write|create|add|remove|rename|update)\b/i;
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

export function agentPrompt(mode: Intent, userText = ""): string {
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
- Answer what was asked, at the size it was asked. A greeting or a simple question gets one or two plain sentences. No tools, no files, no screens, no artifacts, no plan.
- Never produce a design, template, landing page or mockup unless the user asks for a visual deliverable.
- Be direct. No filler openers, no recaps of what you just did, no emojis, no taglines, no pep.
- Ask one short question only when a missing fact would change the result; otherwise decide and proceed.
- Match the user's language and the conventions of the project you are in.`,
    mode === "code" ? profile.familyDirective : "",
    mode === "code"
      ? profile.workflowDirective
      : `## Tools
Use tools only when the task needs something you cannot know otherwise (a file in the project, a URL, a shell/python command result). Answer from your own knowledge first.`,
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

  // In `code` mode when a workspace is open, prefill the final user turn with a completed `list_dir`
  // tool round so models immediately see `<zeus_tool>` working in their own voice and never waste
  // Turn 1 calling `list_dir` on `.` again.
  if (opts.mode === "code" && ws && messages.length > 0) {
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role === "user") {
      const dirListing = ws.tree.length
        ? ws.tree.slice(0, 60).map((n) => (n.dir ? `${n.name}/` : n.name)).join("\n")
        : "Directory is empty (0 files). Proceed directly without re-listing.";
      messages.splice(
        lastIdx,
        1,
        last,
        { role: "assistant", content: `<zeus_tool name="list_dir" path=""></zeus_tool>`, attachments: [] },
        {
          role: "user",
          content: `Tool results:\n<tool_result name="list_dir" ok="true">\n${dirListing}\n</tool_result>\nContinue the task from these results. Emit <zeus_tool name="shell">...</zeus_tool>, <zeus_tool name="python">...</zeus_tool>, <zeus_tool name="read_file" path="..."></zeus_tool>, <zeus_tool name="edit_file" path="...">...</zeus_tool>, or <zeus_tool name="write_file" path="...">...</zeus_tool> to complete the request.`,
          attachments: [],
        }
      );
    }
  }

  return { messages, themeOverride: null, isCanvasFollowUp: false };
}
