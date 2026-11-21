import { DesignSystem, tokensCss } from "./designSystems";
import type { Device } from "../types";

export type Archetype = "dashboard" | "login" | "feed" | "shop" | "player" | "settings" | "landing";

const BASE_CSS = `
*{box-sizing:border-box;margin:0}
html,body{height:100%}
body{font-family:var(--font);background:var(--bg);color:var(--text);font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased;overflow-x:hidden}
h1,h2,h3{font-family:var(--heading);font-weight:var(--weight);letter-spacing:-.015em}
button,input{font:inherit;color:inherit}
.screen{min-height:100%;display:flex;flex-direction:column;position:relative}
.scroll{flex:1;padding:8px 20px 110px;display:flex;flex-direction:column;gap:18px}
.web .scroll{padding:0 0 0}
.status{display:flex;justify-content:space-between;align-items:center;padding:14px 26px 4px;font-size:13px;font-weight:600}
.appbar{display:flex;align-items:center;justify-content:space-between;padding:10px 20px 4px}
.appbar h1{font-size:28px}
.eyebrow{font-size:12px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 24px;border-radius:var(--r-btn);background:var(--primary);color:var(--on-primary);border:var(--bw) solid var(--text);border-color:transparent;font-weight:600;cursor:pointer;transition:border-radius .35s cubic-bezier(.34,1.56,.64,1),transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s,filter .2s;box-shadow:var(--shadow)}
.btn:hover{filter:brightness(1.07)}
.btn:active{transform:scale(.97) translate(1px,1px)}
.btn.tonal{background:var(--container);color:var(--on-container);box-shadow:none}
.btn.outline{background:transparent;color:var(--primary);border:max(var(--bw),1px) solid var(--outline);box-shadow:none}
.btn.block{width:100%}
.btn.sm{height:36px;padding:0 16px;font-size:13px}
.card{background:var(--surface);border-radius:var(--r-card);padding:16px;box-shadow:var(--shadow);border:var(--bw) solid var(--outline)}
.card.tonal{background:var(--container);color:var(--on-container);border-color:transparent}
.card.flat{box-shadow:none}
.chip{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:calc(var(--r-sm) + 6px);background:var(--surface-2);font-size:13px;font-weight:600;cursor:pointer;border:var(--bw) solid transparent;transition:all .25s cubic-bezier(.34,1.56,.64,1)}
.chip.on{background:var(--container);color:var(--on-container)}
.chip:active{transform:scale(.94)}
.row{display:flex;align-items:center;gap:12px}.between{justify-content:space-between}.grow{flex:1;min-width:0}
.col{display:flex;flex-direction:column;gap:10px}
.avatar{width:44px;height:44px;border-radius:calc(var(--r-md) + 8px);display:grid;place-items:center;font-weight:700;background:var(--container);color:var(--on-container);flex:none}
.item{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:var(--r-lg);background:var(--surface);transition:transform .2s cubic-bezier(.34,1.56,.64,1);cursor:pointer;border:var(--bw) solid var(--outline)}
.item:hover{transform:translateX(3px)}
.item b{font-weight:600}.item small{display:block;color:var(--muted);font-size:12.5px}
.nav{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-around;padding:10px 8px 22px;background:var(--surface);border-top:var(--bw) solid var(--outline)}
.nav a{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;min-width:64px}
.nav a i{font-style:normal;font-size:20px;width:60px;height:32px;display:grid;place-items:center;border-radius:calc(var(--r-btn) * .5 + 8px);transition:all .3s cubic-bezier(.34,1.56,.64,1)}
.nav a.on{color:var(--text)}.nav a.on i{background:var(--container);color:var(--on-container)}
.fab{position:absolute;right:20px;bottom:104px;width:60px;height:60px;border-radius:calc(var(--r-card) * .7);background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-size:26px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;border:var(--bw) solid var(--text);border-color:transparent;transition:transform .25s cubic-bezier(.34,1.56,.64,1),border-radius .35s}
.fab:hover{transform:scale(1.08) rotate(6deg)}.fab:active{transform:scale(.92);border-radius:50%}
.field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600}
.field input{height:52px;border-radius:var(--r-md);border:max(var(--bw),1px) solid var(--outline);background:var(--surface);padding:0 16px;font-weight:400;font-size:15px;outline:none;transition:box-shadow .2s,border-color .2s}
.field input:focus{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 25%,transparent)}
.switch{width:52px;height:30px;border-radius:99px;background:var(--surface-2);border:2px solid var(--outline);position:relative;cursor:pointer;transition:all .25s;flex:none}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--outline);transition:all .3s cubic-bezier(.34,1.56,.64,1)}
.switch.on{background:var(--primary);border-color:var(--primary)}.switch.on::after{left:25px;width:20px;background:var(--on-primary)}
.art{border-radius:var(--r-lg);aspect-ratio:1;display:grid;place-items:center;font-size:44px}
.bar{height:8px;border-radius:99px;background:var(--surface-2);overflow:hidden}.bar i{display:block;height:100%;background:var(--primary);border-radius:99px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hero-big{font-size:44px;line-height:1.02;letter-spacing:-.03em}
.v1 .hero-big{font-size:54px}
.pop{animation:pop .5s cubic-bezier(.34,1.56,.64,1) both}
@keyframes pop{from{opacity:0;transform:translateY(14px) scale(.96)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* web layout */
.topnav{display:flex;align-items:center;justify-content:space-between;padding:18px 56px;background:var(--bg)}
.topnav nav{display:flex;gap:28px;font-weight:600;color:var(--muted)}
.logo{font-family:var(--heading);font-weight:800;font-size:20px;display:flex;align-items:center;gap:8px}.logo i{width:28px;height:28px;border-radius:calc(var(--r-md) * .6);background:var(--primary);display:inline-block}
.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;padding:56px 56px 40px;align-items:center}
.hero h1{font-size:68px;line-height:1;letter-spacing:-.035em}
.sec{padding:36px 56px}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.sidebar{width:230px;padding:20px 14px;display:flex;flex-direction:column;gap:6px;background:var(--surface);border-right:var(--bw) solid var(--outline);min-height:100%}
.sidebar a{padding:11px 14px;border-radius:calc(var(--r-btn) * .5 + 6px);font-weight:600;color:var(--muted);cursor:pointer;transition:all .25s}
.sidebar a.on{background:var(--container);color:var(--on-container)}
.dash{display:flex;min-height:100%}.dash main{flex:1;padding:28px 36px;display:flex;flex-direction:column;gap:20px}
.cols4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
`;

