import { useStore } from "../store";
import { Icon } from "./Icon";
import { IconBtn } from "./ui";
import { isNative } from "../lib/bridge";

/** Right pane that hosts the real M3E Canvas editor for an <m3e> artifact. */
export function M3ePane() {
  const m3e = useStore((s) => s.ui.m3e);
  const hasBoards = useStore((s) => s.artboards.length > 0);
  const patchUI = useStore((s) => s.patchUI);
  if (!m3e) return null;
  const close = () => patchUI({ m3e: null, ...(hasBoards ? {} : { showCanvas: false }) });
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-outline-variant/60 bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-outline-variant/60 px-3">
        <Icon name="design_services" size={18} className="text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{m3e.title}</span>
        {!isNative && (
          <IconBtn label="Open in browser" size={32} onClick={() => window.open(m3e.link, "_blank")}><Icon name="open_in_new" size={18} /></IconBtn>
        )}
        <IconBtn label="Close" size={32} onClick={close}><Icon name="close" size={18} /></IconBtn>
      </div>
      <iframe
        key={m3e.link}
        title={m3e.title}
        src={m3e.link}
        className="min-h-0 w-full flex-1 border-0 bg-surface"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-forms allow-modals"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
