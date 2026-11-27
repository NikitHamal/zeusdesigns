import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { activeProject, useStore } from "../store";
import type { FileNode } from "../types";
import { focusArtboard } from "../lib/actions";
import {
  listWorkspaceDir,
  nativeAudit,
  nativeCheckpoints,
  isNative,
  openWorkspace,
  readWorkspaceFile,
  refreshTree,
  writeWorkspaceFile,
  type NativeCheckpointManifest,
} from "../lib/bridge";
import { DiffUtils } from "../lib/stormyAgent";
import { cn } from "../utils/cn";
import { Dropdown, IconBtn, MenuItem } from "./ui";
import { closePty, ensurePty, openPty, ptyApi, ptyShells, setActivePty, usePtyTabs, type ShellInfo } from "../lib/pty";
import { Icon } from "./Icon";

/* ------------------------------------------------------------------ */
/* Local workspace file tree & inline file viewer/editor               */
/* ------------------------------------------------------------------ */
function filterTree(nodes: FileNode[], q: string): FileNode[] {
  const k = q.trim().toLowerCase();
  if (!k) return nodes;
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.dir) {
      const sub = n.children ? filterTree(n.children, k) : [];
      if (sub.length || n.name.toLowerCase().includes(k)) {
        out.push({ ...n, children: sub });
      }
    } else if (n.name.toLowerCase().includes(k) || n.path.toLowerCase().includes(k)) {
      out.push(n);
    }
  }
  return out;
}

