import { sendMessage } from "../lib/engine";
import { useStore } from "../store";
import { useEditor } from "../lib/editor";
import { canvasApi } from "../lib/canvasApi";
import { DEVICE_SIZE, type Device } from "../types";
import { Icon } from "./Icon";

const IDEAS = [
  { i: "payments", t: "Finance app", p: "Design a mobile finance dashboard for an app called Orbit with balance, spending chart and recent transactions" },
  { i: "description", t: "Notes app", p: "Design a mobile notes app with weekly capture stats, pinned notes Bento grid, and recent notes list" },
  { i: "music_note", t: "Music player", p: "Design a music player screen for Android with big album art and expressive playback controls" },
  { i: "shopping_bag", t: "Shop", p: "Design an e-commerce home screen for a sneaker store with categories and a product grid" },
  { i: "web", t: "SaaS landing", p: "Design a SaaS landing page for a product called Nimbus with hero, features and CTA" },
  { i: "lock", t: "Sign in", p: "Design a sign-in screen for an app called Zeus with email, password and social sign in" },
];

export function EmptyCanvas() {
  const startScratch = (dev: Device) => {
    const st = useStore.getState();
    const sz = DEVICE_SIZE[dev];
    const ab = st.addBlankFrame(140, 100, sz.w, sz.h);
    st.updateArtboard(ab.id, { device: dev, name: `${sz.label} Screen` });
    st.setSel([ab.id]);
    useEditor.getState().begin(ab.id, ab.html, "insert");
    useEditor.getState().setInsertOpen(true);
    st.patchUI({ editId: ab.id, interactId: null });
    setTimeout(() => canvasApi.fit([ab.id], { right: 310 }), 40);
  };

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="anim-pop pointer-events-auto max-w-[560px] text-center" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="greeting text-[34px] leading-tight text-on-surface">What are we designing?</h2>

        {/* Build from scratch (Figma / Penpot / Onlook visual mode) */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => startScratch("mobile")}
            className="state flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary-container px-4 text-sm font-semibold text-on-primary-container"
          >
            <Icon name="smartphone" size={17} /> Blank Mobile + Figma Studio
          </button>
          <button
            onClick={() => startScratch("web")}
            className="state flex h-10 items-center gap-2 rounded-full border border-outline-variant bg-surface-high px-4 text-sm font-semibold text-on-surface"
          >
            <Icon name="desktop_windows" size={17} /> Blank Web + Figma Studio
          </button>
        </div>

        {/* Or generate with Zeus AI */}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {IDEAS.map((i) => (
            <button key={i.t} onClick={() => sendMessage({ text: i.p })} className="state flex h-10 items-center gap-2 rounded-xl bg-surface-container px-3.5 text-sm font-medium text-on-surface">
              <Icon name={i.i} size={18} className="text-on-surface-variant" />{i.t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
