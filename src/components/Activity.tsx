import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { Message, ToolCall } from "../types";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";

/* ------------------------------------------------------------------ */
/* Orb: the single "Zeus is working" mark (chat, canvas, buttons)       */
/* ------------------------------------------------------------------ */
export function ZeusOrb({ size = 16, live = true, className }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span className={cn("zorb", live && "live", className)} style={{ width: size, height: size }} aria-hidden>
      <i className="zorb-ring" /><i className="zorb-ring b" />
      <i className="zorb-core" />
      <i className="zorb-spark" />
    </span>
  );
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
/* Tools                                                               */
/* ------------------------------------------------------------------ */
const TOOL_LABEL: Record<string, string> = {
  design_lint: "Cleaned up", design_audit: "Checked layout", design_repair: "Repairing layout", read_file: "Read file", write_file: "Wrote file",
  list_dir: "Listed folder", studio_brief: "Read the brief", studio_palette: "Built a palette", studio_contrast: "Checked contrast", studio_fonts: "Picked fonts", studio_icons: "Searched icons", studio_components: "Read the component kit", studio_tokens: "Read design tokens", studio_systems: "Listed design systems", studio_screens: "Listed screens", studio_read_screen: "Read a screen", studio_lint: "Linted a screen", studio_svg_chart: "Built SVG chart", studio_blueprint: "Loaded blueprint", studio_export_react: "Exported React TSX", search_code: "Searched code", shell: "Ran command", web_fetch: "Fetched page", memory: "Saved to memory",
};
const TOOL_RUNNING: Record<string, string> = {
  design_lint: "Cleaning up", design_audit: "Checking layout", read_file: "Reading file", write_file: "Writing file", list_dir: "Listing folder",
  studio_brief: "Reading the brief", studio_palette: "Building a palette", studio_contrast: "Checking contrast", studio_fonts: "Picking fonts", studio_icons: "Searching icons", studio_components: "Reading the component kit", studio_tokens: "Reading design tokens", studio_lint: "Linting a screen", studio_blueprint: "Loading blueprint", search_code: "Searching code", shell: "Running command", web_fetch: "Fetching page",
};
export function toolTitle(name: string, running = false): { label: string; sub?: string } {
  if (name.startsWith("mcp:")) { const [, server, ...tool] = name.split(":"); return { label: tool.join(":") || name, sub: server.replace(/^mcp-/, "") }; }
  return { label: (running && TOOL_RUNNING[name]) || TOOL_LABEL[name] || name.replace(/_/g, " ") };
}
const toolArg = (t: ToolCall) => { try { const j = JSON.parse(t.args ?? ""); return String(j.path || j.body || j.name || j.query || ""); } catch { return t.args ?? ""; } };

