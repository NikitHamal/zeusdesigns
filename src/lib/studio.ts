// Zeus Studio: the built-in MCP server. Every tool here runs locally inside the app, needs no network and no install,
// and returns real data (the bundled Material Symbols set, the live design-system tokens, the actual canvas, the real audit).
// Two consumers: the agent calls tools by name (studio_*), and the harness injects studioBrief() before the model writes a line,
// so even a small model starts from a concrete product brief instead of inventing one.
import { useStore } from "../store";
import { DESIGN_SYSTEMS, getDS, tokensCss, type DesignSystem } from "./designSystems";
import { DS_KIT, UI_ICON_NAMES, harden, kitExample } from "./harness";
import { DESIGN_FONTS } from "./fonts";
import { blueprintFor } from "./blueprints";
import { auditHtml } from "./audit";
import type { Device } from "../types";

export const STUDIO_ID = "mcp-zeus-studio";

/* ------------------------------------------------------------------ */
/* Color math                                                          */
/* ------------------------------------------------------------------ */
interface HSL { h: number; s: number; l: number }
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export function parseHex(input: string): [number, number, number] | null {
  let h = input.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

function rgbToHsl([r, g, b]: [number, number, number]): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: s * 100, l: l * 100 };
}
function hslToHex({ h, s, l }: HSL): string {
  s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Moves lightness of `fg` away from `bg` until it clears the ratio. */
function ensure(fg: HSL, bg: string, ratio: number): string {
  const dark = luminance(bg) > 0.4;
  let c = { ...fg };
  for (let i = 0; i < 50 && contrast(hslToHex(c), bg) < ratio; i++) c = { ...c, l: clamp(c.l + (dark ? -2 : 2), 0, 100) };
  return hslToHex(c);
}

export interface Palette { name: string; light: Record<string, string>; dark: Record<string, string> }

/** A full light and dark scheme from one seed color. Text pairs are checked against AA (4.5:1). */
export function makePalette(seed: string, name = "Seed"): Palette | null {
  const rgb = parseHex(seed);
  if (!rgb) return null;
  const base = rgbToHsl(rgb);
  const s = clamp(base.s, 28, 85);
  const h = base.h;
  const neutral = (l: number, k = 0.12) => hslToHex({ h, s: s * k, l });
  const build = (dark: boolean): Record<string, string> => {
    const bg = dark ? neutral(9) : neutral(98, 0.25);
    const surface = dark ? neutral(13) : neutral(95, 0.22);
    const surface2 = dark ? neutral(18) : neutral(91, 0.2);
    const primary = hslToHex({ h, s, l: dark ? 72 : 42 });
    const onPrimary = contrast("#ffffff", primary) >= 4.5 ? "#ffffff" : "#16130f";
    const container = hslToHex({ h, s: s * 0.7, l: dark ? 24 : 90 });
    const onContainer = ensure({ h, s: s * 0.8, l: dark ? 88 : 18 }, container, 7);
    const text = ensure({ h, s: s * 0.1, l: dark ? 94 : 10 }, bg, 12);
    const muted = ensure({ h, s: s * 0.1, l: dark ? 72 : 36 }, surface2, 4.5);
    const outline = hslToHex({ h, s: s * 0.1, l: dark ? 30 : 80 });
    const accent = hslToHex({ h: (h + 150) % 360, s: s * 0.7, l: dark ? 70 : 40 });
    return { bg, surface, surface2, primary, onPrimary, container, onContainer, text, muted, outline, accent, error: dark ? "#f2b8b5" : "#b3261e" };
  };
  return { name, light: build(false), dark: build(true) };
}

/* ------------------------------------------------------------------ */
/* Fonts bundled with the app. Designs can name them directly; nothing is downloaded. */
/* ------------------------------------------------------------------ */
const FALLBACK = { sans: `system-ui,"Segoe UI",sans-serif`, serif: `Georgia,"Times New Roman",serif`, mono: `ui-monospace,Consolas,monospace` };
export const FONT_STACKS: { id: string; stack: string; feel: string; use: string }[] = DESIGN_FONTS.map((f) => ({
  id: f.family, stack: `"${f.family}",${FALLBACK[f.kind]}`, feel: f.feel, use: f.use,
}));
const PAIRINGS: Record<string, [string, string]> = {
  editorial: ["Fraunces", "DM Sans"], technical: ["Space Grotesk", "Inter"], warm: ["Fraunces", "Plus Jakarta Sans"],
  calm: ["DM Sans", "DM Sans"], friendly: ["Plus Jakarta Sans", "Plus Jakarta Sans"], bold: ["Manrope", "Inter"],
  neutral: ["Inter", "Inter"], developer: ["Inter", "JetBrains Mono"], playful: ["Space Grotesk", "DM Sans"], elegant: ["Instrument Serif", "Inter"],
};

/* ------------------------------------------------------------------ */
/* Product domains: real content and the right icons, so no model has to invent them */
/* ------------------------------------------------------------------ */
interface Domain {
  id: string; match: RegExp; audience: string; action: string; nav: string[]; icons: string[]; font: string;
  content: string[];
}
export const DOMAINS: Domain[] = [
  { id: "fitness", match: /(fitness|workout|gym|run|training|exercise|yoga|sport|steps)/i, audience: "people building a training habit", action: "Start workout", nav: ["Today", "Plans", "Progress", "Profile"], icons: ["fitness_center", "directions_run", "local_fire_department", "timer", "trending_up", "bolt", "favorite", "history", "calendar_today"], font: "technical",
    content: ["Upper body strength, 45 min, 6 exercises", "Bench press 4 x 8 at 62.5 kg", "Weekly volume 12,480 kg, up 8%", "Streak 12 days", "Resting heart rate 58 bpm", "Tempo run 6.2 km at 5:12 /km"] },
  { id: "finance", match: /(bank|finance|fintech|wallet|budget|invest|payment|crypto|money|expense|portfolio|stock)/i, audience: "people tracking money day to day", action: "Send money", nav: ["Home", "Cards", "Activity", "Insights"], icons: ["account_balance", "payments", "credit_card", "savings", "trending_up", "receipt_long", "wallet", "pie_chart", "lock"], font: "neutral",
    content: ["Balance $12,480.32", "Groceries, Whole Foods, -$84.17", "Salary, Northwind Labs, +$4,250.00", "Savings goal: Lisbon trip, $1,860 of $3,000", "Spending this month $2,140, 12% under budget", "Card ending 4417, expires 09/28"] },
  { id: "food", match: /(food|recipe|restaurant|cook|meal|delivery|menu|cafe|coffee|grocery)/i, audience: "hungry people deciding what to eat", action: "Add to order", nav: ["Explore", "Orders", "Saved", "Account"], icons: ["restaurant", "local_cafe", "star", "schedule", "favorite", "storefront", "shopping_bag", "location_on", "sell", "local_shipping"], font: "warm",
    content: ["Miso ramen, 12.50, 4.8 rating, 25 min", "Burrata with roasted tomatoes, 14.00", "Free delivery over 25, ends 21:00", "Oat flat white, 4.20", "Ottoman Table, Mediterranean, 1.2 km", "Order 4821 arrives in 18 min"] },
  { id: "travel", match: /(travel|trip|flight|hotel|booking|tour|vacation|itinerary|airbnb|destination)/i, audience: "people planning a trip", action: "Book now", nav: ["Explore", "Trips", "Saved", "Profile"], icons: ["flight", "hotel", "map", "explore", "calendar_today", "location_on", "star", "language", "public"], font: "calm",
    content: ["Lisbon, 5 nights, from 640 per person", "Flight LH 1175, 08:40 to 11:05, Munich to Lisbon", "Alfama Suites, 4.7, 9.1 km from airport", "Oct 12 to Oct 17, 2 travelers", "Pastel de nata tour, 3 h, 38", "Check-in from 15:00"] },
  { id: "music", match: /(music|player|podcast|playlist|album|song|audio|radio|streaming)/i, audience: "listeners picking something to play", action: "Play", nav: ["Home", "Search", "Library"], icons: ["play_arrow", "pause", "skip_next", "skip_previous", "shuffle", "repeat", "volume_up", "favorite", "headphones", "music_note"], font: "bold",
    content: ["Night Drive, Kovac, 3:42", "Daily mix 3, 42 songs, 2 h 51 min", "Slow Light, Marlow Quartet, 2024", "Recently played: Low Tide, Pale Harbor", "Episode 118: The long tail of maps, 52 min", "Liked songs, 318 tracks"] },
  { id: "shop", match: /(shop|store|ecommerce|e-commerce|product|cart|checkout|fashion|sneaker|marketplace|retail)/i, audience: "shoppers comparing a few products", action: "Add to cart", nav: ["Shop", "Search", "Cart", "Account"], icons: ["storefront", "shopping_bag", "shopping_cart", "favorite", "local_shipping", "sell", "star", "filter_list", "payments", "inventory_2"], font: "neutral",
    content: ["Trail runner, Stone Grey, 129.00", "Wool overshirt, 4.6 rating, 212 reviews", "Free returns within 30 days", "Size 42, in stock, ships tomorrow", "Order 20931 shipped, arrives Thu", "Subtotal 258.00, delivery 0.00"] },
  { id: "social", match: /(social|chat|message|community|network|feed|friends|dating|forum|messenger|profile)/i, audience: "people keeping up with friends and groups", action: "Post", nav: ["Feed", "Search", "Inbox", "Profile"], icons: ["chat", "favorite", "comment", "share", "group", "person_add", "notifications", "send", "image", "bookmark"], font: "friendly",
    content: ["Maya Okafor, 2h, shared a photo from Kyoto", "Design circle, 1,284 members, 14 new posts", "Daniel: are we still on for Friday?", "48 likes, 6 comments", "Priya Raman started following you", "Reply to Leo"] },
  { id: "education", match: /(learn|course|school|education|study|lesson|student|quiz|class|tutor|language app)/i, audience: "learners who need small daily wins", action: "Continue lesson", nav: ["Learn", "Practice", "Leaderboard", "Profile"], icons: ["school", "task_alt", "timer", "trending_up", "bolt", "checklist", "language", "article"], font: "friendly",
    content: ["Spanish, Unit 4: Ordering food, lesson 3 of 8", "Streak 23 days, 40 XP today", "Quiz: Past tense, 8 of 10 correct", "Next review in 2 h, 14 words", "Weekly goal 5 of 7 days", "Chemistry 101, Week 6, Acids and bases"] },
  { id: "health", match: /(health|medical|doctor|clinic|patient|meditat|sleep|mental|wellness|therapy|habit|pharmacy)/i, audience: "people looking after their health", action: "Book appointment", nav: ["Today", "Care", "Records", "Profile"], icons: ["favorite", "spa", "water_drop", "calendar_today", "timer", "verified", "thermostat", "support_agent"], font: "calm",
    content: ["Dr. Amara Singh, General practice, Tue 10:20", "Sleep 7 h 24 min, 84 percent efficiency", "Blood pressure 118 over 76", "Take Vitamin D, 2000 IU, with breakfast", "Hydration 1.4 of 2.2 L", "Lab results ready, 3 new"] },
  { id: "productivity", match: /(todo|task|project management|notes|kanban|planner|calendar|productivity|workspace|team|sprint|crm|saas|admin|analytics)/i, audience: "teams who live in this tool all day", action: "New task", nav: ["Inbox", "Projects", "Calendar", "Team"], icons: ["task_alt", "checklist", "calendar_today", "event", "group", "dashboard", "bar_chart", "folder", "schedule", "flag"], font: "neutral",
    content: ["Ship onboarding v2, due Fri, 3 of 7 subtasks", "Sprint 24, 18 of 26 points done", "Design review, Wed 14:00, 5 attendees", "Revenue 48,210, up 6.4% vs last week", "Churn 1.8 percent, 12 accounts", "Assigned to Ravi Menon, high priority"] },
  { id: "developer", match: /(developer|devtool|code|api|terminal|deploy|github|cli|database|docs|ide|infra|monitoring)/i, audience: "engineers checking on their systems", action: "Deploy", nav: ["Overview", "Deployments", "Logs", "Settings"], icons: ["terminal", "database", "bug_report", "cloud", "sync", "key", "history", "layers", "rocket_launch"], font: "developer",
    content: ["Deployment 4f2a91c, production, 42 s", "p95 latency 184 ms, error rate 0.12 percent", "api-gateway, 3 of 3 replicas healthy", "Build failed: tsc error TS2322 in billing.ts", "Rotate key, last used 3 days ago", "Region eu-central-1, 99.98 percent uptime"] },
  { id: "realestate", match: /(real estate|property|apartment|rent|house|listing|home search|mortgage)/i, audience: "people hunting for a place to live", action: "Schedule tour", nav: ["Search", "Saved", "Tours", "Account"], icons: ["home", "location_on", "map", "favorite", "calendar_today", "filter_list", "payments", "hotel", "sell", "verified"], font: "warm",
    content: ["2 bed, 1 bath, 74 m2, 1,850 per month", "Elm Street 14, available Nov 1", "Tour Saturday 11:30 with Hana", "Walk score 92, 4 min to metro", "Deposit 1 month, pets allowed", "Saved search: Kreuzberg under 2,000"] },
  { id: "news", match: /(news|magazine|blog|article|editorial|publication|reading|journal)/i, audience: "readers scanning for what matters", action: "Read", nav: ["Today", "Topics", "Saved", "Account"], icons: ["article", "newspaper", "bookmark", "share", "schedule", "search", "trending_up", "comment", "public", "history"], font: "editorial",
    content: ["City council approves 40 km of new bike lanes, 6 min read", "Interview: the engineer rebuilding Lisbon's tram grid", "Markets close higher as energy stocks rally", "Opinion: Why small teams ship better software", "Saved for later, 12 articles", "Updated 14 minutes ago"] },
];

export function detectDomain(intent: string): Domain | null {
  return DOMAINS.find((d) => d.match.test(intent)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Brief injected into the generation prompt                           */
/* ------------------------------------------------------------------ */
const iconsAvailable = (names: string[]) => names.filter((n) => UI_ICON_NAMES.includes(n));
const NATIVE_FONT_SYSTEMS = new Set(["m3e", "m3", "hig", "fluent", "shadcn", "carbon", "antd", "polaris", "atlassian"]);

export function buildSvgChart(kind = "area", rawValues = "28,42,36,58,52,74,88", rawLabels = "Mon,Tue,Wed,Thu,Fri,Sat,Sun"): string {
  const nums = rawValues.split(/[,\s]+/).map((n) => parseFloat(n)).filter((n) => !Number.isNaN(n));
  const vals = nums.length >= 2 ? nums.slice(0, 12) : [28, 42, 36, 58, 52, 74, 88];
  const labels = rawLabels.split(",").map((s) => s.trim()).filter(Boolean);
  const w = 320, h = 128, padX = 12, padTop = 14, padBot = 24;
  const plotW = w - padX * 2, plotH = h - padTop - padBot;
  const min = Math.min(...vals, 0), max = Math.max(...vals, min + 1);
  const pts = vals.map((v, i) => {
    const x = Math.round(padX + (i / (vals.length - 1)) * plotW);
    const y = Math.round(padTop + plotH - ((v - min) / (max - min)) * plotH);
    return [x, y] as const;
  });
  const labelNodes = vals.map((_, i) => {
    const lbl = labels[i] ?? `${i + 1}`;
    const x = pts[i][0];
    return `<text x="${x}" y="${h - 6}" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="var(--font)">${lbl}</text>`;
  }).join("");

  if (kind === "bar") {
    const bw = Math.max(10, Math.floor(plotW / vals.length) - 8);
    const bars = pts.map(([x, y], i) => {
      const bh = Math.max(6, padTop + plotH - y);
      const fill = i === vals.length - 1 ? "var(--primary)" : "var(--container)";
      return `<rect x="${Math.round(x - bw / 2)}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${fill}"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;overflow:visible">${bars}${labelNodes}</svg>`;
  }

  const dLine = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const dArea = `${dLine} L${pts[pts.length - 1][0]} ${padTop + plotH} L${pts[0][0]} ${padTop + plotH} Z`;
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;overflow:visible"><path d="${dArea}" fill="var(--container)" opacity="0.7"/><path d="${dLine}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--primary)"/>${labelNodes}</svg>`;
}

export function studioBrief(intent: string, ds: DesignSystem, device?: Device): string {
  if (!useStore.getState().settings.studioOn) return "";
  const d = detectDomain(intent);
  const [display] = PAIRINGS[d?.font ?? "neutral"];
  const f1 = FONT_STACKS.find((f) => f.id === display);
  const needsChart = (d && ["fitness", "finance", "productivity", "developer", "health"].includes(d.id)) || /(dash|analytic|chart|metric|revenue|stats|finance|fitness|health)/i.test(intent);
  const lines = [
    "## Studio brief (computed for this request; follow it, do not restate it)",
    d ? `- Product: ${d.id}. Audience: ${d.audience}. The one primary action: "${d.action}".` : "- Product: infer it from the request. Name the audience and the ONE primary action before writing.",
    d ? `- Navigation labels: ${d.nav.join(", ")} (3 to 5 items, one is selected).` : "",
    d ? `- Icons for this product (all bundled, use via <i data-i>): ${iconsAvailable(d.icons).join(", ")}.` : "",
    d ? `- Real content to adapt (use numbers, names and units like these, never lorem):\n${d.content.map((c) => `  * ${c}`).join("\n")}` : "",
    f1 && !NATIVE_FONT_SYSTEMS.has(ds.id) ? `- Type: set the hero headline and screen titles in font-family:${f1.stack} (${f1.feel}); body stays var(--font). Numbers, codes and small labels may use "JetBrains Mono". Fonts are bundled, never link them.` : "- Type: use var(--font) and var(--heading); hierarchy through size and weight. \"JetBrains Mono\" is bundled for numbers and labels when it fits.",
    needsChart ? `- Ready-to-use inline SVG chart (drop inside a .z-card and adjust numbers/labels):\n  ${buildSvgChart(d?.id === "fitness" ? "bar" : "area")}` : "",
    device ? `- Target: ${device}. Fill the full frame height.` : "",
    "- Quality bar: one primary button, aligned edges, equal gutters, 4 to 7 rows in any list, a selected state on tabs and nav, nothing overlapping, text contrast at least 4.5:1.",
  ].filter(Boolean);
  const bp = blueprintFor(intent, device);
  return lines.join("\n") + (bp ? "\n\n" + bp : "");
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */
type Args = Record<string, unknown>;
export interface StudioTool {
  name: string; desc: string; icon: string; params: Record<string, string>;
  run: (a: Args) => string | Promise<string>;
}
const str = (v: unknown, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const activeDS = (a: Args) => {
  const raw = norm(str(a.system));
  const hit = raw ? DESIGN_SYSTEMS.find((d) => d.id === raw || norm(d.name) === raw || (raw.length > 2 && norm(d.name).startsWith(raw))) : undefined;
  return hit ?? getDS(useStore.getState().settings.designSystemId);
};
const board = (a: Args) => {
  const s = useStore.getState();
  const id = str(a.id);
  return s.artboards.find((b) => b.id === id) ?? (a.name ? s.artboards.find((b) => b.name.toLowerCase() === str(a.name).toLowerCase()) : undefined) ?? null;
};
const stripKit = (h: string) => h.replace(/<style data-zeus-kit>[\s\S]*?<\/style>/, "").replace(/<script data-zeus-kit-js>[\s\S]*?<\/script>/, "");

export const STUDIO_TOOLS: StudioTool[] = [
  {
    name: "studio_brief", icon: "assignment", desc: "Product brief for a request: audience, primary action, nav, icons, real content, blueprint",
    params: { query: "what the user wants designed" },
    run: (a) => studioBrief(str(a.query ?? a.request), activeDS(a)) || "Studio is off",
  },
  {
    name: "studio_palette", icon: "palette", desc: "Full light and dark palette from a seed color, contrast verified",
    params: { seed: "hex color, e.g. #c96442" },
    run: (a) => {
      const p = makePalette(str(a.seed ?? a.query, "#c96442"));
      if (!p) return "Seed must be a hex color like #c96442";
      const row = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `--${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()).replace("surface2", "surface-2")}:${v}`).join(";");
      const pair = (o: Record<string, string>) => `text/bg ${contrast(o.text, o.bg).toFixed(1)}:1, on-primary/primary ${contrast(o.onPrimary, o.primary).toFixed(1)}:1, on-container/container ${contrast(o.onContainer, o.container).toFixed(1)}:1, muted/surface-2 ${contrast(o.muted, o.surface2).toFixed(1)}:1`;
      return `Light:\n:root{${row(p.light)}}\nContrast: ${pair(p.light)}\n\nDark:\n:root{${row(p.dark)}}\nContrast: ${pair(p.dark)}\n\nUse these only when the user asks for a brand color; otherwise keep the design system tokens.`;
    },
  },
  {
    name: "studio_contrast", icon: "contrast", desc: "WCAG contrast ratio between two colors",
    params: { fg: "hex", bg: "hex" },
    run: (a) => {
      if (!parseHex(str(a.fg)) || !parseHex(str(a.bg))) return "fg and bg must be hex colors";
      const r = contrast(str(a.fg), str(a.bg));
      return `${r.toFixed(2)}:1. Body text AA ${r >= 4.5 ? "pass" : "fail"}, large text AA ${r >= 3 ? "pass" : "fail"}, AAA ${r >= 7 ? "pass" : "fail"}.`;
    },
  },
  {
    name: "studio_fonts", icon: "text_fields", desc: "Bundled design fonts, pairings and ready font-family stacks",
    params: { mood: "editorial | technical | warm | calm | friendly | bold | neutral | developer | playful | elegant" },
    run: (a) => {
      const mood = str(a.mood ?? a.query).toLowerCase().trim();
      const pair = PAIRINGS[mood];
      const list = FONT_STACKS.map((f) => `- ${f.id}: ${f.feel}. Use for ${f.use}. font-family:${f.stack}`).join("\n");
      return (pair ? `Pairing for ${mood}: headings ${pair[0]}, body ${pair[1]}.\n\n` : "") + list + "\nAll fonts above are bundled with the app: write the font-family, never link or @import anything.";
    },
  },
  {
    name: "studio_icons", icon: "search", desc: "Search the bundled Material Symbols names that <i data-i> resolves",
    params: { query: "keyword, e.g. cart or music" },
    run: (a) => {
      const q = str(a.query).toLowerCase().trim();
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const hits = UI_ICON_NAMES.filter((n) => !q || n.includes(q.replace(/\s+/g, "_")) || words.some((w) => n.includes(w)));
      return hits.length ? `${hits.length} match${hits.length > 1 ? "es" : ""}: ${hits.slice(0, 60).join(", ")}` : `No icon contains "${q}". Try a broader word; ${UI_ICON_NAMES.length} icons are bundled.`;
    },
  },
  {
    name: "studio_components", icon: "widgets", desc: "Component kit overrides of the design system plus a working skeleton",
    params: { system: "optional design system id", device: "mobile | web" },
    run: (a) => {
      const ds = activeDS(a);
      const dev = str(a.device) === "web" ? "web" : "mobile";
      return `${ds.name} kit overrides: ${DS_KIT[ds.id] ?? "(base kit)"}\n\nSkeleton:\n${kitExample(dev)}`;
    },
  },
  {
    name: "studio_tokens", icon: "token", desc: "Exact CSS variables and guidelines of a design system",
    params: { system: "design system id or name; defaults to the active one" },
    run: (a) => { const ds = activeDS(a); return `${ds.name}\n${tokensCss(ds)}\n\n${ds.guidelines.slice(0, 1800)}`; },
  },
  {
    name: "studio_systems", icon: "dashboard_customize", desc: "List all design systems with ids",
    params: {},
    run: () => DESIGN_SYSTEMS.map((d) => `${d.id}: ${d.name} (${d.vendor}). ${d.tags.join(", ")}`).join("\n"),
  },
  {
    name: "studio_screens", icon: "web_asset", desc: "List the screens on the current canvas page",
    params: {},
    run: () => {
      const s = useStore.getState();
      const l = s.artboards.filter((b) => b.pageId === s.activePageId);
      return l.length ? l.map((b) => `id=${b.id} name="${b.name}" ${b.device} ${b.w}x${b.h} v${b.version}`).join("\n") : "The canvas page is empty.";
    },
  },
  {
    name: "studio_read_screen", icon: "code", desc: "Read the HTML of a screen by id",
    params: { id: "screen id" },
    run: (a) => { const b = board(a); return b ? stripKit(b.html).slice(0, 14000) : "No such screen. Call studio_screens first."; },
  },
  {
    name: "studio_lint", icon: "rule", desc: "Run the design-law pass and the layout audit on a screen",
    params: { id: "screen id" },
    run: async (a) => {
      const b = board(a);
      if (!b) return "No such screen. Call studio_screens first.";
      const ds = getDS(useStore.getState().settings.designSystemId);
      const fixed = harden(b.html, ds);
      let issues: string[] = [];
      try { issues = (await auditHtml(b.html, b.w, b.h)).map((i) => `${i.severe ? "severe" : "minor"}: ${i.msg}`); } catch { issues = ["audit unavailable"]; }
      return [`Laws: ${fixed.fixes.length ? fixed.fixes.join("; ") : "clean"}`, `Layout: ${issues.length ? issues.join("; ") : "no defects"}`].join("\n");
    },
  },
  {
    name: "studio_svg_chart", icon: "bar_chart", desc: "Generate a clean token-colored inline SVG chart (area or bar) from data values and labels",
    params: { kind: "area | bar", values: "comma-separated numbers", labels: "comma-separated axis labels" },
    run: (a) => buildSvgChart(str(a.kind, "area"), str(a.values ?? a.query, "28,42,36,58,52,74,88"), str(a.labels, "Mon,Tue,Wed,Thu,Fri,Sat,Sun")),
  },
  {
    name: "studio_blueprint", icon: "layers", desc: "Get a complete structural blueprint and starter skeleton for a request and device",
    params: { query: "screen type or product", device: "mobile | web" },
    run: (a) => {
      const dev: Device = str(a.device) === "web" ? "web" : "mobile";
      const ds = activeDS(a);
      return `${studioBrief(str(a.query, "dashboard"), ds, dev)}\n\nStarter HTML:\n${kitExample(dev)}`;
    },
  },
  {
    name: "studio_export_react", icon: "terminal", desc: "Convert a canvas screen into a self-contained React TSX component",
    params: { id: "screen id or name" },
    run: (a) => {
      const b = board(a);
      if (!b) return "No such screen. Call studio_screens first.";
      const body = (/<body[^>]*>([\s\S]*?)<\/body>/i.exec(stripKit(b.html))?.[1] ?? stripKit(b.html))
        .replace(/\bclass=/g, "className=")
        .replace(/\bfor=/g, "htmlFor=")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();
      const compName = b.name.replace(/[^a-zA-Z0-9]/g, "") || "ZeusScreen";
      return `export default function ${compName}() {\n  return (\n    <div className="zeus-screen">\n${body.slice(0, 10000)}\n    </div>\n  );\n}`;
    },
  },
];

export const studioEnabled = () => useStore.getState().settings.studioOn;
export const isStudioTool = (name: string) => STUDIO_TOOLS.some((t) => t.name === name);

export function parseToolArgs(raw: string | undefined): Args {
  let path = "", body = "";
  try { const j = JSON.parse(raw ?? "{}"); path = str(j.path); body = str(j.body); } catch { body = raw ?? ""; }
  if (body.trim().startsWith("{")) {
    try { const o = JSON.parse(body); if (o && typeof o === "object") return { query: path, id: path, ...o }; } catch { /* plain text */ }
  }
  const one = body || path;
  return { query: one, id: one, seed: one, mood: one, system: one, fg: path, bg: body };
}

export async function runStudioTool(name: string, raw: string | undefined): Promise<{ ok: boolean; output: string }> {
  const t = STUDIO_TOOLS.find((x) => x.name === name);
  if (!t) return { ok: false, output: `Unknown studio tool ${name}` };
  if (!studioEnabled()) return { ok: false, output: "Zeus Studio is turned off in Connectors" };
  try { return { ok: true, output: String(await t.run(parseToolArgs(raw))).slice(0, 7000) }; } catch (e) { return { ok: false, output: (e as Error).message }; }
}

export function studioToolsPrompt(): string {
  if (!studioEnabled()) return "";
  return ["Zeus Studio (built in, instant; BODY is a JSON object of arguments, or empty):", ...STUDIO_TOOLS.map((t) => `- name="${t.name}" {${Object.keys(t.params).join(", ")}} ${t.desc}`)].join("\n");
}
