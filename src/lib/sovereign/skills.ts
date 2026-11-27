// Harness skill library + router (Pillar 1).
//
// Skills are small, composable instruction modules. The router picks the minimum set that fits the turn so the
// prompt stays lean: a one-word color tweak does not pay for the SVG skill, a crash repair does not pay for the
// aesthetics skill. Every skill obeys the Zeus design laws (no shadows, no emojis, no LIVE badges, no
// blue/purple gradients, no CDNs, Material Symbols only, bundled fonts only).

import type { SkillId, SkillMatch } from "./types";

export interface RouteContext {
  userText: string;
  hasBoards: boolean;
  hasTarget: boolean;
  hasSelectedElement: boolean;
  hasRuntimeError: boolean;
  isFollowUp: boolean;
  /** Set when the turn was started by the self-healing controller. */
  healing?: boolean;
  /** Whether the target/active screens already contain custom scripts. */
  hasScripts?: boolean;
}

export interface SkillDef {
  id: SkillId;
  name: string;
  summary: string;
  prompt: string;
}

const UI_CRAFT = `- Commit to ONE aesthetic idea from your plan and let every choice serve it: type, spacing, color, density. A screen that could belong to any product is a failed screen.
- Hierarchy first: one dominant element per viewport, two supporting levels, everything else quiet. Use a modular type scale (12/14/16/20/28/44) on a 4px spacing grid. Alternate dense data regions with generous whitespace; whitespace is a decision, not a leftover.
- Editorial typography: pair a display face with a text face from the bundled fonts, tight tracking on large display text (-0.02em), tabular numerals for data (font-variant-numeric: tabular-nums), 60-72ch measure for prose, line-height 1.1-1.2 display and 1.5 body.
- Color comes from the active design-system tokens. A new accent is defined as one-hue OKLCH ramp (oklch(L C H)). Text contrast >= 4.5:1, large text and UI borders >= 3:1. Dark and light themes share a hue family with adjusted lightness and chroma, never a naive invert.
- Banned clichés: centered hero over three identical icon cards, gradient blobs, glass cards piled on gradients, stock-photo placeholders, "Welcome to", "Unlock the power of", "seamless", "all-in-one", Lorem ipsum, John Doe, foo/bar, 123-456, and a repeated $99.
- Realistic domain data only: believable names, currencies, dates, units and uneven numbers (2,847 not 1,000). Write only the copy the layout needs, in the voice of the domain.
- Micro-interactions: every interactive element has hover, focus-visible, active and disabled treatment; transitions 120-200ms ease-out; honor prefers-reduced-motion.
- Accessibility: semantic landmarks, every control labelled, visible 2px focus outline with offset, touch targets >= 40px, never convey state by color alone.`;

const SURGICAL = `- The screen already exists and the user likes most of it. Change only what was asked.
- Emit mode="patch" with SEARCH/REPLACE blocks. SEARCH is a verbatim copy (indentation included) of the smallest unique region, usually 2-6 lines, taken from <canvas_state> or <current_artboard>. REPLACE is that same region, edited. Several small blocks beat one large block.
- Preserve every class, id, data attribute, script, state variable and event handler you were not asked to change. Do not reformat, reorder, rename or tidy untouched code.
- New CSS goes into the existing <style> block beside related rules (patch that block); use inline styles only where the screen already does.
- When <selected_element> is present, locate it by dom_path, classes and text; keep the patch inside that element and the CSS rules that style it.
- If the change would touch more than about 40% of the screen, use mode="revise" with the COMPLETE file. Never emit partial files or "... rest unchanged" markers: the harness rejects them.`;

const INTERACTIVE = `- Ship a working prototype, not a picture. Every button, tab, filter, toggle, form and menu on the screen does something observable.
- Use small vanilla JS in one <script> before </body>: a plain state object, render functions, event delegation. Build real tabs and segmented controls, filtering and sorting, modals and drawers (focus trap, Esc closes), accordions, form validation messages, optimistic updates and transient confirmations.
- Design every state: empty, loading (tonal skeleton blocks), error, populated, disabled. At least one non-default state must be reachable by interaction (for example clearing filters shows the empty state).
- Charts are inline SVG or CSS bars rendered from the state data, and they re-render when the data changes.
- Mock data lives in one const at the top of the script, realistic and varied.
- Defensive code: null-check every query, no uncaught errors, no alert/confirm/prompt, no dependence on localStorage for first render. Keep existing scripts intact when revising.`;

const SVG_ASSETS = `- No external images, CDNs or emoji. Build visuals as inline SVG: bespoke marks, illustrations, patterns, geometric or initial avatars, data visualisations.
- UI icons use <i data-i="material_symbol_name"></i>. Hand-written SVG is for brand marks, illustrations and charts only.
- SVG craft: set viewBox, avoid fixed width/height unless needed, color through currentColor or CSS variables, round linecap and linejoin, a consistent 1.5-2px stroke, aria-hidden="true" when decorative and a <title> when meaningful.
- Data viz: compute scales from the data, label axes, direct-label series instead of a legend when possible, tonal single-hue ramps, gridlines at 8-12% opacity.
- Gradients only in warm or neutral hues and only when they earn their place; prefer flat shapes, dot grids and hatch patterns. No drop-shadow filters.`;

