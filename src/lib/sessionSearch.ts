import { useStore } from "../store";

/** `session_search`: ranked search over past sessions and messages in the active project. */
export function runSessionSearch(rawArgs: string | undefined): string {
  let query = "";
  try {
    const j = JSON.parse(rawArgs ?? "{}");
    query = String(j.query ?? "").trim();
    if (!query) {
      const body = String(j.body ?? j.path ?? "").trim();
      try { query = String(JSON.parse(body).query ?? body); } catch { query = body; }
    }
  } catch {
    query = (rawArgs ?? "").trim();
  }
  query = query.trim();
  if (!query) return "session_search: provide a query";
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const st = useStore.getState();
  const hits: Array<{ score: number; line: string }> = [];
  for (const c of st.conversations) {
    if (c.projectId && st.activeProjectId && c.projectId !== st.activeProjectId) continue;
    c.messages.forEach((m, i) => {
      if (m.compacted) return;
      const text = m.text.toLowerCase();
      const title = c.title.toLowerCase();
      const score = terms.reduce((n, t) => n + (text.includes(t) ? 2 : 0) + (title.includes(t) ? 1 : 0), 0);
      if (!score) return;
      const at = Math.max(0, text.indexOf(terms.find((t) => text.includes(t)) ?? ""));
      const snippet = m.text.slice(Math.max(0, at - 60), at + 140).replace(/\s+/g, " ").trim();
      hits.push({ score: score + (c.id === st.activeConvId ? 0 : 0.5), line: `${c.title} [${c.id}#${i + 1} ${m.role}] ${snippet}` });
    });
  }
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return `No sessions matched "${query}"`;
  return `${Math.min(hits.length, 12)} of ${hits.length} matches for "${query}"\n` + hits.slice(0, 12).map((h, n) => `${n + 1}. ${h.line}`).join("\n");
}
