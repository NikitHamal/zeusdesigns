// Host side of the 2-way sandbox bridge (Pillars 5 and 6).
// One global message listener validates and sanitises everything coming out of preview iframes, then routes it
// into the harness state, the typed event bus and the self-healing controller. Idempotent: call install freely.

import { useStore } from "../../store";
import type { Quote } from "../../types";
import { harnessBus } from "./events";
import { ensureBaseline, syncBoardsToVfs } from "./vfsBinding";
import { scheduleAutoHeal, markHealed } from "./healer";
import { fatalErrors, useSovereign } from "./state";
import {
  MSG_ELEMENT_SELECTED,
  MSG_INSPECT_MODE,
  MSG_PREVIEW_READY,
  MSG_RUNTIME_ERROR,
  SOV_CHANNEL,
  SOV_COMMAND_CHANNEL,
  type RuntimeErrorKind,
  type RuntimeErrorPayload,
  type SelectedElementContext,
} from "./types";

const KINDS: RuntimeErrorKind[] = ["compile", "runtime", "promise", "react", "console", "resource", "patch", "truncated"];

const str = (v: unknown, n: number): string => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function sanitizeError(raw: unknown): RuntimeErrorPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = KINDS.includes(r.kind as RuntimeErrorKind) ? (r.kind as RuntimeErrorKind) : "runtime";
  const message = str(r.message, 600);
  if (!message) return null;
  return {
    kind,
    message,
    file: str(r.file, 200) || undefined,
    line: num(r.line),
    column: num(r.column),
    stack: str(r.stack, 800) || undefined,
    componentStack: str(r.componentStack, 800) || undefined,
    source: str(r.source, 300) || undefined,
    fatal: r.fatal === true,
    at: Date.now(),
  };
}

export function sanitizeElement(boardId: string, raw: unknown): SelectedElementContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tag = str(r.tag, 40);
  if (!tag) return null;
  const styles: Record<string, string> = {};
  if (r.styles && typeof r.styles === "object") {
    for (const [k, v] of Object.entries(r.styles as Record<string, unknown>).slice(0, 24)) styles[k.slice(0, 40)] = str(v, 80);
  }
  const rect = (r.rect ?? {}) as Record<string, unknown>;
  return {
    boardId,
    tag,
    component: str(r.component, 80) || undefined,
    id: str(r.id, 80),
    classes: Array.isArray(r.classes) ? r.classes.filter((c): c is string => typeof c === "string").slice(0, 16).map((c) => c.slice(0, 60)) : [],
    text: str(r.text, 160),
    styles,
    domPath: str(r.domPath, 300),
    sourceLocator: str(r.sourceLocator, 200),
    outerHtml: str(r.outerHtml, 900),
    rect: { x: num(rect.x) ?? 0, y: num(rect.y) ?? 0, w: num(rect.w) ?? 0, h: num(rect.h) ?? 0 },
    at: Date.now(),
  };
}

/** Records an error, notifies listeners and (for fatal ones) arms the self-healing loop. */
export function reportHarnessError(boardId: string, error: RuntimeErrorPayload): void {
  const fresh = useSovereign.getState().addError(boardId, error);
  if (!fresh) return;
  harnessBus.emit("onRuntimeError", { boardId, error });
  if (error.fatal) scheduleAutoHeal(boardId);
}

function handleReady(boardId: string, fatalCount: number): void {
  const board = useStore.getState().artboards.find((a) => a.id === boardId);
  harnessBus.emit("onPreviewReady", { boardId, version: board?.version ?? 0 });
  if (fatalCount === 0 && fatalErrors(boardId).length > 0) markHealed(boardId);
}

function handleSelected(boardId: string, raw: unknown): void {
  const el = sanitizeElement(boardId, raw);
  if (!el) return;
  const sov = useSovereign.getState();
  sov.setSelectedElement(el);
  sov.setInspect(false);
  harnessBus.emit("onElementSelected", { element: el });
  const label = `${el.component ? el.component + " " : ""}${el.tag}${el.classes[0] ? "." + el.classes[0] : ""}`.trim();
  const quote: Quote = { kind: "element", artboardId: boardId, label, text: el.outerHtml.replace(/\s+/g, " ").slice(0, 420) };
  useStore.getState().patchUI({ chatCollapsed: false });
  window.dispatchEvent(new CustomEvent("zeus:quote", { detail: quote }));
}

function onMessage(e: MessageEvent): void {
  const d = e.data as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || d.zeus !== SOV_CHANNEL) return;
  const boardId = str(d.boardId, 64);
  if (!boardId || !useStore.getState().artboards.some((a) => a.id === boardId)) return;
  switch (d.type) {
    case MSG_RUNTIME_ERROR: {
      const err = sanitizeError(d.error);
      if (err) reportHarnessError(boardId, err);
      break;
    }
    case MSG_PREVIEW_READY:
      handleReady(boardId, num(d.errors) ?? 0);
      break;
    case MSG_ELEMENT_SELECTED:
      handleSelected(boardId, d.element);
      break;
    case MSG_INSPECT_MODE:
      if (d.on === false) useSovereign.getState().setInspect(false);
      break;
  }
}

/** Host -> sandbox command (used by the toolbar when the preview frame is already mounted). */
export function postInspectMode(win: Window | null | undefined, on: boolean): void {
  win?.postMessage({ zeus: SOV_COMMAND_CHANNEL, type: MSG_INSPECT_MODE, on }, "*");
}

let installed = false;
export function installHostBridge(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("message", onMessage);
  let lastBoards = useStore.getState().artboards;
  let lastConv = useStore.getState().activeConvId;
  let timer: ReturnType<typeof setTimeout> | undefined;
  useStore.subscribe((s) => {
    if (s.activeConvId !== lastConv) {
      lastConv = s.activeConvId;
      lastBoards = s.artboards;
      useSovereign.getState().clearErrors();
      useSovereign.getState().setInspect(false);
      setTimeout(ensureBaseline, 300);
      return;
    }
    if (s.artboards === lastBoards) return;
    lastBoards = s.artboards;
    if (s.busy) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!useStore.getState().busy) syncBoardsToVfs("Manual edit", "manual", { onlyChanged: true });
    }, 1500);
  });
  setTimeout(ensureBaseline, 600);
}
