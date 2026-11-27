#!/usr/bin/env node
// Unit tests for the Zeus Sovereign Harness pure core (src/lib/sovereign/*).
// Zero extra dependencies: esbuild ships with Vite, tests use node:test.
//   node scripts/test-sovereign.mjs

import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const dir = path.join(root, "src/lib/sovereign");
const entry = [
  "fsm", "patch", "guard", "vfs", "diff", "skills", "prompt", "sanitizer", "resolver", "bridgeScript", "runtime", "events",
]
  .map((m) => `export * as ${m} from ${JSON.stringify(path.join(dir, m + ".ts"))};`)
  .concat(`export * as streamParser from ${JSON.stringify(path.join(root, "src/lib/streamParser.ts"))};`)
  .join("\n");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zeus-sov-")), "bundle.mjs");
await build({ stdin: { contents: entry, resolveDir: root, loader: "ts" }, bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
const M = await import(pathToFileURL(out).href);
const { streamParser, fsm, patch, guard, vfs, skills, prompt, sanitizer, resolver, bridgeScript, runtime, events, diff } = M;

/* ---------------------------------------------------------------- FSM */
const PROTOCOL = [
  "Here is the plan.\n",
  "<zeus_plan>\nIntent: pricing page\nDirection: editorial\n</zeus_plan>\n",
  "<zeus_artifact>\n",
  '<zeus_action type="file" path="Pricing" device="web">\n<!doctype html><html><body><div class="a">1 < 2 && "x"</div></body></html>\n</zeus_action>\n',
  '<zeus_action type="patch" path="Home">\n<<<<<<< SEARCH\n<h1>Old</h1>\n=======\n<h1>New</h1>\n>>>>>>> REPLACE\n</zeus_action>\n',
  "</zeus_artifact>\nDone.",
].join("");

test("fsm: one-shot parse extracts plan, files and patches", () => {
  const f = fsm.parseZeusStream(PROTOCOL);
  assert.equal(f.plan.includes("Intent: pricing page"), true);
  assert.equal(f.actions.length, 2);
  assert.equal(f.actions[0].kind, "file");
  assert.equal(f.actions[0].path, "Pricing");
  assert.ok(f.actions[0].content.includes('1 < 2 && "x"'));
  assert.equal(f.actions[1].kind, "patch");
  assert.ok(f.text.includes("Here is the plan."));
  assert.ok(f.text.includes("Done."));
  assert.equal(f.actions.every((a) => a.closed), true);
});

test("fsm: any chunking produces identical results (1-char, 3-char, 7-char)", () => {
  const ref = JSON.stringify(fsm.parseZeusStream(PROTOCOL));
  for (const size of [1, 3, 7, 19]) {
    const p = new fsm.ZeusStreamParser();
    const ev = [];
    for (let i = 0; i < PROTOCOL.length; i += size) ev.push(...p.push(PROTOCOL.slice(i, i + size)));
    ev.push(...p.end());
    assert.equal(JSON.stringify(fsm.foldEvents(ev)), ref, `chunk size ${size}`);
  }
});

test("fsm: tags inside markdown fences and inline code are inert", () => {
  const txt = 'Use `<zeus_action type="file">` like so:\n```xml\n<zeus_plan>\nx\n</zeus_plan>\n<zeus_tool name="y"/>\n```\nthanks';
  const f = fsm.parseZeusStream(txt);
  assert.equal(f.actions.length, 0);
  assert.equal(f.planSeen, false);
  assert.ok(f.text.includes("thanks"));
  assert.equal(f.fences.length, 1);
});

test("fsm: fences nested inside an action body are content", () => {
  const txt = '<zeus_action type="file" path="doc">\n```html\n<div>```not a close```</div>\n```\n</zeus_action>';
  const f = fsm.parseZeusStream(txt);
  assert.equal(f.actions.length, 1);
  assert.ok(f.actions[0].content.includes("<div>```not a close```</div>"));
});

test("fsm: partial tag at end of stream is flushed as text, never lost", () => {
  const p = new fsm.ZeusStreamParser();
  const a = p.push("hello <zeus_ac");
  assert.equal(a.map((e) => (e.type === "text" ? e.delta : "")).join(""), "hello ");
  const b = p.end();
  assert.equal(b.map((e) => (e.type === "text" ? e.delta : "")).join(""), "<zeus_ac");
});

test("fsm: unclosed action reports closed=false and keeps content", () => {
  const f = fsm.parseZeusStream('<zeus_action type="file" path="x"><div>half');
  assert.equal(f.actions[0].closed, false);
  assert.equal(f.actions[0].content, "<div>half");
});

test("fsm: file action containing SEARCH/REPLACE is reclassified as patch", () => {
  const f = fsm.parseZeusStream('<zeus_action type="file" path="x">\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n</zeus_action>');
  assert.equal(f.actions[0].kind, "patch");
});

test("fsm: protocol wrapped in a code fence is re-parsed", () => {
  const f = fsm.parseZeusStream('```xml\n<zeus_action type="file" path="w"><p>x</p></zeus_action>\n```');
  assert.equal(f.actions.length, 1);
  assert.equal(f.actions[0].path, "w");
});

test("fsm: legacy <artboard> alias maps mode=patch to patch actions", () => {
  const f = fsm.parseZeusStream('<artboard id="a1" name="Home" mode="patch">\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE\n</artboard>', { artboardAlias: true });
  assert.equal(f.actions[0].kind, "patch");
  assert.equal(f.actions[0].path, "Home");
});

test("fsm: implicit closes (missing </zeus_plan>, missing </zeus_action>)", () => {
  const f = fsm.parseZeusStream('<zeus_plan>Intent: x\n<zeus_action type="file" path="a">A<zeus_action type="file" path="b">B</zeus_action>');
  assert.equal(f.actions.length, 2);
  assert.equal(f.actions[0].content, "A");
  assert.equal(f.actions[1].content, "B");
  assert.equal(f.planOpen, false);
});

test("fsm: markdown-only output falls back to fenced documents", () => {
  const f = fsm.parseZeusStream("Sure!\n```html\n<!doctype html><html><body><div>hi</div></body></html>\n```\n");
  const fb = fsm.fallbackFiles(f);
  assert.equal(fb.length, 1);
  assert.ok(fb[0].content.startsWith("<!doctype html>"));
  assert.equal(fb[0].attrs.fallback, "true");
  // prose-only code fences are not mistaken for files
  assert.equal(fsm.fallbackFiles(fsm.parseZeusStream("```js\nconsole.log(1)\n```")).length, 0);
});

test("fsm: session feeds only the new suffix and resets on divergence", () => {
  const s = new fsm.ZeusStreamSession();
  const r1 = s.update("<zeus_plan>Inte");
  assert.equal(r1.reset, false);
  const r2 = s.update("<zeus_plan>Intent</zeus_plan>");
  assert.ok(r2.events.some((e) => e.type === "plan:end"));
  const r3 = s.update("totally different");
  assert.equal(r3.reset, true);
});

test("fsm: zeusToArtboards converts the protocol and is a no-op without tags", () => {
  const c = fsm.zeusToArtboards(PROTOCOL);
  assert.equal(c.engaged, true);
  assert.ok(c.plan.startsWith("Intent: pricing page"));
  assert.ok(c.text.includes('<artboard name="Pricing" device="web" mode="new">'));
  assert.ok(c.text.includes('<artboard name="Home" mode="patch">'));
  assert.ok(!c.text.includes("zeus_"));
  const plain = "<artboard name=\"x\" mode=\"new\">hi</artboard>";
  const r = fsm.zeusToArtboards(plain);
  assert.equal(r.engaged, false);
  assert.equal(r.text, plain);
});

test("fsm: parser never throws on hostile input", () => {
  const junk = ["<", "<<<<", "`", "```", "<zeus_action", '<zeus_action type="', "</zeus_action>", "<zeus_plan><zeus_plan>", "\u0000\ud800", "```\n```\n```"];
  for (let i = 0; i < 200; i++) {
    const p = new fsm.ZeusStreamParser({ artboardAlias: i % 2 === 0 });
    for (let k = 0; k < 12; k++) p.push(junk[(i * 7 + k * 3) % junk.length]);
    p.end();
  }
});

/* ---------------------------------------------------------------- parseStream integration */
test("parseStream: structured protocol flows through the legacy block pipeline", () => {
  const full = PROTOCOL;
  const r = streamParser.parseStream(full);
  assert.equal(r.blocks.length, 2);
  assert.equal(r.blocks[0].attrs.name, "Pricing");
  assert.equal(r.blocks[0].attrs.mode, "new");
  assert.equal(r.blocks[0].closed, true);
  assert.equal(r.blocks[1].attrs.mode, "patch");
  assert.ok(r.blocks[1].html.includes("<<<<<<< SEARCH"));
  assert.ok(r.reasoning.includes("Intent: pricing page"), "plan surfaces as reasoning");
  assert.ok(!r.text.includes("zeus_") && !r.text.includes("Intent:"), "no protocol leakage into chat text");
  assert.ok(r.text.includes("Here is the plan.") && r.text.includes("Done."));
});

test("parseStream: partially streamed patch and file blocks stay unclosed and never leak raw tags", () => {
  const cut = PROTOCOL.indexOf("<<<<<<< SEARCH") + 20;
  const r = streamParser.parseStream(PROTOCOL.slice(0, cut));
  const patchBlock = r.blocks.find((b) => b.attrs.mode === "patch");
  assert.ok(patchBlock && patchBlock.closed === false);
  assert.ok(!r.text.includes("<artboard") && !r.text.includes("zeus_action"));
  // every prefix of the stream parses without throwing
  for (let i = 0; i < PROTOCOL.length; i += 5) streamParser.parseStream(PROTOCOL.slice(0, i));
});

test("parseStream: legacy <artboard> output is untouched (backward compatible)", () => {
  const legacy = 'Sure.\n<artboard name="Home" device="web" mode="new">\n<!doctype html><html><body><div>hi</div></body></html>\n</artboard>';
  const r = streamParser.parseStream(legacy);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].attrs.name, "Home");
  assert.equal(r.text, "Sure.");
  assert.equal(r.reasoning, "");
});

