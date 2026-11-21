import { Sparkles } from "lucide-react";
import { sendMessage } from "../lib/engine";

const IDEAS = [
  { e: "💸", t: "Finance app", p: "Design a mobile finance dashboard for an app called Orbit with balance, spending chart and recent transactions" },
  { e: "🎧", t: "Music player", p: "Design a music player screen for Android with big album art and expressive playback controls" },
  { e: "🛍️", t: "Shop", p: "Design an e-commerce home screen for a sneaker store with categories and a product grid" },
  { e: "🚀", t: "SaaS landing", p: "Design a SaaS landing page for a product called Nimbus with hero, features and CTA" },
  { e: "📰", t: "Social feed", p: "Design a social feed screen with stories row and rich post cards" },
  { e: "🔐", t: "Sign in", p: "Design a sign-in screen for an app called Zeus with email, password and social sign in" },
];

export function EmptyCanvas() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="anim-pop pointer-events-auto max-w-[560px] rounded-[40px] bg-surface-container/95 p-8 text-center shadow-2xl shadow-black/10 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 grid size-20 place-items-center rounded-[34%] bg-primary text-4xl text-on-primary shadow-lg" style={{ animation: "bolt 3s ease-in-out infinite" }}>⚡</div>
        <h2 className="font-display text-[34px] font-bold leading-tight tracking-tight text-on-surface">What are we designing?</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-on-surface-variant">Describe a screen in the chat, or start from an idea. Zeus drops live, interactive variants right here on the canvas.</p>
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {IDEAS.map((i) => (
            <button key={i.t} onClick={() => sendMessage({ text: i.p })} className="state morph flex flex-col items-center gap-1.5 rounded-[26px] bg-surface-high px-3 py-4 text-sm font-semibold text-on-surface">
              <span className="text-2xl">{i.e}</span>{i.t}
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-on-surface-variant">
          <Sparkles size={13} /> Tip: press <kbd className="rounded bg-surface-highest px-1.5">F</kbd> to draw a frame, <kbd className="rounded bg-surface-highest px-1.5">C</kbd> to pin a comment
        </div>
      </div>
    </div>
  );
}
