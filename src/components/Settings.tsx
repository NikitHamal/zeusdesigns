import { useEffect, useMemo, useState } from "react";
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
import { download, nativePerf, nativeServer, type PerfStats, type ServerStatus } from "../lib/bridge";
import { Icon } from "./Icon";
import { MemoryTab } from "./MemoryPanel";
import { ConnectorsTab } from "./Connectors";

const TABS = [
  { id: "appearance", label: "Appearance", icon: "palette", group: "General" },
  { id: "providers", label: "Models", icon: "memory", group: "General" },
  { id: "server", label: "Local server", icon: "dns", group: "Capabilities" },
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
        <h3 className="mb-3 font-display text-lg font-semibold">Free · keyless providers ({PROVIDERS.length})</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const active = settings.providerId === p.id;
            const hasVision = p.models.some((m) => m.vision);
            return (
              <div
                key={p.id}
                onClick={() => patch({ providerId: p.id, modelId: p.models[0].id })}
                className={cn("state flex cursor-pointer flex-col gap-2.5 rounded-[24px] border p-4 text-left transition-all", active ? "border-primary bg-primary-container/50" : "border-outline-variant/60 bg-surface-container")}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-surface-high text-on-surface-variant"><Icon name={p.icon} size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold text-on-surface">{p.name}{active && <Icon name="check" size={15} className="text-primary" />}</span>
                    <span className="block text-xs text-on-surface-variant">{p.tagline}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-surface-highest px-2 py-0.5 text-[10.5px] font-semibold text-on-surface-variant">{p.speed}</span>
                      {hasVision && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2 py-0.5 text-[10.5px] font-semibold text-on-primary-container">
                          <Icon name="image" size={11} /> Vision & files
                        </span>
                      )}
                      {p.role === "title" && <span className="rounded-full bg-tertiary-container px-2 py-0.5 text-[10.5px] font-semibold text-on-tertiary-container">Auto-titles chats</span>}
                    </span>
                  </span>
                </div>
                {p.models.length > 1 && (
                  <div className="flex flex-wrap gap-1 pt-0.5" onClick={(e) => e.stopPropagation()}>
                    {p.models.map((m) => {
                      const mOn = active && settings.modelId === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => patch({ providerId: p.id, modelId: m.id })}
                          className={cn(
                            "state inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                            mOn ? "bg-primary text-on-primary font-semibold" : "bg-surface-high text-on-surface-variant hover:text-on-surface"
                          )}
                        >
                          {m.vision && <Icon name="image" size={11} />}
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
  const notify = useStore((st) => st.notify);
  const [perf, setPerf] = useState<PerfStats | null>(null);
  const [trimming, setTrimming] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => nativePerf.stats().then((st) => alive && setPerf(st)).catch(() => {});
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const trimNow = async () => {
    setTrimming(true);
    try {
      const r = await nativePerf.trim();
      const st = await nativePerf.stats();
      setPerf(st);
      notify(r.savedMb > 0 ? `Trimmed ${r.savedMb} MB · now ${r.afterMb} MB` : `Working set ${r.afterMb} MB`);
    } finally {
      setTrimming(false);
    }
  };

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
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-sm font-medium">Low-memory governor (&lt;{perf?.targetMb ?? 19} MB)</div>
          <Toggle on={perf?.autoTrim ?? true} onChange={(v) => { void nativePerf.setAuto(v).then(setPerf); }} />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Working set · {perf ? `${perf.workingSetMb} MB` : "16.2 MB"}</div>
            <div className="text-xs text-on-surface-variant">Shadow DOM engine · {perf ? `${perf.processCount} proc` : "single-process"}</div>
          </div>
          <button onClick={trimNow} disabled={trimming} className="state h-9 rounded-lg border border-outline-variant px-3 text-[13px] font-medium text-on-surface">
            {trimming ? "Trimming…" : "Trim RAM"}
          </button>
        </div>
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

const OPENCODE_FEATURED_MODELS = [
  { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen", provider: "FreeClaude & Gemini 4" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash VL", provider: "FreeClaude & Gemini 4" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "Unikey Anonymous" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "Unikey Anonymous" },
  { id: "gpt-6-astra", label: "GPT-6 Astra", provider: "Unikey Anonymous" },
  { id: "qwen4-max", label: "Qwen 4 Max", provider: "Qwen" },
  { id: "Qwen3.6-35B-A3B", label: "Qwen 3.6 35B A3B MoE", provider: "Colibri Qwen" },
  { id: "DeepSeek-V4.1-Flash-1017", label: "DeepSeek V4.1 Flash", provider: "OVHcloud AI" },
  { id: "glm-5.3", label: "GLM 5.3", provider: "Together Frontier" },
  { id: "nemotron-3.5-super-vl", label: "Nemotron 3.5 Super VL 120B", provider: "Kilo / NIM" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "DeepAI" },
  { id: "k2-horizon", label: "K2-Horizon 375B", provider: "K2Horizon" },
];

function ServerTab() {
  const notify = useStore((s) => s.notify);
  const workspace = useStore((s) => s.ui.workspace);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [portInput, setPortInput] = useState("11435");
  const [selectedModel, setSelectedModel] = useState("gemini-4-hydrogen");
  const [busy, setBusy] = useState(false);
  const [installedPaths, setInstalledPaths] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      nativeServer.status().then((st) => {
        if (!alive) return;
        setStatus(st);
        setPortInput(String(st.port));
      });
    load();
    const id = setInterval(load, 3500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`Copied ${label}`);
  };

  const toggleServer = async (on: boolean) => {
    setBusy(true);
    try {
      const p = Number(portInput) || 11435;
      const st = on ? await nativeServer.start(p) : await nativeServer.stop();
      setStatus(st);
      notify(st.running ? `Server active on ${st.openaiBaseUrl}` : "Local server stopped");
    } finally {
      setBusy(false);
    }
  };

  const applyPort = async () => {
    const p = Number(portInput);
    if (!p || p < 1024 || p > 65535) {
      notify("Enter a valid port (1024–65535)");
      return;
    }
    setBusy(true);
    try {
      const st = await nativeServer.start(p);
      setStatus(st);
      notify(`Bound to ${st.openaiBaseUrl}`);
    } finally {
      setBusy(false);
    }
  };

  const installOpencode = async () => {
    setBusy(true);
    try {
      const res = await nativeServer.installOpencode(workspace?.root);
      setInstalledPaths(res.paths);
      notify(`Configured OpenCode (${res.defaultModel})`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to write opencode.json");
    } finally {
      setBusy(false);
    }
  };

  const copyOpencodeJson = async () => {
    const cfg = await nativeServer.opencodeConfig();
    copy(JSON.stringify(cfg, null, 2), "opencode.json");
  };

  const downloadOpencodeJson = async () => {
    const cfg = await nativeServer.opencodeConfig();
    download("opencode.json", JSON.stringify(cfg, null, 2), "application/json");
    notify("Downloaded opencode.json");
  };

  const baseUrl = status?.openaiBaseUrl ?? "http://127.0.0.1:11435/v1";
  const chatUrl = status?.chatCompletionsUrl ?? "http://127.0.0.1:11435/v1/chat/completions";
  const messagesUrl = status?.messagesUrl ?? "http://127.0.0.1:11435/v1/messages";
  const modelsUrl = status?.modelsUrl ?? "http://127.0.0.1:11435/v1/models";
  const apiKey = status?.apiKey ?? "zeus-local";
  const cliCmd = `opencode -m zeusdesigns/${selectedModel}`;
  const curlCmd = `curl ${chatUrl} -H "Content-Type: application/json" -H "Authorization: Bearer ${apiKey}" -d '{"model":"${selectedModel}","messages":[{"role":"user","content":"Hello"}]}'`;

  const endpoints = [
    { label: "OpenAI Base URL", value: baseUrl },
    { label: "Chat Completions", value: chatUrl },
    { label: "Anthropic Messages", value: messagesUrl },
    { label: "Models Catalog", value: modelsUrl },
    { label: "API Key", value: apiKey },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-outline-variant bg-surface-container p-4">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-[14px]", status?.running !== false ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant")}>
            <Icon name="dns" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2 font-semibold text-on-surface">
              <span>OpenAI &amp; OpenCode Local Gateway</span>
              <span className="rounded-full bg-surface-high px-2.5 py-0.5 font-mono text-xs text-on-surface-variant">
                {status?.running !== false ? `127.0.0.1:${status?.port ?? 11435}` : "Stopped"}
              </span>
            </div>
            <div className="text-xs text-on-surface-variant">
              {status?.modelCount ?? 148} models · {PROVIDERS.length} keyless providers · {status?.requestCount ?? 0} requests · last {status?.lastModel ?? "gemini-4-hydrogen"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={portInput}
            onChange={(e) => setPortInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="h-9 w-24 rounded-xl border border-outline-variant bg-surface-high px-3 font-mono text-xs text-on-surface outline-none focus:border-primary"
            placeholder="11435"
          />
          <button
            onClick={applyPort}
            disabled={busy}
            className="state h-9 rounded-xl border border-outline-variant px-3 text-xs font-semibold text-on-surface"
          >
            Bind port
          </button>
          <Toggle on={status?.running !== false} onChange={toggleServer} />
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {endpoints.map((ep) => (
          <div key={ep.label} className="flex items-center justify-between gap-2 rounded-[20px] border border-outline-variant/60 bg-surface-container px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-on-surface-variant">{ep.label}</div>
              <div className="truncate font-mono text-xs text-on-surface">{ep.value}</div>
            </div>
            <IconBtn label={`Copy ${ep.label}`} size={32} onClick={() => copy(ep.value, ep.label)}>
              <Icon name="content_copy" size={15} />
            </IconBtn>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-[24px] border border-outline-variant bg-surface-container p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-display text-base font-semibold text-on-surface">OpenCode Integration</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={installOpencode}
              disabled={busy}
              className="state morph flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary"
            >
              <Icon name="download" size={15} />
              Install to OpenCode
            </button>
            <button
              onClick={copyOpencodeJson}
              className="state flex h-9 items-center gap-1.5 rounded-full bg-secondary-container px-3.5 text-xs font-semibold text-on-secondary-container"
            >
              <Icon name="content_copy" size={14} />
              Copy opencode.json
            </button>
            <button
              onClick={downloadOpencodeJson}
              className="state flex h-9 items-center gap-1.5 rounded-full bg-surface-high px-3.5 text-xs font-semibold text-on-surface"
            >
              <Icon name="description" size={14} />
              Save file
            </button>
          </div>
        </div>

        {installedPaths.length > 0 && (
          <div className="rounded-xl bg-surface-high px-3 py-2 font-mono text-xs text-on-surface">
            Written: {installedPaths.join(" · ")}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {OPENCODE_FEATURED_MODELS.map((m) => {
            const on = selectedModel === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                className={cn(
                  "state rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  on ? "bg-primary text-on-primary font-semibold" : "bg-surface-high text-on-surface-variant hover:text-on-surface"
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-high px-3 py-2">
            <code className="truncate font-mono text-xs text-on-surface">{cliCmd}</code>
            <IconBtn label="Copy OpenCode CLI command" size={28} onClick={() => copy(cliCmd, "OpenCode command")}>
              <Icon name="content_copy" size={14} />
            </IconBtn>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-high px-3 py-2">
            <code className="truncate font-mono text-xs text-on-surface">{curlCmd}</code>
            <IconBtn label="Copy curl command" size={28} onClick={() => copy(curlCmd, "curl command")}>
              <Icon name="content_copy" size={14} />
            </IconBtn>
          </div>
        </div>
      </div>
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
          {cur.id === "server" && <ServerTab />}
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
