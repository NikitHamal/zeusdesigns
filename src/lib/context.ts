// Keyless Agent Harness Specialization, Multi-Turn Canvas State Synchronizer,
// Real Context Window Tracker, Auto/Manual Compactor, and Continuation Engine.

import { activeConv, uid, useStore } from "../store";
import type { Artboard, Message, Quote } from "../types";
import { getDS, tokensCss } from "./designSystems";
import { stripKitBoilerplate } from "./harness";
import { memoryBlock } from "./memory";
import { oneShot } from "./oneshot";
import { findProvider } from "./providers";
import { SKILLS } from "./skills";
import { studioBrief } from "./studio";

export interface ProviderSpecialization {
  providerId: string;
  modelId: string;
  contextWindow: number;
  effectiveBudgetTokens: number;
  maxOutputTokens: number;
  maxCanvasScreensInPrompt: number;
  maxCharsPerScreen: number;
  isKeylessScraper: boolean;
  reinforceInUserTurn: boolean;
  specializationPrompt: string;
}

const SCRAPER_PROVIDERS = new Set([
  "mercury3",
  "kilo",
  "nimcloud",
  "colibriqwen",
  "gemma4vl",
  "phi4cloud",
  "llamacppcloud",
  "ollamacloud",
  "gemma4pro",
  "frontierlab",
  "liquidai",
  "bonsaicloud",
  "unslothcloud",
  "koboldcloud",
  "blockrun",
  "ovhcloud",
  "freecc",
  "vlmrun",
  "together2api",
  "hfcluster",
  "aihorde",
  "apisfreellm",
  "qwen",
  "ptero",
  "unikey",
  "llm7",
  "pollinations",
  "yqcloud",
  "k2horizon",
  "motif",
  "deepai",
  "longcat",
  "geminiweb",
  "chatjimmy",
]);

export function getProviderSpecialization(providerId: string, modelId: string): ProviderSpecialization {
  const isCustom = providerId.startsWith("custom:");
  const prov = findProvider(providerId);
  const model = prov.models.find((m) => m.id === modelId) ?? prov.models[0];
  const contextWindow = isCustom ? 128000 : model?.contextWindow ?? prov.contextWindow ?? 128000;
  const maxOutputTokens = isCustom ? 16384 : model?.maxOutput ?? 8192;
  const isKeylessScraper = !isCustom && SCRAPER_PROVIDERS.has(providerId);

  // Scraped web endpoints perform best when active prompt payload stays under a fast budget
  // while still carrying the full live canvas HTML of all active screens.
  const effectiveBudgetTokens =
    providerId === "chatjimmy" ? 14000 :
    providerId === "longcat" || providerId === "geminiweb" ? 24000 :
    providerId === "deepai" || providerId === "motif" ? 28000 :
    36000;

  const maxCanvasScreensInPrompt = providerId === "chatjimmy" ? 2 : 4;
  const maxCharsPerScreen = providerId === "chatjimmy" ? 6000 : 12000;

  const specializationPrompt = isKeylessScraper
    ? `## Keyless Agent Harness Specialization (${prov.name} · ${model?.label ?? modelId})
- You are running inside the native ZeusDesigns desktop harness with a live bi-directional bridge to the infinite canvas and Zeus Studio tools.
- NEVER say "I can't directly access or edit the canvas here", "I can't inspect the existing sheets", or "Share their HTML". The harness automatically provides the live canvas HTML inside <canvas_state> or <current_artboard>, and every <artboard> or <zeus_tool> block you emit is parsed and executed in real time on the canvas.
- Since native JSON function-calling is bypassed in this fast streaming channel, invoke tools by emitting XML tags:
  <zeus_tool name="studio_patch_screen">{"id":"<screen_id>","selector":":root","css":"--primary:#2e7d32;--container:#c8f2cb;"}</zeus_tool>
  or directly emit updated screens with:
  <artboard id="<existing_id>" name="<existing_name>" device="mobile|tablet|web" mode="revise">
  <!doctype html>...complete updated HTML document...
  </artboard>
- When the user asks in a follow-up turn to change the theme, palette, dark/light mode, typography, spacing, or layout of the existing screens on the canvas, you MUST preserve their existing layout and content and output a mode="revise" <artboard> block for each existing screen id in <canvas_state>.`
    : `## Native Agent Harness
- You are connected directly to the ZeusDesigns multi-artboard canvas. Emit <artboard id="..." name="..." device="..." mode="revise"> to update existing screens in place, or <artboard name="..." device="..." mode="new"> to create new screens.`;

  return {
    providerId,
    modelId,
    contextWindow,
    effectiveBudgetTokens,
    maxOutputTokens,
    maxCanvasScreensInPrompt,
    maxCharsPerScreen,
    isKeylessScraper,
    reinforceInUserTurn: isKeylessScraper,
    specializationPrompt,
  };
}

