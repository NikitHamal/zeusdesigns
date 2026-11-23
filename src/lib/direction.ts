// Art direction picker. Adapted from the direction library idea in nexu-io/open-design
// (apps/daemon/src/prompts/directions.ts): the host commits to ONE concrete visual posture per brief so the
// model never falls back to the default hero + three cards template. Fonts are limited to the bundled set
// (src/lib/fonts.ts). No shadows, no gradients, no emoji: the app laws apply to every direction.

export interface Direction {
  id: string;
  name: string;
  match: RegExp;
  fonts: string;
  posture: string[];
  moves: string[];
}

export const DIRECTIONS: Direction[] = [
  {
    id: "editorial", name: "Editorial",
    match: /\b(blog|magazine|journal|article|editorial|essay|publication|news|press|portfolio|story|cookbook|recipe|restaurant|cafe|boutique|bakery|hotel|travel)\b/i,
    fonts: "Fraunces or Instrument Serif for headlines (one weight, large), Inter or DM Sans for body, JetBrains Mono for kickers and metadata",
    posture: [
      "Large serif headlines at 56 to 96px with tight leading, one column of readable body copy at 62ch",
      "Hairline rules and whitespace do the structure, flat paper surface, one decisive accent used twice at most",
      "Kickers in mono uppercase, numbered sections, captions under every image block",
    ],
    moves: ["a running index down the left edge", "a pull quote that breaks the grid", "a full-bleed typographic opener with no image", "a table of contents as the hero"],
  },
  {
    id: "precision", name: "Precision software",
    match: /\b(saas|landing|startup|api|developer|devtool|platform|product|analytics|docs|changelog|pricing|b2b|ai)\b/i,
    fonts: "Inter for everything, tight tracking on display sizes (-0.02em), JetBrains Mono for numerics and code",
    posture: [
      "Hairline borders only, 4px radius or less, tabular numerals, dense but breathable rows",
      "One real product surface as the hero (a live-looking table, command palette, timeline or diff), never an illustration",
      "Color is meaning: one action color, status colors for state, everything else neutral",
    ],
    moves: ["a split hero where the right half is the product itself, cropped at the edge", "a keyboard-shortcut strip as navigation", "a changelog timeline instead of feature cards", "a before and after diff as the proof"],
  },
  {
    id: "human", name: "Human and approachable",
    match: /\b(app|mobile|onboarding|wellness|habit|fitness|meditation|kids|learn|education|course|social|chat|dating|food|delivery|booking|marketplace|shop|store|commerce|fintech|bank|wallet|budget)\b/i,
    fonts: "Plus Jakarta Sans for headings with strong weight contrast, DM Sans for body",
    posture: [
      "Generous radii (16 to 28px), large touch targets, a clear primary action on every screen",
      "Tonal surfaces layered by value, not by outline; color separates moments (today, upcoming, done)",
      "Real content: names, amounts, times, places, progress. No lorem, no Item 1",
    ],
    moves: ["one oversized number as the focal point of the screen", "a horizontal day or step scrubber as navigation", "a bottom sheet that already holds the next decision", "a single large card that changes state through the screen set"],
  },
  {
    id: "utility", name: "Dense utility",
    match: /\b(dashboard|admin|crm|erp|monitor|ops|inventory|logistics|trading|terminal|console|table|report|kanban|backoffice|control|fleet|incident|metrics)\b/i,
    fonts: "Inter for labels, JetBrains Mono for every number and identifier, Manrope for section titles",
    posture: [
      "Information per square inch: 36 to 40px rows, sticky headers, inline sparklines and status dots",
      "A persistent left rail or top filter bar, content on a strict 8px grid, no decorative cards",
      "Every number has a unit and a delta, every row has an action, empty and error states are designed",
    ],
    moves: ["a master list with a pinned detail pane", "a time axis shared by every chart on the screen", "a command bar as the primary control", "a queue board with aging colors"],
  },
  {
    id: "brutal", name: "Neo-brutalist",
    match: /\b(brutal|bold|loud|poster|zine|creative|studio|agency|music|festival|event|gallery|art|fashion|streetwear|punk|game|gaming)\b/i,
    fonts: "Space Grotesk at heavy weights for headlines, JetBrains Mono for labels",
    posture: [
      "2px solid black borders, zero radius or full pills, flat saturated blocks (yellow, red, green, orange), black text",
      "Oversized type that is cropped by the frame, stickers made of borders only, visible grid",
      "No shadows, no gradients: contrast comes from blocks of flat color and thick rules",
    ],
    moves: ["a two-line headline whose second line is inverted", "a numbered list of giant rows that act as navigation", "a collage of flat color blocks with one cropped word", "a ticket or label as the primary component"],
  },
  {
    id: "calm", name: "Calm craft",
    match: /\b(note|notes|writing|read|reader|focus|calendar|planner|todo|task|knowledge|wiki|library|mail|inbox|assistant|chatbot)\b/i,
    fonts: "Fraunces for titles at modest sizes, Inter or DM Sans for body, warm neutral surfaces",
    posture: [
      "Warm off-white and deep ink, one muted accent, 8 to 12px radii, quiet borders",
      "A narrow reading column at the center, supporting tools pushed to the edges and revealed on hover or focus",
      "Slow, spacious rhythm: 24 to 40px between groups, nothing competes with the content",
    ],
    moves: ["a single composer-style input as the whole screen", "a margin of notes beside the main column", "a day timeline that doubles as the list", "a command palette over a nearly empty page"],
  },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Choose a direction by subject keywords, otherwise by a stable hash so different briefs differ. */
export function pickDirection(brief: string): { dir: Direction; move: string } {
  const text = brief.toLowerCase();
  const named = DIRECTIONS.find((d) => text.includes(d.id) || text.includes(d.name.toLowerCase()));
  const scored = DIRECTIONS.map((d) => ({ d, n: (text.match(new RegExp(d.match.source, "gi")) ?? []).length }))
    .sort((a, b) => b.n - a.n);
  const h = hash(text);
  const dir = named ?? (scored[0].n > 0 ? scored[0].d : DIRECTIONS[h % DIRECTIONS.length]);
  return { dir, move: dir.moves[(h >>> 3) % dir.moves.length] };
}

export function directionPrompt(brief: string): string {
  const { dir, move } = pickDirection(brief);
  return `## Art direction for this brief: ${dir.name}
The host picked this direction so the result is a decision, not a template. Follow it unless the user names another look, a brand or a design system rule that conflicts.
- Type: ${dir.fonts}.
${dir.posture.map((p) => `- ${p}.`).join("\n")}
- Signature move for this brief: ${move}. Build the screen around it.
- If the user says "another direction", "different" or "redo", switch to a structurally different composition, not a recolor.`;
}
