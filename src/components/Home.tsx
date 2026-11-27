import { activeProject, useStore } from "../store";
import { Composer } from "./Chat";
import { Icon } from "./Icon";
import { Dropdown, MenuItem, MenuLabel } from "./ui";
import { openWorkspace, openWorkspaceByPath } from "../lib/bridge";
import { StatusMark } from "./StatusMark";
import { useConvStatus } from "../lib/convStatus";
import { OpenDesignCreationBar } from "./OpenDesignViews";
import { STARTER_HYPERFRAMES_VIDEO_HTML, STARTER_OPEN_SLIDE_DECK_HTML } from "../lib/openDesign";

const STARTERS = [
  { i: "terminal", t: "Build a feature", p: "Build a feature in this project: " },
  { i: "bug_report", t: "Fix a bug & test", p: "Find and fix this bug, then run tests to verify: " },
  { i: "manage_search", t: "Map codebase", p: "Map the architecture of this project and explain how it works." },
  { i: "code", t: "Refactor module", p: "Refactor and optimize this module while keeping all tests passing: " },
  { i: "description", t: "Generate AGENTS.md", p: "Inspect this project and write a comprehensive AGENTS.md file." },
];

function ago(t: number) {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function SessionRow({ id, title, project, at }: { id: string; title: string; project: string; at: number }) {
  const status = useConvStatus(id);
  return (
    <button
      onClick={() => { const st = useStore.getState(); st.setActiveConv(id); st.patchUI({ leftTab: "chat" }); }}
      className="flex h-10 w-full items-center gap-3 border-b border-[var(--oc-border-weak)] px-3 text-left outline-none last:border-b-0 hover:bg-surface-low"
    >
      <StatusMark status={status} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-on-surface">{title}</span>
      <span className="shrink-0 text-[11.5px] text-on-surface-variant">{project}</span>
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-on-surface-variant">{ago(at)}</span>
    </button>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Hello, night owl";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  const projects = useStore((s) => s.projects);
  const curProject = useStore(activeProject);
  const notify = useStore((s) => s.notify);
  const convs = useStore((s) => s.conversations);
  const recentSessions = convs.filter((c) => c.messages.length > 0).sort((a, b) => b.at - a.at).slice(0, 6);
  const recentProjects = [...projects].filter((p) => p.root).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 5);

  const pickFolder = () => {
    openWorkspace()
      .then((w) => {
        if (w) {
          useStore.getState().addOrSelectProject(w);
          notify(`Opened project ${w.name}`);
        }
      })
      .catch((e) => notify(e.message));
  };

  const selectProject = (id: string) => {
    const st = useStore.getState();
    const proj = st.projects.find((p) => p.id === id);
    st.setActiveProject(id);
    if (proj?.root) {
      openWorkspaceByPath(proj.root, proj.name)
        .then((ws) => ws && useStore.getState().patchUI({ workspace: ws }))
        .catch(() => {});
    }
  };

  return (
    <div className="flex h-full w-full flex-1 flex-col items-center overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center py-10">
        <h1 className="greeting mb-5 flex items-center justify-center text-[32px] leading-none text-on-surface">
          {greeting()}
        </h1>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <Dropdown width={260} trigger={({ toggle }) => (
            <button onClick={toggle} className="oc-hairline flex h-8 items-center gap-2 rounded-md bg-surface-low px-3 text-xs font-medium text-on-surface outline-none hover:bg-surface-container">
              <Icon name="folder_open" size={15} className="text-on-surface-variant" />
              <span>{curProject?.name ?? "Workspace"}</span>
              {curProject?.root && <span className="max-w-[200px] truncate font-mono text-[11px] font-normal text-on-surface-variant">{curProject.root}</span>}
              <Icon name="expand_more" size={14} className="text-on-surface-variant" />
            </button>
          )}>
            {(close) => (
              <>
                <MenuLabel>Projects</MenuLabel>
                {projects.map((p) => (
                  <MenuItem key={p.id} icon={<Icon name={p.id === curProject?.id ? "folder_open" : "folder"} size={16} />} label={p.name} active={p.id === curProject?.id} onClick={() => { close(); selectProject(p.id); }} />
                ))}
                <div className="my-1 border-t border-outline-variant/60" />
                <MenuItem icon={<Icon name="create_new_folder" size={16} />} label="Open project folder" onClick={() => { close(); pickFolder(); }} />
              </>
            )}
          </Dropdown>
          <button onClick={pickFolder} className="oc-hairline flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-on-surface-variant outline-none hover:bg-surface-container hover:text-on-surface">
            <Icon name="create_new_folder" size={15} />
            Open folder
          </button>
        </div>

        <div className="mb-3 flex justify-center">
          <OpenDesignCreationBar />
        </div>

        <div className="-mx-3"><Composer hero /></div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              const st = useStore.getState();
              const created = st.addArtboard({
                name: "HyperFrames Launch Video",
                device: "web",
                html: STARTER_HYPERFRAMES_VIDEO_HTML,
              });
              st.setSel([created.id]);
              st.patchUI({ showCanvas: true, odTab: "studio" });
            }}
            className="state flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary"
          >
            <Icon name="movie" size={17} />
            HyperFrames Code-to-Video Studio
          </button>
          <button
            onClick={() => {
              const st = useStore.getState();
              const created = st.addArtboard({
                name: "Open-Slide 1920 Architecture Deck",
                device: "web",
                html: STARTER_OPEN_SLIDE_DECK_HTML,
              });
              st.setSel([created.id]);
              st.patchUI({ showCanvas: true, odTab: "studio" });
            }}
            className="state flex h-9 items-center gap-2 rounded-lg border border-outline-variant/70 bg-surface-container px-3.5 text-xs font-semibold text-on-surface"
          >
            <Icon name="slideshow" size={17} />
            Open-Slide 1920×1080 Deck Studio
          </button>
          {STARTERS.map((s) => (
            <button key={s.t} onClick={() => window.dispatchEvent(new CustomEvent("zeus:prefill", { detail: s.p }))} className="state flex h-9 items-center gap-2 rounded-lg bg-surface-container px-3 text-xs font-medium text-on-surface">
              <Icon name={s.i} size={16} />{s.t}
            </button>
          ))}
        </div>
        {recentSessions.length > 0 && (
          <div className="mt-10">
            <div className="mb-1.5 px-1 text-[12px] font-medium text-on-surface-variant">Recent sessions</div>
            <div className="oc-hairline overflow-hidden rounded-lg">
              {recentSessions.map((c) => (
                <SessionRow key={c.id} id={c.id} title={c.title} at={c.at} project={projects.find((p) => p.id === c.projectId)?.name ?? "Workspace"} />
              ))}
            </div>
          </div>
        )}
        {recentProjects.length > 0 && (
          <div className="mt-6">
            <div className="mb-1.5 px-1 text-[12px] font-medium text-on-surface-variant">Recent projects</div>
            <div className="oc-hairline overflow-hidden rounded-lg">
              {recentProjects.map((p) => (
                <button key={p.id} onClick={() => { selectProject(p.id); useStore.getState().newConversation(p.id); }} className="flex h-10 w-full items-center gap-3 border-b border-outline-variant px-3 text-left outline-none last:border-b-0 hover:bg-surface-low">
                  <Icon name="folder" size={16} className="shrink-0 text-on-surface-variant" />
                  <span className="shrink-0 text-[13px] font-medium text-on-surface">{p.name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-on-surface-variant">{p.root}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
