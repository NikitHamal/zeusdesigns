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
  {
    id: "clickhouse-telemetry",
    name: "ClickHouse Analytical Slate",
    domain: "clickhouse.com",
    category: "software",
    posture: "Real-time OLAP database console with carbon-black tables and high-visibility signal yellow.",
    bg: "#0D0D0D",
    surface: "#161618",
    ink: "#F5F5F7",
    muted: "#8C8C94",
    accent: "#FAFF69",
    border: "#28282C",
    displayFont: "'Space Grotesk', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "6px",
    designMd: `# DESIGN.md — ClickHouse Analytical Slate
- Surfaces: bg #0D0D0D, surface #161618, ink #F5F5F7, muted #8C8C94, accent #FAFF69
- Structure: Sub-millisecond query telemetry tables, tabular-nums, 1px #28282C borders, zero shadows.`,
  },
  {
    id: "cloudflare-kumo",
    name: "Cloudflare Kumo Infrastructure",
    domain: "cloudflare.com",
    category: "software",
    posture: "Global edge network operations center with warm stone light mode and signal amber-orange.",
    bg: "#FAF9F6",
    surface: "#FFFFFF",
    ink: "#191919",
    muted: "#636363",
    accent: "#F6821F",
    border: "#E0DDD5",
    displayFont: "'Plus Jakarta Sans', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "8px",
    designMd: `# DESIGN.md — Cloudflare Kumo Infrastructure
- Surfaces: bg #FAF9F6, surface #FFFFFF, ink #191919, muted #636363, accent #F6821F
- Structure: Edge PoP status matrices, throughput sparklines, 1px #E0DDD5 borders, zero shadows.`,
  },
  {
    id: "figma-studio",
    name: "Figma Multiplayer Studio",
    domain: "figma.com",
    category: "design-system",
    posture: "Precision canvas workbench with dark graphite toolbars, crisp property rows, and coral accent.",
    bg: "#1E1E1E",
    surface: "#2C2C2C",
    ink: "#F5F5F5",
    muted: "#A3A3A3",
    accent: "#F24E1E",
    border: "#383838",
    displayFont: "'Plus Jakarta Sans', sans-serif",
    sansFont: "'Inter', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "8px",
    designMd: `# DESIGN.md — Figma Multiplayer Studio
- Surfaces: bg #1E1E1E, surface #2C2C2C, ink #F5F5F5, muted #A3A3A3, accent #F24E1E
- Structure: 240px inspector rails, 28px compact token inputs, 1px #383838 dividers, zero shadows.`,
  },
  {
    id: "airbnb-editorial",
    name: "Airbnb Belo Editorial",
    domain: "airbnb.com",
    category: "consumer",
    posture: "Warm architectural hospitality showcase with generous spacing, serif titles, and Rausch coral.",
    bg: "#FAF8F5",
    surface: "#FFFFFF",
    ink: "#222222",
    muted: "#6A6A6A",
    accent: "#FF385C",
    border: "#E4E0D8",
    displayFont: "'Fraunces', Georgia, serif",
    sansFont: "'Plus Jakarta Sans', sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    radius: "16px",
    designMd: `# DESIGN.md — Airbnb Belo Editorial
- Surfaces: bg #FAF8F5, surface #FFFFFF, ink #222222, muted #6A6A6A, accent #FF385C
- Structure: Architectural photography frames, 1px #E4E0D8 borders, zero box-shadows.`,
  },
];

export function getOpenDesignBrand(id?: string): OpenDesignBrandSystem {
  return OPEN_DESIGN_BRANDS.find((b) => b.id === id) ?? OPEN_DESIGN_BRANDS[0];
}

/* ------------------------------------------------------------------ */
/* HyperFrames Visual Style Library (ported from visual-styles.md)    */
/* ------------------------------------------------------------------ */
export interface HyperFramesVisualStyle {
  id: string;
  name: string;
  tradition: string;
  mood: string;
  bestFor: string;
  primaryTransition: string;
  gsapEase: string;
  bg: string;
  ink: string;
  accent: string;
  promptRule: string;
}

