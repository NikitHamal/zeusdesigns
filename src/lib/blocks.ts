// Component & Auto-Layout Block Catalog for Figma-style drag-and-drop and 1-click visual canvas authoring.
// Every block is built with the .z-* design-system kit and Material Symbols (<i data-i="..."></i>) so it automatically
// adapts to any of the 13 built-in design systems (Material 3 Expressive, Apple HIG, Fluent 2, shadcn/ui, etc.).
import { getDS, type DesignSystem } from "./designSystems";
import { harden } from "./harness";
import { buildSvgChart } from "./studio";
import type { Device } from "../types";

export type BlockCategory = "navigation" | "hero" | "cards" | "lists" | "forms" | "primitives";

export interface UIBlock {
  id: string;
  name: string;
  category: BlockCategory;
  icon: string;
  desc: string;
  slot?: "top" | "bottom" | "page";
  html: () => string;
}

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string; icon: string }[] = [
  { id: "primitives", label: "Layout & Basics", icon: "layers" },
  { id: "navigation", label: "Navigation", icon: "menu" },
  { id: "hero", label: "Hero & Banners", icon: "web_asset" },
  { id: "cards", label: "Cards & Charts", icon: "dashboard" },
  { id: "lists", label: "Lists & Tables", icon: "list" },
  { id: "forms", label: "Forms & Inputs", icon: "tune" },
];

