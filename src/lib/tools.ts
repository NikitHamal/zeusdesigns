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
    "When you need to inspect or modify the workspace, run shell/python commands, or fetch a URL, emit a `<zeus_tool>` block outside `<think>` and stop your turn so the harness can return `<tool_result>`. Never emit a literal placeholder name; always use one of the exact tool names below.",
    ws ? `- \`<zeus_tool name="shell">command</zeus_tool>\` — run any bash/cmd/git/npm/cargo/python command in \`${ws.root || ws.name}\`
- \`<zeus_tool name="python">python_script_code</zeus_tool>\` — execute inline Python 3 script directly in the workspace
- \`<zeus_tool name="read_file" path="relative/file" start="1" end="200"></zeus_tool>\` — read file lines
- \`<zeus_tool name="write_file" path="relative/file">full_file_content</zeus_tool>\` — create or overwrite a file (do NOT call \`list_dir\` before creating a requested file if the path is already clear)
- \`<zeus_tool name="edit_file" path="relative/file"><<<<<<< SEARCH\\nexact existing lines\\n=======\\nnew lines\\n>>>>>>> REPLACE</zeus_tool>\` — surgical exact search/replace
- \`<zeus_tool name="search_code">pattern</zeus_tool>\` — fast substring search across the repo
- \`<zeus_tool name="list_dir" path=""></zeus_tool>\` — list directory tree (top-level files are already listed in \`## Project\` above; do NOT call \`list_dir\` on \`.\` if top-level files are already shown)` : "",
    "- `<zeus_tool name=\"web_fetch\" path=\"https://...\"></zeus_tool>` | `<zeus_tool name=\"memory\">one durable fact worth keeping</zeus_tool>`",
    opts.design ? studioToolsPrompt() : "",
    ...(mcp.length ? ["MCP tools, BODY is a JSON object of arguments:", ...mcp.map((t) => `- name="mcp:${t.server_id}:${t.name}" ${sig(t.input_schema)} ${t.description.replace(/\s+/g, " ").slice(0, 110)}`)] : []),
  ];
  return lines.filter(Boolean).join("\n");
}