function ToolRow({ t }: { t: ToolCall }) {
  const [open, setOpen] = useState(false);
  const running = t.status === "running";
  const { label, sub } = toolTitle(t.name, running);
  const arg = toolArg(t).replace(/\s+/g, " ");
  return (
    <div>
      <button onClick={() => t.output && setOpen(!open)} className={cn("flex w-full items-center gap-2.5 rounded-lg py-1 pr-1 text-left text-[13px]", t.output && "hover:text-on-surface")}>
        <span className="grid size-4 shrink-0 place-items-center">
          {running ? <ZeusOrb size={12} /> : t.status === "ok" ? <Icon name="check" size={14} className="text-on-surface-variant" /> : <Icon name="error" size={14} className="text-error" />}
        </span>
        <span className={cn("shrink-0 font-medium", running ? "text-on-surface" : "text-on-surface-variant")}>{label}</span>
        {sub && <span className="shrink-0 text-on-surface-variant/70">{sub}</span>}
        <span className="min-w-0 flex-1 truncate text-on-surface-variant/70">{arg}</span>
        {t.output && <Icon name="expand_more" size={14} className={cn("shrink-0 text-on-surface-variant/70 transition-transform", open && "rotate-180")} />}
      </button>
      <Collapse open={open}>
        <pre className="ml-6 mb-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-low px-3 py-2 font-mono text-[11.5px] leading-relaxed text-on-surface-variant select-text">{t.output}</pre>
      </Collapse>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reasoning                                                           */
/* ------------------------------------------------------------------ */
function ThinkingBlock({ text, live, ms }: { text: string; live: boolean; ms?: number }) {
  const [open, setOpen] = useState<boolean | null>(null); // null = follow the live state
  const shown = open ?? live;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { if (live && shown && body.current) body.current.scrollTop = body.current.scrollHeight; }, [text, live, shown]);
  return (
    <div>
      <button onClick={() => setOpen(!shown)} className="flex w-full items-center gap-2.5 py-1 text-left text-[13px]">
        <span className="grid size-4 shrink-0 place-items-center">{live ? <ZeusOrb size={12} /> : <Icon name="check" size={14} className="text-on-surface-variant" />}</span>
        <span className={cn("font-medium", live ? "zshine" : "text-on-surface-variant")}>{live ? "Thinking" : `Thought${ms ? ` for ${secs(ms)}` : ""}`}</span>
        <span className="flex-1" />
        <Icon name="expand_more" size={14} className={cn("text-on-surface-variant/70 transition-transform", shown && "rotate-180")} />
      </button>
      <Collapse open={shown}>
        <div ref={body} className={cn("zthink ml-[7px] max-h-52 overflow-y-auto border-l-2 border-outline-variant/70 pl-4 text-[13px] leading-relaxed text-on-surface-variant select-text whitespace-pre-wrap", live && "zthink-live")}>
          {text}
        </div>
      </Collapse>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Work log: reasoning + tool steps, one collapsible group              */
/* ------------------------------------------------------------------ */
export function WorkLog({ m }: { m: Message }) {
  const tools = m.tools ?? [];
  const live = !!m.streaming;
  const [open, setOpen] = useState<boolean | null>(null);
  const hasBody = !!m.reasoning || tools.length > 0;
  const shown = open ?? live;
  if (!hasBody) return null;
  const failed = tools.filter((t) => t.status === "error").length;
  const thinkLive = live && !!m.reasoning && !m.thinkMs;
  const parts = [m.reasoning ? "Thought" : "", tools.length ? `${tools.length} step${tools.length > 1 ? "s" : ""}` : "", failed ? `${failed} failed` : ""].filter(Boolean);
  return (
    <div className="rounded-2xl border border-outline-variant/60">
      <button onClick={() => setOpen(!shown)} className="state flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-[13px]">
        {live ? <ZeusOrb size={14} /> : <Icon name="check" size={15} className="text-on-surface-variant" />}
        <span className={cn("font-medium", live ? "zshine" : "text-on-surface")}>{live ? "Working" : m.stats?.ms ? `Worked for ${secs(m.stats.ms)}` : "Worked"}</span>
        <span className="min-w-0 flex-1 truncate text-on-surface-variant">{parts.join(" · ")}</span>
        <Icon name="expand_more" size={16} className={cn("shrink-0 text-on-surface-variant transition-transform", shown && "rotate-180")} />
      </button>
      <Collapse open={shown}>
        <div className="space-y-0.5 px-3.5 pb-3 pt-0.5">
          {m.reasoning && <ThinkingBlock text={m.reasoning} live={thinkLive} ms={m.thinkMs} />}
          {tools.map((t) => <ToolRow key={t.id} t={t} />)}
        </div>
      </Collapse>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live status line (what Zeus is doing right now)                      */
/* ------------------------------------------------------------------ */
export function LiveStatus({ m }: { m: Message }) {
  const boards = useStore((s) => s.artboards);
  if (!m.streaming) return null;
  const running = (m.tools ?? []).find((t) => t.status === "running");
  const loading = boards.find((a) => m.artboardIds?.includes(a.id) && a.loading);
  let label = "Thinking";
  if (running) { const { label: l } = toolTitle(running.name, true); label = l; }
  else if (loading) label = `Designing ${loading.name}`;
  else if (m.reasoning && !m.thinkMs) label = "Reasoning";
  else if (m.text) label = "Writing";
  return (
    <div className="flex items-center gap-2.5 py-1 text-[13px]">
      <ZeusOrb size={18} />
      <span className="zshine font-medium">{label}</span>
    </div>
  );
}
