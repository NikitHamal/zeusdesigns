import { useStore } from "../store";
import { canvasApi } from "./canvasApi";

/** Jump to an artboard on the canvas (switches page/view as needed). */
export function focusArtboard(id: string) {
  const s = useStore.getState();
  const a = s.artboards.find((x) => x.id === id);
  if (!a) { s.notify("That screen no longer exists"); return; }
  useStore.setState({ activePageId: a.pageId, view: "canvas", sel: [id] });
  setTimeout(() => canvasApi.fit([id]), 60);
}

export const NOTE_COLORS = ["#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#ddd6fe", "#fed7aa"];
export const INK_COLORS = ["var(--m-primary)", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#111827"];
