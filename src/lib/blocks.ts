// Component & Auto-Layout Block Catalog for Figma-style drag-and-drop and 1-click visual canvas authoring.
// Every block is built with the .z-* design-system kit and Material Symbols (<i data-i="..."></i>) so it automatically
// adapts to any of the 13 built-in design systems (Material 3 Expressive, Apple HIG, Fluent 2, shadcn/ui, etc.).
import { getDS, type DesignSystem } from "./designSystems";
import { harden } from "./harness";
import { buildSvgChart } from "./studio";
import type { Device } from "../types";

export type BlockCategory = "starters" | "navigation" | "hero" | "cards" | "lists" | "forms" | "primitives";

export interface UIBlock {
  id: string;
  name: string;
  category: BlockCategory;
  icon: string;
  desc: string;
  slot?: "top" | "bottom" | "page" | "screen";
  device?: Device;
  html: () => string;
}

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string; icon: string }[] = [
  { id: "starters", label: "Full Layouts", icon: "dashboard_customize" },
  { id: "primitives", label: "Layout & Basics", icon: "layers" },
  { id: "navigation", label: "Navigation", icon: "menu" },
  { id: "hero", label: "Hero & Banners", icon: "web_asset" },
  { id: "cards", label: "Cards & Charts", icon: "dashboard" },
  { id: "lists", label: "Lists & Tables", icon: "list" },
  { id: "forms", label: "Forms & Inputs", icon: "tune" },
];

