// Catalog of bundled keyless providers (implemented natively in the engine — see docs/BACKEND_CONTRACT.md).
export interface ModelInfo { id: string; label: string; note?: string; reasoning?: boolean; vision?: boolean }
export interface ProviderMeta {
  id: string; name: string; tagline: string; speed: string; color: string; icon: string;
  models: ModelInfo[]; role?: "default" | "title";
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "mercury3", name: "Mercury 3", tagline: "Diffusion LLM · blazing fast", speed: "1,000–2,000+ tok/s", color: "#7c5cff", icon: "⚡",
    models: [{ id: "mercury-3", label: "Mercury 3", note: "Diffusion · best for rapid UI iteration", reasoning: true }],
  },
  {
    id: "geminiweb", name: "Gemini Web", tagline: "Anonymous Gemini · multimodal", speed: "~150 tok/s", color: "#4285f4", icon: "✦",
    models: [{ id: "gemini-flash-lite", label: "Gemini Flash-Lite", vision: true }],
  },
  {
    id: "qwen", name: "Qwen", tagline: "Alibaba Qwen · strong coder", speed: "~90 tok/s", color: "#6a5af9", icon: "◈",
    models: [
      { id: "qwen4-max", label: "Qwen 4 Max", reasoning: true, vision: true },
      { id: "qwen3.8-max", label: "Qwen 3.8 Max", reasoning: true },
    ],
  },
  {
    id: "k2horizon", name: "K2Horizon", tagline: "IFM K2 · 375B MoE reasoning", speed: "~70 tok/s", color: "#e8590c", icon: "◐",
    models: [{ id: "k2-horizon", label: "K2-Horizon 375B", reasoning: true }],
  },
  {
    id: "motif", name: "Motif", tagline: "Motif 3 · reasoning", speed: "~80 tok/s", color: "#0ca678", icon: "✺",
    models: [
      { id: "motif-3-102b", label: "Motif 3 102B", reasoning: true },
      { id: "motif-3-12.7b", label: "Motif 3 12.7B", note: "Reasoning · lighter" },
    ],
  },
  {
    id: "longcat", name: "LongCat", tagline: "LongCat 2.5 · 1.6T MoE", speed: "~100 tok/s", color: "#f59f00", icon: "◉",
    models: [{ id: "longcat-2.5", label: "LongCat 2.5", reasoning: true }],
  },
  {
    id: "deepai", name: "DeepAI", tagline: "10 free models · no key", speed: "~60 tok/s", color: "#1c7ed6", icon: "◎",
    models: [{ id: "standard", label: "DeepAI Standard" }, { id: "math", label: "DeepAI Math" }],
  },
  {
    id: "chatjimmy", name: "ChatJimmy", tagline: "Llama 3.1 8B · instant micro-tasks", speed: "20,000+ tok/s", color: "#d6336c", icon: "🚀", role: "title",
    models: [{ id: "llama3.1-8b", label: "Llama 3.1 8B", note: "Titles & quick edits" }],
  },
];

export const DEMO_PROVIDER: ProviderMeta = {
  id: "demo", name: "Zeus Demo Engine", tagline: "Offline template designer", speed: "instant", color: "#868e96", icon: "✧",
  models: [{ id: "zeus-templates", label: "Template designer", note: "Used when the native engine is unavailable" }],
};

export const EFFORTS: { id: "low" | "medium" | "high" | "max"; label: string; desc: string }[] = [
  { id: "low", label: "Low", desc: "Fastest, minimal thinking" },
  { id: "medium", label: "Medium", desc: "Balanced" },
  { id: "high", label: "High", desc: "Deeper design reasoning" },
  { id: "max", label: "Max", desc: "Think as long as needed" },
];

export function findProvider(id: string): ProviderMeta {
  return PROVIDERS.find((p) => p.id === id) ?? DEMO_PROVIDER;
}
