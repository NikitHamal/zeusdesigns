// Streaming FSM parser (Pillar 2).
//
// A deterministic, push-based state machine that turns arbitrary LLM chunking into typed events.
// Guarantees:
//  - never throws, never loses a character: partial tags (`<zeus_ac`), partial fences (`` `` ``) and partial
//    closers are held back until the next chunk (or flushed as text on end());
//  - tags inside markdown code fences or inline code are literal text (documentation examples are inert);
//  - action bodies are opaque: nested code fences, `<`, `&`, quotes and backslashes inside a file are content;
//  - the structured protocol (<zeus_plan>, <zeus_artifact>, <zeus_action type="file|patch" path="...">) and the
//    legacy `<artboard ... mode="...">` protocol are both understood; plain markdown fences are surfaced so the
//    caller can fall back to them when the model ignored the protocol altogether.

export type ActionKind = "file" | "patch";

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "plan:start" }
  | { type: "plan:delta"; delta: string }
  | { type: "plan:end"; full: string; closed: boolean }
  | { type: "artifact:start"; attrs: Record<string, string> }
  | { type: "artifact:end" }
  | { type: "action:start"; kind: ActionKind; path: string; attrs: Record<string, string> }
  | { type: "action:delta"; path: string; delta: string }
  | { type: "action:end"; kind: ActionKind; path: string; attrs: Record<string, string>; content: string; closed: boolean }
  | { type: "fence:start"; lang: string; raw: string }
  | { type: "fence:delta"; delta: string }
  | { type: "fence:end"; lang: string; content: string; raw: string; closed: boolean; wrapsProtocol: boolean };

export interface ParserOptions {
  /** Treat `<artboard ...>...</artboard>` as an action (used for live telemetry on the legacy protocol). */
  artboardAlias?: boolean;
}

type State = "text" | "plan" | "action" | "fence";

export function parseTagAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

