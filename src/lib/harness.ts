// Zeus design harness. Everything that makes weak models produce strong, law-abiding screens:
//  1. kitCss / kitExample  - a per-design-system component kit the model composes instead of inventing CSS
//  2. resolveIcons         - <i data-i="home"></i> and Material Symbols markup become real inline SVG paths
//  3. harden               - structure repair + design-law enforcement + offline-safe output on every artboard
//  4. harnessPrompt        - the system prompt sections that drive generation
import { MATERIAL_ICONS } from "./materialIcons";
import { DesignSystem, tokensCss } from "./designSystems";
import type { Device } from "../types";
import { blueprintFor } from "./blueprints";

/* icons: home, search, settings, person, notifications, favorite, star, bookmark, share, mail, chat, call, calendar_today, schedule,
   location_on, shopping_cart, shopping_bag, payments, credit_card, wallet, bar_chart, trending_up, trending_down, pie_chart, insights,
   analytics, dashboard, list, grid_view, menu, more_vert, more_horiz, arrow_back, arrow_forward, arrow_upward, arrow_downward,
   chevron_right, chevron_left, expand_less, close, check, check_circle, add, remove, edit, delete, download, upload, cloud, lock,
   visibility, visibility_off, filter_list, sort, tune, play_arrow, pause, skip_next, skip_previous, shuffle, repeat, volume_up,
   music_note, mic, photo_camera, image, videocam, map, explore, fitness_center, restaurant, local_cafe, flight, hotel, work, school,
   bolt, language, public, group, groups, person_add, thumb_up, comment, send, attach_file, link, content_copy, folder, description,
   article, receipt_long, inventory_2, local_shipping, storefront, sell, percent, savings, account_balance, support_agent, help, info,
   warning, error, verified, shield, key, fingerprint, light_mode, dark_mode, wifi, battery_full, signal_cellular_alt, bluetooth, flag,
   rocket_launch, terminal, bug_report, apps, spa, water_drop, thermostat, nature, sports_esports, movie, headphones, podcasts,
   newspaper, task_alt, checklist, event, timer, history, refresh, sync, logout, login, open_in_new, fullscreen, zoom_in, palette,
   brush, layers, database, smartphone, laptop, directions_run, local_fire_department, favorite, pending, radio_button_checked */

const QUIET = `<style data-zeus-quiet>*{scrollbar-width:none!important;-ms-overflow-style:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}</style>`;
/** Hides every scroll indicator inside a rendered design (scrolling still works). Applied at every iframe. */
export function quiet(html: string): string {
  if (!html || html.includes("data-zeus-quiet")) return html;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + QUIET) : QUIET + html;
}

export const UI_ICON_NAMES = Object.keys(MATERIAL_ICONS).sort();

/* ------------------------------------------------------------------ */
/* Component kit                                                       */
/* ------------------------------------------------------------------ */
/** Per-system component overrides. Same class names, different physical language. */
export const DS_KIT: Record<string, string> = {
  m3e: ".z-btn{height:48px;padding:0 26px}.z-btn:active{border-radius:14px}.z-card{border-color:transparent}.z-fab{width:64px;height:64px;border-radius:20px}.z-chip{height:36px}",
  m3: ".z-btn{font-weight:500}.z-card{border-radius:12px;border-color:transparent}.z-card.tonal{background:var(--surface-2)}",
  hig: ".z-appbar{align-items:flex-end;min-height:96px}.z-appbar h1{font-size:34px;font-weight:700}.z-list{background:var(--surface);border-radius:var(--r-lg);padding:0 16px}.z-item{border-bottom-width:.5px}.z-btn{height:50px}.z-card{border-color:transparent}.z-nav{background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);padding-bottom:26px}.z-nav-item.on{color:var(--primary)}.z-nav-item.on .z-nav-pill,.z-nav-pill{background:transparent!important;width:auto;color:inherit}.z-chip{border-color:transparent;background:var(--surface-2)}.z-chip.on{background:var(--primary);color:var(--on-primary)}",
  fluent: ".z-btn{height:32px;padding:0 16px;font-size:14px}.z-btn.lg{height:40px}.z-input{height:32px;border-width:1px}.z-card{padding:16px}.z-side-item{position:relative;height:36px}.z-side-item.on{background:var(--surface-2);color:var(--text)}.z-side-item.on::before{content:'';position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:2px;background:var(--primary)}",
  shadcn: ".z-btn{height:36px;padding:0 16px;font-size:14px;font-weight:500}.z-btn.lg{height:40px}.z-input{height:36px;border-radius:6px}.z-card{padding:24px;gap:8px}.z-badge{background:var(--surface-2);color:var(--text);border:1px solid var(--outline);font-weight:500}.z-chip{border-radius:6px}.z-side-item.on{background:var(--surface-2);color:var(--text)}.z-tab.on{color:var(--text);border-bottom-color:var(--text)}",
  carbon: ".z-btn{height:48px;justify-content:space-between;padding:0 16px;min-width:160px}.z-btn.outline{border-color:var(--primary);color:var(--primary)}.z-input{border:0;border-bottom:1px solid var(--outline);background:var(--surface-2);height:40px}.z-card{border-color:transparent;padding:16px}.z-top{background:var(--text);color:var(--bg);min-height:48px}.z-table th{background:var(--surface-2);color:var(--text)}.z-chip,.z-badge{border-radius:24px}.z-tab.on{color:var(--text);border-bottom-width:3px}",
  antd: ".z-btn{height:32px;padding:0 15px;font-size:14px;font-weight:400}.z-btn.lg{height:40px}.z-input{height:32px}.z-card{padding:24px;gap:16px}.z-table th{background:var(--surface-2);color:var(--text);font-weight:500;font-size:14px}.z-badge{border-radius:4px;font-weight:400}",
  polaris: ".z-btn{height:32px;font-size:13px}.z-btn.lg{height:40px}.z-card{padding:16px;gap:8px}.z-badge{border-radius:8px}.z-side{background:var(--bg);border-right:0}.z-side-item{height:32px;font-size:13px}",
  atlassian: ".z-btn{height:32px;font-weight:500;font-size:14px}.z-btn.lg{height:40px}.z-badge{border-radius:3px;text-transform:uppercase;font-size:11px;letter-spacing:.04em;font-weight:700}.z-card{padding:16px}.z-input{height:40px;border-width:2px}",
  neo: ".z-btn{border:3px solid var(--text);text-transform:uppercase;letter-spacing:.02em;font-weight:800;height:48px}.z-btn:hover{filter:none;transform:translate(-2px,-2px)}.z-card,.z-hero,.z-input,.z-chip,.z-badge{border:3px solid var(--text)}.z-item{border-bottom:3px solid var(--text)}.z-nav,.z-side,.z-top,.z-appbar{border-color:var(--text);border-width:3px}.z-chip.on{background:var(--primary);color:var(--on-primary)}.z-display,.z-h1{text-transform:uppercase}",
  glass: ".z-card,.z-hero,.z-nav,.z-side,.z-input{backdrop-filter:blur(24px) saturate(160%);-webkit-backdrop-filter:blur(24px) saturate(160%);border:1px solid var(--outline)}.z-btn{height:46px}",
  minimal: ".z-display,.z-h1,.z-h2{font-weight:500;letter-spacing:-.02em}.z-display{line-height:1}.z-btn{height:40px;padding:0 24px;font-size:14px;letter-spacing:.02em}.z-card{padding:28px}.z-badge{background:transparent;border:1px solid var(--outline);color:var(--text);font-weight:500}.z-page{gap:28px}.z-section{padding:96px 0}",
  claude: ".z-btn{height:40px;font-weight:500}.z-input{height:52px;border-radius:16px}.z-h1,.z-h2,.z-display{font-weight:500}.z-chip{border-radius:10px}.z-side-item.on{background:var(--surface-2);color:var(--text)}",
};

