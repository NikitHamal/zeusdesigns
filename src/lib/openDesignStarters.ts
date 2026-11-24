// Pre-Built Starter HTML Deliverables & OpenDesign Skills Catalog
// Extracted from openDesign.ts to keep modules under 750 lines.

import type { OpenDesignCreationMode, VideoAspectRatio } from "./openDesign";

export const STARTER_HYPERFRAMES_VIDEO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>HyperFrames · Zeus OpenDesign Launch Reel</title>
<style>
  :root {
    --bg: #0B0C0E;
    --surface: #14161A;
    --ink: #F4F5F8;
    --muted: #8A8F98;
    --accent: #E9B94A;
    --accent2: #D97757;
    --border: #24272E;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .progress-track {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--border);
    z-index: 60;
  }
  .progress-bar {
    height: 100%;
    width: 0%;
    background: var(--accent);
    transition: width 0.12s linear;
  }
  .frame {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 88px;
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
    border: 1px solid var(--border);
  }
  .frame.active {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    letter-spacing: 0.14em;
    color: var(--muted);
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    padding-bottom: 20px;
  }
  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 28px;
  }
  .kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--accent);
  }
  h1 {
    font-size: clamp(56px, 7.5vw, 118px);
    font-weight: 800;
    line-height: 0.94;
    letter-spacing: -0.04em;
    margin: 0;
  }
  .accent-italic {
    font-family: Georgia, serif;
    font-style: italic;
    font-weight: 400;
    color: var(--accent);
  }
  .accent-terra {
    color: var(--accent2);
  }
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 16px;
  }
  .metric-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px;
  }
  .metric-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 54px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.03em;
  }
  .metric-lbl {
    margin-top: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 820px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 180px 1fr 90px;
    align-items: center;
    gap: 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
  }
  .bar-track {
    height: 28px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
  }
  .footer-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--border);
    padding-top: 20px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--muted);
  }
</style>
</head>
<body>
<div class="progress-track"><div class="progress-bar" id="progress"></div></div>

<section class="frame active" data-duration="3000" data-scene="Hook: One Brief, Every Deliverable">
  <div class="top-bar">
    <span>FRAME 01 / 05 · HOOK</span>
    <span>ZEUS OPENDESIGN · HYPERFRAMES 60FPS</span>
  </div>
  <div class="stage">
    <div class="kicker">01 · PARADIGM SHIFT</div>
    <h1>One brief.<br/><span class="accent-italic">Every</span> deliverable.</h1>
  </div>
  <div class="footer-strip">
    <span>PROTOTYPE · SLIDE DECK · HYPERFRAMES VIDEO · DESIGN.MD</span>
    <span>1920×1080 · DETERMINISTIC TIMELINE</span>
  </div>
</section>

<section class="frame" data-duration="3500" data-scene="Metrics: 40 Free Keyless Providers & Sub-17MB RAM">
  <div class="top-bar">
    <span>FRAME 02 / 05 · TELEMETRY</span>
    <span>NATIVE RUST + C++20 ENGINE</span>
  </div>
  <div class="stage">
    <div class="kicker">02 · ZERO-LIMIT ENGINE</div>
    <h1 style="font-size: clamp(44px, 5.5vw, 84px)">40 Free Providers.<br/><span class="accent-terra">Under 17 MB</span> physical RAM.</h1>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-val">2,000+</div>
        <div class="metric-lbl">TOK/S MERCURY 3 DIFFUSION</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">40</div>
        <div class="metric-lbl">KEYLESS AI PROVIDERS</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">&lt;17MB</div>
        <div class="metric-lbl">WIN32 WORKING SET</div>
      </div>
    </div>
  </div>
  <div class="footer-strip">
    <span>MERCURY 3 · GPT-6 LUNA · GLM-5.3 · K2-HORIZON · QWEN 3.8</span>
    <span>0 API KEYS REQUIRED</span>
  </div>
