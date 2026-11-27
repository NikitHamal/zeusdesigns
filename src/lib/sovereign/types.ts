// Zeus Sovereign Harness: shared, dependency-free contracts.
// Every module under src/lib/sovereign is split into a PURE core (no store, no DOM) that is unit tested in
// scripts/test-sovereign.mjs, and a thin STORE-BOUND layer (state.ts, host.ts, integration.ts).

export type SkillId =
  | "ui-craft-excellence"
  | "surgical-refactoring"
  | "interactive-prototyping"
  | "svg-and-visual-assets"
  | "runtime-self-healer";

export type RuntimeErrorKind =
  | "compile" // syntax / bundler / babel failure
  | "runtime" // window.onerror
  | "promise" // unhandledrejection
  | "react" // error boundary
  | "console" // console.error / console.warn anomaly
  | "resource" // failed asset or import load
  | "patch" // a SEARCH/REPLACE block could not be applied
  | "truncated"; // lazy / cut-off full-file write that was rejected

export interface RuntimeErrorPayload {
  kind: RuntimeErrorKind;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  componentStack?: string;
  source?: string;
  /** Fatal errors can trigger the self-healing loop. Warnings only show in the banner. */
  fatal: boolean;
  at: number;
}

export interface ElementRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Everything the inspector knows about a clicked element inside a preview. */
export interface SelectedElementContext {
  boardId: string;
  tag: string;
  component?: string;
  id: string;
  classes: string[];
  text: string;
  styles: Record<string, string>;
  domPath: string;
  sourceLocator: string;
  outerHtml: string;
  rect: ElementRect;
  at: number;
}

/** Minimal board shape used by the pure context assembler (structurally compatible with the store's Artboard). */
export interface BoardLike {
  id: string;
  name: string;
  device: string;
  html: string;
  version: number;
}

/** Plain chat message shape used by the history compactor. */
export interface ChatLike {
  role: "user" | "assistant";
  content: string;
  attachments?: unknown[];
}

export interface SkillMatch {
  id: SkillId;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Typed harness events (Pillar 7)                                     */
/* ------------------------------------------------------------------ */
export interface HarnessEventMap {
  onPlanStart: { at: number };
  onPlanDelta: { delta: string; full: string };
  onPlanEnd: { plan: string };
  onFileStart: { path: string; kind: "file" | "patch" };
  onFileDelta: { path: string; delta: string };
  onFileEnd: { path: string; kind: "file" | "patch"; closed: boolean };
  onPatchApplied: { boardId: string; path: string; applied: number; failed: number; strategies: string[] };
  onPatchFailed: { boardId: string; path: string; reasons: string[] };
  onTruncationGuard: { boardId: string; status: "merged" | "rejected"; reasons: string[] };
  onSnapshot: { id: string; label: string; version: number };
  onPreviewReady: { boardId: string; version: number };
  onRuntimeError: { boardId: string; error: RuntimeErrorPayload };
  onElementSelected: { element: SelectedElementContext };
  onSelfHealAttempt: { boardId: string; attempt: number; max: number; auto: boolean };
  onSelfHealResolved: { boardId: string; attempts: number };
  onSelfHealExhausted: { boardId: string; attempts: number };
  onSkillsRouted: { skills: SkillMatch[] };
  onComplete: { boardIds: string[]; patched: number; ms: number; healed: boolean };
}

export type HarnessEventName = keyof HarnessEventMap;

/* ------------------------------------------------------------------ */
/* Sandbox <-> host protocol (Pillars 5 and 6)                         */
/* ------------------------------------------------------------------ */
export const SOV_CHANNEL = "sov" as const;
export const SOV_COMMAND_CHANNEL = "sov-cmd" as const;
export const MSG_RUNTIME_ERROR = "ZEUS_RUNTIME_ERROR" as const;
export const MSG_PREVIEW_READY = "ZEUS_PREVIEW_READY" as const;
export const MSG_ELEMENT_SELECTED = "ZEUS_ELEMENT_SELECTED" as const;
export const MSG_INSPECT_MODE = "ZEUS_INSPECT_MODE" as const;

export const MAX_AUTO_HEAL_ATTEMPTS = 2;
