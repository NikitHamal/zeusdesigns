import { useEffect, useState } from "react";
import { activeConv, useStore } from "../store";
import { forkFromTurn, revertToTurn } from "../lib/session";
import { IconBtn } from "./ui";
import { Icon } from "./Icon";

/* icons: call_split, undo, content_copy */

/** Fork / revert for one turn. `userMsgId` is the user message that opened the turn. */
export function TurnForkRevert({ msgId, userMsgId }: { msgId: string; userMsgId: string }) {
  const convId = useStore((s) => s.activeConvId);
  const busy = useStore((s) => s.busy);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <>
      <IconBtn label="Fork session from this turn" size={28} onClick={() => forkFromTurn(convId, msgId)}>
        <Icon name="call_split" size={13} />
      </IconBtn>
      <IconBtn
        label={armed ? "Click again to revert this turn and its file changes" : "Revert to before this turn"}
        size={28}
        onClick={() => {
          if (busy) return;
          if (!armed) { setArmed(true); return; }
          setArmed(false);
          void revertToTurn(convId, userMsgId);
        }}
      >
        <Icon name={armed ? "check" : "undo"} size={13} />
      </IconBtn>
    </>
  );
}

/** Id of the user message that opened the turn containing `msgId` (primitive selector: no re-render per delta). */
export function useTurnUserId(msgId: string): string {
  return useStore((s) => {
    const msgs = activeConv(s).messages;
    for (let i = msgs.findIndex((m) => m.id === msgId); i >= 0; i--) if (msgs[i].role === "user") return msgs[i].id;
    return msgId;
  });
}
