// Connector store. Every entry is a real, published MCP server that speaks stdio and needs no API key.
// "runtime" tells the user which launcher must exist on the machine (Node for npx, uv for uvx).
export type McpCategory = "Design" | "Browser" | "Docs" | "Code" | "Memory" | "Web";
export interface CatalogEntry {
  id: string;
  name: string;
  publisher: string;
  desc: string;
  category: McpCategory;
  icon: string;
  command: string;
  args: string[];
  runtime: "node" | "uv";
  /** Appends the open project folder to the arguments; the entry is unavailable without one. */
  needsFolder?: "append";
  link: string;
}

export const CATALOG: CatalogEntry[] = [
  { id: "shadcn", name: "shadcn/ui", publisher: "shadcn", desc: "Browse, search and install shadcn components and blocks.", category: "Design", icon: "dashboard", command: "npx", args: ["-y", "shadcn@latest", "mcp"], runtime: "node", link: "https://ui.shadcn.com/docs/mcp" },
  { id: "magicui", name: "Magic UI", publisher: "Magic UI", desc: "Animated React components and effects for landing pages.", category: "Design", icon: "auto_awesome", command: "npx", args: ["-y", "@magicuidesign/mcp@latest"], runtime: "node", link: "https://magicui.design/docs/mcp" },
  { id: "playwright", name: "Playwright", publisher: "Microsoft", desc: "Drive a real browser: open pages, click, read the page, take screenshots.", category: "Browser", icon: "language", command: "npx", args: ["-y", "@playwright/mcp@latest"], runtime: "node", link: "https://github.com/microsoft/playwright-mcp" },
  { id: "chrome-devtools", name: "Chrome DevTools", publisher: "Google", desc: "Inspect, debug and measure live pages in Chrome.", category: "Browser", icon: "bug_report", command: "npx", args: ["-y", "chrome-devtools-mcp@latest"], runtime: "node", link: "https://github.com/ChromeDevTools/chrome-devtools-mcp" },
  { id: "context7", name: "Context7", publisher: "Upstash", desc: "Current documentation and code examples for any library.", category: "Docs", icon: "menu_book", command: "npx", args: ["-y", "@upstash/context7-mcp"], runtime: "node", link: "https://github.com/upstash/context7" },
  { id: "fetch", name: "Fetch", publisher: "Model Context Protocol", desc: "Fetch a URL and return it as clean markdown.", category: "Web", icon: "download", command: "uvx", args: ["mcp-server-fetch"], runtime: "uv", link: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch" },
  { id: "duckduckgo", name: "DuckDuckGo search", publisher: "Nick Clyde", desc: "Web search and page fetch with no API key.", category: "Web", icon: "search", command: "uvx", args: ["duckduckgo-mcp-server"], runtime: "uv", link: "https://github.com/nickclyde/duckduckgo-mcp-server" },
  { id: "open-websearch", name: "Open WebSearch", publisher: "Aas-ee", desc: "Multi-engine web search without keys.", category: "Web", icon: "language", command: "npx", args: ["-y", "open-websearch@latest"], runtime: "node", link: "https://github.com/Aas-ee/open-webSearch" },
  { id: "wikipedia", name: "Wikipedia", publisher: "Rudra Ravi", desc: "Search and read Wikipedia articles.", category: "Docs", icon: "menu_book", command: "uvx", args: ["wikipedia-mcp"], runtime: "uv", link: "https://github.com/Rudra-ravi/wikipedia-mcp" },
  { id: "markitdown", name: "MarkItDown", publisher: "Microsoft", desc: "Turn PDF, Office files and web pages into markdown.", category: "Docs", icon: "description", command: "uvx", args: ["markitdown-mcp"], runtime: "uv", link: "https://github.com/microsoft/markitdown" },
  { id: "filesystem", name: "Filesystem", publisher: "Model Context Protocol", desc: "Read, write, move and search files inside your project folder.", category: "Code", icon: "folder_open", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], runtime: "node", needsFolder: "append", link: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem" },
  { id: "memory", name: "Knowledge graph", publisher: "Model Context Protocol", desc: "A persistent entity and relation graph the agent can query.", category: "Memory", icon: "hub", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], runtime: "node", link: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory" },
  { id: "sequential-thinking", name: "Sequential thinking", publisher: "Model Context Protocol", desc: "Structured step-by-step reasoning for hard problems.", category: "Memory", icon: "psychology", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], runtime: "node", link: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking" },
  { id: "time", name: "Time", publisher: "Model Context Protocol", desc: "Current time and timezone conversion.", category: "Web", icon: "schedule", command: "uvx", args: ["mcp-server-time"], runtime: "uv", link: "https://github.com/modelcontextprotocol/servers/tree/main/src/time" },
];

export const BUILTIN_TOOLS: { name: string; desc: string; icon: string }[] = [
  { name: "read_file", desc: "Read a file from the open project folder", icon: "description" },
  { name: "write_file", desc: "Create or overwrite a project file", icon: "edit" },
  { name: "list_dir", desc: "List the project tree", icon: "folder_open" },
  { name: "search_code", desc: "Search project source for a string", icon: "search" },
  { name: "shell", desc: "Run a command inside the project folder", icon: "terminal" },
  { name: "web_fetch", desc: "Fetch the text of a web page", icon: "download" },
  { name: "memory", desc: "Save a fact to Zeus memory", icon: "psychology" },
];

export const BUILTIN_SERVERS: { id: string; name: string; desc: string; icon: string }[] = [
  { id: "mcp-design-tokens", name: "Design tokens", desc: "Exact CSS variables for any of the 13 design systems.", icon: "palette" },
  { id: "mcp-filesystem", name: "Workspace sync", desc: "Write a screen's HTML into the project folder.", icon: "sync" },
];
