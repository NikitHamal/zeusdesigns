// Agent tool protocol shown to the model: built-in project tools plus whatever the enabled MCP servers expose.
import { useStore } from "../store";
import { nativeMcp, type McpToolInfo } from "./bridge";

let cache: { key: string; at: number; tools: McpToolInfo[] } | null = null;

let inflight: Promise<McpToolInfo[]> | null = null;

/** Tools of enabled servers. Discovery can take a while the first time (npx downloads), so callers get what is ready within `wait` ms. */
export async function enabledMcpTools(force = false, wait = 2500): Promise<McpToolInfo[]> {
  const { mcp } = useStore.getState().settings;
  const ids = mcp.filter((m) => m.enabled).map((m) => m.id).sort();
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
  const stale = cache?.tools ?? [];
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

export async function toolsPrompt(): Promise<string> {
  const ws = useStore.getState().ui.workspace;
  let mcp: McpToolInfo[] = [];
  try { mcp = (await enabledMcpTools()).slice(0, 40); } catch { /* none */ }
  const lines = [
    "## Agent tools",
    "To use a tool, write one block, then end your turn. The result arrives in the next message and you continue from it.",
    `<zeus_tool name="TOOL" path="ARG">BODY</zeus_tool>`,
    "Use tools only when the task needs something you cannot know otherwise: a project file, a URL the user gave, a saved fact, library docs. A plain design request needs no tools. Never invent a tool result.",
    ws ? "- read_file path=\"relative/file\" | list_dir | search_code (BODY=text to find) | write_file path=\"relative/file\" (BODY=full content) | shell (BODY=command)" : "",
    "- web_fetch path=\"https://...\" | memory (BODY=one durable fact worth keeping)",
    ...(mcp.length ? ["MCP tools, BODY is a JSON object of arguments:", ...mcp.map((t) => `- name="mcp:${t.server_id}:${t.name}" ${sig(t.input_schema)} ${t.description.replace(/\s+/g, " ").slice(0, 110)}`)] : []),
  ];
  return lines.filter(Boolean).join("\n");
}