test("parseStream: raw <artboard mode=\"patch\"> is accepted without the structured wrapper", () => {
  const raw = '<artboard id="x1" name="Home" mode="patch">\n<<<<<<< SEARCH\n<h1>a</h1>\n=======\n<h1>b</h1>\n>>>>>>> REPLACE\n</artboard>';
  const r = streamParser.parseStream(raw);
  assert.equal(r.blocks[0].attrs.mode, "patch");
  assert.equal(r.blocks[0].attrs.id, "x1");
  assert.equal(patch.applyPatchBlocks("<h1>a</h1>", r.blocks[0].html).content, "<h1>b</h1>");
});

/* ---------------------------------------------------------------- patch */
const DOC = ["<section>", "  <h1>Pricing</h1>", "  <button class=\"btn\">Buy</button>", "</section>"].join("\n");

test("patch: exact match", () => {
  const r = patch.applyPatchBlocks(DOC, "<<<<<<< SEARCH\n  <h1>Pricing</h1>\n=======\n  <h1>Plans</h1>\n>>>>>>> REPLACE");
  assert.equal(r.applied, 1);
  assert.deepEqual(r.strategies, ["exact"]);
  assert.ok(r.content.includes("<h1>Plans</h1>"));
});

test("patch: whitespace-tolerant match re-indents the replacement", () => {
  const r = patch.applyPatchBlocks(DOC, '<<<<<<< SEARCH\n<button   class="btn">Buy</button>\n=======\n<button class="btn primary">Buy now</button>\n>>>>>>> REPLACE');
  assert.equal(r.applied, 1);
  assert.deepEqual(r.strategies, ["line-fuzzy"]);
  assert.ok(r.content.includes('  <button class="btn primary">Buy now</button>'));
  assert.ok(r.content.includes("<h1>Pricing</h1>"));
});