const SELF_HEALER = `- Mode: DIAGNOSE AND REPAIR. The live preview reported an error; it is listed in <runtime_telemetry> with message, line/column and a source excerpt.
- Do not redesign. Find the root cause and make the smallest edit that removes it: which statement throws, what is undefined, which tag, quote or brace is unclosed.
- Reply with one sentence naming the cause, then a mode="patch" artboard (or mode="revise" with the COMPLETE file when the file is unusable). Keep any <zeus_plan> to two lines.
- Frequent causes: querySelector on a node that does not exist, script running before the DOM, unclosed tag/quote/brace, undefined variable, duplicate const, missing </script>, an ES module import that cannot resolve.
- Keep behaviour identical. Never delete a feature to silence an error and never wrap the whole script in try/catch to hide it.
- Error kind "patch": your previous SEARCH block did not match; copy the verbatim lines from <current_artboard>. Error kind "truncated": the previous rewrite was cut short; resend the complete file or small patches.`;

export const SKILL_LIBRARY: Record<SkillId, SkillDef> = {
  "ui-craft-excellence": {
    id: "ui-craft-excellence",
    name: "UI craft excellence",
    summary: "Anti-generic design rules: hierarchy, typography, tokens, contrast, realistic data.",
    prompt: UI_CRAFT,
  },
  "surgical-refactoring": {
    id: "surgical-refactoring",
    name: "Surgical refactoring",
    summary: "Minimal-diff edits that preserve surrounding layout, state and scripts.",
    prompt: SURGICAL,
  },
  "interactive-prototyping": {
    id: "interactive-prototyping",
    name: "Interactive prototyping",
    summary: "Working states: modals, tabs, filters, charts, empty/loading/error.",
    prompt: INTERACTIVE,
  },
  "svg-and-visual-assets": {
    id: "svg-and-visual-assets",
    name: "SVG and visual assets",
    summary: "Inline SVG marks, illustrations and data visualisation.",
    prompt: SVG_ASSETS,
  },
  "runtime-self-healer": {
    id: "runtime-self-healer",
    name: "Runtime self-healer",
    summary: "Diagnostic repair mode triggered by sandbox compile or runtime errors.",
    prompt: SELF_HEALER,
  },
};

const NEW_SUBJECT = /\b(new|another|different|from scratch|start over|brand new)\b/i;
const INTERACTIVE_ASK =
  /\b(interactive|prototype|click|tap|modal|dialog|drawer|tab|tabs|filter|sort|toggle|switch|dropdown|menu|accordion|carousel|form|validate|dashboard|chart|graph|animate|animation|flow|checkout|search|wizard|stepper|kanban|calendar|state|working|functional|real)\b/i;
const VISUAL_ASK =
  /\b(logo|icon|icons|illustration|svg|chart|charts|graph|visuali[sz]ation|data ?viz|graphic|pattern|avatar|diagram|infographic|mascot|emblem|sparkline)\b/i;
const HEAL_ASK = /\b(error|errors|broken|crash|crashed|blank|white screen|not working|doesn'?t work|fix with zeus|bug|exception|undefined|failed)\b/i;
const CREATE_ASK = /\b(design|create|build|make|generate|draft|mock-?up|landing|screen|page|app|dashboard|poster|deck)\b/i;

/** Picks the minimum useful skill set (max 4). Pure and deterministic. */
export function routeSkills(ctx: RouteContext): SkillMatch[] {
  const t = ctx.userText;
  const out: SkillMatch[] = [];
  const add = (id: SkillId, reason: string) => {
    if (!out.some((s) => s.id === id)) out.push({ id, reason });
  };

  const healing = ctx.healing || (ctx.hasRuntimeError && (HEAL_ASK.test(t) || /fix|repair|resolve/i.test(t)));
  if (healing) add("runtime-self-healer", ctx.healing ? "self-heal turn started by the harness" : "runtime error present and the user asked for a fix");

  const editing = ctx.hasBoards && (ctx.hasTarget || ctx.hasSelectedElement || ctx.isFollowUp) && !NEW_SUBJECT.test(t);
  if (editing) add("surgical-refactoring", ctx.hasSelectedElement ? "a canvas element is selected" : "editing an existing screen");

  const creating = !editing || NEW_SUBJECT.test(t) || (CREATE_ASK.test(t) && !ctx.hasBoards);
  if (!healing && (creating || /\b(redesign|restyle|polish|refine|elevate|improve)\b/i.test(t))) {
    add("ui-craft-excellence", creating ? "new design work" : "visual refinement");
  }
  if (!healing && INTERACTIVE_ASK.test(t)) add("interactive-prototyping", "request implies behaviour and states");
  else if (!healing && creating && ctx.hasScripts !== false && /\b(app|dashboard|tool|product|checkout|portal|platform)\b/i.test(t)) {
    add("interactive-prototyping", "app-like deliverable");
  }
  if (VISUAL_ASK.test(t) && !healing) add("svg-and-visual-assets", "request mentions custom visuals");

  // keep the prompt lean: healer wins, otherwise at most 4
  return out.slice(0, 4);
}

export function skillSection(matches: SkillMatch[]): string {
  if (!matches.length) return "";
  return [
    "## Harness skills active for this turn",
    ...matches.map((m) => `### skill:${m.id}\n${SKILL_LIBRARY[m.id].prompt}`),
  ].join("\n");
}
