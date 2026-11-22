// Layout audit: renders a screen off-screen (no scripts) and measures it. Catches what weak models get wrong:
// overlapping text, horizontal overflow, unreadable contrast, clipped labels, tiny type, tiny tap targets, half-empty screens.
export interface AuditIssue { kind: "overflow" | "overlap" | "contrast" | "clipped" | "tiny" | "tap" | "sparse" | "gap"; msg: string; severe: boolean }

const rgba = (c: string): [number, number, number, number] | null => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i.exec(c);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [+m[1], +m[2], +m[3], a];
};
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const label = (e: Element) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/)[0] : ""}`;
const sample = (e: Element) => (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28);

export async function auditHtml(html: string, w: number, h: number): Promise<AuditIssue[]> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;border:0;visibility:hidden;pointer-events:none`;
  frame.srcdoc = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  document.body.appendChild(frame);
  try {
    await new Promise<void>((res) => { frame.onload = () => res(); setTimeout(res, 2500); });
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !win || !doc.body) return [];
    await new Promise((r) => setTimeout(r, 60));
    const issues: AuditIssue[] = [];
    const all = Array.from(doc.body.querySelectorAll("*")).filter((e) => !["SCRIPT", "STYLE", "SVG", "PATH", "BR"].includes(e.tagName.toUpperCase()) && !e.closest("svg"));
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const cs = win.getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.05; };

    // horizontal overflow
    const sw = doc.documentElement.scrollWidth;
    if (sw > w + 2) {
      const bad = all.filter((e) => vis(e) && e.getBoundingClientRect().right > w + 6 && !e.closest("[style*='overflow']")).slice(0, 3).map(label);
      issues.push({ kind: "overflow", severe: true, msg: `content is ${sw - w}px wider than the ${w}px screen${bad.length ? ` (${bad.join(", ")})` : ""}; wrap or shrink it` });
    }

    // text leaves
    const leaves = all.filter((e) => vis(e) && Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0));
    const boxes = leaves.map((e) => ({ e, r: e.getBoundingClientRect() }));

    // overlapping text
    const seen = new Set<string>();
    for (let i = 0; i < boxes.length && issues.filter((x) => x.kind === "overlap").length < 3; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x <= 2 || y <= 2) continue;
        const frac = (x * y) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (frac > 0.25) {
          const k = sample(a.e) + sample(b.e);
          if (seen.has(k)) continue;
          seen.add(k);
          issues.push({ kind: "overlap", severe: true, msg: `"${sample(a.e)}" overlaps "${sample(b.e)}"` });
          break;
        }
      }
    }

    // contrast, tiny type, clipped labels
    let lowC = 0, tiny = 0, clip = 0;
    for (const { e } of boxes) {
      const cs = win.getComputedStyle(e);
      const fg = rgba(cs.color);
      if (!fg) continue;
      let bg: [number, number, number, number] | null = null;
      let skip = false;
      for (let p: Element | null = e; p; p = p.parentElement) {
        const pcs = win.getComputedStyle(p);
        if (pcs.backgroundImage !== "none") { skip = true; break; }
        const c = rgba(pcs.backgroundColor);
        if (c && c[3] > 0.6) { bg = c; break; }
      }
      if (!skip) {
        const base = bg ?? [255, 255, 255, 1];
        const eff = [fg[0] * fg[3] + base[0] * (1 - fg[3]), fg[1] * fg[3] + base[1] * (1 - fg[3]), fg[2] * fg[3] + base[2] * (1 - fg[3])];
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 600;
        const need = size >= 24 || (size >= 18.5 && bold) ? 3 : 4.2;
        const cr = ratio(eff, base);
        if (cr < need && lowC++ < 3) issues.push({ kind: "contrast", severe: cr < 2.4, msg: `"${sample(e)}" has contrast ${cr.toFixed(1)}:1, needs ${need}:1` });
      }
      if (parseFloat(cs.fontSize) < 11 && tiny++ < 1) issues.push({ kind: "tiny", severe: false, msg: `"${sample(e)}" is ${parseFloat(cs.fontSize)}px; keep text at 12px or larger` });
      if ((e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2 && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis" && cs.overflowX !== "auto" && cs.overflowX !== "scroll" && clip++ < 2)
        issues.push({ kind: "clipped", severe: true, msg: `"${sample(e)}" is cut off; give it room or allow wrapping` });
    }

    // tap targets on touch layouts
    if (w <= 900) {
      let small = 0;
      for (const e of all) {
        if (!/^(BUTTON|A|INPUT|SELECT)$/.test(e.tagName) || !vis(e)) continue;
        const r = e.getBoundingClientRect();
        if ((r.height < 30 || r.width < 30) && small++ < 1) issues.push({ kind: "tap", severe: false, msg: `<${label(e)}> is ${Math.round(r.width)}x${Math.round(r.height)}px; tap targets need 40px` });
      }
    }

    // dead bands: sweep visible atoms (leaves, media, empty blocks) top to bottom; a long stretch with nothing in it is wasted space
    const atoms = all.filter((e) => vis(e) && (e.children.length === 0 || leaves.includes(e))).map((e) => e.getBoundingClientRect()).sort((p, q) => p.top - q.top);
    let reach = 0;
    for (const r of atoms) {
      if (reach > 0 && r.top - reach > 150 && r.top < Math.max(h, doc.documentElement.scrollHeight)) {
        issues.push({ kind: "gap", severe: true, msg: `a ${Math.round(r.top - reach)}px empty band starts at y=${Math.round(reach)}; add content or tighten the layout so the screen is filled` });
        break;
      }
      reach = Math.max(reach, r.bottom);
    }
    if (!issues.some((i) => i.kind === "gap") && doc.documentElement.scrollHeight <= h + 4 && reach < h * 0.6 && w < 900)
      issues.push({ kind: "sparse", severe: true, msg: `content ends at ${Math.round((reach / h) * 100)}% of the screen height; add real sections instead of empty space` });
    return issues;
  } finally {
    frame.srcdoc = "";
    frame.remove();
  }
}

/** Deterministic fixes that are always safe. Returns html with a patch style, or the input if nothing applies. */
export function patchFor(html: string, issues: AuditIssue[]): string {
  if (!issues.length || html.includes("data-zeus-fix")) return html;
  const rules: string[] = [];
  if (issues.some((i) => i.kind === "overflow")) {
    rules.push("html,body{overflow-x:hidden!important;max-width:100%!important}img,svg,video,table{max-width:100%!important}.z-row,.z-grid,.z-grid-2,.z-grid-3,.z-grid-4{min-width:0}");
  }
  if (issues.some((i) => i.kind === "clipped")) {
    rules.push(".z-card,.z-item,.z-row>*{min-width:0;overflow-wrap:break-word}h1,h2,h3,p,span{overflow-wrap:break-word}");
  }
  if (issues.some((i) => i.kind === "tap")) {
    rules.push("button,.z-btn,.z-icon-btn,.z-chip{min-height:38px}");
  }
  if (issues.some((i) => i.kind === "sparse")) {
    rules.push(".z-page{justify-content:space-between}");
  }
  if (!rules.length) return html;
  const tag = `<style data-zeus-fix>${rules.join("")}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, tag + "</head>") : tag + html;
}