/* ------------------------------------------------------------------ */
/* Token Estimation & Real Context Window Breakdown                    */
/* ------------------------------------------------------------------ */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

export interface ContextWindowStats {
  systemTokens: number;
  canvasTokens: number;
  historyTokens: number;
  memoryTokens: number;
  totalTokens: number;
  contextWindow: number;
  effectiveBudget: number;
  percentOfWindow: number;
  percentOfBudget: number;
  messageCount: number;
  canvasScreenCount: number;
  compactedCount: number;
  needsCompaction: boolean;
}

/** Resolves all active artboards for the current page or conversation so multi-turn follow-ups never lose canvas sheets. */
export function getConversationBoards(s = useStore.getState()): Artboard[] {
  const onActivePage = s.artboards.filter((a) => a.pageId === s.activePageId);
  if (onActivePage.length > 0) return onActivePage;
  const conv = activeConv(s);
  const msgBoardIds = new Set(conv.messages.flatMap((m) => m.artboardIds ?? []));
  const fromMessages = s.artboards.filter((a) => msgBoardIds.has(a.id));
  if (fromMessages.length > 0) return fromMessages;
  const convPageIds = new Set(s.pages.filter((p) => p.convId === s.activeConvId).map((p) => p.id));
  return s.artboards.filter((a) => convPageIds.has(a.pageId));
}

export function getContextWindowStats(): ContextWindowStats {
  const s = useStore.getState();
  const conv = activeConv(s);
  const spec = getProviderSpecialization(s.settings.providerId, s.settings.modelId);
  const ds = getDS(s.settings.designSystemId);
  const skills = SKILLS.filter((k) => s.settings.skills.includes(k.id));
  const boards = getConversationBoards(s);

  const sysBase = tokensCss(ds) + ds.guidelines + skills.map((k) => k.prompt).join("\n") + studioBrief("", ds) + spec.specializationPrompt;
  const systemTokens = estimateTokens(sysBase) + 1450; // base harness prompt rules
  const memoryTokens = estimateTokens(memoryBlock()) + 320;

  const canvasClean = boards
    .slice(0, spec.maxCanvasScreensInPrompt)
    .map((a) => stripKitBoilerplate(a.html).slice(0, spec.maxCharsPerScreen))
    .join("\n");
  const canvasTokens = estimateTokens(canvasClean);

  let historyChars = 0;
  for (const m of conv.messages) {
    historyChars += (m.text?.length ?? 0) + (m.quote?.text?.length ?? 0);
    if (m.attachments) {
      for (const a of m.attachments) historyChars += (a.text?.slice(0, 20000).length ?? 0);
    }
  }
  // Account for reconstructed assistant artboard HTML on the latest assistant design turn
  const lastAsstWithBoards = [...conv.messages].reverse().find((m) => m.role === "assistant" && m.artboardIds && m.artboardIds.length > 0);
  if (lastAsstWithBoards?.artboardIds) {
    for (const id of lastAsstWithBoards.artboardIds.slice(0, 3)) {
      const b = s.artboards.find((x) => x.id === id);
      if (b) historyChars += Math.min(stripKitBoilerplate(b.html).length, 6000);
    }
  }
  const historyTokens = Math.ceil(historyChars / 3.8);
  const totalTokens = systemTokens + memoryTokens + canvasTokens + historyTokens;

  const percentOfWindow = Math.min(100, Math.round((totalTokens / spec.contextWindow) * 100));
  const percentOfBudget = Math.min(100, Math.round((totalTokens / spec.effectiveBudgetTokens) * 100));
  const needsCompaction =
    conv.messages.length >= 6 &&
    (totalTokens >= spec.effectiveBudgetTokens * 0.78 || conv.messages.length >= 14);

  return {
    systemTokens,
    canvasTokens,
    historyTokens,
    memoryTokens,
    totalTokens,
    contextWindow: spec.contextWindow,
    effectiveBudget: spec.effectiveBudgetTokens,
    percentOfWindow,
    percentOfBudget,
    messageCount: conv.messages.length,
    canvasScreenCount: boards.length,
    compactedCount: conv.compactedCount ?? 0,
    needsCompaction,
  };
}

