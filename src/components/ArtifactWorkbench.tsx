import { useMemo, useState } from "react";
import { activeConv, useStore } from "../store";
import { writeWorkspaceFile, refreshTree } from "../lib/bridge";
import { Icon } from "./Icon";
import { IconBtn } from "./ui";
import { cn } from "../utils/cn";

type ViewMode = "preview" | "code" | "split";
type ViewportSize = "responsive" | "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<ViewportSize, string> = {
  responsive: "100%",
  desktop: "1280px",
  tablet: "834px",
  mobile: "390px",
};

export function ArtifactWorkbench() {
  const boards = useStore((s) => s.artboards);
  const selectedIds = useStore((s) => s.selectedIds);
  const conv = useStore(activeConv);
  const workspace = useStore((s) => s.ui.workspace);
  const patchUI = useStore((s) => s.patchUI);
  const updateArtboard = useStore((s) => s.updateArtboard);
  const deleteArtboard = useStore((s) => s.deleteArtboard);
  const select = useStore((s) => s.select);
  const notify = useStore((s) => s.notify);

  const [mode, setMode] = useState<ViewMode>("preview");
  const [viewport, setViewport] = useState<ViewportSize>("responsive");
  const [draftHtml, setDraftHtml] = useState<string | null>(null);

  const convBoardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of conv.messages) {
      for (const id of m.artboardIds ?? []) ids.add(id);
    }
    return ids;
  }, [conv.messages]);

  const list = useMemo(() => {
    const inConv = boards.filter((b) => convBoardIds.has(b.id));
    return inConv.length > 0 ? inConv : boards;
  }, [boards, convBoardIds]);

  const active = useMemo(() => {
    const sel = list.find((b) => selectedIds.includes(b.id));
    return sel ?? list[list.length - 1] ?? null;
  }, [list, selectedIds]);

  const codeValue = draftHtml ?? active?.html ?? "";

  const handleSaveToWorkspace = async () => {
    if (!active) return;
    const html = draftHtml ?? active.html;
    const slug = (active.name || "artifact")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "artifact";
    const fileName = `${slug}.html`;
    if (workspace) {
      const ok = await writeWorkspaceFile(workspace, fileName, html);
      if (ok) {
        const tree = await refreshTree();
        if (tree) patchUI({ workspace: { ...workspace, tree } });
        notify(`Saved ${fileName} to ${workspace.name}`);
        return;
      }
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Downloaded ${fileName}`);
  };

  const handleCopyCode = () => {
    if (!active) return;
    navigator.clipboard.writeText(codeValue).then(
      () => notify("Copied HTML source to clipboard"),
      () => notify("Failed to copy")
    );
  };

  const handleApplyDraft = () => {
    if (!active || draftHtml === null) return;
    updateArtboard(active.id, { html: draftHtml, version: active.version + 1 });
    setDraftHtml(null);
    notify("Updated artifact preview");
  };

  if (!active) {
    return (
      <div className="flex h-full w-full flex-col rounded-2xl border border-outline-variant/60 bg-surface-low">
        <div className="flex h-11 items-center justify-between border-b border-outline-variant/60 px-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
            <Icon name="code_blocks" size={16} className="text-primary" />
            <span>Artifact Workbench</span>
          </div>
          <IconBtn label="Close workbench" size={30} onClick={() => patchUI({ showCanvas: false, m3e: null })}>
            <Icon name="close" size={17} />
          </IconBtn>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <Icon name="terminal" size={28} className="mb-2 text-on-surface-variant" />
          <div className="text-sm font-semibold text-on-surface">No active HTML artifact</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-low">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-outline-variant/60 bg-surface-container/60 px-3">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-bar">
          {list.map((b) => {
            const isSel = b.id === active.id;
            return (
              <button
                key={b.id}
                onClick={() => {
                  setDraftHtml(null);
                  select([b.id]);
                }}
                className={cn(
                  "state inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium",
                  isSel
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Icon name="web" size={13} />
                <span className="max-w-[140px] truncate">{b.name}</span>
                <span className="font-mono text-[10px] opacity-75">v{b.version}</span>
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center rounded-lg border border-outline-variant/60 bg-surface p-0.5">
            {(["preview", "split", "code"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "state h-6 rounded-md px-2 text-[11px] font-semibold capitalize",
                  mode === m ? "bg-surface-high text-on-surface" : "text-on-surface-variant"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {mode !== "code" && (
            <div className="flex items-center rounded-lg border border-outline-variant/60 bg-surface p-0.5">
              {(
                [
                  { id: "responsive", icon: "width" },
                  { id: "desktop", icon: "laptop" },
                  { id: "tablet", icon: "crop_landscape" },
                  { id: "mobile", icon: "smartphone" },
                ] as { id: ViewportSize; icon: string }[]
              ).map((vp) => (
                <button
                  key={vp.id}
                  onClick={() => setViewport(vp.id)}
                  title={vp.id}
                  className={cn(
                    "state grid size-6 place-items-center rounded-md",
                    viewport === vp.id ? "bg-surface-high text-primary" : "text-on-surface-variant"
                  )}
                >
                  <Icon name={vp.icon} size={14} />
                </button>
              ))}
            </div>
          )}

          {draftHtml !== null && (
            <button
              onClick={handleApplyDraft}
              className="state inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-on-primary"
            >
              <Icon name="check" size={14} />
              Apply
            </button>
          )}

          <button
            onClick={handleCopyCode}
            className="state inline-flex h-7 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface px-2 text-xs font-medium text-on-surface"
          >
            <Icon name="content_copy" size={13} />
            Copy
          </button>

          <button
            onClick={handleSaveToWorkspace}
            className="state inline-flex h-7 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface px-2.5 text-xs font-medium text-on-surface"
          >
            <Icon name="save" size={14} />
            {workspace ? "Save to project" : "Export HTML"}
          </button>

          <IconBtn
            label="Delete artifact"
            size={28}
            onClick={() => deleteArtboard(active.id)}
          >
            <Icon name="delete" size={15} />
          </IconBtn>

          <IconBtn
            label="Close workbench"
            size={28}
            onClick={() => patchUI({ showCanvas: false, m3e: null })}
          >
            <Icon name="close" size={16} />
          </IconBtn>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {(mode === "preview" || mode === "split") && (
          <div
            className={cn(
              "flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface p-3",
              mode === "split" && "border-r border-outline-variant/60"
            )}
          >
            <div
              style={{ width: VIEWPORT_WIDTHS[viewport] }}
              className="h-full max-w-full overflow-hidden rounded-xl border border-outline-variant/50 bg-white"
            >
              <iframe
                title={active.name}
                srcDoc={codeValue}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        )}

        {(mode === "code" || mode === "split") && (
          <div className="flex min-h-0 flex-1 flex-col bg-surface-low">
            <div className="flex h-8 items-center justify-between border-b border-outline-variant/40 px-3 font-mono text-[11px] text-on-surface-variant">
              <span>{active.name}.html ({codeValue.split("\n").length} lines)</span>
              <span>Raw HTML/CSS/JS</span>
            </div>
            <textarea
              value={codeValue}
              onChange={(e) => setDraftHtml(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed text-on-surface outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
