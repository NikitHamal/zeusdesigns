import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const providersTs = fs.readFileSync(path.join(root, "src/lib/providers.ts"), "utf8");
const browserProvidersTs = fs.readFileSync(path.join(root, "src/lib/browserProviders.ts"), "utf8");
const providersCat1Rs = fs.readFileSync(path.join(root, "src-tauri/src/providers_cat_1.rs"), "utf8");
const providersDirectRs = fs.readFileSync(path.join(root, "src-tauri/src/providers_direct.rs"), "utf8");
const providersOaiBRs = fs.readFileSync(path.join(root, "src-tauri/src/providers_oai_b.rs"), "utf8");
const providersFingerprintRs = fs.readFileSync(path.join(root, "src-tauri/src/providers_fingerprint.rs"), "utf8");
const serverModelsRs = fs.readFileSync(path.join(root, "src-tauri/src/server_models.rs"), "utf8");
const zeusEngineCpp = fs.readFileSync(path.join(root, "engine/zeus_engine.cpp"), "utf8");
const providersHpp = fs.readFileSync(path.join(root, "include/zeus/providers.hpp"), "utf8");

const EXPECTED = [
  {
    id: "pouluogemini",
    endpoint: "https://pouluo-gemini-web2api.hf.space/v1/chat/completions",
    models: [
      "gemini-3.5-flash",
      "gemini-3.5-flash-thinking",
      "gemini-3.1-pro",
      "gemini-3.5-flash-thinking-lite",
      "gemini-flash-lite",
    ],
  },
  {
    id: "peijungemini",
    endpoint: "https://peijun1-gemini-web2api.hf.space/v1/chat/completions",
    models: [
      "gemini-3.5-flash",
      "gemini-3.5-flash-thinking",
      "gemini-3.1-pro",
      "gemini-3.5-flash-thinking-lite",
      "gemini-flash-lite",
    ],
  },
  {
    id: "zunkogemma4",
    endpoint: "https://zunko2-gemma4-e4b-ablitereted-server.hf.space/v1/chat/completions",
    models: ["gemma4-e4b"],
  },
  {
    id: "tomgemma4q5",
    endpoint: "https://tom199328-gemma-4-e2b-it-gguf-ud-q5-k-xl.hf.space/v1/chat/completions",
    models: ["gemma-4-E2B-it-UD-Q5_K_XL.gguf"],
  },
  {
    id: "amansonillama",
    endpoint: "https://amansoni7477030-ollama-server.hf.space/v1/chat/completions",
    models: ["llama:latest"],
  },
];

for (const p of EXPECTED) {
  assert.ok(providersTs.includes(`id: "${p.id}"`), `providers.ts missing ${p.id}`);
  assert.ok(browserProvidersTs.includes(`${p.id}:`), `browserProviders.ts missing ${p.id}`);
  assert.ok(providersCat1Rs.includes(`id: "${p.id}".to_string()`), `providers_cat_1.rs missing ${p.id}`);
  assert.ok(providersFingerprintRs.includes(`"${p.id}" =>`), `providers_fingerprint.rs missing ${p.id}`);
  assert.ok(serverModelsRs.includes(`"${p.id}"`), `server_models.rs missing ${p.id}`);
  assert.ok(zeusEngineCpp.includes(`"${p.id}"`), `zeus_engine.cpp missing ${p.id}`);
  assert.ok(
    providersDirectRs.includes(p.endpoint) || providersOaiBRs.includes(p.endpoint),
    `Rust streamer missing endpoint ${p.endpoint}`
  );
  for (const m of p.models) {
    assert.ok(providersTs.includes(`"${m}"`), `providers.ts missing model ${m} on ${p.id}`);
    assert.ok(providersCat1Rs.includes(`"${m}"`), `providers_cat_1.rs missing model ${m} on ${p.id}`);
    assert.ok(zeusEngineCpp.includes(`"${m}"`), `zeus_engine.cpp missing model ${m} on ${p.id}`);
  }
}

assert.ok(providersHpp.includes("SCRAPER_POULUOGEMINI"), "providers.hpp missing SCRAPER_POULUOGEMINI");
assert.ok(providersHpp.includes("SCRAPER_AMANSONILLAMA"), "providers.hpp missing SCRAPER_AMANSONILLAMA");
console.log("[PASS] All 5 Session 33 keyless providers and verbatim model IDs verified across TS, Rust, and C++20.");