test("patch: regex-ws matches a fragment of a minified line", () => {
  const src = '<div><span class="a">One</span><span class="b">Two</span></div>';
  const r = patch.applyPatchBlocks(src, '<<<<<<< SEARCH\n<span class="b">Two</span>\n=======\n<span class="b">Deux</span>\n>>>>>>> REPLACE');
  assert.equal(r.applied, 1);
  assert.equal(r.content, '<div><span class="a">One</span><span class="b">Deux</span></div>');
});

test("patch: anchor strategy survives a reworded middle line", () => {
  const src = ["<ul>", "  <li>Alpha</li>", "  <li>Beta</li>", "  <li>Gamma</li>", "  <li>Delta</li>", "</ul>"].join("\n");
  const body = "<<<<<<< SEARCH\n<ul>\n<li>Alpha</li>\n<li>Beta!!</li>\n<li>Gamma</li>\n<li>Delta</li>\n</ul>\n=======\n<ol>\n<li>One</li>\n</ol>\n>>>>>>> REPLACE";
  const r = patch.applyPatchBlocks(src, body);
  assert.equal(r.applied, 1);
  assert.deepEqual(r.strategies, ["anchor"]);
  assert.ok(r.content.startsWith("<ol>"));
});

test("patch: a missing SEARCH is reported and never corrupts the file", () => {
  const r = patch.applyPatchBlocks(DOC, "<<<<<<< SEARCH\n<footer>nope</footer>\n=======\n<footer>x</footer>\n>>>>>>> REPLACE");
  assert.equal(r.applied, 0);
  assert.equal(r.failed.length, 1);
  assert.equal(r.content, DOC);
  assert.equal(r.changed, false);
});

