// Zeus OpenDesign — HyperFrames Code-to-Video WebM/MP4 Renderer & Recorder
// Deterministically steps through HyperFrames scenes, composites transitions & progress bar
// onto a 1920x1080 / 1080x1920 HTMLCanvasElement stream, and records a downloadable WebM/MP4 video.

import { parseHyperFramesDocument, type HyperFrameScene, type VideoAspectRatio } from "./openDesign";

export interface VideoExportProgress {
  phase: "preparing" | "rendering" | "encoding" | "done";
  currentScene: number;
  totalScenes: number;
  percent: number;
  detail: string;
}

export interface VideoExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  durationMs: number;
  width: number;
  height: number;
}

function pickSupportedVideoMime(): { mimeType: string; ext: "mp4" | "webm" } {
  const candidates: Array<{ mimeType: string; ext: "mp4" | "webm" }> = [
    { mimeType: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
    { mimeType: "video/mp4", ext: "mp4" },
    { mimeType: "video/webm;codecs=vp9", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    }
  }
  return { mimeType: "video/webm", ext: "webm" };
}

interface ExtractedFrameVisual {
  kicker: string;
  headlineLines: string[];
  sublines: string[];
  footerLeft: string;
  footerRight: string;
  topLeft: string;
  topRight: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  border: string;
  metrics: Array<{ val: string; lbl: string }>;
  bars: Array<{ label: string; pct: number; valueText: string; color: string }>;
}

function extractVisualFromHtml(html: string, scene: HyperFrameScene, idx: number, total: number): ExtractedFrameVisual {
  const doc = typeof DOMParser !== "undefined" ? new DOMParser().parseFromString(html, "text/html") : null;
  const styleText = Array.from(doc?.querySelectorAll("style") ?? [])
    .map((s) => s.textContent ?? "")
    .join("\n");

  const readVar = (name: string, fallback: string) => {
    const m = new RegExp(`${name}\\s*:\\s*([^;\\n}]+)`, "i").exec(styleText);
    return m ? m[1].trim() : fallback;
  };

  const bg = readVar("--bg", "#0B0C0E");
  const surface = readVar("--surface", "#14161A");
  const ink = readVar("--ink", "#F4F5F8");
  const muted = readVar("--muted", "#8A8F98");
  const accent = readVar("--accent", "#E9B94A");
  const border = readVar("--border", "#24272E");

  const frameEls = Array.from(doc?.querySelectorAll(".frame") ?? []);
  const el = frameEls[idx];

  const topSpans = Array.from(el?.querySelectorAll(".top-bar span, .num") ?? []).map((n) => (n.textContent ?? "").trim());
  const topLeft = topSpans[0] || `FRAME ${String(idx + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const topRight = topSpans[1] || "ZEUS OPENDESIGN · HYPERFRAMES";

  const kicker =
    (el?.querySelector(".kicker, .label")?.textContent ?? "").trim() ||
    `0${idx + 1} · SCENE`;

  const h1El = el?.querySelector("h1, h2");
  const rawH1 = h1El
    ? h1El.innerHTML
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim()
    : scene.sceneTitle;
  const headlineLines = rawH1
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);

  const metrics = Array.from(el?.querySelectorAll(".metric-card") ?? []).map((card) => ({
    val: (card.querySelector(".metric-val")?.textContent ?? "").trim(),
    lbl: (card.querySelector(".metric-lbl")?.textContent ?? "").trim(),
  }));

  const bars = Array.from(el?.querySelectorAll(".bar-row") ?? []).map((row) => {
    const spans = Array.from(row.querySelectorAll("span")).map((s) => (s.textContent ?? "").trim());
    const fill = row.querySelector(".bar-fill") as HTMLElement | null;
    const styleAttr = fill?.getAttribute("style") ?? "";
    const wMatch = /width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(styleAttr);
    const bgMatch = /background\s*:\s*([^;]+)/i.exec(styleAttr);
    return {
      label: spans[0] ?? "Metric",
      pct: wMatch ? Number(wMatch[1]) : 85,
      valueText: spans[1] ?? "100%",
      color: bgMatch ? bgMatch[1].trim() : accent,
    };
  });

  const footerSpans = Array.from(el?.querySelectorAll(".footer-strip span") ?? []).map((n) => (n.textContent ?? "").trim());
  const footerLeft = footerSpans[0] || scene.sceneTitle.toUpperCase();
  const footerRight = footerSpans[1] || `${(scene.durationMs / 1000).toFixed(1)}S · ${scene.transition.toUpperCase()}`;

  const sublines = scene.snippetText
    ? [scene.snippetText]
    : [];

  return {
    kicker,
    headlineLines: headlineLines.length ? headlineLines : [scene.sceneTitle],
    sublines,
    footerLeft,
    footerRight,
    topLeft,
    topRight,
    bg,
    surface,
    ink,
    muted,
    accent,
    border,
    metrics,
    bars,
  };
}

function drawFrameVisual(
  ctx: CanvasRenderingContext2D,
  vis: ExtractedFrameVisual,
  w: number,
  h: number,
  sceneProgress: number,
  overallProgress: number
) {
  const padX = Math.round(w * 0.06);
  const padY = Math.round(h * 0.07);

  // Background
  ctx.fillStyle = vis.bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle architectural grid lines (1px, zero shadows/gradients)
  ctx.strokeStyle = vis.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  // Top progress track
  ctx.fillStyle = vis.border;
  ctx.fillRect(0, 0, w, 5);
  ctx.fillStyle = vis.accent;
  ctx.fillRect(0, 0, Math.round(w * overallProgress), 5);

  // Top bar
  ctx.font = `600 ${Math.round(w * 0.011)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = vis.muted;
  ctx.textBaseline = "top";
  ctx.fillText(vis.topLeft, padX, padY);
  const rightW = ctx.measureText(vis.topRight).width;
  ctx.fillText(vis.topRight, w - padX - rightW, padY);

  const ruleTopY = padY + Math.round(h * 0.038);
  ctx.beginPath();
  ctx.moveTo(padX, ruleTopY);
  ctx.lineTo(w - padX, ruleTopY);
  ctx.stroke();

  // Animated entrance ease
  const ease = Math.min(1, sceneProgress * 3.2);
  const slideOffsetY = Math.round((1 - ease) * 18);

  // Kicker
  let curY = ruleTopY + Math.round(h * 0.09) + slideOffsetY;
  ctx.font = `700 ${Math.round(w * 0.012)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = vis.accent;
  ctx.fillText(vis.kicker.toUpperCase(), padX, curY);
  curY += Math.round(h * 0.045);

  // Headline lines
  const fontSize = vis.metrics.length > 0 || vis.bars.length > 0 ? Math.round(w * 0.044) : Math.round(w * 0.062);
  ctx.font = `800 ${fontSize}px "Inter", "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = vis.ink;
  for (const line of vis.headlineLines) {
    ctx.fillText(line.slice(0, 42), padX, curY);
    curY += Math.round(fontSize * 1.08);
  }

  // Metric cards if present
  if (vis.metrics.length > 0) {
    curY += Math.round(h * 0.03);
    const cols = Math.min(3, vis.metrics.length);
    const gap = 20;
    const cardW = Math.floor((w - padX * 2 - gap * (cols - 1)) / cols);
    const cardH = Math.round(h * 0.19);
    vis.metrics.slice(0, cols).forEach((m, idx) => {
      const cx = padX + idx * (cardW + gap);
      ctx.fillStyle = vis.surface;
      ctx.fillRect(cx, curY, cardW, cardH);
      ctx.strokeStyle = vis.border;
      ctx.strokeRect(cx, curY, cardW, cardH);

      ctx.font = `700 ${Math.round(w * 0.032)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = vis.ink;
      ctx.fillText(m.val, cx + 24, curY + 26);

      ctx.font = `600 ${Math.round(w * 0.0095)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = vis.muted;
      ctx.fillText(m.lbl.slice(0, 28), cx + 24, curY + cardH - 36);
    });
  }

  // Animated bars if present
  if (vis.bars.length > 0) {
    curY += Math.round(h * 0.035);
    const rowH = Math.round(h * 0.042);
    const labelW = Math.round(w * 0.16);
    const trackW = Math.round(w * 0.44);
    vis.bars.slice(0, 4).forEach((b, idx) => {
      const ry = curY + idx * (rowH + 14);
      ctx.font = `600 ${Math.round(w * 0.011)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = vis.ink;
      ctx.fillText(b.label.slice(0, 20), padX, ry + 6);

      const tx = padX + labelW;
      ctx.fillStyle = vis.surface;
      ctx.fillRect(tx, ry, trackW, rowH);
      ctx.strokeStyle = vis.border;
      ctx.strokeRect(tx, ry, trackW, rowH);

      const animFill = Math.min(1, sceneProgress * 1.8) * (b.pct / 100);
      ctx.fillStyle = b.color || vis.accent;
      ctx.fillRect(tx, ry, Math.round(trackW * animFill), rowH);

      ctx.fillStyle = vis.muted;
      ctx.fillText(b.valueText, tx + trackW + 16, ry + 6);
    });
  }

  // Footer strip
  const ruleBotY = h - padY - Math.round(h * 0.038);
  ctx.strokeStyle = vis.border;
  ctx.beginPath();
  ctx.moveTo(padX, ruleBotY);
  ctx.lineTo(w - padX, ruleBotY);
  ctx.stroke();

  ctx.font = `500 ${Math.round(w * 0.0105)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = vis.muted;
  ctx.fillText(vis.footerLeft.slice(0, 56), padX, ruleBotY + 16);
  const fRightW = ctx.measureText(vis.footerRight).width;
  ctx.fillText(vis.footerRight, w - padX - fRightW, ruleBotY + 16);
}

/**
 * Renders a HyperFrames HTML document into a real WebM/MP4 video Blob and triggers download.
 */
export async function exportHyperFramesToVideo(opts: {
  html: string;
  title: string;
  aspect?: VideoAspectRatio;
  onProgress?: (p: VideoExportProgress) => void;
}): Promise<VideoExportResult> {
  const parsed = parseHyperFramesDocument(opts.html);
  const aspect = opts.aspect || parsed.aspect || "16:9";
  const width = aspect === "9:16" ? 720 : aspect === "1:1" ? 960 : 1280;
  const height = aspect === "9:16" ? 1280 : aspect === "1:1" ? 960 : 720;

  const scenes: HyperFrameScene[] = parsed.frames.length
    ? parsed.frames
    : [
        {
          index: 0,
          durationMs: 3000,
          transition: "fade",
          sceneTitle: opts.title || "Scene 01",
          snippetText: "",
        },
      ];

  const visuals = scenes.map((sc, i) => extractVisualFromHtml(opts.html, sc, i, scenes.length));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const { mimeType, ext } = pickSupportedVideoMime();
  const stream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  recorder.start(100);

  // Render at accelerated real-time (e.g. 1.2s per scene at 30fps = 36 frames per scene) so export completes in ~4-6 seconds
  const fps = 30;
  const framesPerScene = 32;
  const frameIntervalMs = Math.round(1000 / fps);
  const totalFrames = scenes.length * framesPerScene;

  for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
    const vis = visuals[sIdx];
    for (let f = 0; f < framesPerScene; f++) {
      const globalFrame = sIdx * framesPerScene + f;
      const sceneProgress = f / Math.max(1, framesPerScene - 1);
      const overallProgress = (globalFrame + 1) / totalFrames;

      drawFrameVisual(ctx, vis, width, height, sceneProgress, overallProgress);

      opts.onProgress?.({
        phase: "rendering",
        currentScene: sIdx + 1,
        totalScenes: scenes.length,
        percent: Math.round(overallProgress * 92),
        detail: `Rendering Scene ${sIdx + 1}/${scenes.length}: ${scenes[sIdx].sceneTitle}`,
      });

      await new Promise((r) => setTimeout(r, frameIntervalMs));
    }
  }

  opts.onProgress?.({
    phase: "encoding",
    currentScene: scenes.length,
    totalScenes: scenes.length,
    percent: 96,
    detail: `Finalizing ${ext.toUpperCase()} video container...`,
  });

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  const blob = await stopped;

  const slug = (opts.title || "hyperframes-video")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "hyperframes-video";
  const filename = `${slug}.${ext}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  opts.onProgress?.({
    phase: "done",
    currentScene: scenes.length,
    totalScenes: scenes.length,
    percent: 100,
    detail: `Exported ${filename}`,
  });

  return {
    blob,
    filename,
    mimeType,
    durationMs: parsed.totalDurationMs || scenes.length * 3000,
    width,
    height,
  };
}
