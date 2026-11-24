import { activeProject, useStore } from "../store";
import { Composer } from "./Chat";
import { Icon } from "./Icon";
import { Dropdown, MenuItem, MenuLabel, Thumb } from "./ui";
import { focusArtboard } from "../lib/actions";
import { openWorkspace, openWorkspaceByPath } from "../lib/bridge";
import { OpenDesignCreationBar } from "./OpenDesignViews";
import { STARTER_HYPERFRAMES_VIDEO_HTML, STARTER_OPEN_SLIDE_DECK_HTML } from "../lib/openDesign";

const STARTERS = [
  { i: "terminal", t: "Build a feature", p: "Build a feature in this project: " },
  { i: "bug_report", t: "Fix a bug & test", p: "Find and fix this bug, then run tests to verify: " },
  { i: "manage_search", t: "Map codebase", p: "Map the architecture of this project and explain how it works." },
  { i: "code", t: "Refactor module", p: "Refactor and optimize this module while keeping all tests passing: " },
  { i: "description", t: "Generate AGENTS.md", p: "Inspect this project and write a comprehensive AGENTS.md file." },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Hello, night owl";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  const boards = useStore((s) => s.artboards);
  const projects = useStore((s) => s.projects);
  const curProject = useStore(activeProject);
  const patchUI = useStore((s) => s.patchUI);
  const notify = useStore((s) => s.notify);
  void Thumb; void focusArtboard;
  const recent = boards.slice(0, 0);

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
        <h1 className="greeting mb-5 flex items-center justify-center text-[40px] leading-none text-on-surface">
          {greeting()}
        </h1>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <Dropdown width={260} trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className="state inline-flex h-9 items-center gap-2 rounded-full border border-outline-variant/70 bg-surface-container px-3.5 text-xs font-semibold text-on-surface"
            >
              <Icon name="folder_open" size={16} className="text-primary" />
              <span>Project: {curProject?.name ?? "Workspace"}</span>
              {curProject?.root && (
                <span className="max-w-[160px] truncate font-mono text-[11px] font-normal text-on-surface-variant">
                  ({curProject.root})
                </span>
              )}
              <Icon name="expand_more" size={15} className="text-on-surface-variant" />
            </button>
          )}>
            {(close) => (
              <>
                <MenuLabel>Active project folder</MenuLabel>
                {projects.map((p) => (
                  <MenuItem
                    key={p.id}
                    icon={<Icon name={p.id === curProject?.id ? "folder_open" : "folder"} size={16} />}
                    label={p.name}
                    active={p.id === curProject?.id}
                    onClick={() => { close(); selectProject(p.id); }}
                  />
                ))}
                <div className="my-1 border-t border-outline-variant/60" />
                <MenuItem
                  icon={<Icon name="create_new_folder" size={16} />}
                  label="Open local project folder…"
                  onClick={() => { close(); pickFolder(); }}
                />
              </>
            )}
          </Dropdown>

          <button
            onClick={pickFolder}
            className="state inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3.5 text-xs font-medium text-on-surface-variant hover:text-on-surface"
          >
            <Icon name="create_new_folder" size={15} />
            Open folder
          </button>
          <button
            onClick={() => patchUI({ leftTab: "files" })}
            className="state inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3 text-xs font-medium text-on-surface-variant hover:text-on-surface"
          >
            <Icon name="account_tree" size={15} />
            Files
          </button>
          <button
            onClick={() => patchUI({ leftTab: "terminal" })}
            className="state inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3 text-xs font-medium text-on-surface-variant hover:text-on-surface"
          >
            <Icon name="terminal" size={15} />
            Terminal
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
        {recent.length > 0 && (
          <div className="mt-12">
            <div className="mb-3 flex items-center justify-between px-1 text-sm text-on-surface-variant">
              <span>Recent designs</span>
              <button onClick={() => patchUI({ showCanvas: true })} className="state rounded-lg px-2 py-1 font-medium text-on-surface">Open canvas</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {recent.map((a) => (
                <button key={a.id} onClick={() => { patchUI({ showCanvas: true }); setTimeout(() => focusArtboard(a.id), 60); }} className="state overflow-hidden rounded-2xl border border-outline-variant bg-surface-low text-left">
                  <div className="flex h-36 items-start justify-center overflow-hidden bg-surface-container pt-3">
                    <Thumb html={a.html} w={a.w} h={a.h} width={a.device === "web" ? 190 : 84} className="rounded-t-lg" />
                  </div>
                  <div className="truncate px-3 py-2.5 text-sm font-medium text-on-surface">{a.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