test("patch: multiple blocks, partial success, empty SEARCH appends before </body>", () => {
  const src = "<body>\n<p>a</p>\n</body>";
  const body = [
    "<<<<<<< SEARCH\n<p>a</p>\n=======\n<p>b</p>\n>>>>>>> REPLACE",
    "<<<<<<< SEARCH\n<p>zzz</p>\n=======\n<p>q</p>\n>>>>>>> REPLACE",
    "<<<<<<< SEARCH\n=======\n<footer>f</footer>\n>>>>>>> REPLACE",
  ].join("\n");
  const r = patch.applyPatchBlocks(src, body);
  assert.equal(r.applied, 2);
  assert.equal(r.failed.length, 1);
  assert.ok(r.content.includes("<p>b</p>"));
  assert.ok(r.content.indexOf("<footer>f</footer>") < r.content.indexOf("</body>"));
});

test("patch: empty REPLACE deletes; incomplete trailing block is flagged", () => {
  const r = patch.applyPatchBlocks("a\nb\nc", "<<<<<<< SEARCH\nb\n=======\n>>>>>>> REPLACE");
  assert.equal(r.content, "a\n\nc");
  assert.equal(patch.parsePatchBlocks("<<<<<<< SEARCH\nx\n=======\ny").incomplete, true);
});

test("patch: tolerates CRLF and 7-9 marker variants", () => {
  const r = patch.applyPatchBlocks("one\r\ntwo", "<<<<<<<< SEARCH\r\ntwo\r\n========\r\nTWO\r\n>>>>>>>>> REPLACE\r\n");
  assert.equal(r.applied, 1);
});

/* ---------------------------------------------------------------- guard */
test("guard: lazy marker detection has no false positives on real comments", () => {
  assert.equal(guard.isLazyLine("<!-- ... rest of the page unchanged -->"), true);
  assert.equal(guard.isLazyLine("  /* existing code */"), true);
  assert.equal(guard.isLazyLine("  // ... rest of code"), true);
  assert.equal(guard.isLazyLine("// ..."), true);
  assert.equal(guard.isLazyLine("<!-- Hero section -->"), false);
  assert.equal(guard.isLazyLine("// compute the total price"), false);
  assert.equal(guard.isLazyLine("/* existing code unchanged */"), true);
});

test("guard: merges original lines back in place of lazy markers", () => {
  const prev = ["<body>", "<header>H</header>", "<main>", "<p>one</p>", "<p>two</p>", "<p>three</p>", "</main>", "<footer>F</footer>", "</body>"].join("\n");
  const next = ["<body>", "<header>H2</header>", "<main>", "<!-- ... rest of main unchanged -->", "</main>", "<footer>F</footer>", "</body>"].join("\n");
  const r = guard.guardFullWrite(prev, next);
  assert.equal(r.status, "merged");
  assert.ok(r.html.includes("<header>H2</header>"));
  assert.ok(r.html.includes("<p>one</p>") && r.html.includes("<p>three</p>"));
  assert.ok(!r.html.includes("rest of main unchanged"));
});

test("guard: marker at end of file restores the tail", () => {
  const prev = "a\nb\nc\nd";
  const r = guard.mergeLazyBlocks(prev, "a\nb\n// ... rest of code");
  assert.equal(r.content, "a\nb\nc\nd");
  assert.equal(r.merged, 1);
});

test("guard: unresolved markers plus heavy shrink is rejected, last good content is kept", () => {
  const prev = "x\n".repeat(400);
  const r = guard.guardFullWrite(prev, "totally new\n// ... rest of code\n");
  assert.equal(r.status, "rejected");
  assert.equal(r.html, prev);
});

test("guard: a normal full rewrite passes through untouched", () => {
  const r = guard.guardFullWrite("<p>a</p>", "<p>b</p>");
  assert.deepEqual(r, { html: "<p>b</p>", status: "ok", reasons: [] });
});

