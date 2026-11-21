import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Dialog, IconBtn, Segmented, Thumb, Toggle } from "./ui";
import { PROVIDERS } from "../lib/providers";
import { DESIGN_SYSTEMS, getDS } from "../lib/designSystems";
import { SKILLS } from "../lib/skills";
import { ACCENTS } from "../lib/theme";
import { renderScreen } from "../lib/templates";
import { DEVICE_SIZE } from "../types";
import { canvasApi } from "../lib/canvasApi";
import { cn } from "../utils/cn";
import { checkForUpdate, installUpdate } from "../lib/updater";
import { Icon } from "./Icon";
import { MemoryTab } from "./MemoryPanel";
import { ConnectorsTab } from "./Connectors";

const TABS = [
  { id: "appearance", label: "Appearance", icon: "palette", group: "General" },
  { id: "providers", label: "Models", icon: "memory", group: "General" },
  { id: "memory", label: "Memory", icon: "psychology", group: "Your Zeus" },
  { id: "library", label: "Design library", icon: "local_library", group: "Capabilities" },
  { id: "mcp", label: "Connectors", icon: "extension", group: "Capabilities" },
  { id: "updates", label: "Updates", icon: "system_update", group: "App" },
  { id: "about", label: "About", icon: "info", group: "App" },
];