export const HYPERFRAMES_VISUAL_STYLES: HyperFramesVisualStyle[] = [
  {
    id: "swiss-pulse",
    name: "Swiss Pulse",
    tradition: "Josef Müller-Brockmann",
    mood: "Clinical, precise",
    bestFor: "SaaS dashboards, developer tools, APIs, metrics",
    primaryTransition: "Geometric Iris / Hard Cut",
    gsapEase: "expo.out",
    bg: "#121316",
    ink: "#F4F5F8",
    accent: "#FFB300",
    promptRule: "Grid-locked 12-column composition. Numbers dominate the frame at 80-120px with tabular-nums. Fast snapping entries.",
  },
  {
    id: "velvet-standard",
    name: "Velvet Standard",
    tradition: "Massimo Vignelli",
    mood: "Premium, timeless",
    bestFor: "Enterprise software, keynotes, investor decks",
    primaryTransition: "Cross-Fade Wipe",
    gsapEase: "sine.inOut",
    bg: "#0D0D0F",
    ink: "#F5F3EE",
    accent: "#C9A84C",
    promptRule: "Generous negative space, thin ALL CAPS labels with 0.15em letter-spacing, sequential reveals with deliberate holds.",
  },
  {
    id: "deconstructed",
    name: "Deconstructed Industrial",
    tradition: "Neville Brody",
    mood: "Industrial, raw",
    bestFor: "Developer launches, security products, deep-tech reveals",
    primaryTransition: "Whip Cut",
    gsapEase: "back.out(2.0)",
    bg: "#161616",
    ink: "#F0F0F0",
    accent: "#D4501E",
    promptRule: "Dark carbon #161616 + rust orange #D4501E. Exposed technical hairlines, bold industrial weight, high-velocity text slams.",
  },
  {
    id: "maximalist-type",
    name: "Maximalist Type",
    tradition: "Paula Scher",
    mood: "Loud, kinetic",
    bestFor: "Product launches, milestone announcements, hype reels",
    primaryTransition: "Hard Cut",
    gsapEase: "expo.out",
    bg: "#0A0A0A",
    ink: "#FFFFFF",
    accent: "#FFD60A",
    promptRule: "Typography IS the visual—filling 65-80% of the frame with extreme scale contrast and rapid 2.5s scene cadence.",
  },
  {
    id: "data-drift",
    name: "Data Drift Telemetry",
    tradition: "Edward Tufte",
    mood: "Analytical, high-density",
    bestFor: "AI benchmarks, quantitative research, financial ledgers",
    primaryTransition: "Horizontal Wipe",
    gsapEase: "power3.out",
    bg: "#F5EFE4",
    ink: "#161312",
    accent: "#B14A2C",
    promptRule: "Warm editorial paper #F5EFE4, ink #161312, rust accent #B14A2C on the leading bar/metric only, hairline rules.",
  },
  {
    id: "soft-signal",
    name: "Soft Signal Editorial",
    tradition: "Kinfolk / Literary Press",
    mood: "Intimate, warm",
    bestFor: "Brand stories, case studies, annual reviews",
    primaryTransition: "Dissolve",
    gsapEase: "power2.out",
    bg: "#191816",
    ink: "#F2EFE9",
    accent: "#C96442",
    promptRule: "Literary serif display headlines paired with clean sans data labels and warm terracotta accents.",
  },
  {
    id: "editorial-grid",
    name: "Editorial Newspaper Grid",
    tradition: "Swiss International Broadsheet",
    mood: "Authoritative, structured",
    bestFor: "Research reports, benchmark announcements, engineering deep-dives",
    primaryTransition: "Column Wipe",
    gsapEase: "power3.inOut",
    bg: "#F4F1EA",
    ink: "#141413",
    accent: "#9E2A2B",
    promptRule: "Exposed 1px rules dividing multi-column cells, serif headlines, monospace index numbers, zero shadows.",
  },
];

