import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Artboard, CanvasEl, MemoryCategory, Comment, Conversation, CustomProvider, Effort, McpServer, MemoryItem, Message, Page, Pin,
  ProjectFolder, ShapeKind, TerminalRun, Tool, ViewMode,
} from "./types";
import { DEVICE_SIZE } from "./types";
import { DESIGN_SYSTEMS, getDS } from "./lib/designSystems";
import { rethemeHtml } from "./lib/harness";
import { SKILLS } from "./lib/skills";
import { blankFrame } from "./lib/templates";
import { applyTheme } from "./lib/theme";
import type { Workspace } from "./lib/bridge";
import type { UpdateInfo } from "./lib/updater";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export const DEFAULT_PROJECT_ID = "proj-default";

import type { OpenDesignCreationMode, VideoAspectRatio } from "./lib/openDesign";

export interface Settings {
  theme: "light" | "dark" | "system";
  hue: number;
  providerId: string;
  modelId: string;
  effort: Effort;
  designSystemId: string;
  openDesignMode?: OpenDesignCreationMode;
  openDesignBrandId?: string;
  openDesignAspect?: VideoAspectRatio;
  skills: string[];
  customProviders: CustomProvider[];
  mcp: McpServer[];
  memory: MemoryItem[];
  autoTitle: boolean;
  webSearch: boolean;
  memoryOn: boolean;
  selfCheck: boolean;
  studioOn: boolean;
  learnOn: boolean;
  askBeforeBuilding?: boolean;
  autonomy?: "unleashed" | "leashed";
  agentRuntime?: "zeus" | "opencode";
}
export interface Viewport { x: number; y: number; z: number }

interface UI {
  settingsOpen: boolean;
  settingsTab: string;
  leftTab: "chat" | "files" | "terminal";
  odTab?: "studio" | "design-systems" | "skills" | "deliverables";
  compare: string[] | null;
  interactId: string | null;
  editId: string | null;
  openPinId: string | null;
  focusArtboard: string | null;
  toast: string | null;
  workspace: Workspace | null;
  nativeReady: boolean;
  chatCollapsed: boolean;
  sidebarOpen: boolean;
  showCanvas: boolean;
  m3e: { title: string; link: string } | null;
  update: UpdateInfo | null;
  version: string;
}

interface State {
  projectName: string;
  projects: ProjectFolder[];
  activeProjectId: string;
  terminalHistory: TerminalRun[];
  pages: Page[];
  activePageId: string;
  artboards: Artboard[];
  elements: CanvasEl[];
  pins: Pin[];
  conversations: Conversation[];
  activeConvId: string;
  viewport: Record<string, Viewport>;
  view: ViewMode;
  tool: Tool;
  shape: ShapeKind;
  sel: string[];
  settings: Settings;
  ui: UI;
  busy: boolean;
  // actions
  patchSettings: (p: Partial<Settings>) => void;
  patchUI: (p: Partial<UI>) => void;
  notify: (m: string) => void;
  setProjectName: (n: string) => void;
  addOrSelectProject: (ws: Workspace) => string;
  setActiveProject: (projectId: string) => void;
  toggleProjectExpanded: (projectId: string) => void;
  renameProject: (projectId: string, name: string) => void;
  removeProject: (projectId: string) => void;
  addTerminalRun: (run: TerminalRun) => void;
  patchTerminalRun: (id: string, p: Partial<TerminalRun>) => void;
  clearTerminal: (projectId?: string) => void;
  setTool: (t: Tool) => void;
  setShape: (s: ShapeKind) => void;
  setView: (v: ViewMode) => void;
  setSel: (ids: string[]) => void;
  setViewport: (pageId: string, v: Viewport) => void;
  addPage: () => void;
  renamePage: (id: string, name: string) => void;
  deletePage: (id: string) => void;
  setActivePage: (id: string) => void;
  slot: (pageId: string, w: number, h: number) => { x: number; y: number };
  addArtboard: (a: Partial<Artboard> & { html: string }) => Artboard;
  addBlankFrame: (x: number, y: number, w: number, h: number) => Artboard;
  updateArtboard: (id: string, p: Partial<Artboard>) => void;
  reviseArtboard: (id: string, html: string) => void;
  restoreVersion: (id: string, idx: number) => void;
  removeArtboards: (ids: string[]) => void;
  duplicateArtboard: (id: string) => string | null;
  addElement: (e: Omit<CanvasEl, "id" | "pageId">) => CanvasEl;
  updateElement: (id: string, p: Partial<CanvasEl>) => void;
  removeElements: (ids: string[]) => void;
  addPin: (p: Omit<Pin, "id" | "pageId" | "n" | "resolved" | "comments">, text: string) => Pin;
  updatePin: (id: string, p: Partial<Pin>) => void;
  addComment: (pinId: string, c: Omit<Comment, "id" | "at">) => void;
  removePin: (id: string) => void;
  newConversation: (projectId?: string) => string;
  setActiveConv: (id: string) => void;
  deleteConv: (id: string) => void;
  setTitle: (id: string, t: string) => void;
  addMessage: (convId: string, m: Message) => void;
  patchMessage: (convId: string, id: string, p: Partial<Message>) => void;
  addMemory: (text: string, category?: MemoryCategory) => void;
  removeMemory: (id: string) => void;
  setBusy: (b: boolean) => void;
}