/* ---------------------------------------------------------------- vfs */
test("vfs: commit, undo, redo and no-op commits", () => {
  const v = new vfs.Vfs();
  const s1 = v.commit("one", { "a.html": "A1", "b.html": "B1" }, "generation");
  const s2 = v.commit("two", { "a.html": "A2" }, "patch");
  assert.equal(v.commit("noop", { "a.html": "A2" }).id, s2.id);
  assert.equal(v.size, 2);
  assert.equal(v.read("a.html"), "A2");
  assert.equal(v.read("b.html"), "B1");
  assert.equal(v.undo().id, s1.id);
  assert.equal(v.read("a.html"), "A1");
  assert.equal(v.canRedo, true);
  assert.equal(v.redo().id, s2.id);
  assert.equal(v.canRedo, false);
  assert.equal(v.undo() && v.undo(), null);
});

test("vfs: committing after undo branches without losing history; checkout rebuilds redo", () => {
  const v = new vfs.Vfs();
  const a = v.commit("a", { f: "1" });
  const b = v.commit("b", { f: "2" });
  v.undo();
  const c = v.commit("c", { f: "3" });
  assert.equal(c.parent, a.id);
  assert.ok(v.get(b.id), "abandoned branch still exists");
  assert.equal(v.canRedo, false);
  v.checkout(a.id);
  assert.equal(v.redo().id, c.id);
});

test("vfs: structural sharing, deletes and file diffs", () => {
  const v = new vfs.Vfs();
  const big = "x".repeat(10000);
  const s1 = v.commit("one", { "a": big, "b": "b1" });
  const s2 = v.commit("two", { "b": "b2", "c": "new" });
  assert.equal(s1.files.a, s2.files.a);
  assert.strictEqual(Object.isFrozen(s2.files), true);
  v.commit("three", { "c": null });
  assert.equal(v.read("c"), undefined);
  const d = v.diff(s1.id, s2.id);
  assert.deepEqual(d.map((x) => [x.path, x.status]), [["a", "unchanged"], ["b", "modified"], ["c", "added"]]);
});

test("vfs: prunes to maxSnapshots and survives a JSON round trip", () => {
  const v = new vfs.Vfs(5);
  for (let i = 0; i < 12; i++) v.commit("s" + i, { f: "v" + i });
  assert.ok(v.size <= 5);
  assert.equal(v.read("f"), "v11");
  v.meta.paths = { b1: "screens/home.html" };
  const clone = vfs.Vfs.fromJSON(JSON.parse(JSON.stringify(v.toJSON())));
  assert.equal(clone.read("f"), "v11");
  assert.deepEqual(clone.meta.paths, { b1: "screens/home.html" });
  assert.equal(clone.canUndo, true);
});

test("vfs: outline summaries are compact and informative", () => {
  const html = "<html><head><title>Atlas</title></head><body><main><h1>Fleet overview</h1><section id=\"kpis\"></section></main><script>1</script></body></html>";
  const o = vfs.outlineFile("screens/atlas.html", html);
  assert.ok(o.includes("title: Atlas") && o.includes("Fleet overview") && o.includes("#kpis") && o.includes("1 script"));
  assert.ok(o.length < 300);
});

test("diff: line diff is minimal for a single edited line", () => {
  const s = diff.diffStat("a\nb\nc", "a\nB\nc");
  assert.deepEqual(s, { added: 1, removed: 1 });
  assert.ok(diff.renderUnified(diff.diffLines("a\nb\nc", "a\nB\nc")).includes("-b"));
});

/* ---------------------------------------------------------------- skills + prompt */
const base = { userText: "", hasBoards: false, hasTarget: false, hasSelectedElement: false, hasRuntimeError: false, isFollowUp: false };
const ids = (c) => skills.routeSkills({ ...base, ...c }).map((s) => s.id);

test("skills: router picks the minimum useful set", () => {
  assert.deepEqual(ids({ userText: "design a landing page for a coffee roaster" }), ["ui-craft-excellence"]);
  assert.ok(ids({ userText: "build an analytics dashboard with filters" }).includes("interactive-prototyping"));
  assert.ok(ids({ userText: "add a custom logo and sparkline chart" }).includes("svg-and-visual-assets"));
  const edit = ids({ userText: "make the hero button green", hasBoards: true, hasTarget: true, isFollowUp: true });
  assert.deepEqual(edit, ["surgical-refactoring"]);
  assert.ok(ids({ userText: "make it glassmorphic", hasBoards: true, hasSelectedElement: true, isFollowUp: true }).includes("surgical-refactoring"));
});

