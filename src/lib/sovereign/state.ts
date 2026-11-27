// Store-bound runtime state for the Sovereign Harness (not persisted). One tiny zustand store keeps the UI
// (error banner, inspect toggle, versions menu) and the engine in sync without touching the main app store.

import { create } from "zustand";
import type { RuntimeErrorPayload, SelectedElementContext, SkillMatch } from "./types";

export interface HealState {
  attempts: number;
  status: "idle" | "healing" | "failed" | "healed";
}

interface SovereignState {
  errors: Record<string, RuntimeErrorPayload[]>;
  heal: Record<string, HealState>;
  inspect: { on: boolean; boardId: string | null };
  selectedElement: SelectedElementContext | null;
  lastSkills: SkillMatch[];
  lastPlan: string;
  /** Bumps whenever the VFS changes so the versions menu re-renders. */
  vfsRev: number;
  /** True while the engine is running a turn started by the self-healing controller. */
  healingTurn: boolean;
  addError: (boardId: string, e: RuntimeErrorPayload) => boolean;
  clearErrors: (boardId?: string) => void;
  setHeal: (boardId: string, patch: Partial<HealState>) => void;
  resetAttempts: () => void;
  setInspect: (on: boolean, boardId?: string | null) => void;
  setSelectedElement: (el: SelectedElementContext | null) => void;
  setSkills: (s: SkillMatch[]) => void;
  setPlan: (p: string) => void;
  bumpVfs: () => void;
  setHealingTurn: (v: boolean) => void;
}

const MAX_ERRORS_PER_BOARD = 12;

export const useSovereign = create<SovereignState>((set, get) => ({
  errors: {},
  heal: {},
  inspect: { on: false, boardId: null },
  selectedElement: null,
  lastSkills: [],
  lastPlan: "",
  vfsRev: 0,
  healingTurn: false,
  /** Returns false when the error is a duplicate (same kind, message and line). */
  addError: (boardId, e) => {
    const cur = get().errors[boardId] ?? [];
    if (cur.some((x) => x.kind === e.kind && x.message === e.message && x.line === e.line)) return false;
    set({ errors: { ...get().errors, [boardId]: [...cur, e].slice(-MAX_ERRORS_PER_BOARD) } });
    return true;
  },
  clearErrors: (boardId) => {
    if (!boardId) return set({ errors: {} });
    const next = { ...get().errors };
    delete next[boardId];
    set({ errors: next });
  },
  setHeal: (boardId, patch) => {
    const base: HealState = get().heal[boardId] ?? { attempts: 0, status: "idle" };
    set({ heal: { ...get().heal, [boardId]: { ...base, ...patch } } });
  },
  resetAttempts: () => {
    const next: Record<string, HealState> = {};
    for (const [k, v] of Object.entries(get().heal)) next[k] = { ...v, attempts: 0, status: "idle" };
    set({ heal: next });
  },
  setInspect: (on, boardId) => set({ inspect: { on, boardId: on ? boardId ?? get().inspect.boardId : get().inspect.boardId } }),
  setSelectedElement: (el) => set({ selectedElement: el }),
  setSkills: (s) => set({ lastSkills: s }),
  setPlan: (p) => set({ lastPlan: p }),
  bumpVfs: () => set({ vfsRev: get().vfsRev + 1 }),
  setHealingTurn: (v) => set({ healingTurn: v }),
}));

/** Fatal, unresolved errors for a board. */
export function fatalErrors(boardId: string): RuntimeErrorPayload[] {
  return (useSovereign.getState().errors[boardId] ?? []).filter((e) => e.fatal);
}
