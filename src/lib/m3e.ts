// M3E Canvas artifact (github.com/lnkiai/m3e-canvas, MIT). The agent writes one JSON document inside
// <m3e title="...">{...}</m3e>; the host turns it into a share link and opens the real M3E Canvas editor
// beside the chat. Nothing is stored anywhere: the link carries the whole design (raw deflate, base64url).

export const M3E_BASE = "https://lnkiai.github.io/m3e-canvas/";
export const M3E_TRIGGER = /\b(m3e|m3 expressive|material 3 expressive|material you)\b[\s\S]*\b(app|screens?|flow|sketch|prototype)\b|\b(app|screens?|flow|sketch|prototype)\b[\s\S]*\b(m3e|material 3 expressive)\b/i;

export interface M3eDoc { title: string; json: string; complete: boolean }

const BLOCK = /<m3e\b([^>]*)>([\s\S]*?)(?:<\/m3e>|$)/gi;

export function splitM3e(text: string): { text: string; docs: M3eDoc[] } {
  if (!/<m3e\b/i.test(text)) return { text, docs: [] };
  const docs: M3eDoc[] = [];
  const clean = text.replace(BLOCK, (all, attrs: string, body: string) => {
    const title = /title\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "M3E sketch";
    const json = body.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    docs.push({ title, json, complete: /<\/m3e>\s*$/i.test(all) });
    return "";
  });
  return { text: clean.trim(), docs };
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Validates the document and returns the share link that opens it in M3E Canvas. */
export async function m3eLink(json: string): Promise<string> {
  const doc = JSON.parse(json) as { frames?: unknown[]; groups?: unknown[] };
  if (!Array.isArray(doc.frames) || !Array.isArray(doc.groups)) throw new Error("The sketch is missing frames or groups.");
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return `${M3E_BASE}#docz=${b64url(buf)}`;
}

export const M3E_GUIDE = `## M3E Canvas artifact (Material 3 Expressive app screens)
When the user asks for app screens, a flow or a sketch in Material 3 Expressive, deliver ONE document as <m3e title="App name">{JSON}</m3e> (raw JSON, no code fence, no link, no description of it). The app opens it in the real M3E Canvas editor next to the chat. Reply with one short sentence before the block.
Document: {"title","brief","frame":"phone","platform":"android","paletteKey":"purple|blue|green|coral|amber|teal|mono","theme":{"dark":false,"bothModes":true,"contrast":"standard","shape":"rounded","font":"roboto","motion":"expressive"},"frames":[{"id","name","x","y","note"}],"groups":[{"id","x","y","axis":"x|y","items":[{"id","kind","label","icon","variant":"filled", ...}]}]}
- Phone screen is 412 x 892; place screens 80 apart: x = 0, 492, 984. Group x and y are canvas coordinates, so add the screen's x and y. Content width inside margins is 380.
- Every item needs id, kind, label (may be ""), icon (Material Symbols name or null) and variant (filled|tonal|elevated|outlined|text).
- kinds: topAppBar(label,icon,icon2) bottomNav(tabs[{icon,label}],selected,actions{"tab:1":{to}}) navRail tabs searchBar button(size 380 full width, 182 half) iconButton fab extendedFab splitButton chip card(label,supporting,noImage) listItem(label,supporting,icon,icon2,switch) box dialog snackbar textField select switch checkbox radio slider text image divider badge loadingIndicator linearProgress circularProgress.
- Connected runs: button/button, iconButton/iconButton, chip/chip with "axis":"x"; listItem/listItem with "axis":"y". Anything else is a group of one with "axis":"x".
- Navigation must close: action {"to":"<frame id>"|"back","transition":"slide|fade|expand|none"}; list rows open a detail screen, details go back, the FAB opens a form.
- One topAppBar per screen, the same bottomNav tabs on main screens with selected set per screen. 3 to 5 screens. Real labels in the user's language, a note only where the label does not say what happens. Do not pad screens with parts.
- Every id unique; every action.to names a frame id or "back". Keep the JSON under 100 KB.`;
