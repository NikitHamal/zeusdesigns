// Stamps the release version (e.g. 0.1.42) into package.json, tauri.conf.json and Cargo.toml.
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) { console.error("usage: node scripts/stamp-version.mjs 0.1.N"); process.exit(1); }

for (const f of ["package.json", "src-tauri/tauri.conf.json"]) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.version = v;
  writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
}
const toml = readFileSync("src-tauri/Cargo.toml", "utf8").replace(/^version = ".*"$/m, `version = "${v}"`);
writeFileSync("src-tauri/Cargo.toml", toml);
console.log("stamped", v);