/* ------------------------------------------------------------------ */
/* Theme & Palette Override Synthesizer for Multi-Turn Canvas Edits    */
/* ------------------------------------------------------------------ */
export interface ThemePaletteOverride {
  name: string;
  mode: "light" | "dark" | "preserve";
  vars: Record<string, string>;
  cssBlock: string;
}

const COLOR_PALETTES: Record<
  string,
  {
    label: string;
    light: { primary: string; onPrimary: string; container: string; onContainer: string; bg: string; surface: string; surface2: string; text: string; muted: string; outline: string };
    dark: { primary: string; onPrimary: string; container: string; onContainer: string; bg: string; surface: string; surface2: string; text: string; muted: string; outline: string };
  }
> = {
  green: {
    label: "Forest & Emerald Green",
    light: { primary: "#1b6d3e", onPrimary: "#ffffff", container: "#c4f0d2", onContainer: "#072914", bg: "#f4fbf6", surface: "#ebf5ee", surface2: "#dfeee4", text: "#111f16", muted: "#4a6352", outline: "#bdd4c4" },
    dark: { primary: "#6dd58c", onPrimary: "#063818", container: "#164e2b", onContainer: "#c4f0d2", bg: "#0d1510", surface: "#142018", surface2: "#1c2c22", text: "#e4f2e7", muted: "#93b09b", outline: "#2d4435" },
  },
  teal: {
    label: "Deep Teal & Mint",
    light: { primary: "#0f6b63", onPrimary: "#ffffff", container: "#bcece6", onContainer: "#042623", bg: "#f3faf9", surface: "#eaf4f3", surface2: "#dceceb", text: "#10201e", muted: "#496360", outline: "#bad3d0" },
    dark: { primary: "#5fd4c9", onPrimary: "#043732", container: "#134e48", onContainer: "#bcece6", bg: "#0c1514", surface: "#13211f", surface2: "#1b2d2b", text: "#e1f2f0", muted: "#8fb0ad", outline: "#2b4542" },
  },
  orange: {
    label: "Warm Terracotta & Amber",
    light: { primary: "#b84a1d", onPrimary: "#ffffff", container: "#ffdbce", onContainer: "#380d00", bg: "#fdf8f5", surface: "#f6efe9", surface2: "#ede3db", text: "#221915", muted: "#6b5850", outline: "#d8c4b9" },
    dark: { primary: "#ffb59a", onPrimary: "#5c1900", container: "#7d2c08", onContainer: "#ffdbce", bg: "#17110e", surface: "#221915", surface2: "#2e221d", text: "#f5ded6", muted: "#b69c92", outline: "#483730" },
  },
  yellow: {
    label: "Solar Gold & Ochre",
    light: { primary: "#8f6200", onPrimary: "#ffffff", container: "#ffdf9e", onContainer: "#2d1d00", bg: "#fdf9f1", surface: "#f6f0e4", surface2: "#ece4d3", text: "#201b10", muted: "#675e4b", outline: "#d4c7b0" },
    dark: { primary: "#f7be48", onPrimary: "#472f00", container: "#664500", onContainer: "#ffdf9e", bg: "#16130b", surface: "#211c11", surface2: "#2c2618", text: "#f2e6d0", muted: "#b1a48b", outline: "#453d2b" },
  },
  red: {
    label: "Crimson & Rose Clay",
    light: { primary: "#b3262e", onPrimary: "#ffffff", container: "#ffd9dc", onContainer: "#400008", bg: "#fdf7f7", surface: "#f7eded", surface2: "#eee0e1", text: "#231718", muted: "#6c5658", outline: "#dabfc1" },
    dark: { primary: "#ffb3b8", onPrimary: "#680012", container: "#8e1120", onContainer: "#ffd9dc", bg: "#181011", surface: "#241819", surface2: "#302022", text: "#f6dddf", muted: "#b8999c", outline: "#4a3436" },
  },
  pink: {
    label: "Sakura & Berry",
    light: { primary: "#a83264", onPrimary: "#ffffff", container: "#ffd8e6", onContainer: "#3d001d", bg: "#fdf7f9", surface: "#f7edf1", surface2: "#eee0e6", text: "#22171b", muted: "#6a555e", outline: "#d8bec8" },
    dark: { primary: "#ffafd0", onPrimary: "#630031", container: "#86194b", onContainer: "#ffd8e6", bg: "#171013", surface: "#23181c", surface2: "#2f2026", text: "#f5dde5", muted: "#b699a3", outline: "#48333b" },
  },
  monochrome: {
    label: "Graphite Monochrome",
    light: { primary: "#18181b", onPrimary: "#ffffff", container: "#e4e4e7", onContainer: "#09090b", bg: "#fafafa", surface: "#f4f4f5", surface2: "#e4e4e7", text: "#09090b", muted: "#52525b", outline: "#d4d4d8" },
    dark: { primary: "#f4f4f5", onPrimary: "#09090b", container: "#27272a", onContainer: "#f4f4f5", bg: "#09090b", surface: "#121215", surface2: "#1c1c21", text: "#fafafa", muted: "#a1a1aa", outline: "#2e2e36" },
  },
};