export function kitCss(dsId = ""): string {
  return `
*{box-sizing:border-box;margin:0;padding:0;box-shadow:none!important;text-shadow:none!important}
html{-webkit-text-size-adjust:100%}
body{font-family:var(--font);background:var(--bg);color:var(--text);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
h1,h2,h3,h4{font-family:var(--heading);font-weight:var(--weight);letter-spacing:-.015em;line-height:1.15}
button,input,textarea,select{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0}
a{color:inherit;text-decoration:none}
ul,ol{list-style:none}
img{display:block;max-width:100%}
.z-i{display:inline-block;vertical-align:middle;width:24px;height:24px;fill:currentColor;flex:none}
.z-i.sm{width:18px;height:18px}.z-i.lg{width:32px;height:32px}.z-i.xl{width:48px;height:48px}
.z-screen{min-height:100vh;display:flex;flex-direction:column}
.z-page{flex:1;display:flex;flex-direction:column;gap:20px;padding:16px 20px 28px}
body{overflow-wrap:break-word}.z-grid>*,.z-grid-2>*,.z-grid-3>*,.z-grid-4>*,.z-row>*{min-width:0}
*{scrollbar-width:none}::-webkit-scrollbar{display:none}
.z-hero,.z-card{position:relative}.z-hero{overflow:hidden}.z-deco{position:absolute;z-index:0;pointer-events:none;opacity:.5}.z-hero>*:not(.z-deco){position:relative;z-index:1}
.z-wide{width:100%;max-width:1120px;margin:0 auto;padding:0 32px}
.z-row{display:flex;align-items:center;gap:12px}
.z-col{display:flex;flex-direction:column;gap:12px}
.z-between{justify-content:space-between}.z-wrap{flex-wrap:wrap}.z-center{justify-content:center;text-align:center}
.z-grow{flex:1;min-width:0}.z-gap-4{gap:4px}.z-gap-8{gap:8px}.z-gap-16{gap:16px}.z-gap-24{gap:24px}.z-gap-32{gap:32px}
.z-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
.z-grid-2{display:grid;gap:16px;grid-template-columns:1fr 1fr}.z-grid-3{display:grid;gap:16px;grid-template-columns:repeat(3,1fr)}.z-grid-4{display:grid;gap:16px;grid-template-columns:repeat(4,1fr)}
.z-display{font-size:clamp(40px,6.5vw,72px);line-height:1.02;letter-spacing:-.03em}
.z-h1{font-size:30px}.z-h2{font-size:21px}.z-h3{font-size:16px;font-weight:600}
.z-title{font-size:17px;font-weight:600}.z-body{font-size:15px}.z-small{font-size:13px}
.z-muted{color:var(--muted)}.z-primary{color:var(--primary)}.z-error{color:var(--error)}.z-truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.z-appbar{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 20px;background:var(--bg)}
.z-appbar h1{font-size:22px;flex:1}
.z-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 22px;border-radius:var(--r-btn);background:var(--primary);color:var(--on-primary);border:var(--bw) solid transparent;font-weight:600;font-size:15px;transition:transform .2s cubic-bezier(.34,1.56,.64,1),border-radius .3s cubic-bezier(.34,1.56,.64,1),background-color .15s}
.z-btn:hover{filter:brightness(.94)}.z-btn:active{transform:scale(.97)}
.z-btn.tonal{background:var(--container);color:var(--on-container)}
.z-btn.outline{background:transparent;color:var(--text);border:max(var(--bw),1px) solid var(--outline)}
.z-btn.text{background:transparent;color:var(--primary);padding:0 12px}
.z-btn.sm{height:34px;padding:0 14px;font-size:13px}.z-btn.lg{height:54px;padding:0 30px;font-size:16px}.z-btn.block{width:100%}
.z-icon-btn{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:var(--r-btn);color:var(--text);flex:none}
.z-icon-btn:hover{background:var(--surface-2)}.z-icon-btn.tonal{background:var(--container);color:var(--on-container)}.z-icon-btn.filled{background:var(--primary);color:var(--on-primary)}
.z-fab{display:inline-grid;place-items:center;width:56px;height:56px;border-radius:var(--r-lg);background:var(--container);color:var(--on-container);position:sticky;bottom:96px;align-self:flex-end;margin-right:20px}
.z-card{background:var(--surface);border:var(--bw) solid var(--outline);border-radius:var(--r-card);padding:20px;display:flex;flex-direction:column;gap:12px}
.z-card.tonal{background:var(--surface-2);border-color:transparent}.z-card.accent{background:var(--container);color:var(--on-container);border-color:transparent}.z-card.flat{border-color:transparent}.z-card.bleed{padding:0;overflow:hidden}
.z-hero{background:var(--container);color:var(--on-container);border-radius:var(--r-xl);padding:28px;display:flex;flex-direction:column;gap:14px}
.z-chip{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:var(--r-btn);border:max(var(--bw),1px) solid var(--outline);font-size:14px;font-weight:500;white-space:nowrap;cursor:pointer;background:transparent}
.z-chip.on{background:var(--container);color:var(--on-container);border-color:transparent}
.z-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.z-badge{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:var(--r-btn);background:var(--container);color:var(--on-container);font-size:12px;font-weight:600}
.z-avatar{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--container);color:var(--on-container);font-weight:600;font-size:15px;flex:none}
.z-avatar.lg{width:56px;height:56px;font-size:20px}
.z-input{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-radius:var(--r-md);border:max(var(--bw),1px) solid var(--outline);background:var(--surface)}
.z-input input{flex:1;min-width:0;border:0;outline:0;background:transparent;height:100%}
.z-input:focus-within{border-color:var(--primary)}
.z-field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600}
.z-list{display:flex;flex-direction:column}
.z-item{display:flex;align-items:center;gap:14px;min-height:60px;padding:10px 4px;border-bottom:1px solid var(--outline)}
.z-item:last-child{border-bottom:0}
.z-item .z-lead{display:grid;place-items:center;width:44px;height:44px;border-radius:var(--r-md);background:var(--container);color:var(--on-container);flex:none}
.z-divider{height:1px;background:var(--outline);border:0}
.z-switch{position:relative;width:48px;height:28px;flex:none;appearance:none;-webkit-appearance:none;border-radius:99px;background:var(--surface-2);border:2px solid var(--outline);cursor:pointer;transition:background-color .2s}
.z-switch::after{content:"";position:absolute;top:50%;left:5px;width:14px;height:14px;border-radius:50%;background:var(--outline);transform:translateY(-50%);transition:left .25s cubic-bezier(.34,1.56,.64,1),width .2s,height .2s,background-color .2s}
.z-switch:checked{background:var(--primary);border-color:var(--primary)}.z-switch:checked::after{left:22px;width:20px;height:20px;background:var(--on-primary)}
.z-tabs{display:flex;gap:4px;border-bottom:1px solid var(--outline)}
.z-tab{padding:12px 16px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer}
.z-tab.on{color:var(--primary);border-bottom-color:var(--primary)}
.z-segs{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:var(--r-btn);background:var(--surface-2);border:var(--bw) solid var(--outline)}
.z-seg{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;border-radius:var(--r-btn);font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;transition:background-color .15s,color .15s}
.z-seg.on{background:var(--surface);color:var(--text);border:var(--bw) solid var(--outline)}
.z-banner{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:var(--r-md);background:var(--container);color:var(--on-container);font-size:14px;font-weight:500}
.z-kpi{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.z-kpi .delta{font-size:12px;font-weight:600;padding:2px 8px;border-radius:var(--r-btn);background:var(--container);color:var(--on-container)}
.z-kv{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--outline);font-size:14px}.z-kv:last-child{border-bottom:0}
.z-steps{display:flex;align-items:center;gap:8px}.z-step{flex:1;height:6px;border-radius:99px;background:var(--surface-2)}.z-step.on{background:var(--primary)}
.z-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.z-day{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:58px;border-radius:var(--r-md);background:var(--surface);border:var(--bw) solid var(--outline);font-size:12px;font-weight:600;cursor:pointer}.z-day.on{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
.z-bar{height:8px;border-radius:99px;background:var(--surface-2);overflow:hidden}.z-bar>i{display:block;height:100%;background:var(--primary);border-radius:99px}
.z-stat{display:flex;flex-direction:column;gap:4px}.z-stat .v{font-family:var(--heading);font-size:32px;font-weight:var(--weight);letter-spacing:-.02em;line-height:1.1}
.z-table,table{width:100%;border-collapse:collapse;font-size:14px}.z-table th,table th{text-align:left;font-size:12px;font-weight:600;color:var(--muted);padding:10px 14px;border-bottom:1px solid var(--outline)}
.z-table td,table td{padding:13px 14px;border-bottom:1px solid var(--outline)}.z-table tr:last-child td,table tr:last-child td{border-bottom:0}
input:not([type=checkbox]):not([type=radio]):not([type=range]):not([class]),select:not([class]),textarea:not([class]){height:44px;padding:0 14px;border-radius:var(--r-md);border:max(var(--bw),1px) solid var(--outline);background:var(--surface);outline:0}
.z-img{background:var(--container);border-radius:var(--r-md);min-height:120px;width:100%}
.z-nav{position:sticky;bottom:0;display:flex;justify-content:space-around;padding:10px 8px 22px;background:var(--surface);border-top:1px solid var(--outline);margin-top:auto}
.z-nav-item{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer}
.z-nav-pill{display:grid;place-items:center;width:64px;height:32px;border-radius:var(--r-btn);transition:background-color .2s}
.z-nav-item.on{color:var(--text)}.z-nav-item.on .z-nav-pill{background:var(--container);color:var(--on-container)}
.z-shell{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
.z-side{display:flex;flex-direction:column;gap:4px;padding:20px 12px;background:var(--surface);border-right:1px solid var(--outline)}
.z-side-item{display:flex;align-items:center;gap:12px;height:42px;padding:0 14px;border-radius:var(--r-md);font-weight:500;color:var(--muted);cursor:pointer}
.z-side-item:hover{background:var(--surface-2)}.z-side-item.on{background:var(--container);color:var(--on-container);font-weight:600}
.z-main{display:flex;flex-direction:column;gap:24px;padding:28px 36px;min-width:0}
.z-top{display:flex;align-items:center;gap:16px;min-height:64px;padding:0 32px;border-bottom:1px solid var(--outline);background:var(--bg)}
.z-section{display:flex;flex-direction:column;gap:16px;padding:72px 0}
@media(max-width:700px){.z-grid-3,.z-grid-4{grid-template-columns:1fr 1fr}.z-shell{grid-template-columns:1fr}.z-side{display:none}.z-main{padding:20px}.z-wide{padding:0 20px}.z-top{padding:0 20px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`.replace(/\n/g, "") + (DS_KIT[dsId] ?? "");
}

