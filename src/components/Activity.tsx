import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { Message, ToolCall } from "../types";
import { DiffUtils, ToolAliases, type ComputedDiff } from "../lib/stormyAgent";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { Markdown } from "./MarkdownView";

/* ------------------------------------------------------------------ */
/* Shimmer-only activity & collapsible reasoning (no orb / no logo)    */
/* ------------------------------------------------------------------ */
export function ZeusOrb(_props?: { size?: number; live?: boolean; className?: string }) {
  return null;
}

/** Height-animated disclosure. Content stays mounted so it can measure and scroll. */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("zcollapse", open && "open", className)}>
      <div className="zcollapse-in">{children}</div>
    </div>
  );
}

function secs(ms?: number) {
  if (!ms) return "";
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/* ------------------------------------------------------------------ */
/* Stormy ToolPresentation (ToolPresentation.kt)                       */
/* ------------------------------------------------------------------ */
export type ToolDetailKind = "Diff" | "Code" | "Listing" | "Terminal" | "Prose";

export interface ToolPresentation {
  running: string;
  done: string;
  icon: string;
  subjectIsPath: boolean;
  detail: ToolDetailKind;
}

const PRESENTATIONS: Record<string, ToolPresentation> = {
  read_file: { running: "Reading", done: "Read", icon: "description", subjectIsPath: true, detail: "Code" },
  list_files: { running: "Listing", done: "Listed", icon: "folder_open", subjectIsPath: true, detail: "Listing" },
  glob: { running: "Matching", done: "Matched", icon: "manage_search", subjectIsPath: false, detail: "Listing" },
  grep: { running: "Grepping for", done: "Found", icon: "find_in_page", subjectIsPath: false, detail: "Listing" },
  search_project: { running: "Searching project", done: "Searched project", icon: "travel_explore", subjectIsPath: false, detail: "Listing" },
  write_file: { running: "Writing", done: "Wrote", icon: "edit_note", subjectIsPath: true, detail: "Diff" },
  edit_file: { running: "Editing", done: "Edited", icon: "difference", subjectIsPath: true, detail: "Diff" },
  multi_edit: { running: "Editing", done: "Edited", icon: "difference", subjectIsPath: true, detail: "Diff" },
  delete_file: { running: "Deleting", done: "Deleted", icon: "delete", subjectIsPath: true, detail: "Terminal" },
  move_file: { running: "Moving", done: "Moved", icon: "drive_file_move", subjectIsPath: true, detail: "Terminal" },
  check_syntax: { running: "Auditing", done: "Audited", icon: "bug_report", subjectIsPath: true, detail: "Terminal" },
  docs_lookup: { running: "Checking docs", done: "Checked docs", icon: "menu_book", subjectIsPath: false, detail: "Prose" },
  use_skill: { running: "Loading skill", done: "Loaded skill", icon: "auto_awesome_motion", subjectIsPath: false, detail: "Prose" },
  web_fetch: { running: "Fetching", done: "Fetched", icon: "link", subjectIsPath: false, detail: "Prose" },
  run_command: { running: "Running", done: "Ran", icon: "terminal", subjectIsPath: false, detail: "Terminal" },
  python: { running: "Running Python", done: "Ran Python", icon: "code", subjectIsPath: false, detail: "Terminal" },
  memory_save: { running: "Saving note", done: "Noted", icon: "psychology", subjectIsPath: false, detail: "Prose" },
  memory_search: { running: "Recalling", done: "Recalled", icon: "psychology", subjectIsPath: false, detail: "Prose" },
  memory_edit: { running: "Updating note", done: "Updated note", icon: "psychology", subjectIsPath: false, detail: "Prose" },
  memory_delete: { running: "Removing note", done: "Removed note", icon: "psychology", subjectIsPath: false, detail: "Prose" },
  update_plan: { running: "Planning", done: "Updated plan", icon: "checklist", subjectIsPath: false, detail: "Prose" },
  ask_user: { running: "Asking", done: "Asked", icon: "help", subjectIsPath: false, detail: "Prose" },
  request_approval: { running: "Awaiting approval", done: "Requested approval", icon: "verified_user", subjectIsPath: false, detail: "Prose" },
  spawn_subagent: { running: "Delegating", done: "Delegated", icon: "call_split", subjectIsPath: false, detail: "Prose" },
  add_ui_kit: { running: "Installing UI kit", done: "Installed UI kit", icon: "style", subjectIsPath: false, detail: "Terminal" },
  copy_file: { running: "Copying", done: "Copied", icon: "content_copy", subjectIsPath: true, detail: "Terminal" },
  create_folder: { running: "Creating folder", done: "Created folder", icon: "create_new_folder", subjectIsPath: true, detail: "Terminal" },
  insert_at_line: { running: "Inserting lines", done: "Inserted lines", icon: "playlist_add", subjectIsPath: true, detail: "Diff" },
  append_to_file: { running: "Appending to", done: "Appended to", icon: "post_add", subjectIsPath: true, detail: "Diff" },
  prepend_to_file: { running: "Prepending to", done: "Prepended to", icon: "post_add", subjectIsPath: true, detail: "Diff" },
  regex_replace: { running: "Replacing in", done: "Replaced in", icon: "find_replace", subjectIsPath: true, detail: "Diff" },
  get_file_info: { running: "Inspecting", done: "Inspected", icon: "info", subjectIsPath: true, detail: "Code" },
  diff_files: { running: "Diffing", done: "Diffed", icon: "difference", subjectIsPath: true, detail: "Code" },
  git_status: { running: "Checking Git status", done: "Checked Git status", icon: "commit", subjectIsPath: false, detail: "Terminal" },
  git_diff: { running: "Checking Git diff", done: "Checked Git diff", icon: "difference", subjectIsPath: true, detail: "Code" },
  git_log: { running: "Reading Git log", done: "Read Git log", icon: "history", subjectIsPath: false, detail: "Terminal" },
  git_branch: { running: "Listing branches", done: "Listed branches", icon: "call_split", subjectIsPath: false, detail: "Terminal" },
  git_stage: { running: "Staging", done: "Staged", icon: "add_task", subjectIsPath: true, detail: "Terminal" },
  git_unstage: { running: "Unstaging", done: "Unstaged", icon: "remove_done", subjectIsPath: true, detail: "Terminal" },
  git_commit: { running: "Committing", done: "Committed", icon: "commit", subjectIsPath: false, detail: "Terminal" },
  security_scan: { running: "Scanning security", done: "Scanned security", icon: "shield", subjectIsPath: true, detail: "Terminal" },
  quality_gate: { running: "Auditing quality", done: "QualityGate passed", icon: "fact_check", subjectIsPath: false, detail: "Terminal" },
  lmfingerprint: { running: "Verifying model", done: "Verified model", icon: "verified", subjectIsPath: false, detail: "Terminal" },
  context_compact: { running: "Compacting context", done: "Compacted context", icon: "inventory_2", subjectIsPath: false, detail: "Prose" },
  auto_continue: { running: "Continuing stream", done: "Continued stream", icon: "autorenew", subjectIsPath: false, detail: "Terminal" },
  design_audit: { running: "Auditing layout", done: "Audited layout", icon: "straighten", subjectIsPath: true, detail: "Terminal" },
  design_repair: { running: "Repairing layout", done: "Repaired layout", icon: "build", subjectIsPath: true, detail: "Terminal" },
  studio_retheme_page: { running: "Applying theme", done: "Applied theme", icon: "palette", subjectIsPath: false, detail: "Terminal" },
};

export function getToolPresentation(rawName: string): ToolPresentation {
  if (rawName.startsWith("mcp:")) {
    return {
      running: "Calling MCP",
      done: "Called MCP",
      icon: "extension",
      subjectIsPath: false,
      detail: "Code",
    };
  }
  if (rawName.startsWith("studio_")) {
    const clean = rawName.replace(/^studio_/, "").replace(/_/g, " ");
    return {
      running: `Studio ${clean}`,
      done: `Studio ${clean}`,
      icon: "design_services",
      subjectIsPath: false,
      detail: "Terminal",
    };
  }
  const canon = ToolAliases.canonicalName(rawName);
  return (
    PRESENTATIONS[canon] ??
    PRESENTATIONS[rawName] ?? {
      running: `Running ${rawName.replace(/_/g, " ")}`,
      done: `Ran ${rawName.replace(/_/g, " ")}`,
      icon: "build",
      subjectIsPath: false,
      detail: "Terminal",
    }
  );
}

export function shortenPath(raw: string, maxLen = 42): string {
  const clean = raw.trim().replace(/\\/g, "/");
  if (clean.length <= maxLen) return clean;
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 2) return `...${clean.slice(-(maxLen - 3))}`;
  const file = parts[parts.length - 1];
  const parent = parts[parts.length - 2];
  const tail = `${parent}/${file}`;
  return tail.length <= maxLen ? `.../${tail}` : `.../${file.slice(-(maxLen - 4))}`;
}

