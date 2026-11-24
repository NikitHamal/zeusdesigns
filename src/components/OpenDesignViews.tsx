import { useState } from "react";
import { useStore } from "../store";
import {
  detectDeliverableKind,
  getOpenDesignBrand,
  OPEN_DESIGN_BRANDS,
  OPEN_DESIGN_MODES,
  OPEN_DESIGN_SKILLS_CATALOG,
  STARTER_HYPERFRAMES_VIDEO_HTML,
  STARTER_OPEN_SLIDE_DECK_HTML,
  type OpenDesignBrandSystem,
  type OpenDesignSkillTemplate,
  type VideoAspectRatio,
} from "../lib/openDesign";
import { exportHyperFramesToVideo } from "../lib/videoExporter";
import { writeWorkspaceFile, refreshTree } from "../lib/bridge";
import { sendMessage } from "../lib/engine";
import { Icon } from "./Icon";
import { Dropdown, MenuItem, MenuLabel } from "./ui";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ */
/* Deliverable Mode + Brand + Aspect Switcher Bar                     */
/* ------------------------------------------------------------------ */
export function OpenDesignCreationBar({ compact = false }: { compact?: boolean }) {
  const mode = useStore((s) => s.settings.openDesignMode ?? "hyperframes");
  const brandId = useStore((s) => s.settings.openDesignBrandId ?? "m3-expressive");
  const aspect = useStore((s) => s.settings.openDesignAspect ?? "16:9");
  const patchSettings = useStore((s) => s.patchSettings);

  const curBrand = getOpenDesignBrand(brandId);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex flex-wrap items-center rounded-xl border border-outline-variant/60 bg-surface-low p-0.5">
        {OPEN_DESIGN_MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => patchSettings({ openDesignMode: m.id })}
              className={cn(
                "state inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium",
                active
                  ? "bg-primary text-on-primary font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <Icon name={m.icon} size={14} />
              <span>{compact ? m.shortLabel : m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Brand / DESIGN.md Picker */}
      <Dropdown
        width={290}
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "state inline-flex h-8 items-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-low px-3 text-xs font-medium text-on-surface",
              open && "bg-surface-high"
            )}
          >
            <span
              style={{ background: curBrand.accent }}
              className="size-2.5 rounded-full border border-outline-variant/60"
            />
            <span>Brand: {curBrand.name}</span>
            <Icon name="expand_more" size={14} className="text-on-surface-variant" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuLabel>OpenDesign Brand &amp; DESIGN.md Systems</MenuLabel>
            {OPEN_DESIGN_BRANDS.map((b) => (
              <MenuItem
                key={b.id}
                icon={
                  <span
                    style={{ background: b.accent }}
                    className="size-3 rounded-full border border-outline-variant"
                  />
                }
                label={`${b.name} (${b.domain})`}
                active={b.id === curBrand.id}
                onClick={() => {
                  close();
                  patchSettings({ openDesignBrandId: b.id });
                }}
              />
            ))}
          </>
        )}
      </Dropdown>

      {/* Video / Deck Aspect Ratio */}
      {(mode === "hyperframes" || mode === "motion-design") && (
        <div className="flex items-center rounded-xl border border-outline-variant/60 bg-surface-low p-0.5">
          {(["16:9", "9:16", "1:1"] as VideoAspectRatio[]).map((ar) => (
            <button
              key={ar}
              type="button"
              onClick={() => patchSettings({ openDesignAspect: ar })}
              className={cn(
                "state h-7 rounded-lg px-2 font-mono text-[11px] font-semibold",
                aspect === ar ? "bg-surface-high text-primary" : "text-on-surface-variant"
              )}
            >
              {ar}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View 1: Design Systems & DESIGN.md Studio                          */
/* ------------------------------------------------------------------ */
export function OpenDesignBrandSystemsView() {
  const activeBrandId = useStore((s) => s.settings.openDesignBrandId ?? "m3-expressive");
  const workspace = useStore((s) => s.ui.workspace);
  const patchSettings = useStore((s) => s.patchSettings);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);

  const [selected, setSelected] = useState<OpenDesignBrandSystem>(() =>
    getOpenDesignBrand(activeBrandId)
  );
  const [filterCat, setFilterCat] = useState<string>("all");

  const filtered = OPEN_DESIGN_BRANDS.filter(
    (b) => filterCat === "all" || b.category === filterCat
  );

  const handleUseBrand = (b: OpenDesignBrandSystem) => {
    patchSettings({ openDesignBrandId: b.id });
    notify(`Active brand set to ${b.name}`);
  };

  const handleSaveDesignMd = async (b: OpenDesignBrandSystem) => {
    if (workspace) {
      try {
        await writeWorkspaceFile(workspace, "DESIGN.md", b.designMd);
        const refreshed = await refreshTree(workspace);
        if (refreshed) patchUI({ workspace: { ...workspace, tree: refreshed } });
        notify(`Saved DESIGN.md (${b.name}) to ${workspace.name}`);
        return;
      } catch {
        /* fallback to clipboard */
      }
    }
    await navigator.clipboard.writeText(b.designMd);
    notify(`Copied ${b.name} DESIGN.md to clipboard`);
  };

  const handleGenerateSpecimen = (b: OpenDesignBrandSystem) => {
    patchSettings({
      openDesignBrandId: b.id,
      openDesignMode: "brand-kit",
    });
    patchUI({ odTab: "studio", leftTab: "chat" });
    sendMessage({
      text: `Create a complete interactive Brand Identity & DESIGN.md Specimen sheet for ${b.name} (${b.domain}) showing its surface tokens, typography scale, interactive UI components, and telemetry cards.`,
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant/50 px-6">
        <div className="flex items-center gap-3">
          <Icon name="palette" size={20} className="text-primary" />
          <span className="font-display text-base font-bold text-on-surface">
            Brand &amp; DESIGN.md Systems ({OPEN_DESIGN_BRANDS.length})
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-outline-variant/60 bg-surface-low p-0.5">
          {["all", "design-system", "software", "finance", "editorial", "hardware"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={cn(
                "state h-7 rounded-lg px-2.5 text-xs font-medium capitalize",
                filterCat === cat ? "bg-surface-high font-semibold text-on-surface" : "text-on-surface-variant"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Brand Cards Grid */}
        <div className="grid w-1/2 auto-rows-max grid-cols-1 gap-3 overflow-y-auto border-r border-outline-variant/50 p-5 lg:grid-cols-2">
          {filtered.map((b) => {
            const isSel = b.id === selected.id;
            const isCurrent = b.id === activeBrandId;
            return (
              <button
                key={b.id}
                onClick={() => setSelected(b)}
                className={cn(
                  "state flex flex-col justify-between rounded-2xl border p-4 text-left",
                  isSel
                    ? "border-primary bg-surface-high"
                    : "border-outline-variant/60 bg-surface-low"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-on-surface">{b.name}</span>
                    {isCurrent && (
                      <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-on-primary">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-on-surface-variant">
                    {b.domain} · {b.category}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-on-surface-variant">{b.posture}</p>
                </div>

                <div className="mt-4 flex items-center gap-1.5">
                  {[b.bg, b.surface, b.ink, b.muted, b.accent].map((hex, i) => (
                    <span
                      key={i}
                      style={{ background: hex }}
                      title={hex}
                      className="h-6 flex-1 rounded-md border border-outline-variant/60"
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Selected Brand Specimen & DESIGN.md Inspector */}
        <div className="flex w-1/2 flex-col overflow-y-auto p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/50 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-on-surface">{selected.name}</h2>
              <div className="mt-0.5 font-mono text-xs text-on-surface-variant">
                {selected.domain} · Radius {selected.radius} · Display {selected.displayFont}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleUseBrand(selected)}
                className="state inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-on-primary"
              >
                <Icon name="check" size={15} />
                Use Brand in Studio
              </button>
              <button
                onClick={() => handleSaveDesignMd(selected)}
                className="state inline-flex h-8 items-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface-low px-3 text-xs font-semibold text-on-surface"
              >
                <Icon name="save" size={15} />
                {workspace ? "Save DESIGN.md" : "Copy DESIGN.md"}
              </button>
              <button
                onClick={() => handleGenerateSpecimen(selected)}
                className="state inline-flex h-8 items-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface-low px-3 text-xs font-semibold text-on-surface"
              >
                <Icon name="auto_awesome" size={15} />
                Generate Specimen
              </button>
            </div>
          </div>

          {/* Live Brand Surface Specimen Card */}
          <div
            style={{
              background: selected.bg,
              color: selected.ink,
              borderColor: selected.border,
              borderRadius: selected.radius,
            }}
            className="mt-5 border p-6"
          >
            <div
              style={{ color: selected.accent }}
              className="font-mono text-xs font-semibold uppercase tracking-widest"
            >
              01 · BRAND SPECIMEN PREVIEW
            </div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight">
              {selected.name} — Zero-Shadow Tonal Architecture
            </div>
            <p style={{ color: selected.muted }} className="mt-2 text-xs leading-relaxed">
              {selected.posture}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { k: "BACKGROUND", v: selected.bg },
                { k: "SURFACE", v: selected.surface },
                { k: "ACCENT", v: selected.accent },
              ].map((tok) => (
                <div
                  key={tok.k}
                  style={{
                    background: selected.surface,
                    borderColor: selected.border,
                    borderRadius: selected.radius,
                  }}
                  className="border p-3"
                >
                  <div style={{ color: selected.muted }} className="font-mono text-[10px]">
                    {tok.k}
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-xs font-bold">
                    <span
                      style={{ background: tok.v, borderColor: selected.border }}
                      className="size-3.5 rounded border"
                    />
                    {tok.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DESIGN.md Source */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between font-mono text-xs text-on-surface-variant">
              <span>DESIGN.md Specification</span>
              <span>Agent-Ready Prompt Contract</span>
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-outline-variant/60 bg-surface-low p-4 font-mono text-xs leading-relaxed text-on-surface">
              {selected.designMd}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View 2: Skills, OpenMotion & HyperFrames Video Templates           */
/* ------------------------------------------------------------------ */
export function OpenDesignSkillsView() {
  const patchSettings = useStore((s) => s.patchSettings);
  const patchUI = useStore((s) => s.patchUI);
  const addArtboard = useStore((s) => s.addArtboard);
  const setSel = useStore((s) => s.setSel);
  const notify = useStore((s) => s.notify);
  const [cat, setCat] = useState<string>("all");

  const list = OPEN_DESIGN_SKILLS_CATALOG.filter((s) => cat === "all" || s.category === cat);

  const openStarter = (sk: OpenDesignSkillTemplate) => {
    const html =
      sk.starterHtml ??
      (sk.mode === "deck" ? STARTER_OPEN_SLIDE_DECK_HTML : STARTER_HYPERFRAMES_VIDEO_HTML);
    const created = addArtboard({
      name: sk.name,
      device: "web",
      html,
    });
    setSel([created.id]);
    patchSettings({
      openDesignMode: sk.mode,
      openDesignBrandId: sk.brandId,
      openDesignAspect: sk.aspect,
    });
    patchUI({ odTab: "studio", showCanvas: true, leftTab: "chat" });
    notify(`Loaded ${sk.name} in OpenDesign Studio`);
  };

  const launchWithAgent = (sk: OpenDesignSkillTemplate) => {
    patchSettings({
      openDesignMode: sk.mode,
      openDesignBrandId: sk.brandId,
      openDesignAspect: sk.aspect,
    });
    patchUI({ odTab: "studio", leftTab: "chat" });
    sendMessage({ text: sk.prompt });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant/50 px-6">
        <div className="flex items-center gap-3">
          <Icon name="movie" size={20} className="text-primary" />
          <span className="font-display text-base font-bold text-on-surface">
            OpenDesign Skills, HyperFrames Video &amp; Open-Slide Templates
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-outline-variant/60 bg-surface-low p-0.5">
          {["all", "video", "slides", "motion", "prototype", "brand"].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "state h-7 rounded-lg px-2.5 text-xs font-medium capitalize",
                cat === c ? "bg-surface-high font-semibold text-on-surface" : "text-on-surface-variant"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-4 overflow-y-auto p-6 md:grid-cols-2 xl:grid-cols-3">
        {list.map((sk) => {
          const brand = getOpenDesignBrand(sk.brandId);
          return (
            <div
              key={sk.id}
              className="flex flex-col justify-between rounded-2xl border border-outline-variant/60 bg-surface-low p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-high px-2.5 py-1 font-mono text-[11px] font-semibold uppercase text-primary">
                    <Icon
                      name={sk.mode === "hyperframes" ? "movie" : sk.mode === "deck" ? "slideshow" : "web"}
                      size={13}
                    />
                    {sk.category} · {sk.aspect}
                  </span>
                  <span className="font-mono text-[11px] text-on-surface-variant">{brand.name}</span>
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-on-surface">{sk.name}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant">{sk.summary}</p>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-outline-variant/40 pt-3.5">
                <button
                  onClick={() => launchWithAgent(sk)}
                  className="state inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-on-primary"
                >
                  <Icon name="auto_awesome" size={14} />
                  Generate with Agent
                </button>
                {(sk.mode === "hyperframes" || sk.mode === "deck") && (
                  <button
                    onClick={() => openStarter(sk)}
                    className="state inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface px-3 text-xs font-semibold text-on-surface"
                  >
                    <Icon name="play_arrow" size={15} />
                    Open Starter
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View 3: All Deliverables & Media Gallery                           */
/* ------------------------------------------------------------------ */
export function OpenDesignDeliverablesView() {
  const boards = useStore((s) => s.artboards);
  const setSel = useStore((s) => s.setSel);
  const patchUI = useStore((s) => s.patchUI);
  const addArtboard = useStore((s) => s.addArtboard);
  const notify = useStore((s) => s.notify);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openBoard = (id: string) => {
    setSel([id]);
    patchUI({ odTab: "studio", showCanvas: true, leftTab: "chat" });
  };

  const exportBoardVideo = async (b: { id: string; name: string; html: string }) => {
    setBusyId(b.id);
    try {
      const res = await exportHyperFramesToVideo({
        html: b.html,
        title: b.name,
      });
      notify(`Exported ${res.filename}`);
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const seedDemoDeliverables = () => {
    const v = addArtboard({
      name: "HyperFrames Launch Reel",
      device: "web",
      html: STARTER_HYPERFRAMES_VIDEO_HTML,
    });
    addArtboard({
      name: "Open-Slide 1920 Architecture Deck",
      device: "web",
      html: STARTER_OPEN_SLIDE_DECK_HTML,
    });
    setSel([v.id]);
    notify("Added HyperFrames Video & Open-Slide 1920 Deck starters");
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant/50 px-6">
        <div className="flex items-center gap-3">
          <Icon name="grid_view" size={20} className="text-primary" />
          <span className="font-display text-base font-bold text-on-surface">
            All Studio Deliverables ({boards.length})
          </span>
        </div>
        <button
          onClick={seedDemoDeliverables}
          className="state inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-on-primary"
        >
          <Icon name="add" size={16} />
          Load HyperFrames &amp; Deck Starters
        </button>
      </div>

      {boards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Icon name="movie" size={32} className="text-primary" />
          <div className="font-display text-base font-bold text-on-surface">
            No deliverables created yet
          </div>
          <button
            onClick={seedDemoDeliverables}
            className="state inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-on-primary"
          >
            <Icon name="movie" size={16} />
            Load HyperFrames Video &amp; Open-Slide 1920 Starters
          </button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-4 overflow-y-auto p-6 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((b) => {
            const kind = detectDeliverableKind(b.html);
            return (
              <div
                key={b.id}
                className="flex flex-col justify-between rounded-2xl border border-outline-variant/60 bg-surface-low p-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-high px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase text-primary">
                      <Icon
                        name={kind === "hyperframes" ? "movie" : kind === "deck" ? "slideshow" : "web"}
                        size={13}
                      />
                      {kind}
                    </span>
                    <span className="font-mono text-xs text-on-surface-variant">v{b.version}</span>
                  </div>
                  <h3 className="mt-2.5 font-display text-base font-bold text-on-surface">{b.name}</h3>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => openBoard(b.id)}
                    className="state inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-on-primary"
                  >
                    <Icon name="open_in_new" size={14} />
                    Open in Studio
                  </button>
                  {kind === "hyperframes" && (
                    <button
                      onClick={() => exportBoardVideo(b)}
                      disabled={busyId === b.id}
                      className="state inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface px-3 text-xs font-semibold text-on-surface"
                    >
                      <Icon name="movie" size={14} />
                      {busyId === b.id ? "Encoding..." : "Export Video"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