/** Tiny interaction runtime so kit components feel alive without model-written JS. */
const KIT_JS = `(function(){var g=[".z-tab",".z-chip",".z-nav-item",".z-side-item",".z-seg"];document.addEventListener("click",function(e){var t=e.target&&e.target.closest&&e.target.closest(g.join(","));if(!t||!t.parentElement)return;if(t.matches(".z-chip")&&t.parentElement.dataset.multi!==undefined){t.classList.toggle("on");return}Array.prototype.forEach.call(t.parentElement.children,function(s){if(s.matches(g.join(",")))s.classList.remove("on")});t.classList.add("on")});document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a)e.preventDefault()})})();`;

export function kitExample(device: Device): string {
  if (device === "web") {
    return `<div class="z-shell">
  <aside class="z-side">
    <h3 class="z-h2" style="padding:4px 14px 16px">Northwind</h3>
    <a class="z-side-item on"><i data-i="dashboard" data-fill></i>Overview</a>
    <a class="z-side-item"><i data-i="receipt_long"></i>Orders</a>
    <a class="z-side-item"><i data-i="inventory_2"></i>Products</a>
    <a class="z-side-item"><i data-i="group"></i>Customers</a>
  </aside>
  <main class="z-main">
    <div class="z-row z-between"><h1 class="z-h1">Overview</h1><button class="z-btn"><i data-i="add" class="sm"></i>New order</button></div>
    <div class="z-grid-3">
      <div class="z-card"><div class="z-stat"><span class="z-muted z-small">Revenue</span><span class="v">$48,210</span></div><div class="z-bar"><i style="width:72%"></i></div></div>
      <div class="z-card"><div class="z-stat"><span class="z-muted z-small">Orders</span><span class="v">1,284</span></div></div>
      <div class="z-card accent"><div class="z-stat"><span class="z-small">Conversion</span><span class="v">3.8%</span></div></div>
    </div>
    <div class="z-card bleed"><table class="z-table"><tr><th>Order</th><th>Customer</th><th>Total</th></tr><tr><td>#4821</td><td>Maya Chen</td><td>$212.00</td></tr></table></div>
  </main>
</div>`;
  }
  return `<div class="z-screen">
  <header class="z-appbar"><h1>Today</h1><button class="z-icon-btn"><i data-i="search"></i></button></header>
  <div class="z-page">
    <section class="z-hero"><span class="z-small">Weekly goal</span><h2 class="z-h1">12.4 of 20 km</h2><div class="z-bar"><i style="width:62%"></i></div><button class="z-btn">Start run</button></section>
    <div class="z-chips"><span class="z-chip on">All</span><span class="z-chip">Runs</span><span class="z-chip">Rides</span></div>
    <div class="z-list">
      <div class="z-item"><span class="z-lead"><i data-i="directions_run"></i></span><div class="z-grow"><div class="z-title">Morning run</div><div class="z-muted z-small">6.2 km, 34 min</div></div><i data-i="chevron_right" class="z-muted"></i></div>
    </div>
  </div>
  <nav class="z-nav"><a class="z-nav-item on"><span class="z-nav-pill"><i data-i="home" data-fill></i></span>Home</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="bar_chart"></i></span>Stats</a><a class="z-nav-item"><span class="z-nav-pill"><i data-i="person"></i></span>Profile</a></nav>
</div>`;
}

