// Engine integration surface: the few functions engine.ts calls. Everything here degrades to a no-op on error,
// so a harness bug can never break a generation.

import { useStore } from "../../store";
import type { Artboard, Quote } from "../../types";
import { getConversationBoards } from "../context";
import { stripKitBoilerplate } from "../harness";
import { harnessBus } from "./events";
import { ZeusStreamSession } from "./fsm";
import { guardFullWrite, type GuardResult } from "./guard";
import { applyPatchBlocks } from "./patch";
import {
  assembleWorkspaceState,
  compactCanvasState,
  compactHistory,
  compileSovereignPrompt,
  selectActiveBoards,
} from "./prompt";
import { validateDocument } from "./sanitizer";
import { fatalErrors, useSovereign } from "./state";
import { getVfs, syncBoardsToVfs } from "./vfsBinding";
import { markHealed, registerHealSender, scheduleAutoHeal } from "./healer";
import { reportHarnessError } from "./host";
import type { ChatLike, SelectedElementContext } from "./types";

export { registerHealSender };

const ELEMENT_TTL_MS = 30 * 60 * 1000;

let turnStartedAt = 0;

/** Start of a turn: heal turns keep their attempt counter, user turns reset it. */
export function beginTurn(opts: { heal: boolean }): void {
  turnStartedAt = Date.now();
  const sov = useSovereign.getState();
  sov.setHealingTurn(opts.heal);
  if (!opts.heal) sov.resetAttempts();
  sov.setPlan("");
}

/** The inspected element is only attached when the user's quote points at it. */
export function resolveElementForTurn(quote?: Quote): SelectedElementContext | null {
  const el = useSovereign.getState().selectedElement;
  if (!el || !quote || quote.kind !== "element" || quote.artboardId !== el.boardId) return null;
  return Date.now() - el.at > ELEMENT_TTL_MS ? null : el;
}

const hasScript = (html: string) => /<script\b(?![^>]*data-zeus)/i.test(html);

export function sovereignSystemSection(a: {
  userText: string;
  boards: Artboard[];
  target?: Artboard;
  quote?: Quote;
  heal?: boolean;
  isFollowUp?: boolean;
}): string {
  try {
    const el = resolveElementForTurn(a.quote);
    const errBoard = a.target?.id ?? a.boards[0]?.id;
    const errors = errBoard ? useSovereign.getState().errors[errBoard] ?? [] : [];
    const compiled = compileSovereignPrompt({
      userText: a.userText,
      hasBoards: a.boards.length > 0,
      hasTarget: !!a.target,
      hasSelectedElement: !!el,
      hasRuntimeError: errors.length > 0,
      isFollowUp: a.isFollowUp ?? a.boards.length > 0,
      healing: a.heal,
      hasScripts: a.target ? hasScript(a.target.html) : undefined,
      boardNames: a.boards.map((b) => b.name),
    });
    useSovereign.getState().setSkills(compiled.skills);
    harnessBus.emit("onSkillsRouted", { skills: compiled.skills });
    return compiled.text;
  } catch (e) {
    console.warn("[zeus-harness] prompt compile failed", e);
    return "";
  }
}

/** Replaces the bulky per-screen dumps with the authoritative compact state + telemetry. */
export function adaptHistory<T extends ChatLike>(
  history: T[],
  a: {
    userText: string;
    boards: Artboard[];
    target?: Artboard;
    quote?: Quote;
    maxCharsPerScreen: number;
    lastTouchedIds?: string[];
  }
): T[] {
  try {
    if (history.length === 0) return history;
    const lastIdx = history.length - 1;
    let last = history[lastIdx].content;
    const hadCanvasState = /<canvas_state\b/i.test(last);
    const hadCurrent = /<current_artboard\b/i.test(last);
    if (hadCanvasState && a.boards.length > 0) {
      const activeIds = selectActiveBoards(a.userText, a.boards, { targetId: a.target?.id, lastTouchedIds: a.lastTouchedIds });
      last = last.replace(
        /<canvas_state\b[^>]*>[\s\S]*?<\/canvas_state>/i,
        () => compactCanvasState(a.boards, { activeIds, maxChars: a.maxCharsPerScreen, strip: stripKitBoilerplate })
      );
    }
    const el = resolveElementForTurn(a.quote);
    const focus = a.target ?? a.boards[0];
    const sov = useSovereign.getState();
    const errors = focus ? sov.errors[focus.id] ?? [] : [];
    const head = getVfs(useStore.getState().activeConvId).headSnapshot;
    const state = assembleWorkspaceState({
      head: head ? { id: head.id, label: head.label, seq: head.seq } : null,
      selectedElement: el,
      selectedBoardName: el ? a.boards.find((b) => b.id === el.boardId)?.name : undefined,
      errors,
      errorBoardName: focus?.name,
    });
    if (state) last = `${last}\n\n${state}`;
    const next = history.map((m, i) => (i === lastIdx ? ({ ...m, content: last } as T) : m));
    return compactHistory(next, { authoritativeState: hadCanvasState || hadCurrent });
  } catch (e) {
    console.warn("[zeus-harness] history adaptation failed", e);
    return history;
  }
}

