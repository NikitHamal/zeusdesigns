// Zeus memory: four buckets (preferences, profile, topics, areas) that persist in the native store and are injected into every prompt.
import { useStore } from "../store";
import type { MemoryCategory, MemoryItem } from "../types";
import { nativeMemory } from "./bridge";
import { canCallModel, oneShot } from "./oneshot";

export const CATEGORIES: { id: MemoryCategory; label: string; blurb: string }[] = [
  { id: "preferences", label: "Preferences", blurb: "How you want Zeus to work" },
  { id: "profile", label: "Profile", blurb: "Who you are and what you build" },
  { id: "topics", label: "Topics", blurb: "Subjects and tastes you return to" },
  { id: "areas", label: "Areas", blurb: "Projects and brands" },
];
export const isCategory = (c: string): c is MemoryCategory => CATEGORIES.some((x) => x.id === c);

const setList = (l: MemoryItem[]) => useStore.getState().patchSettings({ memory: l });
const items = () => useStore.getState().settings.memory;

export async function addMemory(text: string, category: MemoryCategory = "preferences") {
  const t = text.trim();
  if (!t || items().some((m) => m.text.toLowerCase() === t.toLowerCase())) return;
  const l = await nativeMemory.add(t, category);
  if (l) setList([...l].reverse()); else useStore.getState().addMemory(t, category);
}

export async function removeMemory(id: string) {
  const l = await nativeMemory.remove(id);
  if (l) setList([...l].reverse()); else useStore.getState().removeMemory(id);
}

export async function updateMemory(id: string, text: string) {
  const cur = items().find((m) => m.id === id);
  const t = text.trim();
  if (!cur || !t || t === cur.text) return;
  await removeMemory(id);
  await addMemory(t, cur.category ?? "preferences");
}

export async function clearMemory() {
  for (const m of [...items()]) await removeMemory(m.id);
}

/** Prompt section: memory grouped by bucket. */
export function memoryBlock(): string {
  const { memory, memoryOn } = useStore.getState().settings;
  if (!memoryOn || !memory.length) return "";
  const out = ["## Memory (what you know about this user; apply it silently, never mention it unless asked)"];
  for (const c of CATEGORIES) {
    const l = memory.filter((m) => (m.category ?? "preferences") === c.id);
    if (l.length) out.push(`### ${c.label}\n${l.map((m) => `- ${m.text}`).join("\n")}`);
  }
  return out.join("\n");
}

/** Pulls <remember category="...">fact</remember> tags the model wrote and returns the text without them. */
export function extractRemember(text: string): { clean: string; found: { category: MemoryCategory; text: string }[] } {
  const found: { category: MemoryCategory; text: string }[] = [];
  const clean = text.replace(/<remember(?:\s+category\s*=\s*"(\w+)")?\s*>([\s\S]*?)<\/remember>/gi, (_m, c: string | undefined, t: string) => {
    found.push({ category: c && isCategory(c.toLowerCase()) ? (c.toLowerCase() as MemoryCategory) : "preferences", text: t.trim() });
    return "";
  }).replace(/<remember[\s\S]*$/i, "");
  return { clean, found };
}

/** "Tell Zeus what to change": the active model turns a plain sentence into add/remove operations. */
export async function editWithAI(instruction: string): Promise<string> {
  const text = instruction.trim();
  if (!text) return "";
  if (!canCallModel()) { await addMemory(text, "preferences"); return "Saved as a preference"; }
  const list = items().map((m) => `${m.id} | ${m.category ?? "preferences"} | ${m.text}`).join("\n") || "(empty)";
  const raw = await oneShot(
    `You maintain a user's long-term memory for a design tool. Apply the user's instruction to the memory.\nBuckets: preferences (how they want the assistant to work), profile (who they are), topics (tastes and subjects), areas (projects and brands).\nWrite each fact as one short, self-contained sentence. Merge or remove entries that the instruction contradicts.\nReply with JSON only: {"add":[{"category":"preferences","text":"..."}],"remove":["id"]}\n\nCurrent memory (id | bucket | text):\n${list}`,
    text,
  );
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) throw new Error("Could not understand the model reply");
  const op = JSON.parse(m[0]) as { add?: { category?: string; text?: string }[]; remove?: string[] };
  let added = 0, removed = 0;
  for (const id of op.remove ?? []) if (items().some((x) => x.id === id)) { await removeMemory(id); removed++; }
  for (const a of op.add ?? []) if (a.text) { await addMemory(a.text, a.category && isCategory(a.category) ? a.category : "preferences"); added++; }
  return added || removed ? `${added ? `Added ${added}` : ""}${added && removed ? ", " : ""}${removed ? `removed ${removed}` : ""}` : "Nothing to change";
}

/* ------------------------------------------------------------------ */
/* Learning from chats: deterministic, instant, no model call          */
/* ------------------------------------------------------------------ */
const LEARN: { cat: MemoryCategory; re: RegExp }[] = [
  { cat: "preferences", re: /^(?:please\s+)?(?:remember(?:\s+that|:)?\s+)?(?:i\s+(?:always|never|prefer|only|don'?t like|do not like|hate|dislike)\b|(?:always|never)\s+(?:use|make|give|keep|avoid|add|write|show)\b|i\s+like\s+(?:my|designs?|it\s+when|things)\b)/i },
  { cat: "profile", re: /^(?:remember(?:\s+that|:)?\s+)?(?:i\s*(?:am|'m)\s+(?:a|an|the)\s+\w+|i\s+work\s+(?:at|as|for|in)\b|my\s+(?:name|role|job|title|studio|team)\s+(?:is|are)\b)/i },
  { cat: "areas", re: /^(?:remember(?:\s+that|:)?\s+)?(?:(?:my|our)\s+(?:brand|app|product|project|startup|company|website|client|business)\s+(?:is|are|called|named)\b|(?:we|i)(?:'re|\s+are|'m|\s+am)\s+(?:building|making|designing|working\s+on|launching)\b)/i },
];

/** Durable first-person statements in a user message become memory lines. Returns what was saved. */
export async function learnFromText(text: string): Promise<string[]> {
  const st = useStore.getState().settings;
  if (!st.memoryOn || !st.learnOn) return [];
  const saved: string[] = [];
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 10 && x.length <= 180);
  for (const sent of sentences) {
    const hit = LEARN.find((l) => l.re.test(sent));
    if (!hit || /\?$/.test(sent)) continue;
    const line = sent.replace(/^(?:please\s+)?remember(?:\s+that|:)?\s+/i, "").replace(/[.!]+$/, "");
    const final = line[0].toUpperCase() + line.slice(1);
    if (items().some((m) => m.text.toLowerCase() === final.toLowerCase())) continue;
    await addMemory(final, hit.cat);
    saved.push(final);
    if (saved.length >= 3) break;
  }
  return saved;
}