</section>

<section class="frame" data-duration="3500" data-scene="Benchmark: Code-to-Video Throughput Comparison">
  <div class="top-bar">
    <span>FRAME 03 / 05 · BENCHMARK</span>
    <span>CODE-TO-VIDEO PIPELINE</span>
  </div>
  <div class="stage">
    <div class="kicker">03 · VELOCITY</div>
    <h1 style="font-size: clamp(42px, 5vw, 76px)">HTML + CSS + Canvas<br/>directly to <span class="accent-italic">MP4 / WebM</span>.</h1>
    <div class="bars">
      <div class="bar-row">
        <span>Zeus HyperFrames</span>
        <div class="bar-track"><div class="bar-fill" style="width: 96%"></div></div>
        <span>60 FPS</span>
      </div>
      <div class="bar-row">
        <span>Open-Slide 1920</span>
        <div class="bar-track"><div class="bar-fill" style="width: 88%; background: #D97757"></div></div>
        <span>100% FIT</span>
      </div>
      <div class="bar-row">
        <span>Harness² Benchmark</span>
        <div class="bar-track"><div class="bar-fill" style="width: 100%; background: #3ECF8E"></div></div>
        <span>7 / 7 PASS</span>
      </div>
    </div>
  </div>
  <div class="footer-strip">
    <span>DETERMINISTIC SCENE STEPPING</span>
    <span>INSTANT VIDEO RECORDER</span>
  </div>
</section>

<section class="frame" data-duration="3000" data-scene="Brand Systems: 12 Curated DESIGN.md Kits">
  <div class="top-bar">
    <span>FRAME 04 / 05 · DESIGN SYSTEMS</span>
    <span>DESIGN.MD SPECIFICATION</span>
  </div>
  <div class="stage">
    <div class="kicker">04 · BRAND PRECISION</div>
    <h1>Material 3. Linear.<br/>Stripe. <span class="accent-italic">Porsche</span>.</h1>
  </div>
  <div class="footer-strip">
    <span>ZERO BOX-SHADOWS · ZERO EMOJIS · ZERO GRADIENTS</span>
    <span>CRISP 1PX ARCHITECTURAL BORDERS</span>
  </div>
</section>

<section class="frame" data-duration="3000" data-scene="Outro: Ship in Zeus OpenDesign Studio">
  <div class="top-bar">
    <span>FRAME 05 / 05 · OUTRO</span>
    <span>ZEUS OPENDESIGN STUDIO</span>
  </div>
  <div class="stage">
    <div class="kicker">05 · READY TO EXPORT</div>
    <h1>Prompt. Scrub.<br/><span class="accent-terra">Export Video</span>.</h1>
  </div>
  <div class="footer-strip">
    <span>GITHUB.COM/NIKITHAMAL/ZEUSDESIGNS</span>
    <span>BRANCH: OPEN-DESIGN</span>
  </div>
</section>

<!-- HYPERFRAMES_META: {"aspect":"16:9","width":1920,"height":1080,"frames":[
  {"i":1,"duration":3000,"transition":"fade","scene":"Hook: One Brief, Every Deliverable"},
  {"i":2,"duration":3500,"transition":"fade","scene":"Metrics: 40 Free Keyless Providers & Sub-17MB RAM"},
  {"i":3,"duration":3500,"transition":"fade","scene":"Benchmark: Code-to-Video Throughput Comparison"},
  {"i":4,"duration":3000,"transition":"fade","scene":"Brand Systems: 12 Curated DESIGN.md Kits"},
  {"i":5,"duration":3000,"transition":"fade","scene":"Outro: Ship in Zeus OpenDesign Studio"}
]} -->

<script>
const frames = Array.from(document.querySelectorAll('.frame'));
const total = frames.length;
const progress = document.getElementById('progress');
let i = 0;
let playing = true;
let frameStart = Date.now();
let timer;

