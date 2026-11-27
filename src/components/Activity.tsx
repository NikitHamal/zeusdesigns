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
  update_plan: { running: "Updating todos", done: "Updated todos", icon: "checklist", subjectIsPath: false, detail: "Prose" },
  todoread: { running: "Reading todos", done: "Read todos", icon: "checklist", subjectIsPath: false, detail: "Prose" },
  apply_patch: { running: "Patching", done: "Patched", icon: "difference", subjectIsPath: false, detail: "Diff" },
  websearch: { running: "Searching the web", done: "Searched the web", icon: "travel_explore", subjectIsPath: false, detail: "Prose" },
  session_search: { running: "Searching sessions", done: "Searched sessions", icon: "history", subjectIsPath: false, detail: "Prose" },
  diagnostics: { running: "Running diagnostics", done: "Ran diagnostics", icon: "bug_report", subjectIsPath: true, detail: "Terminal" },
  ask_user: { running: "Asking you", done: "Asked", icon: "help", subjectIsPath: false, detail: "Prose" },
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

export function parseToolEntry(t: ToolCall, pres: ToolPresentation): ParsedToolEntry {
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

  // 0. apply_patch: one combined diff over every touched file
  if (t.files && t.files.length) {
    const lines: ComputedDiff["lines"] = [];
    let additions = 0;
    let deletions = 0;
    for (const f of t.files) {
      const d = DiffUtils.computeDiff(f.oldContent ?? "", f.newContent ?? "", 3);
      additions += d.additions;
      deletions += d.deletions;
      lines.push({ kind: "hdr", text: f.from && f.from !== f.path ? `${f.from} -> ${f.path}` : f.path }, ...d.lines);
    }
    return { subject: t.files.length === 1 ? shortenPath(t.files[0].path) : `${t.files.length} files`, body, additions, deletions, computedDiff: { additions, deletions, lines }, meta: "" };
  }

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
/* Inline tool detail (expands in place, no dialog)                    */
/* ------------------------------------------------------------------ */
function splitTerminalOutput(out: string): { stdout: string; stderr: string; code: number | null } {
  let text = out.replace(/\r\n/g, "\n");
  let code: number | null = null;
  const m = /\n?\[exit code: (-?\d+)\]\s*$/.exec(text);
  if (m) {
    code = Number(m[1]);
    text = text.slice(0, m.index);
  }
  const exitOnly = /^\[exit (-?\d+)\] \(no output\)$/.exec(text.trim());
  if (exitOnly) return { stdout: "", stderr: "", code: Number(exitOnly[1]) };
  const i = text.indexOf("[stderr]\n");
  if (i >= 0) return { stdout: text.slice(0, i).trimEnd(), stderr: text.slice(i + 9), code };
  return { stdout: text, stderr: "", code };
}

export function ToolDetail({ tool, pres, parsed }: { tool: ToolCall; pres: ToolPresentation; parsed: ParsedToolEntry }) {
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

  const openFile = (p: string) => {
    patchUI({ leftTab: "files" });
    setTimeout(() => window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: p })), 30);
  };
  const copyText = (txt: string) => {
    void navigator.clipboard.writeText(txt);
    notify("Copied to clipboard");
  };

  const bodyRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = bodyRef.current;
    if (el && tool.status === "running" && pinned.current) el.scrollTop = el.scrollHeight;
  }, [tool.output, tool.status]);

  const term = pres.detail === "Terminal" && !hasDiff ? splitTerminalOutput(tool.output ?? "") : null;
  const isCode = pres.detail === "Code" || pres.detail === "Terminal";

  return (
    <div className="oc-hairline ml-6 mr-1 mt-1 mb-1.5 overflow-hidden rounded-lg bg-surface-lowest">
      <div className="flex items-center justify-end gap-1 border-b border-[var(--oc-border-weak)] px-1.5 py-1">
        {hasDiff && (tool.newContent || tool.oldContent) && (
          <div className="mr-auto flex items-center rounded-full border border-outline-variant/60 bg-surface-low p-0.5 text-[11px] font-medium">
            {(["diff", "new", "old"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "rounded-full px-2 py-0.5 capitalize transition-colors",
                  tab === k ? "bg-surface-high font-semibold text-on-surface" : "text-on-surface-variant"
                )}
              >
                {k}
              </button>
            ))}
          </div>
        )}
        {term && term.code !== null && term.code !== 0 && (
          <span className="mr-auto rounded bg-error-container px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-on-error-container">
            exit {term.code}
          </span>
        )}
        {rawPath && (
          <button
            onClick={() => openFile(rawPath)}
            className="state flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium text-on-surface-variant hover:text-on-surface"
          >
            <Icon name="open_in_new" size={12} />
            Open
          </button>
        )}
        <button
          onClick={() => copyText(tool.newContent || tool.output || parsed.body)}
          className="state grid size-6 place-items-center rounded-md text-on-surface-variant hover:text-on-surface"
          title="Copy"
        >
          <Icon name="content_copy" size={13} />
        </button>
      </div>

      <div
        ref={bodyRef}
        onScroll={(e) => { const t = e.currentTarget; pinned.current = t.scrollHeight - t.scrollTop - t.clientHeight < 24; }}
        className={cn(
          "max-h-[320px] overflow-auto p-2.5 text-[12px] leading-relaxed select-text",
          isCode ? "font-mono" : "font-sans"
        )}
      >
        {hasDiff && tab === "diff" && parsed.computedDiff ? (
          <div className="font-mono">
            {parsed.computedDiff.lines.map((dl, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-baseline gap-2 px-1.5",
                  dl.kind === "add" && "bg-[var(--oc-diff-add-bg)] text-[var(--oc-diff-add-text)]",
                  dl.kind === "del" && "bg-[var(--oc-diff-del-bg)] text-[var(--oc-diff-del-text)]",
                  dl.kind === "ctx" && "text-on-surface-variant"
                )}
              >
                <span className="w-7 shrink-0 select-none text-right text-[10.5px] opacity-55">
                  {dl.newLine ?? dl.oldLine ?? ""}
                </span>
                <span className="whitespace-pre-wrap break-all">{dl.text}</span>
              </div>
            ))}
          </div>
        ) : hasDiff && tab === "new" ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-on-surface">{tool.newContent || parsed.body}</pre>
        ) : hasDiff && tab === "old" ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-on-surface-variant">{tool.oldContent || "(new file)"}</pre>
        ) : pres.detail === "Listing" && tool.output ? (
          <div className="space-y-0.5 font-mono">
            {tool.output.split("\n").map((line, i) => {
              const fileMatch = /^([\w./\\-]+\.[a-z0-9]+)(?::(\d+))?/i.exec(line.trim());
              return (
                <div
                  key={i}
                  onClick={() => fileMatch?.[1] && openFile(fileMatch[1])}
                  className={cn(
                    "rounded-md px-1.5 py-0.5",
                    fileMatch ? "cursor-pointer text-on-surface hover:bg-surface-high" : "text-on-surface-variant"
                  )}
                >
                  {line}
                </div>
              );
            })}
          </div>
        ) : term ? (
          <div className="space-y-1.5">
            {parsed.body && (
              <div className="whitespace-pre-wrap break-words text-on-surface">
                <span className="mr-2 text-primary">$</span>
                {parsed.body}
              </div>
            )}
            {term.stdout && <pre className="whitespace-pre-wrap break-words text-on-surface-variant">{term.stdout}</pre>}
            {term.stderr && (
              <pre className={cn("whitespace-pre-wrap break-words", term.code ? "text-error" : "text-on-surface-variant")}>
                {term.stderr}
              </pre>
            )}
            {!term.stdout && !term.stderr && tool.status !== "running" && (
              <span className="text-on-surface-variant">(no output)</span>
            )}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words text-on-surface-variant">
            {tool.output || parsed.body || "(no output)"}
          </pre>
        )}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* BasicTool (OpenCode basic-tool.tsx): one trigger line + collapsible  */
