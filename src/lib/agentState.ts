import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isNative } from "./bridge";

/* Live agent runtime state mirrored from the native engine: interactive docks, todos, subagent runs. */

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export interface TodoItem { id: string; content: string; status: TodoStatus; priority?: "high" | "medium" | "low" }

export interface DockQuestionItem {
  header?: string;
  question: string;
  multiple?: boolean;
  custom?: boolean;
  options: Array<{ label: string; description?: string }>;
}
export interface DockQuestion { id: string; sessionId: string; questions: DockQuestionItem[] }
export interface DockPermission {
  id: string;
  sessionId: string;
  tool: string;
  title: string;
  detail?: string;
  reason?: string;
  explicit?: boolean;
}

export interface SubTool { id: string; name: string; args?: { path?: string; body?: string }; status: "running" | "ok" | "error"; output?: string }
export interface SubagentRun {
  sessionId: string;
  parentToolId: string;
  agentType: string;
  description: string;
  model?: string;
  provider?: string;
  depth: number;
  prompt?: string;
  background?: boolean;
  resumed?: boolean;
  status: "running" | "done" | "error";
  tools: SubTool[];
  text?: string;
  output?: string;
  tokens?: number;
  durationMs?: number;
}

interface AgentState {
  questions: DockQuestion[];
  permissions: DockPermission[];
  todos: Record<string, TodoItem[]>;
  subagents: Record<string, SubagentRun>;
  drawer: string | null;
  setTodos: (sessionId: string, todos: TodoItem[]) => void;
  openDrawer: (parentToolId: string | null) => void;
  clearSession: (sessionId: string) => void;
}

export const useAgent = create<AgentState>()((set) => ({
  questions: [],
  permissions: [],
  todos: {},
  subagents: {},
  drawer: null,
  setTodos: (sessionId, todos) => set((s) => ({ todos: { ...s.todos, [sessionId]: todos } })),
  openDrawer: (drawer) => set({ drawer }),
  clearSession: (sessionId) =>
    set((s) => ({
      questions: s.questions.filter((q) => q.sessionId !== sessionId),
      permissions: s.permissions.filter((p) => p.sessionId !== sessionId),
    })),
}));

const dropDock = (id: string) =>
  useAgent.setState((s) => ({
    questions: s.questions.filter((q) => q.id !== id),
    permissions: s.permissions.filter((p) => p.id !== id),
  }));

export async function answerQuestion(id: string, answers: string[][] | null) {
  dropDock(id);
  if (!isNative) return;
  await invoke("agent_answer_question", { id, answers: answers ?? [], dismissed: answers === null }).catch(() => {});
}

export async function answerPermission(id: string, decision: "once" | "always" | "deny") {
  dropDock(id);
  if (!isNative) return;
  await invoke("agent_answer_permission", { id, decision }).catch(() => {});
}

export async function cancelSubagent(sessionId: string) {
  if (isNative) await invoke("agent_subagent_cancel", { sessionId }).catch(() => {});
}

export async function subagentTranscript(sessionId: string): Promise<Array<{ role: string; content: string }>> {
  if (!isNative) return [];
  return (await invoke<Array<{ role: string; content: string }>>("agent_subagent_messages", { sessionId }).catch(() => [])) ?? [];
}

type SubEvent = {
  type: string;
  sessionId: string;
  parentToolId: string;
  id?: string;
  name?: string;
  args?: SubTool["args"];
  ok?: boolean;
  output?: string;
  text?: string;
  tokens?: number;
  durationMs?: number;
} & Partial<SubagentRun>;

function onSubagent(e: SubEvent) {
  useAgent.setState((s) => {
    const key = e.parentToolId;
    const prev = s.subagents[key];
    let next: SubagentRun | undefined = prev;
    if (e.type === "start") {
      next = {
        sessionId: e.sessionId,
        parentToolId: key,
        agentType: e.agentType ?? "explore",
        description: e.description ?? "",
        model: e.model,
        provider: e.provider,
        depth: e.depth ?? 1,
        prompt: e.prompt,
        background: e.background,
        resumed: e.resumed,
        status: "running",
        tools: prev && prev.sessionId === e.sessionId ? prev.tools : [],
      };
    } else if (prev) {
      if (e.type === "tool_call" && e.id) {
        next = { ...prev, tools: [...prev.tools, { id: e.id, name: e.name ?? "tool", args: e.args, status: "running" }] };
      } else if (e.type === "tool_result" && e.id) {
        next = { ...prev, tools: prev.tools.map((t) => (t.id === e.id ? { ...t, status: e.ok ? "ok" : "error", output: e.output } : t)) };
      } else if (e.type === "usage") next = { ...prev, tokens: e.tokens };
      else if (e.type === "text") next = { ...prev, text: e.text };
      else if (e.type === "done") next = { ...prev, status: e.ok ? "done" : "error", output: e.output, tokens: e.tokens ?? prev.tokens, durationMs: e.durationMs };
      else if (e.type === "background_result") next = { ...prev, status: e.ok ? "done" : "error" };
    }
    return next && next !== prev ? { subagents: { ...s.subagents, [key]: next } } : s;
  });
}

let started = false;
/** Subscribe once to the native `zeus://question|permission|todo|subagent|dock-clear` events. */
export function startAgentBridge() {
  if (started || !isNative) return;
  started = true;
  void listen<DockQuestion>("zeus://question", (ev) =>
    useAgent.setState((s) => ({ questions: [...s.questions.filter((q) => q.id !== ev.payload.id), ev.payload] }))
  );
  void listen<DockPermission>("zeus://permission", (ev) =>
    useAgent.setState((s) => ({ permissions: [...s.permissions.filter((p) => p.id !== ev.payload.id), ev.payload] }))
  );
  void listen<{ sessionId: string; todos: TodoItem[] }>("zeus://todo", (ev) => useAgent.getState().setTodos(ev.payload.sessionId, ev.payload.todos));
  void listen<SubEvent>("zeus://subagent", (ev) => onSubagent(ev.payload));
  void listen<{ id: string }>("zeus://dock-clear", (ev) => dropDock(ev.payload.id));
}

/** Rebuild a subagent run from a finished tool call so reopened sessions still show the row. */
export function runFromTool(toolId: string, args: string | undefined, output: string | undefined, status: string): SubagentRun {
  let a: Record<string, unknown> = {};
  try { a = JSON.parse(args ?? "{}"); } catch { /* plain */ }
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(String(a.body ?? "{}")); } catch { body = { prompt: a.body }; }
  const sid = /task_id: (\S+)/.exec(output ?? "")?.[1] ?? /session_id: (\S+)/.exec(output ?? "")?.[1] ?? "";
  return {
    sessionId: sid,
    parentToolId: toolId,
    agentType: String(body.agent ?? body.agent_type ?? body.subagent_type ?? a.path ?? "explore"),
    description: String(body.description ?? ""),
    depth: 1,
    prompt: String(body.prompt ?? ""),
    background: body.background === true,
    status: status === "running" ? "running" : status === "error" ? "error" : "done",
    tools: [],
    output: /<task_result>([\s\S]*?)<\/task_result>/.exec(output ?? "")?.[1]?.trim() ?? output,
  };
}