/* ------------------------------------------------------------------ */
/* Icon resolution + 130+ synonym aliases for weak models              */
/* ------------------------------------------------------------------ */
const ICON_ALIASES: Record<string, string> = {
  user: "person", users: "group", people: "groups", account: "person", account_circle: "person", profile: "person", avatar: "person",
  bell: "notifications", notification: "notifications", alert: "notifications", alarm: "schedule",
  heart: "favorite", like: "favorite", love: "favorite", favourite: "favorite", heart_fill: "favorite",
  cart: "shopping_cart", bag: "shopping_bag", basket: "shopping_bag", shop: "storefront", store: "storefront",
  gear: "settings", cog: "settings", preferences: "tune", sliders: "tune", options: "tune", config: "settings",
  trash: "delete", trash_2: "delete", bin: "delete", remove_circle: "remove", erase: "delete",
  plus: "add", add_circle: "add", new: "add", minus: "remove",
  clock: "schedule", time: "schedule", watch: "timer", stopwatch: "timer",
  calendar: "calendar_today", date: "calendar_today", events: "event",
  envelope: "mail", email: "mail", inbox: "mail", message: "chat", messages: "chat", comment_dots: "comment",
  phone: "call", telephone: "call", mobile: "smartphone", iphone: "phone_iphone", desktop: "desktop_windows", monitor: "desktop_windows", computer: "laptop",
  dollar: "payments", attach_money: "payments", money: "payments", currency_dollar: "payments", cash: "payments", card: "credit_card", bank: "account_balance", piggy_bank: "savings",
  chart: "bar_chart", graph: "trending_up", chart_bar: "bar_chart", chart_line: "trending_up", line_chart: "trending_up", chart_pie: "pie_chart", activity: "insights", stats: "analytics",
  sparkles: "auto_awesome", ai: "auto_awesome", magic: "auto_awesome", wand: "auto_awesome", lightning: "bolt", zap: "bolt", flash: "bolt",
  fire: "local_fire_department", flame: "local_fire_department", burn: "local_fire_department",calories: "local_fire_department",
  run: "directions_run", running: "directions_run", walk: "directions_run", workout: "fitness_center", dumbbell: "fitness_center", gym: "fitness_center",
  sun: "light_mode", moon: "dark_mode", eye: "visibility", eye_off: "visibility_off",
  arrow_right: "arrow_forward", arrow_left: "arrow_back", arrow_up: "arrow_upward", arrow_down: "arrow_downward",
  caret_right: "chevron_right", caret_left: "chevron_left", caret_down: "expand_more", caret_up: "expand_less", chevron_down: "expand_more", chevron_up: "expand_less",
  check_mark: "check", checkmark: "check", tick: "check", done: "check", done_all: "check_circle", verified_user: "verified", shield_check: "verified",
  x: "close", cancel: "close", cross: "close", clear: "close",
  globe: "public", world: "public", earth: "public", web_asset: "web", browser: "language",
  pin: "push_pin", map_pin: "location_on", location: "location_on", place: "location_on", navigation: "explore", compass: "explore",
  play: "play_arrow", play_circle: "play_arrow", pause_circle: "pause", next: "skip_next", prev: "skip_previous", previous: "skip_previous", audio: "volume_up", speaker: "volume_up",
  camera: "photo_camera", photo: "image", picture: "image", gallery: "image", video: "videocam", film: "movie",
  file: "description", doc: "description", document: "description", page: "article", news: "newspaper", copy: "content_copy", clipboard: "content_copy",
  code: "terminal", console: "terminal", cli: "terminal", server: "database", db: "database", storage: "database",
  lock_closed: "lock", key_round: "key", security: "shield", sign_out: "logout", log_out: "logout", sign_in: "login", log_in: "login",
  external_link: "open_in_new", launch: "open_in_new", link_2: "link", paperclip: "attach_file",
  coffee: "local_cafe", food: "restaurant", utensils: "restaurant", plane: "flight", bed: "hotel", briefcase: "work", book: "menu_book", graduation_cap: "school",
  truck: "local_shipping", package: "inventory_2", box: "inventory_2", tag: "sell", discount: "percent",
  dots_vertical: "more_vert", dots_horizontal: "more_horiz", ellipsis: "more_horiz", bars: "menu", hamburger: "menu",
  filter: "filter_list", funnel: "filter_list", reload: "refresh", rotate: "refresh",
};

