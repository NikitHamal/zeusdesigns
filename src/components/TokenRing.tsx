import { cn } from "../utils/cn";

/** Context usage ring (OpenCode session context meter). `pct` is 0-100. */
export function TokenRing({ pct, hot, size = 16 }: { pct: number; hot?: boolean; size?: number }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(3, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2} className="stroke-surface-highest" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v / 100)}
        className={cn("transition-[stroke-dashoffset]", hot ? "stroke-[var(--oc-critical)]" : "stroke-on-surface-variant")}
      />
    </svg>
  );
}