const JS = `
document.addEventListener('click',function(e){
 var t=e.target.closest('.nav a,.sidebar a');if(t){t.parentNode.querySelectorAll('a').forEach(function(a){a.classList.remove('on')});t.classList.add('on');}
 var c=e.target.closest('.chip');if(c){var g=c.parentNode;if(g.dataset.single!==undefined){g.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on')})}c.classList.toggle('on');}
 var s=e.target.closest('.switch');if(s)s.classList.toggle('on');
 var h=e.target.closest('[data-heart]');if(h){h.textContent=h.textContent==='♡'?'♥':'♡';h.style.color=h.textContent==='♥'?'var(--error)':'';}
 var p=e.target.closest('[data-play]');if(p){p.textContent=p.textContent==='▶'?'⏸':'▶';}
});
document.querySelectorAll('.stagger > *').forEach(function(el,i){el.classList.add('pop');el.style.animationDelay=(i*45)+'ms'});
`;

const gradients = (ds: DesignSystem, i: number) => {
  const k = ds.tokens;
  const sets = [
    `linear-gradient(135deg,${k.primary},${k.tertiary})`,
    `linear-gradient(135deg,${k.container},${k.secondary}55)`,
    `linear-gradient(160deg,${k.tertiary},${k.primary})`,
    `linear-gradient(135deg,${k.secondary},${k.container})`,
  ];
  return sets[i % sets.length];
};

function nav(items: [string, string][], on = 0) {
  return `<div class="nav">${items.map(([ic, l], i) => `<a class="${i === on ? "on" : ""}"><i>${ic}</i>${l}</a>`).join("")}</div>`;
}
function status() { return `<div class="status"><span>9:41</span><span>●●● 5G 92%</span></div>`; }

