// Agent tool protocol shown to the model: built-in project tools plus whatever the enabled MCP servers expose.
import { useStore } from "../store";
import { nativeMcp, type McpToolInfo } from "./bridge";
import { getCodingHarnessProfile } from "./codingHarness";
import { studioToolsPrompt } from "./studio";

let cache: { key: string; at: number; tools: McpToolInfo[] } | null = null;

let inflight: Promise<McpToolInfo[]> | null = null;

/** Tools of enabled servers. Discovery can take a while the first time (npx downloads), so callers get what is ready within `wait` ms. */
const BUILTIN_TOOLS: McpToolInfo[] = [
  {
    server_id: "mcp-design-tokens",
    server_name: "Zeus Material 3 Design Tokens MCP",
    name: "get_design_tokens",
    description: "Retrieve Material 3 Expressive, Apple HIG, Fluent 2, or shadcn CSS custom property tokens.",
    input_schema: { type: "object", properties: { system: { type: "string" } } },
  },
];

export async function enabledMcpTools(force = false, wait = 2500): Promise<McpToolInfo[]> {
  const { mcp } = useStore.getState().settings;
  const ids = mcp.filter((m) => m.enabled).map((m) => m.id).sort();
  if (!force && ids.length === 0) return BUILTIN_TOOLS;
  const key = ids.join(",");
  if (!force && cache && cache.key === key && Date.now() - cache.at < 5 * 60_000) return cache.tools;
  if (!inflight) {
    inflight = (async () => {
      const all = (await nativeMcp.tools()) ?? [];
      const tools = all.filter((t) => ids.includes(t.server_id) || t.server_id === "mcp-design-tokens" || t.server_id === "mcp-filesystem");
      cache = { key, at: Date.now(), tools };
      return tools;
    })().finally(() => { inflight = null; });
  }
  const stale = cache?.tools ?? BUILTIN_TOOLS;
  return Promise.race([inflight, new Promise<McpToolInfo[]>((r) => setTimeout(() => r(stale), wait))]);
}
export const resetToolCache = () => { cache = null; };

function sig(schema: unknown): string {
  const s = schema as { properties?: Record<string, { type?: string }>; required?: string[] } | null;
  const props = s?.properties ?? {};
  const keys = Object.keys(props).slice(0, 8);
  if (!keys.length) return "{}";
  return "{" + keys.map((k) => `${k}${s?.required?.includes(k) ? "" : "?"}: ${props[k]?.type ?? "any"}`).join(", ") + "}";
}

export async function toolsPrompt(opts: { design?: boolean } = { design: true }): Promise<string> {
  const st = useStore.getState();
  const ws = st.ui.workspace;
  const profile = getCodingHarnessProfile(st.settings.providerId, st.settings.modelId);
  let mcp: McpToolInfo[] = [];
  const maxMcp = profile.style === "guided_compact" ? 8 : 40;
  try { mcp = (await enabledMcpTools()).slice(0, maxMcp); } catch { /* none */ }
  const lines = [
    "## Agent tools",
    "Emit tool blocks outside `<think>` and stop your turn after the closing tag so the harness can execute and return `<tool_result>`. Never emit a placeholder tool name.",
    ws || !opts.design ? profile.toolExamples : "",
    "- `<zeus_tool name=\"web_fetch\" path=\"https://example.com\"></zeus_tool>` | `<zeus_tool name=\"memory_search\">query</zeus_tool>` | `<zeus_tool name=\"memory_save\" path=\"preferences\">durable fact</zeus_tool>` | `<zeus_tool name=\"memory_edit\" path=\"mem-id\">updated fact</zeus_tool>` | `<zeus_tool name=\"memory_delete\" path=\"mem-id\"></zeus_tool>`",
    opts.design ? studioToolsPrompt() : "",
    ...(mcp.length ? ["MCP tools, BODY is a JSON object of arguments:", ...mcp.map((t) => `- name="mcp:${t.server_id}:${t.name}" ${sig(t.input_schema)} ${t.description.replace(/\s+/g, " ").slice(0, 110)}`)] : []),
  ];
  return lines.filter(Boolean).join("\n");
}
