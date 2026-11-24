// Zeus OpenDesign Engine — Ported from nexu-io/open-design
// Unifies Collaborative AI Design Studio, HyperFrames (Code-to-Video), Open-Slide (1920x1080 Decks),
// OpenMotion Templates, and Brand / DESIGN.md Systems with Zeus's 40 Free Keyless AI Providers.
// Enforces Zeus UI/UX laws everywhere: 0 box-shadows, 0 emojis, 0 ' LIVE ' badges, 0 blue/purple gradients.

export type OpenDesignCreationMode =
  | "prototype"
  | "hyperframes"
  | "deck"
  | "motion-design"
  | "brand-kit"
  | "code";

export type OpenDesignNavTab =
  | "home"
  | "studio"
  | "projects"
  | "design-systems"
  | "skills";

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";

export interface CreationModeSpec {
  id: OpenDesignCreationMode;
  label: string;
  shortLabel: string;
  icon: string;
  aspectHint: string;
  summary: string;
}

export const OPEN_DESIGN_MODES: CreationModeSpec[] = [
  {
    id: "prototype",
    label: "Interactive Prototype",
    shortLabel: "Prototype",
    icon: "web",
    aspectHint: "1440×900 / 390×844",
    summary: "Bespoke interactive web or mobile product experience with direct DOM editing.",
  },
  {
    id: "hyperframes",
    label: "HyperFrames Video (Code-to-Video)",
    shortLabel: "HyperFrames Video",
    icon: "movie",
    aspectHint: "1920×1080 (16:9) · 1080×1920 (9:16)",
    summary: "Multi-scene deterministic HTML/Canvas/SVG motion composition with timeline & WebM/MP4 export.",
  },
  {
    id: "deck",
    label: "Open-Slide 1920×1080 Deck",
    shortLabel: "Slides Deck",
    icon: "slideshow",
    aspectHint: "1920×1080 (16:9)",
    summary: "Locked 1920×1080 presentation deck with slide thumbnail rail, keyboard nav, and speaker notes.",
  },
  {
    id: "motion-design",
    label: "OpenMotion Kinetic Poster",
    shortLabel: "OpenMotion",
    icon: "animation",
    aspectHint: "1920×1080 / 1080×1350",
    summary: "Kinetic typography, data race charts, and brand launch animations.",
  },
  {
    id: "brand-kit",
    label: "Brand Identity & DESIGN.md",
    shortLabel: "Brand Kit",
    icon: "palette",
    aspectHint: "DESIGN.md + Specimen",
    summary: "Complete brand token system, typography scale, and interactive specimen sheet.",
  },
  {
    id: "code",
    label: "Zeus Harness² Code Agent",
    shortLabel: "Code Agent",
    icon: "terminal",
    aspectHint: "Local Project Workspace",
    summary: "Full software engineering agent with bash, python, file editing, and test verification.",
  },
];

/* ------------------------------------------------------------------ */
/* Brand & DESIGN.md Catalog (ported from open-design/design-systems) */
/* ------------------------------------------------------------------ */
export interface OpenDesignBrandSystem {
  id: string;
  name: string;
  domain: string;
  category: "software" | "finance" | "editorial" | "hardware" | "consumer" | "design-system";
  posture: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  border: string;
  displayFont: string;
  sansFont: string;
  monoFont: string;
  radius: string;
  designMd: string;
}

