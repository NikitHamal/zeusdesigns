// Material 3 Expressive runtime theming: generates tonal roles from a seed hue.
const t = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

export const ACCENTS: { id: string; name: string; hue: number }[] = [
  { id: "violet", name: "Zeus Violet", hue: 258 },
  { id: "blue", name: "Azure", hue: 216 },
  { id: "teal", name: "Lagoon", hue: 174 },
  { id: "green", name: "Meadow", hue: 128 },
  { id: "amber", name: "Amber", hue: 36 },
  { id: "rose", name: "Rose", hue: 340 },
];

export function applyTheme(mode: "light" | "dark" | "system", hue: number) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const h = hue;
  const v: Record<string, string> = dark
    ? {
        primary: t(h, 90, 80), "on-primary": t(h, 70, 20), "primary-container": t(h, 48, 30), "on-primary-container": t(h, 95, 90),
        secondary: t(h, 30, 80), "secondary-container": t(h, 24, 28), "on-secondary-container": t(h, 40, 90),
        tertiary: t(h + 70, 70, 80), "tertiary-container": t(h + 70, 36, 28), "on-tertiary-container": t(h + 70, 80, 90),
        surface: t(h, 14, 9), "surface-dim": t(h, 14, 6), "surface-lowest": t(h, 14, 5), "surface-low": t(h, 14, 11),
        "surface-container": t(h, 13, 13), "surface-high": t(h, 12, 17), "surface-highest": t(h, 11, 21),
        "on-surface": t(h, 14, 91), "on-surface-variant": t(h, 12, 74), outline: t(h, 8, 55), "outline-variant": t(h, 10, 28),
        error: t(5, 100, 80), "error-container": t(2, 70, 28), "on-error-container": t(5, 100, 90),
        "inverse-surface": t(h, 14, 90), "inverse-on-surface": t(h, 14, 18),
      }
    : {
        primary: t(h, 58, 47), "on-primary": "#fff", "primary-container": t(h, 92, 90), "on-primary-container": t(h, 75, 17),
        secondary: t(h, 24, 40), "secondary-container": t(h, 42, 89), "on-secondary-container": t(h, 40, 15),
        tertiary: t(h + 70, 50, 40), "tertiary-container": t(h + 70, 80, 88), "on-tertiary-container": t(h + 70, 70, 15),
        surface: t(h, 40, 98), "surface-dim": t(h, 22, 91), "surface-lowest": "#fff", "surface-low": t(h, 38, 96),
        "surface-container": t(h, 32, 94), "surface-high": t(h, 28, 92), "surface-highest": t(h, 24, 90),
        "on-surface": t(h, 18, 11), "on-surface-variant": t(h, 12, 31), outline: t(h, 8, 47), "outline-variant": t(h, 18, 80),
        error: t(2, 70, 42), "error-container": t(5, 100, 92), "on-error-container": t(2, 90, 15),
        "inverse-surface": t(h, 14, 19), "inverse-on-surface": t(h, 30, 95),
      };
  const root = document.documentElement;
  for (const k in v) root.style.setProperty(`--m-${k}`, v[k]);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = dark ? "dark" : "light";
}
