import { useEffect, useMemo, useState } from "react";
import type { ToolCall } from "../types";
import { cancelSubagent, runFromTool, subagentTranscript, useAgent, type SubTool, type SubagentRun } from "../lib/agentState";
import { cn } from "../utils/cn";
import { BasicTool, getToolPresentation, shortenPath } from "./Activity";
import { Icon } from "./Icon";
import { Markdown } from "./MarkdownView";

/* icons: call_split, open_in_new, stop_circle, close, schedule, token */

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmt = (n?: number) => (n === undefined ? "" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function subjectOf(t: SubTool): string {
  const body = (t.args?.body ?? "").trim();
  const path = (t.args?.path ?? "").trim();
  if (path) return shortenPath(path, 38);
  const first = body.split("\n")[0] ?? "";
  try {
    const j = JSON.parse(body);
    return String(j.path ?? j.pattern ?? j.query ?? j.command ?? j.url ?? first).slice(0, 60);
  } catch {
    return first.slice(0, 60);
  }
}

function ChildTool({ t }: { t: SubTool }) {
  const pres = getToolPresentation(t.name);
  const running = t.status === "running";
  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5 text-[12.5px]">
      <Icon name={t.status === "error" ? "error" : pres.icon} size={13} className={cn("shrink-0", t.status === "error" ? "text-[var(--oc-critical)]" : "text-on-surface-variant/70")} />
      <span className={cn("shrink-0", running ? "zshine" : "text-on-surface")}>{running ? pres.running : pres.done}</span>
      <span className="min-w-0 truncate text-on-surface-variant">{subjectOf(t)}</span>
    </div>
  );
}

export function useSubagentRun(t: ToolCall): SubagentRun {
  const live = useAgent((s) => s.subagents[t.id]);
  return useMemo(() => live ?? runFromTool(t.id, t.args, t.output, t.status), [live, t.id, t.args, t.output, t.status]);
}

export function SubagentRow({ t }: { t: ToolCall }) {
  const run = useSubagentRun(t);
  const openDrawer = useAgent((s) => s.openDrawer);
  const running = run.status === "running" && t.status === "running";
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? running;
  const calls = run.tools.length;
  const readout = [run.model, run.tokens ? `${fmt(run.tokens)} tok` : "", run.durationMs ? `${Math.max(1, Math.round(run.durationMs / 1000))}s` : ""].filter(Boolean).join(" · ");
  return (
    <BasicTool
      icon="call_split"
      title={cap(run.agentType)}
      subtitle={run.description || undefined}
      status={running ? "running" : t.status === "error" ? "error" : "ok"}
      error={t.status === "error" && !run.output}
      hasContent
      open={shown}
      onOpenChange={setOpen}
      pill={
        <>
          {calls > 0 && <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">{calls} tool{calls === 1 ? "" : "s"}</span>}
          {run.background && <span className="shrink-0 rounded-full bg-surface-high px-1.5 py-px text-[11px] text-on-surface-variant">background</span>}
          {readout && <span className="hidden min-w-0 shrink truncate font-mono text-[11px] text-on-surface-variant sm:inline">{readout}</span>}
          <span
            role="button"
            tabIndex={0}
            title="Open session"
            onClick={(e) => { e.stopPropagation(); openDrawer(t.id); }}
            onKeyDown={(e) => e.key === "Enter" && openDrawer(t.id)}
            className="grid size-5 shrink-0 place-items-center rounded text-on-surface-variant/60 hover:text-on-surface"
          >
            <Icon name="open_in_new" size={12} />
          </span>
        </>
      }
    >
      <div className="ml-6 border-l border-[var(--oc-border-weak)] pl-3">
        {run.tools.slice(-8).map((c) => <ChildTool key={c.id} t={c} />)}
        {run.tools.length > 8 && <div className="py-0.5 text-[11.5px] text-on-surface-variant">{run.tools.length - 8} earlier calls in the session</div>}
        {!running && (run.output || run.text) && (
          <div className="mt-1 max-h-48 overflow-auto text-[13px] select-text"><Markdown text={(run.output || run.text || "").slice(0, 4000)} /></div>
        )}
        {running && run.tools.length === 0 && <div className="py-0.5 text-[12.5px] text-on-surface-variant">Starting</div>}
      </div>
    </BasicTool>
  );
}

/* Session drawer: full child transcript, prompt, tool log, stop. */
export function SubagentDrawer() {
  const id = useAgent((s) => s.drawer);
  const run = useAgent((s) => (id ? s.subagents[id] : undefined));
  const close = useAgent((s) => s.openDrawer);
  const [log, setLog] = useState<Array<{ role: string; content: string }>>([]);
  useEffect(() => {
    if (!run?.sessionId) { setLog([]); return; }
    let dead = false;
    const load = () => void subagentTranscript(run.sessionId).then((m) => !dead && setLog(m));
    load();
    const iv = run.status === "running" ? window.setInterval(load, 2500) : 0;
    return () => { dead = true; if (iv) clearInterval(iv); };
  }, [run?.sessionId, run?.status]);
  if (!id || !run) return null;
  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[min(460px,100%)] flex-col border-l border-[var(--oc-border-weak)] bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--oc-border-weak)] px-3">
        <Icon name="call_split" size={16} className="text-on-surface-variant" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-on-surface">{cap(run.agentType)}{run.description ? ` · ${run.description}` : ""}</div>
          <div className="truncate font-mono text-[10.5px] text-on-surface-variant">{[run.model, run.tokens ? `${fmt(run.tokens)} tok` : "", `depth ${run.depth}`, run.sessionId].filter(Boolean).join(" · ")}</div>
        </div>
        {run.status === "running" && (
          <button onClick={() => void cancelSubagent(run.sessionId)} title="Stop" aria-label="Stop" className="grid size-7 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
            <Icon name="stop_circle" size={17} />
          </button>
        )}
        <button onClick={() => close(null)} title="Close" aria-label="Close" className="grid size-7 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {run.prompt && (
          <div className="oc-hairline rounded-lg bg-surface-container px-3 py-2 text-[13px] whitespace-pre-wrap text-on-surface select-text">{run.prompt}</div>
        )}
        <div className="space-y-0.5">{run.tools.map((c) => <ChildTool key={c.id} t={c} />)}</div>
        {log.filter((m) => m.role === "assistant" && m.content.trim()).slice(-3).map((m, i) => (
          <div key={i} className="text-[13px] select-text"><Markdown text={m.content.slice(0, 6000)} /></div>
        ))}
        {run.output && <div className="border-t border-[var(--oc-border-weak)] pt-2 text-[13px] select-text"><Markdown text={run.output} /></div>}
      </div>
    </aside>
  );
}