/** Index of the `>` that closes a tag, ignoring `>` inside quoted attribute values. -1 if not complete yet. */
function findTagEnd(buf: string, from: number): number {
  let quote = "";
  for (let i = from; i < buf.length; i++) {
    const c = buf[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

/** Longest suffix of `buf` that is a (case-insensitive) proper prefix of one of `cands`. */
function partialSuffixLen(buf: string, cands: string[]): number {
  const max = Math.min(buf.length, Math.max(...cands.map((c) => c.length)) - 1);
  for (let k = max; k > 0; k--) {
    const tail = buf.slice(buf.length - k).toLowerCase();
    if (cands.some((c) => c.length > k && c.toLowerCase().startsWith(tail))) return k;
  }
  return 0;
}

const PROTOCOL_MARK = /<zeus_(?:action|artifact)\b/i;
const PATCH_MARK = /^[ \t]*<{5,9}[ \t]*SEARCH\b/im;

export function cleanActionContent(raw: string): string {
  return raw
    .replace(/^\s*```[A-Za-z0-9_+-]*[ \t]*\r?\n/, "")
    .replace(/\r?\n[ \t]*```[ \t]*$/, "")
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .replace(/\s+$/, "");
}

type TagMatch =
  | { kind: "hold" }
  | { kind: "none" }
  | { kind: "open"; name: string; attrs: Record<string, string>; end: number; selfClosing: boolean }
  | { kind: "close"; name: string; end: number };

export class ZeusStreamParser {
  private buf = "";
  private state: State = "text";
  private lineStart = true;
  private readonly opts: ParserOptions;

  // plan
  private plan = "";
  // action
  private actionKind: ActionKind = "file";
  private actionPath = "";
  private actionAttrs: Record<string, string> = {};
  private actionBody = "";
  private actionOrigin: "zeus" | "artboard" = "zeus";
  // fence
  private fenceTicks = 3;
  private fenceLang = "";
  private fenceBody = "";
  private fenceRaw = "";

  constructor(opts: ParserOptions = {}) {
    this.opts = opts;
  }

  push(chunk: string): StreamEvent[] {
    if (!chunk) return [];
    this.buf += chunk;
    const out: StreamEvent[] = [];
    this.drain(false, out);
    return out;
  }

  /** Flush everything. Unclosed constructs are closed with `closed: false`. */
  end(): StreamEvent[] {
    const out: StreamEvent[] = [];
    this.drain(true, out);
    if (this.state === "plan") {
      out.push({ type: "plan:end", full: this.plan, closed: false });
    } else if (this.state === "action") {
      this.endAction(out, false);
    } else if (this.state === "fence") {
      this.endFence(out, "", false);
    }
    this.state = "text";
    return out;
  }

  private drain(final: boolean, out: StreamEvent[]): void {
    for (let guard = 0; guard < 100000; guard++) {
      let progressed = false;
      if (this.state === "text") progressed = this.stepText(final, out);
      else if (this.state === "plan") progressed = this.stepPlan(final, out);
      else if (this.state === "action") progressed = this.stepAction(final, out);
      else progressed = this.stepFence(final, out);
      if (!progressed) break;
    }
  }

  private consume(n: number): void {
    if (n <= 0) return;
    this.lineStart = this.buf[n - 1] === "\n";
    this.buf = this.buf.slice(n);
  }

  private openNames(): string[] {
    return this.opts.artboardAlias
      ? ["zeus_plan", "zeus_artifact", "zeus_action", "artboard"]
      : ["zeus_plan", "zeus_artifact", "zeus_action"];
  }

  private matchTag(buf: string, i: number, final: boolean): TagMatch {
    const lower = buf.slice(i, i + 40).toLowerCase();
    for (const name of this.openNames()) {
      const pat = "<" + name;
      if (lower.startsWith(pat)) {
        const nx = buf[i + pat.length];
        if (nx === undefined) return final ? { kind: "none" } : { kind: "hold" };
        if (!/[\s>/]/.test(nx)) continue;
        const end = findTagEnd(buf, i + pat.length);
        if (end < 0) return final || buf.length - i > 16384 ? { kind: "none" } : { kind: "hold" };
        const selfClosing = buf[end - 1] === "/";
        const attrSrc = buf.slice(i + pat.length, selfClosing ? end - 1 : end);
        return { kind: "open", name, attrs: parseTagAttrs(attrSrc), end: end + 1, selfClosing };
      }
      if (!final && lower.length < pat.length && pat.startsWith(lower)) return { kind: "hold" };
    }
    for (const name of ["zeus_artifact", "zeus_plan", "zeus_action"]) {
      const pat = `</${name}>`;
      if (lower.startsWith(pat)) return { kind: "close", name, end: i + pat.length };
      if (!final && lower.length < pat.length && pat.startsWith(lower)) return { kind: "hold" };
    }
    return { kind: "none" };
  }

  private stepText(final: boolean, out: StreamEvent[]): boolean {
    const buf = this.buf;
    if (!buf) return false;
    let i = 0;
    let emitted = 0;
    const emit = (end: number) => {
      if (end > emitted) out.push({ type: "text", delta: buf.slice(emitted, end) });
      emitted = Math.max(emitted, end);
    };
    while (i < buf.length) {
      const c = buf[i];
      if (c === "<") {
        const m = this.matchTag(buf, i, final);
        if (m.kind === "hold") {
          emit(i);
          this.consume(i);
          return false;
        }
        if (m.kind === "none") {
          i++;
          continue;
        }
        emit(i);
        if (m.kind === "close") {
          if (m.name === "zeus_artifact") out.push({ type: "artifact:end" });
          this.consume(m.end);
          return true;
        }
        this.consume(m.end);
        this.openTag(m, out);
        return true;
      }
      if (c === "`") {
        const atLineStart = i === 0 ? this.lineStart : buf[i - 1] === "\n";
        let n = 0;
        while (buf[i + n] === "`") n++;
        if (atLineStart) {
          if (i + n === buf.length && !final && n <= 3) {
            emit(i);
            this.consume(i);
            return false;
          }
          if (n >= 3) {
            const nl = buf.indexOf("\n", i + n);
            if (nl < 0) {
              if (!final) {
                emit(i);
                this.consume(i);
                return false;
              }
              i += n;
              continue;
            }
            const info = buf.slice(i + n, nl).trim();
            if (!info.includes("`")) {
              emit(i);
              this.fenceTicks = n;
              this.fenceLang = (info.split(/\s+/)[0] ?? "").toLowerCase();
              this.fenceBody = "";
              this.fenceRaw = buf.slice(i, nl + 1);
              out.push({ type: "fence:start", lang: this.fenceLang, raw: this.fenceRaw });
              this.consume(nl + 1);
              this.state = "fence";
              return true;
            }
          }
        }
        // inline code span: skip through the closing backtick on the same line
        const j = buf.indexOf("`", i + n);
        const nl = buf.indexOf("\n", i + n);
        if (j >= 0 && (nl < 0 || j < nl)) {
          i = j + 1;
          continue;
        }
        if (nl >= 0) {
          i += n;
          continue;
        }
        if (!final) {
          emit(i);
          this.consume(i);
          return false;
        }
        i += n;
        continue;
      }
      i++;
    }
    emit(buf.length);
    this.consume(buf.length);
    return false;
  }

  private openTag(m: Extract<TagMatch, { kind: "open" }>, out: StreamEvent[]): void {
    if (m.name === "zeus_plan") {
      this.plan = "";
      this.state = "plan";
      out.push({ type: "plan:start" });
      return;
    }
    if (m.name === "zeus_artifact") {
      out.push({ type: "artifact:start", attrs: m.attrs });
      return;
    }
    const isArtboard = m.name === "artboard";
    const t = (isArtboard ? m.attrs.mode : m.attrs.type ?? m.attrs.mode ?? "") ?? "";
    this.actionKind = /^(patch|edit|diff|update|modify)$/i.test(t) ? "patch" : "file";
    this.actionPath = m.attrs.path || m.attrs.name || m.attrs.file || m.attrs.id || "untitled";
    this.actionAttrs = m.attrs;
    this.actionBody = "";
    this.actionOrigin = isArtboard ? "artboard" : "zeus";
    out.push({ type: "action:start", kind: this.actionKind, path: this.actionPath, attrs: m.attrs });
    if (m.selfClosing) {
      this.endAction(out, true);
      return;
    }
    this.state = "action";
  }

  private stepPlan(final: boolean, out: StreamEvent[]): boolean {
    const buf = this.buf;
    const m = /<\/zeus_plan\s*>|<zeus_(?:artifact|action)\b/i.exec(buf);
    if (m) {
      this.emitPlan(buf.slice(0, m.index), out);
      out.push({ type: "plan:end", full: this.plan, closed: m[0].startsWith("</") });
      this.consume(m[0].startsWith("</") ? m.index + m[0].length : m.index);
      this.state = "text";
      return true;
    }
    const hold = final ? 0 : partialSuffixLen(buf, ["</zeus_plan>", "<zeus_artifact", "<zeus_action"]);
    this.emitPlan(buf.slice(0, buf.length - hold), out);
    this.consume(buf.length - hold);
    return false;
  }

  private emitPlan(delta: string, out: StreamEvent[]): void {
    if (!delta) return;
    this.plan += delta;
    out.push({ type: "plan:delta", delta });
  }

  private stepAction(final: boolean, out: StreamEvent[]): boolean {
    const buf = this.buf;
    const re =
      this.actionOrigin === "artboard"
        ? /<\/artboard\s*>/i
        : /<\/zeus_action\s*>|<\/zeus_artifact\s*>|<zeus_action\b/i;
    const cands =
      this.actionOrigin === "artboard" ? ["</artboard>"] : ["</zeus_action>", "</zeus_artifact>", "<zeus_action"];
    const m = re.exec(buf);
    if (m) {
      this.emitAction(buf.slice(0, m.index), out);
      // `</zeus_artifact>` implicitly closes the action AND the artifact: leave it for the text state.
      const eatLen = /^<\/zeus_action/i.test(m[0]) || /^<\/artboard/i.test(m[0]) ? m.index + m[0].length : m.index;
      this.consume(eatLen);
      this.endAction(out, true);
      return true;
    }
    const hold = final ? 0 : partialSuffixLen(buf, cands);
    this.emitAction(buf.slice(0, buf.length - hold), out);
    this.consume(buf.length - hold);
    return false;
  }

  private emitAction(delta: string, out: StreamEvent[]): void {
    if (!delta) return;
    this.actionBody += delta;
    out.push({ type: "action:delta", path: this.actionPath, delta });
  }

  private endAction(out: StreamEvent[], closed: boolean): void {
    const content = cleanActionContent(this.actionBody);
    const kind: ActionKind = this.actionKind === "file" && PATCH_MARK.test(content) ? "patch" : this.actionKind;
    out.push({
      type: "action:end",
      kind,
      path: this.actionPath,
      attrs: this.actionAttrs,
      content,
      closed,
    });
    this.actionBody = "";
    this.state = "text";
  }

  private stepFence(final: boolean, out: StreamEvent[]): boolean {
    const closeRe = new RegExp("^ {0,3}`{" + this.fenceTicks + ",}[ \\t]*\\r?$");
    let progressed = false;
    for (;;) {
      const nl = this.buf.indexOf("\n");
      if (nl < 0) break;
      const line = this.buf.slice(0, nl);
      if (closeRe.test(line)) {
        this.consume(nl + 1);
        this.endFence(out, line + "\n", true);
        return true;
      }
      const seg = this.buf.slice(0, nl + 1);
      this.fenceBody += seg;
      out.push({ type: "fence:delta", delta: seg });
      this.consume(nl + 1);
      progressed = true;
    }
    if (final && this.buf) {
      if (closeRe.test(this.buf)) {
        const raw = this.buf;
        this.consume(this.buf.length);
        this.endFence(out, raw, true);
        return true;
      }
      this.fenceBody += this.buf;
      out.push({ type: "fence:delta", delta: this.buf });
      this.consume(this.buf.length);
    }
    return progressed;
  }

  private endFence(out: StreamEvent[], raw: string, closed: boolean): void {
    const content = this.fenceBody.replace(/\r?\n$/, "");
    const wrapsProtocol = PROTOCOL_MARK.test(content);
    out.push({ type: "fence:end", lang: this.fenceLang, content, raw, closed, wrapsProtocol });
    this.fenceBody = "";
    this.state = "text";
    if (wrapsProtocol) {
      // Models sometimes wrap the whole protocol in ```xml. Re-parse the body as a fresh stream.
      const sub = new ZeusStreamParser(this.opts);
      out.push(...sub.push(content), ...sub.end());
    }
  }
}

/* ------------------------------------------------------------------ */
/* Folding: events -> a plain snapshot the engine / UI can consume     */
/* ------------------------------------------------------------------ */
export interface ActionRecord {
  kind: ActionKind;
  path: string;
  attrs: Record<string, string>;
  content: string;
  closed: boolean;
}

export interface FenceRecord {
  lang: string;
  content: string;
  closed: boolean;
  wrapsProtocol: boolean;
}

export interface FoldedStream {
  text: string;
  plan: string;
  planOpen: boolean;
  planSeen: boolean;
  actions: ActionRecord[];
  fences: FenceRecord[];
  /** True once any structured tag was seen. */
  protocol: boolean;
}

export function emptyFold(): FoldedStream {
  return { text: "", plan: "", planOpen: false, planSeen: false, actions: [], fences: [], protocol: false };
}

export function foldEvents(events: StreamEvent[], into: FoldedStream = emptyFold()): FoldedStream {
  const live = new Map<string, ActionRecord>();
  for (const e of into.actions) if (!e.closed) live.set(e.path, e);
  let fence: FenceRecord | null = null;
  for (const e of events) {
    switch (e.type) {
      case "text":
        into.text += e.delta;
        break;
      case "plan:start":
        into.planSeen = true;
        into.planOpen = true;
        into.protocol = true;
        into.plan = "";
        break;
      case "plan:delta":
        into.plan += e.delta;
        break;
      case "plan:end":
        into.plan = e.full;
        into.planOpen = false;
        break;
      case "artifact:start":
      case "artifact:end":
        into.protocol = true;
        break;
      case "action:start": {
        const rec: ActionRecord = { kind: e.kind, path: e.path, attrs: e.attrs, content: "", closed: false };
        into.actions.push(rec);
        live.set(e.path, rec);
        into.protocol = true;
        break;
      }
      case "action:delta": {
        const rec = live.get(e.path);
        if (rec) rec.content += e.delta;
        break;
      }
      case "action:end": {
        const rec = live.get(e.path);
        if (rec) {
          rec.kind = e.kind;
          rec.content = e.content;
          rec.closed = e.closed;
          live.delete(e.path);
        }
        break;
      }
      case "fence:start":
        fence = { lang: e.lang, content: "", closed: false, wrapsProtocol: false };
        into.fences.push(fence);
        break;
      case "fence:delta":
        if (fence) fence.content += e.delta;
        break;
      case "fence:end":
        if (fence) {
          fence.content = e.content;
          fence.closed = e.closed;
          fence.wrapsProtocol = e.wrapsProtocol;
        }
        fence = null;
        break;
    }
  }
  return into;
}

export interface ParseZeusOptions extends ParserOptions {
  /** Keep partially received constructs (default true). */
  final?: boolean;
}

/** One-shot parse of a complete (or partial) stream. */
export function parseZeusStream(full: string, opts: ParseZeusOptions = {}): FoldedStream {
  const p = new ZeusStreamParser(opts);
  const events = [...p.push(full), ...p.end()];
  return foldEvents(events);
}

const FALLBACK_LANGS = new Set(["html", "htm", "svg", "xml", "jsx", "tsx", "css", "js", "javascript", "ts", "typescript", ""]);
const DOC_LIKE = /<(?:!doctype|html|body|head|main|section|div|header|nav|article|style|svg)\b/i;

/** When the model ignored the protocol, recover document-like markdown fences as file writes. */
export function fallbackFiles(folded: FoldedStream): ActionRecord[] {
  if (folded.actions.length > 0) return [];
  const out: ActionRecord[] = [];
  for (const f of folded.fences) {
    if (f.wrapsProtocol || !FALLBACK_LANGS.has(f.lang)) continue;
    if (f.lang !== "css" && !DOC_LIKE.test(f.content)) continue;
    const ext = f.lang === "css" ? "css" : "html";
    out.push({
      kind: PATCH_MARK.test(f.content) ? "patch" : "file",
      path: `fallback-${out.length + 1}.${ext}`,
      attrs: { fallback: "true" },
      content: f.content.trim(),
      closed: f.closed,
    });
  }
  return out;
}

/** Incremental feeder: call `update(fullTextSoFar)` on every sync; only the new suffix is parsed. */
export class ZeusStreamSession {
  private parser: ZeusStreamParser;
  private prev = "";
  private readonly opts: ParserOptions;
  constructor(opts: ParserOptions = {}) {
    this.opts = opts;
    this.parser = new ZeusStreamParser(opts);
  }

  update(full: string): { reset: boolean; events: StreamEvent[] } {
    let reset = false;
    if (!full.startsWith(this.prev)) {
      this.parser = new ZeusStreamParser(this.opts);
      this.prev = "";
      reset = true;
    }
    const delta = full.slice(this.prev.length);
    this.prev = full;
    return { reset, events: this.parser.push(delta) };
  }

  finish(): StreamEvent[] {
    const ev = this.parser.end();
    this.parser = new ZeusStreamParser(this.opts);
    this.prev = "";
    return ev;
  }
}

/* ------------------------------------------------------------------ */
/* Bridge to the legacy <artboard> pipeline                            */
/* ------------------------------------------------------------------ */
const escAttr = (s: string) => s.replace(/"/g, "'").replace(/[<>\n]/g, " ").trim();
const ZEUS_TAG_PRESENT = /<zeus_(?:plan|artifact|action)\b/i;

export interface ZeusConversion {
  text: string;
  plan: string;
  engaged: boolean;
}

/**
 * Converts the structured protocol into the legacy `<artboard>` markup the rest of Zeus already understands.
 * Streams without any `<zeus_*>` tag are returned untouched, so existing behaviour is byte-identical.
 */
export function zeusToArtboards(full: string): ZeusConversion {
  if (!ZEUS_TAG_PRESENT.test(full)) return { text: full, plan: "", engaged: false };
  const parser = new ZeusStreamParser();
  const events = [...parser.push(full), ...parser.end()];
  let out = "";
  let plan = "";
  let pending: string | null = null;
  for (const e of events) {
    switch (e.type) {
      case "text":
        if (pending !== null) pending += e.delta;
        else out += e.delta;
        break;
      case "fence:start":
        pending = e.raw;
        break;
      case "fence:delta":
        if (pending !== null) pending += e.delta;
        break;
      case "fence:end":
        if (!e.wrapsProtocol && pending !== null) out += pending + (e.closed ? e.raw : "");
        pending = null;
        break;
      case "plan:delta":
        plan += e.delta;
        break;
      case "action:start": {
        const a = e.attrs;
        const mode = e.kind === "patch" ? "patch" : a.mode === "revise" || a.mode === "new" ? a.mode : a.id ? "revise" : "new";
        const idAttr = a.id ? ` id="${escAttr(a.id)}"` : "";
        const dev = a.device ? ` device="${escAttr(a.device)}"` : "";
        out += `\n<artboard${idAttr} name="${escAttr(a.name || e.path)}"${dev} mode="${mode}">\n`;
        break;
      }
      case "action:delta":
        out += e.delta;
        break;
      case "action:end":
        if (e.closed) out += "\n</artboard>\n";
        break;
      default:
        break;
    }
  }
  if (pending !== null) out += pending;
  return { text: out, plan: plan.trim(), engaged: true };
}