export const OPEN_DESIGN_BRANDS: OpenDesignBrandSystem[] = [
  {
    id: "m3-expressive",
    name: "Material 3 Expressive",
    domain: "m3.material.io",
    category: "design-system",
    posture: "Tonal surface hierarchy, crisp 1px borders, zero box-shadows, warm olive/terracotta/amber accents.",
    bg: "#121316",
    surface: "#1B1C20",
    ink: "#E4E2E6",
    muted: "#9E9DA4",
    accent: "#D97757",
    border: "#2E3036",
    displayFont: "'Plus Jakarta Sans', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "18px",
    designMd: `# DESIGN.md — Material 3 Expressive (Zeus Edition)
- Surfaces: bg #121316, surface-low #1B1C20, surface-high #25272C, ink #E4E2E6, muted #9E9DA4, accent #D97757
- Elevation: Strictly tonal surface steps + 1px solid #2E3036 borders. Zero box-shadow.
- Typography: Plus Jakarta Sans (Display 700), Inter (Body 400/500), JetBrains Mono (Code/Metrics).
- Rules: No emojis, no 'LIVE' badges, no blue/purple gradients, no helper taglines.`,
  },
  {
    id: "claude-warm",
    name: "Claude Warm Editorial",
    domain: "claude.ai",
    category: "editorial",
    posture: "Warm parchment & charcoal editorial craft with terracotta accent and literary serif headlines.",
    bg: "#191816",
    surface: "#23211E",
    ink: "#F2EFE9",
    muted: "#A6A096",
    accent: "#C96442",
    border: "#33302B",
    displayFont: "'Instrument Serif', Georgia, serif",
    sansFont: "'DM Sans', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "14px",
    designMd: `# DESIGN.md — Claude Warm Editorial
- Surfaces: bg #191816, surface #23211E, ink #F2EFE9, muted #A6A096, accent #C96442
- Typography: Instrument Serif (Display), DM Sans (UI/Body), JetBrains Mono (Data).
- Rules: Calm literary restraint, 1px warm borders (#33302B), zero box-shadows, zero gradients.`,
  },
  {
    id: "linear-precision",
    name: "Linear Precision Dark",
    domain: "linear.app",
    category: "software",
    posture: "High-density keyboard-first engineering workspace with crisp hairlines and tabular metrics.",
    bg: "#0B0C0E",
    surface: "#131519",
    ink: "#F4F5F8",
    muted: "#8A8F98",
    accent: "#E2B93B",
    border: "#22252B",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "8px",
    designMd: `# DESIGN.md — Linear Precision Dark
- Surfaces: bg #0B0C0E, surface #131519, ink #F4F5F8, muted #8A8F98, accent #E2B93B
- Grid: Tight 1px hairlines (#22252B), 8px radius, tabular monospace numerals, zero shadows.`,
  },
  {
    id: "stripe-financial",
    name: "Stripe Financial Ledger",
    domain: "stripe.com",
    category: "finance",
    posture: "Swiss financial clarity, asymmetric metric grids, razor-sharp hairlines, and high-contrast ink.",
    bg: "#F8F7F4",
    surface: "#FFFFFF",
    ink: "#111315",
    muted: "#5E646E",
    accent: "#0F766E",
    border: "#E2E0D8",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "10px",
    designMd: `# DESIGN.md — Stripe Financial Ledger
- Surfaces: bg #F8F7F4, surface #FFFFFF, ink #111315, muted #5E646E, accent #0F766E
- Layout: Swiss metric ledger, exposed 1px borders (#E2E0D8), tabular numbers, zero box-shadows.`,
  },
  {
    id: "vercel-geist",
    name: "Vercel Geist Monochrome",
    domain: "vercel.com",
    category: "software",
    posture: "Pure architectural monochrome grid with exposed 1px structural crosshairs and signal amber.",
    bg: "#000000",
    surface: "#0A0A0A",
    ink: "#EDEDED",
    muted: "#888888",
    accent: "#F59E0B",
    border: "#222222",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "6px",
    designMd: `# DESIGN.md — Vercel Geist Monochrome
- Surfaces: bg #000000, surface #0A0A0A, ink #EDEDED, muted #888888, accent #F59E0B
- Structure: Exposed 1px #222222 grid cells, zero shadows, monospace telemetry.`,
  },
  {
    id: "supabase-emerald",
    name: "Supabase Studio Dark",
    domain: "supabase.com",
    category: "software",
    posture: "Developer database & Postgres console aesthetic with carbon slate surfaces and emerald accent.",
    bg: "#121212",
    surface: "#1C1C1C",
    ink: "#EDEDED",
    muted: "#8E8E8E",
    accent: "#3ECF8E",
    border: "#2E2E2E",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "8px",
    designMd: `# DESIGN.md — Supabase Studio Dark
- Surfaces: bg #121212, surface #1C1C1C, ink #EDEDED, muted #8E8E8E, accent #3ECF8E
- Structure: Clean schema tables, monospace SQL/JSON inspection, 1px #2E2E2E borders.`,
  },
  {
    id: "apple-hig",
    name: "Apple HIG Precision",
    domain: "apple.com",
    category: "hardware",
    posture: "Balanced hardware-grade proportion, generous negative space, and crisp typographic hierarchy.",
    bg: "#000000",
    surface: "#141416",
    ink: "#F5F5F7",
    muted: "#86868B",
    accent: "#FF9F0A",
    border: "#2C2C2E",
    displayFont: "'Plus Jakarta Sans', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "16px",
    designMd: `# DESIGN.md — Apple HIG Precision
- Surfaces: bg #000000, surface #141416, ink #F5F5F7, muted #86868B, accent #FF9F0A
- Structure: Bento grid architecture, 16px squircle corners, 1px #2C2C2E hairlines.`,
  },
  {
    id: "teenage-eng",
    name: "Teenage Engineering Field",
    domain: "teenage.engineering",
    category: "hardware",
    posture: "Industrial instrument panel with anodized aluminum gray, technical callouts, and safety orange.",
    bg: "#E6E4E0",
    surface: "#F2F0EC",
    ink: "#141414",
    muted: "#686662",
    accent: "#FF5500",
    border: "#C8C5BE",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'DM Sans', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "4px",
    designMd: `# DESIGN.md — Teenage Engineering Field System
- Surfaces: bg #E6E4E0, surface #F2F0EC, ink #141414, muted #686662, accent #FF5500
- Structure: Technical instrument grid, uppercase monospace indices, 1px #C8C5BE rules.`,
  },
  {
    id: "porsche-editorial",
    name: "Porsche Weissach Editorial",
    domain: "porsche.com",
    category: "hardware",
    posture: "Automotive telemetry meets luxury editorial typography with racing signal red.",
    bg: "#0E0E10",
    surface: "#17171A",
    ink: "#F4F4F6",
    muted: "#8E8E96",
    accent: "#D5001C",
    border: "#2A2A30",
    displayFont: "'Fraunces', Georgia, serif",
    sansFont: "'Space Grotesk', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "6px",
    designMd: `# DESIGN.md — Porsche Weissach Editorial
- Surfaces: bg #0E0E10, surface #17171A, ink #F4F4F6, muted #8E8E96, accent #D5001C
- Structure: Wide-track editorial layout, precision gauges, 1px #2A2A30 borders.`,
  },
  {
    id: "cash-app-kinetic",
    name: "Cash App Kinetic Lime",
    domain: "cash.app",
    category: "finance",
    posture: "Bold neo-brutalist financial typography with carbon black canvas and electric lime accent.",
    bg: "#0A0B0A",
    surface: "#141714",
    ink: "#F5F7F5",
    muted: "#8A948A",
    accent: "#00D632",
    border: "#262B26",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'DM Sans', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "12px",
    designMd: `# DESIGN.md — Cash App Kinetic Lime
- Surfaces: bg #0A0B0A, surface #141714, ink #F5F7F5, muted #8A948A, accent #00D632
- Structure: Oversized display numerals, high-contrast cards, zero shadows.`,
  },
  {
    id: "open-slide-ash-lime",
    name: "Open-Slide Ash & Lime",
    domain: "open-design.ai",
    category: "editorial",
    posture: "Warm stone gallery paper with ink black typography and chartreuse highlight.",
    bg: "#F1EFEA",
    surface: "#FAF8F3",
    ink: "#161616",
    muted: "#66635B",
    accent: "#84CC16",
    border: "#D8D4CA",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "8px",
    designMd: `# DESIGN.md — Open-Slide Ash & Lime
- Surfaces: bg #F1EFEA, surface #FAF8F3, ink #161616, muted #66635B, accent #84CC16
- Structure: Locked 1920x1080 or editorial grid, single visual focal point per section.`,
  },
  {
    id: "swiss-international",
    name: "Swiss International Grid",
    domain: "open-design.ai",
    category: "editorial",
    posture: "Josef Müller-Brockmann mathematical grid, stark typographic scale, vermilion accent.",
    bg: "#F6F5F0",
    surface: "#FFFFFF",
    ink: "#111111",
    muted: "#555555",
    accent: "#E11D48",
    border: "#111111",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "0px",
    designMd: `# DESIGN.md — Swiss International Grid
- Surfaces: bg #F6F5F0, surface #FFFFFF, ink #111111, muted #555555, accent #E11D48
- Structure: Exposed 1px #111111 grid lines, 0px radius, asymmetric typographic hierarchy.`,
  },
];

