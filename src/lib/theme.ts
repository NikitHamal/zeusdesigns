// Material 3 Expressive runtime theming: warm neutral surfaces with a seed-hue accent.
const t = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

export const ACCENTS: { id: string; name: string; hue: number }[] = [
  { id: "clay", name: "Clay", hue: 17 },
  { id: "amber", name: "Amber", hue: 38 },
  { id: "moss", name: "Moss", hue: 110 },
  { id: "teal", name: "Teal", hue: 172 },
  { id: "rose", name: "Rose", hue: 346 },
  { id: "slate", name: "Graphite", hue: 30 },
];

export function applyTheme(mode: "light" | "dark" | "system", hue: number) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const h = hue;
  const v: Record<string, string> = dark
    ? {
        primary: t(h, 62, 63), "on-primary": t(h, 55, 11), "primary-container": t(h, 36, 25), "on-primary-container": t(h, 85, 90),
        secondary: t(h, 10, 78), "secondary-container": t(h, 5, 24), "on-secondary-container": t(h, 12, 91),
        tertiary: t(h + 95, 32, 72), "tertiary-container": t(h + 95, 20, 26), "on-tertiary-container": t(h + 95, 40, 90),
        surface: t(h, 3, 10), "surface-dim": t(h, 3, 8), "surface-lowest": t(h, 3, 6), "surface-low": t(h, 3, 12),
        "surface-container": t(h, 3, 17), "surface-high": t(h, 3, 20), "surface-highest": t(h, 3, 24),
        "on-surface": t(h, 8, 93), "on-surface-variant": t(h, 5, 68), outline: t(h, 3, 48), "outline-variant": t(h, 3, 24),
        error: t(5, 90, 74), "error-container": t(2, 55, 25), "on-error-container": t(5, 100, 90),
        "inverse-surface": t(h, 8, 90), "inverse-on-surface": t(h, 6, 16),
      }
    : {
        primary: t(h, 55, 48), "on-primary": "#fff", "primary-container": t(h, 75, 91), "on-primary-container": t(h, 70, 16),
        secondary: t(h, 10, 38), "secondary-container": t(h, 14, 91), "on-secondary-container": t(h, 20, 14),
        tertiary: t(h + 95, 30, 36), "tertiary-container": t(h + 95, 35, 88), "on-tertiary-container": t(h + 95, 50, 14),
        surface: t(h, 25, 98), "surface-dim": t(h, 14, 94), "surface-lowest": "#fff", "surface-low": t(h, 22, 96),
        "surface-container": t(h, 18, 94), "surface-high": t(h, 14, 91), "surface-highest": t(h, 12, 88),
        "on-surface": t(h, 14, 11), "on-surface-variant": t(h, 6, 36), outline: t(h, 5, 50), "outline-variant": t(h, 10, 85),
        error: t(2, 70, 42), "error-container": t(5, 100, 92), "on-error-container": t(2, 90, 15),
        "inverse-surface": t(h, 8, 17), "inverse-on-surface": t(h, 20, 95),
      };
  const root = document.documentElement;
  for (const k in v) root.style.setProperty(`--m-${k}`, v[k]);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = dark ? "dark" : "light";
}
