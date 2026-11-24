import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { Message, ToolCall } from "../types";
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
/* Tools Metadata, Icons & Diff Formatting                             */
/* ------------------------------------------------------------------ */
const TOOL_LABEL: Record<string, string> = {
  design_lint: "Enforced design system & tokens",
  design_audit: "Audited layout geometry",
  design_repair: "Refined screen layout",
  context_compact: "Compacted conversation context",
  auto_continue: "Continued truncated stream",
  read_file: "Read file",
  read: "Read file",
  cat: "Read file",
  write_file: "Created file",
  write: "Created file",
  create_file: "Created file",
  delete_file: "Deleted file",
  remove_file: "Deleted file",
  rm: "Deleted file",
  del: "Deleted file",
  unlink: "Deleted file",
  edit_file: "Edited file",
  edit: "Edited file",
  patch_file: "Edited file",
  list_dir: "Listed folder",
  ls: "Listed folder",
  load_skill: "Loaded skill",
  skill: "Loaded skill",
  subagent: "Ran subagent",
  task: "Ran subagent",
  studio_brief: "Prepared design brief",
  studio_palette: "Built tonal palette",
  studio_contrast: "Verified WCAG contrast",
  studio_fonts: "Selected font pairing",
  studio_icons: "Resolved Material Symbols",
  studio_components: "Loaded component kit",
  studio_tokens: "Loaded design tokens",
  studio_systems: "Listed design systems",
  studio_screens: "Inspected canvas screens",
  studio_read_screen: "Read screen markup",
  studio_lint: "Linted screen markup",
  studio_svg_chart: "Generated SVG chart",
  studio_blueprint: "Loaded screen blueprint",
  studio_export_react: "Exported React TSX",
  studio_insert_block: "Inserted UI component block",
  studio_patch_screen: "Patched screen element",
  studio_batch_patch: "Patched elements across all screens",
  studio_create_frame: "Created screen frame",
  studio_clone_screen: "Cloned screen variant",
  studio_inspect_dom: "Inspected DOM layer hierarchy",
  studio_arrange_canvas: "Arranged canvas screens",
  studio_retheme_page: "Applied design system theme",
  search_code: "Searched codebase",
  grep: "Searched codebase",
  rg: "Searched codebase",
  shell: "Executed command",
  bash: "Executed bash command",
  python: "Executed Python script",
  python3: "Executed Python script",
  web_fetch: "Fetched reference page",
  memory: "Saved to memory",
  memory_search: "Fetched memory",
  memory_list: "Listed memory",
  memory_get: "Read memory",
  memory_save: "Saved to memory",
  memory_add: "Saved to memory",
  memory_edit: "Updated memory",
  memory_update: "Updated memory",
  memory_delete: "Deleted memory",
  memory_remove: "Deleted memory",
};

const TOOL_RUNNING: Record<string, string> = {
  design_lint: "Enforcing design system & tokens…",
  design_audit: "Auditing layout geometry…",
  design_repair: "Refining screen layout…",
  context_compact: "Compacting conversation context…",
  auto_continue: "Continuing truncated stream…",
  read_file: "Reading file…",
  read: "Reading file…",
  write_file: "Writing file…",
  write: "Writing file…",
  edit_file: "Editing file…",
  edit: "Editing file…",
  delete_file: "Deleting file…",
  list_dir: "Listing folder…",
  ls: "Listing folder…",
  studio_brief: "Preparing design brief…",
  studio_palette: "Building tonal palette…",
  studio_contrast: "Checking contrast…",
  studio_fonts: "Selecting font pairing…",
  studio_icons: "Resolving Material Symbols…",
  studio_components: "Loading component kit…",
  studio_tokens: "Loading design tokens…",
  studio_lint: "Linting screen…",
  studio_blueprint: "Loading blueprint…",
  studio_insert_block: "Inserting UI component…",
  studio_patch_screen: "Patching screen element…",
  studio_arrange_canvas: "Arranging canvas…",
  studio_retheme_page: "Applying design system…",
  search_code: "Searching codebase…",
  grep: "Searching codebase…",
  rg: "Searching codebase…",
  shell: "Running command…",
  bash: "Running bash command…",
  python: "Running Python script…",
  python3: "Running Python script…",
  web_fetch: "Fetching page…",
  memory: "Saving memory…",
  memory_search: "Fetching memory…",
  memory_list: "Listing memory…",
  memory_get: "Reading memory…",
  memory_save: "Saving memory…",
  memory_add: "Saving memory…",
  memory_edit: "Updating memory…",
  memory_update: "Updating memory…",
  memory_delete: "Deleting memory…",
  memory_remove: "Deleting memory…",
};