export function getOpenDesignBrand(id?: string): OpenDesignBrandSystem {
  return OPEN_DESIGN_BRANDS.find((b) => b.id === id) ?? OPEN_DESIGN_BRANDS[0];
}

/* ------------------------------------------------------------------ */
/* Pre-Built Starter HTML Deliverables (HyperFrames, Deck, Prototype) */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Skills & OpenMotion Templates Catalog (ported from open-design)    */
/* ------------------------------------------------------------------ */
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
    prompt: "Create a 6-scene HyperFrames video composition (16:9 1920x1080) with <section class=\"frame\" data-duration=\"3000\" data-scene=\"...\"> scenes, a top progress bar, keyboard/message controls, and <!-- HYPERFRAMES_META: ... --> JSON metadata for a developer platform launch.",
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
    prompt: "Create a 5-scene HyperFrames video deck in Teenage Engineering industrial pixel/technical style with <section class=\"frame\" data-duration=\"2800\" data-scene=\"...\"> scenes, crisp 1px grid hairlines, tabular counters, and <!-- HYPERFRAMES_META: ... --> metadata.",
  },
  {
    id: "after-hours-editorial-template",
    name: "After-Hours Editorial Noir Video",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "porsche-editorial",
    summary: "Cinematic dark editorial chapter cards with high-contrast serif typography and telemetry callouts.",
    prompt: "Create a 5-scene HyperFrames dark editorial storyboard video with serif display headlines, chapter numbering, real telemetry data, and <section class=\"frame\" data-duration=\"3200\" data-scene=\"...\"> scenes.",
  },
  {
    id: "swiss-user-research-video-template",
    name: "Swiss Grid Data & Research Video",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "swiss-international",
    summary: "Josef Müller-Brockmann mathematical grid video with animated SVG bar charts and research findings.",
    prompt: "Create a 5-scene Swiss International Grid HyperFrames video presenting quantitative engineering research metrics with exposed 1px black grid lines, vermilion accent bars, and <section class=\"frame\" data-duration=\"3500\" data-scene=\"...\"> scenes.",
  },
  {
    id: "weread-year-in-review-video-template",
    name: "Vertical 9:16 Year-in-Review Story Video",
    category: "video",
    mode: "hyperframes",
    aspect: "9:16",
    brandId: "claude-warm",
    summary: "9:16 vertical mobile story video with warm paper texture, literary serif typography, and milestone cards.",
    prompt: "Create a 6-scene vertical 9:16 (1080x1920) HyperFrames Year-in-Review video with warm parchment surfaces, literary serif headlines, annual engineering stats, and <section class=\"frame\" data-duration=\"3000\" data-scene=\"...\"> scenes.",
  },
  {
    id: "hyperframes-data-bar-chart-race",
    name: "Kinetic Data Bar Chart Race Video",
    category: "motion",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "stripe-financial",
    summary: "NYT/Stripe-style animated bar & line chart comparison across 5 chronological frames.",
    prompt: "Create a 5-scene HyperFrames data infographic video showing AI model throughput and latency benchmarks across 5 eras with animated horizontal bars, tabular monospace numerals, and <section class=\"frame\" data-duration=\"3200\" data-scene=\"...\"> scenes.",
  },
  {
    id: "deck-open-slide-canvas",
    name: "Open-Slide 1920×1080 Free Canvas Deck",
    category: "slides",
    mode: "deck",
    aspect: "16:9",
    brandId: "open-slide-ash-lime",
    summary: "Locked 1920×1080 presentation deck with one visual focal point per slide and speaker notes.",
    prompt: "Create a 6-slide Open-Slide 1920x1080 presentation deck using <section class=\"slide\" data-slide-id=\"1\" data-title=\"...\" data-notes=\"...\"> sections. Enforce one visual hierarchy focal point per slide, zero scrollbars, keyboard navigation, and bottom № N/M numbering.",
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
    prompt: "Create a 6-slide Swiss International 1920x1080 presentation deck (<section class=\"slide\" data-slide-id=\"...\" data-title=\"...\" data-notes=\"...\">) with exposed 1px grid rules, oversized numerals, and real data tables.",
  },
  {
    id: "prototype-fintech-terminal",
    name: "Stripe / Linear Telemetry Workbench",
    category: "prototype",
    mode: "prototype",
    aspect: "16:9",
    brandId: "linear-precision",
    summary: "High-density interactive web application prototype with filterable ledger, inspector, and live charts.",
    prompt: "Build an interactive developer telemetry & deployment workbench prototype with working tab switching, filterable deployment ledger, live SVG latency sparklines, and detail drawer.",
  },
  {
    id: "brand-kit-specimen",
    name: "Brand Identity & DESIGN.md Specimen",
    category: "brand",
    mode: "brand-kit",
    aspect: "16:9",
    brandId: "m3-expressive",
    summary: "Complete brand system specimen with color swatches, type scale, component matrix, and DESIGN.md.",
    prompt: "Create an interactive Brand Identity & DESIGN.md Specimen page showcasing surface color tokens, typography scale, button/input/table component anatomy, and downloadable DESIGN.md guidelines.",
  },
];

