// Pre-mount syntax & structure sanitizer (Pillar 4).
//
// `sanitizePartialHtml` makes a mid-stream document safe to mount: no half-written tag, comment or script ever
// reaches the renderer, so the last known good render stays visible until the next valid frame.
// `validateDocument` statically checks a finished document (inline script syntax, unterminated blocks,
// structural balance) so a broken screen is detected even when no iframe ever executes it.

import type { RuntimeErrorPayload } from "./types";

/** Longest prefix of `css` whose braces are balanced and which ends right after a closing brace. */
export function trimToBalancedCss(css: string): string {
  let depth = 0;
  let lastGood = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) lastGood = i + 1;
    }
  }
  return css.slice(0, lastGood);
}

/** Removes constructs that cannot be rendered yet because their closing delimiter has not streamed in. */
export function sanitizePartialHtml(html: string): string {
  let out = html;
  // unterminated script/style bodies are never mountable
  const openScript = out.search(/<script\b[^>]*>(?![\s\S]*?<\/script>)/i);
  if (openScript >= 0) out = out.slice(0, openScript);
  const openStyle = /<style\b[^>]*>(?![\s\S]*?<\/style>)/i.exec(out);
  if (openStyle) {
    // keep only complete, balanced CSS rules; drop the half-written block
    const bodyStart = openStyle.index + openStyle[0].length;
    out = out.slice(0, bodyStart) + trimToBalancedCss(out.slice(bodyStart)) + "</style>";
  }
  // unterminated comment
  const openComment = out.lastIndexOf("<!--");
  if (openComment >= 0 && out.indexOf("-->", openComment) < 0) out = out.slice(0, openComment);
  // half-written tag at the very end
  out = out.replace(/<[a-zA-Z/!][^<>]*$/, "");
  return out;
}

export interface ValidationReport {
  ok: boolean;
  errors: RuntimeErrorPayload[];
  warnings: string[];
}

const NON_JS_SCRIPT = /type\s*=\s*["']?(?:module|importmap|application\/(?:ld\+)?json|text\/(?:template|html|babel|jsx)|speculationrules)/i;
const BALANCED_TAGS = ["div", "section", "main", "nav", "header", "footer", "article", "aside", "ul", "ol", "table", "form", "button", "a", "span", "p"];

function lineOf(text: string, idx: number): number {
  let n = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

function canCompile(): boolean {
  try {
    new Function("return 1");
    return true;
  } catch {
    return false;
  }
}

export function validateDocument(html: string): ValidationReport {
  const errors: RuntimeErrorPayload[] = [];
  const warnings: string[] = [];
  const now = Date.now();
  if (!html.trim()) return { ok: true, errors, warnings };

  // 1. unterminated blocks
  if (/<script\b[^>]*>(?![\s\S]*?<\/script>)/i.test(html)) {
    errors.push({ kind: "compile", message: "Unterminated <script> block (the file ends inside a script).", fatal: true, at: now });
  }
  if (/<style\b[^>]*>(?![\s\S]*?<\/style>)/i.test(html)) {
    warnings.push("Unterminated <style> block.");
  }
  if (!/<\/html>\s*$/i.test(html.trim()) && /<html[\s>]/i.test(html)) warnings.push("Document does not end with </html>.");

  // 2. inline classic script syntax (compile only, never executed)
  if (canCompile()) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const attrs = m[1] ?? "";
      const code = m[2] ?? "";
      if (!code.trim() || /\bsrc\s*=/i.test(attrs) || NON_JS_SCRIPT.test(attrs)) continue;
      if (/data-zeus-(?:kit-js|edit)/i.test(attrs)) continue;
      if (/^\s*(?:import|export)\s/m.test(code)) continue; // ES module syntax cannot be compiled with Function
      try {
        new Function(code);
      } catch (e) {
        const err = e as Error;
        if (err.name === "EvalError") break; // eval blocked by CSP: unverifiable, not an error
        errors.push({
          kind: "compile",
          message: `${err.name}: ${err.message}`,
          line: lineOf(html, m.index),
          source: code.trim().slice(0, 160),
          fatal: true,
          at: now,
        });
      }
    }
  }

  // 3. structural balance (outside script/style/comments)
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, "");
  for (const tag of BALANCED_TAGS) {
    const open = (body.match(new RegExp(`<${tag}(?=[\\s>])`, "gi")) ?? []).length;
    const close = (body.match(new RegExp(`</${tag}>`, "gi")) ?? []).length;
    if (open - close >= 2) warnings.push(`<${tag}> is opened ${open} times but closed ${close} times.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