function toolIconName(name: string): string {
  if (/^(read_file|read|cat|view_file|open_file)$/.test(name)) return "description";
  if (/^(write_file|write|create_file|save_file)$/.test(name)) return "note_add";
  if (/^(edit_file|edit|patch_file|replace_in_file)$/.test(name)) return "edit_note";
  if (/^(delete_file|remove_file|rm|del|unlink)$/.test(name)) return "delete";
  if (/^(search_code|grep|rg|search|ripgrep)$/.test(name)) return "search";
  if (/^(list_dir|ls|dir|glob|find_files)$/.test(name)) return "folder_open";
  if (/^(shell|bash|sh|cmd|terminal|exec|run)$/.test(name)) return "terminal";
  if (/^(python|python3|py)$/.test(name)) return "code";
  if (name.startsWith("memory")) return "psychology";
  if (name.startsWith("studio_")) return "design_services";
  return "build";
}

export function toolTitle(name: string, running = false): { label: string; sub?: string; icon: string } {
  if (name.startsWith("mcp:")) {
    const [, server, ...tool] = name.split(":");
    return { label: tool.join(":") || name, sub: server.replace(/^mcp-/, ""), icon: "extension" };
  }
  return {
    label: (running && TOOL_RUNNING[name]) || TOOL_LABEL[name] || name.replace(/_/g, " "),
    icon: toolIconName(name),
  };
}

function parseToolPayload(t: ToolCall): {
  primaryArg: string;
  body: string;
  diffStats?: { added: number; removed: number };
  diffLines?: { kind: "add" | "del" | "ctx" | "hdr"; text: string }[];
} {
  let path = "";
  let body = "";
  try {
    const j = JSON.parse(t.args ?? "{}");
    path = String(j.path || j.file || j.name || j.query || "").trim();
    body = String(j.body || j.content || j.command || j.script || "").trim();
  } catch {
    body = (t.args ?? "").trim();
  }

  const primaryArg =
    path ||
    (/^(shell|bash|python|python3|search_code|grep|rg)$/.test(t.name)
      ? body.split("\n")[0]?.slice(0, 80) ?? ""
      : body.slice(0, 60));

  // Parse SEARCH/REPLACE hunks for edit_file so the user can inspect exact +/- line changes
  if (/^(edit_file|edit|patch_file|replace_in_file)$/.test(t.name) && body.includes("=======")) {
    const diffLines: { kind: "add" | "del" | "ctx" | "hdr"; text: string }[] = [];
    let added = 0;
    let removed = 0;
    const lines = body.replace(/\r\n/g, "\n").split("\n");
    let state: "outside" | "search" | "replace" = "outside";
    for (const line of lines) {
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
        removed++;
        diffLines.push({ kind: "del", text: `- ${line}` });
      } else if (state === "replace") {
        added++;
        diffLines.push({ kind: "add", text: `+ ${line}` });
      }
    }
    if (added > 0 || removed > 0) {
      return { primaryArg, body, diffStats: { added, removed }, diffLines };
    }
  }

  if (/^(write_file|write|create_file)$/.test(t.name) && body) {
    const lineCount = body.split("\n").length;
    return { primaryArg, body, diffStats: { added: lineCount, removed: 0 } };
  }

  return { primaryArg, body };
}