/* ------------------------------------------------------------------ */
/* Parsers for HyperFrames Video & Open-Slide Decks                   */
/* ------------------------------------------------------------------ */
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

export function detectDeliverableKind(html: string): "hyperframes" | "deck" | "prototype" {
  if (!html) return "prototype";
  if (
    /HYPERFRAMES_META/i.test(html) ||
    /<section[^>]+class=["'][^"']*\bframe\b[^"']*["'][^>]*data-duration=/i.test(html) ||
    /data-duration=["']\d+["']/i.test(html)
  ) {
    return "hyperframes";
  }
  if (
    /<section[^>]+class=["'][^"']*\bslide\b/i.test(html) ||
    /data-slide-id=/i.test(html)
  ) {
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
    const cleanH1 = h1Match
      ? h1Match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "";
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

/* ------------------------------------------------------------------ */
/* OpenDesign Prompt Builder (Enforces Zeus UI/UX Laws + Deliverable) */
/* ------------------------------------------------------------------ */
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
    const dims = opts.aspect === "9:16" ? "1080×1920 (9:16 vertical)" : opts.aspect === "1:1" ? "1080×1080 (1:1 square)" : "1920×1080 (16:9 widescreen)";
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
    `## OpenDesign Deliverable Mode: Interactive Product Prototype`,
    brand.designMd,
    laws,
    `- Build a complete, interactive product prototype with real data, working view/tab state transitions, and bespoke layout architecture.`,
  ].join("\n\n");
}
