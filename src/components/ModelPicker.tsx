import { useMemo, useState } from "react";
import { useStore } from "../store";
import { EFFORTS, PROVIDERS, findProvider, type ModelInfo } from "../lib/providers";
import { clampEffort, fmtCtx, reasoningTiers } from "../lib/modelMeta";
import { verifyModelAuthenticity, type ModelFingerprintReport } from "../lib/lmFingerprint";
import { cn } from "../utils/cn";
import { Dropdown } from "./ui";
import { Icon } from "./Icon";

const EFFORT_SHORT: Record<string, string> = { low: "Low", medium: "Med", high: "High", max: "Max" };
const LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, max: 4 };

function Bars({ level, total }: { level: number; total: number }) {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden>
      {Array.from({ length: total }, (_, i) => i + 1).map((b) => (
        <i key={b} style={{ height: `${3 + b * 2.2}px` }} className={cn("w-[2.5px] rounded-full transition-all", b <= level ? "bg-primary" : "bg-on-surface-variant/30")} />
      ))}
    </span>
  );
}

function ModelRow({ m, active, onPick }: { m: ModelInfo; active: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick} className={cn("state flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left", active ? "bg-primary-container text-on-primary-container" : "text-on-surface")}>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.label}</span>
      {m.vision && <Icon name="image" size={14} className="shrink-0 text-on-surface-variant" />}
      {m.reasoning && <Icon name="psychology" size={14} className="shrink-0 text-on-surface-variant" />}
      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-on-surface-variant">{fmtCtx(m.contextWindow, m.verified)}</span>
    </button>
  );
}

