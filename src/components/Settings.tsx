import { useMemo, useState } from "react";
import { Brain, Check, Cpu, KeyRound, Library, Palette, Plug, Plus, Search, Sparkles, Trash2, Zap, BookOpen, Info, Plus as PlusIcon } from "lucide-react";
import { useStore } from "../store";
import { Dialog, IconBtn, Segmented, Thumb, Toggle } from "./ui";
import { PROVIDERS } from "../lib/providers";
import { DESIGN_SYSTEMS, getDS } from "../lib/designSystems";
import { SKILLS } from "../lib/skills";
import { ACCENTS } from "../lib/theme";
import { renderScreen } from "../lib/templates";
import { DEVICE_SIZE } from "../types";
import { tryInvoke } from "../lib/bridge";
import { canvasApi } from "../lib/canvasApi";
import { cn } from "../utils/cn";

const TABS = [
  { id: "providers", label: "AI Models", icon: Cpu },
  { id: "library", label: "Design Library", icon: Library },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "mcp", label: "MCP & Tools", icon: Plug },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "about", label: "About", icon: Info },
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
        <Zap size={18} />
        {ui.nativeReady ? "Native engine connected — all free providers stream directly from your machine." : "Native engine not detected (browser preview). Keyless providers run inside the Windows app; the demo designer is used here."}
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
                <span className="grid size-11 shrink-0 place-items-center rounded-[16px] text-xl text-white" style={{ background: p.color }}>{p.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-on-surface">{p.name}{active && <Check size={15} className="text-primary" />}</span>
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
        <h3 className="mb-1 font-display text-lg font-semibold">Bring your own key</h3>
        <p className="mb-3 text-sm text-on-surface-variant">Any OpenAI-compatible or Anthropic endpoint. Keys stay on this device.</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => <button key={p.name} onClick={() => setForm({ ...form, ...p, apiKey: form.apiKey })} className="state rounded-full bg-surface-high px-3 py-1.5 text-xs font-semibold text-on-surface">{p.name}</button>)}
        </div>
        {settings.customProviders.map((c) => (
          <div key={c.id} className="mb-2 flex items-center gap-3 rounded-[22px] bg-surface-container px-4 py-3">
            <KeyRound size={18} className="text-primary" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{c.name}</div><div className="truncate text-xs text-on-surface-variant">{c.format} · {c.baseUrl} · {c.model}</div></div>
            <IconBtn label="Use" size={34} active={settings.providerId === `custom:${c.id}`} onClick={() => patch({ providerId: `custom:${c.id}`, modelId: c.model })}><Check size={16} /></IconBtn>
            <IconBtn label="Remove" size={34} onClick={() => patch({ customProviders: settings.customProviders.filter((x) => x.id !== c.id) })}><Trash2 size={16} /></IconBtn>
          </div>
        ))}
        <div className="grid gap-2.5 rounded-[26px] bg-surface-container p-4 sm:grid-cols-2">
          <input className={field} placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Segmented value={form.format} onChange={(v) => setForm({ ...form, format: v })} options={[{ id: "openai", label: "OpenAI-compatible" }, { id: "anthropic", label: "Anthropic" }]} />
          <input className={cn(field, "sm:col-span-2")} placeholder="Base URL  e.g. https://api.openai.com/v1" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          <input className={field} type="password" placeholder="API key" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          <input className={field} placeholder="Model id" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <button onClick={add} disabled={!form.baseUrl || !form.model} className="state morph flex h-11 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-on-primary sm:col-span-2"><Plus size={17} /> Add endpoint</button>
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
        <Segmented value={sub} onChange={setSub} options={[{ id: "ds", label: `Design systems · ${DESIGN_SYSTEMS.length}`, icon: <Palette size={14} /> }, { id: "skills", label: `Skills · ${SKILLS.length}`, icon: <BookOpen size={14} /> }]} />
        {sub === "skills" && (
          <div className="relative min-w-52 flex-1"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" /><input className={cn(field, "pl-10")} placeholder="Search skills" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
                    {d.featured && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-on-primary">NATIVE</span>}
                  </div>
                  <p className="flex-1 text-xs text-on-surface-variant">{d.tagline}</p>
                  <div className="flex gap-1">{[d.tokens.primary, d.tokens.container, d.tokens.tertiary, d.tokens.secondary].map((c, i) => <span key={i} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: c }} />)}</div>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => patch({ designSystemId: d.id })} className={cn("state morph h-9 flex-1 rounded-full text-[13px] font-semibold", active ? "bg-primary text-on-primary" : "bg-secondary-container text-on-secondary-container")}>{active ? "In use" : "Use"}</button>
                    <button onClick={() => addSample(d.id, d.tags.includes("Web") && !d.tags.includes("Android") && !d.tags.includes("iOS") ? "web" : "mobile")} title="Add a sample screen to the canvas" className="state grid size-9 place-items-center rounded-full bg-surface-high text-on-surface-variant"><PlusIcon size={16} /></button>
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
                <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-surface-high text-xl">{s.icon}</span>
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

