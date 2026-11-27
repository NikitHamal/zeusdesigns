// Render-time document preparation (Pillar 4): import map + telemetry bridge, injected at the very top of <head>
// so error handlers exist before any author script runs. Stored artboard HTML is never modified.

import { buildSandboxBridge } from "./bridgeScript";
import { importMapTag } from "./resolver";

export interface PrepareOptions {
  boardId: string;
  inspect?: boolean;
  bridge?: boolean;
  importMap?: boolean;
}

export function prepareSandboxDocument(html: string, opts: PrepareOptions): string {
  if (!html) return html;
  if (html.includes('data-zeus-edit="bridge"')) return html;
  const inject = [
    opts.importMap === false ? "" : importMapTag(html),
    opts.bridge === false ? "" : buildSandboxBridge({ boardId: opts.boardId, inspect: opts.inspect }),
  ].join("");
  if (!inject) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (h) => h + inject);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (h) => `${h}<head>${inject}</head>`);
  return inject + html;
}

/** Strips everything prepareSandboxDocument and the inspector add, e.g. before persisting a serialised DOM. */
export function stripSandboxArtifacts(html: string): string {
  return html
    .replace(/<script\b[^>]*data-zeus-edit="(?:bridge|importmap)"[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<div\b[^>]*data-zeus-edit="inspect"[^>]*><\/div>/gi, "")
    .replace(/<div\b[^>]*data-zeus-edit="inspect"[^>]*>[^<]*<\/div>/gi, "");
}