function show(n) {
  i = ((n % total) + total) % total;
  frames.forEach((f, k) => f.classList.toggle('active', k === i));
  frameStart = Date.now();
  window.parent.postMessage({ type: 'zeus:hyperframes-state', frameIndex: i, totalFrames: total, playing }, '*');
  if (playing) schedule();
}
function schedule() {
  clearTimeout(timer);
  const d = Number(frames[i]?.dataset.duration) || 3000;
  timer = setTimeout(() => show(i + 1), d);
}
function tick() {
  const d = Number(frames[i]?.dataset.duration) || 3000;
  const pct = playing ? Math.min(1, (Date.now() - frameStart) / d) * 100 : ((i + 1) / total) * 100;
  if (progress) progress.style.width = pct + '%';
  requestAnimationFrame(tick);
}
window.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'zeus:hyperframes-goto' && typeof msg.index === 'number') {
    playing = Boolean(msg.playing);
    clearTimeout(timer);
    show(msg.index);
  } else if (msg.type === 'zeus:hyperframes-toggle') {
    playing = typeof msg.playing === 'boolean' ? msg.playing : !playing;
    if (playing) { frameStart = Date.now(); schedule(); } else clearTimeout(timer);
    window.parent.postMessage({ type: 'zeus:hyperframes-state', frameIndex: i, totalFrames: total, playing }, '*');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') show(i + 1);
  else if (e.key === 'ArrowLeft') show(i - 1);
  else if (e.key === ' ') {
    e.preventDefault();
    playing = !playing;
    if (playing) { frameStart = Date.now(); schedule(); } else clearTimeout(timer);
  }
});
show(0);
tick();
</script>
</body>
</html>`;

export const STARTER_OPEN_SLIDE_DECK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Open-Slide 1920 · Product Architecture Deck</title>
<style>
  :root {
    --bg: #F1EFEA;
    --surface: #FAF8F3;
    --ink: #161616;
    --muted: #66635B;
    --accent: #C96442;
    --border: #D8D4CA;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: var(--bg);
    color: var(--ink);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
  }
  .slide {
    position: fixed;
    inset: 0;
    display: none;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 96px;
    background: var(--bg);
  }
  .slide.active {
    display: flex;
  }
  .slide-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 18px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    letter-spacing: 0.14em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .slide-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .slide-title {
    font-size: clamp(48px, 6.5vw, 96px);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 0.96;
    margin: 0 0 24px 0;
  }
  .cols-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-top: 20px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
  }
  .card-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 42px;
    font-weight: 700;
    color: var(--accent);
  }
  .card-title {
    font-size: 20px;
    font-weight: 700;
    margin-top: 12px;
  }
  .card-body {
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
    margin-top: 8px;
  }
  .slide-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--border);
    padding-top: 18px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--muted);
  }
</style>
</head>
<body>
<section class="slide active" data-slide-id="1" data-title="01 · Cover: Zeus OpenDesign Architecture" data-notes="Introduce the unified design + code-to-video workspace running under 17MB RAM.">
  <div class="slide-header">
    <span>ZEUS OPENDESIGN · OPEN-SLIDE 1920×1080</span>
    <span>SECTION 01</span>
  </div>
  <div class="slide-body">
    <h1 class="slide-title">Design Systems,<br/>Prototypes &amp; <span style="color:var(--accent)">HyperFrames</span>.</h1>
  </div>
  <div class="slide-footer">
    <span>ZEUS OPENDESIGN DECK</span>
    <span>№ 01 / 04</span>
  </div>
</section>

<section class="slide" data-slide-id="2" data-title="02 · Three Core Studio Surfaces" data-notes="Walk through Prototype Studio, HyperFrames Code-to-Video, and Open-Slide Decks.">
  <div class="slide-header">
    <span>CORE DELIVERABLES</span>
    <span>SECTION 02</span>
  </div>
  <div class="slide-body">
    <h1 class="slide-title" style="font-size: clamp(36px, 4.5vw, 68px)">Three Native Studio Engines</h1>
    <div class="cols-3">
      <div class="card">
        <div class="card-num">01</div>
        <div class="card-title">Interactive Prototypes</div>
        <div class="card-body">Direct DOM element inspection, token editing, and multi-device viewports.</div>
      </div>
      <div class="card">
        <div class="card-num">02</div>
        <div class="card-title">HyperFrames Video</div>
        <div class="card-body">Deterministic multi-scene HTML-to-video timeline with WebM/MP4 capture.</div>
      </div>
      <div class="card">
        <div class="card-num">03</div>
        <div class="card-title">Open-Slide 1920 Decks</div>
        <div class="card-body">Locked 16:9 presentation stage with slide thumbnail rail and speaker notes.</div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>ZEUS OPENDESIGN DECK</span>
    <span>№ 02 / 04</span>
  </div>
</section>

<section class="slide" data-slide-id="3" data-title="03 · Keyless AI Provider Throughput" data-notes="Highlight Mercury 3 diffusion speed and zero API key configuration.">
  <div class="slide-header">
    <span>PROVIDER MATRIX</span>
    <span>SECTION 03</span>
  </div>
  <div class="slide-body">
    <h1 class="slide-title">2,000+ tok/s<br/><span style="color:var(--accent)">Zero API Keys</span>.</h1>
  </div>
  <div class="slide-footer">
    <span>40 FREE KEYLESS PROVIDERS BUILT IN</span>
    <span>№ 03 / 04</span>
  </div>
</section>

<section class="slide" data-slide-id="4" data-title="04 · Direct Export & Handoff" data-notes="Close with HTML, WebM/MP4 video, and DESIGN.md project handoff.">
  <div class="slide-header">
    <span>PRODUCTION HANDOFF</span>
    <span>SECTION 04</span>
  </div>
  <div class="slide-body">
    <h1 class="slide-title">Export HTML, Video,<br/>or <span style="color:var(--accent)">DESIGN.md</span>.</h1>
  </div>
  <div class="slide-footer">
    <span>ZEUS OPENDESIGN DECK</span>
    <span>№ 04 / 04</span>
  </div>
</section>

<script>
const slides = Array.from(document.querySelectorAll('.slide'));
let idx = 0;
function showSlide(n) {
  idx = ((n % slides.length) + slides.length) % slides.length;
  slides.forEach((s, k) => s.classList.toggle('active', k === idx));
  window.parent.postMessage({ type: 'zeus:slide-state', slideIndex: idx, totalSlides: slides.length }, '*');
}
window.addEventListener('message', (ev) => {
  if (ev.data && ev.data.type === 'zeus:slide-goto' && typeof ev.data.index === 'number') {
    showSlide(ev.data.index);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown') showSlide(idx + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') showSlide(idx - 1);
});
showSlide(0);
</script>
</body>
</html>`;

