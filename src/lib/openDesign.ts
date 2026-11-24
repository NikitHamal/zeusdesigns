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
  {
    id: "hyperframes-saas-product-promo-30s",
    name: "HyperFrames 30s SaaS Product Promo (Linear-Style)",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "linear-precision",
    summary: "4-scene 30-second product launch film: Hook quote, stacked problem cards, UI showcase, and wordmark outro.",
    prompt: "Build a 5-scene 30-second HyperFrames SaaS product promo video (1920x1080) modelled on Linear product films: Scene 1 Hook headline, Scene 2 Problem user pull-quotes, Scene 3 Interactive UI workbench reveal, Scene 4 Latency & throughput benchmark bars, Scene 5 Wordmark & CTA outro with <!-- HYPERFRAMES_META: ... -->.",
  },
  {
    id: "hyperframes-app-showcase-three-phones",
    name: "HyperFrames Three-Device Mobile Showcase",
    category: "video",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "apple-hig",
    summary: "Synchronized 3-phone mobile product choreography with feature callout pills and metric counters.",
    prompt: "Create a 5-scene HyperFrames mobile product showcase video (1920x1080) featuring three synchronized phone frames, staggered feature pills, and tabular telemetry counters.",
  },
  {
    id: "hyperframes-brand-sizzle-reel",
    name: "HyperFrames Kinetic Brand Sizzle Reel",
    category: "motion",
    mode: "hyperframes",
    aspect: "16:9",
    brandId: "cash-app-kinetic",
    summary: "Paula Scher-inspired maximalist kinetic typography reel with rapid 2.5s scene cuts and high-contrast type.",
    prompt: "Create a 6-scene HyperFrames kinetic brand sizzle reel with oversized 120px display typography filling 75% of the frame, rapid 2500ms scene cadence, and high-contrast carbon/lime palette.",
  },
  {
    id: "motion-frames-kinetic-globe",
    name: "Motion-Frames Wireframe Globe & Rotating Type Ring",
    category: "motion",
    mode: "motion-design",
    aspect: "16:9",
    brandId: "claude-warm",
    summary: "Full-bleed looping CSS/SVG kinetic poster with concentric rotating rings, wireframe globe, and serif headline.",
    prompt: "Design a full-bleed 16:9 Motion-Frames kinetic poster with 3 concentric rotating SVG rings, a central wireframe technical globe, multilingual ring tokens, corner telemetry stamps, and an Instrument Serif headline.",
  },
  {
    id: "deck-guizang-editorial",
    name: "Guizang Literary Magazine 1920×1080 Deck",
    category: "slides",
    mode: "deck",
    aspect: "16:9",
    brandId: "claude-warm",
    summary: "Editorial magazine presentation deck with serif chapter openers, pull quotes, and structured essays.",
    prompt: "Create a 6-slide Guizang Editorial 1920x1080 presentation deck (<section class=\"slide\" data-slide-id=\"1\" data-title=\"...\" data-notes=\"...\">) with warm parchment surfaces, literary serif headlines, and structured comparison columns.",
  },
];

export interface HyperFramesBundle {
  slug: string;
  cacheDir: string;
  files: Record<string, string>;
}

/**
 * Ported from `nexu-io/open-design` (`od media scaffold` / `.hyperframes-cache/<slug>/`):
 * Packages any HyperFrames HTML composition into the canonical 3-file OpenDesign bundle
 * (`hyperframes.json`, `meta.json`, `index.html` with `window.__timelines.main` bridge).
 */
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

  // Also support OpenDesign's native `[data-composition-id]` + `[data-track-index]` clip format
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
    const clipRe = /<([a-z0-9]+)\b([^>]*data-start=["']([^"']+)["'][^>]*data-duration=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
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

/**
 * Ported from `nexu-io/open-design/design-templates/hyperframes/scripts/animation-map.mjs`
 * and `contrast-report.mjs`:
 * Analyzes a HyperFrames composition for scene pacing, ASCII Gantt timeline, WCAG AA contrast,
 * and choreography flags (`paced-fast`, `paced-slow`, `empty-scene`, `shadow-violation`).
 */
export interface HyperFramesAnimationMapReport {
  totalDurationSec: number;
  sceneCount: number;
  asciiTimeline: string[];
  flags: string[];
  contrastPass: boolean;
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