export function resolveIconName(raw: string): string {
  const clean = raw.trim().toLowerCase().replace(/[-\s]+/g, "_").replace(/^(?:lucide|fa|bi|ri|hi|md|icon)_/, "");
  if (MATERIAL_ICONS[clean]) return clean;
  if (ICON_ALIASES[clean] && MATERIAL_ICONS[ICON_ALIASES[clean]]) return ICON_ALIASES[clean];
  const stripped = clean.replace(/_(?:outline|outlined|rounded|sharp|fill|filled|solid|line)$/, "");
  if (MATERIAL_ICONS[stripped]) return stripped;
  if (ICON_ALIASES[stripped] && MATERIAL_ICONS[ICON_ALIASES[stripped]]) return ICON_ALIASES[stripped];
  return clean;
}

const svgFor = (name: string, fill: boolean, cls = "", style = ""): string => {
  const resolved = resolveIconName(name);
  const e = MATERIAL_ICONS[resolved] ?? MATERIAL_ICONS.circle;
  const d = fill && e[1] ? e[1] : e[0];
  return `<svg class="z-i${cls ? " " + cls : ""}" viewBox="0 -960 960 960" aria-hidden="true"${style ? ` style="${style}"` : ""}><path d="${d}"/></svg>`;
};

const attr = (tag: string, n: string) => new RegExp(`\\b${n}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ?? "";

export function resolveIcons(html: string, fixes: string[]): string {
  let n = 0;
  const unknown = new Set<string>();
  const sub = (rawName: string, tag: string) => {
    n++;
    const name = resolveIconName(rawName);
    if (!MATERIAL_ICONS[name]) unknown.add(rawName);
    return svgFor(name, /data-fill|\bfill\b|FILL/.test(tag), attr(tag, "class").replace(/\b(material-symbols[\w-]*|material-icons[\w-]*|lucide[\w-]*|fa[\w-]*|ms|icon|z-i)\b/g, "").trim(), attr(tag, "style"));
  };
  // <i data-i="home"></i> or <i data-lucide="home"></i> (also self-closed)
  html = html.replace(/<(?:i|span)\b([^>]*?)\bdata-(?:i|icon|lucide)\s*=\s*"([a-z0-9_-]+)"([^>]*?)(?:\/>|>\s*<\/(?:i|span)>)/gi, (_m, a, name, b) => sub(name, a + " " + b));
  // <span class="material-symbols-rounded">home</span>, <i class="material-icons">home</i>, <span class="icon">home</span>
  html = html.replace(/<(span|i)\b([^>]*class\s*=\s*"[^"]*\b(?:material-symbols[\w-]*|material-icons[\w-]*|ms|icon)\b[^"]*"[^>]*)>\s*([a-z][a-z0-9_-]{1,40})\s*<\/\1>/gi, (_m, _t, tag, name) => sub(name, tag));
  if (n) fixes.push(`${n} icon${n > 1 ? "s" : ""} resolved to Material Symbols`);
  if (unknown.size) fixes.push(`unknown icon replaced: ${[...unknown].slice(0, 4).join(", ")}`);
  return html;
}

/* ------------------------------------------------------------------ */
/* Design-law enforcement                                              */
/* ------------------------------------------------------------------ */
const EMOJI = /(?![\u00A9\u00AE\u2122\u2190-\u21FF\u2713\u2714\u25B6\u25C0])[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u200D\uFE0F]/gu;
const COLOR_NAMES = /\b(blue|purple|violet|indigo|navy|royalblue|dodgerblue|slateblue|blueviolet|mediumpurple|rebeccapurple|magenta|fuchsia|darkblue|deepskyblue|cornflowerblue|steelblue|orchid)\b/i;

function hueOf(c: string): { h: number; s: number; l: number } | null {
  let r = 0, g = 0, b = 0;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length < 6) h = h.slice(0, 3).split("").map((x) => x + x).join("");
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    else {
      const hs = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(c);
      return hs ? { h: +hs[1] % 360, s: +hs[2] / 100, l: +hs[3] / 100 } : null;
    }
  }
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

const COLOR_TOKEN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|var\([^)]*\)|\b[a-z]{3,20}\b/gi;
function flattenGradient(g: string): string | null {
  const inner = g.slice(g.indexOf("(") + 1, -1);
  const colors = inner.match(COLOR_TOKEN)?.filter((t) => !/^(to|left|right|top|bottom|deg|circle|ellipse|at|center|closest|farthest|side|corner|from|in|transparent|currentcolor|linear|radial|conic|gradient|repeating|turn|rad|px)$/i.test(t)) ?? [];
  if (!colors.length) return null;
  const bad = colors.some((c) => {
    if (COLOR_NAMES.test(c)) return true;
    const k = hueOf(c);
    return !!k && k.s > 0.12 && k.l > 0.08 && k.l < 0.97 && k.h >= 190 && k.h <= 325;
  });
  return bad ? colors[0] : null;
}

function mapText(html: string, fn: (s: string) => string): string {
  return html.split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>)/i).map((p, i) => (i % 2 ? p : fn(p))).join("");
}

export interface HardenResult { html: string; fixes: string[] }

export function harden(input: string, ds: DesignSystem, opts: { partial?: boolean } = {}): HardenResult {
  const fixes: string[] = [];
  let html = input.trim();
  if (!html) return { html, fixes };

  // --- structure ---
  const hasHtml = /<html[\s>]/i.test(html);
  if (!hasHtml) {
    html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>${html.replace(/<!doctype[^>]*>/i, "")}</body></html>`;
    fixes.push("wrapped fragment in a full document");
  }
  if (!/<head[\s>]/i.test(html)) html = html.replace(/<html[^>]*>/i, (h) => `${h}<head></head>`);
  if (!/^<!doctype/i.test(html)) html = "<!doctype html>" + html;
  if (!opts.partial) {
    if (!/<\/body>/i.test(html) && /<body[\s>]/i.test(html)) { html += "</body>"; fixes.push("closed truncated body"); }
    if (!/<\/html>/i.test(html)) html += "</html>";
  }

  // --- offline safety ---
  const before = html;
  html = html.replace(/<link\b[^>]*href\s*=\s*["']https?:[^>]*>/gi, "")
    .replace(/<script\b[^>]*src\s*=\s*["']https?:[^>]*>\s*<\/script>/gi, "")
    .replace(/@import\s+(?:url\()?["']?https?:[^;]+;?/gi, "")
    .replace(/<img\b([^>]*?)src\s*=\s*["']https?:[^"']*["']([^>]*)>/gi, (_m, a, b) => `<div class="z-img ${attr(a + b, "class")}" role="img" style="${attr(a + b, "style")}"></div>`);
  if (html !== before) fixes.push("removed external resources");

  // --- design laws ---
  const shadowRe = /\b(box-shadow|text-shadow)\s*:\s*([^;}"']*)/gi;
  let shadows = 0;
  html = html.replace(shadowRe, (_m, prop: string, val: string) => {
    if (/^\s*(none|initial|unset)\s*(!important)?\s*$/i.test(val) || /var\(--shadow\)/.test(val)) return `${prop}:none`;
    shadows++;
    const ring = /^\s*(inset\s+)?0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+(\d+)px\s+(#[0-9a-f]{3,8}|[a-z]+|var\([^)]+\))\s*$/i.exec(val);
    if (prop.toLowerCase() === "box-shadow" && ring) return `outline:${ring[2]}px solid ${ring[3]};outline-offset:${ring[1] ? "-" : ""}${ring[2]}px`;
    return `${prop}:none`;
  });
  html = html.replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/gi, () => { shadows++; return ""; });
  if (shadows) fixes.push(`removed ${shadows} shadow${shadows > 1 ? "s" : ""}`);

  let grads = 0;
  html = html.replace(/(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/gi, (g) => {
    const flat = flattenGradient(g);
    if (!flat) return g;
    grads++;
    return flat;
  });
  if (grads) fixes.push(`flattened ${grads} blue/purple gradient${grads > 1 ? "s" : ""}`);

  let emojis = 0;
  html = mapText(html, (s) => s.replace(EMOJI, () => { emojis++; return ""; }));
  if (emojis) fixes.push(`removed ${emojis} emoji`);

  let live = 0;
  html = html.replace(/<(span|div|small|b|i|em|strong|p|a|button|label)\b[^>]*>\s*(?:[\u25CF\u2022]\s*)?LIVE\s*<\/\1>/g, () => { live++; return ""; });
  if (live) fixes.push(`removed ${live} LIVE badge${live > 1 ? "s" : ""}`);

  // --- off-palette Tailwind/Bootstrap blue/purple hex remapping (unless DS is blue-based) ---
  if (!["hig", "fluent", "carbon", "antd", "atlassian", "m3", "m3e"].includes(ds.id)) {
    let remapped = 0;
    html = html.replace(/#(?:3b82f6|2563eb|1d4ed8|6366f1|4f46e5|8b5cf6|7c3aed|007bff|6f42c1)\b/gi, () => { remapped++; return "var(--primary)"; });
    html = html.replace(/#(?:eff6ff|eef2ff|f5f3ff|dbeafe|e0e7ff|ede9fe)\b/gi, () => { remapped++; return "var(--container)"; });
    if (remapped) fixes.push(`mapped ${remapped} off-palette color${remapped > 1 ? "s" : ""} to design tokens`);
  }

  // --- icons ---
  html = resolveIcons(html, fixes);

  // --- promote bare unclassed <button> elements so weak models never render invisible reset buttons ---
  html = html.replace(/<button(\s[^>]*)?>([\s\S]*?)<\/button>/gi, (full, attrs = "", inner = "") => {
    if (/\bclass\s*=|\bstyle\s*=/.test(attrs)) return full;
    const textOnly = inner.replace(/<[^>]+>/g, "").trim();
    const cls = textOnly.length === 0 && /<svg|<i\b/i.test(inner) ? "z-icon-btn" : "z-btn";
    return `<button class="${cls}"${attrs}>${inner}</button>`;
  });

  // --- kit injection (first in <head>, so the model's own CSS always wins) ---
  if (!html.includes("data-zeus-kit")) {
    html = html.replace(/<head[^>]*>(?:\s*<meta\b[^>]*>)*/i, (h) => `${h}<style data-zeus-kit>${tokensCss(ds)}${kitCss(ds.id)}</style>`);
    if (!opts.partial) html = html.replace(/<\/body>/i, `<script data-zeus-kit-js>${KIT_JS}</script></body>`);
  }
  // metas go first so the charset declaration stays within the first 1024 bytes
  if (!/<meta[^>]+viewport/i.test(html)) html = html.replace(/<head[^>]*>/i, (h) => `${h}<meta name="viewport" content="width=device-width,initial-scale=1">`);
  if (!/<meta[^>]+charset/i.test(html)) html = html.replace(/<head[^>]*>/i, (h) => `${h}<meta charset="utf-8">`);
  return { html, fixes };
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */
const ICON_HINT = "home search settings person notifications favorite star bookmark share mail chat call calendar_today schedule location_on shopping_cart shopping_bag payments credit_card wallet bar_chart trending_up trending_down pie_chart insights dashboard list grid_view menu more_vert more_horiz arrow_back arrow_forward chevron_right chevron_left expand_more close check check_circle add remove edit delete download upload cloud lock visibility filter_list sort tune play_arrow pause skip_next skip_previous music_note mic photo_camera image videocam map explore fitness_center restaurant flight work school bolt public group groups person_add thumb_up comment send attach_file link content_copy folder description article receipt_long inventory_2 local_shipping storefront sell savings account_balance support_agent help info warning error verified shield key light_mode dark_mode wifi battery_full flag rocket_launch terminal apps task_alt checklist event timer history refresh logout login open_in_new palette layers smartphone laptop directions_run";

export function harnessPrompt(ds: DesignSystem, intent = "", device?: Device): string {
  return [
    `You are Zeus, a senior product designer and front-end engineer inside the ZeusDesigns desktop app. The user has a chat on the left and an infinite canvas of live HTML screens on the right. You design by emitting complete screens as artboards. A screen is judged on one thing: would a design lead ship it.`,

    `## Output protocol
Reply with at most 3 short sentences or bullets of markdown (design intent, no code, no emoji, no taglines), then the artboards:
<artboard name="Short screen name" device="mobile|tablet|web" mode="new">
<!doctype html>...one complete HTML document...
</artboard>
- Revise an existing screen with mode="revise" id="<existing id>" and output the FULL updated document. Change only what was asked; keep everything else byte-identical in spirit.
- mobile = 390x844, tablet = 820x1100, web = 1280x800. Pick the device that matches the request; default to mobile for apps and web for sites and dashboards.
- Unspecified direction on a fresh request: 3 artboards with genuinely different layout structure, not recolors. A revise or a variant of one selected screen: exactly 1 artboard.
- Every document must be complete and closed (</html>). Keep each screen under about 220 lines of HTML. A truncated screen is a failed screen, so cut sections before you cut the ending.
- Self-contained only: no CDNs, web fonts, external images or libraries. Vanilla JS is optional and only for real interactions.
- After the last </artboard> write nothing.`,

    `## Design laws (the harness strips violations automatically, so never spend effort on them)
- No box-shadow, text-shadow or drop-shadow. Depth comes from tonal surfaces, 1px borders and spacing.
- No emojis anywhere. Icons are Material Symbols only (see Icons).
- No LIVE badges or pulsing status dots. No fake "demo", "sample" or "placeholder" labels.
- No blue or purple gradients. Prefer flat color; a gradient is allowed only in warm or neutral hues and only when it earns its place.
- Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout instead.
- Prefer the choice that improves user experience, developer experience and agent experience together without breaking anything.`,

    `## Active design system: ${ds.name} (${ds.vendor})
${ds.guidelines}
Tokens are already defined for you as CSS variables on :root (do not redefine them, and never hard-code a hex value that a token covers):
${tokensCss(ds)}`,

    `## Component kit (already loaded in every document, themed by the tokens above)
Compose screens from these classes first; write extra CSS only for what the kit cannot express, and always with the tokens.
- Layout: z-screen, z-page, z-wide, z-row, z-col, z-between, z-wrap, z-center, z-grow, z-gap-4/8/16/24/32, z-grid (auto-fit), z-grid-2/3/4, z-section
- Type: z-display, z-h1, z-h2, z-h3, z-title, z-body, z-small, z-muted, z-primary, z-truncate
- Actions: z-btn (+ tonal, outline, text, sm, lg, block), z-icon-btn (+ tonal, filled), z-fab, z-chip (+ on), z-chips, z-segs > z-seg (+ on)
- Surfaces: z-card (+ tonal, accent, flat, bleed), z-hero, z-banner, z-divider, z-badge, z-avatar (initials inside), z-img (image block)
- Data: z-list > z-item (z-lead, z-grow), z-table, z-stat (.v), z-kpi (.delta), z-kv, z-bar > i, z-steps > z-step (+ on), z-days > z-day (+ on), z-tabs > z-tab, z-switch (input type=checkbox)
- Forms: z-input (icon + input), z-field
- Navigation: z-appbar, z-nav > z-nav-item > z-nav-pill (mobile), z-shell > z-side > z-side-item + z-main, z-top (web)
Tabs, chips, nav items and side items switch their "on" state on click automatically.

## Icons
Write <i data-i="name"></i> (add data-fill for the filled form, add class sm, lg or xl to resize). The harness swaps it for the official Material Symbols Rounded glyph. Never draw icons by hand, never use emoji, never use letters as icons. Safe names: ${ICON_HINT}.`,

    `## Craft rules
1. Decide silently before writing: who uses this, the ONE primary action, the 3 to 5 sections, the real content. Then build.
2. Hierarchy comes from size, weight and space, not from more colors. One primary button per view. Type scale: 12, 13, 15, 17, 21, 30, 44+. Mobile body text at least 14px, touch targets at least 44px.
3. Spacing on a 4px grid: 4, 8, 12, 16, 24, 32, 48. Group related items tight and separate groups generously. Consistent page margins (20px mobile, 32 to 36px web).
4. Use only token colors: var(--primary) for the key action, var(--container) for selected or featured surfaces, var(--surface) and var(--surface-2) for tonal layers, var(--muted) for secondary text, var(--outline) for borders. Radii only from var(--r-*).
5. Real, specific content: believable names, amounts, dates, places, product names with units and numbers. No lorem ipsum, no "Item 1", no "Acme", no "John Doe". 4 to 7 list rows, never a single row.
6. No card inside a card. No centered paragraphs. Left-align text; center only short hero lines.
7. Imagery is built from flat token-colored shapes and inline SVG (charts, avatars with initials, illustrations made of simple geometry). Charts use inline SVG with token colors and labeled axes.
8. Every screen has its states: a selected tab or nav item, a focused or filled input where relevant, and one empty or progress moment if the flow calls for it.
9. Landing pages: a bold hero with one headline and one action, a proof row, 3 feature blocks that each show a real UI fragment, a closing action. Dashboards: a left side nav, a top row of 3 to 4 stats, one primary chart or table, dense but aligned. Mobile apps: appbar, one hero or summary, a list or grid, bottom nav with 3 to 5 destinations.
10. Reach the polish bar: aligned edges, equal gutters, no orphan elements, no overflow, no text smaller than 12px, no low-contrast text.
11. Fill the screen. A mobile screen is 844px tall: the content plus the pinned z-nav must reach the bottom edge with no dead band. If content is short, add a real section; never leave empty space or stretch a card to fill it.
12. Nothing overlaps nothing. Text never sits on top of other text or on a decorative shape. A decorative shape is a child with class z-deco inside a z-hero, placed in a corner at 40% size and 50% opacity, and it must not reach the text column. Never use position:absolute for text or buttons.
13. Every row has the same height, every card in a row has the same height, every icon button is 40px or 44px. Check alignment before you finish.
14. Long text wraps or truncates with z-truncate. Horizontal scrollers (z-chips) are for chips only and never show a scroll bar.
15. If the user states a durable fact about themselves, their brand or how they like to work, append <remember category="preferences|profile|topics|areas">one short sentence</remember> after your reply text. Never for ordinary design requests.

${blueprintFor(intent, device)}

## Skeleton (shape to follow for the requested device; replace all content)
Mobile:
${kitExample("mobile")}
Web:
${kitExample("web")}`,
  ].join("\n\n");
}