const COLOR_SYNONYMS: [RegExp, string][] = [
  [/\b(green|emerald|forest|sage|mint|olive|lime|jade|matcha|verdant)\b/i, "green"],
  [/\b(teal|turquoise|aqua|cyan|seafoam|ocean)\b/i, "teal"],
  [/\b(orange|terracotta|amber|copper|rust|peach|apricot|clay|coral)\b/i, "orange"],
  [/\b(yellow|gold|golden|ochre|mustard|sunflower|honey|warm)\b/i, "yellow"],
  [/\b(red|crimson|scarlet|ruby|burgundy|maroon|cherry|brick)\b/i, "red"],
  [/\b(pink|rose|magenta|berry|sakura|blush|flamingo)\b/i, "pink"],
  [/\b(mono|monochrome|black and white|grayscale|greyscale|graphite|charcoal|minimalist black)\b/i, "monochrome"],
];

const FONT_OVERRIDES: [RegExp, string, string, string][] = [
  [/\b(fraunces|editorial\s+serif|warm\s+serif)\b/i, "Editorial Fraunces + DM Sans", '"Fraunces",Georgia,serif', '"DM Sans",system-ui,sans-serif'],
  [/\b(instrument\s+serif|condensed\s+serif|elegant\s+serif)\b/i, "Instrument Serif + Inter", '"Instrument Serif",Georgia,serif', '"Inter",system-ui,sans-serif'],
  [/\b(space\s+grotesk|technical\s+sans|brutalist\s+font)\b/i, "Space Grotesk + Inter", '"Space Grotesk",system-ui,sans-serif', '"Inter",system-ui,sans-serif'],
  [/\b(plus\s+jakarta|jakarta|friendly\s+sans)\b/i, "Plus Jakarta Sans", '"Plus Jakarta Sans",system-ui,sans-serif', '"Plus Jakarta Sans",system-ui,sans-serif'],
  [/\b(jetbrains\s+mono|monospace\s+font|developer\s+mono)\b/i, "JetBrains Mono", '"JetBrains Mono",monospace', '"Inter",system-ui,sans-serif'],
  [/\b(manrope)\b/i, "Manrope + Inter", '"Manrope",system-ui,sans-serif', '"Inter",system-ui,sans-serif'],
  [/\b(dm\s+sans)\b/i, "DM Sans", '"DM Sans",system-ui,sans-serif', '"DM Sans",system-ui,sans-serif'],
];

