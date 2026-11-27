// Line diff (LCS) used by the VFS snapshot inspector. Pure, dependency-free.

export interface DiffLine {
  op: "=" | "+" | "-";
  text: string;
}

export interface DiffStat {
  added: number;
  removed: number;
}

const MAX_CELLS = 4_000_000;

export function diffLines(a: string, b: string): DiffLine[] {
  if (a === b) return a ? a.split("\n").map((text) => ({ op: "=" as const, text })) : [];
  const A = a === "" ? [] : a.split("\n");
  const B = b === "" ? [] : b.split("\n");
  // trim common prefix and suffix first: most design edits touch a tiny window
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length;
  let eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) {
    ea--;
    eb--;
  }
  const midA = A.slice(s, ea);
  const midB = B.slice(s, eb);
  const out: DiffLine[] = [];
  for (let i = 0; i < s; i++) out.push({ op: "=", text: A[i] });
  if ((midA.length + 1) * (midB.length + 1) > MAX_CELLS) {
    for (const t of midA) out.push({ op: "-", text: t });
    for (const t of midB) out.push({ op: "+", text: t });
  } else {
    const n = midA.length;
    const m = midB.length;
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        out.push({ op: "=", text: midA[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push({ op: "-", text: midA[i++] });
      } else {
        out.push({ op: "+", text: midB[j++] });
      }
    }
    while (i < n) out.push({ op: "-", text: midA[i++] });
    while (j < m) out.push({ op: "+", text: midB[j++] });
  }
  for (let i = ea; i < A.length; i++) out.push({ op: "=", text: A[i] });
  return out;
}

export function diffStat(a: string, b: string): DiffStat {
  let added = 0;
  let removed = 0;
  for (const l of diffLines(a, b)) {
    if (l.op === "+") added++;
    else if (l.op === "-") removed++;
  }
  return { added, removed };
}

/** Renders a unified-style diff with `ctx` lines of context around each change. */
export function renderUnified(lines: DiffLine[], ctx = 2): string {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.op !== "=") for (let k = Math.max(0, i - ctx); k <= Math.min(lines.length - 1, i + ctx); k++) keep[k] = true;
  });
  const out: string[] = [];
  let gap = false;
  lines.forEach((l, i) => {
    if (!keep[i]) {
      gap = true;
      return;
    }
    if (gap && out.length) out.push("@@");
    gap = false;
    out.push(`${l.op === "=" ? " " : l.op}${l.text}`);
  });
  return out.join("\n");
}
