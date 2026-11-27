import { create } from "zustand";
import { useStore } from "../store";
import { useAgent } from "./agentState";

/** Per-session unread tracking: a turn finished in a session that was not on screen. */
export const useUnread = create<{ ids: Record<string, true> }>()(() => ({ ids: {} }));

let wired = false;
export function wireConvStatus() {
  if (wired) return;
  wired = true;
  const streaming = new Map<string, boolean>();
  useStore.subscribe((s) => {
    for (const c of s.conversations) {
      const now = !!c.messages[c.messages.length - 1]?.streaming;
      const was = streaming.get(c.id) ?? false;
      if (was && !now && c.id !== s.activeConvId) useUnread.setState((u) => ({ ids: { ...u.ids, [c.id]: true } }));
      streaming.set(c.id, now);
    }
    if (useUnread.getState().ids[s.activeConvId]) {
      useUnread.setState((u) => {
        const { [s.activeConvId]: _drop, ...rest } = u.ids;
        void _drop;
        return { ids: rest };
      });
    }
  });
}

export type ConvStatus = "working" | "input" | "unread" | null;

export function useConvStatus(id: string): ConvStatus {
  const working = useStore((s) => !!s.conversations.find((c) => c.id === id)?.messages.at(-1)?.streaming);
  const input = useAgent((s) => s.questions.some((q) => q.sessionId === id) || s.permissions.some((p) => p.sessionId === id));
  const unread = useUnread((s) => !!s.ids[id]);
  return input ? "input" : working ? "working" : unread ? "unread" : null;
}