export function detectThemeOverride(prompt: string, existingHtml = ""): ThemePaletteOverride | null {
  const t = prompt.toLowerCase();
  for (const [re, label, heading, body] of FONT_OVERRIDES) {
    if (re.test(t) && /\b(font|type|typography|heading|serif|sans|mono|use|switch|change|make)\b/i.test(t)) {
      const vars: Record<string, string> = { "--heading": heading, "--font": body };
      const cssVars = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
      return {
        name: `${label} Typography`,
        mode: "preserve",
        vars,
        cssBlock: `<style data-zeus-fonts-override>:root,body,.z-shadow-body,.z-screen,.z-shell{${cssVars}}</style>`,
      };
    }
  }

  const isThemeRequest =
    /\b(theme|color|colour|palette|recolor|re-color|tint|shade|mode|make it|change .* to|switch .* to|apply .* theme|in green|in teal|in red|in orange|in pink|in yellow|in dark|in light)\b/i.test(t) ||
    /^(green|emerald|teal|orange|terracotta|red|crimson|pink|yellow|gold|dark mode|light mode)\b/i.test(t.trim());

  if (!isThemeRequest) return null;

  const wantsDark = /\b(dark|night|midnight|obsidian|amoled)\b/i.test(t);
  const wantsLight = /\b(light|day|bright|cream|ivory|paper)\b/i.test(t);
  const isCurrentlyDark = /--bg\s*:\s*#[012][0-9a-f]/i.test(existingHtml);
  const useDark = wantsDark ? true : wantsLight ? false : isCurrentlyDark;

  for (const [re, key] of COLOR_SYNONYMS) {
    if (re.test(t)) {
      const entry = COLOR_PALETTES[key];
      const pal = useDark ? entry.dark : entry.light;
      const vars: Record<string, string> = {
        "--primary": pal.primary,
        "--on-primary": pal.onPrimary,
        "--container": pal.container,
        "--on-container": pal.onContainer,
        "--bg": pal.bg,
        "--surface": pal.surface,
        "--surface-2": pal.surface2,
        "--text": pal.text,
        "--muted": pal.muted,
        "--outline": pal.outline,
      };
      const cssVars = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
      return {
        name: `${entry.label} (${useDark ? "Dark" : "Light"})`,
        mode: wantsDark ? "dark" : wantsLight ? "light" : "preserve",
        vars,
        cssBlock: `<style data-zeus-theme>:root,body,.z-shadow-body,.z-screen,.z-shell{${cssVars}}</style>`,
      };
    }
  }

  const hexMatch = /#([0-9a-f]{6})\b/i.exec(t);
  if (hexMatch) {
    const hex = `#${hexMatch[1].toLowerCase()}`;
    const pal = useDark ? COLOR_PALETTES.monochrome.dark : COLOR_PALETTES.monochrome.light;
    const vars: Record<string, string> = {
      "--primary": hex,
      "--on-primary": "#ffffff",
      "--container": `color-mix(in srgb, ${hex} 22%, ${pal.surface})`,
      "--on-container": pal.text,
      "--bg": pal.bg,
      "--surface": pal.surface,
      "--surface-2": pal.surface2,
      "--text": pal.text,
      "--muted": pal.muted,
      "--outline": pal.outline,
    };
    const cssVars = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
    return {
      name: `Custom Accent (${hex})`,
      mode: wantsDark ? "dark" : wantsLight ? "light" : "preserve",
      vars,
      cssBlock: `<style data-zeus-theme>:root,body,.z-shadow-body,.z-screen,.z-shell{${cssVars}}</style>`,
    };
  }

  if (wantsDark || wantsLight) {
    const pal = wantsDark ? COLOR_PALETTES.monochrome.dark : COLOR_PALETTES.monochrome.light;
    const vars: Record<string, string> = {
      "--bg": pal.bg,
      "--surface": pal.surface,
      "--surface-2": pal.surface2,
      "--text": pal.text,
      "--muted": pal.muted,
      "--outline": pal.outline,
    };
    const cssVars = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
    return {
      name: wantsDark ? "Dark Surface Palette" : "Light Surface Palette",
      mode: wantsDark ? "dark" : "light",
      vars,
      cssBlock: `<style data-zeus-theme>:root,body,.z-shadow-body,.z-screen,.z-shell{${cssVars}}</style>`,
    };
  }

  return null;
}

/** Deterministically applies a theme palette override into an artboard HTML document while preserving 100% of its layout. */
export function applyThemeOverrideToHtml(html: string, theme: ThemePaletteOverride): string {
  if (!html) return html;
  let next = html.replace(/<style\b[^>]*data-zeus-theme[^>]*>[\s\S]*?<\/style>/gi, "");
  // Also update inline :root tokens inside data-zeus-kit if present so ShadowFrame + Export stay in sync
  next = next.replace(/(<style\b[^>]*data-zeus-kit[^>]*>[\s\S]*?:root\s*\{)([^}]*)(\})/i, (_m, pre: string, body: string, post: string) => {
    let updated = body;
    for (const [k, v] of Object.entries(theme.vars)) {
      const re = new RegExp(`${k}\\s*:\\s*[^;]+`, "i");
      if (re.test(updated)) updated = updated.replace(re, `${k}:${v}`);
      else updated += `;${k}:${v}`;
    }
    return `${pre}${updated}${post}`;
  });
  if (/<\/head>/i.test(next)) {
    return next.replace(/<\/head>/i, `${theme.cssBlock}</head>`);
  }
  return theme.cssBlock + next;
}

