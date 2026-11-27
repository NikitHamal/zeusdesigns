import { useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { AgentPlan, PendingApproval, PendingUserQuestion, PlanTask } from "../types";
import { sendMessage } from "../lib/engine";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";

export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("zcollapse", open && "open", className)}>
      <div className="zcollapse-in">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stormy PlanTimeline (PlanTimeline.kt — Collapsible Checklist)       */
/* ------------------------------------------------------------------ */
export function PlanTimeline({ plan }: { plan: AgentPlan }) {
  const [expanded, setExpanded] = useState(false);
  if (!plan.tasks.length) return null;

  const doneCount = plan.tasks.filter((t) => t.state === "done").length;
  const isComplete = doneCount === plan.tasks.length;
  const activeTask = plan.tasks.find((t) => t.state === "active") ?? plan.tasks.find((t) => t.state === "pending");
  const fraction = Math.round((doneCount / Math.max(1, plan.tasks.length)) * 100);

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container">
      <button
        onClick={() => setExpanded(!expanded)}
        className="state flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-on-surface">
            {isComplete ? "Plan complete" : activeTask?.title ?? "Planning"}
          </div>
          <div className="text-[11.5px] text-on-surface-variant">
            {doneCount} of {plan.tasks.length} done
          </div>
        </div>
        <Icon
          name="expand_more"
          size={16}
          className={cn("shrink-0 text-on-surface-variant transition-transform", expanded && "rotate-180")}
        />
      </button>
      <div className="h-0.5 w-full bg-surface-highest">
        <div
          style={{ width: `${fraction}%` }}
          className="h-full bg-primary transition-all duration-300"
        />
      </div>
      <Collapse open={expanded}>
        <div className="space-y-1.5 px-3.5 py-2.5">
          {plan.tasks.map((task: PlanTask) => (
            <div key={task.id} className="flex items-start gap-2.5 text-[12.5px]">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                {task.state === "done" ? (
                  <Icon name="check" size={14} className="text-tertiary" />
                ) : task.state === "active" ? (
                  <span className="size-2 rounded-full bg-primary" />
                ) : task.state === "blocked" ? (
                  <Icon name="error" size={14} className="text-error" />
                ) : (
                  <span className="size-2 rounded-full bg-surface-highest" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    task.state === "active" && "font-semibold text-on-surface",
                    task.state === "done" && "text-on-surface-variant",
                    task.state === "pending" && "text-on-surface-variant/80",
                    task.state === "skipped" && "line-through text-on-surface-variant/60",
                    task.state === "blocked" && "text-error"
                  )}
                >
                  {task.title}
                </span>
                {task.note && (
                  <div className="text-[11px] text-on-surface-variant">{task.note}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Collapse>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stormy AskUserCard (AskUserCard.kt — Interactive Intake Card)       */
/* ------------------------------------------------------------------ */
export function AskUserCard({
  convId,
  msgId,
  pending,
}: {
  convId: string;
  msgId: string;
  pending: PendingUserQuestion;
}) {
  const busy = useStore((s) => s.busy);
  const patchMessage = useStore((s) => s.patchMessage);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of pending.questions) {
      const rec = q.options.find((o) => o.recommended) ?? q.options[0];
      if (rec) init[q.id] = rec.label;
    }
    return init;
  });
  const [customText, setCustomText] = useState("");

  if (pending.answered) return null;

  const submitAnswers = (youDecide = false) => {
    if (busy) return;
    patchMessage(convId, msgId, {
      pendingQuestion: { ...pending, answered: true },
    });
    if (youDecide) {
      sendMessage({ text: "You decide the best options and build it now." });
      return;
    }
    const lines = pending.questions.map((q) => {
      const ans = selected[q.id] || "You decide";
      return `- ${q.header ? `${q.header}: ` : ""}${q.question} -> ${ans}`;
    });
    if (customText.trim()) {
      lines.push(`- Additional notes: ${customText.trim()}`);
    }
    sendMessage({ text: lines.join("\n") });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-low p-3.5">
      {pending.questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <div className="text-[13px] font-semibold text-on-surface">
            {q.header ? `${q.header}: ` : ""}
            {q.question}
          </div>
          {q.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => {
                const active = selected[q.id] === opt.label;
                return (
                  <button
                    key={opt.label}
                    onClick={() => setSelected((s) => ({ ...s, [q.id]: opt.label }))}
                    className={cn(
                      "state flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary-container text-on-primary-container font-semibold"
                        : "border-outline-variant/60 bg-surface text-on-surface hover:bg-surface-high"
                    )}
                  >
                    {active && <Icon name="check" size={13} />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <input
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitAnswers(false);
          }
        }}
        placeholder="Other details…"
        className="h-8 w-full rounded-xl border border-outline-variant/60 bg-surface px-3 text-xs text-on-surface outline-none focus:border-primary"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          disabled={busy}
          onClick={() => submitAnswers(true)}
          className="state h-8 rounded-full bg-surface-high px-3.5 text-xs font-medium text-on-surface"
        >
          You decide
        </button>
        <button
          disabled={busy}
          onClick={() => submitAnswers(false)}
          className="state h-8 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stormy ApprovalCard (ApprovalSheet.kt — Leashed & Danger Approval)  */
/* ------------------------------------------------------------------ */
export function ApprovalCard({
  convId,
  msgId,
  approval,
}: {
  convId: string;
  msgId: string;
  approval: PendingApproval;
}) {
  const busy = useStore((s) => s.busy);
  const patchMessage = useStore((s) => s.patchMessage);
  const patchSettings = useStore((s) => s.patchSettings);

  if (approval.resolved) return null;

  const respond = (decision: "approved" | "denied" | "always") => {
    if (busy) return;
    if (decision === "always") {
      patchSettings({ autonomy: "unleashed" });
    }
    patchMessage(convId, msgId, {
      pendingApproval: { ...approval, resolved: decision },
    });
    if (decision === "denied") {
      sendMessage({ text: `Denied action: ${approval.action}. Do not perform this step; suggest an alternative or stop.` });
    } else {
      sendMessage({ text: `Approved action: ${approval.action}. Proceed now.` });
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-low p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-xl",
            approval.dangerReason
              ? "bg-error-container text-on-error-container"
              : "bg-primary-container text-on-primary-container"
          )}
        >
          <Icon name={approval.dangerReason ? "warning" : "verified_user"} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-on-surface">{approval.action}</div>
          {approval.dangerReason && (
            <div className="mt-0.5 text-xs font-medium text-error">{approval.dangerReason}</div>
          )}
        </div>
      </div>

      {approval.detail && (
        <pre className="max-h-40 overflow-auto rounded-xl border border-outline-variant/50 bg-surface-lowest p-2.5 font-mono text-[11.5px] leading-relaxed text-on-surface-variant select-text">
          {approval.detail}
        </pre>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          disabled={busy}
          onClick={() => respond("denied")}
          className="state h-8 rounded-full bg-surface-high px-3.5 text-xs font-medium text-on-surface"
        >
          Deny
        </button>
        {!approval.dangerReason && (
          <button
            disabled={busy}
            onClick={() => respond("always")}
            className="state h-8 rounded-full bg-secondary-container px-3.5 text-xs font-semibold text-on-secondary-container"
          >
            Always allow
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => respond("approved")}
          className="state h-8 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary"
        >
          Allow once
        </button>
      </div>
    </div>
  );
}