export function ModelPicker() {
  const settings = useStore((s) => s.settings);
  const patch = useStore((s) => s.patchSettings);
  const patchUI = useStore((s) => s.patchUI);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [fpReport, setFpReport] = useState<ModelFingerprintReport | null>(null);
  const [fpErr, setFpErr] = useState<string | null>(null);
  const custom = settings.customProviders.find((c) => `custom:${c.id}` === settings.providerId);
  const prov = findProvider(settings.providerId);
  const model = prov.models.find((m) => m.id === settings.modelId);
  const label = custom ? custom.model : model?.label ?? settings.modelId;
  const tiers = custom ? EFFORTS.slice(0, 3).map((e) => e.id) : reasoningTiers(model);
  const effort = clampEffort(settings.effort, tiers);
  const active = sel ?? (custom ? "custom" : prov.id);

  const pick = (providerId: string, m: ModelInfo, close: () => void) => {
    patch({ providerId, modelId: m.id, effort: clampEffort(settings.effort, reasoningTiers(m)) });
    close();
  };

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return PROVIDERS.flatMap((p) => p.models.filter((m) => `${m.label} ${m.id} ${p.name}`.toLowerCase().includes(t)).map((m) => ({ p, m }))).slice(0, 60);
  }, [q]);

  return (
    <div className="flex min-w-0 items-center gap-[2px] rounded-full bg-surface-high/65 p-0.5">
      <Dropdown up align="right" width={540} className="min-w-0" trigger={({ toggle, open }) => (
        <button onClick={toggle} title="Model" className={cn("state morph flex h-8 max-w-full min-w-0 items-center gap-1 bg-surface-container/80 pl-3 pr-2 text-[12.5px] font-medium text-on-surface", tiers.length ? "rounded-l-full rounded-r-[8px]" : "rounded-full", open && "bg-surface-highest")}>
          <span className="truncate">{label}</span>
          <Icon name="expand_more" size={14} className="shrink-0 text-on-surface-variant" />
        </button>
      )}>
        {(close) => (
          <div className="flex h-[400px] max-h-full flex-col">
            <div className="flex items-center gap-2 border-b border-outline-variant/60 px-3 py-2">
              <Icon name="search" size={16} className="text-on-surface-variant" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models" className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant" />
              {q && <button onClick={() => setQ("")} className="state grid size-6 place-items-center rounded-full text-on-surface-variant"><Icon name="close" size={14} /></button>}
            </div>
            {q ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {results.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-on-surface-variant">No models</div>}
                {results.map(({ p, m }) => (
                  <button key={p.id + m.id} onClick={() => pick(p.id, m, close)} className={cn("state flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left", settings.providerId === p.id && settings.modelId === m.id ? "bg-primary-container text-on-primary-container" : "text-on-surface")}>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.label}</span>
                    <span className="max-w-[40%] truncate text-[11px] text-on-surface-variant">{p.name}</span>
                    <span className="w-10 shrink-0 text-right font-mono text-[11px] text-on-surface-variant">{fmtCtx(m.contextWindow, m.verified)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1">
                <div className="w-[178px] shrink-0 overflow-y-auto border-r border-outline-variant/60 p-1.5">
                  {PROVIDERS.map((p) => (
                    <button key={p.id} onClick={() => setSel(p.id)} className={cn("state flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left", active === p.id ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>
                      <span className="grid size-5 shrink-0 place-items-center rounded-md" style={{ background: p.color }}><Icon name={p.icon} size={13} className="text-white" /></span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{p.name}</span>
                      <span className="font-mono text-[10.5px]">{p.models.length}</span>
                    </button>
                  ))}
                  {settings.customProviders.length > 0 && (
                    <button onClick={() => setSel("custom")} className={cn("state flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left", active === "custom" ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>
                      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-surface-high"><Icon name="key" size={13} /></span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">Your keys</span>
                      <span className="font-mono text-[10.5px]">{settings.customProviders.length}</span>
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
                  {active === "custom"
                    ? settings.customProviders.flatMap((c) => {
                        const list = c.models && c.models.length > 0 ? c.models : [c.model];
                        return list.map((mid) => {
                          const on = settings.providerId === `custom:${c.id}` && settings.modelId === mid;
                          return (
                            <button
                              key={`${c.id}:${mid}`}
                              onClick={() => { patch({ providerId: `custom:${c.id}`, modelId: mid }); close(); }}
                              className={cn("state flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left", on ? "bg-primary-container text-on-primary-container" : "text-on-surface")}
                            >
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{mid}</span>
                              <span className="truncate text-[11px] text-on-surface-variant">{c.name}</span>
                            </button>
                          );
                        });
                      })
                    : findProvider(active).models.map((m) => (
                      <ModelRow key={m.id} m={m} active={settings.providerId === active && settings.modelId === m.id} onPick={() => pick(active, m, close)} />
                    ))}
                </div>
              </div>
            )}
            {(fpReport || fpErr) && (
              <div className="shrink-0 border-t border-outline-variant/60 bg-surface-low px-3 py-2 text-xs">
                {fpErr ? (
                  <div className="flex items-center justify-between text-error">
                    <span className="truncate">{fpErr}</span>
                    <button onClick={() => setFpErr(null)} className="state ml-2 rounded p-0.5 text-on-surface-variant"><Icon name="close" size={13} /></button>
                  </div>
                ) : fpReport ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", fpReport.isGenuine && !fpReport.routedUnderTheHood ? "bg-primary-container text-on-primary-container" : fpReport.isGenuine ? "bg-tertiary-container text-on-tertiary-container" : "bg-error-container text-on-error-container")}>
                        <Icon name={fpReport.isGenuine ? "verified" : "warning"} size={12} />
                        {fpReport.verdictLabel}
                      </span>
                      <span className="font-mono text-[10.5px] text-on-surface-variant">{fpReport.latencyMs}ms · {fpReport.tokensPerSec} tok/s · #{fpReport.fingerprintHash.slice(0, 8)}</span>
                      <button onClick={() => setFpReport(null)} className="state rounded p-0.5 text-on-surface-variant"><Icon name="close" size={13} /></button>
                    </div>
                    <div className="truncate font-mono text-[10.5px] text-on-surface-variant">
                      Reported: {fpReport.upstreamReportedModel} · {fpReport.upstreamEndpoint}
                    </div>
                    <div className="line-clamp-2 text-[11px] text-on-surface">{fpReport.explanation}</div>
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex h-11 shrink-0 items-center gap-2 border-t border-outline-variant/60 px-2">
              <button onClick={() => { close(); patchUI({ settingsOpen: true, settingsTab: "providers" }); }} className="state flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-on-surface">
                <Icon name="add" size={16} />Endpoint
              </button>
              <button
                disabled={verifying}
                onClick={async () => {
                  setVerifying(true);
                  setFpErr(null);
                  try {
                    const rep = await verifyModelAuthenticity(settings.providerId, settings.modelId);
                    setFpReport(rep);
                  } catch (e) {
                    setFpErr(e instanceof Error ? e.message : "Verification failed");
                  } finally {
                    setVerifying(false);
                  }
                }}
                className="state flex h-8 items-center gap-1.5 rounded-lg bg-surface-high px-2.5 text-[12px] font-semibold text-on-surface disabled:opacity-50"
              >
                <Icon name="verified" size={14} className="text-primary" />
                {verifying ? "Probing…" : "LMFingerprint"}
              </button>
              <span className="flex-1" />
            </div>
          </div>
        )}
      </Dropdown>

      {tiers.length > 0 && (
        <Dropdown up align="right" width={232} trigger={({ toggle, open }) => (
          <button onClick={toggle} title="Reasoning" className={cn("state morph flex h-8 shrink-0 items-center gap-1.5 rounded-l-[8px] rounded-r-full bg-surface-container/80 pl-2 pr-2.5 text-[12px] font-semibold text-on-surface", open && "bg-surface-highest")}>
            <Bars level={tiers.indexOf(effort) + 1} total={tiers.length} />
            <span className="hidden @[360px]:inline">{EFFORT_SHORT[effort]}</span>
          </button>
        )}>
          {(close) => (
            <div className="p-2">
              <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Reasoning</div>
              <div className="flex flex-col gap-0.5">
                {tiers.map((id) => {
                  const e = EFFORTS.find((x) => x.id === id)!;
                  return (
                    <button key={id} onClick={() => { patch({ effort: id }); close(); }} className={cn("state flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium", effort === id ? "bg-primary-container text-on-primary-container" : "text-on-surface")}>
                      <Bars level={LEVEL[id] > tiers.length ? tiers.length : tiers.indexOf(id) + 1} total={tiers.length} />
                      <span className="flex-1">{e.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Dropdown>
      )}
    </div>
  );
}