const defaultProject: ProjectFolder = {
  id: DEFAULT_PROJECT_ID,
  name: "Workspace",
  expanded: true,
  at: Date.now(),
};

const firstConv = (projectId = DEFAULT_PROJECT_ID): Conversation => ({
  id: uid(),
  projectId,
  title: "New chat",
  messages: [],
  at: Date.now(),
});
const conv0 = firstConv(DEFAULT_PROJECT_ID);
const firstPage: Page = { id: "p1", name: "Page 1", convId: conv0.id };
conv0.activePageId = firstPage.id;

function projectToWorkspace(proj?: ProjectFolder): Workspace | null {
  if (!proj) return null;
  if (!proj.root && (!proj.tree || proj.tree.length === 0)) return null;
  return { name: proj.name, root: proj.root, tree: proj.tree ?? [] };
}

// Debounced localStorage so drags / pans don't serialize the whole project every frame.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const debouncedStorage = createJSONStorage(() => ({
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(k, v); } catch { /* quota */ } }, 600); },
  removeItem: (k: string) => localStorage.removeItem(k),
}));

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      projectName: "Workspace",
      projects: [defaultProject],
      activeProjectId: defaultProject.id,
      terminalHistory: [],
      pages: [firstPage],
      activePageId: firstPage.id,
      artboards: [],
      elements: [],
      pins: [],
      conversations: [conv0],
      activeConvId: conv0.id,
      viewport: {},
      view: "canvas",
      tool: "select",
      shape: "rect",
      sel: [],
      busy: false,
      settings: {
        theme: "dark", hue: 17, providerId: "mercury3", modelId: "mercury-3", effort: "medium",
        designSystemId: "m3e", skills: SKILLS.filter((s) => s.default).map((s) => s.id),
        customProviders: [], mcp: [], memory: [], autoTitle: true, webSearch: false, memoryOn: true, selfCheck: true, studioOn: true, learnOn: true,
      },
      ui: {
        settingsOpen: false, settingsTab: "providers", leftTab: "chat", compare: null, interactId: null, editId: null, openPinId: null,
        focusArtboard: null, toast: null, workspace: null, nativeReady: false, chatCollapsed: false,
        sidebarOpen: true, showCanvas: false, m3e: null, update: null, version: "",
      },

      patchSettings: (p) => set((s) => {
        const nextSettings = { ...s.settings, ...p };
        if (p.theme !== undefined || p.hue !== undefined) {
          try { applyTheme(nextSettings.theme, nextSettings.hue); } catch { /* ignore */ }
        }
        if (p.designSystemId && p.designSystemId !== s.settings.designSystemId) {
          const ds = getDS(p.designSystemId);
          return {
            settings: nextSettings,
            artboards: s.artboards.map((a) =>
              a.pageId === s.activePageId ? { ...a, html: rethemeHtml(a.html, ds) } : a
            ),
          };
        }
        return { settings: nextSettings };
      }),
      patchUI: (p) => set((s) => {
        const nextUi = { ...s.ui, ...p };
        if (p.workspace !== undefined && p.workspace !== null) {
          const ws = p.workspace;
          const projects = s.projects.map((proj) =>
            proj.id === s.activeProjectId
              ? { ...proj, name: ws.name || proj.name, root: ws.root ?? proj.root, tree: undefined }
              : proj
          );
          return { ui: nextUi, projects };
        }
        return { ui: nextUi };
      }),
      notify: (m) => {
        set((s) => ({ ui: { ...s.ui, toast: m } }));
        setTimeout(() => set((s) => (s.ui.toast === m ? { ui: { ...s.ui, toast: null } } : s)), 2600);
      },
      setProjectName: (n) => set({ projectName: n }),

      addOrSelectProject: (ws) => {
        const s = get();
        const normRoot = ws.root?.replace(/[\\/]+$/, "").toLowerCase();
        const existing = s.projects.find((p) =>
          normRoot ? p.root?.replace(/[\\/]+$/, "").toLowerCase() === normRoot : p.name.toLowerCase() === ws.name.toLowerCase() && !p.root
        );
        if (existing) {
          const updatedProjects = s.projects.map((p) =>
            p.id === existing.id ? { ...p, name: ws.name, root: ws.root ?? p.root, tree: undefined, expanded: true, at: Date.now() } : p
          );
          const projConvs = s.conversations.filter((c) => (c.projectId ?? DEFAULT_PROJECT_ID) === existing.id);
          if (projConvs.length > 0) {
            const targetConv = projConvs.find((c) => c.id === s.activeConvId) ?? projConvs[0];
            const nextPage = targetConv.activePageId ?? s.activePageId;
            set({
              projects: updatedProjects,
              activeProjectId: existing.id,
              projectName: existing.name,
              activeConvId: targetConv.id,
              activePageId: nextPage,
              ui: { ...s.ui, workspace: ws, leftTab: "chat" },
            });
          } else {
            const nc = firstConv(existing.id);
            const np: Page = { id: uid(), name: "Page 1", convId: nc.id };
            nc.activePageId = np.id;
            set({
              projects: updatedProjects,
              activeProjectId: existing.id,
              projectName: existing.name,
              conversations: [nc, ...s.conversations],
              pages: [...s.pages, np],
              activeConvId: nc.id,
              activePageId: np.id,
              ui: { ...s.ui, workspace: ws, showCanvas: false, leftTab: "chat" },
            });
          }
          return existing.id;
        }

        // If the default project has no root path yet, bind this first local folder directly to it so current chats stay in it
        const def = s.projects.find((p) => p.id === DEFAULT_PROJECT_ID && !p.root && s.projects.length === 1);
        if (def) {
          const updatedProjects = s.projects.map((p) =>
            p.id === DEFAULT_PROJECT_ID ? { ...p, name: ws.name, root: ws.root, tree: undefined, expanded: true, at: Date.now() } : p
          );
          set({
            projects: updatedProjects,
            activeProjectId: DEFAULT_PROJECT_ID,
            projectName: ws.name,
            ui: { ...s.ui, workspace: ws, leftTab: "chat" },
          });
          return DEFAULT_PROJECT_ID;
        }

        const newProj: ProjectFolder = {
          id: uid(),
          name: ws.name,
          root: ws.root,
          tree: undefined,
          expanded: true,
          at: Date.now(),
        };
        const nc = firstConv(newProj.id);
        const np: Page = { id: uid(), name: "Page 1", convId: nc.id };
        nc.activePageId = np.id;
        set({
          projects: [newProj, ...s.projects],
          activeProjectId: newProj.id,
          projectName: newProj.name,
          conversations: [nc, ...s.conversations],
          pages: [...s.pages, np],
          activeConvId: nc.id,
          activePageId: np.id,
          sel: [],
          ui: { ...s.ui, workspace: ws, showCanvas: false, editId: null, interactId: null, openPinId: null },
        });
        return newProj.id;
      },

      setActiveProject: (projectId) => set((s) => {
        const proj = s.projects.find((p) => p.id === projectId);
        if (!proj) return s;
        const projects = s.projects.map((p) => (p.id === projectId ? { ...p, expanded: true } : p));
        const projConvs = s.conversations.filter((c) => (c.projectId ?? DEFAULT_PROJECT_ID) === projectId);
        const ws = projectToWorkspace(proj);
        if (projConvs.length > 0) {
          const nextConv = projConvs.find((c) => c.id === s.activeConvId) ?? projConvs[0];
          const mine = s.pages.filter((p) => p.convId === nextConv.id);
          const nextPageId = (nextConv.activePageId && mine.some((p) => p.id === nextConv.activePageId))
            ? nextConv.activePageId
            : (mine[0]?.id ?? s.activePageId);
          return {
            projects,
            activeProjectId: projectId,
            projectName: proj.name,
            activeConvId: nextConv.id,
            activePageId: nextPageId,
            sel: [],
            ui: { ...s.ui, workspace: ws, showCanvas: convArtifactCount(s, nextConv.id) > 0, editId: null, interactId: null, openPinId: null },
          };
        }
        const nc = firstConv(projectId);
        const np: Page = { id: uid(), name: "Page 1", convId: nc.id };
        nc.activePageId = np.id;
        return {
          projects,
          activeProjectId: projectId,
          projectName: proj.name,
          conversations: [nc, ...s.conversations],
          pages: [...s.pages, np],
          activeConvId: nc.id,
          activePageId: np.id,
          sel: [],
          ui: { ...s.ui, workspace: ws, showCanvas: false, editId: null, interactId: null, openPinId: null },
        };
      }),

      toggleProjectExpanded: (projectId) => set((s) => ({
        projects: s.projects.map((p) => (p.id === projectId ? { ...p, expanded: !(p.expanded ?? true) } : p)),
      })),

      renameProject: (projectId, name) => set((s) => {
        const trimmed = name.trim();
        if (!trimmed) return s;
        return {
          projects: s.projects.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p)),
          projectName: s.activeProjectId === projectId ? trimmed : s.projectName,
          ui: s.activeProjectId === projectId && s.ui.workspace ? { ...s.ui, workspace: { ...s.ui.workspace, name: trimmed } } : s.ui,
        };
      }),

      removeProject: (projectId) => set((s) => {
        let projects = s.projects.filter((p) => p.id !== projectId);
        if (!projects.length) {
          projects = [{ id: DEFAULT_PROJECT_ID, name: "Workspace", expanded: true, at: Date.now() }];
        }
        const deadConvIds = new Set(s.conversations.filter((c) => (c.projectId ?? DEFAULT_PROJECT_ID) === projectId).map((c) => c.id));
        const deadPageIds = new Set(s.pages.filter((p) => p.convId && deadConvIds.has(p.convId)).map((p) => p.id));
        let conversations = s.conversations.filter((c) => !deadConvIds.has(c.id));
        let pages = s.pages.filter((p) => !deadPageIds.has(p.id));
        const nextProj = s.activeProjectId === projectId ? projects[0] : (projects.find((p) => p.id === s.activeProjectId) ?? projects[0]);
        let nextProjConvs = conversations.filter((c) => (c.projectId ?? DEFAULT_PROJECT_ID) === nextProj.id);
        if (!nextProjConvs.length) {
          const nc = firstConv(nextProj.id);
          const np: Page = { id: uid(), name: "Page 1", convId: nc.id };
          nc.activePageId = np.id;
          conversations = [nc, ...conversations];
          pages = [...pages, np];
          nextProjConvs = [nc];
        }
        const nextConv = nextProjConvs[0];
        const nextPageId = nextConv.activePageId ?? pages[0]?.id ?? "p1";
        return {
          projects,
          activeProjectId: nextProj.id,
          projectName: nextProj.name,
          conversations,
          pages,
          activeConvId: nextConv.id,
          activePageId: nextPageId,
          artboards: s.artboards.filter((a) => !deadPageIds.has(a.pageId)),
          elements: s.elements.filter((e) => !deadPageIds.has(e.pageId)),
          pins: s.pins.filter((p) => !deadPageIds.has(p.pageId)),
          terminalHistory: s.terminalHistory.filter((t) => t.projectId !== projectId),
          sel: [],
          ui: { ...s.ui, workspace: projectToWorkspace(nextProj), showCanvas: false },
        };
      }),

      addTerminalRun: (run) => set((s) => ({
        terminalHistory: [...s.terminalHistory.slice(-49), run],
      })),
      patchTerminalRun: (id, p) => set((s) => ({
        terminalHistory: s.terminalHistory.map((r) => (r.id === id ? { ...r, ...p } : r)),
      })),
      clearTerminal: (projectId) => set((s) => ({
        terminalHistory: projectId ? s.terminalHistory.filter((r) => r.projectId !== projectId) : [],
      })),

      setTool: (t) => set({ tool: t }),
      setShape: (s) => set({ shape: s, tool: "shape" }),
      setView: (v) => set({ view: v }),
      setSel: (ids) => set({ sel: ids }),
      setViewport: (pageId, v) => set((s) => ({ viewport: { ...s.viewport, [pageId]: v } })),

      addPage: () => set((s) => {
        const mine = s.pages.filter((p) => !p.convId || p.convId === s.activeConvId);
        const p: Page = { id: uid(), name: `Page ${mine.length + 1}`, convId: s.activeConvId };
        return {
          pages: [...s.pages, p],
          activePageId: p.id,
          conversations: s.conversations.map((c) => (c.id === s.activeConvId ? { ...c, activePageId: p.id } : c)),
          sel: [],
        };
      }),
      renamePage: (id, name) => set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, name } : p)) })),
      deletePage: (id) => set((s) => {
        const mine = s.pages.filter((p) => !p.convId || p.convId === s.activeConvId);
        if (mine.length <= 1) return s;
        const pages = s.pages.filter((p) => p.id !== id);
        const nextMine = pages.filter((p) => !p.convId || p.convId === s.activeConvId);
        const nextPageId = s.activePageId === id ? (nextMine[0]?.id ?? pages[0].id) : s.activePageId;
        return {
          pages,
          activePageId: nextPageId,
          conversations: s.conversations.map((c) => (c.id === s.activeConvId ? { ...c, activePageId: nextPageId } : c)),
          artboards: s.artboards.filter((a) => a.pageId !== id),
          elements: s.elements.filter((e) => e.pageId !== id),
          pins: s.pins.filter((p) => p.pageId !== id),
          sel: [],
        };
      }),
      setActivePage: (id) => set((s) => ({
        activePageId: id,
        conversations: s.conversations.map((c) => (c.id === s.activeConvId ? { ...c, activePageId: id } : c)),
        sel: [],
      })),

      slot: (pageId, w, h) => {
        const list = get().artboards.filter((a) => a.pageId === pageId);
        if (!list.length) return { x: 0, y: 0 };
        const right = Math.max(...list.map((a) => a.x + a.w));
        const top = Math.min(...list.map((a) => a.y));
        void h; void w;
        return { x: right + 120, y: top };
      },
      addArtboard: (a) => {
        const s = get();
        const device = a.device ?? "mobile";
        const size = DEVICE_SIZE[device];
        const w = a.w ?? size.w, h = a.h ?? size.h;
        const pos = a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : s.slot(a.pageId ?? s.activePageId, w, h);
        const id = a.id ?? uid();
        const ab: Artboard = {
          id, pageId: a.pageId ?? s.activePageId, name: a.name ?? `Screen ${s.artboards.length + 1}`, device, w, h, ...pos,
          html: a.html, version: 1, history: [], groupId: a.groupId ?? id, loading: a.loading, source: a.source,
        };
        set((st) => ({ artboards: [...st.artboards, ab], ui: st.ui.showCanvas ? st.ui : { ...st.ui, showCanvas: true } }));
        return ab;
      },
      addBlankFrame: (x, y, w, h) => {
        const st = get();
        const device = w > 700 ? "web" : w > 540 ? "tablet" : "mobile";
        const ds = getDS(st.settings.designSystemId);
        return st.addArtboard({ name: "Frame", x, y, w, h, device, html: rethemeHtml(blankFrame(ds), ds) });
      },
      updateArtboard: (id, p) => set((s) => ({ artboards: s.artboards.map((a) => (a.id === id ? { ...a, ...p } : a)) })),
      reviseArtboard: (id, html) => set((s) => ({
        artboards: s.artboards.map((a) => (a.id === id ? { ...a, html, history: [...a.history, a.html].slice(-12), version: a.version + 1 } : a)),
      })),
      restoreVersion: (id, idx) => set((s) => ({
        artboards: s.artboards.map((a) => {
          if (a.id !== id || !a.history[idx]) return a;
          return { ...a, html: a.history[idx], history: [...a.history, a.html].slice(-12), version: a.version + 1 };
        }),
      })),
      removeArtboards: (ids) => set((s) => ({
        artboards: s.artboards.filter((a) => !ids.includes(a.id)),
        pins: s.pins.filter((p) => !p.artboardId || !ids.includes(p.artboardId)),
        sel: s.sel.filter((i) => !ids.includes(i)),
      })),
      duplicateArtboard: (id) => {
        const a = get().artboards.find((x) => x.id === id);
        if (!a) return null;
        const nid = uid();
        const n = get().artboards.filter((x) => x.groupId === a.groupId).length + 1;
        const copy: Artboard = { ...a, id: nid, name: a.name.replace(/ · v\d+$/, "") + ` · v${n}`, x: a.x + a.w + 80, y: a.y, history: [], version: 1, loading: false };
        set((s) => ({ artboards: [...s.artboards, copy], sel: [nid] }));
        return nid;
      },

      addElement: (e) => {
        const el: CanvasEl = { ...e, id: uid(), pageId: get().activePageId };
        set((s) => ({ elements: [...s.elements, el] }));
        return el;
      },
      updateElement: (id, p) => set((s) => ({ elements: s.elements.map((e) => (e.id === id ? { ...e, ...p } : e)) })),
      removeElements: (ids) => set((s) => ({ elements: s.elements.filter((e) => !ids.includes(e.id)), sel: s.sel.filter((i) => !ids.includes(i)) })),

      addPin: (p, text) => {
        const s = get();
        const n = s.pins.filter((x) => x.pageId === s.activePageId).length + 1;
        const pin: Pin = {
          ...p, id: uid(), pageId: s.activePageId, n, resolved: false,
          comments: text ? [{ id: uid(), author: "user", text, at: Date.now() }] : [],
        };
        set((st) => ({ pins: [...st.pins, pin] }));
        return pin;
      },
      updatePin: (id, p) => set((s) => ({ pins: s.pins.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      addComment: (pinId, c) => set((s) => ({
        pins: s.pins.map((x) => (x.id === pinId ? { ...x, comments: [...x.comments, { ...c, id: uid(), at: Date.now() }] } : x)),
      })),
      removePin: (id) => set((s) => ({ pins: s.pins.filter((p) => p.id !== id), ui: { ...s.ui, openPinId: null } })),

      newConversation: (projectId) => {
        const s = get();
        const targetProjId = projectId ?? s.activeProjectId ?? s.projects[0]?.id ?? DEFAULT_PROJECT_ID;
        const proj = s.projects.find((p) => p.id === targetProjId) ?? s.projects[0];
        // If there's already an empty untitled conversation in this project, reuse it
        const existingEmpty = s.conversations.find(
          (c) => (c.projectId ?? DEFAULT_PROJECT_ID) === targetProjId && c.messages.length === 0
        );
        if (existingEmpty) {
          const mine = s.pages.filter((p) => p.convId === existingEmpty.id);
          const pageId = existingEmpty.activePageId ?? mine[0]?.id ?? s.activePageId;
          set({
            activeProjectId: targetProjId,
            projectName: proj?.name ?? s.projectName,
            projects: s.projects.map((p) => (p.id === targetProjId ? { ...p, expanded: true } : p)),
            activeConvId: existingEmpty.id,
            activePageId: pageId,
            sel: [],
            ui: { ...s.ui, workspace: projectToWorkspace(proj), editId: null, interactId: null, openPinId: null, showCanvas: false, leftTab: "chat" },
          });
          return existingEmpty.id;
        }
        const c = firstConv(targetProjId);
        const p: Page = { id: uid(), name: "Page 1", convId: c.id };
        c.activePageId = p.id;
        set((st) => ({
          activeProjectId: targetProjId,
          projectName: proj?.name ?? st.projectName,
          projects: st.projects.map((pr) => (pr.id === targetProjId ? { ...pr, expanded: true } : pr)),
          conversations: [c, ...st.conversations],
          pages: [...st.pages, p],
          activeConvId: c.id,
          activePageId: p.id,
          sel: [],
          ui: { ...st.ui, workspace: projectToWorkspace(proj), editId: null, interactId: null, openPinId: null, showCanvas: false, leftTab: "chat" },
        }));
        return c.id;
      },
      setActiveConv: (id) => set((s) => {
        const targetConv = s.conversations.find((c) => c.id === id);
        const targetProjId = targetConv?.projectId ?? s.activeProjectId ?? DEFAULT_PROJECT_ID;
        const proj = s.projects.find((p) => p.id === targetProjId);
        const ws = proj ? projectToWorkspace(proj) : s.ui.workspace;
        const projects = s.projects.map((p) => (p.id === targetProjId ? { ...p, expanded: true } : p));
        let mine = s.pages.filter((p) => p.convId === id);
        if (!mine.length) {
          const legacy = s.pages.filter((p) => !p.convId);
          if (legacy.length) {
            mine = legacy;
          } else {
            const np: Page = { id: uid(), name: "Page 1", convId: id };
            return {
              projects,
              activeProjectId: targetProjId,
              projectName: proj?.name ?? s.projectName,
              activeConvId: id,
              pages: [...s.pages, np],
              activePageId: np.id,
              conversations: s.conversations.map((c) => (c.id === id ? { ...c, activePageId: np.id, projectId: targetProjId } : c)),
              sel: [],
              ui: { ...s.ui, workspace: ws, editId: null, interactId: null, openPinId: null },
            };
          }
        }
        const nextPage = (targetConv?.activePageId && mine.some((p) => p.id === targetConv.activePageId))
          ? targetConv.activePageId
          : mine[0].id;
        return {
          projects,
          activeProjectId: targetProjId,
          projectName: proj?.name ?? s.projectName,
          activeConvId: id,
          activePageId: nextPage,
          sel: [],
          ui: { ...s.ui, workspace: ws, editId: null, interactId: null, openPinId: null },
        };
      }),
      deleteConv: (id) => set((s) => {
        const targetConv = s.conversations.find((c) => c.id === id);
        const targetProjId = targetConv?.projectId ?? s.activeProjectId ?? DEFAULT_PROJECT_ID;
        const deadPageIds = new Set(s.pages.filter((p) => p.convId === id).map((p) => p.id));
        let pages = s.pages.filter((p) => p.convId !== id);
        let conversations = s.conversations.filter((c) => c.id !== id);
        const sameProjConvs = conversations.filter((c) => (c.projectId ?? DEFAULT_PROJECT_ID) === targetProjId);
        if (!sameProjConvs.length) {
          const nc = firstConv(targetProjId);
          const np: Page = { id: uid(), name: "Page 1", convId: nc.id };
          nc.activePageId = np.id;
          conversations = [nc, ...conversations];
          pages = [...pages, np];
        }
        const nextConv = s.activeConvId === id
          ? (conversations.find((c) => (c.projectId ?? DEFAULT_PROJECT_ID) === targetProjId) ?? conversations[0])
          : (conversations.find((c) => c.id === s.activeConvId) ?? conversations[0]);
        let nextPages = pages.filter((p) => p.convId === nextConv.id || !p.convId);
        if (!nextPages.length) {
          const np: Page = { id: uid(), name: "Page 1", convId: nextConv.id };
          pages = [...pages, np];
          nextPages = [np];
        }
        const nextPageId = nextConv.activePageId && nextPages.some((p) => p.id === nextConv.activePageId) ? nextConv.activePageId : nextPages[0].id;
        return {
          conversations,
          pages,
          activeConvId: nextConv.id,
          activePageId: nextPageId,
          artboards: s.artboards.filter((a) => !deadPageIds.has(a.pageId)),
          elements: s.elements.filter((e) => !deadPageIds.has(e.pageId)),
          pins: s.pins.filter((p) => !deadPageIds.has(p.pageId)),
          sel: [],
        };
      }),
      setTitle: (id, t) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title: t, titled: true } : c)) })),
      addMessage: (convId, m) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === convId ? { ...c, at: Date.now(), messages: [...c.messages, m] } : c)) })),
      patchMessage: (convId, id, p) => set((s) => ({
        conversations: s.conversations.map((c) => (c.id === convId ? { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) } : c)),
      })),
      addMemory: (text, category = "preferences") => set((s) => ({ settings: { ...s.settings, memory: [{ id: uid(), text, at: Date.now(), category }, ...s.settings.memory] } })),
      removeMemory: (id) => set((s) => ({ settings: { ...s.settings, memory: s.settings.memory.filter((m) => m.id !== id) } })),
      setBusy: (b) => set({ busy: b }),
    }),
    {
      name: "zeusdesigns-v1",
      storage: debouncedStorage,
      partialize: (s) => ({
        projectName: s.projectName,
        projects: s.projects.map((p) => ({ ...p, tree: undefined })),
        activeProjectId: s.activeProjectId,
        terminalHistory: s.terminalHistory.map((t) => ({ ...t, running: false })).slice(-30),
        pages: s.pages,
        activePageId: s.activePageId,
        artboards: s.artboards.map((a) => ({ ...a, loading: false })),
        elements: s.elements,
        pins: s.pins,
        conversations: s.conversations.map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m, streaming: false })) })),
        activeConvId: s.activeConvId,
        viewport: s.viewport,
        view: s.view,
        settings: s.settings,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const settings = { ...current.settings, ...(p.settings ?? {}) };
        if (settings.hue === 258 || settings.hue === 216 || !Number.isFinite(settings.hue)) settings.hue = 17;
        if (!settings.providerId.startsWith("custom:")) {
          const deadProviders = new Set(["zencloud", "claudebridge", "groqlpu"]);
          if (deadProviders.has(settings.providerId)) {
            settings.providerId = "mercury3";
            settings.modelId = "mercury-3";
          }
        }
        try { applyTheme(settings.theme, settings.hue); } catch { /* ignore */ }
        const cleanSavedHtml = (h: string) =>
          h
            ? h
                .replace(/@font-face\s*\{[^}]*data:font\/woff2;base64,[^}]*\}/gi, "")
                .replace(/@import\s+(?:url\(\s*(?:'[^']*'|"[^"]*"|[^)]*)\s*\)|'[^']*'|"[^"]*")[^;\n]*;?/gi, "")
                .replace(/(?:^|[\n>])\s*[^\n{}<>]*(?:display=(?:swap|auto|block|fallback|optional)|wght@[\d;]+)[^\n{}<>]*['"]?\s*\)?\s*;?/gi, (m) => (m.startsWith(">") ? ">" : "\n"))
            : h;
        const artboards = Array.isArray(p.artboards)
          ? p.artboards.map((a) => ({
              ...a,
              html: cleanSavedHtml(a.html),
              history: Array.isArray(a.history) ? a.history.slice(-6).map(cleanSavedHtml) : [],
            }))
          : current.artboards;
        const projects: ProjectFolder[] = Array.isArray(p.projects) && p.projects.length > 0
          ? p.projects
          : [{ id: DEFAULT_PROJECT_ID, name: p.projectName || "Workspace", expanded: true, at: Date.now() }];
        const activeProjectId = p.activeProjectId && projects.some((pr) => pr.id === p.activeProjectId)
          ? p.activeProjectId
          : projects[0].id;
        const fallbackProjId = projects[0].id;
        const conversations = Array.isArray(p.conversations) && p.conversations.length > 0
          ? p.conversations.map((c) => ({
              ...c,
              projectId: c.projectId && projects.some((pr) => pr.id === c.projectId) ? c.projectId : fallbackProjId,
            }))
          : current.conversations;
        const activeProj = projects.find((pr) => pr.id === activeProjectId) ?? projects[0];
        const ui = {
          ...current.ui,
          workspace: projectToWorkspace(activeProj),
        };
        return { ...current, ...p, projects, activeProjectId, conversations, artboards, settings, ui };
      },
    },
  ),
);

export const activeConv = (s: State) => s.conversations.find((c) => c.id === s.activeConvId) ?? s.conversations[0];
export const activeProject = (s: State) => s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0];
export { DESIGN_SYSTEMS };

/** Artifacts (canvas screens) that belong to a conversation. */
export function convArtifactCount(s: { pages: Page[]; artboards: Artboard[]; conversations: Conversation[] }, convId: string): number {
  const pIds = new Set(s.pages.filter((p) => p.convId === convId).map((p) => p.id));
  const direct = s.artboards.filter((a) => pIds.has(a.pageId)).length;
  const conv = s.conversations.find((c) => c.id === convId);
  const viaMsg = new Set((conv?.messages ?? []).flatMap((m) => m.artboardIds ?? [])).size;
  return Math.max(direct, viaMsg);
}
