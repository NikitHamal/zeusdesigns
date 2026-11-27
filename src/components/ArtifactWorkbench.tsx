import { useEffect, useMemo, useRef, useState } from "react";
import { activeConv, useStore } from "../store";
import { writeWorkspaceFile, refreshTree } from "../lib/bridge";
import {
  buildHyperFramesCompositionBundle,
  computeHyperFramesAnimationMap,
  detectDeliverableKind,
  HYPERFRAMES_PALETTES,
  parseHyperFramesDocument,
  parseOpenSlideDeck,
  STARTER_HYPERFRAMES_VIDEO_HTML,
  STARTER_OPEN_SLIDE_DECK_HTML,
  type HyperFramesPaletteSpec,
  type VideoAspectRatio,
} from "../lib/openDesign";
import { exportHyperFramesToVideo, type VideoExportProgress } from "../lib/videoExporter";
import { DomInspectorPanel, type SelectedDomTarget } from "./DomInspectorPanel";
import { Icon } from "./Icon";
import { IconBtn } from "./ui";
import { cn } from "../utils/cn";

type ViewMode = "preview" | "code" | "split";
type ViewportSize = "responsive" | "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<ViewportSize, string> = {
  responsive: "100%",
  desktop: "1280px",
  tablet: "834px",
  mobile: "390px",
};

