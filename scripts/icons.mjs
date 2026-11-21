// Rebuilds the Material Symbols Rounded subset font from the icon names used in src/.
// Usage: node scripts/icons.mjs   (needs network; commit the resulting woff2)
// Icons are referenced as <Icon name="add" /> or in data as icon: "add" / icon="add".
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const names = new Set();
for (const f of walk("src").filter((f) => /\.(tsx?|css)$/.test(f))) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/(?:<Icon\s+name\s*=|\bicon[A-Za-z]*\s*[:=]|\bic\()\s*[{(]?\s*["']([a-z0-9_]+)["']/g)) names.add(m[1]);
  for (const m of s.matchAll(/\/\*\s*icons:\s*([a-z0-9_,\s]+)\*\//g)) m[1].split(/[,\s]+/).filter(Boolean).forEach((n) => names.add(n));
}
const list = [...names].sort();
console.log(list.length, "icons");
const css = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,300..500,0..1,0&icon_names=${list.join(",")}&display=block`;
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const text = await (await fetch(css, { headers: { "User-Agent": ua } })).text();
const url = /url\((https:[^)]+)\)/.exec(text)?.[1];
if (!url) throw new Error("font url not found:\n" + text.slice(0, 400));
writeFileSync("src/assets/fonts/material-symbols-rounded.woff2", Buffer.from(await (await fetch(url)).arrayBuffer()));
console.log("wrote src/assets/fonts/material-symbols-rounded.woff2");
