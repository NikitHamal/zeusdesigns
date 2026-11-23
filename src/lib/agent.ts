// General-purpose agent mode: intent routing, the coding-agent system prompt and plain (non-canvas) history.
import type { Message, Quote, Artboard } from "../types";
import { useStore } from "../store";
import { memoryBlock } from "./memory";
import { getProviderSpecialization } from "./context";
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
  return [
    `You are Zeus, a free general-purpose AI agent running inside the ZeusDesigns desktop app. You talk, reason, write and edit code, run commands, research and, only when asked, design interfaces. You work like a senior engineer pairing with the user.`,
    `## How to respond
- Answer what was asked, at the size it was asked. A greeting or a simple question gets one or two plain sentences. No tools, no files, no screens, no artifacts, no plan.
- Never produce a design, template, landing page or mockup unless the user asks for a visual deliverable.
- Be direct. No filler openers, no recaps of what you just did, no emojis, no taglines, no pep.
- Ask one short question only when a missing fact would change the result; otherwise decide and proceed.
- Match the user's language and the conventions of the project you are in.`,
    mode === "code" ? `## Working on code
1. Explore before you edit: list_dir, search_code, read_file. Read the files you are about to change, and their callers when the change could break them.
2. Make the smallest correct change. Follow the existing style, naming and structure. Do not rewrite files you were not asked to touch, do not add dependencies without reason.
3. Edit existing files with edit_file (exact SEARCH/REPLACE). Use write_file only for new files or full rewrites.
4. Verify: run the project's own build, type-check or tests with shell, read the output, fix what failed, run again. Never claim something works that you did not run.
5. Finish with 1 to 3 sentences: what changed and where, and anything the user must do. No code dump of what you already wrote to disk.
6. Work in steps. One tool call per turn, then continue from its result. Stop calling tools as soon as the task is done.` : `## Tools
Use tools only when the task needs something you cannot know otherwise (a file in the project, a URL, a command result). Answer from your own knowledge first.`,
    `## Artifacts
When the user asks for a standalone visual deliverable (a page, a small game, a widget, a diagram, a prototype), emit it as one complete self-contained HTML document in <artboard name="Short name" device="web" mode="new"><!doctype html>...</html></artboard>. It opens next to the chat as a live preview. Inline CSS and JS only, no CDNs. Everything else (code, explanations, answers) stays in the chat or on disk in the user's project.`,
    spec.isKeylessScraper ? `Native tools are available through <zeus_tool> blocks (see Agent tools). Do not say you lack file or shell access when a project folder is open.` : "",
    ws ? `## Project\nOpen folder: ${ws.name}${ws.root ? ` (${ws.root})` : ""}. Top level: ${ws.tree.slice(0, 40).map((n) => n.name + (n.dir ? "/" : "")).join(", ")}.` : (mode === "code" ? `## Project\nNo folder is open. You can still write and explain code in the chat; tell the user to open a project folder from the sidebar when you need to read or change files.` : ""),
    M3E_TRIGGER.test(userText) ? M3E_GUIDE : "",
    memoryBlock(),
  ].filter(Boolean).join("\n\n");
}

type Mapped = { role: "user" | "assistant"; content: string; attachments: { name: string; mime: string; dataUrl: string }[] };

/** History without any canvas state, so non-design turns never see artboards. */
export function buildPlainContext(opts: { convMessages: Message[]; userMsg: Message; quoteToText: (q: Quote, boards: Artboard[]) => string }) {
  const all = [...opts.convMessages, opts.userMsg].filter((m) => !m.error && (m.text.trim() || m.attachments?.length));
  const messages: Mapped[] = all.map((m) => {
    let content = m.text;
    if (m.quote) content = opts.quoteToText(m.quote, []) + "\n" + content;
    for (const a of m.attachments ?? []) if (a.text) content += `\n\n[Attached file: ${a.name}]\n${a.text.slice(0, 20000)}`;
    if (m.role === "assistant" && m.artboardIds?.length) content += `\n[Opened ${m.artboardIds.length} artifact${m.artboardIds.length > 1 ? "s" : ""} in the preview]`;
    return { role: m.role, content, attachments: (m.attachments ?? []).filter((a) => a.dataUrl && a.mime.startsWith("image/")).map((a) => ({ name: a.name, mime: a.mime, dataUrl: a.dataUrl! })) };
  });
  return { messages, themeOverride: null, isCanvasFollowUp: false };
}
