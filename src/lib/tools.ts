// Agent tool protocol shown to the model: selects ONE canonical protocol per provider
// (native OpenAI/Anthropic function calling where supported, or <zeus_tool> XML DSL where not).
import { useStore } from "../store";
import { nativeMcp, type McpToolInfo } from "./bridge";
import { getCodingHarnessProfile } from "./codingHarness";
import { ModelProfiles, STORMY_TOOLS } from "./stormyAgent";
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
      const tools = all.filter(
        (t) => ids.includes(t.server_id) || t.server_id === "mcp-design-tokens" || t.server_id === "mcp-filesystem"
      );
      cache = { key, at: Date.now(), tools };
      return tools;
    })().finally(() => {
      inflight = null;
    });
  }
  const stale = cache?.tools ?? BUILTIN_TOOLS;
  return Promise.race([inflight, new Promise<McpToolInfo[]>((r) => setTimeout(() => r(stale), wait))]);
}
export const resetToolCache = () => {
  cache = null;
};

function sig(schema: unknown): string {
  const s = schema as { properties?: Record<string, { type?: string }>; required?: string[] } | null;
  const props = s?.properties ?? {};
  const keys = Object.keys(props).slice(0, 8);
  if (!keys.length) return "{}";
  return (
    "{" +
    keys.map((k) => `${k}${s?.required?.includes(k) ? "" : "?"}: ${props[k]?.type ?? "any"}`).join(", ") +
    "}"
  );
}

export async function toolsPrompt(opts: { design?: boolean } = { design: true }): Promise<string> {
  const st = useStore.getState();
  const ws = st.ui.workspace;
  const profile = getCodingHarnessProfile(st.settings.providerId, st.settings.modelId);
  const stormyProfile = ModelProfiles.forIds(st.settings.providerId, st.settings.modelId);
  let mcp: McpToolInfo[] = [];
  const maxMcp = profile.style === "guided_compact" ? 8 : 40;
  try {
    mcp = (await enabledMcpTools()).slice(0, maxMcp);
  } catch {
    /* none */
  }

  const usesNativeTools =
    profile.nativeToolProtocol === "openai_tools" || profile.nativeToolProtocol === "anthropic_tool_use";

  const protocolSection = usesNativeTools
    ? [
        "## Agent Tools (Native Function Calling)",
        "Invoke workspace, shell, python, git, search, plan, and memory tools using the native tool/function-calling API provided in this request.",
        "- Pass complete, un-truncated file contents or exact search/replace blocks in your tool arguments.",
        "- You may batch independent read/search calls in a single turn; they execute in dependency-ordered waves after your response stream finishes.",
        "- Never fabricate tool output or write `<tool_result>` yourself.",
        "",
        "Available Workspace & Engineering Tools (`?` = optional):",
        ...STORMY_TOOLS.map((t) => `- \`${t.signature}\` — ${t.summary}`),
        `- \`memory_search(query: string, path?: string)\` | \`memory_save(content: string, path?: string)\` | \`memory_edit(path: string, content: string)\` | \`memory_delete(path: string)\``,
        `- \`lmfingerprint(path: string)\` — verify whether a provider/model is genuine direct or routed under the hood.`,
      ].join("\n")
    : [
        "## Agent Tools (Zeus XML Protocol)",
        "Emit `<zeus_tool>` blocks in your final response (never inside internal reasoning) and stop your turn after the closing tag so the harness can execute them after stream completion and return `<tool_result>`.",
        ws || !opts.design ? profile.toolExamples : "",
        "- `<zeus_tool name=\"web_fetch\" path=\"https://example.com\"></zeus_tool>` | `<zeus_tool name=\"lmfingerprint\" path=\"provider/model\"></zeus_tool>` | `<zeus_tool name=\"memory_search\">query</zeus_tool>` | `<zeus_tool name=\"memory_save\" path=\"preferences\">durable fact</zeus_tool>` | `<zeus_tool name=\"memory_edit\" path=\"mem-id\">updated fact</zeus_tool>` | `<zeus_tool name=\"memory_delete\" path=\"mem-id\"></zeus_tool>`",
        "",
        "Additional Workspace Tools (pass JSON arguments in body when multiple parameters are needed):",
        ...STORMY_TOOLS.map((t) => `- \`${t.signature}\` — ${t.summary}`),
      ]
        .filter(Boolean)
        .join("\n");

  const lines = [
    protocolSection,
    stormyProfile.promptSection,
    opts.design ? studioToolsPrompt() : "",
    ...(mcp.length
      ? [
          "MCP tools (pass JSON object of arguments):",
          ...mcp.map(
            (t) =>
              `- name="mcp:${t.server_id}:${t.name}" ${sig(t.input_schema)} ${t.description
                .replace(/\s+/g, " ")
                .slice(0, 110)}`
          ),
        ]
      : []),
  ];
  return lines.filter(Boolean).join("\n\n");
}