export interface OpenDesignSkillTemplate {
  id: string;
  name: string;
  category: "video" | "slides" | "prototype" | "motion" | "brand";
  mode: OpenDesignCreationMode;
  aspect: VideoAspectRatio;
  brandId: string;
  summary: string;
  prompt: string;
  starterHtml?: string;
}

export const OPEN_DESIGN_SKILLS_CATALOG: OpenDesignSkillTemplate[] = [
  {
    id: "video-hyperframes",
    name: "HyperFrames Continuous Frame Video",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "linear-precision",
    summary: "6–8 scene continuous HTML-to-video animation with progress bar, scene metadata, and WebM/MP4 export.",
    prompt:
      'Create a 6-scene HyperFrames video composition (16:9 1920x1080) with <section class="frame" data-duration="3000" data-scene="..."> scenes, a top progress bar, keyboard/message controls, and <!-- HYPERFRAMES_META: ... --> JSON metadata for a developer platform launch.',
    starterHtml: STARTER_HYPERFRAMES_VIDEO_HTML,
  },
  {
    id: "8-bit-orbit-video-template",
    name: "8-Bit Orbit Retro Pixel Video Deck",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "teenage-eng",
    summary: "Deterministic multi-scene pixel & technical instrument motion composition with <3s scene holds.",
    prompt:
      'Create a 5-scene HyperFrames video deck in Teenage Engineering industrial pixel/technical style with <section class="frame" data-duration="2800" data-scene="..."> scenes, crisp 1px grid hairlines, tabular counters, and <!-- HYPERFRAMES_META: ... --> metadata.',
  },
  {
    id: "after-hours-editorial-template",
    name: "After-Hours Editorial Noir Video",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "porsche-editorial",
    summary: "Cinematic dark editorial chapter cards with high-contrast serif typography and telemetry callouts.",
    prompt:
      'Create a 5-scene HyperFrames dark editorial storyboard video with serif display headlines, chapter numbering, real telemetry data, and <section class="frame" data-duration="3200" data-scene="..."> scenes.',
  },
  {
    id: "swiss-user-research-video-template",
    name: "Swiss Grid Data & Research Video",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "swiss-international",
    summary: "Josef Müller-Brockmann mathematical grid video with animated SVG bar charts and research findings.",
    prompt:
      'Create a 5-scene Swiss International Grid HyperFrames video presenting quantitative engineering research metrics with exposed 1px black grid lines, vermilion accent bars, and <section class="frame" data-duration="3500" data-scene="..."> scenes.',
  },
  {
    id: "weread-year-in-review-video-template",
    name: "Vertical 9:16 Year-in-Review Story Video",
    category: "video",
    mode: "hyperframes",
    aspect: "9:16",
    brandId: "claude-warm",
    summary: "9:16 vertical mobile story video with warm paper texture, literary serif typography, and milestone cards.",
    prompt:
      'Create a 6-scene vertical 9:16 (1080x1920) HyperFrames Year-in-Review video with warm parchment surfaces, literary serif headlines, annual engineering stats, and <section class="frame" data-duration="3000" data-scene="..."> scenes.',
  },
  {
    id: "hyperframes-data-bar-chart-race",
    name: "Kinetic Data Bar Chart Race Video",
    category: "motion",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "stripe-financial",
    summary: "NYT/Stripe-style animated bar & line chart comparison across 5 chronological frames.",
    prompt:
      'Create a 5-scene HyperFrames data infographic video showing AI model throughput and latency benchmarks across 5 eras with animated horizontal bars, tabular monospace numerals, and <section class="frame" data-duration="3200" data-scene="..."> scenes.',
  },
  {
    id: "deck-open-slide-canvas",
    name: "Open-Slide 1920×1080 Free Canvas Deck",
    category: "slides",
    mode: "deck",
    aspect: "16:9",
    brandId: "open-slide-ash-lime",
    summary: "Locked 1920×1080 presentation deck with one visual focal point per slide and speaker notes.",
    prompt:
      'Create a 6-slide Open-Slide 1920x1080 presentation deck using <section class="slide" data-slide-id="1" data-title="..." data-notes="..."> sections. Enforce one visual hierarchy focal point per slide, zero scrollbars, keyboard navigation, and bottom № N/M numbering.',
    starterHtml: STARTER_OPEN_SLIDE_DECK_HTML,
  },
  {
    id: "deck-swiss-international",
    name: "Swiss International Typographic Deck",
    category: "slides",
    mode: "deck",
    aspect: "16:9",
    brandId: "swiss-international",
    summary: "Exposed 1px architectural grid presentation deck with bold asymmetric typography.",
    prompt:
      'Create a 6-slide Swiss International 1920x1080 presentation deck (<section class="slide" data-slide-id="..." data-title="..." data-notes="...">) with exposed 1px grid rules, oversized numerals, and real data tables.',
  },
  {
    id: "prototype-fintech-terminal",
    name: "Stripe / Linear Telemetry Workbench",
    category: "prototype",
    mode: "prototype",
    aspect: "16:9",
    brandId: "linear-precision",
    summary: "High-density interactive web application prototype with filterable ledger, inspector, and live charts.",
    prompt:
      "Build an interactive developer telemetry & deployment workbench prototype with working tab switching, filterable deployment ledger, live SVG latency sparklines, and detail drawer.",
  },
  {
    id: "brand-kit-specimen",
    name: "Brand Identity & DESIGN.md Specimen",
    category: "brand",
    mode: "brand-kit",
    aspect: "16:9",
    brandId: "m3-expressive",
    summary: "Complete brand system specimen with color swatches, type scale, component matrix, and DESIGN.md.",
    prompt:
      "Create an interactive Brand Identity & DESIGN.md Specimen page showcasing surface color tokens, typography scale, button/input/table component anatomy, and downloadable DESIGN.md guidelines.",
  },
  {
    id: "hyperframes-saas-product-promo-30s",
    name: "HyperFrames 30s SaaS Product Promo (Linear-Style)",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "linear-precision",
    summary: "4-scene 30-second product launch film: Hook quote, stacked problem cards, UI showcase, and wordmark outro.",
    prompt:
      "Build a 5-scene 30-second HyperFrames SaaS product promo video (1920x1080) modelled on Linear product films: Scene 1 Hook headline, Scene 2 Problem user pull-quotes, Scene 3 Interactive UI workbench reveal, Scene 4 Latency & throughput benchmark bars, Scene 5 Wordmark & CTA outro with <!-- HYPERFRAMES_META: ... -->.",
  },
  {
    id: "hyperframes-app-showcase-three-phones",
    name: "HyperFrames Three-Device Mobile Showcase",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "apple-hig",
    summary: "Synchronized 3-phone mobile product choreography with feature callout pills and metric counters.",
    prompt:
      "Create a 5-scene HyperFrames mobile product showcase video (1920x1080) featuring three synchronized phone frames, staggered feature pills, and tabular telemetry counters.",
  },
  {
    id: "hyperframes-brand-sizzle-reel",
    name: "HyperFrames Kinetic Brand Sizzle Reel",
    category: "motion",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "cash-app-kinetic",
    summary: "Paula Scher-inspired maximalist kinetic typography reel with rapid 2.5s scene cuts and high-contrast type.",
    prompt:
      "Create a 6-scene HyperFrames kinetic brand sizzle reel with oversized 120px display typography filling 75% of the frame, rapid 2500ms scene cadence, and high-contrast carbon/lime palette.",
  },
  {
    id: "motion-frames-kinetic-globe",
    name: "Motion-Frames Wireframe Globe & Rotating Type Ring",
    category: "motion",
    mode: "motion-design",
    aspect: "16:9",
    brandId: "claude-warm",
    summary: "Full-bleed looping CSS/SVG kinetic poster with concentric rotating rings, wireframe globe, and serif headline.",
    prompt:
      "Design a full-bleed 16:9 Motion-Frames kinetic poster with 3 concentric rotating SVG rings, a central wireframe technical globe, multilingual ring tokens, corner telemetry stamps, and an Instrument Serif headline.",
  },
  {
    id: "deck-guizang-editorial",
    name: "Guizang Literary Magazine 1920×1080 Deck",
    category: "slides",
    mode: "deck",
    aspect: "16:9",
    brandId: "claude-warm",
    summary: "Editorial magazine presentation deck with serif chapter openers, pull quotes, and structured essays.",
    prompt:
      'Create a 6-slide Guizang Editorial 1920x1080 presentation deck (<section class="slide" data-slide-id="1" data-title="..." data-notes="...">) with warm parchment surfaces, literary serif headlines, and structured comparison columns.',
  },
];
