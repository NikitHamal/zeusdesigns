import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { McpServer } from "../types";
import { BUILTIN_SERVERS, BUILTIN_TOOLS, CATALOG, type CatalogEntry, type McpCategory } from "../lib/mcpCatalog";
import { isNative, nativeMcp, type McpToolInfo } from "../lib/bridge";
import { enabledMcpTools, resetToolCache } from "../lib/tools";
import { Toggle } from "./ui";
import { Icon } from "./Icon";
import { cn } from "../utils/cn";

const field = "h-10 w-full rounded-xl border border-outline-variant bg-transparent px-3 text-sm text-on-surface outline-none focus:border-primary placeholder:text-on-surface-variant/60";
const CATS: ("All" | McpCategory)[] = ["All", "Design", "Browser", "Docs", "Code", "Memory", "Web"];

function splitCommand(line: string): { command: string; args: string[] } {
  const parts = (line.match(/"[^"]*"|\S+/g) ?? []).map((p) => p.replace(/^"|"$/g, ""));
  return { command: parts[0] ?? "", args: parts.slice(1) };
}

function install(entry: Pick<CatalogEntry, "id" | "name" | "command" | "args">, extraArgs: string[] = []) {
  const st = useStore.getState();
  const srv: McpServer = { id: `mcp-${entry.id}`, name: entry.name, transport: "stdio", command: entry.command, args: [...entry.args, ...extraArgs], enabled: true, catalogId: entry.id };
  st.patchSettings({ mcp: [...st.settings.mcp.filter((m) => m.id !== srv.id), srv] });
  nativeMcp.add({ id: srv.id, name: srv.name, command: srv.command, args: srv.args, transport: "stdio" });
  resetToolCache();
  void enabledMcpTools(true, 0);
  st.notify(`${entry.name} installed`);
}

function uninstall(id: string) {
  const st = useStore.getState();
  st.patchSettings({ mcp: st.settings.mcp.filter((m) => m.id !== id) });
  nativeMcp.remove(id);
  resetToolCache();
}

function Row({ icon, title, sub, right, onClick }: { icon: string; title: string; sub?: string; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("flex items-center gap-3 border-b border-outline-variant/60 px-1 py-3 last:border-b-0", onClick && "cursor-pointer")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-high text-on-surface-variant"><Icon name={icon} size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-on-surface">{title}</span>{sub && <span className="block truncate text-[13px] text-on-surface-variant">{sub}</span>}</span>
      {right}
    </div>
  );
}

function ToolList({ server }: { server: McpServer }) {
  const [state, setState] = useState<{ loading: boolean; tools: McpToolInfo[] | null; err?: string }>({ loading: false, tools: null });
  const load = async () => {
    setState({ loading: true, tools: null });
    try {
      resetToolCache();
      const all = await enabledMcpTools(true, 120000);
      const mine = all.filter((t) => t.server_id === server.id);
      setState({ loading: false, tools: mine, err: mine.length ? undefined : "The server did not report any tools" });
    } catch (e) { setState({ loading: false, tools: null, err: (e as Error).message }); }
  };
  return (
    <div className="pb-3 pl-12">
      {!state.tools && !state.loading && (
        <button onClick={load} className="state h-8 rounded-lg border border-outline-variant px-3 text-[13px] font-medium text-on-surface">Test connection</button>
      )}
      {state.loading && <span className="flex items-center gap-2 text-[13px] text-on-surface-variant"><span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />Starting server</span>}
      {state.err && <div className="text-[13px] text-error">{state.err}</div>}
      {state.tools && state.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{state.tools.map((t) => <span key={t.name} title={t.description} className="rounded-md bg-surface-high px-2 py-1 font-mono text-xs text-on-surface">{t.name}</span>)}</div>
      )}
    </div>
  );
}

