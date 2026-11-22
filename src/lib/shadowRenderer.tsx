// Ultra-lightweight Shadow DOM screen renderer.
// Replaces heavy <iframe> sub-documents for thumbnails and canvas artboards so WebView2 stays under ~20-30 MB RAM
// while preserving 100% of CSS variables, layout fidelity, and interactive kit states (.z-tab, .z-chip, .z-nav-item, .z-side-item).

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "../store";
import { cn } from "../utils/cn";
import { getDS, tokensCss } from "./designSystems";
import { fontsUsedIn, installDesignFonts } from "./fonts";
import { kitCss } from "./harness";

const InteractiveSelector = ".z-tab,.z-chip,.z-nav-item,.z-side-item,.z-seg";

function scopeCssToShadow(css: string): string {
  return css
    .replace(/@import\s+(?:url\(\s*(?:'[^']*'|"[^"]*"|[^)]*)\s*\)|'[^']*'|"[^"]*")[^;\n]*;?/gi, "")
    .replace(/@import\b[^\n;]*;?/gi, "")
    .replace(/(?:^|[\n])\s*[^\n{}<>]*(?:display=(?:swap|auto|block|fallback|optional)|wght@[\d;]+)[^\n{}<>]*['"]?\s*\)?\s*;?/gi, "\n")
    .replace(/:root(?=\s*[,{])/g, ":host, .z-shadow-body")
    .replace(/:root\b/g, ".z-shadow-body")
    .replace(/\bhtml\s*,\s*body(?=\s*[,{])/gi, ":host, .z-shadow-body")
    .replace(/(^|[},;\s])body(?=[{\s.,:#>~+\[])/gi, "$1.z-shadow-body")
    .replace(/(^|[},;\s])html(?=[{\s.,:#>~+\[])/gi, "$1.z-shadow-body")
    .replace(/(\d+(?:\.\d+)?)vh\b/g, "calc($1 * var(--z-vh, 1vh))")
    .replace(/(\d+(?:\.\d+)?)vw\b/g, "calc($1 * var(--z-vw, 1vw))");
}

function parseArtboardDocument(html: string): { styles: string; bodyClass: string; bodyStyle: string; dataTheme: string; bodyHtml: string } {
  if (!html) return { styles: "", bodyClass: "", bodyStyle: "", dataTheme: "", bodyHtml: "" };
  const styleBlocks: string[] = [];
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const withoutStyles = withoutScripts.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => {
    styleBlocks.push(scopeCssToShadow(css));
    return "";
  });

  const htmlAttrs = /<html\b([^>]*)>/i.exec(withoutStyles)?.[1] ?? "";
  const bodyMatch = /<body\b([^>]*)>([\s\S]*?)(?:<\/body>|$)/i.exec(withoutStyles);
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

  const htmlClass = /\bclass\s*=\s*"([^"]*)"/i.exec(htmlAttrs)?.[1] ?? "";
  const bClass = /\bclass\s*=\s*"([^"]*)"/i.exec(bodyAttrs)?.[1] ?? "";
  const bodyClass = [htmlClass, bClass].filter(Boolean).join(" ").trim();
  const htmlStyle = /\bstyle\s*=\s*"([^"]*)"/i.exec(htmlAttrs)?.[1] ?? "";
  const bStyle = /\bstyle\s*=\s*"([^"]*)"/i.exec(bodyAttrs)?.[1] ?? "";
  const bodyStyle = [htmlStyle, bStyle].filter(Boolean).join(";").trim();
  const dataTheme =
    /\bdata-theme\s*=\s*"([^"]*)"/i.exec(bodyAttrs)?.[1] ??
    /\bdata-theme\s*=\s*"([^"]*)"/i.exec(htmlAttrs)?.[1] ??
    "";

  return {
    styles: styleBlocks.join("\n"),
    bodyClass,
    bodyStyle,
    dataTheme,
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

  useLayoutEffect(() => {
    try {
      const host = hostRef.current;
      if (!host) return;
      const root = shadowRef.current ?? host.shadowRoot ?? host.attachShadow({ mode: "open" });
      shadowRef.current = root;

      const usedFonts = fontsUsedIn(html);
      if (usedFonts.length > 0) installDesignFonts(usedFonts);

      const { styles, bodyClass, bodyStyle, dataTheme, bodyHtml } = parseArtboardDocument(html);
      const needsKitFallback = html.trim().length > 0 && !html.includes("data-zeus-kit");
      const fallbackKit = needsKitFallback
        ? scopeCssToShadow(tokensCss(getDS(useStore.getState().settings.designSystemId)) + kitCss(useStore.getState().settings.designSystemId))
        : "";
      const vh = (h / 100).toFixed(3);
      const vw = (w / 100).toFixed(3);
      const fullCss = `:host {
  display: block;
  width: ${w}px;
  height: ${h}px;
  --z-vh: ${vh}px;
  --z-vw: ${vw}px;
  overflow: hidden;
  position: relative;
  contain: layout paint;
  isolation: isolate;
  background: var(--bg, var(--m-surface-container, #2d2b2a));
  color: var(--text, var(--m-on-surface, #efedec));
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
  background: var(--bg, var(--m-surface-container, #2d2b2a));
  color: var(--text, var(--m-on-surface, #efedec));
  font-family: var(--font, system-ui, sans-serif);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.z-shadow-body::-webkit-scrollbar { display: none; width: 0; height: 0; }
${fallbackKit}
${styles}`;

      const themeAttr = dataTheme ? ` data-theme="${dataTheme}"` : "";
      root.innerHTML = `<style>${fullCss}</style><div class="z-shadow-body ${bodyClass}" style="${bodyStyle}"${themeAttr}>${bodyHtml}</div>`;
    } catch {
      // Never allow malformed artboard HTML/CSS to interrupt React's effect loop
    }
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
      className={cn("relative overflow-hidden bg-surface-container", className)}
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
