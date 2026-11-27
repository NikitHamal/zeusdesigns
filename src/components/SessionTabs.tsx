import { useMemo } from "react";
import { activeProject, useStore } from "../store";
import { useConvStatus } from "../lib/convStatus";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";

/* icons: add, close */

function Tab({ id, title, active }: { id: string; title: string; active: boolean }) {
  const status = useConvStatus(id);
  return (
    <div className={cn("group/tab flex h-7 max-w-[180px] min-w-[84px] shrink-0 items-center rounded-md", active ? "bg-surface-container text-on-surface" : "text-on-surface-variant hover:bg-surface-low")}>
      <button
        onClick={() => { useStore.getState().setActiveConv(id); useStore.getState().patchUI({ leftTab: "chat" }); }}
        className="flex min-w-0 flex-1 items-center gap-1.5 pl-2 text-left text-[12.5px] outline-none"
      >
        <StatusMark status={status} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      <button
        onClick={() => useStore.getState().deleteConv(id)}
        aria-label="Close session"
        title="Delete session"
        className="mr-0.5 grid size-5 shrink-0 place-items-center rounded text-on-surface-variant/60 opacity-0 outline-none hover:text-on-surface group-hover/tab:opacity-100"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

/** Quick-switch strip for the most recent sessions of the active project. */
export function SessionTabs() {
  const convs = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.activeConvId);
  const proj = useStore(activeProject);
  const tabs = useMemo(() => {
    const mine = convs.filter((c) => c.messages.length > 0 && (!c.projectId || c.projectId === proj?.id));
    const top = [...mine].sort((a, b) => b.at - a.at).slice(0, 6);
    const active = convs.find((c) => c.id === activeId);
    if (active && !top.some((c) => c.id === active.id)) top.splice(5, 1, active);
    return top.sort((a, b) => a.at - b.at);
  }, [convs, activeId, proj?.id]);
  if (tabs.length < 2) return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--oc-border-weak)] px-2">
      {tabs.map((c) => <Tab key={c.id} id={c.id} title={c.title} active={c.id === activeId} />)}
      <button
        onClick={() => useStore.getState().newConversation(proj?.id)}
        title="New session"
        aria-label="New session"
        className="grid size-7 shrink-0 place-items-center rounded-md text-on-surface-variant outline-none hover:bg-surface-low hover:text-on-surface"
      >
        <Icon name="add" size={15} />
      </button>
    </div>
  );
}
