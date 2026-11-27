import { useEffect, useState } from "react";
import { activeProject, useStore } from "../store";
import {
  nativeGit,
  nativeShell,
  refreshTree,
  type NativeGitStatus,
} from "../lib/bridge";
import { cn } from "../utils/cn";
import { IconBtn } from "./ui";
import { Icon } from "./Icon";

/* ------------------------------------------------------------------ */
/* Stormy GitDrawer (GitDrawer.kt — Source Control, Staging & Diffs)   */
/* ------------------------------------------------------------------ */
export function GitPanel() {
  const ws = useStore((s) => s.ui.workspace);
  const curProject = useStore(activeProject);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const root = ws?.root ?? curProject?.root ?? "";
  const [git, setGit] = useState<NativeGitStatus>({
    isRepo: false,
    branch: "",
    changed: [],
    commits: [],
  });
  const [loading, setLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [selectedDiff, setSelectedDiff] = useState<{ path: string; diff: string } | null>(null);

  const refreshGit = async () => {
    if (!root) return;
    setLoading(true);
    try {
      const st = await nativeGit.status(root);
      setGit(st);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshGit();
  }, [root]);

  const runGitAction = async (cmd: string, doneMsg?: string) => {
    if (!root) return;
    setLoading(true);
    try {
      const res = await nativeShell.run(root, cmd);
      if (res.code !== 0) {
        notify(res.stderr.trim() || `Git exited with ${res.code}`);
      } else if (doneMsg) {
        notify(doneMsg);
      }
      await refreshGit();
      if (ws) {
        const tree = await refreshTree(ws);
        patchUI({ workspace: { ...ws, tree } });
      }
    } finally {
      setLoading(false);
    }
  };

  const viewFileDiff = async (path: string) => {
    if (!root) return;
    const res = await nativeShell.run(root, `git diff HEAD -- "${path}"`);
    setSelectedDiff({
      path,
      diff: res.stdout.trim() || "(no working tree diff against HEAD)",
    });
  };

  if (!root) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-surface-container text-primary">
          <Icon name="commit" size={24} />
        </div>
        <div className="text-base font-semibold text-on-surface">Open a project folder to use Git</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="commit" size={17} className="shrink-0 text-primary" />
          <span className="truncate font-mono text-xs font-semibold text-on-surface">
            {git.isRepo ? git.branch || "HEAD" : "Not a Git repo"}
          </span>
          {git.changed.length > 0 && (
            <span className="rounded-full bg-primary-container px-2 py-0.5 font-mono text-[10.5px] font-semibold text-on-primary-container">
              {git.changed.length} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {git.isRepo && (
            <>
              <button
                disabled={loading}
                onClick={() => void runGitAction("git pull --rebase", "Pulled latest changes")}
                className="state h-7 rounded-lg bg-surface-high px-2 text-[11px] font-medium text-on-surface"
              >
                Pull
              </button>
              <button
                disabled={loading}
                onClick={() => void runGitAction("git push", "Pushed to remote")}
                className="state h-7 rounded-lg bg-surface-high px-2 text-[11px] font-medium text-on-surface"
              >
                Push
              </button>
            </>
          )}
          <IconBtn label="Refresh Git status" size={28} onClick={() => void refreshGit()}>
            <Icon name="refresh" size={15} />
          </IconBtn>
        </div>
      </div>

      {!git.isRepo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-xs text-on-surface-variant">This folder does not have a `.git` repository yet.</div>
          <button
            onClick={() => void runGitAction("git init", "Initialized Git repository")}
            className="state h-9 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary"
          >
            Initialize Git Repository
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="space-y-2 rounded-2xl border border-outline-variant/60 bg-surface-low p-2.5">
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && commitMsg.trim()) {
                  e.preventDefault();
                  void runGitAction(
                    `git add -A && git commit -m "${commitMsg.trim().replace(/"/g, "'")}"`,
                    "Committed changes"
                  ).then(() => setCommitMsg(""));
                }
              }}
              placeholder="Commit message…"
              className="h-8 w-full rounded-xl border border-outline-variant/60 bg-surface px-3 text-xs text-on-surface outline-none focus:border-primary"
            />
            <div className="flex items-center gap-1.5">
              <button
                disabled={loading || !commitMsg.trim() || git.changed.length === 0}
                onClick={() =>
                  void runGitAction(
                    `git add -A && git commit -m "${commitMsg.trim().replace(/"/g, "'")}"`,
                    "Committed changes"
                  ).then(() => setCommitMsg(""))
                }
                className="state flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-40"
              >
                <Icon name="check" size={14} />
                Stage All & Commit
              </button>
              <button
                onClick={() => {
                  patchUI({ leftTab: "chat" });
                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent("zeus:prefill", {
                        detail: "Inspect git_status and git_diff, review all changes, and summarize or commit them.",
                      })
                    );
                  }, 30);
                }}
                className="state h-8 rounded-xl bg-surface-high px-2.5 text-xs font-medium text-on-surface"
              >
                Ask Zeus
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1 text-[11.5px] font-semibold text-on-surface-variant">
              <span>Changed Files ({git.changed.length})</span>
              {git.changed.length > 0 && (
                <button
                  onClick={() => void runGitAction("git add -A", "Staged all files")}
                  className="text-[11px] font-medium text-primary"
                >
                  Stage all
                </button>
              )}
            </div>
            {git.changed.length === 0 ? (
              <div className="rounded-xl border border-outline-variant/40 bg-surface-low px-3 py-3 text-center text-xs text-on-surface-variant">
                Working tree clean
              </div>
            ) : (
              git.changed.map((f) => (
                <div
                  key={f.path}
                  className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant/50 bg-surface-low px-2.5 py-1.5 text-xs"
                >
                  <button
                    onClick={() => void viewFileDiff(f.path)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                        f.status.includes("D")
                          ? "bg-error-container text-on-error-container"
                          : f.status.includes("?") || f.status.includes("A")
                          ? "bg-tertiary-container text-on-tertiary-container"
                          : "bg-primary-container text-on-primary-container"
                      )}
                    >
                      {f.status}
                    </span>
                    <span className="truncate font-mono text-[11.5px] font-medium text-on-surface">{f.path}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() =>
                        void runGitAction(
                          f.staged ? `git reset HEAD -- "${f.path}"` : `git add -- "${f.path}"`
                        )
                      }
                      className="state rounded bg-surface-high px-2 py-0.5 text-[10.5px] font-medium text-on-surface"
                    >
                      {f.staged ? "Unstage" : "Stage"}
                    </button>
                    <button
                      onClick={() => {
                        patchUI({ leftTab: "files" });
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: f.path }));
                        }, 30);
                      }}
                      className="state rounded bg-surface-high px-2 py-0.5 text-[10.5px] font-medium text-on-surface"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedDiff && (
            <div className="overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-lowest">
              <div className="flex items-center justify-between border-b border-outline-variant/50 bg-surface-low px-3 py-1.5 text-xs">
                <span className="truncate font-mono font-semibold text-on-surface">{selectedDiff.path}</span>
                <button onClick={() => setSelectedDiff(null)} className="text-on-surface-variant hover:text-on-surface">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <pre className="max-h-56 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-on-surface-variant select-text">
                {selectedDiff.diff}
              </pre>
            </div>
          )}

          {git.commits.length > 0 && (
            <div className="space-y-1.5">
              <div className="px-1 text-[11.5px] font-semibold text-on-surface-variant">
                Recent Commits ({git.commits.length})
              </div>
              {git.commits.map((c) => (
                <div
                  key={c.hash}
                  className="rounded-xl border border-outline-variant/40 bg-surface-low px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-on-surface">{c.message}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-primary">{c.hash}</span>
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-on-surface-variant">
                    {c.author} · {c.date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