function Tree({
  nodes,
  depth = 0,
  selectedPath,
  forceOpen,
  onPick,
}: {
  nodes: FileNode[];
  depth?: number;
  selectedPath?: string;
  forceOpen?: boolean;
  onPick: (n: FileNode) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [lazy, setLazy] = useState<Record<string, FileNode[]>>({});
  const toggleDir = (n: FileNode) => {
    const willOpen = !open[n.path];
    setOpen((o) => ({ ...o, [n.path]: willOpen }));
    const ws = useStore.getState().ui.workspace;
    if (willOpen && ws && (!n.children || n.children.length === 0) && !lazy[n.path]) {
      void listWorkspaceDir(ws, n.path).then((c) => setLazy((l) => ({ ...l, [n.path]: c })));
    }
  };
  return (
    <div>
      {nodes.map((n) => {
        const isOpen = forceOpen || open[n.path];
        const isSel = selectedPath === n.path;
        return (
          <div key={n.path}>
            <button
              onClick={() => (n.dir ? toggleDir(n) : onPick(n))}
              className={cn(
                "state flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12.5px] text-on-surface",
                isSel && "bg-primary-container/50 font-medium text-on-primary-container"
              )}
              style={{ paddingLeft: 8 + depth * 13 }}
            >
              {n.dir ? (
                <Icon name={isOpen ? "folder_open" : "folder"} size={15} className="shrink-0 text-primary" />
              ) : (
                <Icon name="code" size={14} className="shrink-0 text-on-surface-variant" />
              )}
              <span className="truncate">{n.name}</span>
            </button>
            {n.dir && isOpen && (lazy[n.path] ?? n.children) && (
              <Tree
                nodes={lazy[n.path] ?? n.children ?? []}
                depth={depth + 1}
                selectedPath={selectedPath}
                forceOpen={forceOpen}
                onPick={onPick}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FilesPanel() {
  const ws = useStore((s) => s.ui.workspace);
  const curProject = useStore(activeProject);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  const addOrSelectProject = useStore((s) => s.addOrSelectProject);
  const [q, setQ] = useState("");
  const [activeFile, setActiveFile] = useState<{
    path: string;
    content: string;
    originalContent: string;
    dirty: boolean;
  } | null>(null);
  const [editorMode, setEditorMode] = useState<"code" | "diff">("code");
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [syntaxFindings, setSyntaxFindings] = useState<string[] | null>(null);
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [checkpoints, setCheckpoints] = useState<NativeCheckpointManifest[]>([]);
  const gutterRef = useRef<HTMLDivElement>(null);

  const loadCheckpoints = async () => {
    if (!ws?.root) return;
    const list = await nativeCheckpoints.list(ws.root);
    setCheckpoints(list);
  };

  const openFolder = () =>
    openWorkspace()
      .then((w) => {
        if (w) {
          addOrSelectProject(w);
          setActiveFile(null);
          notify(`Opened ${w.name}`);
        }
      })
      .catch((e) => notify(e.message));

  const reloadTree = async () => {
    if (!ws) return;
    const tree = await refreshTree(ws);
    patchUI({ workspace: { ...ws, tree } });
    notify("Refreshed file tree");
  };

  const openFile = async (path: string) => {
    const curWs = useStore.getState().ui.workspace;
    if (!curWs) return;
    try {
      const content = await readWorkspaceFile(curWs, path);
      setActiveFile({ path, content, originalContent: content, dirty: false });
      setEditorMode("code");
      setSyntaxFindings(null);
    } catch {
      notify(`Could not read ${path}`);
    }
  };

  useEffect(() => {
    const h = (e: Event) => {
      const p = (e as CustomEvent<string>).detail;
      if (p) void openFile(p);
    };
    window.addEventListener("zeus:open-file", h);
    return () => window.removeEventListener("zeus:open-file", h);
  }, []);

  const saveActiveFile = async () => {
    if (!ws || !activeFile) return;
    setSaving(true);
    try {
      await writeWorkspaceFile(ws, activeFile.path, activeFile.content);
      const tree = await refreshTree(ws);
      patchUI({ workspace: { ...ws, tree } });
      setActiveFile({ ...activeFile, originalContent: activeFile.content, dirty: false });
      if (ws.root) {
        const issues = await nativeAudit.check(ws.root, [activeFile.path]);
        setSyntaxFindings(issues);
      }
      notify(`Saved ${activeFile.path}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  const createNewFile = async () => {
    const p = newFilePath.trim().replace(/^[\\/]+/, "");
    if (!ws || !p) return;
    try {
      await writeWorkspaceFile(ws, p, "");
      const tree = await refreshTree(ws);
      patchUI({ workspace: { ...ws, tree } });
      setCreatingFile(false);
      setNewFilePath("");
      setActiveFile({ path: p, content: "", originalContent: "", dirty: false });
      setEditorMode("code");
      setSyntaxFindings(null);
      notify(`Created ${p}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to create file");
    }
  };

  const filteredTree = useMemo(() => (ws ? filterTree(ws.tree, q) : []), [ws, q]);

  if (!ws) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-surface-container text-primary">
          <Icon name="folder_open" size={24} />
        </div>
        <div className="text-base font-semibold text-on-surface">
          {curProject?.name ? `Bind a local folder to “${curProject.name}”` : "Open a local project folder"}
        </div>
        <button
          onClick={openFolder}
          className="state morph inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary"
        >
          <Icon name="folder_open" size={18} /> Pick project folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-outline-variant/60 px-3 py-2">
        <Icon name="folder_open" size={17} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-on-surface">{ws.name}</div>
          {ws.root && <div className="truncate font-mono text-[10.5px] text-on-surface-variant">{ws.root}</div>}
        </div>
        <IconBtn
          label="Checkpoints"
          size={28}
          active={showCheckpoints}
          onClick={() => {
            const next = !showCheckpoints;
            setShowCheckpoints(next);
            if (next) void loadCheckpoints();
          }}
        >
          <Icon name="history" size={15} />
        </IconBtn>
        <IconBtn label="New file" size={28} onClick={() => setCreatingFile(!creatingFile)}>
          <Icon name="add" size={16} />
        </IconBtn>
        <IconBtn label="Refresh files" size={28} onClick={reloadTree}>
          <Icon name="refresh" size={15} />
        </IconBtn>
        <IconBtn label="Open another folder" size={28} onClick={openFolder}>
          <Icon name="create_new_folder" size={15} />
        </IconBtn>
      </div>

      {showCheckpoints && (
        <div className="max-h-52 space-y-1.5 overflow-y-auto border-b border-outline-variant/60 bg-surface-low px-3 py-2">
          <div className="flex items-center justify-between text-[11.5px] font-semibold text-on-surface">
            <span>Checkpoints ({checkpoints.length})</span>
            <button
              onClick={() => void loadCheckpoints()}
              className="state text-[11px] font-medium text-primary"
            >
              Refresh
            </button>
          </div>
          {checkpoints.length === 0 ? (
            <div className="py-2 text-xs text-on-surface-variant">No file checkpoints recorded yet</div>
          ) : (
            checkpoints.map((cp) => (
              <div
                key={cp.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant/50 bg-surface px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11.5px] font-medium text-on-surface">{cp.label}</div>
                  <div className="truncate text-[10.5px] text-on-surface-variant">
                    {cp.files.map((f) => f.path).join(", ")}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!ws?.root) return;
                    const res = await nativeCheckpoints.restore(ws.root, cp.id);
                    if (res) {
                      const tree = await refreshTree(ws);
                      patchUI({ workspace: { ...ws, tree } });
                      notify(`Restored ${res.restoredFiles.length} file${res.restoredFiles.length === 1 ? "" : "s"}`);
                      void loadCheckpoints();
                    }
                  }}
                  className="state shrink-0 rounded-lg bg-surface-high px-2.5 py-1 text-[11px] font-semibold text-on-surface"
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {creatingFile && (
        <div className="flex items-center gap-1.5 border-b border-outline-variant/60 bg-surface-low px-3 py-2">
          <input
            autoFocus
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createNewFile();
              if (e.key === "Escape") setCreatingFile(false);
            }}
            placeholder="path/to/file.ts"
            className="h-8 flex-1 rounded-lg border border-outline-variant bg-surface px-2.5 font-mono text-xs outline-none focus:border-primary"
          />
          <button
            onClick={createNewFile}
            className="state h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary"
          >
            Create
          </button>
        </div>
      )}

      <div className="border-b border-outline-variant/50 px-3 py-1.5">
        <div className="relative flex items-center">
          <Icon name="search" size={14} className="absolute left-2.5 text-on-surface-variant" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter files…"
            className="h-7.5 w-full rounded-lg bg-surface-container pl-8 pr-2.5 text-xs outline-none placeholder:text-on-surface-variant/60"
          />
        </div>
      </div>

      {activeFile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-outline-variant/60 bg-surface-low px-3 py-1.5">
            <button
              onClick={() => setActiveFile(null)}
              className="state inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-on-surface-variant hover:text-on-surface"
            >
              <Icon name="arrow_back" size={14} />
              Tree
            </button>
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-on-surface">
              {activeFile.path}
              {activeFile.dirty ? " *" : ""}
            </span>
            <div className="flex items-center rounded-full border border-outline-variant/60 bg-surface p-0.5 text-[11px] font-medium">
              {(["code", "diff"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setEditorMode(m)}
                  className={cn(
                    "rounded-full px-2 py-0.5 capitalize transition-colors",
                    editorMode === m ? "bg-surface-high font-semibold text-on-surface" : "text-on-surface-variant"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <IconBtn
              label="Find & Replace (Ctrl+F)"
              size={28}
              active={findOpen}
              onClick={() => setFindOpen(!findOpen)}
            >
              <Icon name="find_replace" size={14} />
            </IconBtn>
            <IconBtn
              label="Check syntax (QualityAuditor)"
              size={28}
              onClick={async () => {
                if (!ws?.root) return;
                const issues = await nativeAudit.check(ws.root, [activeFile.path]);
                setSyntaxFindings(issues);
                notify(issues.length === 0 ? "0 syntax issues found" : `${issues.length} finding(s)`);
              }}
            >
              <Icon name="fact_check" size={14} />
            </IconBtn>
            {/\.html?$/i.test(activeFile.path) && (
              <button
                onClick={() => {
                  const st = useStore.getState();
                  const fileName = activeFile.path.split("/").pop() || activeFile.path;
                  const existing = st.artboards.find(
                    (a) =>
                      (a.source && a.source.toLowerCase() === activeFile.path.toLowerCase()) ||
                      a.name.toLowerCase() === fileName.toLowerCase()
                  );
                  if (existing) {
                    st.reviseArtboard(existing.id, activeFile.content);
                    st.updateArtboard(existing.id, { source: activeFile.path });
                    focusArtboard(existing.id);
                  } else {
                    const ab = st.addArtboard({
                      name: fileName,
                      device: "web",
                      html: activeFile.content,
                      source: activeFile.path,
                    });
                    focusArtboard(ab.id);
                  }
                  notify(`Opened ${activeFile.path} in Workbench`);
                }}
                className="state h-7 rounded-lg bg-secondary-container px-2.5 text-[11.5px] font-semibold text-on-secondary-container"
              >
                Workbench
              </button>
            )}
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("zeus:attach", {
                    detail: {
                      id: activeFile.path,
                      name: activeFile.path,
                      mime: "text/plain",
                      size: activeFile.content.length,
                      text: activeFile.content,
                    },
                  })
                );
                patchUI({ leftTab: "chat" });
                notify(`Attached ${activeFile.path}`);
              }}
              className="state h-7 rounded-lg bg-surface-high px-2 text-[11.5px] font-medium text-on-surface"
            >
              Attach
            </button>
            <button
              disabled={!activeFile.dirty || saving}
              onClick={saveActiveFile}
              className="state inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11.5px] font-semibold text-on-primary disabled:opacity-40"
            >
              <Icon name="save" size={13} />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {findOpen && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-outline-variant/60 bg-surface px-3 py-1.5 text-xs">
              <input
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Find…"
                className="h-7 min-w-[110px] flex-1 rounded-lg border border-outline-variant/60 bg-surface-container px-2 font-mono text-xs outline-none focus:border-primary"
              />
              <input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace with…"
                className="h-7 min-w-[110px] flex-1 rounded-lg border border-outline-variant/60 bg-surface-container px-2 font-mono text-xs outline-none focus:border-primary"
              />
              <button
                disabled={!findText}
                onClick={() => {
                  if (!findText || !activeFile.content.includes(findText)) return;
                  setActiveFile({
                    ...activeFile,
                    content: activeFile.content.replace(findText, replaceText),
                    dirty: true,
                  });
                }}
                className="state h-7 rounded-lg bg-surface-high px-2.5 text-[11px] font-medium text-on-surface disabled:opacity-40"
              >
                Replace
              </button>
              <button
                disabled={!findText}
                onClick={() => {
                  if (!findText || !activeFile.content.includes(findText)) return;
                  setActiveFile({
                    ...activeFile,
                    content: activeFile.content.split(findText).join(replaceText),
                    dirty: true,
                  });
                }}
                className="state h-7 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-on-primary disabled:opacity-40"
              >
                All
              </button>
            </div>
          )}

          {syntaxFindings !== null && (
            <div className="flex items-center justify-between gap-2 border-b border-outline-variant/50 bg-surface-low px-3 py-1.5 text-[11.5px]">
              {syntaxFindings.length === 0 ? (
                <span className="font-medium text-tertiary">check_syntax: 0 errors or warnings</span>
              ) : (
                <div className="min-w-0 flex-1 space-y-0.5 font-mono text-[11px] text-error">
                  {syntaxFindings.slice(0, 4).map((f, idx) => (
                    <div key={idx} className="truncate">{f}</div>
                  ))}
                </div>
              )}
              <button onClick={() => setSyntaxFindings(null)} className="text-on-surface-variant hover:text-on-surface">
                <Icon name="close" size={13} />
              </button>
            </div>
          )}

          {editorMode === "diff" ? (
            <div className="min-h-0 flex-1 overflow-auto bg-surface-lowest p-3 font-mono text-[12px] leading-relaxed select-text">
              {(() => {
                const d = DiffUtils.computeDiff(activeFile.originalContent, activeFile.content, 3);
                if (d.additions === 0 && d.deletions === 0) {
                  return <div className="py-8 text-center font-sans text-xs text-on-surface-variant">No unsaved changes in {activeFile.path}</div>;
                }
                return (
                  <div className="space-y-0.5">
                    {d.lines.map((dl, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-baseline gap-2 rounded-sm px-2 py-0.5",
                          dl.kind === "add" && "bg-tertiary-container/30 text-tertiary",
                          dl.kind === "del" && "bg-error-container/30 text-error",
                          dl.kind === "ctx" && "text-on-surface-variant"
                        )}
                      >
                        <span className="w-8 shrink-0 select-none text-right text-[10.5px] opacity-55">
                          {dl.newLine ?? dl.oldLine ?? ""}
                        </span>
                        <span className="whitespace-pre-wrap break-all">{dl.text}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden bg-surface-dim">
              <div
                ref={gutterRef}
                className="no-bar select-none overflow-hidden border-r border-outline-variant/40 bg-surface-low py-3 pl-2 pr-2.5 text-right font-mono text-[11.5px] leading-[1.625] text-on-surface-variant/55"
              >
                {activeFile.content.split("\n").map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                value={activeFile.content}
                spellCheck={false}
                onScroll={(e) => {
                  if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                onChange={(e) => setActiveFile({ ...activeFile, content: e.target.value, dirty: true })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    void saveActiveFile();
                  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
                    e.preventDefault();
                    setFindOpen((v) => !v);
                  }
                }}
                className="min-h-0 flex-1 resize-none bg-surface-dim p-3 font-mono text-[12px] leading-[1.625] text-on-surface outline-none"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {filteredTree.length === 0 ? (
            <div className="py-10 text-center text-xs text-on-surface-variant">No matching files</div>
          ) : (
            <Tree
              nodes={filteredTree}
              forceOpen={Boolean(q.trim())}
              onPick={(n) => void openFile(n.path)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Terminal: real PTY shells (xterm) + live stream of the agent's runs  */
/* ------------------------------------------------------------------ */
const TerminalView = lazy(() => import("./TerminalView"));

function AgentRuns({ projId }: { projId: string }) {
  const allRuns = useStore((s) => s.terminalHistory);
  const { clearTerminal, patchUI, notify } = useStore.getState();
  const runs = useMemo(() => allRuns.filter((r) => r.projectId === projId && r.source === "agent"), [allRuns, projId]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const last = runs[runs.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [runs.length, last?.stdout.length, last?.running]);

  const askZeus = (r: { cmd: string; stdout: string; stderr: string; code: number }) => {
    const out = [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join("\n").slice(0, 8000);
    const snippet = `Terminal command \`${r.cmd}\` (exit ${r.code}):\n\`\`\`\n${out || "(no output)"}\n\`\`\`\n`;
    patchUI({ leftTab: "chat" });
    setTimeout(() => window.dispatchEvent(new CustomEvent("zeus:prefill", { detail: snippet })), 30);
    notify("Sent terminal output to chat composer");
  };

  if (runs.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center bg-surface-dim p-6 text-center text-xs text-on-surface-variant">
        Commands Zeus runs show up here as they stream.
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-dim py-1 font-mono text-[12px]">
      {runs.map((r) => {
        const isOpen = open[r.id] ?? Boolean(r.running);
        const body = [r.stdout, r.stderr && r.stdout && !r.stdout.includes(r.stderr) ? r.stderr : r.stdout ? "" : r.stderr]
          .filter(Boolean)
          .join("\n");
        return (
          <div key={r.id} className="border-b border-outline-variant/30">
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button
                onClick={() => setOpen((o) => ({ ...o, [r.id]: !isOpen }))}
                className="state flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left"
              >
                <Icon name={isOpen ? "expand_more" : "chevron_right"} size={15} className="shrink-0 text-on-surface-variant" />
                <span className="shrink-0 text-primary">$</span>
                <span className={cn("truncate", r.running ? "zshine" : "text-on-surface")}>{r.cmd}</span>
              </button>
              {r.running ? (
                <IconBtn label="Stop" size={26} onClick={() => ptyApi.cancelRun(r.id)}>
                  <Icon name="stop" size={15} />
                </IconBtn>
              ) : (
                <>
                  {r.code !== 0 && (
                    <span className="shrink-0 rounded bg-error-container px-1.5 py-0.5 text-[10px] font-semibold text-on-error-container">
                      exit {r.code}
                    </span>
                  )}
                  <IconBtn label="Send output to chat" size={26} onClick={() => askZeus(r)}>
                    <Icon name="forum" size={14} />
                  </IconBtn>
                </>
              )}
            </div>
            {isOpen && (
              <pre className="mx-2 mb-2 max-h-72 select-text overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-lowest p-2 text-[11.5px] leading-relaxed text-on-surface-variant">
                {body || (r.running ? "" : "(no output)")}
              </pre>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
      <div className="flex justify-end px-2 py-1">
        <button onClick={() => clearTerminal(projId)} className="state rounded-md px-2 py-0.5 font-sans text-[11px] text-on-surface-variant">
          Clear
        </button>
      </div>
    </div>
  );
}

export function TerminalPanel() {
  const curProject = useStore(activeProject);
  const ws = useStore((s) => s.ui.workspace);
  const allRuns = useStore((s) => s.terminalHistory);
  const projId = curProject?.id ?? "proj-default";
  const cwd = ws?.root ?? curProject?.root ?? "";
  const { tabs, active } = usePtyTabs(projId);
  const [mode, setMode] = useState<"shell" | "agent">("shell");
  const [shells, setShells] = useState<{ default: ShellInfo; available: ShellInfo[] } | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const agentRunning = useMemo(
    () => allRuns.filter((r) => r.projectId === projId && r.source === "agent" && r.running).length,
    [allRuns, projId]
  );

  useEffect(() => {
    if (!isNative) return;
    void ptyShells().then(setShells);
  }, []);
  useEffect(() => {
    if (isNative && tabs.length === 0) void ensurePty(projId, cwd).catch(() => {});
  }, [projId, cwd, tabs.length]);

  const current = tabs.find((t) => t.id === active) ?? tabs[tabs.length - 1];
  const add = (shell?: string) => {
    setMode("shell");
    void openPty(projId, cwd, shell).catch(() => {});
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim">
      <div className="flex items-center gap-1 border-b border-outline-variant/60 px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((t) => {
            const on = mode === "shell" && current?.id === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  "group flex h-7 shrink-0 items-center gap-1 rounded-lg pl-2 pr-1 text-[11.5px] font-medium",
                  on ? "bg-surface-high text-on-surface" : "text-on-surface-variant hover:bg-surface-container"
                )}
              >
                <button
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    setMode("shell");
                    setActivePty(projId, t.id);
                    setFocusKey((k) => k + 1);
                  }}
                >
                  <Icon name="terminal" size={13} />
                  <span className={cn("max-w-[110px] truncate", t.exited !== undefined && "line-through opacity-60")}>{t.title}</span>
                </button>
                <button
                  onClick={() => closePty(t.id)}
                  aria-label="Close terminal"
                  className="state grid size-5 place-items-center rounded-md opacity-60 hover:opacity-100"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            );
          })}
          {shells && shells.available.length > 1 ? (
            <Dropdown
              width={220}
              trigger={({ toggle }) => (
                <IconBtn label="New terminal" size={26} onClick={toggle}>
                  <Icon name="add" size={15} />
                </IconBtn>
              )}
            >
              {(close) => (
                <>
                  {shells.available.map((s) => (
                    <MenuItem
                      key={s.id}
                      label={s.label}
                      icon={<Icon name="terminal" size={16} />}
                      onClick={() => {
                        close();
                        add(s.id);
                      }}
                    />
                  ))}
                </>
              )}
            </Dropdown>
          ) : (
            <IconBtn label="New terminal" size={26} onClick={() => add()}>
              <Icon name="add" size={15} />
            </IconBtn>
          )}
        </div>
        <button
          onClick={() => setMode(mode === "agent" ? "shell" : "agent")}
          className={cn(
            "state flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium",
            mode === "agent" ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant"
          )}
        >
          Zeus
          {agentRunning > 0 && <span className="size-1.5 rounded-full bg-primary" />}
        </button>
      </div>

      {mode === "agent" ? (
        <AgentRuns projId={projId} />
      ) : !isNative ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-xs text-on-surface-variant">
          The terminal runs in the Windows app.
        </div>
      ) : current ? (
        <Suspense fallback={<div className="min-h-0 flex-1 bg-surface-dim" />}>
          <TerminalView key={current.id} id={current.id} focusKey={focusKey} />
        </Suspense>
      ) : (
        <div className="min-h-0 flex-1 bg-surface-dim" />
      )}
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* Project Workspace Overview (shown on new chat inside a project)     */
/* ------------------------------------------------------------------ */
const AGENT_TASKS = [
  { icon: "manage_search", label: "Map codebase", prompt: "Map the architecture and key files of this project." },
  { icon: "bug_report", label: "Find & fix bugs", prompt: "Inspect the codebase, run checks or tests, and fix any bugs." },
  { icon: "terminal", label: "Run tests & build", prompt: "Run the test suite or build in this project and fix any issues." },
  { icon: "description", label: "Generate AGENTS.md", prompt: "Analyze this project and create a concise AGENTS.md file." },
];

export function ProjectWorkspaceCard({
  onOpenDock,
}: {
  onOpenDock: (tab: "files" | "terminal", filePath?: string) => void;
}) {
  const ws = useStore((s) => s.ui.workspace);
  const curProject = useStore(activeProject);
  const providerId = useStore((s) => s.settings.providerId);
  const modelId = useStore((s) => s.settings.modelId);
  const agentRuntime = useStore((s) => s.settings.agentRuntime ?? "zeus");
  const patchSettings = useStore((s) => s.patchSettings);
  const topNodes = (ws?.tree ?? []).slice(0, 12);

  return (
    <div className="mx-auto my-auto flex w-full max-w-[680px] flex-col gap-4 py-6">
      <div className="rounded-2xl border border-outline-variant/60 bg-surface-low p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-container text-on-primary-container">
              <Icon name="folder_open" size={19} />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-base font-semibold text-on-surface">
                {ws?.name ?? curProject?.name ?? "Workspace"}
              </div>
              {(ws?.root ?? curProject?.root) && (
                <div className="truncate font-mono text-[11.5px] text-on-surface-variant">
                  {ws?.root ?? curProject?.root}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              title={`Active coding runtime for ${providerId}/${modelId}`}
              className="inline-flex h-8 items-center rounded-full border border-outline-variant/60 bg-surface p-0.5 text-[11.5px] font-semibold"
            >
              <button
                onClick={() => patchSettings({ agentRuntime: "zeus" })}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 transition-colors",
                  agentRuntime === "zeus" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Icon name="bolt" size={13} />
                Harness²
              </button>
              <button
                onClick={() => patchSettings({ agentRuntime: "opencode" })}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 transition-colors",
                  agentRuntime === "opencode" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Icon name="terminal" size={13} />
                OpenCode SDK
              </button>
            </div>
            <button
              onClick={() => onOpenDock("files")}
              className="state inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-high px-3 text-xs font-medium text-on-surface"
            >
              <Icon name="account_tree" size={14} />
              Files ({ws?.tree.length ?? 0})
            </button>
            <button
              onClick={() => onOpenDock("terminal")}
              className="state inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-high px-3 text-xs font-medium text-on-surface"
            >
              <Icon name="terminal" size={14} />
              Terminal
            </button>
          </div>
        </div>

        {topNodes.length > 0 && (
          <div className="mt-3.5 grid grid-cols-2 gap-1.5 border-t border-outline-variant/40 pt-3 sm:grid-cols-3">
            {topNodes.map((n) => (
              <button
                key={n.path}
                onClick={() => onOpenDock("files", n.dir ? undefined : n.path)}
                className="state flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-left text-xs text-on-surface"
              >
                <Icon
                  name={n.dir ? "folder" : "code"}
                  size={14}
                  className={cn("shrink-0", n.dir ? "text-primary" : "text-on-surface-variant")}
                />
                <span className="truncate font-mono text-[11.5px]">
                  {n.name}
                  {n.dir ? "/" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {AGENT_TASKS.map((t) => (
          <button
            key={t.label}
            onClick={() => window.dispatchEvent(new CustomEvent("zeus:prefill", { detail: t.prompt }))}
            className="state flex h-9 items-center gap-2 rounded-xl bg-surface-container px-3 text-xs font-medium text-on-surface"
          >
            <Icon name={t.icon} size={16} className="text-primary" />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export { GitPanel } from "./GitPanel";
