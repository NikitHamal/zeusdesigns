import { sendMessage } from "../lib/engine";
import { Icon } from "./Icon";

const IDEAS = [
  { i: "payments", t: "Finance app", p: "Design a mobile finance dashboard for an app called Orbit with balance, spending chart and recent transactions" },
  { i: "music_note", t: "Music player", p: "Design a music player screen for Android with big album art and expressive playback controls" },
  { i: "shopping_bag", t: "Shop", p: "Design an e-commerce home screen for a sneaker store with categories and a product grid" },
  { i: "web", t: "SaaS landing", p: "Design a SaaS landing page for a product called Nimbus with hero, features and CTA" },
  { i: "dynamic_feed", t: "Social feed", p: "Design a social feed screen with stories row and rich post cards" },
  { i: "lock", t: "Sign in", p: "Design a sign-in screen for an app called Zeus with email, password and social sign in" },
];

export function EmptyCanvas() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="anim-pop pointer-events-auto max-w-[520px] text-center" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="greeting text-[34px] leading-tight text-on-surface">What are we designing?</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
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
