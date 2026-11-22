import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Artboard, CanvasEl, MemoryCategory, Comment, Conversation, CustomProvider, Effort, McpServer, MemoryItem, Message, Page, Pin,
  ShapeKind, Tool, ViewMode,
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

export interface Settings {
  theme: "light" | "dark" | "system";
  hue: number;
  providerId: string;
  modelId: string;
  effort: Effort;
  designSystemId: string;
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
}
export interface Viewport { x: number; y: number; z: number }

interface UI {
  settingsOpen: boolean;
  settingsTab: string;
  leftTab: "chat" | "files";
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
  update: UpdateInfo | null;
  version: string;
}

interface State {
  projectName: string;
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
  newConversation: () => string;
  setActiveConv: (id: string) => void;
  deleteConv: (id: string) => void;
  setTitle: (id: string, t: string) => void;
  addMessage: (convId: string, m: Message) => void;
  patchMessage: (convId: string, id: string, p: Partial<Message>) => void;
  addMemory: (text: string, category?: MemoryCategory) => void;
  removeMemory: (id: string) => void;
  setBusy: (b: boolean) => void;
}

const firstConv = (): Conversation => ({ id: uid(), title: "New design chat", messages: [], at: Date.now() });
const conv0 = firstConv();
const firstPage: Page = { id: "p1", name: "Page 1", convId: conv0.id };
conv0.activePageId = firstPage.id;

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
      projectName: "Untitled project",
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
        sidebarOpen: true, showCanvas: false, update: null, version: "",
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
      patchUI: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
      notify: (m) => {
        set((s) => ({ ui: { ...s.ui, toast: m } }));
        setTimeout(() => set((s) => (s.ui.toast === m ? { ui: { ...s.ui, toast: null } } : s)), 2600);
      },
      setProjectName: (n) => set({ projectName: n }),
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
        set((st) => ({ artboards: [...st.artboards, ab] }));
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

      newConversation: () => {
        const c = firstConv();
        const p: Page = { id: uid(), name: "Page 1", convId: c.id };
        c.activePageId = p.id;
        set((s) => ({
          conversations: [c, ...s.conversations],
          pages: [...s.pages, p],
          activeConvId: c.id,
          activePageId: p.id,
          sel: [],
          ui: { ...s.ui, editId: null, interactId: null, openPinId: null },
        }));
        return c.id;
      },
      setActiveConv: (id) => set((s) => {
        const targetConv = s.conversations.find((c) => c.id === id);
        let mine = s.pages.filter((p) => p.convId === id);
        if (!mine.length) {
          const legacy = s.pages.filter((p) => !p.convId);
          if (legacy.length) {
            mine = legacy;
          } else {
            const np: Page = { id: uid(), name: "Page 1", convId: id };
            return {
              activeConvId: id,
              pages: [...s.pages, np],
              activePageId: np.id,
              conversations: s.conversations.map((c) => (c.id === id ? { ...c, activePageId: np.id } : c)),
              sel: [],
              ui: { ...s.ui, editId: null, interactId: null, openPinId: null },
            };
          }
        }
        const nextPage = (targetConv?.activePageId && mine.some((p) => p.id === targetConv.activePageId))
          ? targetConv.activePageId
          : mine[0].id;
        return {
          activeConvId: id,
          activePageId: nextPage,
          sel: [],
          ui: { ...s.ui, editId: null, interactId: null, openPinId: null },
        };
      }),
      deleteConv: (id) => set((s) => {
        const deadPageIds = new Set(s.pages.filter((p) => p.convId === id).map((p) => p.id));
        let pages = s.pages.filter((p) => p.convId !== id);
        let conversations = s.conversations.filter((c) => c.id !== id);
        if (!conversations.length) {
          const nc = firstConv();
          const np: Page = { id: uid(), name: "Page 1", convId: nc.id };
          nc.activePageId = np.id;
          conversations = [nc];
          pages = [...pages, np];
        }
        const nextConv = s.activeConvId === id ? conversations[0] : (conversations.find((c) => c.id === s.activeConvId) ?? conversations[0]);
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
      addMessage: (convId, m) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, m] } : c)) })),
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
        projectName: s.projectName, pages: s.pages, activePageId: s.activePageId, artboards: s.artboards.map((a) => ({ ...a, loading: false })),
        elements: s.elements, pins: s.pins,
        conversations: s.conversations.map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m, streaming: false })) })),
        activeConvId: s.activeConvId, viewport: s.viewport, view: s.view, settings: s.settings,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const settings = { ...current.settings, ...(p.settings ?? {}) };
        if (settings.hue === 258 || settings.hue === 216 || !Number.isFinite(settings.hue)) settings.hue = 17; // retired blue/violet seeds
        try { applyTheme(settings.theme, settings.hue); } catch { /* ignore */ }
        const cleanSavedHtml = (h: string) =>
          h
            ? h
                .replace(/@font-face\s*\{[^}]*data:font\/woff2;base64,[^}]*\}/gi, "")
                .replace(/@import\s+(?:url\(\s*(?:'[^']*'|"[^"]*"|[^)]*)\s*\)|'[^']*'|"[^"]*")[^;\n]*;?/gi, "")
                .replace(/(?:^|[\n])\s*[\d;.,@a-zA-Z_+-]*display=(?:swap|auto|block|fallback|optional)\s*['"]?\s*\)?\s*;?/gi, "\n")
            : h;
        const artboards = Array.isArray(p.artboards)
          ? p.artboards.map((a) => ({
              ...a,
              html: cleanSavedHtml(a.html),
              history: Array.isArray(a.history) ? a.history.slice(-6).map(cleanSavedHtml) : [],
            }))
          : current.artboards;
        return { ...current, ...p, artboards, settings };
      },
    },
  ),
);

export const activeConv = (s: State) => s.conversations.find((c) => c.id === s.activeConvId) ?? s.conversations[0];
export { DESIGN_SYSTEMS };
