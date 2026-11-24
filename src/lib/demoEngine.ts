// Offline Demo Designer Fallback Engine
// Extracted from engine.ts to keep core agent orchestration modular.

import { useStore } from "../store";
import type { Artboard, Device } from "../types";
import { getDS } from "./designSystems";
import { detectArchetype, renderScreen, VARIANT_NAMES } from "./templates";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function demoRevise(html: string, instruction: string): { html: string; note: string } {
  const t = instruction.toLowerCase();
  const css: string[] = [];
  const notes: string[] = [];
  if (/dark|night/.test(t)) {
    css.push(
      ":root{--bg:#111116;--surface:#1c1c24;--surface-2:#272731;--text:#f3f3f7;--muted:#a6a6b5;--outline:#3b3b48;--container:#2f2a55;--on-container:#e6deff}"
    );
    notes.push("switched to a dark palette");
  }
  if (/round|soft|pill/.test(t)) {
    css.push(":root{--r-card:32px;--r-lg:28px;--r-md:22px;--r-btn:999px}");
    notes.push("increased corner radii");
  }
  if (/sharp|square|boxy/.test(t)) {
    css.push(":root{--r-card:4px;--r-lg:4px;--r-md:3px;--r-btn:4px}");
    notes.push("squared the corners");
  }
  if (/big|large|bigger|larger|readab/.test(t)) {
    css.push("body{font-size:17px}h1{font-size:1.2em}.btn{height:56px}");
    notes.push("scaled up type and tap targets");
  }
  if (/compact|dense|tight|small/.test(t)) {
    css.push(".scroll{gap:10px!important}.item{padding:8px 12px!important}.card{padding:12px!important}");
    notes.push("tightened spacing");
  }
  const colors: Record<string, [string, string, string]> = {
    red: ["#d32f2f", "#ffdad6", "#410002"],
    orange: ["#ef6c00", "#ffe0b2", "#3e1d00"],
    yellow: ["#f9a825", "#fff1b8", "#3b2f00"],
    green: ["#2e7d32", "#c8f2cb", "#00210a"],
    teal: ["#00796b", "#bff5ec", "#00201b"],
    blue: ["#1565c0", "#d3e4ff", "#001c3b"],
    purple: ["#7b1fa2", "#f3d9ff", "#2d0040"],
    pink: ["#d81b60", "#ffd8e6", "#3e001d"],
    black: ["#111111", "#e6e6e6", "#111111"],
  };
  for (const c of Object.keys(colors)) {
    if (new RegExp(`\\b${c}\\b`).test(t)) {
      css.push(
        `:root{--primary:${colors[c][0]};--container:${colors[c][1]};--on-container:${colors[c][2]};--tertiary:${colors[c][0]}}`
      );
      notes.push(`recolored with ${c}`);
      break;
    }
  }
  if (!css.length) {
    css.push(".btn{letter-spacing:.01em}");
    notes.push("polished depth and spacing");
  }
  const tag = `<style data-zeus-rev>${css.join("")}</style>`;
  return {
    html: html.includes("</head>") ? html.replace("</head>", tag + "</head>") : tag + html,
    note: notes.join(", "),
  };
}

export async function demoRun(opts: {
  prompt: string;
  device: Device;
  target?: Artboard;
  onDelta: (t: string) => void;
  signal: AbortSignal;
  asVariant?: boolean;
}) {
  const s = useStore.getState();
  const ds = getDS(s.settings.designSystemId);
  const emit = async (text: string, chunk = 900, delay = 10) => {
    for (let i = 0; i < text.length; i += chunk) {
      if (opts.signal.aborted) return;
      opts.onDelta(text.slice(i, i + chunk));
      await sleep(delay);
    }
  };
  if (opts.target && !opts.asVariant && opts.target.html.includes("Empty frame")) {
    const arche = detectArchetype(opts.prompt, opts.target.device);
    await emit(`Filling **${opts.target.name}** with a ${arche} design in **${ds.name}**.\n\n`, 40, 12);
    await emit(
      `<artboard name="${arche[0].toUpperCase() + arche.slice(1)}" device="${opts.target.device}" mode="revise" id="${opts.target.id}">\n${renderScreen(ds, arche, 0, opts.target.device, "Zeus")}\n</artboard>`
    );
    return;
  }
  if (opts.target && !opts.asVariant) {
    const r = demoRevise(opts.target.html, opts.prompt);
    await emit(
      `Updated **${opts.target.name}** — ${r.note}.\n\n_Demo engine: connect a real model (Mercury 3, Qwen…) in the native app for full redesigns._\n\n`,
      40,
      12
    );
    await emit(
      `<artboard name="${opts.target.name}" device="${opts.target.device}" mode="revise" id="${opts.target.id}">\n${r.html}\n</artboard>`
    );
    return;
  }
  const device: Device = opts.target?.device ?? opts.device;
  const arche = detectArchetype(opts.prompt, device);
  const title =
    opts.prompt.match(/(?:for|called|named)\s+(?:an?\s+|the\s+)?([A-Z][\w-]+(?:\s[A-Z][\w-]+)?)/)?.[1] ?? "Zeus";
  const count = opts.target ? 1 : 3;
  await emit(
    `Exploring **${count === 1 ? "a new direction" : "3 directions"}** for your ${arche} ${device === "web" ? "web page" : "screen"} in **${ds.name}**:\n\n${
      count === 1
        ? "- A fresh take on the selected screen\n"
        : "- **Balanced** — familiar hierarchy, calm surfaces\n- **Bold** — oversized type & expressive color blocks\n- **Compact** — denser, list-first layout\n"
    }\nTap around — tabs, chips, switches and hearts are live. Pin a comment or use *Ask Zeus* to refine any of them.\n\n`,
    30,
    14
  );
  for (let v = 0; v < count; v++) {
    if (opts.signal.aborted) return;
    const vi = opts.target ? (opts.target.version + 1) % 3 : v;
    const html = renderScreen(ds, arche, vi, device, title);
    await emit(
      `<artboard name="${arche[0].toUpperCase() + arche.slice(1)} · ${VARIANT_NAMES[vi]}" device="${device}" mode="new">\n${html}\n</artboard>\n`,
      1400,
      8
    );
  }
}