test("skills: runtime-self-healer takes over on errors and excludes aesthetics", () => {
  const r = ids({ userText: "Fix the runtime error", hasBoards: true, hasTarget: true, hasRuntimeError: true, healing: true, isFollowUp: true });
  assert.equal(r[0], "runtime-self-healer");
  assert.ok(!r.includes("ui-craft-excellence"));
  assert.ok(ids({ userText: "it is broken, fix it", hasBoards: true, hasRuntimeError: true, isFollowUp: true }).includes("runtime-self-healer"));
  assert.ok(!ids({ userText: "it is broken, fix it", hasBoards: true, isFollowUp: true }).includes("runtime-self-healer"));
});

test("prompt: compiled prompt carries protocol + skills and obeys the Zeus laws", () => {
  const c = prompt.compileSovereignPrompt({ ...base, userText: "design a pricing page with a toggle", boardNames: [] });
  assert.ok(c.text.includes("<zeus_plan>") && c.text.includes("SEARCH") && c.text.includes("NEVER TRUNCATE"));
  assert.ok(c.text.includes("skill:ui-craft-excellence"));
  const all = Object.values(skills.SKILL_LIBRARY).map((s) => s.prompt).join("\n") + prompt.PROTOCOL_PROMPT;
  assert.equal(/\p{Extended_Pictographic}/u.test(all), false, "no emojis in prompts");
  assert.equal(/cdn|unpkg|googleapis/i.test(all.replace(/no (?:external images, )?cdns?/gi, "")), false);
});

test("prompt: compaction replaces stale dumps and keeps the live turn intact", () => {
  const dump = '<artboard id="a" name="Home" device="web" mode="revise">\n' + "<div>x</div>\n".repeat(400) + "</artboard>";
  const msgs = [
    { role: "user", content: "design home" },
    { role: "assistant", content: "done\n" + dump },
    { role: "user", content: "make it darker" },
    { role: "assistant", content: "ok\n" + dump },
    { role: "user", content: "bigger title <canvas_state>BIG</canvas_state>" },
  ];
  const out = prompt.compactHistory(msgs, { authoritativeState: true });
  assert.ok(out[1].content.length < 200 && out[3].content.length < 200);
  assert.equal(out[4].content, msgs[4].content);
  assert.equal(msgs[1].content.includes("<div>x</div>"), true, "input not mutated");
});

test("prompt: long histories collapse into a summary on the first retained user turn", () => {
  const msgs = [];
  for (let i = 0; i < 20; i++) msgs.push({ role: i % 2 ? "assistant" : "user", content: i % 2 ? "reply " + i : "ask number " + i });
  msgs.push({ role: "user", content: "final" });
  const out = prompt.compactHistory(msgs, { authoritativeState: false, keepRecent: 4 });
  assert.ok(out.length < msgs.length);
  assert.equal(out[0].role, "user");
  assert.ok(out[0].content.includes("Earlier in this conversation"));
  assert.equal(out[out.length - 1].content, "final");
});

test("prompt: canvas state sends full active screens and one-line summaries for the rest", () => {
  const boards = [
    { id: "a", name: "Home", device: "web", version: 2, html: "<html><title>Home</title><body>" + "z".repeat(100) + "</body></html>" },
    { id: "b", name: "Pricing", device: "web", version: 1, html: "<html><title>Pricing</title><body><h1>Plans</h1></body></html>" },
  ];
  const active = prompt.selectActiveBoards("make the pricing table denser", boards, {});
  assert.deepEqual(active, ["b"]);
  const s = prompt.compactCanvasState(boards, { activeIds: active, maxChars: 5000, strip: (h) => h });
  assert.ok(s.includes('name="Pricing" device="web" version="1" state="full"'));
  assert.ok(s.includes('state="summary"'));
  assert.ok(!s.includes("z".repeat(100)));
  assert.deepEqual(prompt.selectActiveBoards("update all screens", boards), ["a", "b"]);
});

