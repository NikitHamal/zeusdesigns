// OpenDesign Deliverable Parsers, Bundle Scaffolder & Choreography Analyzer
// Extracted from openDesign.ts to keep modules focused and maintainable.

import {
  getOpenDesignBrand,
  type OpenDesignCreationMode,
  type VideoAspectRatio,
} from "./openDesign";

export interface HyperFramesBundle {
  slug: string;
  cacheDir: string;
  files: Record<string, string>;
}

export interface HyperFrameScene {
  index: number;
  durationMs: number;
  transition: string;
  sceneTitle: string;
  snippetText: string;
}

export interface ParsedHyperFrames {
  isHyperFrames: boolean;
  aspect: VideoAspectRatio;
  width: number;
  height: number;
  totalDurationMs: number;
  frames: HyperFrameScene[];
}

export interface OpenSlideItem {
  index: number;
  id: string;
  title: string;
  notes: string;
  headline: string;
}

export interface ParsedOpenSlideDeck {
  isDeck: boolean;
  slides: OpenSlideItem[];
}

export interface HyperFramesAnimationMapReport {
  totalDurationSec: number;
  sceneCount: number;
  asciiTimeline: string[];
  flags: string[];
  contrastPass: boolean;
}

export function detectDeliverableKind(html: string): "hyperframes" | "deck" | "prototype" {
  if (!html) return "prototype";
  if (
    /HYPERFRAMES_META/i.test(html) ||
    /<section[^>]+class=["'][^"']*\bframe\b[^"']*["'][^>]*data-duration=/i.test(html) ||
    /data-duration=["']\d+["']/i.test(html)
  ) {
    return "hyperframes";
  }
  if (/<section[^>]+class=["'][^"']*\bslide\b/i.test(html) || /data-slide-id=/i.test(html)) {
    return "deck";
  }
  return "prototype";
}

export function parseHyperFramesDocument(html: string): ParsedHyperFrames {
  const frames: HyperFrameScene[] = [];
  let aspect: VideoAspectRatio = "16:9";
  let width = 1920;
  let height = 1080;

  const metaMatch = /<!--\s*HYPERFRAMES_META:\s*(\{[\s\S]*?\})\s*-->/i.exec(html);
  let metaFrames: Array<{ i?: number; duration?: number; transition?: string; scene?: string }> = [];
  if (metaMatch) {
    try {
      const parsed = JSON.parse(metaMatch[1]) as {
        aspect?: VideoAspectRatio;
        width?: number;
        height?: number;
        frames?: Array<{ i?: number; duration?: number; transition?: string; scene?: string }>;
      };
      if (parsed.aspect) aspect = parsed.aspect;
      if (parsed.width) width = parsed.width;
      if (parsed.height) height = parsed.height;
      if (Array.isArray(parsed.frames)) metaFrames = parsed.frames;
    } catch {
      /* ignore malformed meta comment */
    }
  }

  const sectionRe = /<section\b([^>]*class=["'][^"']*\bframe\b[^"']*["'][^>]*)>([\s\S]*?)<\/section>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = sectionRe.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const durAttr = /data-duration=["'](\d+)["']/i.exec(attrs);
    const sceneAttr = /data-scene=["']([^"']+)["']/i.exec(attrs);
    const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(inner);
    const cleanH1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    const meta = metaFrames[idx];
    const durationMs = Number(durAttr?.[1] ?? meta?.duration ?? 3000) || 3000;
    const sceneTitle =
      sceneAttr?.[1]?.trim() ||
      meta?.scene?.trim() ||
      cleanH1.slice(0, 64) ||
      `Scene ${String(idx + 1).padStart(2, "0")}`;
    const snippetText = inner
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    frames.push({
      index: idx,
      durationMs,
      transition: meta?.transition || "fade",
      sceneTitle,
      snippetText,
    });
    idx++;
  }

  if (frames.length === 0 && /data-composition-id=/i.test(html)) {
    const compMatch = /<[^>]+data-composition-id=["'][^"']+["']([^>]*)>/i.exec(html);
    if (compMatch) {
      const attrs = compMatch[1] ?? "";
      const wAttr = Number(/data-width=["'](\d+)["']/i.exec(attrs)?.[1] ?? 1920);
      const hAttr = Number(/data-height=["'](\d+)["']/i.exec(attrs)?.[1] ?? 1080);
      if (wAttr && hAttr) {
        width = wAttr;
        height = hAttr;
        aspect = wAttr < hAttr ? "9:16" : wAttr === hAttr ? "1:1" : "16:9";
      }
    }
    const clipRe =
      /<([a-z0-9]+)\b([^>]*data-start=["']([^"']+)["'][^>]*data-duration=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
    let cm: RegExpExecArray | null;
    let cIdx = 0;
    while ((cm = clipRe.exec(html)) !== null) {
      const durSec = Number(cm[4] ?? 3) || 3;
      const innerText = (cm[5] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      frames.push({
        index: cIdx,
        durationMs: Math.round(durSec * 1000),
        transition: "cut",
        sceneTitle: innerText.slice(0, 56) || `Clip ${String(cIdx + 1).padStart(2, "0")}`,
        snippetText: innerText.slice(0, 120),
      });
      cIdx++;
    }
  }

  const totalDurationMs = frames.reduce((acc, f) => acc + f.durationMs, 0);
  return {
    isHyperFrames: frames.length > 0,
    aspect,
    width,
    height,
    totalDurationMs,
    frames,
  };
}

export function buildHyperFramesCompositionBundle(opts: {
  html: string;
  title: string;
  aspect?: VideoAspectRatio;
}): HyperFramesBundle {
  const parsed = parseHyperFramesDocument(opts.html);
  const slug =
    (opts.title || "hyperframes-video")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "hyperframes-video";
  const cacheDir = `.hyperframes-cache/${slug}`;
  const totalSec = Math.max(1, +(parsed.totalDurationMs / 1000).toFixed(2));
  const timelineBridge = `<script>
window.__timelines = window.__timelines || {};
window.__timelines.main = {
  duration: function() { return ${totalSec}; },
  seek: function(sec) {
    var ms = sec * 1000;
    var acc = 0;
    var frames = document.querySelectorAll('.frame');
    for (var i = 0; i < frames.length; i++) {
      var d = Number(frames[i].getAttribute('data-duration')) || 3000;
      if (ms <= acc + d || i === frames.length - 1) {
        window.postMessage({ type: 'zeus:hyperframes-goto', index: i, playing: false }, '*');
        break;
      }
      acc += d;
    }
  }
};
</script>`;
  const enrichedHtml = opts.html.includes("window.__timelines")
    ? opts.html
    : opts.html.includes("</body>")
    ? opts.html.replace("</body>", `${timelineBridge}\n</body>`)
    : `${opts.html}\n${timelineBridge}`;

  return {
    slug,
    cacheDir,
    files: {
      [`${cacheDir}/hyperframes.json`]: JSON.stringify(
        {
          paths: {
            blocks: "compositions",
            components: "compositions/components",
            assets: "assets",
          },
          media: { autoProxy: false },
        },
        null,
        2
      ),
      [`${cacheDir}/meta.json`]: JSON.stringify(
        {
          id: slug,
          name: opts.title || "HyperFrames Composition",
          aspect: opts.aspect || parsed.aspect,
          width: parsed.width,
          height: parsed.height,
          durationSec: totalSec,
          scenes: parsed.frames.length,
        },
        null,
        2
      ),
      [`${cacheDir}/index.html`]: enrichedHtml,
    },
  };
}

export function computeHyperFramesAnimationMap(html: string): HyperFramesAnimationMapReport {
  const parsed = parseHyperFramesDocument(html);
  const totalSec = +(parsed.totalDurationMs / 1000).toFixed(2);
  const flags: string[] = [];
  const asciiTimeline: string[] = [];

  if (/box-shadow\s*:\s*(?!none)/i.test(html)) {
    flags.push("shadow-violation: non-zero box-shadow detected (Zeus law requires 0 box-shadows)");
  }

  let cursorMs = 0;
  for (const f of parsed.frames) {
    const startSec = (cursorMs / 1000).toFixed(1);
    const endSec = ((cursorMs + f.durationMs) / 1000).toFixed(1);
    const barBlocks = Math.max(2, Math.min(24, Math.round(f.durationMs / 250)));
    const bar = "█".repeat(barBlocks);
    asciiTimeline.push(`[${startSec.padStart(4, " ")}s–${endSec.padStart(4, " ")}s] ${bar} ${f.sceneTitle}`);
    if (f.durationMs < 1200) {
      flags.push(`paced-fast: Scene ${f.index + 1} (${f.durationMs}ms) is under 1.2s minimum readable hold`);
    } else if (f.durationMs > 8000) {
      flags.push(`paced-slow: Scene ${f.index + 1} (${f.durationMs}ms) exceeds 8.0s without scene cut`);
    }
    if (!f.snippetText && !f.sceneTitle) {
      flags.push(`empty-scene: Scene ${f.index + 1} has no visible text headline`);
    }
    cursorMs += f.durationMs;
  }

  return {
    totalDurationSec: totalSec,
    sceneCount: parsed.frames.length,
    asciiTimeline,
    flags,
    contrastPass: !flags.some((f) => f.startsWith("shadow-violation")),
  };
}

export function parseOpenSlideDeck(html: string): ParsedOpenSlideDeck {
  const slides: OpenSlideItem[] = [];
  const slideRe = /<section\b([^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*)>([\s\S]*?)<\/section>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = slideRe.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const idAttr = /data-slide-id=["']([^"']+)["']/i.exec(attrs)?.[1] ?? String(idx + 1);
    const titleAttr = /data-title=["']([^"']+)["']/i.exec(attrs)?.[1];
    const notesAttr = /data-notes=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    const h1Match = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(inner);
    const headline = h1Match
      ? h1Match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : `Slide ${idx + 1}`;
    slides.push({
      index: idx,
      id: idAttr,
      title: titleAttr || `${String(idx + 1).padStart(2, "0")} · ${headline.slice(0, 44)}`,
      notes: notesAttr,
      headline,
    });
    idx++;
  }
  return {
    isDeck: slides.length > 0,
    slides,
  };
}

export function buildOpenDesignDeliverablePrompt(opts: {
  mode: OpenDesignCreationMode;
  brandId: string;
  aspect: VideoAspectRatio;
}): string {
  const brand = getOpenDesignBrand(opts.brandId);
  const laws = `## Non-Negotiable Visual & Engineering Laws
- ZERO box-shadows anywhere (\`box-shadow: none\` only). Use tonal surface contrast and crisp 1px solid borders (\`${brand.border}\`).
- ZERO emojis anywhere in UI chrome, labels, or content.
- ZERO 'LIVE' badges.
- ZERO blue or purple gradients.
- Cut taglines, helper text, and filler prose. Every screen or frame must communicate through layout, real data, and typographic hierarchy.
- Emit a single self-contained HTML document inside \`<artboard name="Title" device="web" mode="new"><!DOCTYPE html>...</html></artboard>\` with inline CSS and JS.`;

  if (opts.mode === "hyperframes") {
    const dims =
      opts.aspect === "9:16"
        ? "1080×1920 (9:16 vertical)"
        : opts.aspect === "1:1"
        ? "1080×1080 (1:1 square)"
        : "1920×1080 (16:9 widescreen)";
    return [
      `## OpenDesign Deliverable Mode: HyperFrames Code-to-Video (${dims})`,
      brand.designMd,
      laws,
      `## HyperFrames Technical Contract
- Structure the HTML document as 5 to 8 sequential \`<section class="frame" data-duration="3000" data-scene="Scene Title">\` sections.
- Each \`.frame\` fills the viewport (\`position: fixed; inset: 0;\`) and toggles visibility via \`.frame.active\`.
- Include a top progress bar (\`#progress\`), keyboard navigation (\`ArrowLeft\`, \`ArrowRight\`, \`Space\`), and \`window.addEventListener('message')\` listener supporting \`zeus:hyperframes-goto\` (\`{ index, playing }\`) and \`zeus:hyperframes-toggle\`, posting \`{ type: 'zeus:hyperframes-state', frameIndex, totalFrames, playing }\` to \`window.parent\`.
- Include \`<!-- HYPERFRAMES_META: {"aspect":"${opts.aspect}","frames":[{"i":1,"duration":3000,"transition":"fade","scene":"..."}]} -->\` before \`</body>\`.`,
    ].join("\n\n");
  }

  if (opts.mode === "deck") {
    return [
      `## OpenDesign Deliverable Mode: Open-Slide 1920×1080 Presentation Deck`,
      brand.designMd,
      laws,
      `## Open-Slide Technical Contract
- Structure the HTML document as 5 to 8 \`<section class="slide" data-slide-id="1" data-title="01 · Slide Title" data-notes="Speaker notes...">\` sections.
- Each slide must fit cleanly inside the viewport with zero scrollbars and a single visual focal point (oversized numeral, 3-column comparison, or data chart).
- Support \`ArrowLeft\` / \`ArrowRight\` keyboard navigation and \`window.addEventListener('message')\` for \`{ type: 'zeus:slide-goto', index }\`, posting \`{ type: 'zeus:slide-state', slideIndex, totalSlides }\` to \`window.parent\`.`,
    ].join("\n\n");
  }

  if (opts.mode === "motion-design") {
    return [
      `## OpenDesign Deliverable Mode: OpenMotion Kinetic Poster & Data Animation`,
      brand.designMd,
      laws,
      `- Build a kinetic typographic or animated data composition using deterministic CSS/SVG/Canvas motion, high-contrast typography, and real domain metrics.`,
    ].join("\n\n");
  }

  if (opts.mode === "brand-kit") {
    return [
      `## OpenDesign Deliverable Mode: Brand Identity & DESIGN.md Specimen`,
      brand.designMd,
      laws,
      `- Build an interactive Brand Identity & DESIGN.md Specimen sheet showing color swatches with hex codes, typography scale specimens, interactive UI component states, and copyable DESIGN.md token rules.`,
    ].join("\n\n");
  }

  return [
    `## OpenDesign Deliverable Mode: Interactive Web & Product Prototype`,
    brand.designMd,
    laws,
    `- Build a complete, interactive product interface with real domain data, working navigation/tab/filter interactions, and zero placeholder copy.`,
  ].join("\n\n");
}