/* ------------------------------------------------------------------ */
/* Refusal Detector for Keyless Scraped Models                         */
/* ------------------------------------------------------------------ */
const REFUSAL_PATTERNS = [
  /can['’]?t\s+(?:directly\s+)?(?:access|edit|inspect|modify|see|view|reach|update)\s+(?:or\s+(?:edit|inspect|modify|update)\s+)?(?:the\s+)?(?:canvas|sheets|artboards|screens|existing)/i,
  /cannot\s+(?:directly\s+)?(?:access|edit|inspect|modify|see|view|reach|update)\s+(?:or\s+(?:edit|inspect|modify|update)\s+)?(?:the\s+)?(?:canvas|sheets|artboards|screens|existing)/i,
  /unable\s+to\s+(?:directly\s+)?(?:access|edit|inspect|modify|see|view)\s+(?:the\s+)?(?:canvas|sheets|artboards|screens)/i,
  /share\s+(?:their|the|your)\s+(?:html|code|markup|sheets)/i,
  /paste\s+(?:their|the|your)\s+(?:html|code|markup|sheets)/i,
  /provide\s+(?:their|the|your)\s+(?:html|code|markup|sheets)/i,
  /don['’]?t\s+have\s+(?:direct\s+)?(?:access|visibility)\s+to\s+(?:the\s+)?(?:canvas|existing\s+sheets|existing\s+screens)/i,
];

export function isCanvasRefusal(text: string): boolean {
  if (!text || text.includes("<artboard")) return false;
  return REFUSAL_PATTERNS.some((re) => re.test(text));
}

export function looksLikeRefusalStart(text: string): boolean {
  const clean = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
  if (!clean || clean.includes("<artboard") || clean.includes("<zeus_tool")) return false;
  return /^(?:i\s+can['’]?t|i\s+cannot|i\s+am\s+unable|i\s+don['’]?t\s+have\s+direct|sorry,?\s+i\s+can['’]?t)/i.test(clean);
}

/* ------------------------------------------------------------------ */
/* Multi-Turn History & Live Canvas Context Builder                    */
/* ------------------------------------------------------------------ */
const NEW_UNRELATED_APP = /\b(design a new|create a new|build a new|start a new|from scratch)\b/i;

export function buildMultiTurnContext(opts: {
  convMessages: Message[];
  userMsg: Message;
  boards: Artboard[];
  target?: Artboard;
  asVariant?: boolean;
  quoteToText: (q: Quote, boards: Artboard[]) => string;
  spec: ProviderSpecialization;
}): {
  messages: { role: "user" | "assistant"; content: string; attachments: { name: string; mime: string; dataUrl: string }[] }[];
  themeOverride: ThemePaletteOverride | null;
  isCanvasFollowUp: boolean;
} {
  const { convMessages, userMsg, boards, target, asVariant, quoteToText, spec } = opts;
  const allMsgs = [...convMessages, userMsg].filter((m) => !m.error);

  // Find the latest assistant turn that produced or updated artboards so we can reconstruct its <artboard> output in history
  const latestAsstWithBoardsId = [...convMessages]
    .reverse()
    .find((m) => m.role === "assistant" && m.artboardIds && m.artboardIds.length > 0)?.id;

  const mapped = allMsgs.map((m) => {
    let content = m.text;
    if (m.quote) content = quoteToText(m.quote, boards) + "\n" + content;
    if (m.attachments) {
      for (const a of m.attachments) {
        if (a.text) content += `\n\n[Attached file: ${a.name}]\n${a.text.slice(0, 20000)}`;
      }
    }
    // Reconstruct <artboard> tags on assistant turns so keyless models see in-context that they emit <artboard> blocks
    if (m.role === "assistant" && m.artboardIds && m.artboardIds.length > 0) {
      const mBoards = m.artboardIds
        .map((id) => boards.find((b) => b.id === id))
        .filter(Boolean) as Artboard[];
      if (mBoards.length > 0) {
        if (m.id === latestAsstWithBoardsId && target) {
          // If a specific target is already inlined in the user turn, include compact stubs in assistant turn
          const stubs = mBoards
            .map((b) => `<artboard id="${b.id}" name="${b.name}" device="${b.device}" mode="revise"><!-- [live on canvas v${b.version}] --></artboard>`)
            .join("\n");
          content = `${content}\n\n${stubs}`.trim();
        } else if (m.id === latestAsstWithBoardsId) {
          // Include compact clean HTML of the assistant's generated screens so Turn 2+ has full visibility
          const blocks = mBoards
            .slice(0, spec.maxCanvasScreensInPrompt)
            .map((b) => {
              const clean = stripKitBoilerplate(b.html).slice(0, spec.maxCharsPerScreen);
              return `<artboard id="${b.id}" name="${b.name}" device="${b.device}" mode="revise">\n${clean}\n</artboard>`;
            })
            .join("\n\n");
          content = `${content}\n\n${blocks}`.trim();
        } else {
          const stubs = mBoards
            .map((b) => `<artboard id="${b.id}" name="${b.name}" device="${b.device}" mode="revise"><!-- [v${b.version}] --></artboard>`)
            .join("\n");
          content = `${content}\n\n${stubs}`.trim();
        }
      }
    }
    return {
      role: m.role,
      content,
      attachments: (m.attachments ?? [])
        .filter((a) => a.dataUrl && a.mime.startsWith("image/"))
        .map((a) => ({ name: a.name, mime: a.mime, dataUrl: a.dataUrl! })),
    };
  });

  const themeOverride = detectThemeOverride(userMsg.text, (target ?? boards[0])?.html ?? "");
  const isCanvasFollowUp =
    boards.length > 0 &&
    !asVariant &&
    !NEW_UNRELATED_APP.test(userMsg.text) &&
    (Boolean(target) ||
      Boolean(themeOverride) ||
      convMessages.length > 0 ||
      /\b(change|update|edit|revise|modify|make|switch|apply|add|remove|replace|adjust|tweak|fix|theme|color|palette|dark|light|font|bigger|smaller|compact|all|screens|sheets|cards|nav|header|first|second|third)\b/i.test(
        userMsg.text
      ));

  const last = mapped[mapped.length - 1];
  if (target) {
    const cleanTarget = stripKitBoilerplate(target.html).slice(0, 24000);
    const themeNote = themeOverride
      ? `\nTarget theme tokens to apply on :root: ${Object.entries(themeOverride.vars).map(([k, v]) => `${k}:${v}`).join("; ")}`
      : "";
    last.content += `\n\n<current_artboard id="${target.id}" name="${target.name}" device="${target.device}">\n${cleanTarget}\n</current_artboard>${themeNote}\n${
      asVariant
        ? 'Create this as a NEW variant (<artboard name="..." device="' + target.device + '" mode="new">).'
        : `Revise this screen in place (<artboard id="${target.id}" name="${target.name}" device="${target.device}" mode="revise">...full updated HTML...</artboard>).`
    }`;
  } else if (boards.length > 0 && isCanvasFollowUp) {
    const activeBoards = boards.slice(0, spec.maxCanvasScreensInPrompt);
    const stateXml = activeBoards
      .map((b) => {
        const clean = stripKitBoilerplate(b.html).slice(0, spec.maxCharsPerScreen);
        return `<artboard id="${b.id}" name="${b.name}" device="${b.device}" version="${b.version}">\n${clean}\n</artboard>`;
      })
      .join("\n\n");
    const themeDirective = themeOverride
      ? `\nApply the requested "${themeOverride.name}" palette by setting these CSS variables on :root (or in a <style data-zeus-theme> block in <head>): ${Object.entries(themeOverride.vars).map(([k, v]) => `${k}:${v}`).join("; ")}.`
      : "";
    last.content += `\n\n<canvas_state count="${activeBoards.length}">\n${stateXml}\n</canvas_state>\n[Live Canvas Directive: The ${activeBoards.length} screen(s) above are currently live on the user's canvas. You have direct write access to edit them. Preserve their existing layouts and content while fulfilling the user's request.${themeDirective} Output <artboard id="<existing_id>" name="<existing_name>" device="<device>" mode="revise">...complete updated HTML...</artboard> for each screen you are updating (${activeBoards.map((b) => `id="${b.id}"`).join(", ")}). NEVER claim you cannot access or inspect the canvas.]`;
  } else if (spec.reinforceInUserTurn && convMessages.length > 0) {
    last.content += `\n\n[Zeus Protocol Reminder: Reply with 1-2 short sentences (no emojis, no leaked plan labels) followed immediately by complete <artboard name="..." device="mobile|tablet|web" mode="new|revise"><!doctype html>...</html></artboard> documents.]`;
  }

  if (last && last.attachments.length > 0) {
    last.content += `\n\n[Multimodal Vision Directive: The user attached ${last.attachments.length} reference image(s) (${last.attachments.map((a) => a.name).join(", ")}). Inspect the visual layout, component hierarchy, typography, color palette, and content of the attached image(s) directly. If the user asks to recreate, clone, redesign, or draw inspiration from the image, output complete <artboard> HTML screens that faithfully capture its structure while obeying all Zeus design laws (no box-shadows, no emojis, no blue/purple gradients).]`;
  }

  return { messages: mapped, themeOverride, isCanvasFollowUp };
}

/* ------------------------------------------------------------------ */
/* Auto-Compaction & Manual Compaction Engine                          */
/* ------------------------------------------------------------------ */
function buildDeterministicSummary(messagesToCompact: Message[], boards: Artboard[]): string {
  const userRequests = messagesToCompact
    .filter((m) => m.role === "user")
    .map((m) => `- User asked: "${m.text.slice(0, 160).replace(/\n+/g, " ")}"`)
    .slice(-8);
  const touchedIds = new Set<string>();
  for (const m of messagesToCompact) {
    for (const id of m.artboardIds ?? []) touchedIds.add(id);
  }
  const activeScreens = boards
    .filter((b) => touchedIds.has(b.id) || boards.length <= 6)
    .map((b) => `${b.name} (id=${b.id}, ${b.device}, v${b.version})`);

  return [
    `**Compacted Context Summary** (${messagesToCompact.length} earlier messages compressed)`,
    userRequests.length ? `Earlier design requests:\n${userRequests.join("\n")}` : "",
    activeScreens.length ? `Active canvas screens: ${activeScreens.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function compactConversation(opts: { convId?: string; manual?: boolean } = {}): Promise<{
  compacted: boolean;
  savedTokens: number;
  summary: string;
}> {
  const st = useStore.getState();
  const targetConvId = opts.convId ?? st.activeConvId;
  const conv = st.conversations.find((c) => c.id === targetConvId);
  if (!conv || conv.messages.length < 4) {
    if (opts.manual) st.notify("Conversation is already compact");
    return { compacted: false, savedTokens: 0, summary: "" };
  }

  // Keep the most recent 2 messages (last user + assistant pair) intact and compact everything before them
  const keepCount = Math.min(2, conv.messages.length - 2);
  const head = conv.messages.slice(0, conv.messages.length - keepCount);
  const tail = conv.messages.slice(conv.messages.length - keepCount);
  const boards = st.artboards.filter((a) => a.pageId === st.activePageId);

  const beforeTokens = estimateTokens(head.map((m) => m.text).join("\n"));
  let summary = buildDeterministicSummary(head, boards);

  try {
    const transcript = head
      .map((m) => `${m.role.toUpperCase()}: ${m.text.slice(0, 500)}`)
      .join("\n\n")
      .slice(0, 8000);
    const llmSummary = await Promise.race([
      oneShot(
        "Summarize this earlier UI design conversation into 4 concise bullet points: (1) Product domain & target audience, (2) Chosen colors/theme/typography preferences, (3) Screen names & IDs created, (4) Key layout constraints. Output ONLY the bullet points, no intro, no emojis.",
        transcript,
        { effort: "low", timeoutMs: 8000 }
      ),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    if (llmSummary && llmSummary.trim().length > 30) {
      summary = `**Compacted Context Summary** (${head.length} messages compressed)\n\n${llmSummary.trim()}`;
    }
  } catch {
    // Deterministic summary is already prepared and instant
  }

  const afterTokens = estimateTokens(summary);
  const savedTokens = Math.max(120, beforeTokens - afterTokens);
  const allBoardIds = [...new Set(head.flatMap((m) => m.artboardIds ?? []))];

  const summaryMsg: Message = {
    id: uid(),
    role: "assistant",
    text: summary,
    compacted: true,
    artboardIds: allBoardIds,
    at: Date.now(),
  };

  useStore.setState((s) => ({
    conversations: s.conversations.map((c) =>
      c.id === targetConvId
        ? {
            ...c,
            messages: [summaryMsg, ...tail],
            compactedCount: (c.compactedCount ?? 0) + head.length,
          }
        : c
    ),
  }));

  if (opts.manual) {
    useStore.getState().notify(`Compacted ${head.length} messages · freed ~${savedTokens.toLocaleString()} tokens`);
  }
  return { compacted: true, savedTokens, summary };
}

/* ------------------------------------------------------------------ */
/* Continuation Prompt Builder for Truncated Streams                   */
/* ------------------------------------------------------------------ */
export function buildContinuationPrompt(unclosedName: string, partialHtml: string): string {
  const tail = partialHtml.slice(-260);
  return `[Continuation Request: Your previous <artboard name="${unclosedName}"> stopped mid-HTML before closing </html></artboard>. Below are the exact last characters you emitted:
\`\`\`html
${tail}
\`\`\`
Continue outputting ONLY the remaining HTML starting immediately after the snippet above, and close with </body></html></artboard>. Do not repeat the beginning of the document.]`;
}