export function ConnectorsTab() {
  const mcp = useStore((s) => s.settings.mcp);
  const ws = useStore((s) => s.ui.workspace);
  const patch = useStore((s) => s.patchSettings);
  const [view, setView] = useState<"installed" | "store">("installed");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"All" | McpCategory>("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [custom, setCustom] = useState({ name: "", line: "" });
  const [showCustom, setShowCustom] = useState(false);
  const list = useMemo(() => CATALOG.filter((c) => (cat === "All" || c.category === cat) && (c.name + c.desc + c.publisher).toLowerCase().includes(q.toLowerCase())), [q, cat]);
  const has = (id: string) => mcp.some((m) => m.id === `mcp-${id}`);

  const addCustom = () => {
    const { command, args } = splitCommand(custom.line);
    if (!custom.name.trim() || !command) return;
    install({ id: custom.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom", name: custom.name.trim(), command, args });
    setCustom({ name: "", line: "" }); setShowCustom(false); setView("installed");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-outline-variant">
        {(["installed", "store"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={cn("-mb-px h-10 border-b-2 px-3 text-sm font-medium capitalize", view === v ? "border-on-surface text-on-surface" : "border-transparent text-on-surface-variant")}>{v === "installed" ? `Installed${mcp.length ? ` · ${mcp.length}` : ""}` : "Store"}</button>
        ))}
      </div>

      {view === "installed" ? (
        <div className="space-y-6">
          <section>
            <h4 className="mb-1 text-[13px] font-medium text-on-surface-variant">Built in</h4>
            <div>
              {BUILTIN_SERVERS.map((b) => <Row key={b.id} icon={b.icon} title={b.name} sub={b.desc} right={<span className="text-[13px] text-on-surface-variant">Always on</span>} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">{BUILTIN_TOOLS.map((t) => <span key={t.name} title={t.desc} className="rounded-md bg-surface-high px-2 py-1 font-mono text-xs text-on-surface">{t.name}</span>)}</div>
          </section>
          <section>
            <h4 className="mb-1 text-[13px] font-medium text-on-surface-variant">Your connectors</h4>
            {mcp.length === 0 && (
              <div className="flex items-center justify-between rounded-xl border border-dashed border-outline-variant px-4 py-5 text-sm text-on-surface-variant">
                No connectors yet
                <button onClick={() => setView("store")} className="state h-9 rounded-lg bg-on-surface px-4 text-[13px] font-medium text-surface">Browse the store</button>
              </div>
            )}
            {mcp.map((m) => (
              <div key={m.id}>
                <Row
                  icon={CATALOG.find((c) => c.id === m.catalogId)?.icon ?? "extension"} title={m.name} sub={[m.command, ...(m.args ?? [])].join(" ")}
                  onClick={() => setOpenId(openId === m.id ? null : m.id)}
                  right={
                    <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Toggle on={m.enabled} onChange={(v) => { patch({ mcp: mcp.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)) }); resetToolCache(); }} />
                      <button title="Remove" aria-label="Remove" onClick={() => uninstall(m.id)} className="state grid size-8 place-items-center rounded-lg text-on-surface-variant"><Icon name="delete" size={17} /></button>
                    </span>
                  }
                />
                {openId === m.id && <ToolList server={m} />}
              </div>
            ))}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1"><Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" /><input className={cn(field, "pl-9")} placeholder="Search connectors" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button onClick={() => setShowCustom(!showCustom)} className="state flex h-10 items-center gap-1.5 rounded-xl border border-outline-variant px-3 text-sm font-medium text-on-surface"><Icon name="add" size={16} />Custom</button>
          </div>
          {showCustom && (
            <div className="grid gap-2 rounded-xl border border-outline-variant p-3 sm:grid-cols-[180px_1fr_auto]">
              <input className={field} placeholder="Name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
              <input className={cn(field, "font-mono")} placeholder="npx -y @scope/server-name" value={custom.line} onChange={(e) => setCustom({ ...custom, line: e.target.value })} />
              <button onClick={addCustom} disabled={!custom.name.trim() || !custom.line.trim()} className="state h-10 rounded-xl bg-on-surface px-4 text-sm font-medium text-surface">Add</button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={cn("state h-8 rounded-lg px-3 text-[13px] font-medium", cat === c ? "bg-surface-highest text-on-surface" : "text-on-surface-variant")}>{c}</button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((c) => {
              const on = has(c.id);
              const blocked = !isNative ? "Desktop app only" : c.needsFolder && !ws?.root ? "Open a project folder first" : "";
              return (
                <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-outline-variant p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-high text-on-surface"><Icon name={c.icon} size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-on-surface">{c.name}</span>
                      <span className="block text-xs text-on-surface-variant">{c.publisher} · needs {c.runtime === "node" ? "Node.js" : "uv"}</span>
                    </span>
                  </div>
                  <p className="flex-1 text-[13px] leading-snug text-on-surface-variant">{c.desc}</p>
                  <div className="flex items-center gap-2">
                    {on ? (
                      <button onClick={() => uninstall(`mcp-${c.id}`)} className="state h-9 flex-1 rounded-lg border border-outline-variant text-[13px] font-medium text-on-surface">Remove</button>
                    ) : (
                      <button disabled={!!blocked} onClick={() => install(c, c.needsFolder && ws?.root ? [ws.root] : [])} className="state h-9 flex-1 rounded-lg bg-on-surface text-[13px] font-medium text-surface">{blocked || "Install"}</button>
                    )}
                    <a href={c.link} target="_blank" rel="noreferrer" title="Documentation" className="state grid size-9 place-items-center rounded-lg text-on-surface-variant"><Icon name="open_in_new" size={17} /></a>
                  </div>
                </div>
              );
            })}
          </div>
          {list.length === 0 && <div className="py-10 text-center text-sm text-on-surface-variant">No connectors match</div>}
        </div>
      )}
    </div>
  );
}
