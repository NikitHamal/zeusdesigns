// Versioned Virtual File System (Pillar 3).
//
// An immutable snapshot graph: every commit creates a new snapshot whose `files` map shares unchanged string
// values with its parent (structural sharing, so a 40-snapshot history of a 5-screen canvas costs roughly the
// size of the edits). Undo/redo move the head along parent links; committing after an undo creates a branch
// instead of destroying the redo path. Pure and serialisable: the store-bound binding lives in vfsBinding.ts.

import { diffLines, diffStat, type DiffLine } from "./diff";

export type SnapshotKind = "generation" | "patch" | "manual" | "heal" | "restore" | "import";

export interface Snapshot {
  id: string;
  seq: number;
  parent: string | null;
  label: string;
  kind: SnapshotKind;
  at: number;
  files: Readonly<Record<string, string>>;
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  added: number;
  removed: number;
}

export interface VfsJson {
  v: 1;
  head: string | null;
  seq: number;
  snapshots: Snapshot[];
  meta: Record<string, unknown>;
}

export class Vfs {
  private snaps = new Map<string, Snapshot>();
  private head: string | null = null;
  private redoStack: string[] = [];
  private seq = 0;
  readonly maxSnapshots: number;
  /** Free-form bag for the binding layer (path -> board id, etc). Serialised with the graph. */
  meta: Record<string, unknown> = {};

  constructor(maxSnapshots = 40) {
    this.maxSnapshots = maxSnapshots;
  }

  /* ---------------- read ---------------- */
  get headId(): string | null {
    return this.head;
  }
  get headSnapshot(): Snapshot | null {
    return this.head ? this.snaps.get(this.head) ?? null : null;
  }
  get size(): number {
    return this.snaps.size;
  }
  get canUndo(): boolean {
    const h = this.headSnapshot;
    return !!h && h.parent !== null && this.snaps.has(h.parent);
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get(id: string): Snapshot | undefined {
    return this.snaps.get(id);
  }
  files(id: string | null = this.head): Readonly<Record<string, string>> {
    return (id ? this.snaps.get(id)?.files : undefined) ?? {};
  }
  read(path: string, id: string | null = this.head): string | undefined {
    return this.files(id)[path];
  }

  /** Root -> head ancestry (oldest first). */
  history(): Snapshot[] {
    const out: Snapshot[] = [];
    let cur = this.headSnapshot;
    while (cur) {
      out.unshift(cur);
      cur = cur.parent ? this.snaps.get(cur.parent) ?? null : null;
    }
    return out;
  }

  /** Snapshots that can be redone (most imminent first). */
  redoPath(): Snapshot[] {
    return [...this.redoStack].reverse().map((id) => this.snaps.get(id)).filter((s): s is Snapshot => !!s);
  }

  /* ---------------- write ---------------- */
  /**
   * Commits a change set on top of the head. `null` deletes a file. Returns the new snapshot, or the current
   * head (and creates nothing) when the change set is a no-op.
   */
  commit(label: string, changes: Record<string, string | null>, kind: SnapshotKind = "manual", at = Date.now()): Snapshot {
    const base = this.files();
    const next: Record<string, string> = { ...base };
    let changed = false;
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) {
        if (path in next) {
          delete next[path];
          changed = true;
        }
      } else if (next[path] !== content) {
        next[path] = content;
        changed = true;
      }
    }
    const head = this.headSnapshot;
    if (!changed && head) return head;
    const snap: Snapshot = {
      id: `s${++this.seq}`,
      seq: this.seq,
      parent: this.head,
      label,
      kind,
      at,
      files: Object.freeze(next),
    };
    this.snaps.set(snap.id, snap);
    this.head = snap.id;
    this.redoStack = [];
    this.prune();
    return snap;
  }

  undo(): Snapshot | null {
    const h = this.headSnapshot;
    if (!h || !h.parent || !this.snaps.has(h.parent)) return null;
    this.redoStack.push(h.id);
    this.head = h.parent;
    return this.headSnapshot;
  }

  redo(): Snapshot | null {
    const id = this.redoStack.pop();
    if (!id || !this.snaps.has(id)) return null;
    this.head = id;
    return this.headSnapshot;
  }

  /** Moves the head to any snapshot (branch-safe). Redo is only kept when the target is an ancestor of the old head. */
  checkout(id: string): Snapshot | null {
    const target = this.snaps.get(id);
    if (!target) return null;
    const oldHead = this.head;
    const redo: string[] = [];
    let cur = oldHead ? this.snaps.get(oldHead) : undefined;
    let isAncestor = false;
    while (cur) {
      if (cur.id === id) {
        isAncestor = true;
        break;
      }
      redo.push(cur.id);
      cur = cur.parent ? this.snaps.get(cur.parent) : undefined;
    }
    // redo stack is a LIFO: the snapshot right after the target must be popped first
    this.redoStack = isAncestor ? redo : [];
    this.head = id;
    return target;
  }

  /* ---------------- inspect ---------------- */
  diff(a: string | null, b: string | null = this.head): FileDiff[] {
    const fa = this.files(a);
    const fb = this.files(b);
    const paths = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
    return paths.map((path) => {
      const x = fa[path];
      const y = fb[path];
      if (x === undefined) return { path, status: "added" as const, ...diffStat("", y ?? "") };
      if (y === undefined) return { path, status: "removed" as const, ...diffStat(x, "") };
      if (x === y) return { path, status: "unchanged" as const, added: 0, removed: 0 };
      return { path, status: "modified" as const, ...diffStat(x, y) };
    });
  }

  fileDiff(path: string, a: string | null, b: string | null = this.head): DiffLine[] {
    return diffLines(this.read(path, a) ?? "", this.read(path, b) ?? "");
  }

  /* ---------------- persistence ---------------- */
  toJSON(maxChars = 1_200_000): VfsJson {
    // keep the newest snapshots that fit the budget, always including the head
    const list = this.history().slice().reverse();
    const keep: Snapshot[] = [];
    let used = 0;
    const seen = new Set<string>();
    for (const s of list) {
      let cost = 0;
      for (const [p, c] of Object.entries(s.files)) {
        const key = p + "\0" + c.length + c.slice(0, 32);
        if (!seen.has(key)) {
          seen.add(key);
          cost += c.length;
        }
      }
      if (keep.length > 0 && used + cost > maxChars) break;
      used += cost;
      keep.push(s);
    }
    const snapshots = keep.reverse().map((s, i) => (i === 0 ? { ...s, parent: null } : s));
    return { v: 1, head: this.head, seq: this.seq, snapshots, meta: this.meta };
  }

  static fromJSON(json: VfsJson, maxSnapshots = 40): Vfs {
    const v = new Vfs(maxSnapshots);
    if (!json || json.v !== 1 || !Array.isArray(json.snapshots)) return v;
    for (const s of json.snapshots) v.snaps.set(s.id, { ...s, files: Object.freeze({ ...s.files }) });
    v.head = json.head && v.snaps.has(json.head) ? json.head : null;
    v.seq = json.seq || json.snapshots.length;
    v.meta = json.meta ?? {};
    return v;
  }

  private prune(): void {
    if (this.snaps.size <= this.maxSnapshots) return;
    const path = this.history();
    const keepIds = new Set(path.slice(-this.maxSnapshots).map((s) => s.id));
    for (const id of [...this.snaps.keys()]) if (!keepIds.has(id)) this.snaps.delete(id);
    const oldest = path.slice(-this.maxSnapshots)[0];
    if (oldest) this.snaps.set(oldest.id, { ...oldest, parent: null });
    this.redoStack = this.redoStack.filter((id) => this.snaps.has(id));
  }
}