export const UI_BLOCKS: UIBlock[] = [
  // Primitives & Auto-Layout
  {
    id: "auto_row",
    name: "Auto-Layout Row",
    category: "primitives",
    icon: "arrow_forward",
    desc: "Horizontal flex row with space-between alignment",
    html: () => `<div class="z-row z-between"><span class="z-h3">Section title</span><button class="z-btn text sm">See all</button></div>`,
  },
  {
    id: "auto_col",
    name: "Auto-Layout Column",
    category: "primitives",
    icon: "arrow_downward",
    desc: "Vertical flex stack with 12px gap",
    html: () => `<div class="z-col"><div class="z-title">Column heading</div><div class="z-body z-muted">Add or drag elements into this vertical stack.</div></div>`,
  },
  {
    id: "grid_2",
    name: "2-Column Grid",
    category: "primitives",
    icon: "grid_view",
    desc: "Equal 2-column responsive grid",
    html: () => `<div class="z-grid-2"><div class="z-card"><div class="z-small z-muted">Column 1</div><div class="z-title">Primary item</div></div><div class="z-card"><div class="z-small z-muted">Column 2</div><div class="z-title">Secondary item</div></div></div>`,
  },
  {
    id: "heading_block",
    name: "Section Header",
    category: "primitives",
    icon: "text_fields",
    desc: "Section heading with trailing action",
    html: () => `<div class="z-row z-between"><h2 class="z-h2">Recent activity</h2><span class="z-small z-primary">View all</span></div>`,
  },
  {
    id: "button_primary",
    name: "Primary Button",
    category: "primitives",
    icon: "ads_click",
    desc: "Filled primary action button",
    html: () => `<button class="z-btn"><i data-i="bolt" class="sm"></i>Continue</button>`,
  },
  {
    id: "button_tonal",
    name: "Tonal Button",
    category: "primitives",
    icon: "smart_button",
    desc: "Secondary tonal container button",
    html: () => `<button class="z-btn tonal"><i data-i="add" class="sm"></i>Add item</button>`,
  },
  {
    id: "fab_button",
    name: "Floating Action (FAB)",
    category: "primitives",
    icon: "add",
    desc: "Pinned floating action button",
    html: () => `<button class="z-fab"><i data-i="add"></i></button>`,
  },
  {
    id: "divider",
    name: "Divider",
    category: "primitives",
    icon: "remove",
    desc: "1px outline separator line",
    html: () => `<hr class="z-divider" />`,
  },

  // Navigation
  {
    id: "appbar",
    name: "Mobile App Bar",
    category: "navigation",
    icon: "smartphone",
    desc: "Top header with title and icon buttons",
    slot: "top",
    html: () => `<header class="z-appbar"><h1>Workspace</h1><button class="z-icon-btn"><i data-i="search"></i></button><button class="z-icon-btn tonal"><i data-i="notifications"></i></button></header>`,
  },
  {
    id: "bottom_nav",
    name: "Bottom Navigation",
    category: "navigation",
    icon: "bottom_navigation",
    desc: "4-tab pinned mobile navigation bar",
    slot: "bottom",
    html: () => `<nav class="z-nav"><a class="z-nav-item on"><span class="z-nav-pill"><i data-i="home" data-fill></i></span>Home</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="explore"></i></span>Explore</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="analytics"></i></span>Insights</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="person"></i></span>Profile</a></nav>`,
  },
  {
    id: "top_nav",
    name: "Web Top Bar",
    category: "navigation",
    icon: "web",
    desc: "Desktop top navigation bar with CTA",
    slot: "top",
    html: () => `<header class="z-top"><div class="z-row z-grow"><i data-i="layers" class="z-primary"></i><strong class="z-h3">Northwind</strong><span class="z-muted z-small" style="margin-left:16px">Overview</span><span class="z-muted z-small">Projects</span><span class="z-muted z-small">Analytics</span></div><button class="z-btn sm">New project</button></header>`,
  },
  {
    id: "chips_row",
    name: "Filter Chips Bar",
    category: "navigation",
    icon: "filter_list",
    desc: "Horizontal selectable filter pills",
    html: () => `<div class="z-chips"><span class="z-chip on">Overview</span><span class="z-chip">Active</span><span class="z-chip">Pinned</span><span class="z-chip">Completed</span></div>`,
  },
  {
    id: "segmented",
    name: "Segmented Switcher",
    category: "navigation",
    icon: "view_column_2",
    desc: "Connected 3-option segmented control",
    html: () => `<div class="z-segs"><span class="z-seg on">Day</span><span class="z-seg">Week</span><span class="z-seg">Month</span></div>`,
  },
  {
    id: "tabs_bar",
    name: "Underline Tabs",
    category: "navigation",
    icon: "tab",
    desc: "Tab bar with active bottom indicator",
    html: () => `<div class="z-tabs"><span class="z-tab on">Summary</span><span class="z-tab">Activity</span><span class="z-tab">Settings</span></div>`,
  },

  // Hero & Banners
  {
    id: "hero_card",
    name: "Hero Metric Card",
    category: "hero",
    icon: "auto_awesome",
    desc: "Featured container with display metric, progress bar, and CTA",
    html: () => `<section class="z-hero"><div class="z-row z-between"><span class="z-small">Monthly target</span><span class="z-badge">+14.2%</span></div><h2 class="z-display">$24,840</h2><div class="z-bar"><i style="width:76%"></i></div><div class="z-row z-between"><span class="z-small">18 of 22 milestones completed</span><button class="z-btn sm">Review</button></div></section>`,
  },
  {
    id: "promo_banner",
    name: "Tonal Banner",
    category: "hero",
    icon: "campaign",
    desc: "Compact callout banner with icon and action",
    html: () => `<div class="z-banner"><i data-i="bolt"></i><div class="z-grow"><div class="z-title">Sync completed</div><div class="z-small">All 14 design tokens are up to date</div></div><button class="z-btn sm">Open</button></div>`,
  },

  // Cards & Charts
  {
    id: "bento_2",
    name: "Bento Summary Pair",
    category: "cards",
    icon: "dashboard_customize",
    desc: "2-up Bento cards with icon, title, and metadata",
    html: () => `<div class="z-grid-2"><div class="z-card tonal"><div class="z-row z-between"><i data-i="trending_up" class="sm z-primary"></i><span class="z-small z-muted">Today</span></div><div class="z-stat"><span class="v">94.8%</span></div><div class="z-small z-muted">Completion rate</div></div><div class="z-card"><div class="z-row z-between"><i data-i="schedule" class="sm z-muted"></i><span class="z-small z-muted">Queue</span></div><div class="z-stat"><span class="v">12m</span></div><div class="z-small z-muted">Median response</div></div></div>`,
  },
  {
    id: "kpi_grid",
    name: "3-Column KPI Row",
    category: "cards",
    icon: "analytics",
    desc: "Three metric cards with delta pills and bars",
    html: () => `<div class="z-grid-3"><div class="z-card"><div class="z-stat"><span class="z-muted z-small">Net volume</span><div class="z-kpi"><span class="v">$48,210</span><span class="delta">+14.2%</span></div></div><div class="z-bar"><i style="width:74%"></i></div></div><div class="z-card"><div class="z-stat"><span class="z-muted z-small">Active users</span><div class="z-kpi"><span class="v">3,842</span><span class="delta">+8.1%</span></div></div><div class="z-bar"><i style="width:64%"></i></div></div><div class="z-card accent"><div class="z-stat"><span class="z-small">Uptime</span><span class="v">99.98%</span></div><span class="z-small">All regions healthy</span></div></div>`,
  },
  {
    id: "chart_area",
    name: "Area Chart Card",
    category: "cards",
    icon: "insights",
    desc: "Token-colored inline SVG area chart inside a card",
    html: () => `<div class="z-card"><div class="z-row z-between"><div><div class="z-small z-muted">Weekly trend</div><div class="z-h2">$18,420</div></div><span class="z-badge">+12.4%</span></div>${buildSvgChart("area", "32,48,44,62,58,78,94", "Mon,Tue,Wed,Thu,Fri,Sat,Sun")}</div>`,
  },
  {
    id: "chart_bar",
    name: "Bar Chart Card",
    category: "cards",
    icon: "bar_chart",
    desc: "Token-colored inline SVG bar chart inside a card",
    html: () => `<div class="z-card"><div class="z-row z-between"><div><div class="z-small z-muted">Daily throughput</div><div class="z-h2">1,284 ops</div></div><span class="z-badge">Peak Sat</span></div>${buildSvgChart("bar", "40,56,48,72,66,92,84", "M,T,W,T,F,S,S")}</div>`,
  },

  // Lists & Tables
  {
    id: "list_group",
    name: "List Group (3 rows)",
    category: "lists",
    icon: "list",
    desc: "Structured list card with lead icons and badges",
    html: () => `<div class="z-list"><div class="z-item"><span class="z-lead"><i data-i="description"></i></span><div class="z-grow"><div class="z-title">Q4 Architecture Review</div><div class="z-muted z-small">Updated 14m ago · Maya Chen</div></div><span class="z-badge">Active</span></div><div class="z-item"><span class="z-lead"><i data-i="task_alt"></i></span><div class="z-grow"><div class="z-title">Design Token Audit</div><div class="z-muted z-small">7 of 8 checks passed</div></div><span class="z-small z-muted">11:20</span></div><div class="z-item"><span class="z-lead"><i data-i="folder"></i></span><div class="z-grow"><div class="z-title">Release Assets v2.4</div><div class="z-muted z-small">Production bundle verified</div></div><span class="z-small z-muted">Yesterday</span></div></div>`,
  },
  {
    id: "list_item",
    name: "Single List Row",
    category: "lists",
    icon: "check_circle",
    desc: "Individual list item row with icon and metadata",
    html: () => `<div class="z-item" style="border:1px solid var(--outline);border-radius:var(--r-card)"><span class="z-lead"><i data-i="bolt"></i></span><div class="z-grow"><div class="z-title">Instant deployment</div><div class="z-muted z-small">Triggered from main branch</div></div><span class="z-badge">Done</span></div>`,
  },
  {
    id: "data_table",
    name: "Data Table",
    category: "lists",
    icon: "table_chart",
    desc: "Clean 4-column table with status badges",
    html: () => `<div class="z-card bleed"><table class="z-table"><tr><th>Invoice</th><th>Customer</th><th>Status</th><th>Amount</th></tr><tr><td>#4821</td><td>Maya Chen</td><td><span class="z-badge">Paid</span></td><td>$420.00</td></tr><tr><td>#4820</td><td>Lucas Vance</td><td><span class="z-badge">Shipped</span></td><td>$640.00</td></tr><tr><td>#4819</td><td>Elena Rostova</td><td><span class="z-badge">Paid</span></td><td>$195.00</td></tr></table></div>`,
  },
  {
    id: "week_strip",
    name: "7-Day Calendar Strip",
    category: "lists",
    icon: "calendar_today",
    desc: "7-column day selector strip",
    html: () => `<div class="z-days"><div class="z-day"><span class="z-muted">M</span><span>12</span></div><div class="z-day"><span class="z-muted">T</span><span>13</span></div><div class="z-day on"><span>W</span><span>14</span></div><div class="z-day"><span class="z-muted">T</span><span>15</span></div><div class="z-day"><span class="z-muted">F</span><span>16</span></div><div class="z-day"><span class="z-muted">S</span><span>17</span></div><div class="z-day"><span class="z-muted">S</span><span>18</span></div></div>`,
  },

  // Forms & Inputs
  {
    id: "search_bar",
    name: "Search Input Bar",
    category: "forms",
    icon: "search",
    desc: "Input field with leading search icon",
    html: () => `<label class="z-input"><i data-i="search" class="sm z-muted"></i><input placeholder="Search projects, notes, or commands…" /></label>`,
  },
  {
    id: "input_field",
    name: "Labeled Input Field",
    category: "forms",
    icon: "edit",
    desc: "Form field with label and text input",
    html: () => `<label class="z-field">Work email<div class="z-input"><i data-i="mail" class="sm z-muted"></i><input value="alex@northwind.app" /></div></label>`,
  },
  {
    id: "toggle_row",
    name: "Switch Setting Row",
    category: "forms",
    icon: "toggle_on",
    desc: "Setting row with title, subtitle, and toggle switch",
    html: () => `<div class="z-item" style="border:1px solid var(--outline);border-radius:var(--r-card)"><span class="z-lead"><i data-i="notifications"></i></span><div class="z-grow"><div class="z-title">Push notifications</div><div class="z-muted z-small">Alerts for mentions and reviews</div></div><input type="checkbox" class="z-switch" checked /></div>`,
  },
  {
    id: "login_form",
    name: "Sign-In Card",
    category: "forms",
    icon: "lock",
    desc: "Complete authentication card with email, password, and CTA",
    html: () => `<div class="z-card" style="gap:14px"><h2 class="z-h2">Sign in to Workspace</h2><label class="z-field">Email<div class="z-input"><i data-i="mail" class="sm z-muted"></i><input value="alex@zeus.app" /></div></label><label class="z-field">Password<div class="z-input"><i data-i="lock" class="sm z-muted"></i><input type="password" value="••••••••" /></div></label><button class="z-btn block">Continue</button></div>`,
  },
];