test("prompt: workspace state attaches the selected element and runtime telemetry", () => {
  const st = prompt.assembleWorkspaceState({
    head: { id: "s3", label: "Design: pricing", seq: 3 },
    selectedElement: { boardId: "a", tag: "div", component: "PricingCard", id: "", classes: ["z-card"], text: "Pro plan", styles: { padding: "16px" }, domPath: "body > main > div:nth-of-type(2)", sourceLocator: "", outerHtml: "<div class=\"z-card\">Pro plan</div>", rect: { x: 1, y: 2, w: 300, h: 200 }, at: 1 },
    errors: [{ kind: "runtime", message: "x is not defined", line: 12, column: 3, fatal: true, at: 1 }],
  });
  assert.ok(st.includes("component: PricingCard") && st.includes("dom_path: body > main > div:nth-of-type(2)"));
  assert.ok(st.includes("[runtime, fatal] x is not defined at line 12:3"));
  assert.equal(prompt.assembleWorkspaceState({}), "");
});

/* ---------------------------------------------------------------- sanitizer + resolver + runtime */
test("sanitizer: partial documents never expose half-written constructs", () => {
  assert.equal(sanitizer.sanitizePartialHtml("<div>ok</div><di"), "<div>ok</div>");
  assert.equal(sanitizer.sanitizePartialHtml("<p>a</p><script>let x = 1;"), "<p>a</p>");
  assert.equal(sanitizer.sanitizePartialHtml("<p>a</p><!-- half"), "<p>a</p>");
  const css = sanitizer.sanitizePartialHtml("<style>.a{color:red}.b{margin:0;pad");
  assert.ok(css.includes(".a{color:red}") && !css.includes(".b") && css.endsWith("</style>"));
  const complete = "<p>a</p><script>let x = 1;</script>";
  assert.equal(sanitizer.sanitizePartialHtml(complete), complete);
});

test("sanitizer: validateDocument catches inline script syntax errors and unterminated scripts", () => {
  const bad = sanitizer.validateDocument("<html><body><script>function(</script></body></html>");
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].kind, "compile");
  assert.ok(bad.errors[0].message.includes("SyntaxError"));
  assert.equal(sanitizer.validateDocument("<html><body><script>var a = 1; a.b(").ok, false);
  const good = sanitizer.validateDocument("<!doctype html><html><body><script>var a = [1,2].map(x => x * 2);</script><script type=\"module\">import x from 'y'</script></body></html>");
  assert.equal(good.ok, true);
  assert.ok(sanitizer.validateDocument("<div><div><div><span></span>").warnings.length > 0);
});

test("resolver: detects bare imports and builds a pinned import map", () => {
  const code = `import { motion } from "framer-motion";\nimport { Search } from 'lucide-react';\nimport x from "./local.js";\nimport("three");\nimport "https://cdn/x.js";`;
  assert.deepEqual(resolver.extractBareImports(code).sort(), ["framer-motion", "lucide-react", "three"]);
  const html = `<html><head></head><body><script type="module">${code}</script></body></html>`;
  const { map, packages } = resolver.buildImportMap(html);
  assert.ok(map.imports["lucide-react"].startsWith("https://esm.sh/lucide-react@"));
  assert.ok(map.imports["lucide-react"].includes("external=react,react-dom"));
  assert.ok(map.imports.react && map.imports["react-dom/client"]);
  assert.equal(packages.every((p) => p.known), true);
  assert.equal(resolver.resolveSpecifier("@radix-ui/react-dialog").known, true);
  assert.equal(resolver.resolveSpecifier("some-unknown-pkg").known, false);
  assert.equal(resolver.packageName("@radix-ui/react-tabs/dist/x"), "@radix-ui/react-tabs");
  assert.equal(resolver.buildImportMap("<html><body><p>no modules</p></body></html>").map, null);
  assert.equal(resolver.buildImportMap(`<script type="importmap">{}</script>${html}`).map, null);
});

test("runtime: bridge is syntactically valid ES5-style JS, escapes the board id, and is injected first in <head>", () => {
  const tag = bridgeScript.buildSandboxBridge({ boardId: 'a"</script><b', inspect: true });
  assert.ok(!tag.slice(8, -9).includes("</script"), "no premature script close");
  const body = tag.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  assert.doesNotThrow(() => new Function(body));
  assert.ok(!body.includes("`") && !body.includes("=>"), "ES5 only");
  const doc = runtime.prepareSandboxDocument('<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">import c from "clsx"</script></body></html>', { boardId: "b1" });
  assert.ok(doc.indexOf('type="importmap"') < doc.indexOf('data-zeus-edit="bridge"'));
  assert.ok(doc.indexOf('data-zeus-edit="bridge"') < doc.indexOf('<meta charset'));
  assert.equal(runtime.prepareSandboxDocument(doc, { boardId: "b1" }), doc, "idempotent");
  assert.equal(runtime.stripSandboxArtifacts(doc).includes("data-zeus-edit"), false);
});

