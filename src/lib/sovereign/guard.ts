// Anti-truncation guard (Pillar 2).
//
// Models under token pressure write `<!-- ... rest of the page unchanged -->` or `// ... existing code`
// in the middle of a full-file rewrite. Applied naively that deletes the user's design. The guard finds those
// lazy markers and splices the original lines back in, using the surrounding lines as anchors.

const COMMENT_LINE = /^\s*(?:<!--|\/\*+|\/\/+|\{\s*\/\*|#)\s*(.*?)\s*(?:-->|\*+\/\s*\}|\*+\/)?\s*$/;

export function isLazyLine(line: string): boolean {
  const m = COMMENT_LINE.exec(line);
  if (!m) return false;
  const inner = m[1].trim();
  if (!inner) return false;
  if (/^(?:\.{2,}|\u2026)$/.test(inner)) return true;
  const dots = /(?:\.{3}|\u2026)/.test(inner);
  const phrase =
    /\b(?:rest of|remaining|existing|previous|unchanged|same as (?:before|above|original)|omitted|snipped|truncated|as before|as is|keep (?:the )?(?:existing|original|rest))\b/i;
  if (dots && (phrase.test(inner) || /\b(?:code|content|markup|styles?|sections?|html|css|page|file|here)\b/i.test(inner))) {
    return true;
  }
  return /^(?:rest of|remaining|existing|previous|unchanged)\b[^.]{0,60}\b(?:code|content|markup|styles?|sections?|html|css|page|file|unchanged|here|omitted)\b/i.test(
    inner
  );
}

export function countLazyMarkers(text: string): number {
  return text.split("\n").filter(isLazyLine).length;
}

const norm = (l: string) => l.trim().replace(/\s+/g, " ");

function findSeq(hay: string[], needle: string[], from: number): number {
  if (!needle.length) return from;
  for (let i = Math.max(0, from); i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let k = 0; k < needle.length; k++) {
      if (hay[i + k] !== needle[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

export interface MergeResult {
  content: string;
  lazy: number;
  merged: number;
  unresolved: number;
}

/** Splices original lines back in place of each lazy marker. Unresolvable markers are kept verbatim. */
export function mergeLazyBlocks(prev: string, next: string): MergeResult {
  const nextLines = next.split("\n");
  const lazyIdx = nextLines.map((l, i) => (isLazyLine(l) ? i : -1)).filter((i) => i >= 0);
  if (lazyIdx.length === 0 || !prev.trim()) {
    return { content: next, lazy: lazyIdx.length, merged: 0, unresolved: lazyIdx.length };
  }
  const prevLines = prev.split("\n");
  const prevN = prevLines.map(norm);
  const out: string[] = [];
  let cursor = 0; // next unread index in prevLines
  let merged = 0;
  let unresolved = 0;

  const isBlank = (l: string) => !l.trim();
  for (let i = 0; i < nextLines.length; i++) {
    const line = nextLines[i];
    if (!isLazyLine(line)) {
      out.push(line);
      // advance the cursor when this line is found right at/after it
      const at = findSeq(prevN, [norm(line)], cursor);
      if (at >= 0 && !isBlank(line) && at - cursor < 400) cursor = at + 1;
      continue;
    }
    // anchors
    const before: string[] = [];
    for (let k = out.length - 1; k >= 0 && before.length < 3; k--) {
      if (!isBlank(out[k]) && !isLazyLine(out[k])) before.unshift(norm(out[k]));
    }
    const after: string[] = [];
    for (let k = i + 1; k < nextLines.length && after.length < 3; k++) {
      if (isLazyLine(nextLines[k])) break;
      if (!isBlank(nextLines[k])) after.push(norm(nextLines[k]));
    }
    let bEnd = 0; // index in prevLines right after the matched "before" anchor
    if (before.length) {
      let at = findSeq(prevN, before, 0);
      let len = before.length;
      if (at < 0) {
        at = findSeq(prevN, before.slice(-1), 0);
        len = 1;
      }
      if (at < 0) {
        unresolved++;
        out.push(line);
        continue;
      }
      bEnd = at + len;
    }
    let aStart: number;
    if (after.length) {
      aStart = findSeq(prevN, after, bEnd);
      if (aStart < 0) aStart = findSeq(prevN, after.slice(0, 1), bEnd);
    } else {
      aStart = prevLines.length;
    }
    if (aStart < 0) {
      unresolved++;
      out.push(line);
      continue;
    }
    out.push(...prevLines.slice(bEnd, aStart));
    cursor = aStart;
    merged++;
  }
  return { content: out.join("\n"), lazy: lazyIdx.length, merged, unresolved };
}

export interface GuardResult {
  html: string;
  status: "ok" | "merged" | "rejected";
  reasons: string[];
}

/**
 * Decides what to do with a model-authored full rewrite of an existing file.
 * - lazy markers are merged with the previous content;
 * - if markers remain AND the rewrite shrank by more than 40%, the rewrite is rejected (last good render stays);
 * - a rewrite that silently shrank by more than 70% (no markers) is also rejected: that is truncation, not editing.
 */
export function guardFullWrite(prev: string, next: string): GuardResult {
  if (!prev.trim()) return { html: next, status: "ok", reasons: [] };
  const reasons: string[] = [];
  let html = next;
  let status: GuardResult["status"] = "ok";
  const lazy = countLazyMarkers(next);
  let unresolved = 0;
  if (lazy > 0) {
    const m = mergeLazyBlocks(prev, next);
    html = m.content;
    unresolved = m.unresolved;
    if (m.merged > 0) {
      status = "merged";
      reasons.push(`restored ${m.merged} lazy placeholder${m.merged > 1 ? "s" : ""} from the previous version`);
    }
  }
  const ratio = html.length / Math.max(1, prev.length);
  if (unresolved > 0 && ratio < 0.6) {
    return { html: prev, status: "rejected", reasons: [...reasons, `${unresolved} unresolvable lazy placeholder(s) and the rewrite is ${Math.round(ratio * 100)}% of the original`] };
  }
  if (lazy === 0 && prev.length > 1500 && ratio < 0.3) {
    return { html: prev, status: "rejected", reasons: [`rewrite shrank to ${Math.round(ratio * 100)}% of the original without an explicit removal`] };
  }
  return { html, status, reasons };
}