function ToolRow({ t }: { t: ToolCall }) {
  const [open, setOpen] = useState(false);
  const running = t.status === "running";
  const { label, sub, icon } = toolTitle(t.name, running);
  const { primaryArg, body, diffStats, diffLines } = parseToolPayload(t);
  const hasExpandable = Boolean(t.output || diffLines?.length || body);

  return (
    <div className="rounded-xl transition-colors">
      <button
        onClick={() => hasExpandable && setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left text-[12.5px]",
          hasExpandable && "hover:bg-surface-high/60 hover:text-on-surface"
        )}
      >
        {!running ? (
          <span className="grid size-4 shrink-0 place-items-center">
            {t.status === "ok" ? (
              <Icon name="check" size={13} className="text-tertiary" />
            ) : (
              <Icon name="error" size={13} className="text-error" />
            )}
          </span>
        ) : (
          <span className="grid size-4 shrink-0 place-items-center">
            <Icon name={icon} size={13} className="text-primary" />
          </span>
        )}
        <Icon name={icon} size={13} className="shrink-0 text-on-surface-variant/80" />
        <span className={cn("shrink-0 font-medium", running ? "zshine" : "text-on-surface-variant")}>
          {label}
        </span>
        {sub && (
          <span className="shrink-0 rounded-md bg-surface-high px-1.5 py-0.5 text-[11px] text-on-surface-variant/80">
            {sub}
          </span>
        )}
        {primaryArg && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-on-surface">
            {primaryArg}
          </span>
        )}
        {!primaryArg && <span className="flex-1" />}
        {diffStats && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px]">
            {diffStats.added > 0 && <span className="text-tertiary">+{diffStats.added}</span>}
            {diffStats.removed > 0 && <span className="text-error">-{diffStats.removed}</span>}
          </span>
        )}
        {hasExpandable && (
          <Icon
            name="expand_more"
            size={14}
            className={cn("shrink-0 text-on-surface-variant/70 transition-transform", open && "rotate-180")}
          />
        )}
      </button>
      <Collapse open={open}>
        <div className="ml-5 mb-1.5 mt-1 space-y-1.5">
          {diffLines && diffLines.length > 0 && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-outline-variant/45 bg-surface-lowest px-3 py-2 font-mono text-[11.5px] leading-relaxed select-text">
              {diffLines.map((dl, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "px-1 -mx-1 rounded-sm",
                    dl.kind === "add" && "bg-tertiary-container/35 text-tertiary",
                    dl.kind === "del" && "bg-error-container/35 text-error"
                  )}
                >
                  {dl.text}
                </div>
              ))}
            </pre>
          )}
          {!diffLines && /^(write_file|write|create_file|python|python3|shell|bash)$/.test(t.name) && body && (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-outline-variant/45 bg-surface-lowest px-3 py-2 font-mono text-[11.5px] leading-relaxed text-on-surface select-text">
              {body.slice(0, 4000)}
            </pre>
          )}
          {t.output && (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-outline-variant/40 bg-surface-low px-3 py-2 font-mono text-[11.5px] leading-relaxed text-on-surface-variant select-text">
              {t.output}
            </pre>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reasoning (collapsible thought trace with formatted Markdown)       */
/* ------------------------------------------------------------------ */
function ThinkingBlock({ text, live, ms }: { text: string; live: boolean; ms?: number }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? live;
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
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left text-[12.5px] hover:bg-surface-high/60"
      >
        {!live ? (
          <Icon name="check" size={13} className="shrink-0 text-tertiary" />
        ) : (
          <Icon name="psychology" size={13} className="shrink-0 text-primary" />
        )}
        <Icon name="psychology" size={13} className="shrink-0 text-on-surface-variant/80" />
        <span className={cn("shrink-0 font-medium", live ? "zshine" : "text-on-surface-variant")}>
          {live ? "Reasoning…" : `Thought process${ms ? ` · ${secs(ms)}` : ""}`}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-on-surface-variant/65">
          {!shown ? firstLineClean : `${lines.length} line${lines.length === 1 ? "" : "s"}`}
        </span>
        <Icon
          name="expand_more"
          size={14}
          className={cn("shrink-0 text-on-surface-variant/70 transition-transform", shown && "rotate-180")}
        />
      </button>
      <Collapse open={shown}>
        <div
          ref={body}
          className={cn(
            "zthink ml-3 mt-1 mb-1.5 max-h-60 overflow-y-auto border-l-2 border-outline-variant/60 pl-3.5 text-[12.5px] leading-relaxed text-on-surface-variant select-text",
            live && "zthink-live"
          )}
        >
          <Markdown text={text} compact />
        </div>
      </Collapse>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Work log: reasoning + tool steps, one collapsible group             */
/* ------------------------------------------------------------------ */
export function WorkLog({ m }: { m: Message }) {
  const tools = m.tools ?? [];
  const boards = useStore((s) => s.artboards);
  const live = !!m.streaming;
  const [open, setOpen] = useState<boolean | null>(null);
  const hasBody = !!m.reasoning || tools.length > 0;
  const shown = open ?? live;
  if (!hasBody) return null;
  const failed = tools.filter((t) => t.status === "error").length;
  const thinkLive = live && !!m.reasoning && !m.thinkMs;
  const runningTool = tools.find((t) => t.status === "running");
  const loadingBoard = boards.find((a) => m.artboardIds?.includes(a.id) && a.loading);

  let liveHeader = "Thinking…";
  if (runningTool) liveHeader = toolTitle(runningTool.name, true).label;
  else if (loadingBoard) liveHeader = `Designing ${loadingBoard.name}…`;
  else if (thinkLive) liveHeader = "Reasoning…";
  else if (live) liveHeader = "Working…";

  const parts = [
    m.reasoning ? "Reasoning" : "",
    tools.length ? `${tools.length} step${tools.length > 1 ? "s" : ""}` : "",
    failed ? `${failed} failed` : "",
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-outline-variant/55 bg-surface-low/50">
      <button
        onClick={() => setOpen(!shown)}
        className="state flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2 text-left text-[13px]"
      >
        {!live && (
          <Icon
            name={failed ? "error" : "check"}
            size={15}
            className={cn("shrink-0", failed ? "text-error" : "text-tertiary")}
          />
        )}
        <span className={cn("font-medium", live ? "zshine" : "text-on-surface")}>
          {live ? liveHeader : m.stats?.ms ? `Worked for ${secs(m.stats.ms)}` : "Worked"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-on-surface-variant/80">
          {parts.join(" · ")}
        </span>
        <Icon
          name="expand_more"
          size={16}
          className={cn("shrink-0 text-on-surface-variant transition-transform", shown && "rotate-180")}
        />
      </button>
      <Collapse open={shown}>
        <div className="space-y-1 border-t border-outline-variant/35 px-2.5 pb-2.5 pt-1.5">
          {m.reasoning && <ThinkingBlock text={m.reasoning} live={thinkLive} ms={m.thinkMs} />}
          {tools.map((t) => (
            <ToolRow key={t.id} t={t} />
          ))}
        </div>
      </Collapse>
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