export interface HyperFramesPaletteSpec {
  id: string;
  name: string;
  bg: string;
  surface: string;
  ink: string;
  accent: string;
  secondary: string;
  mood: string;
}

export const HYPERFRAMES_PALETTES: HyperFramesPaletteSpec[] = [
  { id: "warm-editorial", name: "Warm Editorial", bg: "#FFF5E8", surface: "#F4E7D5", ink: "#1A1410", accent: "#FF5E3A", secondary: "#2BBAB2", mood: "Warm parchment canvas with vermilion and teal accents." },
  { id: "dark-premium", name: "Dark Premium", bg: "#0B0C0E", surface: "#15171C", ink: "#F4F5F8", accent: "#E2B93B", secondary: "#10B981", mood: "Obsidian broadcast studio with gold and emerald data accents." },
  { id: "bold-energetic", name: "Bold Energetic", bg: "#111214", surface: "#1D1F24", ink: "#FFFFFF", accent: "#FF4D2D", secondary: "#FACC15", mood: "High-impact kinetic launch palette with vermilion and signal yellow." },
  { id: "clean-corporate", name: "Clean Corporate", bg: "#F7F8FA", surface: "#FFFFFF", ink: "#0F172A", accent: "#0F766E", secondary: "#D97706", mood: "Crisp Swiss daylight ledger with deep teal and amber highlights." },
  { id: "monochrome", name: "Pure Monochrome", bg: "#09090B", surface: "#141417", ink: "#FAFAFA", accent: "#E4E4E7", secondary: "#71717A", mood: "Stark architectural black-and-white grid with exposed hairlines." },
  { id: "nature-earth", name: "Nature Earth", bg: "#141814", surface: "#1E241E", ink: "#ECEFE9", accent: "#84CC16", secondary: "#D97757", mood: "Deep botanical moss with terracotta and botanical lime." },
  { id: "jewel-rich", name: "Jewel Rich", bg: "#121016", surface: "#1C1922", ink: "#F5F2EB", accent: "#E11D48", secondary: "#F59E0B", mood: "Editorial crimson and warm gold on deep charcoal." },
  { id: "pastel-soft", name: "Daylight Soft", bg: "#FAF7F2", surface: "#F0ECE1", ink: "#1F1E1B", accent: "#C85A32", secondary: "#2A7B6F", mood: "Soft daylight paper with warm sienna and muted sage." },
  { id: "neon-electric", name: "Terminal Signal", bg: "#07090B", surface: "#0E1317", ink: "#E6F4F1", accent: "#10B981", secondary: "#F59E0B", mood: "High-frequency telemetry phosphor green and amber on carbon." },
];

export interface HyperFramesPromptTemplate {
  id: string;
  title: string;
  category: "Product" | "Data" | "Brand" | "Canvas" | "Social";
  aspect: VideoAspectRatio;
  durationSec: number;
  summary: string;
  prompt: string;
}