export function toolTitle(name: string, running = false): { label: string; sub?: string; icon: string } {
  if (name.startsWith("mcp:")) {
    const [, server, ...tool] = name.split(":");
    return { label: tool.join(":") || name, sub: server.replace(/^mcp-/, ""), icon: "extension" };
  }
  const pres = getToolPresentation(name);
  return {
    label: running ? `${pres.running}…` : pres.done,
    icon: pres.icon,
  };
}

interface ParsedToolEntry {
  subject: string;
  body: string;
  additions: number;
  deletions: number;
  computedDiff: ComputedDiff | null;
  meta: string;
}

function parseToolEntry(t: ToolCall, pres: ToolPresentation): ParsedToolEntry {
  let path = "";
  let body = "";
  try {
    const j = JSON.parse(t.args ?? "{}");
    path = String(
      j.path || j.file || j.source || j.pattern || j.query || j.url || j.name || ""
    ).trim();
    body = String(j.body || j.content || j.command || j.script || "").trim();
  } catch {
    body = (t.args ?? "").trim();
  }

  const canon = ToolAliases.canonicalName(t.name);
  const rawSubject =
    path ||
    (["run_command", "python", "grep", "glob", "search_project"].includes(canon)
      ? body.split("\n")[0]?.slice(0, 72) ?? ""
      : body.slice(0, 56));
  const subject = pres.subjectIsPath && rawSubject ? shortenPath(rawSubject) : rawSubject;

  // 1. Exact before/after diff from native checkpoint capture
  if (t.oldContent !== undefined || t.newContent !== undefined) {
    const computedDiff = DiffUtils.computeDiff(t.oldContent ?? "", t.newContent ?? "", 3);
    return {
      subject,
      body,
      additions: t.additions ?? computedDiff.additions,
      deletions: t.deletions ?? computedDiff.deletions,
      computedDiff,
      meta: "",
    };
  }

  // 2. Fallback diff for SEARCH/REPLACE blocks or JSON old_string/new_string
  if ((canon === "edit_file" || canon === "multi_edit") && body) {
    if (body.includes("=======")) {
      const diffLines: ComputedDiff["lines"] = [];
      let additions = 0;
      let deletions = 0;
      let state: "outside" | "search" | "replace" = "outside";
      for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
        if (/^<{4,}/.test(line.trim())) {
          state = "search";
          continue;
        }
        if (/^={4,}/.test(line.trim())) {
          state = "replace";
          continue;
        }
        if (/^>{4,}/.test(line.trim())) {
          state = "outside";
          continue;
        }
        if (state === "search") {
          deletions++;
          diffLines.push({ kind: "del", text: `-${line}` });
        } else if (state === "replace") {
          additions++;
          diffLines.push({ kind: "add", text: `+${line}` });
        }
      }
      if (additions > 0 || deletions > 0) {
        return {
          subject,
          body,
          additions,
          deletions,
          computedDiff: { additions, deletions, lines: diffLines },
          meta: "",
        };
      }
    } else if (body.startsWith("{") && body.endsWith("}")) {
      try {
        const j = JSON.parse(body);
        const oldS = String(j.old_string ?? j.oldString ?? "");
        const newS = String(j.new_string ?? j.newString ?? "");
        if (oldS || newS) {
          const computedDiff = DiffUtils.computeDiff(oldS, newS, 3);
          return {
            subject,
            body,
            additions: computedDiff.additions,
            deletions: computedDiff.deletions,
            computedDiff,
            meta: "",
          };
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (canon === "write_file" && body) {
    const computedDiff = DiffUtils.computeDiff("", body, 3);
    return {
      subject,
      body,
      additions: computedDiff.additions,
      deletions: 0,
      computedDiff,
      meta: "",
    };
  }

  let meta = "";
  if (t.status === "ok" && t.output) {
    const outLines = t.output.trim().split("\n").filter(Boolean);
    if (pres.detail === "Code") {
      meta = `${outLines.length} lines`;
    } else if (pres.detail === "Listing") {
      meta = t.output.includes("(0 ") || t.output.includes("No matches") ? "0 hits" : `${outLines.length} items`;
    }
  }

  return {
    subject,
    body,
    additions: t.additions ?? 0,
    deletions: t.deletions ?? 0,
    computedDiff: null,
    meta,
  };
}

/* ------------------------------------------------------------------ */
/* Stormy ToolDetailSheet / Inspector Modal (ToolCard.kt)              */
/* ------------------------------------------------------------------ */
function ToolDetailModal({
  tool,
  pres,
  parsed,
  onClose,
}: {
  tool: ToolCall;
  pres: ToolPresentation;
  parsed: ParsedToolEntry;
  onClose: () => void;
}) {
  const notify = useStore((s) => s.notify);
  const patchUI = useStore((s) => s.patchUI);
  const [tab, setTab] = useState<"diff" | "new" | "old">("diff");

  const hasDiff = Boolean(parsed.computedDiff && parsed.computedDiff.lines.length > 0);
  const rawPath = useMemo(() => {
    try {
      const j = JSON.parse(tool.args ?? "{}");
      return String(j.path || j.file || "").trim();
    } catch {
      return "";
    }
  }, [tool.args]);

  const copyText = (txt: string) => {
    navigator.clipboard.writeText(txt);
    notify("Copied to clipboard");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[24px] border border-outline-variant bg-surface text-on-surface"
      >
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl",
                tool.status === "error"
                  ? "bg-error-container text-on-error-container"
                  : "bg-surface-high text-on-surface-variant"
              )}
            >
              <Icon name={tool.status === "error" ? "error" : pres.icon} size={17} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-on-surface-variant">
                  {tool.status === "running" ? pres.running : pres.done}
                </span>
                {parsed.subject && (
                  <span className="truncate font-mono text-[13px] font-semibold text-on-surface">
                    {parsed.subject}
                  </span>
                )}
                {(parsed.additions > 0 || parsed.deletions > 0) && (
                  <span className="flex items-center gap-1 rounded-full bg-surface-high px-2 py-0.5 font-mono text-[11px] font-semibold">
                    {parsed.additions > 0 && <span className="text-tertiary">+{parsed.additions}</span>}
                    {parsed.deletions > 0 && <span className="text-error">-{parsed.deletions}</span>}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {hasDiff && (tool.newContent || tool.oldContent) && (
              <div className="flex items-center rounded-full border border-outline-variant/60 bg-surface-low p-0.5 text-[11.5px] font-medium">
                {(["diff", "new", "old"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 capitalize transition-colors",
                      tab === k ? "bg-surface-high font-semibold text-on-surface" : "text-on-surface-variant"
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}
            {rawPath && (
              <button
                onClick={() => {
                  patchUI({ leftTab: "files" });
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: rawPath }));
                  }, 30);
                  onClose();
                }}
                className="state flex h-7 items-center gap-1 rounded-lg bg-surface-high px-2.5 text-xs font-medium text-on-surface"
              >
                <Icon name="open_in_new" size={13} />
                Open file
              </button>
            )}
            <button
              onClick={() => copyText(tool.newContent || tool.output || parsed.body)}
              className="state grid size-7 place-items-center rounded-lg bg-surface-high text-on-surface-variant hover:text-on-surface"
              title="Copy"
            >
              <Icon name="content_copy" size={14} />
            </button>
            <button
              onClick={onClose}
              className="state grid size-7 place-items-center rounded-lg bg-surface-high text-on-surface-variant hover:text-on-surface"
              title="Close"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-surface-lowest p-4 font-mono text-[12px] leading-relaxed select-text">
          {hasDiff && tab === "diff" && parsed.computedDiff ? (
            <div className="space-y-0.5">
              {parsed.computedDiff.lines.map((dl, idx) => (
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
          ) : hasDiff && tab === "new" ? (
            <pre className="whitespace-pre-wrap break-words text-on-surface">
              {tool.newContent || parsed.body}
            </pre>
          ) : hasDiff && tab === "old" ? (
            <pre className="whitespace-pre-wrap break-words text-on-surface-variant">
              {tool.oldContent || "(new file)"}
            </pre>
          ) : pres.detail === "Listing" && tool.output ? (
            <div className="space-y-1">
              {tool.output.split("\n").map((line, i) => {
                const fileMatch = /^([\w./\\-]+\.[a-z0-9]+)(?::(\d+))?/i.exec(line.trim());
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (fileMatch?.[1]) {
                        patchUI({ leftTab: "files" });
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: fileMatch[1] }));
                        }, 30);
                        onClose();
                      }
                    }}
                    className={cn(
                      "rounded-lg px-2 py-1",
                      fileMatch ? "cursor-pointer hover:bg-surface-high text-on-surface" : "text-on-surface-variant"
                    )}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {parsed.body && pres.detail === "Terminal" && (
                <div className="rounded-xl border border-outline-variant/50 bg-surface px-3 py-2 text-on-surface">
                  <span className="mr-2 text-primary">$</span>
                  {parsed.body}
                </div>
              )}
              {tool.output ? (
                <pre className="whitespace-pre-wrap break-words text-on-surface-variant">{tool.output}</pre>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-on-surface-variant">
                  {parsed.body || "(no output)"}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stormy ToolCard (One line: tile, verb, subject, +/- badge)          */
/* ------------------------------------------------------------------ */
function ToolCard({ t }: { t: ToolCall }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const running = t.status === "running";
  const isError = t.status === "error";
  const pres = getToolPresentation(t.name);
  const parsed = useMemo(() => parseToolEntry(t, pres), [t, pres]);
  const hasDetail = Boolean(t.output || parsed.computedDiff || parsed.body);

  return (
    <>
      <button
        onClick={() => hasDetail && setSheetOpen(true)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] transition-colors",
          hasDetail && "hover:bg-surface-high/65"
        )}
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            isError ? "bg-error-container text-on-error-container" : "bg-surface-high text-on-surface-variant"
          )}
        >
          <Icon name={isError ? "error" : pres.icon} size={15} />
        </span>

        <span className={cn("shrink-0 text-[13px]", running ? "zshine font-medium" : "text-on-surface-variant")}>
          {running ? pres.running : pres.done}
        </span>

        {parsed.subject && (
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-semibold text-on-surface">
            {parsed.subject}
          </span>
        )}
        {!parsed.subject && <span className="flex-1" />}

        {parsed.meta && !running && (
          <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">{parsed.meta}</span>
        )}

        {(parsed.additions > 0 || parsed.deletions > 0) && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-high px-2 py-0.5 font-mono text-[11px] font-semibold">
            {parsed.additions > 0 && <span className="text-tertiary">+{parsed.additions}</span>}
            {parsed.deletions > 0 && <span className="text-error">-{parsed.deletions}</span>}
          </span>
        )}

        {hasDetail && (
          <Icon name="chevron_right" size={15} className="shrink-0 text-on-surface-variant/70" />
        )}
      </button>

      {sheetOpen && (
        <ToolDetailModal
          tool={t}
          pres={pres}
          parsed={parsed}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Reasoning (collapsible thought trace with formatted Markdown)       */
/* ------------------------------------------------------------------ */
function ThinkingBlock({ text, live, ms }: { text: string; live: boolean; ms?: number }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? false;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && shown && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [text, live, shown]);
  const lines = text.trim().split(/\n+/).filter(Boolean);
  const firstLineClean = (lines[0] ?? "")
    .replace(/^[-*•#>\s]+/, "")
    .replace(/\*\*/g, "")
    .trim();

  return (
    <div className="rounded-xl">
      <button
        onClick={() => setOpen(!shown)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-surface-high/60"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-high text-on-surface-variant">
          <Icon name="psychology" size={15} className={live ? "text-primary" : "text-on-surface-variant"} />
        </span>
        <span className={cn("shrink-0 font-medium", live ? "zshine" : "text-on-surface-variant")}>
          {live ? "Reasoning" : `Thought${ms ? ` · ${secs(ms)}` : ""}`}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-on-surface-variant/75">
          {!shown ? firstLineClean : `${lines.length} line${lines.length === 1 ? "" : "s"}`}
        </span>
        <Icon
          name="expand_more"
          size={15}
          className={cn("shrink-0 text-on-surface-variant/70 transition-transform", shown && "rotate-180")}
        />
      </button>
      <Collapse open={shown}>
        <div
          ref={body}
          className={cn(
            "zthink ml-4 mt-1 mb-1.5 max-h-60 overflow-y-auto border-l-2 border-outline-variant/60 pl-3.5 text-[12.5px] leading-relaxed text-on-surface-variant select-text",
            live && "zthink-live"
          )}
        >
          <Markdown text={text} compact />
        </div>
      </Collapse>
    </div>
  );
}

export { ApprovalCard, AskUserCard, PlanTimeline } from "./StormyCards";

/* ------------------------------------------------------------------ */
/* Stormy ToolCallGroup (ToolCallGroup.kt — IconTrail & FileChips)     */
/* ------------------------------------------------------------------ */
export function WorkLog({ m }: { m: Message }) {
  const tools = m.tools ?? [];
  const boards = useStore((s) => s.artboards);
  const patchUI = useStore((s) => s.patchUI);
  const live = !!m.streaming;
  const [open, setOpen] = useState<boolean | null>(null);
  const hasBody = !!m.reasoning || tools.length > 0;
  const shown = open ?? live;

  // Compute changed files with +/- badges for Stormy's always-visible ChangedFileChips
  const changedFiles = useMemo(() => {
    const byPath = new Map<string, { path: string; additions: number; deletions: number; tool: ToolCall }>();
    for (const t of tools) {
      if (t.status !== "ok") continue;
      const pres = getToolPresentation(t.name);
      const parsed = parseToolEntry(t, pres);
      if (parsed.additions > 0 || parsed.deletions > 0) {
        let rawPath = parsed.subject;
        try {
          const j = JSON.parse(t.args ?? "{}");
          if (j.path || j.file) rawPath = String(j.path || j.file).trim();
        } catch {
          /* keep subject */
        }
        if (!rawPath) continue;
        const prev = byPath.get(rawPath);
        byPath.set(rawPath, {
          path: rawPath,
          additions: (prev?.additions ?? 0) + parsed.additions,
          deletions: (prev?.deletions ?? 0) + parsed.deletions,
          tool: t,
        });
      }
    }
    return [...byPath.values()];
  }, [tools]);

  const trailIcons = useMemo(() => {
    const distinct: string[] = [];
    for (const t of tools) {
      const ic = getToolPresentation(t.name).icon;
      if (!distinct.includes(ic)) distinct.push(ic);
      if (distinct.length >= 6) break;
    }
    return distinct;
  }, [tools]);

  if (!hasBody) return null;

  const failed = tools.filter((t) => t.status === "error").length;
  const thinkLive = live && !!m.reasoning && !m.thinkMs;
  const runningTool = tools.find((t) => t.status === "running");
  const loadingBoard = boards.find((a) => m.artboardIds?.includes(a.id) && a.loading);

  let summaryText = "";
  if (live) {
    if (runningTool) {
      const pres = getToolPresentation(runningTool.name);
      const parsed = parseToolEntry(runningTool, pres);
      summaryText = parsed.subject ? `${pres.running} ${parsed.subject}…` : `${pres.running}…`;
    } else if (loadingBoard) {
      summaryText = `Designing ${loadingBoard.name}…`;
    } else if (thinkLive) {
      summaryText = "Reasoning…";
    } else {
      summaryText = "Working…";
    }
  } else {
    summaryText = tools.length
      ? `${tools.length} tool call${tools.length === 1 ? "" : "s"}${m.stats?.ms ? ` · ${secs(m.stats.ms)}` : ""}`
      : `Thought${m.thinkMs ? ` · ${secs(m.thinkMs)}` : ""}`;
  }

  return (
    <div className="space-y-1.5">
      <div className="rounded-2xl border border-outline-variant/55 bg-surface-low/50">
        <button
          onClick={() => setOpen(!shown)}
          className="state flex w-full items-center gap-2 rounded-2xl px-3.5 py-2 text-left text-[13px]"
        >
          <Icon
            name="expand_more"
            size={16}
            className={cn("shrink-0 text-on-surface-variant transition-transform", shown && "rotate-180")}
          />
          <span className={cn("font-medium", live ? "zshine" : "text-on-surface-variant")}>
            {summaryText}
          </span>
          {failed > 0 && (
            <span className="rounded-full bg-error-container px-2 py-0.5 text-[11px] font-semibold text-on-error-container">
              {failed} failed
            </span>
          )}
          <span className="flex-1" />
          {!shown && trailIcons.length > 0 && (
            <span className="flex items-center gap-1.5 text-on-surface-variant/70">
              {trailIcons.map((ic) => (
                <Icon key={ic} name={ic} size={14} />
              ))}
            </span>
          )}
        </button>

        <Collapse open={shown}>
          <div className="space-y-0.5 border-t border-outline-variant/35 px-2 pb-2 pt-1.5">
            {m.reasoning && <ThinkingBlock text={m.reasoning} live={thinkLive} ms={m.thinkMs} />}
            {tools.map((t) => (
              <ToolCard key={t.id} t={t} />
            ))}
          </div>
        </Collapse>
      </div>

      {changedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {changedFiles.map((cf) => (
            <button
              key={cf.path}
              onClick={() => {
                patchUI({ leftTab: "files" });
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: cf.path }));
                }, 30);
              }}
              className="state inline-flex items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface-low px-2.5 py-1 font-mono text-[11.5px] text-on-surface hover:bg-surface-high"
            >
              <Icon name="description" size={13} className="text-primary" />
              <span>{shortenPath(cf.path, 28)}</span>
              {cf.additions > 0 && <span className="font-semibold text-tertiary">+{cf.additions}</span>}
              {cf.deletions > 0 && <span className="font-semibold text-error">-{cf.deletions}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live status line (shimmer text only, no orb)                        */
/* ------------------------------------------------------------------ */
export function LiveStatus({ m }: { m: Message }) {
  const boards = useStore((s) => s.artboards);
  if (!m.streaming) return null;
  const hasWorkLog = !!m.reasoning || (m.tools && m.tools.length > 0);
  const running = (m.tools ?? []).find((t) => t.status === "running");
  const loading = boards.find((a) => m.artboardIds?.includes(a.id) && a.loading);
  if (hasWorkLog && !loading && !m.text) return null;
  let label = "Thinking…";
  if (running) {
    const { label: l } = toolTitle(running.name, true);
    label = l;
  } else if (loading) label = `Designing ${loading.name}…`;
  else if (m.reasoning && !m.thinkMs) label = "Reasoning…";
  else if (m.text) label = "Writing…";
  return (
    <div className="flex items-center py-0.5 text-[13px]">
      <span className="zshine font-medium">{label}</span>
    </div>
  );
}
