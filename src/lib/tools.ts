// Agent tool protocol shown to the model: built-in project tools plus whatever the enabled MCP servers expose.
import { useStore } from "../store";
import { nativeMcp, type McpToolInfo } from "./bridge";
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
  const ws = useStore.getState().ui.workspace;
  let mcp: McpToolInfo[] = [];
  try { mcp = (await enabledMcpTools()).slice(0, 40); } catch { /* none */ }
  const lines = [
    "## Agent tools",
    "To use a tool, write one block, then end your turn. The result arrives in the next message and you continue from it.",
    `<zeus_tool name="TOOL" path="ARG">BODY</zeus_tool>`,
    "Use tools only when the task needs something you cannot know otherwise: a project file, a URL the user gave, a saved fact, library docs. Never invent a tool result. One tool block per turn.",
    ws ? "- read_file path=\"relative/file\" [start=\"1\" end=\"200\"] | list_dir [path=\"sub/dir\"] | search_code (BODY=text to find) | write_file path=\"relative/file\" (BODY=full content) | shell (BODY=command)" : "",
    ws ? "- edit_file path=\"relative/file\" BODY: one or more blocks\n<<<<<<< SEARCH\nexact existing lines\n=======\nnew lines\n>>>>>>> REPLACE\nSEARCH must match the file exactly and occur once; add surrounding lines to make it unique." : "",
    "- web_fetch path=\"https://...\" | memory (BODY=one durable fact worth keeping)",
    opts.design ? studioToolsPrompt() : "",
    ...(mcp.length ? ["MCP tools, BODY is a JSON object of arguments:", ...mcp.map((t) => `- name="mcp:${t.server_id}:${t.name}" ${sig(t.input_schema)} ${t.description.replace(/\s+/g, " ").slice(0, 110)}`)] : []),
  ];
  return lines.filter(Boolean).join("\n");
}