test("runtime: bridge reports errors, ready, and element selection in a simulated sandbox", () => {
  const posted = [];
  const listeners = {};
  const docListeners = {};
  const fakeEl = {
    nodeType: 1, tagName: "BUTTON", id: "buy", className: "z-btn tonal", textContent: " Buy now ", parentElement: null, children: [],
    outerHTML: '<button id="buy" class="z-btn tonal">Buy now</button>', closest: () => null,
    getBoundingClientRect: () => ({ left: 4, top: 8, width: 120, height: 40, right: 124, bottom: 48 }),
  };
  const bodyEl = { nodeType: 1, tagName: "BODY", appendChild() {}, children: [fakeEl] };
  fakeEl.parentElement = bodyEl;
  const doc = {
    readyState: "loading", body: bodyEl, documentElement: { style: {}, nodeType: 1 },
    addEventListener: (t, f) => (docListeners[t] = f), createElement: () => ({ style: {}, setAttribute() {} }),
  };
  const win = {
    addEventListener: (t, f) => (listeners[t] = f), innerWidth: 800,
    parent: { postMessage: (m) => posted.push(m) },
  };
  const cons = { error() {}, warn() {} };
  const fn = new Function("window", "document", "console", "parent", "getComputedStyle", "setTimeout", "Date",
    bridgeScript.buildSandboxBridge({ boardId: "bx" }).replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
  fn(win, doc, cons, win.parent, () => ({ getPropertyValue: (k) => (k === "color" ? "rgb(0, 0, 0)" : "") }), (f) => f(), Date);
  listeners.error({ target: win, message: "Uncaught ReferenceError: foo is not defined", filename: "x.html", lineno: 7, colno: 2, error: { stack: "stack" } });
  listeners.error({ target: win, message: "Uncaught SyntaxError: Unexpected token ')'" });
  listeners.error({ target: { tagName: "IMG", src: "https://x/y.png" }, message: "" });
  listeners.unhandledrejection({ reason: new Error("boom") });
  const errs = posted.filter((m) => m.type === "ZEUS_RUNTIME_ERROR").map((m) => m.error);
  assert.equal(errs[0].kind, "runtime");
  assert.equal(errs[0].line, 7);
  assert.equal(errs[1].kind, "compile");
  assert.equal(errs[2].kind, "resource");
  assert.equal(errs[2].fatal, false);
  assert.equal(errs[3].kind, "promise");
  assert.equal(posted.every((m) => m.zeus === "sov" && m.boardId === "bx"), true);
  // host asks for inspect mode, then user clicks
  listeners.message({ data: { zeus: "sov-cmd", type: "ZEUS_INSPECT_MODE", on: true } });
  let prevented = false;
  docListeners.click({ target: fakeEl, preventDefault: () => (prevented = true), stopPropagation() {} });
  const sel = posted.find((m) => m.type === "ZEUS_ELEMENT_SELECTED");
  assert.ok(prevented && sel);
  assert.equal(sel.element.tag, "button");
  assert.equal(sel.element.id, "buy");
  assert.deepEqual(sel.element.classes, ["z-btn", "tonal"]);
  assert.equal(sel.element.text, "Buy now");
  assert.equal(sel.element.styles.color, "rgb(0, 0, 0)");
  assert.equal(sel.element.domPath, "button#buy");
  assert.ok(posted.some((m) => m.type === "ZEUS_INSPECT_MODE" && m.on === false), "inspect turns itself off after a pick");
});

/* ---------------------------------------------------------------- events */
test("events: typed bus isolates throwing listeners and supports off/once", () => {
  const bus = new events.HarnessEventBus();
  const seen = [];
  bus.on("onPlanStart", () => { throw new Error("listener bug"); });
  const off = bus.on("onPlanStart", (p) => seen.push(p.at));
  bus.once("onPlanStart", () => seen.push("once"));
  bus.emit("onPlanStart", { at: 1 });
  bus.emit("onPlanStart", { at: 2 });
  off();
  bus.emit("onPlanStart", { at: 3 });
  assert.deepEqual(seen, [1, "once", 2]);
});
