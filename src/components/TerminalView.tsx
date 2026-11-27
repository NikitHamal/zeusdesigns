import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { onPtyData, ptyApi } from "../lib/pty";

function resolveColor(el: HTMLElement, token: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.style.display = "none";
  el.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c && c !== "" ? c : fallback;
}

function buildTheme(el: HTMLElement) {
  return {
    background: resolveColor(el, "--m-surface-dim", "#111"),
    foreground: resolveColor(el, "--m-on-surface", "#eee"),
    cursor: resolveColor(el, "--m-primary", "#e0956f"),
    cursorAccent: resolveColor(el, "--m-surface-dim", "#111"),
    selectionBackground: resolveColor(el, "--m-surface-highest", "#444"),
    red: "#f2766b",
    green: "#8ccf7e",
    yellow: "#e5c07b",
    blue: "#7fb4e8",
    magenta: "#c79bd6",
    cyan: "#6fcfcf",
  };
}

/** One live xterm bound to a native PTY. Disposed on unmount; Rust keeps scrollback for the next attach. */
export default function TerminalView({ id, focusKey }: { id: string; focusKey: number }) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    const term = new Terminal({
      fontFamily: '"Roboto Mono", ui-monospace, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 2000,
      allowProposedApi: false,
      theme: buildTheme(el),
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);

    const doFit = () => {
      if (disposed || el.clientWidth < 20 || el.clientHeight < 20) return;
      try {
        fit.fit();
      } catch {
        /* hidden */
      }
    };
    doFit();

    // Live data is buffered until the replay of earlier output has been written, so ordering is exact.
    let ready = false;
    const pending: string[] = [];
    const off = onPtyData(id, (d) => {
      if (ready) term.write(d);
      else pending.push(d);
    });
    void ptyApi.attach(id).then((scroll) => {
      if (disposed) return;
      if (scroll) term.write(scroll);
      for (const d of pending) term.write(d);
      pending.length = 0;
      ready = true;
      doFit();
      ptyApi.resize(id, term.cols, term.rows);
    });

    const dataSub = term.onData((d) => ptyApi.write(id, d));
    const resizeSub = term.onResize(({ cols, rows }) => ptyApi.resize(id, cols, rows));

    // Ctrl+C copies when text is selected; Ctrl+V pastes via the clipboard.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "c" && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        return false;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "v") {
        void navigator.clipboard.readText().then((t) => t && term.paste(t));
        return false;
      }
      return true;
    });

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(doFit);
    });
    ro.observe(el);
    term.focus();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      off();
      dataSub.dispose();
      resizeSub.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    termRef.current?.focus();
  }, [focusKey]);

  return <div ref={host} className="zterm min-h-0 flex-1 overflow-hidden bg-surface-dim px-2 pt-1.5" />;
}
