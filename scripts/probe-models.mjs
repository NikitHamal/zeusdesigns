// Live multi-turn health probe for the keyless OpenAI-compatible gateways.
// Run: node scripts/probe-models.mjs [gateway ...]   (needs network; sends no keys)
// Turn 1 plants a word, turn 2 asks for it back. A model passes only if it answers both turns and recalls the word.
// Use it before trusting a catalog change: dead models and context-less gateways show up as FAIL.
const GATEWAYS = {
  freellmhub: "https://bun008-freellmapi.hf.space/v1",
  aibridge: "https://w902287-ai-bridge.hf.space/v1",
  litellmhub: "https://alchoholpad-litellm.hf.space/v1",
  gemweb2api: "https://chenian233-gemini-web2api.hf.space/v1",
  hfrouter: "https://cgjgj-ollamahftraemonitor.hf.space/v1",
  vireonix: "https://vireonix.ai/v1",
  nimcloud: "https://garystu-openai-nim-proxy.hf.space/v1",
  colibriqwen: "https://kartik1302-qwen-3-6-35b-a3b.hf.space/v1",
  blockrun: { base: "https://blockrun.ai/api/v1", only: /^(nvidia|cohere|poolside)\// },
  kilo: { base: "https://api.kilo.ai/api/gateway", key: "anonymous", only: /free/ },
};
const SKIP = /embed|image|whisper|tts|guard|flux|rerank|video|audio|music|seedance|banana|para-/i;
const WORD = "PELICAN";

async function chat(base, key, model, messages) {
  const headers = { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify({ model, messages, max_tokens: 600 }), signal: AbortSignal.timeout(75000) });
    const j = await r.json().catch(() => ({}));
    const m = j.choices?.[0]?.message;
    return { ok: r.ok, status: r.status, ms: Date.now() - t0, text: (m?.content || m?.reasoning_content || JSON.stringify(j.error ?? j)).toString() };
  } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0, text: String(e.message ?? e) }; }
}

async function probe(g, base, key, model) {
  const sys = { role: "system", content: "You are terse." };
  const u1 = { role: "user", content: `Remember the word ${WORD}.` };
  const a = await chat(base, key, model, [sys, u1]);
  if (!a.ok) return { g, model, pass: false, why: `turn1 ${a.status} ${a.text.slice(0, 70)}`, ms: a.ms };
  const b = await chat(base, key, model, [sys, u1, { role: "assistant", content: a.text.slice(0, 400) || "Noted." }, { role: "user", content: "What word did I ask you to remember? One word." }]);
  const pass = b.ok && b.text.toUpperCase().includes(WORD);
  return { g, model, pass, why: pass ? "" : `turn2 ${b.status} ${b.text.slice(0, 70)}`, ms: a.ms + b.ms };
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const wanted = process.argv.slice(2);
const jobs = [];
for (const [g, cfg] of Object.entries(GATEWAYS)) {
  if (wanted.length && !wanted.includes(g)) continue;
  const { base, key, only } = typeof cfg === "string" ? { base: cfg } : cfg;
  const list = await fetch(`${base}/models`, { signal: AbortSignal.timeout(20000) }).then((r) => r.json()).catch(() => null);
  const ids = (list?.data ?? list ?? []).map((m) => m.id).filter((id) => id && !SKIP.test(id) && (!only || only.test(id)));
  if (!ids.length) console.log(`${g}: model list unavailable`);
  for (const id of ids) jobs.push({ g, base, key, id });
}
const res = await pool(jobs, 8, (j) => probe(j.g, j.base, j.key, j.id));
for (const r of res) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.g.padEnd(11)} ${r.model.padEnd(46)} ${String(r.ms).padStart(6)}ms  ${r.why}`);
const bad = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - bad}/${res.length} models passed a two-turn recall`);
