// Smart import & package resolution (Pillar 4).
//
// Zeus artboards are offline-first, so stored HTML is never rewritten. Resolution happens at render time:
// bare imports found in <script type="module"> blocks are mapped to pinned esm.sh builds through an injected
// import map. A failed import surfaces through the sandbox telemetry bridge as a `resource` error.

export interface ResolvedPackage {
  name: string;
  spec: string;
  url: string;
  known: boolean;
}

interface PackagePin {
  version: string;
  /** Packages that must share the host React instance. */
  react?: boolean;
  /** Extra path to resolve (e.g. subpath exports). */
  subpath?: string;
}

/** Design libraries that are pre-configured. Versions are pinned for reproducible previews. */
export const KNOWN_PACKAGES: Record<string, PackagePin> = {
  react: { version: "19.2.0" },
  "react-dom": { version: "19.2.0" },
  "lucide-react": { version: "0.468.0", react: true },
  "framer-motion": { version: "11.15.0", react: true },
  motion: { version: "11.15.0", react: true },
  recharts: { version: "2.15.0", react: true },
  clsx: { version: "2.1.1" },
  "tailwind-merge": { version: "3.4.0" },
  "canvas-confetti": { version: "1.9.3" },
  three: { version: "0.171.0" },
  gsap: { version: "3.12.5" },
  "date-fns": { version: "4.1.0" },
  zustand: { version: "5.0.2", react: true },
  "class-variance-authority": { version: "0.7.1" },
  d3: { version: "7.9.0" },
};

const RADIX = /^@radix-ui\/react-[a-z-]+$/;
const BARE_IMPORT_RES = [
  /\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bexport\s+[\w*{}\s,$]+?\s+from\s+["']([^"']+)["']/g,
];

const isBare = (spec: string) => !/^(?:\.{0,2}\/|https?:|data:|blob:|#)/.test(spec) && spec.length > 0;

/** Package name from a specifier: `lucide-react/icons` -> `lucide-react`, `@radix-ui/react-dialog/x` -> `@radix-ui/react-dialog`. */
export function packageName(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

export function extractBareImports(code: string): string[] {
  const found = new Set<string>();
  for (const re of BARE_IMPORT_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) if (isBare(m[1])) found.add(m[1]);
  }
  return [...found];
}

export function moduleScriptBodies(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (/type\s*=\s*["']?module/i.test(m[1]) && m[2].trim()) out.push(m[2]);
  }
  return out;
}

export function resolveSpecifier(spec: string): ResolvedPackage {
  const name = packageName(spec);
  const pin = KNOWN_PACKAGES[name];
  const sub = spec.slice(name.length);
  if (pin) {
    const ext = pin.react ? "?external=react,react-dom" : "";
    return { name, spec, url: `https://esm.sh/${name}@${pin.version}${sub}${ext}`, known: true };
  }
  if (RADIX.test(name)) {
    return { name, spec, url: `https://esm.sh/${name}${sub}?external=react,react-dom`, known: true };
  }
  return { name, spec, url: `https://esm.sh/${spec}`, known: false };
}

export interface ImportMapResult {
  map: { imports: Record<string, string> } | null;
  packages: ResolvedPackage[];
}

/** Builds the import map for every bare specifier in the document's module scripts. */
export function buildImportMap(html: string): ImportMapResult {
  if (/<script\b[^>]*type\s*=\s*["']?importmap/i.test(html)) return { map: null, packages: [] };
  const specs = new Set<string>();
  for (const body of moduleScriptBodies(html)) for (const s of extractBareImports(body)) specs.add(s);
  if (specs.size === 0) return { map: null, packages: [] };
  const packages = [...specs].map(resolveSpecifier);
  const imports: Record<string, string> = {};
  let needsReact = false;
  for (const p of packages) {
    imports[p.spec] = p.url;
    if (KNOWN_PACKAGES[p.name]?.react || RADIX.test(p.name)) needsReact = true;
  }
  if (needsReact) {
    imports.react ??= `https://esm.sh/react@${KNOWN_PACKAGES.react.version}`;
    imports["react-dom"] ??= `https://esm.sh/react-dom@${KNOWN_PACKAGES["react-dom"].version}`;
    imports["react-dom/client"] ??= `https://esm.sh/react-dom@${KNOWN_PACKAGES["react-dom"].version}/client`;
    imports["react/jsx-runtime"] ??= `https://esm.sh/react@${KNOWN_PACKAGES.react.version}/jsx-runtime`;
  }
  return { map: { imports }, packages };
}

/** `<script type="importmap">` tag, `<` escaped so a hostile specifier cannot close the tag. */
export function importMapTag(html: string): string {
  const { map } = buildImportMap(html);
  if (!map) return "";
  return `<script type="importmap" data-zeus-edit="importmap">${JSON.stringify(map).replace(/</g, "\\u003c")}</script>`;
}
