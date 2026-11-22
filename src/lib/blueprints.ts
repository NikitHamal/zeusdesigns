// Archetype blueprints: the section-by-section anatomy of a screen that ships. Injected into the prompt based on the request,
// so even a small model starts from a layout a design lead would recognise instead of inventing one.
import type { Device } from "../types";

interface Blueprint { id: string; match: RegExp; mobile: string; web: string }

const BP: Blueprint[] = [
  {
    id: "auth", match: /(login|log.?in|sign.?in|sign.?up|register|auth|password|onboard|welcome|get started)/i,
    mobile: "Top: back icon button. Brand mark and one-line headline (z-h1). Form block with 2 or 3 z-input fields, the primary z-btn block directly under the last field, one text link for the alternate path. Social sign-in row only if asked. Content is vertically centered in the free space, the legal line sits at the bottom. For onboarding: one illustration built from flat shapes, headline, one sentence, progress dots, primary action, skip text button.",
    web: "Two columns 50/50. Left: brand, headline, 3 proof points with check icons. Right: a z-card form 400px wide, centered, with fields, primary button, alternate link. No decorative gradients.",
  },
  {
    id: "notes", match: /(\bnotes?\b|to-?do|task list|habit|reminder|productiv|journal|checklist|read.?later|bookmark)/i,
    mobile: "Appbar: a z-h1 title at 28px, one search z-icon-btn. A z-chips row of 4 filters (All, Pinned, Shared, Archived), first on. A single featured z-card accent holding the one number that matters at z-display size and a one-line status. Then a z-list of 6 z-item rows: title in z-title, one real detail line, trailing date or state in z-small; no decorative circle icon on every row, use a z-badge only on the 1 or 2 rows that need a state. A z-fab above the pinned bottom z-nav (4 destinations, first on). The list scrolls inside z-page.",
    web: "z-shell: left z-side with workspace name, 5 folders with counts, a New note z-btn at the bottom. Middle column 360px z-list of 8 notes with title, excerpt line and date, one selected. Right column: the open note with a z-h1 title, a z-chips row of tags, 3 paragraphs of real content and a checklist block.",
  },
  {
    id: "dashboard", match: /(dash|analytic|finance|bank|wallet|fitness|admin|stats|crm|report|portfolio|invest|budget|health|track)/i,
    mobile: "Appbar with greeting and avatar. One summary hero (z-hero) with the key number at z-display size and a delta badge. Row of 3 to 4 quick actions (z-icon-btn with label). A section titled by what it shows with 5 z-item rows, each with a lead icon, title, subtitle, trailing value. One chart card with inline SVG. Bottom z-nav with 4 destinations, first selected.",
    web: "z-shell with left z-side (logo, 6 nav items, active state, user at the bottom) and z-main. Top z-top with page title, search z-input, primary action. Row of 4 z-stat cards with delta. Then a 2:1 grid: large chart card (inline SVG with axes and 6+ data points) and a recent activity z-list of 5 rows. Then a z-table of 6 rows with status z-badge.",
  },
  {
    id: "shop", match: /(shop|store|e-?commerce|product|cart|checkout|market|fashion|boutique|catalog)/i,
    mobile: "Appbar with search field and cart icon button with count. z-chips row for categories. Featured z-hero with offer and action. z-grid-2 product cards: z-img block with a flat shape illustration, name, price in z-title, small rating row, a quick add icon button. At least 6 products with real names and prices. Bottom z-nav.",
    web: "Top z-top with logo, 5 category links, search, cart. Hero split: headline and action left, product image block right. Row of 4 product cards, a feature strip with 3 service points, a second row of 4 products, footer with 4 link columns.",
  },
  {
    id: "feed", match: /(feed|social|post|timeline|news|chat|story|message|community|forum)/i,
    mobile: "Appbar with brand and two icon buttons. Story row of 5 z-avatar circles with names. Then 3 post cards: avatar, name, time, body text, a z-img media block, action row (like, comment, share with counts). Bottom z-nav with a center add action.",
    web: "Three columns: left nav, center feed of post cards (max 640px), right rail with suggestions z-list and trends. Sticky top bar.",
  },
  {
    id: "player", match: /(music|player|podcast|audio|song|spotify|playlist|radio)/i,
    mobile: "Appbar with chevron down, title Now playing, more icon. Large square cover built from flat shapes. Title and artist, a heart icon button. Progress z-bar with times. Transport row: shuffle, previous, a large filled play z-icon-btn in var(--primary), next, repeat. Below: up next z-list of 3 rows. Pinned mini controls are not needed on this screen.",
    web: "z-shell with sidebar of playlists, main area with a large header (cover, title, meta, play button), a numbered track z-table of 8 rows, and a fixed player bar at the bottom with controls and progress.",
  },
  {
    id: "settings", match: /(setting|preference|profile|account|privacy|notification)/i,
    mobile: "Appbar with back and title. Profile header: z-avatar, name, email, edit button. Grouped z-list sections of 3 to 5 rows each with lead icon, label, current value or z-switch, chevron. Section titles in z-small z-muted. A destructive text action at the end. Bottom z-nav if it is a tab.",
    web: "Settings page: left list of sections with the active one highlighted, right content with grouped z-card blocks holding label, description-free rows with controls aligned right, and a save action in the footer.",
  },
  {
    id: "landing", match: /(landing|marketing|homepage|saas|hero|pricing|website|startup|agency|launch)/i,
    mobile: "Top bar with logo and menu icon. Hero: one headline (z-h1), one sentence, primary and secondary z-btn, then a product UI fragment built from kit components. Proof row of 3 numbers. 3 feature blocks, each with an icon, a title, one line and a small UI fragment. One testimonial card with a real quote and name. Closing hero block with one action.",
    web: "Sticky z-top with logo, 4 links, a sign-in text button and a primary button. Hero 56/44 split: z-display headline, one sentence, two buttons on the left, a product UI mockup built from z-card parts on the right. Logo-free proof row with 3 big numbers. 3 feature rows alternating sides, each with a UI fragment. Pricing with 3 z-card tiers where the middle one uses var(--container). FAQ of 4 rows. Closing band with one action. Footer with 4 columns.",
  },
  {
    id: "detail", match: /(detail|article|recipe|property|listing|event|ticket|booking|travel|trip|hotel|movie|course|lesson|meditat|wellness|calm|sleep)/i,
    mobile: "Top media block (flat-shape illustration, 40% of the height) with back and bookmark icon buttons floating on it. A z-card sheet overlapping upward with title (z-h1), meta row (rating, duration, price) with icons, 2 short paragraphs, a z-chips row for attributes, and a sticky bottom bar with the price and one primary z-btn.",
    web: "Breadcrumb row, 60/40 split: large media block left; right column with title, meta, price, selection controls, primary and secondary actions. Below: tab row with content, then a related items grid of 4.",
  },
  {
    id: "kanban", match: /(kanban|board|sprint|roadmap|backlog|issue|jira|linear|task board)/i,
    mobile: "Appbar with project name, filter icon and add button. z-segs or z-Tabs for status columns (Planned, In progress, Review, Done). Summary z-banner with sprint progress bar. Stack of 4 task z-card items with priority z-badge, title, assignee z-avatar, due date and subtask count. Bottom z-nav.",
    web: "z-shell with left z-side project navigation and z-main. Top z-top with sprint title, member avatars, filter z-chips, and New issue z-btn. 3-column grid (z-grid-3) for Planned, In Progress, Done; each column has a header with count badge and 3 task z-card blocks with ID, title, tag z-badge, and assignee z-avatar.",
  },
  {
    id: "chat", match: /(messenger|direct message|inbox|support chat|assistant|conversation|dm|slack|discord)/i,
    mobile: "Appbar with back button, contact z-avatar, name, and call/more icon buttons. Date divider pill. 4 message bubbles alternating left (z-card tonal) and right (z-card accent) with timestamps and one attachment or action card. Pinned bottom composer row with add icon button, z-input field, and filled send z-icon-btn.",
    web: "z-shell with left conversation list (search z-input + 6 contact z-item rows with unread badges) and right chat pane: header bar with contact details, message stream of 5 rich turns, and bottom z-card composer with attachment and send controls.",
  },
  {
    id: "calendar", match: /(calendar|schedule|planner|booking|appointment|timetable|agenda)/i,
    mobile: "Appbar with month title, today chip, and add button. 7-column week strip (z-days > z-day) with one selected day. Time-blocked agenda z-list of 5 events, each showing start-end time, title, location or room, and participant z-avatar. Bottom z-nav.",
    web: "z-shell with left z-side (mini month grid, calendar filters, upcoming list) and z-main: top toolbar with view z-segs (Day, Week, Month) and New event z-btn, followed by a 5-day schedule grid with time slots and tonal event blocks.",
  },
];

