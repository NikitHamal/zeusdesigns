import { useStore } from "../store";
import { Composer } from "./Chat";
import { Icon } from "./Icon";
import { Thumb } from "./ui";
import { focusArtboard } from "../lib/actions";

const STARTERS = [
  { i: "phone_iphone", t: "Mobile app", p: "Design a mobile app home screen for " },
  { i: "web", t: "Landing page", p: "Design a landing page for " },
  { i: "dashboard", t: "Dashboard", p: "Design an analytics dashboard for " },
  { i: "swipe", t: "Onboarding", p: "Design a three-step onboarding flow for " },
  { i: "palette", t: "Design system", p: "Create a design system sheet with color, type and components for " },
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
  const patchUI = useStore((s) => s.patchUI);
  const recent = boards.slice(-3).reverse();
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6">
      <div className="flex w-full max-w-[680px] flex-1 flex-col justify-center py-10">
        <h1 className="greeting mb-8 flex items-center justify-center gap-3 text-[40px] leading-none text-on-surface">
          <Icon name="auto_awesome" size={34} fill className="text-primary" />{greeting()}
        </h1>
        <div className="-mx-3"><Composer hero /></div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {STARTERS.map((s) => (
            <button key={s.t} onClick={() => window.dispatchEvent(new CustomEvent("zeus:prefill", { detail: s.p }))} className="state flex h-9 items-center gap-2 rounded-lg bg-surface-container px-3 text-sm font-medium text-on-surface">
              <Icon name={s.i} size={18} />{s.t}
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