export const HYPERFRAMES_PROMPT_TEMPLATES: HyperFramesPromptTemplate[] = [
  {
    id: "hyperframes-app-showcase-three-phones",
    title: "12s App Showcase — Three Floating Phones",
    category: "Product",
    aspect: "16:9",
    durationSec: 12,
    summary: "Three mobile device frames surface workout summary, live timer, and streak grid with beat-synced callouts.",
    prompt: "Build a 12-second HyperFrames app-showcase composition (1920x1080) with three phone screens highlighting a fitness app: (1) Workout summary rings, (2) Live MM:SS activity timer with tabular-nums, and (3) Weekly 7x4 streak grid, ending with a kinetic brand lockup.",
  },
  {
    id: "hyperframes-data-bar-chart-race",
    title: "12s Animated Bar-Chart Race (NYT Style)",
    category: "Data",
    aspect: "16:9",
    durationSec: 12,
    summary: "6-bar animated bar-chart race with editorial serif headline, proportional fill bars, and kinetic value labels.",
    prompt: "Build a 12-second HyperFrames data composition (1920x1080) showing a 6-bar animated bar-chart race with an editorial serif headline, tabular monospace counters, and source footnote.",
  },
  {
    id: "hyperframes-saas-product-promo-30s",
    title: "30s SaaS Product Launch Promo",
    category: "Product",
    aspect: "16:9",
    durationSec: 30,
    summary: "Multi-scene SaaS launch reel: problem statement, command palette reveal, live telemetry bento, and CTA lockup.",
    prompt: "Build a 6-scene HyperFrames SaaS product launch video (1920x1080): Scene 1 bold typographic hook, Scene 2 command-palette workflow reveal, Scene 3 live throughput metrics, Scene 4 customer proof quote, Scene 5 pricing tier comparison, Scene 6 final CTA lockup.",
  },
  {
    id: "hyperframes-brand-sizzle-reel",
    title: "15s Brand Identity Sizzle Reel",
    category: "Brand",
    aspect: "16:9",
    durationSec: 15,
    summary: "Fast-cut kinetic typography, color token swatches, and geometric grid choreography for a brand reveal.",
    prompt: "Build a 5-scene HyperFrames Brand Sizzle Reel (1920x1080) showcasing kinetic display typography, color token swatch reveals with hex codes, typographic scale specimen, and final brand mark lockup.",
  },
  {
    id: "hyperframes-money-counter-hype",
    title: "10s Financial Metric Counter & Revenue Velocity",
    category: "Data",
    aspect: "16:9",
    durationSec: 10,
    summary: "Oversized tabular-nums odometer counter with proportional fill bar and quarterly delta breakdown.",
    prompt: "Build a 5-scene HyperFrames Financial Metric Counter composition (1920x1080) featuring an oversized tabular-nums revenue counter, Q1-Q4 proportional fill bars, and unit economics breakdown.",
  },
  {
    id: "hyperframes-flight-map-route",
    title: "12s Global SVG Route & Telemetry Map",
    category: "Data",
    aspect: "16:9",
    durationSec: 12,
    summary: "Animated SVG geodesic flight/network arc across global regions with latency and throughput callouts.",
    prompt: "Build a 5-scene HyperFrames Global Route & Telemetry Map composition (1920x1080) with animated SVG path drawing between Tokyo, Frankfurt, and New York nodes, showing real-time p99 latency and throughput.",
  },
  {
    id: "hyperframes-website-to-video-promo",
    title: "15s Website-to-Video Hero Walkthrough",
    category: "Product",
    aspect: "16:9",
    durationSec: 15,
    summary: "Transforms a product landing page into a multi-scene browser frame walkthrough with zoomed feature callouts.",
    prompt: "Build a 5-scene HyperFrames Website-to-Video promo (1920x1080) that frames a crisp browser viewport, pans across the hero, zooms into the interactive code editor and live benchmark table, and closes on the release tag.",
  },
  {
    id: "hyperframes-tiktok-karaoke-talking-head",
    title: "15s Vertical 9:16 Social Reel & Captions",
    category: "Social",
    aspect: "9:16",
    durationSec: 15,
    summary: "Vertical 1080x1920 short-form motion composition with word-by-word kinetic captions and metric cards.",
    prompt: "Build a 5-scene vertical 9:16 HyperFrames composition (1080x1920) with word-highlighted kinetic captions, stacked feature cards, and high-contrast mobile-first typography.",
  },
];


export {
  STARTER_HYPERFRAMES_VIDEO_HTML,
  STARTER_OPEN_SLIDE_DECK_HTML,
  OPEN_DESIGN_SKILLS_CATALOG,
  type OpenDesignSkillTemplate,
} from "./openDesignStarters";

export {
  detectDeliverableKind,
  parseHyperFramesDocument,
  buildHyperFramesCompositionBundle,
  computeHyperFramesAnimationMap,
  parseOpenSlideDeck,
  buildOpenDesignDeliverablePrompt,
  type HyperFramesBundle,
  type HyperFrameScene,
  type ParsedHyperFrames,
  type OpenSlideItem,
  type ParsedOpenSlideDeck,
  type HyperFramesAnimationMapReport,
} from "./openDesignParser";