export function blueprintFor(prompt: string, device: Device | undefined): string {
  const hit = BP.find((b) => b.match.test(prompt));
  if (!hit) {
    const w = device === "web" || (!device && /(web|site|desktop)/i.test(prompt));
    return `## Anatomy (no archetype matched, so use this)\n${w
      ? "Sticky z-top with logo, 4 links and one primary z-btn. A hero with a z-display headline for the product's real job, one sentence and one action, next to a UI fragment built from kit parts. A row of 3 proof numbers. 2 feature blocks that each show a real UI fragment. A closing band with one action."
      : "Appbar with a z-h1 title and one icon button. One summary z-card accent with the key number at z-display size. A z-chips row of filters. A z-list of 5 or 6 z-item rows with title, one real detail and a trailing value. A pinned bottom z-nav with 4 labelled destinations, first on."}\nUse real names, numbers and dates from the user's domain. Each of the 3 variants must change the structure (list-first, card-grid, hero-first), not only the colors.`;
  }
  const web = device === "web" || (!device && /(web|site|desktop|dashboard|landing)/i.test(prompt));
  return `## Blueprint for this request (${hit.id}, ${web ? "web" : "mobile"})\nFollow this anatomy, replacing every label with specific content for the user's product:\n${web ? hit.web : hit.mobile}`;
}