export function ArtifactWorkbench() {
  const boards = useStore((s) => s.artboards);
  const selectedIds = useStore((s) => s.sel);
  const conv = useStore(activeConv);
  const workspace = useStore((s) => s.ui.workspace);
  const patchUI = useStore((s) => s.patchUI);
  const addArtboard = useStore((s) => s.addArtboard);
  const updateArtboard = useStore((s) => s.updateArtboard);
  const removeArtboards = useStore((s) => s.removeArtboards);
  const select = useStore((s) => s.setSel);
  const notify = useStore((s) => s.notify);

  const [mode, setMode] = useState<ViewMode>("preview");
  const [viewport, setViewport] = useState<ViewportSize>("responsive");
  const [videoAspect, setVideoAspect] = useState<VideoAspectRatio>("16:9");
  const [draftHtml, setDraftHtml] = useState<string | null>(null);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [inspectOn, setInspectOn] = useState(false);
  const [selectedEl, setSelectedEl] = useState<SelectedDomTarget | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [showAnimMap, setShowAnimMap] = useState(false);
  const [exportProgress, setExportProgress] = useState<VideoExportProgress | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const convBoardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of conv.messages) {
      for (const id of m.artboardIds ?? []) ids.add(id);
    }
    return ids;
  }, [conv.messages]);

  const list = useMemo(() => {
    const inConv = boards.filter((b) => convBoardIds.has(b.id));
    return inConv.length > 0 ? inConv : boards;
  }, [boards, convBoardIds]);

  const active = useMemo(() => {
    const sel = list.find((b) => selectedIds.includes(b.id));
    return sel ?? list[list.length - 1] ?? null;
  }, [list, selectedIds]);

  const codeValue = draftHtml ?? active?.html ?? "";
  const deliverableKind = useMemo(() => detectDeliverableKind(codeValue), [codeValue]);
  const hyperFrames = useMemo(() => parseHyperFramesDocument(codeValue), [codeValue]);
  const animMap = useMemo(() => computeHyperFramesAnimationMap(codeValue), [codeValue]);
  const slideDeck = useMemo(() => parseOpenSlideDeck(codeValue), [codeValue]);

  const handleScaffoldHyperFramesBundle = async () => {
    if (!active) return;
    const bundle = buildHyperFramesCompositionBundle({
      html: codeValue,
      title: active.name,
      aspect: videoAspect,
    });
    if (workspace) {
      try {
        for (const [relPath, content] of Object.entries(bundle.files)) {
          await writeWorkspaceFile(workspace, relPath, content);
        }
        const refreshed = await refreshTree(workspace);
        if (refreshed) patchUI({ workspace: { ...workspace, tree: refreshed } });
        notify(`Scaffolded ${bundle.cacheDir} (hyperframes.json + meta.json + index.html)`);
        return;
      } catch {
        /* fallback to JSON download */
      }
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle.slug}.hyperframes-bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Downloaded ${bundle.slug}.hyperframes-bundle.json`);
  };

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "zeus:hyperframes-state") {
        if (typeof d.frameIndex === "number") setActiveFrameIdx(d.frameIndex);
        if (typeof d.playing === "boolean") setPlaying(d.playing);
      } else if (d.type === "zeus:slide-state") {
        if (typeof d.slideIndex === "number") setActiveSlideIdx(d.slideIndex);
      } else if (d.type === "zeus:dom-selected") {
        setSelectedEl({
          index: Number(d.index ?? 0),
          domPath: String(d.domPath ?? ""),
          tag: String(d.tag ?? "div"),
          className: String(d.className ?? ""),
          text: String(d.text ?? ""),
          color: String(d.color ?? ""),
          bg: String(d.bg ?? ""),
          fontSize: String(d.fontSize ?? ""),
          padding: String(d.padding ?? ""),
          radius: String(d.radius ?? ""),
          outerHtml: String(d.outerHtml ?? ""),
          parentOuterHtml: String(d.parentOuterHtml ?? ""),
          hasParent: Boolean(d.hasParent),
        });
      } else if (d.type === "zeus:dom-updated" && typeof d.html === "string" && active) {
        setUndoStack((prev) => [...prev.slice(-19), active.html]);
        setRedoStack([]);
        updateArtboard(active.id, { html: d.html, version: active.version + 1 });
        const targetRel = active.source || (/\.\w+$/.test(active.name) ? active.name : "");
        if (workspace && targetRel) {
          void writeWorkspaceFile(workspace, targetRel, d.html).catch(() => {});
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, updateArtboard, workspace]);

  const srcDocWithInspector = useMemo(() => {
    if (!inspectOn) return codeValue;
    const bridge = `<script data-od-edit-bridge="true">
(function(){
  const SELECTOR = 'main,nav,section,article,aside,header,footer,div,h1,h2,h3,h4,h5,h6,p,a,button,img,ul,ol,li,td,th,blockquote,figure,figcaption,label,span';
  const all = () => Array.from(document.body.querySelectorAll(SELECTOR)).filter((n) => !n.hasAttribute('data-od-edit-bridge'));
  let hi = null;
  function domPathFor(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body) {
      const p = node.parentElement;
      if (!p) break;
      const ch = Array.from(p.children).filter((c) => !c.hasAttribute('data-od-edit-bridge'));
      parts.unshift(ch.indexOf(node));
      node = p;
    }
    return parts.length ? 'path-' + parts.join('-') : 'root';
  }
  function cleanSerialize() {
    if (hi) hi.style.outline = '';
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-od-edit-bridge]').forEach((n) => n.remove());
    return '<!DOCTYPE html>\\n' + clone.outerHTML;
  }
  function selectElement(t) {
    if (!t || t === document.body || t === document.documentElement) return;
    if (hi) hi.style.outline = '';
    hi = t;
    const list = all();
    const idx = list.indexOf(t);
    const cs = window.getComputedStyle(t);
    const cleanOuter = t.outerHTML;
    const parentEl = t.parentElement && t.parentElement !== document.body ? t.parentElement : null;
    const parentOuter = parentEl ? parentEl.outerHTML : '';
    t.style.outline = '1px solid #D97757';
    window.parent.postMessage({
      type: 'zeus:dom-selected',
      index: idx,
      domPath: domPathFor(t),
      tag: t.tagName.toLowerCase(),
      className: typeof t.className === 'string' ? t.className : '',
      text: (t.childElementCount === 0 ? t.textContent : t.getAttribute('data-label') || t.textContent || '').trim().slice(0, 160),
      color: cs.color,
      bg: cs.backgroundColor,
      fontSize: cs.fontSize,
      padding: cs.padding,
      radius: cs.borderRadius,
      outerHtml: cleanOuter.slice(0, 800),
      parentOuterHtml: parentOuter.slice(0, 900),
      hasParent: Boolean(parentEl)
    }, '*');
  }
  document.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    selectElement(e.target);
  }, true);
  window.addEventListener('message', function(ev){
    const m = ev.data;
    if (!m) return;
    const list = all();
    const el = list[m.index];
    if (!el) return;
    if (m.type === 'zeus:dom-patch') {
      if (typeof m.text === 'string') {
        if (el.childElementCount === 0) {
          el.textContent = m.text;
        } else {
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === 3 && node.textContent.trim()) {
              node.textContent = m.text;
              break;
            }
          }
        }
      }
      if (m.color) el.style.color = m.color;
      if (m.bg) el.style.backgroundColor = m.bg;
      if (m.fontSize) el.style.fontSize = m.fontSize;
      if (m.padding) el.style.padding = m.padding;
      if (m.radius) el.style.borderRadius = m.radius;
      window.parent.postMessage({ type: 'zeus:dom-updated', html: cleanSerialize() }, '*');
      selectElement(el);
    } else if (m.type === 'zeus:dom-action') {
      if (m.action === 'select-parent') {
        if (el.parentElement && el.parentElement !== document.body) {
          selectElement(el.parentElement);
        }
      } else if (m.action === 'remove-element') {
        const nextFocus = el.parentElement && el.parentElement !== document.body ? el.parentElement : null;
        el.remove();
        hi = null;
        window.parent.postMessage({ type: 'zeus:dom-updated', html: cleanSerialize() }, '*');
        if (nextFocus) selectElement(nextFocus);
      } else if (m.action === 'strip-decorative-line') {
        let styleEl = document.getElementById('zeus-od-no-line');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'zeus-od-no-line';
          document.head.appendChild(styleEl);
        }
        const uidAttr = 'od-noline-' + Math.random().toString(36).slice(2, 7);
        el.setAttribute('data-od-noline', uidAttr);
        if (el.parentElement && el.parentElement !== document.body) {
          el.parentElement.setAttribute('data-od-noline-parent', uidAttr);
        }
        styleEl.textContent += '\\n[data-od-noline="' + uidAttr + '"]::before,[data-od-noline="' + uidAttr + '"]::after,[data-od-noline-parent="' + uidAttr + '"]::before,[data-od-noline-parent="' + uidAttr + '"]::after{content:none!important;display:none!important;width:0!important;border:0!important;}';
        const checkTargets = [el, ...(el.parentElement ? Array.from(el.parentElement.children) : []), ...Array.from(el.children)];
        checkTargets.forEach((c) => {
          if (c !== el && c.childElementCount === 0 && (c.textContent || '').trim().replace(/[-—–_]/g, '') === '') {
            c.remove();
          }
        });
        el.textContent = (el.textContent || '').replace(/^\\s*[-—–]{1,4}\\s*/, '');
        window.parent.postMessage({ type: 'zeus:dom-updated', html: cleanSerialize() }, '*');
        selectElement(el);
      } else if (m.action === 'set-outer-html' && typeof m.value === 'string') {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = m.value.trim();
        const replacement = wrapper.firstElementChild;
        if (replacement && el.parentElement) {
          el.replaceWith(replacement);
          hi = null;
          window.parent.postMessage({ type: 'zeus:dom-updated', html: cleanSerialize() }, '*');
          selectElement(replacement);
        }
      }
    }
  });
})();
</script>`;
    return codeValue.includes("</body>")
      ? codeValue.replace("</body>", `${bridge}</body>`)
      : `${codeValue}\n${bridge}`;
  }, [codeValue, inspectOn]);

  const applyElementPatch = (patch: Partial<SelectedDomTarget>) => {
    if (!selectedEl) return;
    const next = { ...selectedEl, ...patch };
    setSelectedEl(next);
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "zeus:dom-patch",
        index: next.index,
        text: next.text,
        color: next.color,
        bg: next.bg,
        fontSize: next.fontSize,
        padding: next.padding,
        radius: next.radius,
      },
      "*"
    );
  };

  const triggerDomAction = (
    action: "select-parent" | "remove-element" | "strip-decorative-line" | "set-outer-html",
    value?: string
  ) => {
    if (!selectedEl) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "zeus:dom-action",
        index: selectedEl.index,
        action,
        value,
      },
      "*"
    );
    if (action === "remove-element") {
      setSelectedEl(null);
      notify("Removed element from document");
    } else if (action === "strip-decorative-line") {
      notify("Removed decorative line / ::before / ::after");
    }
  };

  const handleUndoDom = () => {
    if (!active || !undoStack.length) return;
    const prevHtml = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, active.html]);
    updateArtboard(active.id, { html: prevHtml, version: Math.max(1, active.version - 1) });
    if (workspace && active.source) {
      void writeWorkspaceFile(workspace, active.source, prevHtml).catch(() => {});
    }
  };

  const handleRedoDom = () => {
    if (!active || !redoStack.length) return;
    const nextHtml = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, active.html]);
    updateArtboard(active.id, { html: nextHtml, version: active.version + 1 });
    if (workspace && active.source) {
      void writeWorkspaceFile(workspace, active.source, nextHtml).catch(() => {});
    }
  };

  const applyHyperFramesPalette = (pal: HyperFramesPaletteSpec) => {
    if (!active) return;
    const overrideTag = `<style id="zeus-hyperframes-palette">:root{--bg:${pal.bg}!important;--surface:${pal.surface}!important;--ink:${pal.ink}!important;--accent:${pal.accent}!important;--secondary:${pal.secondary}!important;}body,.frame{background:${pal.bg}!important;color:${pal.ink}!important;}</style>`;
    const base = (draftHtml ?? active.html).replace(/<style id="zeus-hyperframes-palette">[\s\S]*?<\/style>/gi, "");
    const nextHtml = base.includes("</head>")
      ? base.replace("</head>", `${overrideTag}</head>`)
      : `${overrideTag}\n${base}`;
    updateArtboard(active.id, { html: nextHtml, version: active.version + 1 });
    setDraftHtml(null);
    notify(`Applied HyperFrames palette: ${pal.name}`);
  };

  const handleExportHyperFramesJson = () => {
    if (!active) return;
    const slug = (active.name || "artifact").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const manifest = {
      schema: "open-design.artifact-manifest.v1",
      name: active.name,
      kind: deliverableKind,
      renderer: deliverableKind === "hyperframes" ? "hyperframes-html" : deliverableKind === "deck" ? "open-slide-1920" : "html-dom",
      entryFile: `${slug}.html`,
      version: active.version,
      aspect: videoAspect,
      totalDurationMs: hyperFrames.totalDurationMs,
      exports: deliverableKind === "hyperframes" ? ["webm", "mp4", "hyperframes.json", "html"] : ["html"],
      frames: hyperFrames.frames,
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.artifact.manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Exported OpenDesign Artifact Manifest JSON");
  };

  const gotoHyperFrame = (idx: number, keepPlaying = false) => {
    setActiveFrameIdx(idx);
    setPlaying(keepPlaying);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "zeus:hyperframes-goto", index: idx, playing: keepPlaying },
      "*"
    );
  };

  const toggleHyperPlay = () => {
    const next = !playing;
    setPlaying(next);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "zeus:hyperframes-toggle", playing: next },
      "*"
    );
  };

  const gotoSlide = (idx: number) => {
    if (!slideDeck.slides.length) return;
    const clamped = ((idx % slideDeck.slides.length) + slideDeck.slides.length) % slideDeck.slides.length;
    setActiveSlideIdx(clamped);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "zeus:slide-goto", index: clamped },
      "*"
    );
  };

  const handleExportVideo = async () => {
    if (!active || exportProgress) return;
    try {
      const res = await exportHyperFramesToVideo({
        html: codeValue,
        title: active.name || "hyperframes-video",
        aspect: videoAspect,
        onProgress: (p) => setExportProgress(p),
      });
      notify(`Exported video ${res.filename} (${res.width}×${res.height})`);
    } catch (e) {
      notify(`Video export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setExportProgress(null), 1200);
    }
  };

  const handleSaveToWorkspace = async () => {
    if (!active) return;
    const html = draftHtml ?? active.html;
    const slug =
      (active.name || "artifact")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "artifact";
    const fileName = `${slug}.html`;
    if (workspace) {
      try {
        await writeWorkspaceFile(workspace, fileName, html);
        const refreshed = await refreshTree(workspace);
        if (refreshed) patchUI({ workspace: { ...workspace, tree: refreshed } });
        notify(`Saved ${fileName} to ${workspace.name}`);
        return;
      } catch {
        /* fallback to browser download */
      }
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Downloaded ${fileName}`);
  };

  const handleCopyCode = () => {
    if (!active) return;
    navigator.clipboard.writeText(codeValue).then(
      () => notify("Copied HTML source to clipboard"),
      () => notify("Failed to copy")
    );
  };

  const handleApplyDraft = () => {
    if (!active || draftHtml === null) return;
    updateArtboard(active.id, { html: draftHtml, version: active.version + 1 });
    setDraftHtml(null);
    notify("Updated artifact preview");
  };

  const loadStarter = (kind: "hyperframes" | "deck") => {
    const created = addArtboard({
      name: kind === "hyperframes" ? "HyperFrames Launch Video" : "Open-Slide 1920 Deck",
      device: "web",
      html: kind === "hyperframes" ? STARTER_HYPERFRAMES_VIDEO_HTML : STARTER_OPEN_SLIDE_DECK_HTML,
    });
    select([created.id]);
    patchUI({ showCanvas: true });
  };

  if (!active) {
    return (
      <div className="flex h-full w-full flex-col rounded-2xl border border-outline-variant/60 bg-surface-low">
        <div className="flex h-11 items-center justify-between border-b border-outline-variant/60 px-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
            <Icon name="code_blocks" size={16} className="text-primary" />
            <span>Artifact &amp; HyperFrames Workbench</span>
          </div>
          <IconBtn label="Close workbench" size={30} onClick={() => patchUI({ showCanvas: false, m3e: null })}>
            <Icon name="close" size={17} />
          </IconBtn>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Icon name="movie" size={28} className="text-primary" />
          <div className="text-sm font-semibold text-on-surface">No active deliverable in this chat</div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => loadStarter("hyperframes")}
              className="state inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary"
            >
              <Icon name="movie" size={15} />
              Open HyperFrames Video Starter
            </button>
            <button
              onClick={() => loadStarter("deck")}
              className="state inline-flex h-8 items-center gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-container px-3 text-xs font-semibold text-on-surface"
            >
              <Icon name="slideshow" size={15} />
              Open 1920×1080 Slide Deck Starter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-low">
      {/* Top Studio Header */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-outline-variant/60 bg-surface-container/60 px-3">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-bar">
          {list.map((b) => {
            const isSel = b.id === active.id;
            const kind = detectDeliverableKind(b.html);
            const icon = kind === "hyperframes" ? "movie" : kind === "deck" ? "slideshow" : "web";
            return (
              <button
                key={b.id}
                onClick={() => {
                  setDraftHtml(null);
                  setActiveFrameIdx(0);
                  setActiveSlideIdx(0);
                  select([b.id]);
                }}
                className={cn(
                  "state inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium",
                  isSel
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Icon name={icon} size={13} />
                <span className="max-w-[140px] truncate">{b.name}</span>
                <span className="font-mono text-[10px] opacity-75">v{b.version}</span>
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center rounded-lg border border-outline-variant/60 bg-surface p-0.5">
            {(["preview", "split", "code"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "state h-6 rounded-md px-2 text-[11px] font-semibold capitalize",
                  mode === m ? "bg-surface-high text-on-surface" : "text-on-surface-variant"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {deliverableKind === "hyperframes" && mode !== "code" && (
            <div className="flex items-center rounded-lg border border-outline-variant/60 bg-surface p-0.5">
              {(["16:9", "9:16", "1:1"] as VideoAspectRatio[]).map((ar) => (
                <button
                  key={ar}
                  onClick={() => setVideoAspect(ar)}
                  className={cn(
                    "state h-6 rounded-md px-2 font-mono text-[10.5px] font-semibold",
                    videoAspect === ar ? "bg-surface-high text-primary" : "text-on-surface-variant"
                  )}
                >
                  {ar}
                </button>
              ))}
            </div>
          )}

          {deliverableKind === "prototype" && mode !== "code" && (
            <div className="flex items-center rounded-lg border border-outline-variant/60 bg-surface p-0.5">
              {(
                [
                  { id: "responsive", icon: "width" },
                  { id: "desktop", icon: "laptop" },
                  { id: "tablet", icon: "crop_landscape" },
                  { id: "mobile", icon: "smartphone" },
                ] as { id: ViewportSize; icon: string }[]
              ).map((vp) => (
                <button
                  key={vp.id}
                  onClick={() => setViewport(vp.id)}
                  title={vp.id}
                  className={cn(
                    "state grid size-6 place-items-center rounded-md",
                    viewport === vp.id ? "bg-surface-high text-primary" : "text-on-surface-variant"
                  )}
                >
                  <Icon name={vp.icon} size={14} />
                </button>
              ))}
            </div>
          )}

          {deliverableKind === "hyperframes" && (
            <>
              <button
                onClick={handleExportVideo}
                disabled={Boolean(exportProgress)}
                className="state inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-on-primary disabled:opacity-60"
              >
                <Icon name="movie" size={14} />
                <span>{exportProgress ? `${exportProgress.percent}%` : "Export Video"}</span>
              </button>
              <button
                onClick={handleExportHyperFramesJson}
                className="state inline-flex h-7 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface px-2 text-xs font-medium text-on-surface"
                title="Export Remotion / HyperFrames JSON manifest"
              >
                <Icon name="code" size={13} />
                <span>JSON</span>
              </button>
              <button
                onClick={handleScaffoldHyperFramesBundle}
                className="state inline-flex h-7 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface px-2 text-xs font-medium text-on-surface"
                title="Scaffold OpenDesign .hyperframes-cache bundle (hyperframes.json + meta.json + index.html)"
              >
                <Icon name="folder_open" size={13} />
                <span>Bundle</span>
              </button>
              <button
                onClick={() => setShowAnimMap(!showAnimMap)}
                className={cn(
                  "state inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium",
                  showAnimMap
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant/60 bg-surface text-on-surface"
                )}
                title="Inspect HyperFrames Animation Map & Contrast Report"
              >
                <Icon name="insights" size={13} />
                <span>AnimMap</span>
              </button>
            </>
          )}

          {mode !== "code" && (
            <button
              onClick={() => {
                setInspectOn(!inspectOn);
                if (inspectOn) setSelectedEl(null);
              }}
              className={cn(
                "state inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium",
                inspectOn
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant/60 bg-surface text-on-surface"
              )}
              title="Click any element in the preview to edit text, colors, or spacing directly"
            >
              <Icon name="ads_click" size={13} />
              <span>Inspect</span>
            </button>
          )}

          {draftHtml !== null && (
            <button
              onClick={handleApplyDraft}
              className="state inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-on-primary"
            >
              <Icon name="check" size={14} />
              Apply
            </button>
          )}

          <button
            onClick={handleCopyCode}
            className="state inline-flex h-7 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface px-2 text-xs font-medium text-on-surface"
          >
            <Icon name="content_copy" size={13} />
            Copy
          </button>

          <button
            onClick={handleSaveToWorkspace}
            className="state inline-flex h-7 items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface px-2.5 text-xs font-medium text-on-surface"
          >
            <Icon name="save" size={14} />
            {workspace ? "Save HTML" : "Export HTML"}
          </button>

          <IconBtn label="Delete artifact" size={28} onClick={() => removeArtboards([active.id])}>
            <Icon name="delete" size={15} />
          </IconBtn>

          <IconBtn label="Close workbench" size={28} onClick={() => patchUI({ showCanvas: false, m3e: null })}>
            <Icon name="close" size={16} />
          </IconBtn>
        </div>
      </div>

      {/* Video Export Progress Banner */}
      {exportProgress && (
        <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-outline-variant/50 bg-surface-high px-3.5 text-xs">
          <div className="flex items-center gap-2 font-medium text-on-surface">
            <Icon name="movie" size={14} className="text-primary" />
            <span>{exportProgress.detail}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-container">
              <div style={{ width: `${exportProgress.percent}%` }} className="h-full bg-primary transition-all" />
            </div>
            <span className="font-mono text-[11px] text-on-surface-variant">{exportProgress.percent}%</span>
          </div>
        </div>
      )}

      {/* Main Content Stage */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Open-Slide Left Thumbnail Rail when viewing a Deck */}
        {deliverableKind === "deck" && slideDeck.slides.length > 0 && mode !== "code" && (
          <div className="flex w-48 shrink-0 flex-col border-r border-outline-variant/60 bg-surface-container/40 p-2 overflow-y-auto">
            <div className="mb-1.5 px-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Slides ({slideDeck.slides.length})
            </div>
            <div className="space-y-1.5">
              {slideDeck.slides.map((sl) => {
                const isCur = sl.index === activeSlideIdx;
                return (
                  <button
                    key={sl.id}
                    onClick={() => gotoSlide(sl.index)}
                    className={cn(
                      "state flex w-full flex-col rounded-xl border p-2 text-left",
                      isCur
                        ? "border-primary bg-surface-high text-on-surface"
                        : "border-outline-variant/50 bg-surface text-on-surface-variant"
                    )}
                  >
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className={cn("font-bold", isCur && "text-primary")}>
                        SLIDE {String(sl.index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs font-semibold text-on-surface">
                      {sl.headline}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(mode === "preview" || mode === "split") && (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface",
              mode === "split" && "border-r border-outline-variant/60"
            )}
          >
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
              <div
                style={{
                  width:
                    deliverableKind === "hyperframes"
                      ? videoAspect === "9:16"
                        ? "380px"
                        : videoAspect === "1:1"
                        ? "620px"
                        : "100%"
                      : VIEWPORT_WIDTHS[viewport],
                  aspectRatio:
                    deliverableKind === "hyperframes"
                      ? videoAspect === "9:16"
                        ? "9 / 16"
                        : videoAspect === "1:1"
                        ? "1 / 1"
                        : "16 / 9"
                      : deliverableKind === "deck"
                      ? "16 / 9"
                      : undefined,
                }}
                className={cn(
                  "max-h-full max-w-full overflow-hidden rounded-xl border border-outline-variant/50 bg-white",
                  deliverableKind === "prototype" && "h-full"
                )}
              >
                <iframe
                  ref={iframeRef}
                  title={active.name}
                  srcDoc={srcDocWithInspector}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  className="h-full w-full border-0"
                />
              </div>
            </div>

            {/* HyperFrames Animation Map & Contrast Audit Drawer */}
            {deliverableKind === "hyperframes" && showAnimMap && (
              <div className="flex shrink-0 flex-col gap-2 border-t border-outline-variant/60 bg-surface-container/60 px-3.5 py-2.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-on-surface">
                    <Icon name="insights" size={14} className="text-primary" />
                    <span>
                      HyperFrames Animation Map ({animMap.sceneCount} scenes · {animMap.totalDurationSec}s)
                    </span>
                    <span className="rounded-md bg-surface-high px-2 py-0.5 text-[10px] text-primary">
                      {animMap.contrastPass ? "WCAG AA & ZERO-SHADOW PASS" : "CHECK FLAGS"}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowAnimMap(false)}
                    className="state rounded-md px-1.5 py-0.5 text-[10.5px] text-on-surface-variant"
                  >
                    Hide
                  </button>
                </div>
                <div className="max-h-28 overflow-y-auto rounded-lg border border-outline-variant/50 bg-surface p-2 text-[11px] leading-relaxed text-on-surface">
                  {animMap.asciiTimeline.map((line, i) => (
                    <div key={i} className="truncate">
                      {line}
                    </div>
                  ))}
                </div>
                {animMap.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {animMap.flags.map((fl, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-outline-variant/60 bg-surface px-2 py-0.5 text-[10.5px] text-on-surface-variant"
                      >
                        {fl}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HyperFrames Multi-Scene Video Timeline & Frame Sequencer */}
            {deliverableKind === "hyperframes" && hyperFrames.frames.length > 0 && (
              <div className="flex shrink-0 flex-col gap-2 border-t border-outline-variant/60 bg-surface-low px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={toggleHyperPlay}
                      className="state inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-on-primary"
                    >
                      <Icon name={playing ? "pause" : "play_arrow"} size={15} />
                      <span>{playing ? "Pause" : "Play"}</span>
                    </button>
                    <button
                      onClick={() => gotoHyperFrame(activeFrameIdx - 1, false)}
                      className="state grid size-7 place-items-center rounded-lg border border-outline-variant/60 bg-surface text-on-surface"
                      title="Previous scene"
                    >
                      <Icon name="chevron_left" size={16} />
                    </button>
                    <button
                      onClick={() => gotoHyperFrame(activeFrameIdx + 1, false)}
                      className="state grid size-7 place-items-center rounded-lg border border-outline-variant/60 bg-surface text-on-surface"
                      title="Next scene"
                    >
                      <Icon name="chevron_right" size={16} />
                    </button>
                    <span className="ml-1 font-mono text-xs font-semibold text-on-surface">
                      SCENE {String(activeFrameIdx + 1).padStart(2, "0")} / {String(hyperFrames.frames.length).padStart(2, "0")}
                    </span>
                    <span className="truncate text-xs text-on-surface-variant">
                      · {hyperFrames.frames[activeFrameIdx]?.sceneTitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-on-surface-variant">
                    <div className="hidden items-center gap-1 sm:flex">
                      {HYPERFRAMES_PALETTES.slice(0, 6).map((pal) => (
                        <button
                          key={pal.id}
                          onClick={() => applyHyperFramesPalette(pal)}
                          title={`Apply HyperFrames palette: ${pal.name}`}
                          className="state flex h-5 items-center gap-1 rounded-md border border-outline-variant/60 bg-surface px-1.5 text-[10px] text-on-surface"
                        >
                          <span style={{ background: pal.accent }} className="size-2.5 rounded-sm" />
                          <span>{pal.name.split(" ")[0]}</span>
                        </button>
                      ))}
                    </div>
                    <span>Total {(hyperFrames.totalDurationMs / 1000).toFixed(1)}s</span>
                    <span>·</span>
                    <span>{videoAspect}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
                  {hyperFrames.frames.map((sc) => {
                    const isCur = sc.index === activeFrameIdx;
                    return (
                      <button
                        key={sc.index}
                        onClick={() => gotoHyperFrame(sc.index, false)}
                        className={cn(
                          "state flex flex-col rounded-lg border px-2.5 py-1.5 text-left",
                          isCur
                            ? "border-primary bg-surface-high text-on-surface"
                            : "border-outline-variant/50 bg-surface text-on-surface-variant"
                        )}
                      >
                        <div className="flex items-center justify-between font-mono text-[10px]">
                          <span className={cn("font-bold", isCur && "text-primary")}>
                            #{String(sc.index + 1).padStart(2, "0")}
                          </span>
                          <span>{(sc.durationMs / 1000).toFixed(1)}s</span>
                        </div>
                        <div className="mt-0.5 truncate text-[11.5px] font-medium text-on-surface">
                          {sc.sceneTitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {deliverableKind === "deck" && slideDeck.slides.length > 0 && (
              <div className="flex shrink-0 flex-col gap-1.5 border-t border-outline-variant/60 bg-surface-low px-3.5 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => gotoSlide(activeSlideIdx - 1)} className="state grid size-7 place-items-center rounded-lg border border-outline-variant/60 bg-surface text-on-surface"><Icon name="chevron_left" size={16} /></button>
                    <span className="font-mono text-xs font-semibold text-on-surface">Slide {activeSlideIdx + 1} / {slideDeck.slides.length}</span>
                    <button onClick={() => gotoSlide(activeSlideIdx + 1)} className="state grid size-7 place-items-center rounded-lg border border-outline-variant/60 bg-surface text-on-surface"><Icon name="chevron_right" size={16} /></button>
                    <span className="ml-2 truncate text-xs font-medium text-on-surface-variant">{slideDeck.slides[activeSlideIdx]?.headline}</span>
                  </div>
                  <button onClick={() => setShowNotes(!showNotes)} className="state inline-flex h-6 items-center gap-1 rounded-md border border-outline-variant/60 bg-surface px-2 text-[11px] font-medium text-on-surface-variant">
                    <Icon name="notes" size={13} /><span>{showNotes ? "Hide notes" : "Speaker notes"}</span>
                  </button>
                </div>
                {showNotes && slideDeck.slides[activeSlideIdx]?.notes && (
                  <div className="rounded-lg border border-outline-variant/40 bg-surface px-3 py-1.5 text-xs text-on-surface-variant">
                    <span className="font-mono text-[10.5px] font-semibold uppercase text-primary">Speaker Notes: </span>{slideDeck.slides[activeSlideIdx]?.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(mode === "code" || mode === "split") && (
          <div className="flex min-h-0 flex-1 flex-col bg-surface-low">
            <div className="flex h-8 items-center justify-between border-b border-outline-variant/40 px-3 font-mono text-[11px] text-on-surface-variant">
              <span>
                {active.name}.html ({codeValue.split("\n").length} lines · {deliverableKind.toUpperCase()})
              </span>
              <span>Raw HTML/CSS/JS</span>
            </div>
            <textarea
              value={codeValue}
              onChange={(e) => setDraftHtml(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed text-on-surface outline-none"
            />
          </div>
        )}

        {/* OpenDesign Direct DOM Element & Token Inspector */}
        {inspectOn && mode !== "code" && (
          <DomInspectorPanel
            artifactName={active.name}
            artifactSource={active.source}
            selectedEl={selectedEl}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndoDom}
            onRedo={handleRedoDom}
            onClose={() => {
              setInspectOn(false);
              setSelectedEl(null);
            }}
            onPatchElement={applyElementPatch}
            onAction={triggerDomAction}
          />
        )}
      </div>
    </div>
  );
}
