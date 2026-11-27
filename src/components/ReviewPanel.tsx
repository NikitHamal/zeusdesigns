import { useEffect, useMemo, useState } from "react";
import { activeConv, useStore } from "../store";
import { nativeShell } from "../lib/bridge";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { ChangedFileRow, changedFilesOf, type ChangedFile } from "./Timeline";
import { DiffPill } from "./Activity";

/* icons: refresh, difference, commit */

interface GitFile { path: string; additions: number; deletions: number; lines: string[] }

export function parseUnifiedDiff(text: string): GitFile[] {
  const files: GitFile[] = [];
  let cur: GitFile | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = / b\/(.+)$/.exec(line);
      cur = { path: m?.[1] ?? line.slice(11), additions: 0, deletions: 0, lines: [] };
      files.push(cur);
    } else if (cur) {
      if (/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(line)) continue;
      if (line.startsWith("+")) cur.additions++;
      else if (line.startsWith("-")) cur.deletions++;
      cur.lines.push(line);
    }
  }
  return files;
}

function GitFileRow({ f }: { f: GitFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <button onClick={() => setOpen(!open)} className="flex min-h-6 w-full min-w-0 items-center gap-2 py-0.5 text-left text-[13px] outline-none">
        <Icon name="description" size={14} className="shrink-0 text-on-surface-variant/70" />
        <span className="min-w-0 flex-1 truncate text-on-surface" title={f.path}>{f.path}</span>
        <DiffPill additions={f.additions} deletions={f.deletions} />
        <Icon name="expand_more" size={15} className={cn("shrink-0 text-on-surface-variant/60 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <pre className="mb-1.5 max-h-80 overflow-auto rounded-md border border-[var(--oc-border-weak)] bg-surface py-1 font-mono text-[11.5px] leading-[1.5]">
          {f.lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                "px-2.5 whitespace-pre",
                l.startsWith("+") && "bg-[var(--oc-diff-add-bg)] text-[var(--oc-diff-add-text)]",
                l.startsWith("-") && "bg-[var(--oc-diff-del-bg)] text-[var(--oc-diff-del-text)]",
                l.startsWith("@@") && "text-on-surface-variant"
              )}
            >
              {l || " "}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

export function ReviewPanel() {
  const conv = useStore(activeConv);
  const root = useStore((s) => s.ui.workspace?.root);
  const [tab, setTab] = useState<"session" | "git">("session");
  const [git, setGit] = useState<GitFile[] | null>(null);
  const [loading, setLoading] = useState(false);

  const session: ChangedFile[] = useMemo(() => {
    const merged = new Map<string, ChangedFile>();
    for (const f of changedFilesOf(conv.messages.flatMap((m) => m.tools ?? []))) merged.set(f.path, f);
    return [...merged.values()];
  }, [conv.messages]);

  const loadGit = () => {
    if (!root) { setGit([]); return; }
    setLoading(true);
    nativeShell.run(root, "git --no-pager diff --no-color HEAD").then((r) => setGit(parseUnifiedDiff(r.stdout))).finally(() => setLoading(false));
  };
  useEffect(() => { if (tab === "git") loadGit(); }, [tab, root, conv.messages.length]);

  const add = session.reduce((n, f) => n + f.additions, 0);
  const del = session.reduce((n, f) => n + f.deletions, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--oc-border-weak)] px-2">
        {(["session", "git"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("h-6 rounded-md px-2 text-[12px] capitalize outline-none", tab === t ? "bg-surface-container text-on-surface" : "text-on-surface-variant hover:text-on-surface")}>
            {t === "session" ? "Session changes" : "Git diff"}
          </button>
        ))}
        <span className="flex-1" />
        {tab === "session" ? <DiffPill additions={add} deletions={del} /> : (
          <button onClick={loadGit} aria-label="Refresh" title="Refresh" className="grid size-6 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
            <Icon name="refresh" size={14} className={cn(loading && "animate-spin")} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {tab === "session" ? (
          session.length ? session.map((f) => <ChangedFileRow key={f.path} f={f} />) : <div className="py-6 text-center text-[13px] text-on-surface-variant">No file changes in this session</div>
        ) : git === null || loading ? (
          <div className="py-6 text-center text-[13px] text-on-surface-variant">Loading</div>
        ) : git.length ? (
          git.map((f) => <GitFileRow key={f.path} f={f} />)
        ) : (
          <div className="py-6 text-center text-[13px] text-on-surface-variant">Working tree clean</div>
        )}
      </div>
    </div>
  );
}
