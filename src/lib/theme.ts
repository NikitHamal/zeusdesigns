// Runtime theming: OpenCode neutral surface ladder (M3 token names kept) with a seed-hue accent.
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
  const dark = mode !== "light" && (mode === "dark" || !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches);
  const h = Number.isFinite(hue) ? hue : 17;
  const v: Record<string, string> = dark
    ? {
        primary: t(h, 62, 63), "on-primary": t(h, 55, 11), "primary-container": t(h, 36, 25), "on-primary-container": t(h, 85, 90),
        secondary: t(h, 10, 78), "secondary-container": t(h, 5, 24), "on-secondary-container": t(h, 12, 91),
        tertiary: t(h + 95, 32, 72), "tertiary-container": t(h + 95, 20, 26), "on-tertiary-container": t(h + 95, 40, 90),
        // OpenCode oc-2 dark surface ladder: base #101010, strong #121212, stronger #151515, raised #1c1c1c.
        surface: "#121212", "surface-dim": "#101010", "surface-lowest": "#0c0c0c", "surface-low": "#151515",
        "surface-container": "#1c1c1c", "surface-high": "#242424", "surface-highest": "#2c2c2c",
        "on-surface": "#ededed", "on-surface-variant": "#9d9d9d", outline: "#7e7e7e", "outline-variant": "#282828",
        error: t(5, 90, 74), "error-container": t(2, 55, 25), "on-error-container": t(5, 100, 90),
        "inverse-surface": t(h, 8, 90), "inverse-on-surface": t(h, 6, 16),
      }
    : {
        primary: t(h, 55, 48), "on-primary": "#fff", "primary-container": t(h, 75, 91), "on-primary-container": t(h, 70, 16),
        secondary: t(h, 10, 38), "secondary-container": t(h, 14, 91), "on-secondary-container": t(h, 20, 14),
        tertiary: t(h + 95, 30, 36), "tertiary-container": t(h + 95, 35, 88), "on-tertiary-container": t(h + 95, 50, 14),
        // OpenCode oc-2 light surface ladder: base #f8f8f8, strong #fcfcfc, weak #f3f3f3.
        surface: "#fcfcfc", "surface-dim": "#f8f8f8", "surface-lowest": "#ffffff", "surface-low": "#f5f5f5",
        "surface-container": "#f0f0f0", "surface-high": "#eaeaea", "surface-highest": "#e3e3e3",
        "on-surface": "#171717", "on-surface-variant": "#6f6f6f", outline: "#8f8f8f", "outline-variant": "#e5e5e5",
        error: t(2, 70, 42), "error-container": t(5, 100, 92), "on-error-container": t(2, 90, 15),
        "inverse-surface": t(h, 8, 17), "inverse-on-surface": t(h, 20, 95),
      };
  const root = document.documentElement;
  for (const k in v) root.style.setProperty(`--m-${k}`, v[k]);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = dark ? "dark" : "light";
}
