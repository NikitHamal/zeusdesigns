// Built-in Design Systems library. Each system has runtime tokens (used by the live renderer)
// and written guidelines (injected into the AI system prompt as a design "skill").
export interface DSTokens {
  primary: string; onPrimary: string; container: string; onContainer: string;
  secondary: string; tertiary: string; bg: string; surface: string; surface2: string;
  text: string; muted: string; outline: string; error: string;
  rSm: number; rMd: number; rLg: number; rXl: number; rBtn: number; rCard: number;
  font: string; heading: string; weight: number; shadow: string; morph?: boolean; dark?: boolean; border: number;
}
export interface DesignSystem {
  id: string; name: string; vendor: string; tagline: string; featured?: boolean;
  tags: string[]; tokens: DSTokens; guidelines: string;
}

// Every family below is bundled with the app (src/lib/fonts.ts), so a design looks the same on any machine.
const sans = `"Google Sans Flex",Inter,"Segoe UI Variable Text",system-ui,sans-serif`;
const apple = `-apple-system,"SF Pro Text",Inter,"Segoe UI Variable Text",system-ui,sans-serif`;
const serif = `Fraunces,"Iowan Old Style",Georgia,serif`;

export const DESIGN_SYSTEMS: DesignSystem[] = [
  {
    id: "m3e", name: "Material 3 Expressive", vendor: "Google", featured: true,
    tagline: "Bold color, big shapes, springy motion. Zeus' native look.",
    tags: ["Android", "Web", "Expressive"],
    tokens: {
      primary: "#6a4fe0", onPrimary: "#ffffff", container: "#e6deff", onContainer: "#1d0a6b", secondary: "#625b71", tertiary: "#c2410c",
      bg: "#fdf8ff", surface: "#f5eefb", surface2: "#ece4f6", text: "#1d1a22", muted: "#4a4458", outline: "#7a7289", error: "#b3261e",
      rSm: 12, rMd: 20, rLg: 28, rXl: 40, rBtn: 999, rCard: 28, font: sans, heading: sans, weight: 600, shadow: "none", morph: true, border: 0,
    },
    guidelines: `Material 3 Expressive (M3E) — Google's 2025 evolution of Material You.
- COLOR: dynamic tonal palette. Use primary for the single key action, primaryContainer for hero/featured surfaces, secondaryContainer for selected nav/chips, tertiary sparingly for delight accents. Surfaces use tonal elevation (surface-container-low/high/highest), not shadows. Be bolder than M3: large saturated containers are encouraged.
- SHAPE: lean on large radii (cards 28px, sheets 28–40px, buttons fully pill 999px). Use shape contrast & morphing: pressed buttons morph to a smaller radius (12px); use "squircle/cookie/flower" style decorative shapes for avatars/icons containers; mix round and squared shapes in the same view for expressiveness.
- TYPE: expressive hierarchy — oversized display/headline type (36–57px, weight 600–700) next to quiet body 14–16px. Emphasized type styles use heavier weight, tight tracking. Use a variable sans.
- COMPONENTS: Large floating action buttons (FAB 56/80/96px), Extended FAB; Button groups & split buttons with connected shapes; Toolbars (floating, pill); Navigation bar with pill indicator (64×32) behind active icon + label; Navigation rail on tablets/web; Large top app bars that collapse; Segmented buttons; Loading indicator (morphing shapes); Progress wavy indicators; Switches with icon thumbs; Sliders with big rounded handles.
- MOTION: spring-based, natural. Fast spatial springs for movement (overshoot slightly, cubic-bezier(.34,1.56,.64,1)), effects springs for color/opacity (no overshoot). Press feedback = shape morph + scale .97. Stagger list entry 30ms.
- LAYOUT: 4dp grid, 16/24 margins, adaptive: compact <600, medium 600–839 (rail), expanded ≥840 (rail + 2 panes).
- Touch targets ≥48px. Prefer icons inside tonal containers. Always include meaningful empty/loading states.`,
  },
  {
    id: "m3", name: "Material 3", vendor: "Google", tagline: "Material You baseline — tonal, calm, adaptive.", tags: ["Android", "Web"],
    tokens: {
      primary: "#6750a4", onPrimary: "#fff", container: "#eaddff", onContainer: "#21005d", secondary: "#625b71", tertiary: "#7d5260",
      bg: "#fef7ff", surface: "#f3edf7", surface2: "#ece6f0", text: "#1d1b20", muted: "#49454f", outline: "#79747e", error: "#b3261e",
      rSm: 8, rMd: 12, rLg: 16, rXl: 28, rBtn: 999, rCard: 12, font: `Roboto,${sans}`, heading: `Roboto,${sans}`, weight: 500, shadow: "none", border: 0,
    },
    guidelines: `Material Design 3. Dynamic color roles (primary, on-primary, primary-container, secondary-container, surface-container*, outline). Pill buttons (filled, tonal, outlined, text), 12px cards (filled/elevated/outlined), top app bars, bottom navigation bar with pill indicator, FAB 56px r16, chips r8, dialogs r28. Roboto/Google Sans, type scale display/headline/title/body/label. Elevation via tonal overlay. State layers 8% hover / 12% pressed.`,
  },
  {
    id: "hig", name: "Apple HIG", vendor: "Apple", tagline: "iOS & macOS — clarity, deference, depth. Liquid Glass.", tags: ["iOS", "macOS"],
    tokens: {
      primary: "#007aff", onPrimary: "#fff", container: "#e5f1ff", onContainer: "#004a99", secondary: "#8e8e93", tertiary: "#ff9500",
      bg: "#f2f2f7", surface: "#ffffff", surface2: "#f2f2f7", text: "#000000", muted: "#6c6c70", outline: "#c6c6c8", error: "#ff3b30",
      rSm: 8, rMd: 10, rLg: 14, rXl: 22, rBtn: 12, rCard: 14, font: apple, heading: apple, weight: 600, shadow: "none", border: 0,
    },
    guidelines: `Apple Human Interface Guidelines (iOS 26 / Liquid Glass). Principles: clarity, deference, depth. System blue #007AFF tint, grouped inset lists on #F2F2F7 with white 10–14px rounded cells and hairline separators, large titles (34px bold) that collapse into inline nav bar, SF Pro type (17px body, 13px footnote), tab bar with 5 max items + SF-style icons, sheets with grabber & 38px top radius, translucent blur materials (backdrop-filter: blur(20px) saturate(180%)), capsule glass controls. Segmented controls, toggles (51×31 green #34C759), 44pt minimum tap target, swipe actions, haptic-feeling springs. Safe areas: status bar 54px top, home indicator 34px bottom.`,
  },
  {
    id: "fluent", name: "Fluent 2", vendor: "Microsoft", tagline: "Windows 11 — acrylic, mica, soft geometry.", tags: ["Windows", "Web"],
    tokens: {
      primary: "#0f6cbd", onPrimary: "#fff", container: "#deecf9", onContainer: "#0a3d6b", secondary: "#616161", tertiary: "#8764b8",
      bg: "#f5f5f5", surface: "#ffffff", surface2: "#fafafa", text: "#242424", muted: "#616161", outline: "#d1d1d1", error: "#c50f1f",
      rSm: 2, rMd: 4, rLg: 8, rXl: 12, rBtn: 4, rCard: 8, font: `"Segoe UI Variable Text","Segoe UI",Inter,${sans}`, heading: `"Segoe UI Variable Display","Segoe UI",${sans}`, weight: 600, shadow: "none", border: 1,
    },
    guidelines: `Fluent 2 (Microsoft). Brand blue #0F6CBD, neutral greys, 4px control radius, 8px cards, 12px dialogs. Mica/acrylic backgrounds, subtle 1px strokes (#d1d1d1), layered tonal surfaces and 1px strokes for depth. Segoe UI Variable, 14px body, 12px caption. Controls 32px high; NavigationView left pane, CommandBar, TabList, Persona avatars, Badges, Toast, Teaching tips. Focus ring: 2px dark + 1px white inner. Reveal hover effects, smooth decelerate easing (0.1,0.9,0.2,1).`,
  },
  {
    id: "shadcn", name: "shadcn/ui", vendor: "shadcn", tagline: "Minimal, monochrome, Radix + Tailwind craft.", tags: ["Web", "React"],
    tokens: {
      primary: "#18181b", onPrimary: "#fafafa", container: "#f4f4f5", onContainer: "#18181b", secondary: "#71717a", tertiary: "#2563eb",
      bg: "#ffffff", surface: "#ffffff", surface2: "#fafafa", text: "#09090b", muted: "#71717a", outline: "#e4e4e7", error: "#dc2626",
      rSm: 6, rMd: 8, rLg: 10, rXl: 14, rBtn: 8, rCard: 12, font: `Inter,${sans}`, heading: `Inter,${sans}`, weight: 600, shadow: "none", border: 1,
    },
    guidelines: `shadcn/ui aesthetic. Neutral zinc scale, near-black primary (#18181b) with white text, 1px borders (#e4e4e7), radius 0.5rem (8px) / cards 12px, Inter 14px, tight letter spacing -0.01em on headings, muted-foreground #71717a. Components: Button (default/secondary/outline/ghost/destructive, h-9 px-4), Card (border rounded-xl), Badge, Tabs (muted pill list), Dialog, Sheet, Table, Command palette, Sonner toasts, Input (h-9, ring-1 focus ring 3px/50%). Generous whitespace, restraint, subtle hover states. Output as React + Tailwind when exporting.`,
  },
  {
    id: "carbon", name: "IBM Carbon", vendor: "IBM", tagline: "Enterprise grid, rectilinear, data-dense.", tags: ["Enterprise", "Web"],
    tokens: {
      primary: "#0f62fe", onPrimary: "#fff", container: "#d0e2ff", onContainer: "#001d6c", secondary: "#525252", tertiary: "#8a3ffc",
      bg: "#f4f4f4", surface: "#ffffff", surface2: "#f4f4f4", text: "#161616", muted: "#525252", outline: "#8d8d8d", error: "#da1e28",
      rSm: 0, rMd: 0, rLg: 0, rXl: 0, rBtn: 0, rCard: 0, font: `"IBM Plex Sans","DM Sans",${sans}`, heading: `"IBM Plex Sans","DM Sans",${sans}`, weight: 400, shadow: "none", border: 1,
    },
    guidelines: `IBM Carbon. Square corners (0 radius), 2x grid (8px), IBM Plex Sans, productive type (14px/18px), Blue 60 #0F62FE primary, Gray 100 header (#161616), bottom-border inputs (40px high, #f4f4f4 fill, 1px bottom #8d8d8d), flush rectangular buttons 48px with arrow icon right, tiles, data tables with zebra and toolbar, structured lists, tag pills, 110ms productive easing (0.2,0,0.38,0.9).`,
  },
  {
    id: "antd", name: "Ant Design", vendor: "Ant Group", tagline: "Enterprise dashboards, dense and dependable.", tags: ["Enterprise", "Web"],
    tokens: {
      primary: "#1677ff", onPrimary: "#fff", container: "#e6f4ff", onContainer: "#0958d9", secondary: "#8c8c8c", tertiary: "#722ed1",
      bg: "#f5f5f5", surface: "#ffffff", surface2: "#fafafa", text: "#000000e0", muted: "#00000073", outline: "#d9d9d9", error: "#ff4d4f",
      rSm: 4, rMd: 6, rLg: 8, rXl: 12, rBtn: 6, rCard: 8, font: `Inter,${sans}`, heading: `Inter,${sans}`, weight: 500, shadow: "none", border: 1,
    },
    guidelines: `Ant Design 5. Daybreak blue #1677FF, 6px radius, 14px base, 32px controls, 1px #d9d9d9 borders, sider + header + content admin layouts, Table/Form/Descriptions/Statistic/Steps/Tag/Badge/Breadcrumb, 24-col grid, 8px spacing, natural motion (0.2s cubic-bezier(0.645,0.045,0.355,1)).`,
  },
  {
    id: "polaris", name: "Shopify Polaris", vendor: "Shopify", tagline: "Commerce admin — friendly, practical.", tags: ["Commerce", "Web"],
    tokens: {
      primary: "#303030", onPrimary: "#fff", container: "#f1f1f1", onContainer: "#303030", secondary: "#616161", tertiary: "#008060",
      bg: "#f1f1f1", surface: "#ffffff", surface2: "#fafafa", text: "#303030", muted: "#616161", outline: "#e3e3e3", error: "#e22c38",
      rSm: 8, rMd: 8, rLg: 12, rXl: 16, rBtn: 8, rCard: 12, font: `Inter,${sans}`, heading: `Inter,${sans}`, weight: 650, shadow: "none", border: 1,
    },
    guidelines: `Shopify Polaris (2024 refresh). Near-black primary buttons with flat fill, #F1F1F1 canvas, white 12px cards with 1px borders, Inter 13/14px, green #008060 for success/positive, Page headers with breadcrumbs and secondary actions, IndexTable, Badges (tone-based pills), Banners, Filters, Bleed sections. Spacing scale 4/8/12/16/20/24/32.`,
  },
  {
    id: "atlassian", name: "Atlassian DS", vendor: "Atlassian", tagline: "Collaborative work tools — clear & confident.", tags: ["Productivity", "Web"],
    tokens: {
      primary: "#0c66e4", onPrimary: "#fff", container: "#e9f2ff", onContainer: "#09326c", secondary: "#626f86", tertiary: "#6e5dc6",
      bg: "#ffffff", surface: "#ffffff", surface2: "#f7f8f9", text: "#172b4d", muted: "#626f86", outline: "#dcdfe4", error: "#c9372c",
      rSm: 3, rMd: 3, rLg: 8, rXl: 12, rBtn: 3, rCard: 8, font: `"Atlassian Sans","DM Sans",${sans}`, heading: `"Atlassian Sans","DM Sans",${sans}`, weight: 600, shadow: "none", border: 0,
    },
    guidelines: `Atlassian Design System. Blue #0C66E4, 3px control radius, 8px cards, 14px body, 32/40px controls, lozenges for status (bold/subtle), avatars with presence, left nav with collapsible sections, issue-card layouts, inline edit fields, subtle elevation tokens.`,
  },
  {
    id: "neo", name: "Neo-brutalism", vendor: "Community", tagline: "Thick borders, flat color blocks, loud type.", tags: ["Playful", "Web"],
    tokens: {
      primary: "#ff5c8a", onPrimary: "#111", container: "#ffe14d", onContainer: "#111", secondary: "#111111", tertiary: "#3ddc97",
      bg: "#fff6e5", surface: "#ffffff", surface2: "#ffe9c2", text: "#111111", muted: "#444", outline: "#111111", error: "#ff3b30",
      rSm: 6, rMd: 10, rLg: 14, rXl: 20, rBtn: 10, rCard: 14, font: `"Space Grotesk",${sans}`, heading: `"Space Grotesk",${sans}`, weight: 700, shadow: "none", border: 3,
    },
    guidelines: `Neo-brutalism. 3px solid #111 borders on everything, saturated flat color blocks (hot pink, yellow, mint, sky), cream #FFF6E5 canvas, bold grotesk type (700–900), oversized uppercase headings, stickers & tilted badges (rotate -2deg), buttons that translate(2px,2px) and lose shadow on press. No gradients, no shadows.`,
  },
  {
    id: "glass", name: "Glassmorphism", vendor: "Community", tagline: "Frosted dark layers, hairline borders.", tags: ["Modern", "Dark"],
    tokens: {
      primary: "#e8a07a", onPrimary: "#2a1408", container: "#4a2f20", onContainer: "#ffe3d3", secondary: "#c9b8a8", tertiary: "#c8cf9a",
      bg: "#14110f", surface: "#ffffff14", surface2: "#ffffff1f", text: "#f6f2ee", muted: "#b9b0a8", outline: "#ffffff33", error: "#ff8a8a",
      rSm: 12, rMd: 18, rLg: 24, rXl: 32, rBtn: 16, rCard: 24, font: `"Plus Jakarta Sans",${sans}`, heading: `"Plus Jakarta Sans",${sans}`, weight: 600, shadow: "none", dark: true, border: 1,
    },
    guidelines: `Glassmorphism on a flat dark neutral. Background: solid #121110 or #181716, no gradients. Panels: rgba(255,255,255,.1) with backdrop-filter: blur(24px) saturate(160%), 1px rgba(255,255,255,.2) border, 24px radius. White text, 60–70% opacity secondary. Solid accent buttons in warm clay or amber, hairline light borders. Keep contrast ≥4.5:1 — never put light text over light glass.`,
  },
  {
    id: "minimal", name: "Editorial Minimal", vendor: "Community", tagline: "Serif headlines, whitespace, quiet luxury.", tags: ["Brand", "Web"],
    tokens: {
      primary: "#1a1a1a", onPrimary: "#fff", container: "#efe9df", onContainer: "#1a1a1a", secondary: "#6b6459", tertiary: "#b4532a",
      bg: "#faf7f2", surface: "#ffffff", surface2: "#f3eee6", text: "#1a1a1a", muted: "#6b6459", outline: "#ddd5c7", error: "#b42318",
      rSm: 2, rMd: 4, rLg: 6, rXl: 10, rBtn: 999, rCard: 4, font: `"DM Sans",${sans}`, heading: serif, weight: 500, shadow: "none", border: 1,
    },
    guidelines: `Editorial minimal. Warm paper #FAF7F2, ink #1A1A1A, one terracotta accent. Serif display (Georgia/Iowan) at large sizes with tight leading, sans body 15–16px at 1.6. Hairline rules, generous 80–120px section spacing, asymmetric grids, small caps eyebrows, pill outlined buttons, imagery full-bleed, no shadows, restrained motion (fade + 12px rise).`,
  },
  {
    id: "claude", name: "Claude Warm", vendor: "Anthropic-inspired", tagline: "Warm cream, coral accent, calm and human.", tags: ["Chat", "Web"],
    tokens: {
      primary: "#c96442", onPrimary: "#fff", container: "#f4e3da", onContainer: "#5c2a17", secondary: "#6e6a60", tertiary: "#3d7a6a",
      bg: "#faf9f5", surface: "#ffffff", surface2: "#f0eee6", text: "#141413", muted: "#6e6a60", outline: "#e3dfd2", error: "#b53333",
      rSm: 8, rMd: 12, rLg: 16, rXl: 24, rBtn: 12, rCard: 16, font: `"DM Sans",${sans}`, heading: serif, weight: 500, shadow: "none", border: 1,
    },
    guidelines: `Warm conversational UI: cream #FAF9F5 canvas, coral/clay #C96442 accent, serif headings, rounded 12–16px surfaces with hairline #E3DFD2 borders, input composer as a large rounded card with controls row beneath, gentle shadows, text-first layouts.`,
  },
];

export function getDS(id: string): DesignSystem {
  return DESIGN_SYSTEMS.find((d) => d.id === id) ?? DESIGN_SYSTEMS[0];
}

export function tokensCss(ds: DesignSystem): string {
  const k = ds.tokens;
  return `:root{--primary:${k.primary};--on-primary:${k.onPrimary};--container:${k.container};--on-container:${k.onContainer};--secondary:${k.secondary};--tertiary:${k.tertiary};--bg:${k.bg};--surface:${k.surface};--surface-2:${k.surface2};--text:${k.text};--muted:${k.muted};--outline:${k.outline};--error:${k.error};--r-sm:${k.rSm}px;--r-md:${k.rMd}px;--r-lg:${k.rLg}px;--r-xl:${k.rXl}px;--r-btn:${k.rBtn}px;--r-card:${k.rCard}px;--font:${k.font};--heading:${k.heading};--weight:${k.weight};--shadow:${k.shadow};--bw:${k.border}px}`;
}
