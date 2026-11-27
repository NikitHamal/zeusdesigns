import { useStore, uid } from "../store";
import type { Conversation, Message } from "../types";
import { nativeCheckpoints, refreshTree } from "./bridge";

/** Fork: a new session holding every message up to and including the turn that contains `msgId`. */
export function forkFromTurn(convId: string, msgId: string): string | null {
  const st = useStore.getState();
  const src = st.conversations.find((c) => c.id === convId);
  if (!src) return null;
  const idx = src.messages.findIndex((m) => m.id === msgId);
  if (idx < 0) return null;
  let end = idx;
  if (src.messages[idx].role === "user") {
    while (end + 1 < src.messages.length && src.messages[end + 1].role === "assistant") end++;
  }
  const copy: Message[] = src.messages.slice(0, end + 1).map((m) => ({ ...m, id: uid(), streaming: false, tools: m.tools?.map((t) => ({ ...t })) }));
  const id = uid();
  const conv: Conversation = { id, projectId: src.projectId, title: `${src.title} (fork)`, messages: copy, at: Date.now(), titled: true };
  useStore.setState((s) => ({ conversations: [conv, ...s.conversations], activeConvId: id }));
  st.notify("Forked session");
  return id;
}

/** Checkpoint ids written by a message's tools, newest tool first. */
function checkpointsOf(m: Message): string[] {
  const ids = [...(m.tools ?? []).map((t) => t.checkpointId), m.checkpointId].filter((x): x is string => !!x);
  return [...new Set(ids.reverse())];
}

/** Revert: restore files changed from this user turn onward, then drop those messages. */
export async function revertToTurn(convId: string, msgId: string): Promise<{ turns: number; files: number }> {
  const st = useStore.getState();
  const conv = st.conversations.find((c) => c.id === convId);
  const idx = conv ? conv.messages.findIndex((m) => m.id === msgId) : -1;
  if (!conv || idx < 0) return { turns: 0, files: 0 };
  const doomed = conv.messages.slice(idx);
  const root = st.ui.workspace?.root;
  let files = 0;
  if (root) {
    for (const m of [...doomed].reverse()) {
      for (const cp of checkpointsOf(m)) {
        const r = await nativeCheckpoints.restore(root, cp);
        files += r?.restoredFiles.length ?? 0;
      }
    }
    const ws = useStore.getState().ui.workspace;
    if (ws) refreshTree(ws).then((tree) => useStore.getState().patchUI({ workspace: { ...ws, tree } })).catch(() => {});
  }
  useStore.setState((s) => ({
    conversations: s.conversations.map((c) => (c.id === convId ? { ...c, messages: c.messages.slice(0, idx) } : c)),
  }));
  const turns = doomed.filter((m) => m.role === "user").length;
  st.notify(files ? `Reverted ${turns} turn${turns === 1 ? "" : "s"}, restored ${files} file${files === 1 ? "" : "s"}` : `Reverted ${turns} turn${turns === 1 ? "" : "s"}`);
  return { turns, files };
}

/** Markdown transcript of a session for the copy menu. */
export function sessionMarkdown(conv: Conversation): string {
  return conv.messages
    .filter((m) => !m.compacted)
    .map((m) => `## ${m.role === "user" ? "User" : "Assistant"}\n\n${m.text.trim()}`)
    .join("\n\n");
}
