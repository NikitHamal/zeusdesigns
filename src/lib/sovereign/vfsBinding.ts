// Binds the pure Vfs to the live canvas: every artboard of the active conversation is a file `screens/<slug>.html`.
// Snapshots store the model-facing (kit-stripped) HTML, so they are compact, diffs are clean, and restoring
// re-hardens through the same pipeline a model revision takes.

import { useStore } from "../../store";
import { getDS } from "../designSystems";
import { harden, stripKitBoilerplate } from "../harness";
import { getConversationBoards } from "../context";
import { harnessBus } from "./events";
import { useSovereign } from "./state";
import { Vfs, type Snapshot, type SnapshotKind, type VfsJson } from "./vfs";

const instances = new Map<string, Vfs>();
/** Raw artboard html last reflected in the VFS, per board. Prevents restore from echoing back as a "manual edit". */
const lastSeen = new Map<string, string>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const KEY = (convId: string) => `zeus-vfs:${convId}`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "screen";

export function getVfs(convId: string): Vfs {
  let v = instances.get(convId);
  if (v) return v;
  v = new Vfs();
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(KEY(convId));
      if (raw) v = Vfs.fromJSON(JSON.parse(raw) as VfsJson);
    }
  } catch {
    v = new Vfs();
  }
  instances.set(convId, v);
  return v;
}

function persist(convId: string): void {
  if (typeof localStorage === "undefined") return;
  clearTimeout(persistTimers.get(convId));
  persistTimers.set(
    convId,
    setTimeout(() => {
      try {
        localStorage.setItem(KEY(convId), JSON.stringify(getVfs(convId).toJSON(600_000)));
      } catch {
        /* quota exceeded: the in-memory graph keeps working */
      }
    }, 1500)
  );
}

type PathMap = Record<string, string>; // boardId -> path

function pathMap(vfs: Vfs): PathMap {
  const m = vfs.meta.paths;
  return m && typeof m === "object" ? (m as PathMap) : {};
}

function assignPaths(vfs: Vfs, boards: { id: string; name: string }[]): PathMap {
  const map = { ...pathMap(vfs) };
  const used = new Set(Object.values(map));
  for (const b of boards) {
    if (map[b.id]) continue;
    let p = `screens/${slug(b.name)}.html`;
    if (used.has(p)) p = `screens/${slug(b.name)}-${b.id.slice(0, 4)}.html`;
    used.add(p);
    map[b.id] = p;
  }
  vfs.meta.paths = map;
  return map;
}

/** Commits the current canvas as a snapshot. Returns the new snapshot, or null when nothing changed. */
export function syncBoardsToVfs(label: string, kind: SnapshotKind, opts: { onlyChanged?: boolean } = {}): Snapshot | null {
  const s = useStore.getState();
  const convId = s.activeConvId;
  const boards = getConversationBoards(s).filter((b) => b.html && !b.loading);
  const vfs = getVfs(convId);
  const map = assignPaths(vfs, boards);
  const changes: Record<string, string | null> = {};
  let any = false;
  for (const b of boards) {
    if (opts.onlyChanged && lastSeen.get(b.id) === b.html) continue;
    changes[map[b.id]] = stripKitBoilerplate(b.html);
    lastSeen.set(b.id, b.html);
    any = true;
  }
  if (!opts.onlyChanged) {
    const live = new Set(boards.map((b) => b.id));
    for (const [boardId, path] of Object.entries(map)) if (!live.has(boardId) && vfs.read(path) !== undefined) changes[path] = null;
  }
  if (!any && Object.keys(changes).length === 0) return null;
  const before = vfs.headId;
  const snap = vfs.commit(label, changes, kind);
  if (snap.id === before) return null;
  persist(convId);
  useSovereign.getState().bumpVfs();
  harnessBus.emit("onSnapshot", { id: snap.id, label: snap.label, version: snap.seq });
  return snap;
}

/** Writes a snapshot's files back onto the matching artboards. */
function applySnapshot(convId: string, snap: Snapshot): void {
  const S = useStore.getState();
  const vfs = getVfs(convId);
  const map = pathMap(vfs);
  const ds = getDS(S.settings.designSystemId);
  for (const [boardId, path] of Object.entries(map)) {
    const content = snap.files[path];
    const board = S.artboards.find((a) => a.id === boardId);
    if (content === undefined || !board) continue;
    const out = harden(content, ds, { device: board.device, name: board.name }).html;
    if (out === board.html) continue;
    S.reviseArtboard(boardId, out);
    const after = useStore.getState().artboards.find((a) => a.id === boardId);
    if (after) lastSeen.set(boardId, after.html);
  }
  useSovereign.getState().clearErrors();
  useSovereign.getState().bumpVfs();
  persist(convId);
}

export function vfsUndo(): boolean {
  const convId = useStore.getState().activeConvId;
  const snap = getVfs(convId).undo();
  if (snap) applySnapshot(convId, snap);
  return !!snap;
}

export function vfsRedo(): boolean {
  const convId = useStore.getState().activeConvId;
  const snap = getVfs(convId).redo();
  if (snap) applySnapshot(convId, snap);
  return !!snap;
}

export function vfsRestore(snapshotId: string): boolean {
  const convId = useStore.getState().activeConvId;
  const snap = getVfs(convId).checkout(snapshotId);
  if (snap) applySnapshot(convId, snap);
  return !!snap;
}

/** Records a baseline the first time a conversation with screens is seen, so the first manual edit is undoable. */
export function ensureBaseline(): void {
  const s = useStore.getState();
  const vfs = getVfs(s.activeConvId);
  if (vfs.size > 0) {
    for (const b of getConversationBoards(s)) lastSeen.set(b.id, b.html);
    return;
  }
  if (getConversationBoards(s).some((b) => b.html)) syncBoardsToVfs("Opened canvas", "import");
}