export function findBlock(id: string): UIBlock | undefined {
  return UI_BLOCKS.find((b) => b.id === id);
}

/**
 * Insert a UIBlock into an artboard's HTML document and harden it with the active design system.
 * Works on blank frames, AI-generated frames, and hand-built frames alike.
 */
export function insertBlockIntoHtml(
  currentHtml: string,
  blockId: string,
  ds: DesignSystem = getDS("m3e"),
  device: Device = "mobile"
): string {
  const block = findBlock(blockId);
  if (!block) return currentHtml;
  const snippet = block.html();

  const isBlank =
    !currentHtml ||
    currentHtml.includes("data-zeus-empty-frame") ||
    currentHtml.includes("<b>@@add@@</b>") ||
    currentHtml.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, "").trim().length < 8;

  let nextHtml = currentHtml;

  if (isBlank) {
    const inner =
      block.slot === "top"
        ? `${snippet}<div class="z-page"></div>`
        : block.slot === "bottom"
          ? `<div class="z-page"></div>${snippet}`
          : `<div class="z-page">${snippet}</div>`;
    nextHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div class="z-screen">${inner}</div></body></html>`;
  } else {
    // Parse with DOMParser in browser so we insert into the right container (.z-page, .z-main, .z-screen, or body)
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(currentHtml, "text/html");
      doc.querySelectorAll("[data-zeus-empty-frame]").forEach((n) => n.remove());
      const screen = doc.querySelector(".z-screen, .screen") ?? doc.body;
      const page = doc.querySelector(".z-page, .z-main, .scroll, main") ?? screen;

      const temp = doc.createElement("div");
      temp.innerHTML = snippet;
      const node = temp.firstElementChild;
      if (node) {
        if (block.slot === "top") {
          const existingTop = screen.querySelector(":scope > header, :scope > .z-appbar, :scope > .z-top");
          if (existingTop) existingTop.replaceWith(node);
          else screen.prepend(node);
        } else if (block.slot === "bottom") {
          const existingNav = screen.querySelector(":scope > nav, :scope > .z-nav, :scope > .nav");
          if (existingNav) existingNav.replaceWith(node);
          else screen.appendChild(node);
        } else {
          page.appendChild(node);
        }
      }
      nextHtml = "<!doctype html>" + doc.documentElement.outerHTML;
    } else {
      nextHtml = currentHtml.replace(/<\/body>/i, `${snippet}</body>`);
    }
  }

  // Run harden with partial:true so ensureCompleteScreen doesn't overwrite a user's manual step-by-step build!
  const hardened = harden(nextHtml, ds, { partial: true, device }).html;
  return hardened;
}
