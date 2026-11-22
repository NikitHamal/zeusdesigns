// Bundled design fonts. Latin variable subsets, inlined at build time so designs never fall back to a system font.
import inter from "../assets/fonts/design/inter.woff2";
import jakarta from "../assets/fonts/design/plus-jakarta-sans.woff2";
import grotesk from "../assets/fonts/design/space-grotesk.woff2";
import fraunces from "../assets/fonts/design/fraunces.woff2";
import dmSans from "../assets/fonts/design/dm-sans.woff2";
import manrope from "../assets/fonts/design/manrope.woff2";
import jetbrains from "../assets/fonts/design/jetbrains-mono.woff2";
import instrumentSerif from "../assets/fonts/design/instrument-serif.woff2";

export interface DesignFont { family: string; url: string; weights: string; kind: "sans" | "serif" | "mono"; feel: string; use: string }

export const DESIGN_FONTS: DesignFont[] = [
  { family: "Inter", url: inter, weights: "100 900", kind: "sans", feel: "neutral, precise, UI native", use: "dashboards, tools, settings, tables" },
  { family: "Plus Jakarta Sans", url: jakarta, weights: "200 800", kind: "sans", feel: "friendly geometric, modern", use: "consumer apps, fintech, onboarding" },
  { family: "DM Sans", url: dmSans, weights: "100 1000", kind: "sans", feel: "low contrast geometric, calm", use: "wellness, SaaS marketing, body text" },
  { family: "Manrope", url: manrope, weights: "200 800", kind: "sans", feel: "semi rounded, technical", use: "crypto, analytics, product pages" },
  { family: "Space Grotesk", url: grotesk, weights: "300 700", kind: "sans", feel: "quirky, techy, characterful", use: "startups, dev tools, brutalist" },
  { family: "Fraunces", url: fraunces, weights: "100 900", kind: "serif", feel: "soft editorial serif, warm", use: "food, journals, boutique, headlines" },
  { family: "Instrument Serif", url: instrumentSerif, weights: "400", kind: "serif", feel: "condensed elegant display", use: "hero headlines only, one weight (400)" },
  { family: "JetBrains Mono", url: jetbrains, weights: "100 800", kind: "mono", feel: "developer mono", use: "code, numbers, labels, terminals" },
];

/** @font-face rules for every bundled design font (or a subset). */
export function fontFaceCss(only?: string[]): string {
  return DESIGN_FONTS.filter((f) => !only || only.includes(f.family))
    .map((f) => `@font-face{font-family:"${f.family}";src:url(${f.url}) format("woff2");font-weight:${f.weights};font-style:normal;font-display:swap}`).join("");
}

/** Families a piece of HTML actually references, so iframes and exports only embed what they use. */
export function fontsUsedIn(html: string): string[] {
  return DESIGN_FONTS.filter((f) => html.includes(f.family) || html.includes(f.family.replace(/\s+/g, "+"))).map((f) => f.family);
}

let installed = false;
/** Registers the faces on the host document once (Shadow DOM artboards inherit them). */
export function installDesignFonts() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const el = document.createElement("style");
  el.setAttribute("data-zeus-fonts", "");
  el.textContent = fontFaceCss();
  document.head.appendChild(el);
}

/** Standalone copy of a design with its fonts embedded, for export. */
export function embedFonts(html: string): string {
  const used = fontsUsedIn(html);
  if (!used.length || html.includes("data-zeus-fonts")) return html;
  const tag = `<style data-zeus-fonts>${fontFaceCss(used)}</style>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + tag) : tag + html;
}
