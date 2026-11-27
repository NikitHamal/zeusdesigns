// Surgical SEARCH/REPLACE patch engine (Pillar 2).
//
//   <<<<<<< SEARCH
//   exact or near-exact lines currently in the file
//   =======
//   replacement lines
//   >>>>>>> REPLACE
//
// Matching ladder (first hit wins, every rung is deterministic):
//   1. exact      - verbatim substring
//   2. line-fuzzy - same non-blank lines ignoring indentation / internal whitespace, replacement is re-indented
//   3. regex-ws   - token stream match tolerant to any whitespace (single-line / minified edits)
//   4. anchor     - first and last line anchors with >= 70% line agreement (model dropped or reworded a middle line)
// A SEARCH that matches nowhere is reported, never guessed, and never destroys surrounding code.

export interface PatchBlock {
  search: string;
  replace: string;
}

export type PatchStrategy = "exact" | "line-fuzzy" | "regex-ws" | "anchor" | "append";

export interface PatchFailure {
  index: number;
  reason: string;
  search: string;
}

export interface PatchResult {
  content: string;
  applied: number;
  failed: PatchFailure[];
  strategies: PatchStrategy[];
  changed: boolean;
}

const SEARCH_RE = /^[ \t]*<{5,9}[ \t]*SEARCH[ \t]*\r?$/i;
const DIVIDER_RE = /^[ \t]*={5,9}[ \t]*\r?$/;
const REPLACE_RE = /^[ \t]*>{5,9}[ \t]*(?:REPLACE)?[ \t]*\r?$/i;

/** Parses every complete SEARCH/REPLACE block. `incomplete` is true when the stream ended inside a block. */
export function parsePatchBlocks(body: string): { blocks: PatchBlock[]; incomplete: boolean } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: PatchBlock[] = [];
  let mode: "idle" | "search" | "replace" = "idle";
  let search: string[] = [];
  let replace: string[] = [];
  for (const line of lines) {
    if (mode === "idle") {
      if (SEARCH_RE.test(line)) {
        mode = "search";
        search = [];
        replace = [];
      }
    } else if (mode === "search") {
      if (DIVIDER_RE.test(line)) mode = "replace";
      else search.push(line);
    } else if (REPLACE_RE.test(line)) {
      blocks.push({ search: search.join("\n"), replace: replace.join("\n") });
      mode = "idle";
    } else {
      replace.push(line);
    }
  }
  return { blocks, incomplete: mode !== "idle" };
}

const normLine = (l: string) => l.trim().replace(/\s+/g, " ");
const indentOf = (l: string) => /^[ \t]*/.exec(l)?.[0] ?? "";

function reindent(lines: string[], srcIndent: string, searchIndent: string): string[] {
  if (srcIndent === searchIndent) return lines;
  const delta = srcIndent.length - searchIndent.length;
  return lines.map((l) => {
    if (!l.trim()) return l;
    if (delta > 0) return srcIndent.slice(0, delta) + l;
    const cur = indentOf(l);
    const cut = Math.min(cur.length, -delta);
    return l.slice(cut);
  });
}

interface Located {
  start: number; // char offset
  end: number; // char offset (exclusive)
  strategy: PatchStrategy;
  replacement: string;
}

function lineOffsets(src: string): number[] {
  const offs = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") offs.push(i + 1);
  return offs;
}