/* ---------------- Memory ---------------- */
function MemoryTab() {
  const mem = useStore((s) => s.settings.memory);
  const { addMemory, removeMemory } = useStore.getState();
  const [t, setT] = useState("");
  const add = () => { if (!t.trim()) return; addMemory(t.trim()); tryInvoke("memory_add", { text: t.trim() }); setT(""); };
  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">Memory persists across every chat and project. Zeus reads it before each reply — brand colors, audience, tech stack, preferences.</p>
      <div className="flex gap-2"><input className={field} placeholder="e.g. “Our brand is teal, audience is Gen-Z, Android-first (Compose)”" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /><button onClick={add} className="state morph h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">Remember</button></div>
      {mem.length === 0 && <div className="grid place-items-center rounded-[28px] bg-surface-container py-12 text-center text-sm text-on-surface-variant"><Brain size={32} className="mb-2 text-primary" />Nothing remembered yet.<br />Hover any reply in chat and tap the bookmark to save it.</div>}
      {mem.map((m) => (
        <div key={m.id} className="anim-pop flex items-start gap-3 rounded-[22px] bg-surface-container px-4 py-3"><Sparkles size={16} className="mt-0.5 shrink-0 text-primary" /><p className="flex-1 select-text text-sm">{m.text}</p><IconBtn label="Forget" size={30} onClick={() => { removeMemory(m.id); tryInvoke("memory_delete", { id: m.id }); }}><Trash2 size={14} /></IconBtn></div>
      ))}
    </div>
  );
}

