// Ultra-lightweight Shadow DOM screen renderer.
// Replaces heavy <iframe> sub-documents for thumbnails and canvas artboards so WebView2 stays under ~20-30 MB RAM
// while preserving 100% of CSS variables, layout fidelity, and interactive kit states (.z-tab, .z-chip, .z-nav-item, .z-side-item).

import { memo, useEffect, useRef } from "react";
import { cn } from "../utils/cn";

const InteractiveSelector = ".z-tab,.z-chip,.z-nav-item,.z-side-item,.z-seg";

function scopeCssToShadow(css: string): string {
  return css
    .replace(/:root\b/g, ":host, .z-shadow-body")
    .replace(/\bhtml\s*,\s*body\b/gi, ":host, .z-shadow-body")
    .replace(/(^|[},;\s])body(?=[{\s.,:#>~+\[])/gi, "$1.z-shadow-body")
    .replace(/(^|[},;\s])html(?=[{\s.,:#>~+\[])/gi, "$1:host")
    .replace(/(\d+(?:\.\d+)?)vh\b/g, "calc($1 * var(--z-vh, 1vh))")
    .replace(/(\d+(?:\.\d+)?)vw\b/g, "calc($1 * var(--z-vw, 1vw))");
}

function parseArtboardDocument(html: string): { styles: string; bodyClass: string; bodyStyle: string; bodyHtml: string } {
  if (!html) return { styles: "", bodyClass: "", bodyStyle: "", bodyHtml: "" };
  const styleBlocks: string[] = [];
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const withoutStyles = withoutScripts.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => {
    styleBlocks.push(scopeCssToShadow(css));
    return "";
  });

  const bodyMatch = /<body\b([^>]*)>([\s\S]*?)<\/body>/i.exec(withoutStyles);
  let bodyAttrs = "";
  let bodyHtml = withoutStyles;
  if (bodyMatch) {
    bodyAttrs = bodyMatch[1] ?? "";
    bodyHtml = bodyMatch[2] ?? "";
  } else {
    bodyHtml = withoutStyles
      .replace(/<!doctype[^>]*>/gi, "")
      .replace(/<html[^>]*>|<\/html>/gi, "")
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<meta[^>]*>/gi, "");
  }

  const bodyClass = /\bclass\s*=\s*"([^"]*)"/i.exec(bodyAttrs)?.[1] ?? "";
  const bodyStyle = /\bstyle\s*=\s*"([^"]*)"/i.exec(bodyAttrs)?.[1] ?? "";
  return {
    styles: styleBlocks.join("\n"),
    bodyClass,
    bodyStyle,
    bodyHtml,
  };
}

export const hasCustomScript = (html: string): boolean => {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  return scripts.some((s) => !s.includes("data-zeus-kit-js") && !s.includes("data-zeus-edit"));
};

export const ShadowFrame = memo(function ShadowFrame({
  html,
  w,
  h,
  scale = 1,
  interactive = false,
  className,
}: {
  html: string;
  w: number;
  h: number;
  scale?: number;
  interactive?: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = shadowRef.current ?? host.attachShadow({ mode: "open" });
    shadowRef.current = root;

    const { styles, bodyClass, bodyStyle, bodyHtml } = parseArtboardDocument(html);
    const vh = (h / 100).toFixed(3);
    const vw = (w / 100).toFixed(3);

    root.innerHTML = `<style>
:host {
  display: block;
  width: ${w}px;
  height: ${h}px;
  --z-vh: ${vh}px;
  --z-vw: ${vw}px;
  overflow: hidden;
  position: relative;
  contain: layout paint;
  isolation: isolate;
  background: var(--bg, #fff);
  color: var(--text, #111);
  font-family: var(--font, system-ui, sans-serif);
  box-sizing: border-box;
}
.z-shadow-body {
  width: ${w}px;
  height: ${h}px;
  min-height: ${h}px;
  overflow-x: hidden;
  overflow-y: ${interactive ? "auto" : "hidden"};
  scrollbar-width: none;
  -ms-overflow-style: none;
  box-sizing: border-box;
  background: var(--bg, #fff);
  color: var(--text, #111);
  font-family: var(--font, system-ui, sans-serif);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.z-shadow-body::-webkit-scrollbar { display: none; width: 0; height: 0; }
${styles}
</style><div class="z-shadow-body ${bodyClass}" style="${bodyStyle}">${bodyHtml}</div>`;
  }, [html, w, h, interactive]);

  useEffect(() => {
    const root = shadowRef.current;
    if (!root || !interactive) return;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      const a = target.closest("a[href]");
      if (a) e.preventDefault();
      const item = target.closest(InteractiveSelector);
      if (!item || !item.parentElement) return;
      if (item.matches(".z-chip") && item.parentElement.dataset.multi !== undefined) {
        item.classList.toggle("on");
        return;
      }
      Array.from(item.parentElement.children).forEach((sib) => {
        if (sib.matches(InteractiveSelector)) sib.classList.remove("on");
      });
      item.classList.add("on");
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [interactive, html]);

  return (
    <div
      style={{ width: w * scale, height: h * scale }}
      className={cn("relative overflow-hidden bg-white", className)}
    >
      <div
        ref={hostRef}
        style={{
          width: w,
          height: h,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: "0 0",
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
    </div>
  );
});
