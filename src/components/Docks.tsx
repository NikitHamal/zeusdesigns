import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import {
  answerPermission,
  answerQuestion,
  useAgent,
  type DockPermission,
  type DockQuestion,
  type TodoItem,
} from "../lib/agentState";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";

/* icons: radio_button_unchecked, radio_button_checked, check_box_outline_blank, check_box, check, close, expand_more, checklist, help, verified_user, keyboard_return */


/* ------------------------------------------------------------------ */
/* Question dock (OpenCode session-question-dock)                       */
/* ------------------------------------------------------------------ */
function QuestionDock({ q }: { q: DockQuestion }) {
  const items = q.questions;
  const [tab, setTab] = useState(0);
  const [picked, setPicked] = useState<string[][]>(() => items.map(() => []));
  const [custom, setCustom] = useState<string[]>(() => items.map(() => ""));
  const [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const cur = items[tab];
  const canCustom = cur.custom !== false;
  const rows = cur.options.length + (canCustom ? 1 : 0);
  const last = tab === items.length - 1;

  useEffect(() => { root.current?.focus(); }, [q.id]);
  useEffect(() => { setFocus(0); root.current?.focus(); }, [tab]);

  const answerOf = (i: number): string[] => {
    const typed = custom[i].trim();
    return [...picked[i], ...(typed ? [typed] : [])];
  };
  const answered = (i: number) => answerOf(i).length > 0;
  const toggle = (label: string) =>
    setPicked((all) =>
      all.map((sel, i) => {
        if (i !== tab) return sel;
        if (cur.multiple) return sel.includes(label) ? sel.filter((x) => x !== label) : [...sel, label];
        return [label];
      })
    );
  const submit = () => void answerQuestion(q.id, items.map((_, i) => answerOf(i)));
  const dismiss = () => void answerQuestion(q.id, null);
  const advance = () => (last ? submit() : setTab(tab + 1));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) {
      if (e.key === "Escape") { e.preventDefault(); root.current?.focus(); }
      else if (e.key === "Enter") { e.preventDefault(); if (answered(tab)) advance(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => (f + 1) % rows); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => (f - 1 + rows) % rows); }
    else if (e.key === "ArrowRight" && tab < items.length - 1) setTab(tab + 1);
    else if (e.key === "ArrowLeft" && tab > 0) setTab(tab - 1);
    else if (e.key === "Escape") { e.preventDefault(); dismiss(); }
    else if (e.key === " " && focus < cur.options.length) { e.preventDefault(); toggle(cur.options[focus].label); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (focus === cur.options.length) { customRef.current?.focus(); return; }
      const label = cur.options[focus]?.label;
      if (!label) return;
      if (cur.multiple) { if (!picked[tab].includes(label)) toggle(label); if (answered(tab) || !picked[tab].includes(label)) advance(); }
      else {
        const next = picked.map((sel, i) => (i === tab ? [label] : sel));
        setPicked(next);
        if (last) void answerQuestion(q.id, items.map((_, i) => (i === tab ? [label] : [...next[i], ...(custom[i].trim() ? [custom[i].trim()] : [])])));
        else setTab(tab + 1);
      }
    }
  };

  return (
    <div ref={root} tabIndex={0} onKeyDown={onKey} data-component="question-dock" className="oc-hairline mx-3 mb-1.5 rounded-lg bg-surface-low outline-none">
      <div className="flex items-center gap-1 border-b border-[var(--oc-border-weak)] px-2 py-1.5">
        <Icon name="help" size={15} className="shrink-0 text-on-surface-variant" />
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {items.length > 1 ? (
            items.map((it, i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                className={cn(
                  "flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] outline-none",
                  i === tab ? "bg-surface-container text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {answered(i) && <Icon name="check" size={12} />}
                {it.header || `Question ${i + 1}`}
              </button>
            ))
          ) : (
            <span className="px-1 text-[12px] font-medium text-on-surface">{cur.header || "Question"}</span>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" title="Dismiss (Esc)" className="grid size-6 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="px-3 pt-2 pb-1 text-[13.5px] leading-snug text-on-surface select-text">{cur.question}</div>
      <div className="max-h-[240px] overflow-y-auto px-1.5 pb-1">
        {cur.options.map((o, i) => {
          const on = picked[tab].includes(o.label);
          return (
            <button
              key={o.label + i}
              onClick={() => { setFocus(i); toggle(o.label); }}
              onMouseEnter={() => setFocus(i)}
              className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none", focus === i && "bg-surface-container")}
            >
              <Icon name={cur.multiple ? (on ? "check_box" : "check_box_outline_blank") : on ? "radio_button_checked" : "radio_button_unchecked"} size={16} className={cn("mt-px shrink-0", on ? "text-on-surface" : "text-on-surface-variant")} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-on-surface">{o.label}</span>
                {o.description && <span className="block text-[12px] text-on-surface-variant">{o.description}</span>}
              </span>
            </button>
          );
        })}
        {canCustom && (
          <div
            onMouseEnter={() => setFocus(cur.options.length)}
            className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", focus === cur.options.length && "bg-surface-container")}
          >
            <Icon name={custom[tab].trim() ? (cur.multiple ? "check_box" : "radio_button_checked") : cur.multiple ? "check_box_outline_blank" : "radio_button_unchecked"} size={16} className="shrink-0 text-on-surface-variant" />
            <input
              ref={customRef}
              value={custom[tab]}
              onChange={(e) => {
                const v = e.target.value;
                setCustom((c) => c.map((x, i) => (i === tab ? v : x)));
                if (!cur.multiple && v.trim()) setPicked((all) => all.map((s, i) => (i === tab ? [] : s)));
              }}
              onFocus={() => setFocus(cur.options.length)}
              placeholder="Type your own answer"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant/70"
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t border-[var(--oc-border-weak)] px-2 py-1.5">
        <button onClick={dismiss} className="h-7 rounded-md px-2.5 text-[12.5px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface">Dismiss</button>
        {tab > 0 && <button onClick={() => setTab(tab - 1)} className="h-7 rounded-md px-2.5 text-[12.5px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface">Back</button>}
        <button
          onClick={advance}
          disabled={!answered(tab)}
          className="flex h-7 items-center gap-1 rounded-md bg-on-surface px-3 text-[12.5px] font-semibold text-surface outline-none disabled:opacity-40"
        >
          {last ? "Submit" : "Next"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Permission dock (OpenCode session-permission-dock)                   */
/* ------------------------------------------------------------------ */
function PermissionDock({ p }: { p: DockPermission }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.focus(); }, [p.id]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); void answerPermission(p.id, "deny"); }
    else if (e.key === "Enter") { e.preventDefault(); void answerPermission(p.id, "once"); }
  };
  return (
    <div ref={root} tabIndex={0} onKeyDown={onKey} data-component="permission-dock" className="oc-hairline mx-3 mb-1.5 rounded-lg bg-surface-low outline-none">
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <Icon name="verified_user" size={16} className="mt-0.5 shrink-0 text-[var(--oc-warning)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-on-surface select-text">{p.title || "Permission required"}</div>
          {p.reason && <div className="mt-0.5 text-[12.5px] text-on-surface-variant select-text">{p.reason}</div>}
        </div>
      </div>
      {p.detail && (
        <pre className="mx-3 mt-2 max-h-32 overflow-auto rounded-md border border-[var(--oc-border-weak)] bg-surface px-2.5 py-1.5 font-mono text-[11.5px] whitespace-pre-wrap break-words text-on-surface select-text">{p.detail}</pre>
      )}
      <div className="flex items-center justify-end gap-1.5 px-2 py-2">
        <button onClick={() => void answerPermission(p.id, "deny")} className="h-7 rounded-md px-2.5 text-[12.5px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface">Deny</button>
        <button onClick={() => void answerPermission(p.id, "always")} className="oc-hairline h-7 rounded-md px-2.5 text-[12.5px] text-on-surface hover:bg-surface-container">Always allow</button>
        <button onClick={() => void answerPermission(p.id, "once")} className="h-7 rounded-md bg-on-surface px-3 text-[12.5px] font-semibold text-surface">Allow once</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Session todo bar                                                     */
/* ------------------------------------------------------------------ */
function TodoMark({ s }: { s: TodoItem["status"] }) {
  if (s === "completed") return <Icon name="check_box" size={15} className="shrink-0 text-on-surface-variant" />;
  if (s === "in_progress") return <Icon name="radio_button_checked" size={15} className="shrink-0 text-on-surface" />;
  if (s === "cancelled") return <Icon name="close" size={15} className="shrink-0 text-on-surface-variant/60" />;
  return <Icon name="check_box_outline_blank" size={15} className="shrink-0 text-on-surface-variant" />;
}

export function TodoBar({ todos, busy }: { todos: TodoItem[]; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const done = todos.filter((t) => t.status === "completed" || t.status === "cancelled").length;
  const active = todos.find((t) => t.status === "in_progress") ?? todos.find((t) => t.status === "pending");
  if (!todos.length || (done === todos.length && !busy)) return null;
  return (
    <div data-component="todo-bar" className="oc-hairline mx-3 mb-1.5 rounded-lg bg-surface-low">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-8 w-full items-center gap-2 px-2.5 text-left outline-none">
        <Icon name="checklist" size={15} className="shrink-0 text-on-surface-variant" />
        <span className="shrink-0 text-[12.5px] font-medium text-on-surface">{done} of {todos.length} done</span>
        {active && !open && <span className="min-w-0 flex-1 truncate text-[12.5px] text-on-surface-variant">{active.content}</span>}
        {(open || !active) && <span className="flex-1" />}
        <Icon name="expand_more" size={15} className={cn("shrink-0 text-on-surface-variant transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="max-h-[200px] space-y-0.5 overflow-y-auto border-t border-[var(--oc-border-weak)] px-2.5 py-1.5">
          {todos.map((t) => (
            <li key={t.id} className="flex items-start gap-2 py-0.5 text-[13px]">
              <span className="mt-px"><TodoMark s={t.status} /></span>
              <span className={cn("min-w-0 flex-1 select-text", t.status === "completed" || t.status === "cancelled" ? "text-on-surface-variant line-through" : "text-on-surface")}>{t.content}</span>
              {t.priority === "high" && t.status !== "completed" && <span className="shrink-0 font-mono text-[10.5px] text-[var(--oc-warning)]">high</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stack mounted directly above the Composer                            */
/* ------------------------------------------------------------------ */
export function DockStack({ convId }: { convId: string }) {
  const questions = useAgent((s) => s.questions);
  const permissions = useAgent((s) => s.permissions);
  const todos = useAgent((s) => s.todos[convId]);
  const busy = useStore((s) => s.busy);
  const q = useMemo(() => questions.find((x) => x.sessionId === convId), [questions, convId]);
  const p = useMemo(() => permissions.find((x) => x.sessionId === convId), [permissions, convId]);
  if (!q && !p && !todos?.length) return null;
  return (
    <div className="pt-1">
      {p ? <PermissionDock key={p.id} p={p} /> : q ? <QuestionDock key={q.id} q={q} /> : null}
      {todos && todos.length > 0 && <TodoBar todos={todos} busy={busy} />}
    </div>
  );
}