/* ---------------- live telemetry from the FSM ---------------- */
export function createLiveTelemetry() {
  const session = new ZeusStreamSession({ artboardAlias: true });
  let plan = "";
  const handle = (events: ReturnType<ZeusStreamSession["update"]>["events"]) => {
    for (const e of events) {
      switch (e.type) {
        case "plan:start":
          plan = "";
          harnessBus.emit("onPlanStart", { at: Date.now() });
          break;
        case "plan:delta":
          plan += e.delta;
          harnessBus.emit("onPlanDelta", { delta: e.delta, full: plan });
          break;
        case "plan:end":
          useSovereign.getState().setPlan(e.full.trim());
          harnessBus.emit("onPlanEnd", { plan: e.full.trim() });
          break;
        case "action:start":
          harnessBus.emit("onFileStart", { path: e.path, kind: e.kind });
          break;
        case "action:delta":
          harnessBus.emit("onFileDelta", { path: e.path, delta: e.delta });
          break;
        case "action:end":
          harnessBus.emit("onFileEnd", { path: e.path, kind: e.kind, closed: e.closed });
          break;
        default:
          break;
      }
    }
  };
  return {
    update(full: string) {
      try {
        handle(session.update(full).events);
      } catch (e) {
        console.warn("[zeus-harness] telemetry parse failed", e);
      }
    },
    finish() {
      try {
        handle(session.finish());
      } catch {
        /* ignore */
      }
    },
  };
}

/* ---------------- write paths ---------------- */
export interface PatchOutcome {
  html: string | null;
  applied: number;
  failed: number;
  strategies: string[];
  reasons: string[];
}

/** Applies a patch body to a board's current (kit-stripped) HTML. `html` is null when nothing applied. */
export function computePatch(currentHtml: string, patchBody: string): PatchOutcome {
  const r = applyPatchBlocks(stripKitBoilerplate(currentHtml), patchBody);
  return {
    html: r.applied > 0 && r.changed ? r.content : null,
    applied: r.applied,
    failed: r.failed.length,
    strategies: r.strategies,
    reasons: r.failed.map((f) => f.reason),
  };
}

export function announcePatch(board: Artboard, o: PatchOutcome): void {
  if (o.applied > 0) {
    harnessBus.emit("onPatchApplied", { boardId: board.id, path: board.name, applied: o.applied, failed: o.failed, strategies: o.strategies });
  }
  if (o.failed > 0) {
    harnessBus.emit("onPatchFailed", { boardId: board.id, path: board.name, reasons: o.reasons });
    reportHarnessError(board.id, {
      kind: "patch",
      message: `${o.failed} of ${o.applied + o.failed} patch block(s) did not match: ${o.reasons[0] ?? "unknown"}`,
      fatal: o.applied === 0,
      at: Date.now(),
    });
  }
}

/** Guard a model-authored full rewrite of an existing board against lazy placeholders and silent truncation. */
export function guardRevise(board: Artboard, nextHtml: string): GuardResult {
  try {
    const g = guardFullWrite(stripKitBoilerplate(board.html), nextHtml);
    if (g.status !== "ok") {
      harnessBus.emit("onTruncationGuard", { boardId: board.id, status: g.status === "merged" ? "merged" : "rejected", reasons: g.reasons });
    }
    if (g.status === "rejected") {
      reportHarnessError(board.id, { kind: "truncated", message: g.reasons.join("; "), fatal: true, at: Date.now() });
    }
    return g;
  } catch {
    return { html: nextHtml, status: "ok", reasons: [] };
  }
}

/* ---------------- end of turn ---------------- */
export function afterGeneration(a: { boardIds: string[]; patched: number; ms: number; label: string; heal: boolean }): void {
  try {
    const S = useStore.getState();
    const boardIds = [...new Set(a.boardIds)].filter((id) => S.artboards.some((b) => b.id === id));
    for (const id of boardIds) {
      const board = S.artboards.find((b) => b.id === id)!;
      const report = validateDocument(board.html);
      // the document was replaced this turn: errors recorded before the turn describe the old document
      useSovereign.setState((st) => ({
        errors: { ...st.errors, [id]: (st.errors[id] ?? []).filter((e) => e.at >= turnStartedAt) },
      }));
      if (!report.ok) {
        for (const err of report.errors) reportHarnessError(id, err);
      } else if (fatalErrors(id).length === 0) {
        if (a.heal) markHealed(id);
        else useSovereign.getState().clearErrors(id);
      }
      harnessBus.emit("onPreviewReady", { boardId: id, version: board.version });
      if (fatalErrors(id).length > 0) scheduleAutoHeal(id, a.heal ? 600 : 1200);
    }
    if (boardIds.length > 0) {
      const kind = a.heal ? "heal" : a.patched > 0 ? "patch" : "generation";
      const prefix = a.heal ? "Self-heal" : a.patched > 0 ? "Patch" : "Design";
      syncBoardsToVfs(`${prefix}: ${a.label.replace(/\s+/g, " ").slice(0, 56)}`, kind);
    }
    useSovereign.getState().setSelectedElement(null);
    useSovereign.getState().setHealingTurn(false);
    harnessBus.emit("onComplete", { boardIds, patched: a.patched, ms: a.ms, healed: a.heal });
  } catch (e) {
    console.warn("[zeus-harness] post-generation failed", e);
  }
}

/**
 * Planning protocol + craft skills for visual deliverables that reach the model through the general agent prompt.
 * Called only when a deliverable was requested, so chat and pure code turns never see it.
 */
export function sovereignDeliverableSection(userText: string): string {
  try {
    const boards = getConversationBoards();
    const compiled = compileSovereignPrompt({
      userText,
      hasBoards: boards.length > 0,
      hasTarget: false,
      hasSelectedElement: false,
      hasRuntimeError: false,
      isFollowUp: boards.length > 0,
      boardNames: boards.map((b) => b.name),
    });
    useSovereign.getState().setSkills(compiled.skills);
    harnessBus.emit("onSkillsRouted", { skills: compiled.skills });
    return compiled.text;
  } catch {
    return "";
  }
}