/* ------------------------------------------------------------------ */
export function BasicTool({
  icon,
  title,
  subtitle,
  pill,
  status,
  hasContent,
  open,
  defaultOpen,
  onOpenChange,
  compact,
  error,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  pill?: ReactNode;
  status?: "running" | "ok" | "error";
  hasContent?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  compact?: boolean;
  error?: boolean;
  children?: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const shown = open ?? inner;
  const [mounted, setMounted] = useState(shown);
  useEffect(() => {
    if (shown) setMounted(true);
  }, [shown]);
  const running = status === "running";
  const toggle = () => {
    if (!hasContent) return;
    const next = !shown;
    setInner(next);
    onOpenChange?.(next);
  };
  return (
    <div data-component="tool-row" className="min-w-0">
      <button
        onClick={toggle}
        aria-expanded={hasContent ? shown : undefined}
        className={cn(
          "group/tool flex w-full min-w-0 items-center gap-2 rounded-md text-left text-[13px] outline-none",
          compact ? "min-h-6 py-0.5" : "min-h-7 py-1",
          hasContent ? "cursor-pointer" : "cursor-default"
        )}
      >
        <Icon name={error ? "error" : icon} size={compact ? 14 : 15} className={cn("shrink-0", error ? "text-[var(--oc-critical)]" : "text-on-surface-variant/70")} />
        <span className={cn("shrink-0 font-medium", running ? "zshine" : error ? "text-[var(--oc-critical)]" : "text-on-surface")}>{title}</span>
        {subtitle && (
          <span className="min-w-0 shrink truncate text-[13px] text-on-surface-variant" title={subtitle}>
            {subtitle}
          </span>
        )}
        {pill}
        {hasContent && (
          <Icon
            name="expand_more"
            size={15}
            className={cn("shrink-0 text-on-surface-variant/60 transition-[transform,opacity] group-hover/tool:text-on-surface", shown && "rotate-180")}
          />
        )}
      </button>
      {hasContent && <Collapse open={shown}>{mounted && children}</Collapse>}
    </div>
  );
}

export function DiffPill({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-high px-1.5 py-px font-mono text-[11px] font-semibold">
      {additions > 0 && <span className="text-[var(--oc-diff-add-text)]">+{additions}</span>}
      {deletions > 0 && <span className="text-[var(--oc-diff-del-text)]">-{deletions}</span>}
    </span>
  );
}

/** Error card (OpenCode tool-error-card): first line is the headline, the rest is detail. */
function ToolErrorCard({ text }: { text: string }) {
  const clean = text.trim();
  const [head, ...rest] = clean.split("\n");
  return (
    <div className="ml-6 mr-1 mt-1 mb-1.5 rounded-lg border border-[var(--oc-critical)]/40 bg-error-container/40 px-3 py-2 text-[12.5px] text-on-error-container select-text">
      <div className="font-medium break-words">{head}</div>
      {rest.length > 0 && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] opacity-90">{rest.join("\n")}</pre>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tool row                                                            */
/* ------------------------------------------------------------------ */
export function ToolRow({ t, compact }: { t: ToolCall; compact?: boolean }) {
  const running = t.status === "running";
  const isError = t.status === "error";
  const pres = getToolPresentation(t.name);
  const parsed = useMemo(
    () => parseToolEntry(t, pres),
    [t, t.args, t.status, t.output, t.oldContent, t.newContent, t.additions, t.deletions, pres]
  );
  const hasDetail = Boolean(t.output || parsed.computedDiff || parsed.body);
  const isShell = pres.detail === "Terminal" && Boolean(parsed.body);
  // Shell output streams open while it runs; any manual toggle wins from then on.
  const [manual, setManual] = useState<boolean | null>(null);
  const autoOpen = (isShell && running && Boolean(t.output)) || (isError && Boolean(t.output));
  const open = manual ?? autoOpen;

  return (
    <BasicTool
      icon={pres.icon}
      title={running ? pres.running : pres.done}
      subtitle={parsed.subject || undefined}
      status={t.status}
      error={isError}
      compact={compact}
      hasContent={hasDetail}
      open={open}
      onOpenChange={setManual}
      pill={
        <>
          {parsed.meta && !running && <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">{parsed.meta}</span>}
          <DiffPill additions={parsed.additions} deletions={parsed.deletions} />
        </>
      }
    >
      {isError && t.output ? <ToolErrorCard text={t.output} /> : <ToolDetail tool={t} pres={pres} parsed={parsed} />}
    </BasicTool>
  );
}

/* ------------------------------------------------------------------ */
/* Explored group (OpenCode SessionContextToolGroup)                   */
/* ------------------------------------------------------------------ */
function exploreLabel(tools: ToolCall[], live: boolean): { title: string; sub: string } {
  let files = 0;
  let searches = 0;
  let lists = 0;
  for (const t of tools) {
    const c = ToolAliases.canonicalName(t.name);
    if (c === "read_file" || c === "get_file_info") files++;
    else if (c === "list_files") lists++;
    else searches++;
  }
  const bits = [
    files && `${files} file${files === 1 ? "" : "s"}`,
    searches && `${searches} search${searches === 1 ? "" : "es"}`,
    lists && `${lists} folder${lists === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return { title: live ? "Exploring" : "Explored", sub: bits.join(" · ") };
}

export function ExploreGroup({ tools }: { tools: ToolCall[] }) {
  const live = tools.some((t) => t.status === "running");
  const [manual, setManual] = useState<boolean | null>(null);
  const { title, sub } = exploreLabel(tools, live);
  // A single read stays one plain row, as in OpenCode.
  if (tools.length === 1) return <ToolRow t={tools[0]} />;
  return (
    <BasicTool
      icon="manage_search"
      title={title}
      subtitle={sub}
      status={live ? "running" : "ok"}
      hasContent
      open={manual ?? false}
      onOpenChange={setManual}
    >
      <div className="ml-2 mt-0.5 mb-1 space-y-0 border-l border-[var(--oc-border-weak)] pl-3">
        {tools.map((t) => (
          <ToolRow key={t.id} t={t} compact />
        ))}
      </div>
    </BasicTool>
  );
}

/* ------------------------------------------------------------------ */
/* Reasoning row (OpenCode thought.tsx)                                */
/* ------------------------------------------------------------------ */
export function ReasoningRow({ text, live, ms }: { text: string; live: boolean; ms?: number }) {
  const [manual, setManual] = useState<boolean | null>(null);
  const shown = manual ?? false;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && shown && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [text, live, shown]);
  return (
    <BasicTool
      icon="psychology"
      title={live ? "Thinking" : "Thought"}
      subtitle={!live && ms ? secs(ms) : undefined}
      status={live ? "running" : "ok"}
      hasContent={Boolean(text.trim())}
      open={shown}
      onOpenChange={setManual}
    >
      <div
        ref={body}
        className="zthink ml-1.5 mt-0.5 mb-1.5 max-h-60 overflow-y-auto border-l border-[var(--oc-border-weak)] pl-3.5 text-[12.5px] leading-relaxed text-on-surface-variant select-text"
      >
        <Markdown text={text} compact />
      </div>
    </BasicTool>
  );
}

export { ApprovalCard, AskUserCard, PlanTimeline } from "./StormyCards";

/* ------------------------------------------------------------------ */
/* Live status line (shimmer text only, no orb)                        */
/* ------------------------------------------------------------------ */
export function LiveStatus({ m }: { m: Message }) {
  const boards = useStore((s) => s.artboards);
  if (!m.streaming) return null;
  const items = m.parts ?? [];
  const lastPart = items[items.length - 1];
  const running = (m.tools ?? []).find((t) => t.status === "running");
  const loading = boards.find((a) => m.artboardIds?.includes(a.id) && a.loading);
  const thinkLive = lastPart?.type === "reasoning" && !m.thinkMs;
  // Rows that already shimmer (running tool, live thought, streaming text) say what is happening.
  if (!loading && (running || thinkLive || lastPart?.type === "text")) return null;
  const label = loading ? `Designing ${loading.name}…` : "Thinking…";
  return (
    <div className="flex items-center py-0.5 text-[13px]">
      <span className="zshine font-medium">{label}</span>
    </div>
  );
}