const PRESETS = [
  { name: "OpenAI", format: "openai" as const, baseUrl: "https://api.openai.com/v1", model: "gpt-4.1" },
  { name: "Anthropic", format: "anthropic" as const, baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
  { name: "OpenRouter", format: "openai" as const, baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-4.5" },
  { name: "Groq", format: "openai" as const, baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { name: "Ollama (local)", format: "openai" as const, baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder" },
  { name: "LM Studio (local)", format: "openai" as const, baseUrl: "http://localhost:1234/v1", model: "local-model" },
];

const field = "h-11 w-full rounded-2xl bg-surface-high px-4 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-on-surface-variant/50";

/* ---------------- Providers ---------------- */
function ProvidersTab() {
  const { settings, ui } = useStore();
  const patch = useStore((s) => s.patchSettings);
  const [form, setForm] = useState({ name: "", format: "openai" as "openai" | "anthropic", baseUrl: "", apiKey: "", model: "" });
  const add = () => {
    if (!form.baseUrl || !form.model) return;
    const id = Math.random().toString(36).slice(2, 8);
    patch({ customProviders: [...settings.customProviders, { id, ...form, name: form.name || form.model }], providerId: `custom:${id}`, modelId: form.model });
    setForm({ name: "", format: "openai", baseUrl: "", apiKey: "", model: "" });
  };
  return (
    <div className="space-y-6">
      <div className={cn("flex items-center gap-3 rounded-3xl px-4 py-3 text-sm", ui.nativeReady ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-high text-on-surface-variant")}>
        <Icon name="auto_awesome" size={18} />
        {ui.nativeReady ? "Native engine connected" : "Browser preview, demo engine"}
      </div>
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold">Free · keyless providers</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const active = settings.providerId === p.id;
            return (
              <button
                key={p.id} onClick={() => patch({ providerId: p.id, modelId: p.models[0].id })}
                className={cn("state flex items-start gap-3 rounded-[26px] border p-4 text-left transition-all", active ? "border-primary bg-primary-container/60" : "border-outline-variant/60 bg-surface-container")}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-surface-high text-on-surface-variant"><Icon name={p.icon} size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-on-surface">{p.name}{active && <Icon name="check" size={15} className="text-primary" />}</span>
                  <span className="block text-xs text-on-surface-variant">{p.tagline}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-surface-highest px-2 py-0.5 text-[10.5px] font-semibold text-on-surface-variant">{p.speed}</span>
                    {p.role === "title" && <span className="rounded-full bg-tertiary-container px-2 py-0.5 text-[10.5px] font-semibold text-on-tertiary-container">Auto-titles chats</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold">Bring your own key</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => <button key={p.name} onClick={() => setForm({ ...form, ...p, apiKey: form.apiKey })} className="state rounded-full bg-surface-high px-3 py-1.5 text-xs font-semibold text-on-surface">{p.name}</button>)}
        </div>
        {settings.customProviders.map((c) => (
          <div key={c.id} className="mb-2 flex items-center gap-3 rounded-[22px] bg-surface-container px-4 py-3">
            <Icon name="key" size={18} className="text-primary" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{c.name}</div><div className="truncate text-xs text-on-surface-variant">{c.format} · {c.baseUrl} · {c.model}</div></div>
            <IconBtn label="Use" size={34} active={settings.providerId === `custom:${c.id}`} onClick={() => patch({ providerId: `custom:${c.id}`, modelId: c.model })}><Icon name="check" size={16} /></IconBtn>
            <IconBtn label="Remove" size={34} onClick={() => patch({ customProviders: settings.customProviders.filter((x) => x.id !== c.id) })}><Icon name="delete" size={16} /></IconBtn>
          </div>
        ))}
        <div className="grid gap-2.5 rounded-[26px] bg-surface-container p-4 sm:grid-cols-2">
          <input className={field} placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Segmented value={form.format} onChange={(v) => setForm({ ...form, format: v })} options={[{ id: "openai", label: "OpenAI-compatible" }, { id: "anthropic", label: "Anthropic" }]} />
          <input className={cn(field, "sm:col-span-2")} placeholder="Base URL  e.g. https://api.openai.com/v1" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          <input className={field} type="password" placeholder="API key" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          <input className={field} placeholder="Model id" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <button onClick={add} disabled={!form.baseUrl || !form.model} className="state morph flex h-11 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-on-primary sm:col-span-2"><Icon name="add" size={17} /> Add endpoint</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Library ---------------- */
function LibraryTab() {
  const { settings } = useStore();
  const patch = useStore((s) => s.patchSettings);
  const [sub, setSub] = useState<"ds" | "skills">("ds");
  const [q, setQ] = useState("");
  const skills = useMemo(() => SKILLS.filter((s) => (s.name + s.desc + s.category).toLowerCase().includes(q.toLowerCase())), [q]);
  const addSample = (id: string, device: "mobile" | "web") => {
    const ds = getDS(id);
    const st = useStore.getState();
    const ab = st.addArtboard({ name: `${ds.name} · sample`, device, w: DEVICE_SIZE[device].w, h: DEVICE_SIZE[device].h, html: renderScreen(ds, device === "web" ? "landing" : "dashboard", 0, device, ds.name) });
    st.patchUI({ settingsOpen: false });
    st.setView("canvas"); st.setSel([ab.id]);
    setTimeout(() => canvasApi.fit([ab.id]), 80);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={sub} onChange={setSub} options={[{ id: "ds", label: `Design systems · ${DESIGN_SYSTEMS.length}`, icon: <Icon name="palette" size={14} /> }, { id: "skills", label: `Skills · ${SKILLS.length}`, icon: <Icon name="menu_book" size={14} /> }]} />
        {sub === "skills" && (
          <div className="relative min-w-52 flex-1"><Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" /><input className={cn(field, "pl-10")} placeholder="Search skills" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        )}
      </div>
      {sub === "ds" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DESIGN_SYSTEMS.map((d) => {
            const active = settings.designSystemId === d.id;
            return (
              <div key={d.id} className={cn("flex flex-col overflow-hidden rounded-[28px] border transition-all", active ? "border-primary bg-primary-container/50" : "border-outline-variant/60 bg-surface-container")}>
                <div className="flex justify-center bg-surface-dim pt-4"><div className="overflow-hidden rounded-t-[22px]"><Thumb html={renderScreen(d, "dashboard", 0, "mobile", d.name)} w={390} h={844} width={150} className="!h-[190px]" /></div></div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-semibold">{d.name}</span>
                  </div>
                  <p className="flex-1 text-xs text-on-surface-variant">{d.tagline}</p>
                  <div className="flex gap-1">{[d.tokens.primary, d.tokens.container, d.tokens.tertiary, d.tokens.secondary].map((c, i) => <span key={i} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: c }} />)}</div>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => patch({ designSystemId: d.id })} className={cn("state morph h-9 flex-1 rounded-full text-[13px] font-semibold", active ? "bg-primary text-on-primary" : "bg-secondary-container text-on-secondary-container")}>{active ? "In use" : "Use"}</button>
                    <button onClick={() => addSample(d.id, d.tags.includes("Web") && !d.tags.includes("Android") && !d.tags.includes("iOS") ? "web" : "mobile")} title="Add a sample screen to the canvas" className="state grid size-9 place-items-center rounded-full bg-surface-high text-on-surface-variant"><Icon name="add" size={16} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {skills.map((s) => {
            const on = settings.skills.includes(s.id);
            return (
              <div key={s.id} className="flex items-start gap-3 rounded-[24px] bg-surface-container p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-surface-high text-on-surface-variant"><Icon name={s.icon} size={22} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-on-surface">{s.name}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">{s.category}</div>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{s.desc}</p>
                </div>
                <Toggle on={on} onChange={(v) => patch({ skills: v ? [...settings.skills, s.id] : settings.skills.filter((x) => x !== s.id) })} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Appearance & About ---------------- */
function AppearanceTab() {
  const s = useStore((st) => st.settings);
  const patch = useStore((st) => st.patchSettings);
  return (
    <div className="space-y-6">
      <div><h3 className="mb-2 font-display text-lg font-semibold">Theme</h3><Segmented value={s.theme} onChange={(v) => patch({ theme: v })} options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "system", label: "System" }]} /></div>
      <div>
        <h3 className="mb-2 font-display text-lg font-semibold">Accent (dynamic color)</h3>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button key={a.id} onClick={() => patch({ hue: a.hue })} title={a.name} className={cn("grid size-12 place-items-center rounded-[16px] text-white transition-all ease-spring", s.hue === a.hue ? "scale-110 rounded-full ring-4 ring-primary/30" : "hover:scale-105")} style={{ background: `hsl(${a.hue} 60% 50%)` }}>{s.hue === a.hue && <Icon name="check" size={20} />}</button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-outline-variant/60 rounded-xl border border-outline-variant">
        <div className="flex items-center justify-between px-4 py-3"><div className="text-sm font-medium">Auto-title chats</div><Toggle on={s.autoTitle} onChange={(v) => patch({ autoTitle: v })} /></div>
        <div className="flex items-center justify-between px-4 py-3"><div className="text-sm font-medium">Check and repair every design</div><Toggle on={s.selfCheck} onChange={(v) => patch({ selfCheck: v })} /></div>
      </div>
    </div>
  );
}

function UpdatesTab() {
  const info = useStore((s) => s.ui.update);
  const version = useStore((s) => s.ui.version);
  const patchUI = useStore((s) => s.patchUI);
  const [state, setState] = useState<"idle" | "checking" | "downloading" | "error">("idle");
  const [err, setErr] = useState("");
  const [pct, setPct] = useState(0);
  const check = async () => {
    setState("checking"); setErr("");
    try { patchUI({ update: await checkForUpdate() }); setState("idle"); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setState("error"); }
  };
  const install = async () => {
    if (!info) return;
    setState("downloading"); setPct(0);
    try { await installUpdate(info, (d, t) => setPct(t ? Math.round((d / t) * 100) : 0)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setState("error"); }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-[28px] bg-surface-container p-5">
        <span className={cn("grid size-12 place-items-center rounded-[18px]", info?.available ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant")}><Icon name={info?.available ? "system_update" : "check_circle"} size={26} fill /></span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold">{info?.available ? `Version ${info.latest} is ready` : info ? "You are up to date" : "ZeusDesigns"}</div>
          <div className="text-sm text-on-surface-variant">Installed {version || "dev"}{info && !info.available ? ` · latest ${info.latest}` : ""}</div>
        </div>
        {info?.available ? (
          <button onClick={install} disabled={state === "downloading"} className="state morph flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">
            <Icon name={state === "downloading" ? "progress_activity" : "download"} size={18} className={state === "downloading" ? "animate-spin" : ""} />{state === "downloading" ? `${pct}%` : "Install and restart"}
          </button>
        ) : (
          <button onClick={check} disabled={state === "checking"} className="state morph flex h-11 items-center gap-2 rounded-full bg-secondary-container px-5 text-sm font-semibold text-on-secondary-container">
            <Icon name={state === "checking" ? "progress_activity" : "refresh"} size={18} className={state === "checking" ? "animate-spin" : ""} />Check for updates
          </button>
        )}
      </div>
      {state === "downloading" && <div className="h-2 overflow-hidden rounded-full bg-surface-high"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>}
      {state === "error" && <div className="flex items-center gap-2 rounded-2xl bg-error-container px-4 py-3 text-sm text-on-error-container"><Icon name="error" size={18} />{err}</div>}
      {info && <a href={info.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Icon name="open_in_new" size={16} />Release page</a>}
    </div>
  );
}

function AboutTab() {
  const ready = useStore((s) => s.ui.nativeReady);
  const version = useStore((s) => s.ui.version);
  return (
    <div className="grid place-items-center gap-3 py-10 text-center">
      <img src="/app-icon.png" alt="" className="size-24 rounded-[28px]" />
      <h3 className="font-display text-3xl font-semibold">ZeusDesigns</h3>
      <div className="flex gap-2">
        <span className="rounded-full bg-surface-high px-3 py-1 text-xs font-semibold text-on-surface-variant">{version || "dev"}</span>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", ready ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-high text-on-surface-variant")}>{ready ? "Native engine" : "Demo engine"}</span>
      </div>
      <a href="https://github.com/NikitHamal/zeusdesigns" target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">github.com/NikitHamal/zeusdesigns</a>
    </div>
  );
}

export function SettingsDialog() {
  const open = useStore((s) => s.ui.settingsOpen);
  const tab = useStore((s) => s.ui.settingsTab);
  const patchUI = useStore((s) => s.patchUI);
  const [q, setQ] = useState("");
  const tabs = TABS.filter((t) => t.label.toLowerCase().includes(q.toLowerCase()));
  const cur = TABS.find((t) => t.id === tab) ?? TABS[0];
  const groups = Array.from(new Set(tabs.map((t) => t.group)));
  return (
    <Dialog open={open} onClose={() => patchUI({ settingsOpen: false })} className="h-[min(760px,88vh)] w-[min(1040px,94vw)] !rounded-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant px-6 py-3.5">
        <h2 className="text-[17px] font-semibold">Settings</h2>
        <IconBtn label="Close" size={36} onClick={() => patchUI({ settingsOpen: false })}><Icon name="close" size={20} /></IconBtn>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-outline-variant p-3 max-md:w-14">
          <div className="relative mb-2 max-md:hidden">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-outline-variant bg-transparent pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          {groups.map((g, gi) => (
            <div key={g} className={cn("flex flex-col gap-0.5", gi > 0 && "mt-3 border-t border-outline-variant/60 pt-3")}>
              {tabs.filter((t) => t.group === g).map((t) => (
                <button key={t.id} onClick={() => patchUI({ settingsTab: t.id })} className={cn("state flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium", cur.id === t.id ? "bg-surface-high text-on-surface" : "text-on-surface-variant")}>
                  <Icon name={t.icon} size={18} fill={cur.id === t.id} /><span className="max-md:hidden">{t.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {cur.id !== "memory" && <h3 className="mb-5 text-xl font-semibold">{cur.label}</h3>}
          {cur.id === "providers" && <ProvidersTab />}
          {cur.id === "library" && <LibraryTab />}
          {cur.id === "memory" && <MemoryTab />}
          {cur.id === "mcp" && <ConnectorsTab />}
          {cur.id === "appearance" && <AppearanceTab />}
          {cur.id === "updates" && <UpdatesTab />}
          {cur.id === "about" && <AboutTab />}
        </div>
      </div>
    </Dialog>
  );
}