/* ---------------- MCP ---------------- */
function McpTab() {
  const mcp = useStore((s) => s.settings.mcp);
  const patch = useStore((s) => s.patchSettings);
  const [f, setF] = useState({ name: "", transport: "stdio" as "stdio" | "http", command: "" });
  const add = () => {
    if (!f.name || !f.command) return;
    const srv = { id: Math.random().toString(36).slice(2, 8), enabled: true, ...f };
    patch({ mcp: [...mcp, srv] });
    tryInvoke("mcp_add", { server: srv });
    setF({ name: "", transport: "stdio", command: "" });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">Connect Model Context Protocol servers. Their tools become available to Zeus alongside the built-in file and shell tools.</p>
      <div className="grid gap-2 rounded-[26px] bg-surface-container p-4">
        <div className="text-sm font-semibold">Built-in agent tools</div>
        <div className="flex flex-wrap gap-1.5">{["read_file", "write_file", "list_dir", "search_code", "shell", "memory", "web_fetch"].map((t) => <span key={t} className="rounded-full bg-surface-high px-2.5 py-1 font-mono text-xs">{t}</span>)}</div>
      </div>
      {mcp.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-[22px] bg-surface-container px-4 py-3">
          <Plug size={18} className="text-primary" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{m.name}</div><div className="truncate font-mono text-xs text-on-surface-variant">{m.transport} · {m.command}</div></div>
          <Toggle on={m.enabled} onChange={(v) => patch({ mcp: mcp.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)) })} />
          <IconBtn label="Remove" size={32} onClick={() => { patch({ mcp: mcp.filter((x) => x.id !== m.id) }); tryInvoke("mcp_remove", { id: m.id }); }}><Trash2 size={15} /></IconBtn>
        </div>
      ))}
      <div className="grid gap-2.5 rounded-[26px] bg-surface-container p-4 sm:grid-cols-2">
        <input className={field} placeholder="Server name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Segmented value={f.transport} onChange={(v) => setF({ ...f, transport: v })} options={[{ id: "stdio", label: "stdio (command)" }, { id: "http", label: "HTTP / SSE" }]} />
        <input className={cn(field, "sm:col-span-2 font-mono")} placeholder={f.transport === "stdio" ? "npx -y @modelcontextprotocol/server-filesystem C:\\projects" : "https://mcp.example.com/sse"} value={f.command} onChange={(e) => setF({ ...f, command: e.target.value })} />
        <button onClick={add} className="state morph flex h-11 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-on-primary sm:col-span-2"><Plus size={17} /> Add MCP server</button>
      </div>
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
            <button key={a.id} onClick={() => patch({ hue: a.hue })} title={a.name} className={cn("grid size-12 place-items-center rounded-[16px] text-white transition-all ease-spring", s.hue === a.hue ? "scale-110 rounded-full ring-4 ring-primary/30" : "hover:scale-105")} style={{ background: `hsl(${a.hue} 60% 50%)` }}>{s.hue === a.hue && <Check size={20} />}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-[22px] bg-surface-container px-4 py-3"><div><div className="text-sm font-semibold">Auto-title chats with ChatJimmy</div><div className="text-xs text-on-surface-variant">Llama 3.1 8B at 20,000+ tok/s names every conversation instantly.</div></div><Toggle on={s.autoTitle} onChange={(v) => patch({ autoTitle: v })} /></div>
    </div>
  );
}

function AboutTab() {
  const ready = useStore((s) => s.ui.nativeReady);
  return (
    <div className="grid place-items-center gap-3 py-10 text-center">
      <div className="grid size-24 place-items-center rounded-[34%] bg-primary text-5xl text-on-primary" style={{ animation: "bolt 3s ease-in-out infinite" }}>⚡</div>
      <h3 className="font-display text-3xl font-bold">ZeusDesigns</h3>
      <p className="max-w-md text-sm text-on-surface-variant">Open-source, ultra-light native design & coding workspace. Material 3 Expressive UI, infinite multi-artboard canvas, free keyless AI providers, agent tools, memory and MCP.</p>
      <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", ready ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-high text-on-surface-variant")}>{ready ? "Native engine active" : "Browser preview · demo engine"}</span>
      <a href="https://github.com/NikitHamal/zeusdesigns" target="_blank" rel="noreferrer" className="text-sm text-primary underline">github.com/NikitHamal/zeusdesigns</a>
    </div>
  );
}

export function SettingsDialog() {
  const open = useStore((s) => s.ui.settingsOpen);
  const tab = useStore((s) => s.ui.settingsTab);
  const patchUI = useStore((s) => s.patchUI);
  return (
    <Dialog open={open} onClose={() => patchUI({ settingsOpen: false })} className="h-[86vh] w-[min(1060px,94vw)]">
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col gap-1 p-4 max-md:w-16">
          <h2 className="mb-3 px-3 font-display text-xl font-bold max-md:hidden">Settings</h2>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => patchUI({ settingsTab: t.id })} className={cn("state flex h-12 items-center gap-3 rounded-full px-4 text-sm font-semibold transition-all", tab === t.id ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant")}>
              <t.icon size={19} className="shrink-0" /><span className="max-md:hidden">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto rounded-l-[28px] bg-surface-low p-6">
          {tab === "providers" && <ProvidersTab />}
          {tab === "library" && <LibraryTab />}
          {tab === "memory" && <MemoryTab />}
          {tab === "mcp" && <McpTab />}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "about" && <AboutTab />}
        </div>
      </div>
      <button onClick={() => patchUI({ settingsOpen: false })} className="absolute right-4 top-4 hidden" />
    </Dialog>
  );
}