/* ------------------------------------------------------------------ */
/* Summaries: compact, high-signal file descriptions for context       */
/* ------------------------------------------------------------------ */

/** One-line outline of a file: what it is and what it exports/contains, in a few dozen tokens. */
export function outlineFile(path: string, content: string): string {
  const lines = content ? content.split("\n").length : 0;
  const head = `${path} (${lines} lines, ${content.length} chars)`;
  if (/\.html?$/i.test(path)) {
    const title = /<title>([^<]{1,80})<\/title>/i.exec(content)?.[1]?.trim();
    const heads = [...content.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
      .slice(0, 6)
      .map((m) => m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 40))
      .filter(Boolean);
    const ids = [...content.matchAll(/\bid="([^"]{1,30})"/g)].slice(0, 8).map((m) => `#${m[1]}`);
    const sections = (content.match(/<(?:section|main|nav|header|footer|aside)\b/gi) ?? []).length;
    const scripts = (content.match(/<script\b(?![^>]*data-zeus)/gi) ?? []).length;
    return [head, title && `title: ${title}`, heads.length && `headings: ${heads.join(" | ")}`, sections && `${sections} landmark blocks`, ids.length && `ids: ${ids.join(" ")}`, scripts && `${scripts} script(s)`]
      .filter(Boolean)
      .join("; ");
  }
  if (/\.css$/i.test(path)) {
    const vars = [...content.matchAll(/(--[\w-]+)\s*:/g)].slice(0, 12).map((m) => m[1]);
    return `${head}; custom props: ${vars.join(", ") || "none"}`;
  }
  const exports = [...content.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|type|interface)\s+([A-Za-z_$][\w$]*)/g)]
    .slice(0, 12)
    .map((m) => m[1]);
  return exports.length ? `${head}; exports: ${exports.join(", ")}` : head;
}
