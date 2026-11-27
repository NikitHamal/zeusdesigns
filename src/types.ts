export type Device = "mobile" | "tablet" | "web";
export type Tool = "select" | "hand" | "text" | "frame" | "note" | "pen" | "shape" | "pin";
export type ShapeKind = "rect" | "ellipse" | "triangle" | "line" | "arrow" | "star";
export type ViewMode = "canvas" | "grid" | "single";
export type Effort = "low" | "medium" | "high" | "max";

export interface Page { id: string; name: string; convId?: string }

export interface Artboard {
  id: string;
  pageId: string;
  name: string;
  x: number; y: number; w: number; h: number;
  device: Device;
  html: string;
  version: number;
  history: string[];
  groupId: string; // variant family
  loading?: boolean;
  source?: string; // workspace-relative file this screen is synced with
}

export interface CanvasEl {
  id: string;
  pageId: string;
  kind: "note" | "text" | "shape" | "pen";
  x: number; y: number; w: number; h: number;
  text?: string;
  color: string;
  shape?: ShapeKind;
  points?: [number, number][];
}

export interface Comment { id: string; author: "user" | "zeus"; text: string; at: number }
export interface Pin {
  id: string;
  pageId: string;
  artboardId?: string;
  x: number; y: number; // artboard-relative if artboardId, else world
  n: number;
  resolved: boolean;
  quote?: string;
  comments: Comment[];
}

export interface Attachment { id: string; name: string; mime: string; size: number; dataUrl?: string; text?: string }

export interface ToolCall {
  id: string;
  name: string;
  args?: string;
  status: "running" | "ok" | "error";
  output?: string;
  oldContent?: string;
  newContent?: string;
  additions?: number;
  deletions?: number;
  checkpointId?: string;
}

export interface PlanTask {
  id: string;
  title: string;
  state: "pending" | "active" | "done" | "blocked" | "skipped";
  note?: string;
  delegatedTo?: string;
}

export interface AgentPlan {
  tasks: PlanTask[];
  updatedAt: number;
}

export interface UserQuestionItem {
  id: string;
  header?: string;
  question: string;
  options: Array<{ label: string; description?: string; recommended?: boolean }>;
}

export interface PendingUserQuestion {
  id: string;
  questions: UserQuestionItem[];
  answered?: boolean;
}

export interface CheckpointManifest {
  id: string;
  label: string;
  createdAt: number;
  files: Array<{ path: string; existed: boolean; blob?: string }>;
}

export interface Quote { kind: "artboard" | "pin" | "element"; label: string; artboardId?: string; pinId?: string; text?: string }

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  quote?: Quote;
  attachments?: Attachment[];
  tools?: ToolCall[];
  plan?: AgentPlan;
  pendingQuestion?: PendingUserQuestion;
  checkpointId?: string;
  reasoning?: string;
  thinkMs?: number;
  artboardIds?: string[];
  model?: string;
  streaming?: boolean;
  error?: string;
  compacted?: boolean;
  truncated?: boolean;
  stats?: { tps?: number; tokens?: number; ms?: number };
  at: number;
}

export interface ProjectFolder {
  id: string;
  name: string;
  root?: string;
  tree?: FileNode[];
  expanded?: boolean;
  at: number;
}

export interface TerminalRun {
  id: string;
  projectId: string;
  cmd: string;
  cwd?: string;
  stdout: string;
  stderr: string;
  code: number;
  at: number;
  running?: boolean;
}

export interface Conversation {
  id: string;
  projectId?: string;
  title: string;
  messages: Message[];
  at: number;
  titled?: boolean;
  activePageId?: string;
  compactedCount?: number;
}

export interface CustomProvider { id: string; name: string; format: "openai" | "anthropic"; baseUrl: string; apiKey: string; model: string }
export interface McpServer { id: string; name: string; transport: "stdio" | "http" | "builtin"; command: string; args?: string[]; enabled: boolean; catalogId?: string }
export type MemoryCategory = "preferences" | "profile" | "topics" | "areas";
export interface MemoryItem { id: string; text: string; at: number; pinned?: boolean; category?: MemoryCategory }
export interface FileNode { name: string; path: string; dir: boolean; children?: FileNode[] }

export const DEVICE_SIZE: Record<Device, { w: number; h: number; label: string }> = {
  mobile: { w: 390, h: 844, label: "Mobile" },
  tablet: { w: 820, h: 1100, label: "Tablet" },
  web: { w: 1280, h: 800, label: "Web" },
};