function mobile(ds: DesignSystem, a: Archetype, v: number, title: string): string {
  const N = (i: [string, string][], on = 0) => nav(i, on);
  const wrap = (inner: string, extra = "") => `<div class="screen v${v}">${status()}${inner}${extra}</div>`;
  switch (a) {
    case "login":
      return wrap(`<div class="scroll stagger" style="justify-content:${v === 1 ? "flex-start" : "center"}">
        ${v === 1 ? `<div class="card tonal" style="padding:28px;border-radius:var(--r-xl);margin:0 -4px"><div class="avatar" style="width:64px;height:64px;background:var(--primary);color:var(--on-primary);font-size:28px">⚡</div><h1 class="hero-big" style="margin-top:22px">Welcome back.</h1><p style="margin-top:8px;opacity:.8">Sign in to continue ${title}.</p></div>` :
          `<div><div class="avatar" style="width:64px;height:64px;background:var(--primary);color:var(--on-primary);font-size:28px">⚡</div><h1 class="hero-big" style="margin-top:20px">Welcome back</h1><p class="muted" style="margin-top:6px">Sign in to continue to ${title}.</p></div>`}
        <label class="field">Email<input value="alex@zeus.app"/></label>
        <label class="field">Password<input type="password" value="password123"/></label>
        <div class="row between"><span class="row" style="gap:8px"><span class="switch on" style="transform:scale(.7)"></span>Remember me</span><b style="color:var(--primary)">Forgot?</b></div>
        <button class="btn block">Sign in</button>
        <button class="btn tonal block">Continue with Google</button>
        <p class="muted" style="text-align:center">New here? <b style="color:var(--primary)">Create account</b></p></div>`);
    case "shop":
      return wrap(`<div class="appbar"><h1>${v === 1 ? "Discover" : title}</h1><span class="avatar" style="width:40px;height:40px">🛍</span></div>
        <div class="scroll"><div class="item" style="border-radius:var(--r-btn);padding:14px 20px"><span>🔍</span><span class="muted">Search products…</span></div>
        <div class="row stagger" data-single style="overflow:auto;gap:8px"><span class="chip on">All</span><span class="chip">Sneakers</span><span class="chip">Watches</span><span class="chip">Audio</span><span class="chip">Decor</span></div>
        ${v === 1 ? `<div class="card tonal" style="padding:22px"><div class="eyebrow">Summer drop</div><h2 class="hero-big" style="font-size:38px;margin:8px 0 14px">Up to 40% off</h2><button class="btn sm">Shop now</button></div>` : ""}
        <div class="grid2 stagger">${["Aero Runner|$129|👟", "Chrono S2|$249|⌚", "Pulse Buds|$89|🎧", "Halo Lamp|$59|💡"].map((p, i) => { const [n, pr, e] = p.split("|"); return `<div class="card flat" style="padding:10px"><div class="art" style="background:${gradients(ds, i)}">${e}</div><div class="row between" style="margin-top:10px"><div><b>${n}</b><div class="muted" style="font-size:13px">${pr}</div></div><span data-heart style="font-size:22px;cursor:pointer">♡</span></div></div>`; }).join("")}</div></div>
        <div class="fab">＋</div>${N([["🏠", "Home"], ["🔎", "Explore"], ["🛒", "Cart"], ["👤", "Me"]])}`);
    case "feed":
      return wrap(`<div class="appbar"><h1>${title}</h1><span style="font-size:22px">🔔</span></div><div class="scroll">
        <div class="row stagger" style="overflow:auto;gap:14px">${["You", "Mia", "Leo", "Ava", "Noa"].map((n, i) => `<div class="col" style="align-items:center;gap:4px"><div class="avatar" style="width:62px;height:62px;border-radius:${v === 1 ? "30%" : "50%"};background:${gradients(ds, i)};color:#fff;font-size:20px">${n[0]}</div><small class="muted">${n}</small></div>`).join("")}</div>
        <div class="col stagger">${[["Mia Chen", "Designing in public — day 42 ✨", "🌄"], ["Leo Park", "New component library is live", "🧩"], ["Ava Singh", "Weekend sketchbook dump", "✏️"]].map(([n, t, e], i) => `<div class="card flat" style="padding:14px"><div class="row"><div class="avatar">${n[0]}</div><div class="grow"><b>${n}</b><div class="muted" style="font-size:12.5px">${i + 1}h ago</div></div><span>⋯</span></div><p style="margin:12px 0">${t}</p><div class="art" style="aspect-ratio:${v === 2 ? "3/1" : "16/10"};background:${gradients(ds, i + 1)}">${e}</div><div class="row" style="margin-top:12px;gap:18px;font-size:20px"><span data-heart style="cursor:pointer">♡</span><span>💬</span><span>↗</span></div></div>`).join("")}</div></div>
        <div class="fab">✎</div>${N([["🏠", "Home"], ["🔎", "Search"], ["▶️", "Reels"], ["💬", "Chat"], ["👤", "You"]])}`);
    case "player":
      return wrap(`<div class="appbar"><span style="font-size:22px">⌄</span><span class="eyebrow">Now playing</span><span style="font-size:22px">⋯</span></div><div class="scroll stagger" style="align-items:stretch">
        <div class="art" style="background:${gradients(ds, 0)};border-radius:${v === 1 ? "50%" : "var(--r-xl)"};font-size:90px;margin:8px 10px">🎧</div>
        <div class="row between"><div><h1 style="font-size:28px">Neon Skyline</h1><div class="muted">Aurora Vale</div></div><span data-heart style="font-size:28px;cursor:pointer">♡</span></div>
        <div><div class="bar"><i style="width:38%"></i></div><div class="row between muted" style="font-size:12px;margin-top:6px"><span>1:24</span><span>3:41</span></div></div>
        <div class="row" style="justify-content:center;gap:22px"><span style="font-size:26px">⏮</span><button data-play class="btn" style="width:84px;height:84px;padding:0;font-size:30px;border-radius:${ds.tokens.morph ? "36%" : "50%"}">⏸</button><span style="font-size:26px">⏭</span></div>
        <div class="row between muted"><span>🔀</span><span>🔁</span><span>📃</span><span>🔊</span></div></div>`);
    case "settings":
      return wrap(`<div class="appbar"><h1>Settings</h1></div><div class="scroll stagger">
        <div class="card tonal row"><div class="avatar" style="background:var(--primary);color:var(--on-primary)">A</div><div class="grow"><b>Alex Rivera</b><div style="opacity:.75;font-size:13px">alex@zeus.app</div></div><button class="btn sm">Edit</button></div>
        ${[["Notifications", [["🔔", "Push notifications", 1], ["📧", "Email digest", 0]]], ["Appearance", [["🌙", "Dark mode", 0], ["✨", "Reduce motion", 0], ["🎨", "Dynamic color", 1]]]].map(([g, items]) => `<div class="col"><div class="eyebrow" style="padding-left:6px">${g}</div>${(items as [string, string, number][]).map(([ic, l, on]) => `<div class="item"><span class="avatar" style="width:38px;height:38px">${ic}</span><span class="grow"><b>${l}</b></span><span class="switch ${on ? "on" : ""}"></span></div>`).join("")}</div>`).join("")}
        <button class="btn outline block">Sign out</button></div>${N([["🏠", "Home"], ["📈", "Stats"], ["⚙️", "Settings"]], 2)}`);
    default: // dashboard
      return wrap(`<div class="appbar"><div><div class="muted" style="font-size:13px">Good morning, Alex</div><h1>${v === 1 ? "Overview" : title}</h1></div><div class="avatar" style="border-radius:50%">A</div></div><div class="scroll stagger">
        <div class="card tonal" style="padding:22px;${v === 1 ? "border-radius:var(--r-xl)" : ""}"><div class="eyebrow" style="opacity:.7">Total balance</div><div class="hero-big" style="margin:6px 0 4px">$24,380</div><div class="row" style="gap:8px"><span class="chip on" style="background:var(--primary);color:var(--on-primary)">▲ 12.4%</span><span style="opacity:.7;font-size:13px">vs last month</span></div>
        <svg viewBox="0 0 300 70" style="width:100%;margin-top:14px"><path d="M0 55 C30 50 40 20 70 30 S120 60 150 35 S210 5 240 25 S280 20 300 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div>
        <div class="row" data-single style="gap:8px"><span class="chip on">Week</span><span class="chip">Month</span><span class="chip">Year</span></div>
        <div class="grid2"><div class="card flat"><div class="eyebrow">Income</div><b style="font-size:22px">$8,240</b><div class="bar" style="margin-top:10px"><i style="width:72%"></i></div></div><div class="card flat"><div class="eyebrow">Spent</div><b style="font-size:22px">$3,115</b><div class="bar" style="margin-top:10px"><i style="width:38%;background:var(--tertiary)"></i></div></div></div>
        <div class="col">${[["🛒", "Groceries", "Today", "-$84.20"], ["🎬", "Streaming", "Yesterday", "-$15.99"], ["💼", "Salary", "Mon", "+$4,120"]].map(([e, n, d, a]) => `<div class="item"><span class="avatar">${e}</span><span class="grow"><b>${n}</b><small>${d}</small></span><b style="color:${a[0] === "+" ? "var(--tertiary)" : "inherit"}">${a}</b></div>`).join("")}</div></div>
        <div class="fab">＋</div>${N([["🏠", "Home"], ["📈", "Stats"], ["💳", "Cards"], ["👤", "Profile"]])}`);
  }
}

