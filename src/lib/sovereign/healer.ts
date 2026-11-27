// Host-side self-healing controller (Pillar 5).
//
// Error in -> bounded repair loop out. Fatal errors reach `scheduleAutoHeal`, which waits for generation to be
// idle, then asks the model (skill:runtime-self-healer) for a minimal patch, at most MAX_AUTO_HEAL_ATTEMPTS times
// per user turn. Manual "Fix with Zeus" is always allowed. Disable auto repair with localStorage
// `zeus-autoheal` = "off".

import { useStore } from "../../store";
import type { Quote } from "../../types";
import { harnessBus } from "./events";
import { fatalErrors, useSovereign } from "./state";
import { MAX_AUTO_HEAL_ATTEMPTS } from "./types";

type Sender = (opts: { text: string; quote?: Quote; heal?: boolean }) => Promise<unknown> | void;
let send: Sender | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Registered by engine.ts so this module never imports the engine (no import cycle). */
export function registerHealSender(fn: Sender): void {
  send = fn;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "..." : s);

export function autoHealEnabled(): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem("zeus-autoheal") !== "off";
  } catch {
    return true;
  }
}

export function healPromptText(boardName: string, kind: string, message: string, line?: number): string {
  return `Fix the ${kind} error in "${boardName}": ${clip(message.replace(/\s+/g, " "), 160)}${line ? ` (line ${line})` : ""}`;
}

/** Starts one repair turn. `auto` repairs respect the retry cap; manual ones never do. */
export function requestHeal(boardId: string, opts: { auto: boolean }): boolean {
  const S = useStore.getState();
  if (S.busy || !send) return false;
  const board = S.artboards.find((a) => a.id === boardId);
  const sov = useSovereign.getState();
  const errors = sov.errors[boardId] ?? [];
  if (!board || errors.length === 0) return false;
  const h = sov.heal[boardId] ?? { attempts: 0, status: "idle" as const };
  if (opts.auto && h.attempts >= MAX_AUTO_HEAL_ATTEMPTS) {
    sov.setHeal(boardId, { status: "failed" });
    harnessBus.emit("onSelfHealExhausted", { boardId, attempts: h.attempts });
    return false;
  }
  const attempt = h.attempts + 1;
  sov.setHeal(boardId, { attempts: attempt, status: "healing" });
  harnessBus.emit("onSelfHealAttempt", { boardId, attempt, max: MAX_AUTO_HEAL_ATTEMPTS, auto: opts.auto });
  const first = [...errors].reverse().find((e) => e.fatal) ?? errors[errors.length - 1];
  void send({
    text: healPromptText(board.name, first.kind, first.message, first.line),
    quote: { kind: "artboard", artboardId: boardId, label: board.name },
    heal: true,
  });
  return true;
}

/** Debounced: lets a burst of errors from one render collapse into a single repair turn. */
export function scheduleAutoHeal(boardId: string, delay = 1200): void {
  if (!autoHealEnabled()) return;
  clearTimeout(timers.get(boardId));
  timers.set(
    boardId,
    setTimeout(() => {
      timers.delete(boardId);
      const S = useStore.getState();
      if (S.busy) {
        scheduleAutoHeal(boardId, 2500);
        return;
      }
      if (fatalErrors(boardId).length === 0) return;
      const h = useSovereign.getState().heal[boardId];
      if (h?.status === "healing") return;
      requestHeal(boardId, { auto: true });
    }, delay)
  );
}

/** Called when a repair turn finished and the document validates / renders clean. */
export function markHealed(boardId: string): void {
  const sov = useSovereign.getState();
  const h = sov.heal[boardId];
  sov.clearErrors(boardId);
  if (h && h.status === "healing") {
    sov.setHeal(boardId, { status: "healed" });
    harnessBus.emit("onSelfHealResolved", { boardId, attempts: h.attempts });
  }
}