function locate(src: string, block: PatchBlock): Located | null {
  const search = block.search.replace(/\r\n/g, "\n");
  const replace = block.replace.replace(/\r\n/g, "\n");

  // 1. exact
  const exactAt = src.indexOf(search);
  if (search.length > 0 && exactAt >= 0) {
    return { start: exactAt, end: exactAt + search.length, strategy: "exact", replacement: replace };
  }
  // trailing newline tolerance
  const sTrim = search.replace(/\n+$/, "");
  if (sTrim.length > 0 && sTrim !== search) {
    const at = src.indexOf(sTrim);
    if (at >= 0) {
      return { start: at, end: at + sTrim.length, strategy: "exact", replacement: replace.replace(/\n+$/, "") };
    }
  }

  const srcLines = src.split("\n");
  const offs = lineOffsets(src);
  const sLines = search.split("\n");
  const sIdx: number[] = [];
  sLines.forEach((l, i) => {
    if (l.trim()) sIdx.push(i);
  });
  if (sIdx.length === 0) return null;
  const sNorm = sIdx.map((i) => normLine(sLines[i]));

  const nbIdx: number[] = [];
  srcLines.forEach((l, i) => {
    if (l.trim()) nbIdx.push(i);
  });
  const nbNorm = nbIdx.map((i) => normLine(srcLines[i]));

  const lineRange = (firstSrcLine: number, lastSrcLine: number) => ({
    start: offs[firstSrcLine],
    end: lastSrcLine + 1 < offs.length ? offs[lastSrcLine + 1] - 1 : src.length,
  });

  // 2. line-fuzzy
  for (let p = 0; p + sNorm.length <= nbNorm.length; p++) {
    let ok = true;
    for (let k = 0; k < sNorm.length; k++) {
      if (nbNorm[p + k] !== sNorm[k]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const first = nbIdx[p];
    const last = nbIdx[p + sNorm.length - 1];
    const r = lineRange(first, last);
    const rep = reindent(replace.split("\n"), indentOf(srcLines[first]), indentOf(sLines[sIdx[0]]));
    return { ...r, strategy: "line-fuzzy", replacement: rep.join("\n") };
  }

  // 3. regex-ws (token stream)
  const tokens = search.trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && tokens.length <= 400) {
    try {
      const re = new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"));
      const m = re.exec(src);
      if (m) {
        return { start: m.index, end: m.index + m[0].length, strategy: "regex-ws", replacement: replace.trim() };
      }
    } catch {
      /* ignore invalid regex */
    }
  }

  // 4. anchor
  if (sNorm.length >= 3) {
    const firstN = sNorm[0];
    const lastN = sNorm[sNorm.length - 1];
    const window = Math.ceil(sNorm.length * 1.5) + 3;
    for (let p = 0; p < nbNorm.length; p++) {
      if (nbNorm[p] !== firstN) continue;
      for (let q = Math.min(nbNorm.length - 1, p + window); q > p; q--) {
        if (nbNorm[q] !== lastN) continue;
        const seg = new Set(nbNorm.slice(p, q + 1));
        const agree = sNorm.filter((l) => seg.has(l)).length / sNorm.length;
        if (agree >= 0.7) {
          const first = nbIdx[p];
          const last = nbIdx[q];
          const r = lineRange(first, last);
          const rep = reindent(replace.split("\n"), indentOf(srcLines[first]), indentOf(sLines[sIdx[0]]));
          return { ...r, strategy: "anchor", replacement: rep.join("\n") };
        }
      }
    }
  }
  return null;
}

/** Applies one block. Empty SEARCH appends (before </body> when present). */
export function applyPatchBlock(
  src: string,
  block: PatchBlock
): { ok: true; content: string; strategy: PatchStrategy } | { ok: false; reason: string } {
  if (block.search.trim() === "") {
    if (block.replace.trim() === "") return { ok: false, reason: "empty SEARCH and empty REPLACE" };
    const bodyEnd = src.search(/<\/body>/i);
    if (bodyEnd >= 0) {
      return { ok: true, content: src.slice(0, bodyEnd) + block.replace + "\n" + src.slice(bodyEnd), strategy: "append" };
    }
    return { ok: true, content: src + (src.endsWith("\n") ? "" : "\n") + block.replace, strategy: "append" };
  }
  const hit = locate(src, block);
  if (!hit) {
    const firstLine = block.search.split("\n").find((l) => l.trim())?.trim().slice(0, 80) ?? "";
    return { ok: false, reason: `SEARCH block not found (starts with: ${firstLine})` };
  }
  return { ok: true, content: src.slice(0, hit.start) + hit.replacement + src.slice(hit.end), strategy: hit.strategy };
}

/** Applies every block in order against the evolving content. A failing block never aborts the others. */
export function applyPatchBlocks(src: string, body: string): PatchResult {
  const { blocks } = parsePatchBlocks(body);
  let content = src;
  let applied = 0;
  const failed: PatchFailure[] = [];
  const strategies: PatchStrategy[] = [];
  blocks.forEach((b, index) => {
    const r = applyPatchBlock(content, b);
    if (r.ok) {
      content = r.content;
      applied++;
      strategies.push(r.strategy);
    } else {
      failed.push({ index, reason: r.reason, search: b.search.slice(0, 200) });
    }
  });
  if (blocks.length === 0) {
    failed.push({ index: 0, reason: "no complete SEARCH/REPLACE block found", search: "" });
  }
  return { content, applied, failed, strategies, changed: content !== src };
}
