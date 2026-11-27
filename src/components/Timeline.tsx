import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { Message, ToolCall } from "../types";
import { timelineItems, transitionFollow, type FollowEvent, type FollowState } from "../lib/timeline";
import { DiffUtils, ToolAliases } from "../lib/stormyAgent";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { SubagentRow } from "./SubagentRow";
import { BasicTool, DiffPill, ExploreGroup, ReasoningRow, ToolDetail, ToolRow, getToolPresentation, parseToolEntry, shortenPath } from "./Activity";

/* ------------------------------------------------------------------ */
/* Ordered turn: reasoning > tool > text > tool > text, as it streamed  */
/* ------------------------------------------------------------------ */
export function TurnTimeline({
  m,
  renderText,
}: {
  m: Message;
  renderText: (text: string, key: string, streaming: boolean) => ReactNode;
}) {
  const items = useMemo(() => timelineItems(m), [m]);
  const live = !!m.streaming;
  return (
    <div className="min-w-0 space-y-1">
      {items.map((it) => {
        if (it.kind === "reasoning") return <ReasoningRow key={it.key} text={it.text} ms={it.ms} live={live && it.last} />;
        if (it.kind === "explore") return <ExploreGroup key={it.key} tools={it.tools} />;
        if (it.kind === "tool") {
          return ToolAliases.canonicalName(it.tool.name) === "spawn_subagent" ? <SubagentRow key={it.key} t={it.tool} /> : <ToolRow key={it.key} t={it.tool} />;
        }
        return (
          <div key={it.key} className="py-1">
            {renderText(it.text, it.key, live && it.last)}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Turn diff summary: "N files changed" with inline diffs               */
/* ------------------------------------------------------------------ */
export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  tools: ToolCall[];
}

export function changedFilesOf(tools: ToolCall[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const t of tools) {
    if (t.status !== "ok") continue;
    if (t.files?.length) {
      for (const f of t.files) {
        const d = DiffUtils.computeDiff(f.oldContent ?? "", f.newContent ?? "", 0);
        const prev = byPath.get(f.path) ?? { path: f.path, additions: 0, deletions: 0, tools: [] };
        prev.additions += d.additions;
        prev.deletions += d.deletions;
        if (!prev.tools.includes(t)) prev.tools.push(t);
        byPath.set(f.path, prev);
      }
      continue;
    }
    const parsed = parseToolEntry(t, getToolPresentation(t.name));
    if (parsed.additions <= 0 && parsed.deletions <= 0) continue;
    let path = parsed.subject;
    try {
      const j = JSON.parse(t.args ?? "{}");
      if (j.path || j.file) path = String(j.path || j.file).trim();
    } catch {
      /* keep subject */
    }
    if (!path) continue;
    const prev = byPath.get(path) ?? { path, additions: 0, deletions: 0, tools: [] };
    prev.additions += parsed.additions;
    prev.deletions += parsed.deletions;
    prev.tools.push(t);
    byPath.set(path, prev);
  }
  return [...byPath.values()];
}

export function ChangedFileRow({ f }: { f: ChangedFile }) {
  const [open, setOpen] = useState(false);
  const patchUI = useStore((s) => s.patchUI);
  const openFile = () => {
    patchUI({ leftTab: "files" });
    setTimeout(() => window.dispatchEvent(new CustomEvent("zeus:open-file", { detail: f.path })), 30);
  };
  return (
    <BasicTool
      icon="description"
      title={shortenPath(f.path, 44)}
      compact
      hasContent
      open={open}
      onOpenChange={setOpen}
      pill={
        <>
          <DiffPill additions={f.additions} deletions={f.deletions} />
          <span
            role="button"
            tabIndex={0}
            title="Open file"
            onClick={(e) => {
              e.stopPropagation();
              openFile();
            }}
            onKeyDown={(e) => e.key === "Enter" && openFile()}
            className="grid size-5 shrink-0 place-items-center rounded text-on-surface-variant/60 hover:text-on-surface"
          >
            <Icon name="open_in_new" size={12} />
          </span>
        </>
      }
    >
      {f.tools.map((t) => {
        const pres = getToolPresentation(t.name);
        return <ToolDetail key={t.id} tool={t} pres={pres} parsed={parseToolEntry(t, pres)} />;
      })}
    </BasicTool>
  );
}

export function TurnDiffs({ m }: { m: Message }) {
  const files = useMemo(() => changedFilesOf(m.tools ?? []), [m.tools]);
  const [open, setOpen] = useState(false);
  if (m.streaming || files.length === 0) return null;
  const add = files.reduce((n, f) => n + f.additions, 0);
  const del = files.reduce((n, f) => n + f.deletions, 0);
  return (
    <div className="oc-hairline rounded-lg bg-surface-low/40 px-2.5 py-0.5">
      <BasicTool
        icon="difference"
        title={`${files.length} file${files.length === 1 ? "" : "s"} changed`}
        hasContent
        open={open}
        onOpenChange={setOpen}
        pill={<DiffPill additions={add} deletions={del} />}
      >
        <div className="mb-1 border-t border-[var(--oc-border-weak)] pt-1">
          {files.map((f) => (
            <ChangedFileRow key={f.path} f={f} />
          ))}
        </div>
      </BasicTool>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Turn readout: model, duration, tokens and speed                      */
/* ------------------------------------------------------------------ */
function dur(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function TurnReadout({ m }: { m: Message }) {
  const st = m.stats;
  const bits = [
    m.model,
    st?.ms ? dur(st.ms) : "",
    st?.outputTokens ? `${st.outputTokens.toLocaleString()} tok` : "",
    st?.tps ? `${st.tps.toLocaleString()} tok/s` : "",
  ].filter(Boolean);
  if (!bits.length) return null;
  return <span className="ml-1 min-w-0 truncate font-mono text-[11px] text-on-surface-variant/70">{bits.join(" · ")}</span>;
}

/* ------------------------------------------------------------------ */
/* Follow (OpenCode follow.ts): pause on upward intent, resume at end   */
/* ------------------------------------------------------------------ */
const END_PX = 24;
const AWAY_PX = 96;

export function useTimelineFollow(resetKey: string) {
  const [following, setFollowing] = useState(true);
  const state = useRef<FollowState>("following");
  const el = useRef<HTMLDivElement | null>(null);
  const lastAuto = useRef(0);
  const off = useRef<(() => void) | null>(null);

  const dispatch = useCallback((e: FollowEvent) => {
    const next = transitionFollow(state.current, e);
    if (next === state.current) return;
    state.current = next;
    setFollowing(next === "following");
  }, []);

  const toEnd = useCallback((smooth: boolean) => {
    const node = el.current;
    if (!node) return;
    lastAuto.current = performance.now();
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  /** Re-pin to the end, e.g. after the user sends a message or taps Jump to bottom. */
  const resume = useCallback(
    (smooth = true) => {
      dispatch("return");
      toEnd(smooth);
    },
    [dispatch, toEnd]
  );

  /** Called when content grows. Follows only while following. */
  const follow = useCallback(() => {
    if (state.current === "following") toEnd(true);
  }, [toEnd]);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      off.current?.();
      off.current = null;
      el.current = node;
      if (!node) return;
      const dist = () => node.scrollHeight - node.scrollTop - node.clientHeight;
      const overflow = () => node.scrollHeight > node.clientHeight + 1;
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < 0 && overflow()) dispatch("wheel.up");
      };
      let ty = 0;
      const onTouchStart = (e: TouchEvent) => {
        ty = e.touches[0]?.clientY ?? 0;
      };
      const onTouchMove = (e: TouchEvent) => {
        const y = e.touches[0]?.clientY ?? 0;
        if (y - ty > 4 && overflow()) dispatch("touch.up");
        ty = y;
      };
      const onKey = (e: KeyboardEvent) => {
        const tg = e.target as HTMLElement | null;
        if (tg && (tg.tagName === "TEXTAREA" || tg.tagName === "INPUT" || tg.isContentEditable)) return;
        if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") dispatch("key.up");
      };
      const onScroll = () => {
        const d = dist();
        if (d <= END_PX) dispatch("at.end");
        else if (d > AWAY_PX && performance.now() - lastAuto.current > 900) dispatch("scroll.away");
      };
      node.addEventListener("wheel", onWheel, { passive: true });
      node.addEventListener("touchstart", onTouchStart, { passive: true });
      node.addEventListener("touchmove", onTouchMove, { passive: true });
      node.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("keydown", onKey);
      off.current = () => {
        node.removeEventListener("wheel", onWheel);
        node.removeEventListener("touchstart", onTouchStart);
        node.removeEventListener("touchmove", onTouchMove);
        node.removeEventListener("scroll", onScroll);
        window.removeEventListener("keydown", onKey);
      };
    },
    [dispatch]
  );

  // Each session starts out following.
  useEffect(() => {
    state.current = "following";
    setFollowing(true);
    requestAnimationFrame(() => toEnd(false));
  }, [resetKey, toEnd]);

  return { ref, following, follow, resume };
}

export function JumpToBottom({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none relative h-0">
      <button
        onClick={onClick}
        aria-label="Jump to bottom"
        className={cn(
          "state pointer-events-auto absolute -top-11 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full",
          "border border-[var(--oc-border-base)] bg-surface-container px-3 text-[12px] font-medium text-on-surface-variant hover:text-on-surface"
        )}
      >
        <Icon name="arrow_downward" size={14} />
        Jump to bottom
      </button>
    </div>
  );
}