export const UI_BLOCKS: UIBlock[] = [
  // Full Screen Starters (1-click or drag-and-drop complete layouts)
  {
    id: "starter_mobile_notes",
    name: "Notes & Knowledge Base",
    category: "starters",
    icon: "description",
    desc: "Complete mobile notes screen with quota hero, pinned Bento grid, and notes list",
    slot: "screen",
    device: "mobile",
    html: () => `<div class="z-screen"><header class="z-appbar"><h1>Notes</h1><button class="z-icon-btn"><i data-i="search"></i></button><button class="z-icon-btn tonal"><i data-i="add"></i></button></header><div class="z-page"><section class="z-hero"><div class="z-row z-between"><span class="z-small">Weekly capture</span><span class="z-badge">6 pinned</span></div><h2 class="z-display">24 notes</h2><div class="z-bar"><i style="width:78%"></i></div><div class="z-row z-between"><span class="z-small">5 of 6 focus docs reviewed</span><button class="z-btn sm">New note</button></div></section><div class="z-chips"><span class="z-chip on">All notes</span><span class="z-chip">Pinned</span><span class="z-chip">Product</span><span class="z-chip">Journal</span></div><div class="z-grid-2"><div class="z-card tonal"><div class="z-row z-between"><i data-i="push_pin" class="sm z-primary"></i><span class="z-small z-muted">14m ago</span></div><div class="z-title">Q4 Strategy</div><div class="z-small z-muted">6 action items · Roadmap</div></div><div class="z-card"><div class="z-row z-between"><i data-i="bookmark" class="sm z-muted"></i><span class="z-small z-muted">Yesterday</span></div><div class="z-title">Design Tokens</div><div class="z-small z-muted">M3E surface scale</div></div></div><div class="z-list"><div class="z-item"><span class="z-lead"><i data-i="description"></i></span><div class="z-grow"><div class="z-title">Architecture Review</div><div class="z-muted z-small">Shadow DOM renderer · 4 decisions</div></div><span class="z-badge">Today</span></div><div class="z-item"><span class="z-lead"><i data-i="checklist"></i></span><div class="z-grow"><div class="z-title">Release Checklist v2.4</div><div class="z-muted z-small">7 of 9 tasks completed</div></div><span class="z-small z-muted">11:20</span></div><div class="z-item"><span class="z-lead"><i data-i="article"></i></span><div class="z-grow"><div class="z-title">Reading: Dieter Rams</div><div class="z-muted z-small">10 principles for good design</div></div><span class="z-small z-muted">Thu</span></div><div class="z-item"><span class="z-lead"><i data-i="shopping_bag"></i></span><div class="z-grow"><div class="z-title">Saturday Farmers Market</div><div class="z-muted z-small">Sourdough, olive oil, figs</div></div><span class="z-small z-muted">Tue</span></div></div></div><nav class="z-nav"><a class="z-nav-item on"><span class="z-nav-pill"><i data-i="description" data-fill></i></span>Notes</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="push_pin"></i></span>Pinned</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="folder"></i></span>Folders</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="person"></i></span>Profile</a></nav></div>`,
  },
  {
    id: "starter_mobile_finance",
    name: "Fintech Wallet & Spend",
    category: "starters",
    icon: "account_balance",
    desc: "Complete mobile banking screen with balance hero, vaults, and transactions",
    slot: "screen",
    device: "mobile",
    html: () => `<div class="z-screen"><header class="z-appbar"><h1>Wallet</h1><button class="z-icon-btn"><i data-i="qr_code_scanner"></i></button><button class="z-icon-btn tonal"><i data-i="notifications"></i></button></header><div class="z-page"><section class="z-hero"><div class="z-row z-between"><span class="z-small">Total balance</span><span class="z-badge">+7.2% this mo</span></div><h2 class="z-display">$18,420</h2><div class="z-bar"><i style="width:72%"></i></div><div class="z-row z-between"><span class="z-small">Card ••4417 active</span><button class="z-btn sm">Send money</button></div></section><div class="z-chips"><span class="z-chip on">All activity</span><span class="z-chip">Cards</span><span class="z-chip">Vaults</span><span class="z-chip">Transfers</span></div><div class="z-grid-2"><div class="z-card tonal"><div class="z-row z-between"><i data-i="savings" class="sm z-primary"></i><span class="z-small z-muted">4.85% APY</span></div><div class="z-title">$6,400.00</div><div class="z-small z-muted">Treasury vault</div></div><div class="z-card"><div class="z-row z-between"><i data-i="credit_card" class="sm z-muted"></i><span class="z-small z-muted">October</span></div><div class="z-title">$1,184.20</div><div class="z-small z-muted">18% under budget</div></div></div><div class="z-list"><div class="z-item"><span class="z-lead"><i data-i="storefront"></i></span><div class="z-grow"><div class="z-title">Whole Foods Market</div><div class="z-muted z-small">Groceries · Apple Pay</div></div><span class="z-title">-$84.17</span></div><div class="z-item"><span class="z-lead"><i data-i="account_balance"></i></span><div class="z-grow"><div class="z-title">Northwind Labs Payroll</div><div class="z-muted z-small">Direct deposit · Cleared</div></div><span class="z-badge">+$4,250</span></div><div class="z-item"><span class="z-lead"><i data-i="local_cafe"></i></span><div class="z-grow"><div class="z-title">Blue Bottle Coffee</div><div class="z-muted z-small">Food & drink · 09:14</div></div><span class="z-title">-$6.50</span></div><div class="z-item"><span class="z-lead"><i data-i="flight"></i></span><div class="z-grow"><div class="z-title">Lufthansa Airlines</div><div class="z-muted z-small">Lisbon return · LH 1175</div></div><span class="z-title">-$342.00</span></div></div></div><nav class="z-nav"><a class="z-nav-item on"><span class="z-nav-pill"><i data-i="account_balance" data-fill></i></span>Home</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="credit_card"></i></span>Cards</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="pie_chart"></i></span>Insights</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="person"></i></span>Profile</a></nav></div>`,
  },
  {
    id: "starter_mobile_fitness",
    name: "Fitness & Workout Tracker",
    category: "starters",
    icon: "fitness_center",
    desc: "Complete mobile training log with weekly volume, 7-day strip, and workouts",
    slot: "screen",
    device: "mobile",
    html: () => `<div class="z-screen"><header class="z-appbar"><h1>Training</h1><button class="z-icon-btn"><i data-i="calendar_today"></i></button><button class="z-icon-btn tonal"><i data-i="bolt"></i></button></header><div class="z-page"><section class="z-hero"><div class="z-row z-between"><span class="z-small">Weekly volume</span><span class="z-badge">12-day streak</span></div><h2 class="z-display">14.8 km</h2><div class="z-bar"><i style="width:74%"></i></div><div class="z-row z-between"><span class="z-small">74% of 20 km goal</span><button class="z-btn sm">Start workout</button></div></section><div class="z-days"><div class="z-day"><span class="z-muted">M</span><span>12</span></div><div class="z-day"><span class="z-muted">T</span><span>13</span></div><div class="z-day on"><span>W</span><span>14</span></div><div class="z-day"><span class="z-muted">T</span><span>15</span></div><div class="z-day"><span class="z-muted">F</span><span>16</span></div><div class="z-day"><span class="z-muted">S</span><span>17</span></div><div class="z-day"><span class="z-muted">S</span><span>18</span></div></div><div class="z-grid-2"><div class="z-card tonal"><div class="z-row z-between"><i data-i="local_fire_department" class="sm z-primary"></i><span class="z-small z-muted">Active</span></div><div class="z-title">1,840 kcal</div><div class="z-small z-muted">+12% vs last week</div></div><div class="z-card"><div class="z-row z-between"><i data-i="favorite" class="sm z-muted"></i><span class="z-small z-muted">Recovery</span></div><div class="z-title">58 bpm</div><div class="z-small z-muted">Optimal readiness</div></div></div><div class="z-list"><div class="z-item"><span class="z-lead"><i data-i="directions_run"></i></span><div class="z-grow"><div class="z-title">Morning Tempo Run</div><div class="z-muted z-small">6.2 km · 5:08 /km pace</div></div><span class="z-badge">31m</span></div><div class="z-item"><span class="z-lead"><i data-i="fitness_center"></i></span><div class="z-grow"><div class="z-title">Upper Body Strength</div><div class="z-muted z-small">Bench press, pull-ups, OHP</div></div><span class="z-small z-muted">45m</span></div><div class="z-item"><span class="z-lead"><i data-i="timer"></i></span><div class="z-grow"><div class="z-title">Mobility & Core Flow</div><div class="z-muted z-small">Thoracic rotation & planks</div></div><span class="z-small z-muted">18m</span></div></div></div><nav class="z-nav"><a class="z-nav-item on"><span class="z-nav-pill"><i data-i="home" data-fill></i></span>Today</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="fitness_center"></i></span>Plans</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="trending_up"></i></span>Progress</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="person"></i></span>Profile</a></nav></div>`,
  },
  {
    id: "starter_mobile_shop",
    name: "E-Commerce Storefront",
    category: "starters",
    icon: "shopping_bag",
    desc: "Complete mobile store with featured product hero, 2-up catalog, and cart summary",
    slot: "screen",
    device: "mobile",
    html: () => `<div class="z-screen"><header class="z-appbar"><h1>Atelier</h1><button class="z-icon-btn"><i data-i="search"></i></button><button class="z-icon-btn tonal"><i data-i="shopping_bag"></i></button></header><div class="z-page"><section class="z-hero"><div class="z-row z-between"><span class="z-small">Autumn Release</span><span class="z-badge">In Stock</span></div><h2 class="z-display">Trail V4</h2><div class="z-row z-between"><span class="z-small">Stone Grey · Vibram Sole · $148</span><button class="z-btn sm">Add to bag</button></div></section><div class="z-chips"><span class="z-chip on">All Footwear</span><span class="z-chip">Trail</span><span class="z-chip">Apparel</span><span class="z-chip">Packs</span></div><div class="z-grid-2"><div class="z-card"><div class="z-row z-between"><span class="z-badge">4.9 ★</span><i data-i="favorite" class="sm z-muted"></i></div><div class="z-title">Merino Overshirt</div><div class="z-small z-muted">Charcoal · $165.00</div></div><div class="z-card tonal"><div class="z-row z-between"><span class="z-badge">New</span><i data-i="favorite" class="sm z-primary"></i></div><div class="z-title">Ultralight Pack 22L</div><div class="z-small z-muted">Ripstop · $120.00</div></div></div><div class="z-list"><div class="z-item"><span class="z-lead"><i data-i="local_shipping"></i></span><div class="z-grow"><div class="z-title">Order #20931 Shipped</div><div class="z-muted z-small">Arrives Thursday via Express</div></div><span class="z-badge">Track</span></div><div class="z-item"><span class="z-lead"><i data-i="storefront"></i></span><div class="z-grow"><div class="z-title">Berlin Flagship Pickup</div><div class="z-muted z-small">Mitte · Ready in 2 hours</div></div><span class="z-small z-muted">Free</span></div></div></div><nav class="z-nav"><a class="z-nav-item on"><span class="z-nav-pill"><i data-i="storefront" data-fill></i></span>Shop</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="search"></i></span>Search</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="shopping_bag"></i></span>Bag</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="person"></i></span>Account</a></nav></div>`,
  },
  {
    id: "starter_web_dashboard",
    name: "Web Analytics Dashboard",
    category: "starters",
    icon: "desktop_windows",
    desc: "Complete desktop SaaS shell with sidebar, KPI row, SVG chart, and orders table",
    slot: "screen",
    device: "web",
    html: () => `<div class="z-shell"><aside class="z-side"><h3 class="z-h2" style="padding:4px 14px 16px">Northwind</h3><a class="z-side-item on"><i data-i="dashboard" data-fill></i>Overview</a><a class="z-side-item"><i data-i="receipt_long"></i>Orders</a><a class="z-side-item"><i data-i="inventory_2"></i>Products</a><a class="z-side-item"><i data-i="group"></i>Customers</a><a class="z-side-item"><i data-i="settings"></i>Settings</a></aside><main class="z-main"><div class="z-row z-between"><h1 class="z-h1">Revenue overview</h1><div class="z-row"><div class="z-segs"><span class="z-seg on">7d</span><span class="z-seg">30d</span><span class="z-seg">12m</span></div><button class="z-btn"><i data-i="add" class="sm"></i>New order</button></div></div><div class="z-grid-3"><div class="z-card"><div class="z-stat"><span class="z-muted z-small">Net volume</span><div class="z-kpi"><span class="v">$48,210</span><span class="delta">+14.2%</span></div></div><div class="z-bar"><i style="width:74%"></i></div></div><div class="z-card"><div class="z-stat"><span class="z-muted z-small">Active orders</span><div class="z-kpi"><span class="v">1,284</span><span class="delta">+6.8%</span></div></div><div class="z-bar"><i style="width:62%"></i></div></div><div class="z-card accent"><div class="z-stat"><span class="z-small">Settlement rate</span><span class="v">99.4%</span></div><span class="z-small">Next payout $12,480</span></div></div><div class="z-card"><div class="z-row z-between"><div><div class="z-small z-muted">Weekly throughput</div><div class="z-h2">$48,210</div></div><span class="z-badge">+14.2% vs last wk</span></div>${buildSvgChart("area", "32,48,44,62,58,78,94", "Mon,Tue,Wed,Thu,Fri,Sat,Sun")}</div><div class="z-card bleed"><table class="z-table"><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr><tr><td>#4821</td><td>Maya Chen</td><td><span class="z-badge">Paid</span></td><td>$212.00</td></tr><tr><td>#4820</td><td>Lucas Vance</td><td><span class="z-badge">Shipped</span></td><td>$640.00</td></tr><tr><td>#4819</td><td>Elena Rostova</td><td><span class="z-badge">Paid</span></td><td>$128.50</td></tr></table></div></main></div>`,
  },
  {
    id: "starter_web_kanban",
    name: "Web Sprint Kanban Board",
    category: "starters",
    icon: "view_column_2",
    desc: "Complete desktop sprint workspace with sidebar and 3-column Kanban board",
    slot: "screen",
    device: "web",
    html: () => `<div class="z-shell"><aside class="z-side"><h3 class="z-h2" style="padding:4px 14px 16px">Linearity</h3><a class="z-side-item"><i data-i="mail"></i>Inbox</a><a class="z-side-item on"><i data-i="dashboard" data-fill></i>Active Sprint</a><a class="z-side-item"><i data-i="folder"></i>Projects</a><a class="z-side-item"><i data-i="analytics"></i>Velocity</a><a class="z-side-item"><i data-i="group"></i>Team</a></aside><main class="z-main"><div class="z-row z-between"><div><h1 class="z-h1">Sprint 24 · Core Canvas</h1><div class="z-small z-muted">Oct 14 – Oct 28 · 18 of 24 points completed</div></div><div class="z-row"><button class="z-btn tonal"><i data-i="filter_list" class="sm"></i>Filter</button><button class="z-btn"><i data-i="add" class="sm"></i>New issue</button></div></div><div class="z-grid-3"><div class="z-col"><div class="z-row z-between"><span class="z-h3">Todo</span><span class="z-badge">2</span></div><div class="z-card"><div class="z-row z-between"><span class="z-small z-muted">ZEU-142</span><span class="z-badge">High</span></div><div class="z-title">Auto-layout resize handles</div><div class="z-small z-muted">Assigned to Maya Chen</div></div><div class="z-card"><div class="z-row z-between"><span class="z-small z-muted">ZEU-148</span><span class="z-badge">Med</span></div><div class="z-title">Token contrast verifier</div><div class="z-small z-muted">Assigned to Lucas Vance</div></div></div><div class="z-col"><div class="z-row z-between"><span class="z-h3">In Progress</span><span class="z-badge">2</span></div><div class="z-card tonal"><div class="z-row z-between"><span class="z-small z-primary">ZEU-139</span><span class="z-badge">Active</span></div><div class="z-title">Shadow DOM renderer v2</div><div class="z-bar"><i style="width:70%"></i></div><div class="z-small z-muted">Ravi Menon · PR #84</div></div><div class="z-card"><div class="z-row z-between"><span class="z-small z-muted">ZEU-141</span><span class="z-badge">Review</span></div><div class="z-title">Bundled variable font subset</div><div class="z-small z-muted">Elena Rostova</div></div></div><div class="z-col"><div class="z-row z-between"><span class="z-h3">Completed</span><span class="z-badge">2</span></div><div class="z-card"><div class="z-row z-between"><span class="z-small z-muted">ZEU-131</span><i data-i="check_circle" class="sm z-primary"></i></div><div class="z-title">Async Tauri IPC commands</div><div class="z-small z-muted">Merged 2h ago</div></div><div class="z-card"><div class="z-row z-between"><span class="z-small z-muted">ZEU-135</span><i data-i="check_circle" class="sm z-primary"></i></div><div class="z-title">M3E Effort split control</div><div class="z-small z-muted">Merged yesterday</div></div></div></div></main></div>`,
  },

  // Primitives & Auto-Layout
  {
    id: "card_surface",
    name: "Surface Card",
    category: "primitives",
    icon: "crop_landscape",
    desc: "Tonal design-system card container with header and body",
    html: () => `<div class="z-card tonal"><div class="z-row z-between"><span class="z-small z-muted">Card Header</span><span class="z-badge">Active</span></div><div class="z-title">Surface Container</div><div class="z-small z-muted">Double-click any text to edit inline or drop blocks here.</div></div>`,
  },
  {
    id: "input_field",
    name: "Input Field",
    category: "primitives",
    icon: "edit",
    desc: "Labeled text input field with leading icon",
    html: () => `<div class="z-field"><label class="z-label">Field label</label><div class="z-input"><i data-i="search" class="sm z-muted"></i><span>Type a value…</span></div></div>`,
  },
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
  {
    id: "profile_header",
    name: "Profile Header Card",
    category: "hero",
    icon: "person",
    desc: "User avatar, bio, and 3-column follower/project metrics",
    html: () => `<div class="z-card tonal"><div class="z-row"><span class="z-avatar lg">MC</span><div class="z-grow"><div class="z-h2">Maya Chen</div><div class="z-small z-muted">Principal Product Designer · Berlin</div></div><button class="z-btn sm">Follow</button></div><div class="z-grid-3" style="padding-top:6px"><div class="z-stat"><span class="v" style="font-size:20px">48</span><span class="z-small z-muted">Systems</span></div><div class="z-stat"><span class="v" style="font-size:20px">2.4k</span><span class="z-small z-muted">Followers</span></div><div class="z-stat"><span class="v" style="font-size:20px">99%</span><span class="z-small z-muted">Rating</span></div></div></div>`,
  },
  {
    id: "audio_player",
    name: "Now Playing Transport",
    category: "cards",
    icon: "music_note",
    desc: "Media player card with track info, progress scrubber, and transport controls",
    html: () => `<div class="z-card accent"><div class="z-row"><span class="z-lead" style="background:var(--primary);color:var(--on-primary)"><i data-i="music_note"></i></span><div class="z-grow"><div class="z-title">Night Drive — Kovac</div><div class="z-small">Slow Light LP · 02:14 / 03:42</div></div><i data-i="favorite" data-fill class="sm"></i></div><div class="z-bar"><i style="width:64%"></i></div><div class="z-row z-between" style="padding:0 12px"><i data-i="shuffle" class="sm"></i><i data-i="skip_previous"></i><button class="z-icon-btn filled"><i data-i="pause" data-fill></i></button><i data-i="skip_next"></i><i data-i="repeat" class="sm"></i></div></div>`,
  },
  {
    id: "pricing_card",
    name: "Pricing Tier Card",
    category: "cards",
    icon: "sell",
    desc: "Subscription plan card with price, feature checklist, and primary CTA",
    html: () => `<div class="z-card" style="gap:12px"><div class="z-row z-between"><span class="z-h3">Studio Pro</span><span class="z-badge">Popular</span></div><div class="z-row" style="align-items:baseline;gap:4px"><span class="z-display" style="font-size:36px">$24</span><span class="z-small z-muted">/ month</span></div><div class="z-col" style="gap:8px"><div class="z-row"><i data-i="check_circle" class="sm z-primary"></i><span class="z-small">Unlimited artboards & pages</span></div><div class="z-row"><i data-i="check_circle" class="sm z-primary"></i><span class="z-small">All 13 built-in design systems</span></div><div class="z-row"><i data-i="check_circle" class="sm z-primary"></i><span class="z-small">React TSX & HTML export</span></div></div><button class="z-btn block">Start free trial</button></div>`,
  },
  {
    id: "kanban_col",
    name: "Kanban Task Column",
    category: "cards",
    icon: "checklist",
    desc: "Sprint column with header count badge and two task cards",
    html: () => `<div class="z-col"><div class="z-row z-between"><span class="z-h3">In Progress</span><span class="z-badge">2</span></div><div class="z-card tonal"><div class="z-row z-between"><span class="z-small z-primary">ZEU-139</span><span class="z-badge">Active</span></div><div class="z-title">Shadow DOM renderer v2</div><div class="z-bar"><i style="width:70%"></i></div><div class="z-small z-muted">Assigned to Ravi Menon</div></div><div class="z-card"><div class="z-row z-between"><span class="z-small z-muted">ZEU-142</span><span class="z-badge">Review</span></div><div class="z-title">Auto-layout resize handles</div><div class="z-small z-muted">Assigned to Maya Chen</div></div></div>`,
  },
  {
    id: "chat_thread",
    name: "Message Thread + Composer",
    category: "lists",
    icon: "chat",
    desc: "Direct message conversation bubbles with inline reply bar",
    html: () => `<div class="z-card" style="gap:12px"><div class="z-row"><span class="z-avatar">MC</span><div class="z-card tonal" style="flex:1;padding:10px 14px"><div class="z-small">Are we ready to ship the new M3E tokens for Friday's release?</div></div></div><div class="z-row" style="justify-content:flex-end"><div class="z-card accent" style="max-width:82%;padding:10px 14px"><div class="z-small">All 13 design systems passed contrast and layout audit.</div></div></div><div class="z-input"><input placeholder="Write a reply…" /><i data-i="send" class="sm z-primary"></i></div></div>`,
  },
  {
    id: "empty_state",
    name: "Empty State Callout",
    category: "primitives",
    icon: "inbox",
    desc: "Centered tonal empty state with icon, title, and action button",
    html: () => `<div class="z-card tonal z-center" style="align-items:center;padding:28px 20px;gap:10px"><span class="z-lead" style="width:48px;height:48px;border-radius:50%"><i data-i="folder"></i></span><div class="z-h3">No archived items</div><div class="z-small z-muted">Items you archive will appear safely here</div><button class="z-btn sm" style="margin-top:4px"><i data-i="add" class="sm"></i>Create first item</button></div>`,
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

  if (block.slot === "screen") {
    nextHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>${snippet}</body></html>`;
  } else if (isBlank) {
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