function web(ds: DesignSystem, a: Archetype, v: number, title: string): string {
  const top = `<div class="topnav"><div class="logo"><i></i>${title}</div><nav><span>Product</span><span>Solutions</span><span>Pricing</span><span>Docs</span></nav><div class="row"><button class="btn outline sm">Log in</button><button class="btn sm">Get started</button></div></div>`;
  if (a === "dashboard" || a === "settings") {
    return `<div class="screen web v${v}"><div class="dash"><aside class="sidebar"><div class="logo" style="padding:6px 12px 18px"><i></i>${title}</div>${["Overview", "Analytics", "Customers", "Orders", "Settings"].map((n, i) => `<a class="${i === 0 ? "on" : ""}">${n}</a>`).join("")}</aside><main class="stagger">
      <div class="row between"><div><div class="muted">Welcome back, Alex</div><h1 style="font-size:34px">${v === 1 ? "Your business, at a glance" : "Overview"}</h1></div><button class="btn">Export</button></div>
      <div class="cols4">${[["Revenue", "$48.2k", "+12%"], ["Orders", "1,284", "+4%"], ["Customers", "892", "+9%"], ["Refunds", "1.2%", "-0.3%"]].map(([l, n, d], i) => `<div class="card ${i === 0 && v !== 2 ? "tonal" : ""}"><div class="eyebrow" style="opacity:.7">${l}</div><div style="font-size:32px;font-weight:700;margin:4px 0">${n}</div><span class="chip on" style="height:26px">${d}</span></div>`).join("")}</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px"><div class="card"><b>Revenue</b><svg viewBox="0 0 600 180" style="width:100%;margin-top:10px"><path d="M0 140 C60 120 90 60 150 80 S250 150 310 100 S430 30 480 60 S570 40 600 20" fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round"/></svg></div><div class="card col"><b>Recent orders</b>${["Mia Chen|$129", "Leo Park|$249", "Ava Singh|$89"].map((o) => { const [n, p] = o.split("|"); return `<div class="row between"><span class="row"><span class="avatar" style="width:34px;height:34px">${n[0]}</span>${n}</span><b>${p}</b></div>`; }).join("")}</div></div>
    </main></div></div>`;
  }
  if (a === "login") {
    return `<div class="screen web v${v}"><div style="flex:1;display:grid;grid-template-columns:${v === 1 ? "1fr 1fr" : "1fr"};min-height:800px">${v === 1 ? `<div style="background:${gradients(ds, 0)};display:grid;place-items:center;color:#fff;padding:60px"><h1 class="hero-big" style="font-size:72px">Create without limits.</h1></div>` : ""}<div style="display:grid;place-items:center;padding:40px"><div class="card col stagger" style="width:420px;padding:36px;gap:16px"><div class="logo"><i></i>${title}</div><h1 style="font-size:32px">Sign in</h1><label class="field">Email<input value="alex@zeus.app"/></label><label class="field">Password<input type="password" value="••••••••"/></label><button class="btn block">Continue</button><button class="btn outline block">Continue with Google</button></div></div></div></div>`;
  }
  // landing (default for web)
  return `<div class="screen web v${v}">${top}
    <div class="hero stagger"><div class="col" style="gap:20px"><span class="chip on" style="align-self:flex-start">✨ New · ${title} 2.0</span><h1>${v === 1 ? "Make something people love." : "Design that ships itself."}</h1><p class="muted" style="font-size:19px;max-width:520px">The fastest way to go from idea to a polished, production-ready product — loved by 40,000 teams.</p><div class="row"><button class="btn" style="height:56px;padding:0 32px">Start free</button><button class="btn outline" style="height:56px;padding:0 28px">▶ Watch demo</button></div></div>
    <div class="card tonal" style="border-radius:var(--r-xl);padding:26px;background:${v === 2 ? "var(--surface-2)" : "var(--container)"}"><div class="col" style="gap:12px">${["Design system synced", "3 variants generated", "Exported to React"].map((t, i) => `<div class="item"><span class="avatar" style="background:${gradients(ds, i)};color:#fff">${["🎨", "🧬", "⚛️"][i]}</span><span class="grow"><b>${t}</b><small>${i + 1} min ago</small></span><span class="chip on">Done</span></div>`).join("")}</div></div></div>
    <div class="sec"><div class="cols3 stagger">${[["⚡", "Blazing fast", "Generate full screens in seconds."], ["🎯", "Pixel precise", "Tokens keep every pixel on-system."], ["🔌", "Connected", "Syncs to your real codebase."]].map(([e, t, d], i) => `<div class="card flat"><div class="avatar" style="width:52px;height:52px;margin-bottom:14px;background:${gradients(ds, i)};color:#fff">${e}</div><h3 style="font-size:20px">${t}</h3><p class="muted" style="margin-top:6px">${d}</p></div>`).join("")}</div></div>
    <div class="sec" style="text-align:center;padding-bottom:60px"><h2 style="font-size:40px">Ready when you are.</h2><p class="muted" style="margin:8px 0 20px">No credit card. Cancel anytime.</p><button class="btn" style="height:56px;padding:0 36px">Get started</button></div></div>`;
}

