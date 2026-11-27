import type { ConvStatus } from "../lib/convStatus";
import { Icon } from "./Icon";

/** Working spinner, needs-input mark or unread dot for a session. */
export function StatusMark({ status }: { status: ConvStatus }) {
  if (!status) return null;
  if (status === "working") return <span title="Working" className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-on-surface-variant/40 border-t-on-surface" />;
  if (status === "input") return <Icon name="help" size={13} className="shrink-0 text-[var(--oc-warning)]" />;
  return <span title="Unread" className="size-1.5 shrink-0 rounded-full bg-on-surface" />;
}