export function detectArchetype(prompt: string, device: Device): Archetype {
  const p = prompt.toLowerCase();
  if (/(login|sign.?in|sign.?up|auth|onboard|register)/.test(p)) return "login";
  if (/(shop|store|e-?commerce|product|cart|market)/.test(p)) return "shop";
  if (/(feed|social|post|timeline|news|chat|story)/.test(p)) return "feed";
  if (/(music|player|podcast|audio|song|spotify)/.test(p)) return "player";
  if (/(setting|preference|profile|account)/.test(p)) return "settings";
  if (/(landing|marketing|homepage|saas|hero|pricing|website)/.test(p)) return "landing";
  if (/(dash|analytic|finance|bank|wallet|fitness|admin|stats|crm)/.test(p)) return "dashboard";
  return device === "web" ? "landing" : "dashboard";
}

export const VARIANT_NAMES = ["Balanced", "Bold", "Compact"];

export function renderScreen(ds: DesignSystem, archetype: Archetype, variant: number, device: Device, title = "Zeus"): string {
  const body = device === "web" ? web(ds, archetype, variant, title) : mobile(ds, archetype, variant, title);
  const dark = ds.tokens.dark
    ? `body{background:radial-gradient(60% 40% at 15% 10%,#5b4bff55,transparent),radial-gradient(50% 40% at 90% 30%,#ff4fd855,transparent),radial-gradient(60% 50% at 40% 100%,#00d4ff40,transparent),var(--bg)}.card,.item,.nav,.sidebar,.field input{backdrop-filter:blur(24px) saturate(160%)}`
    : "";
  const brut = ds.id === "neo" ? `.btn,.card,.item,.chip,.fab{border-color:#111!important}.btn:active{box-shadow:none!important}` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${tokensCss(ds)}${BASE_CSS}${dark}${brut}</style></head><body>${body}<script>${JS}</script></body></html>`;
}

export function blankFrame(ds: DesignSystem): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokensCss(ds)}*{box-sizing:border-box}body{margin:0;height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--muted);font-family:var(--font);text-align:center}div{max-width:240px;line-height:1.5}b{display:block;font-size:34px;margin-bottom:8px}</style></head><body><div><b>⚡</b>Empty frame<br><small>Select it and use “Ask Zeus” to fill it with a design.</small></div></body></html>`;
}
