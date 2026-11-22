// Catalog of bundled keyless providers (implemented natively in the engine — see docs/BACKEND_CONTRACT.md).
export interface ModelInfo {
  id: string;
  label: string;
  note?: string;
  reasoning?: boolean;
  vision?: boolean;
  contextWindow?: number;
  maxOutput?: number;
}
export interface ProviderMeta {
  id: string; name: string; tagline: string; speed: string; color: string; icon: string;
  models: ModelInfo[]; role?: "default" | "title";
  contextWindow?: number;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "mercury3", name: "Mercury 3", tagline: "Diffusion LLM · blazing fast", speed: "1,000–2,000+ tok/s", color: "#d96b43", icon: "waves",
    contextWindow: 128000,
    models: [{ id: "mercury-3", label: "Mercury 3", note: "128k ctx · Diffusion UI architect", reasoning: true, contextWindow: 128000, maxOutput: 16384 }],
  },
  {
    id: "geminiweb", name: "Gemini Web", tagline: "Anonymous Gemini · multimodal", speed: "~150 tok/s", color: "#2f9e66", icon: "diamond",
    contextWindow: 128000,
    models: [{ id: "gemini-flash-lite", label: "Gemini Flash-Lite", note: "128k ctx · Multimodal fast UI", vision: true, contextWindow: 128000, maxOutput: 8192 }],
  },
  {
    id: "qwen", name: "Qwen", tagline: "Alibaba Qwen · strong coder", speed: "~90 tok/s", color: "#c26d2d", icon: "forum",
    contextWindow: 128000,
    models: [
      { id: "qwen4-max", label: "Qwen 4 Max", note: "128k ctx · Flagship coder & UI architect", reasoning: true, vision: true, contextWindow: 128000, maxOutput: 8192 },
      { id: "qwen3.8-max", label: "Qwen 3.8 Max", note: "128k ctx · Reasoning & frontend specialist", reasoning: true, contextWindow: 128000, maxOutput: 8192 },
    ],
  },
  {
    id: "k2horizon", name: "K2Horizon", tagline: "IFM K2 · 375B MoE reasoning", speed: "~70 tok/s", color: "#e8590c", icon: "neurology",
    contextWindow: 128000,
    models: [{ id: "k2-horizon", label: "K2-Horizon 375B", note: "128k ctx · 375B MoE deep reasoning", reasoning: true, contextWindow: 128000, maxOutput: 8192 }],
  },
  {
    id: "motif", name: "Motif", tagline: "Motif 3 · reasoning", speed: "~80 tok/s", color: "#0ca678", icon: "hexagon",
    contextWindow: 128000,
    models: [
      { id: "motif-3-102b", label: "Motif 3 102B", note: "128k ctx · Enterprise 102B reasoning", reasoning: true, contextWindow: 128000, maxOutput: 8192 },
      { id: "motif-3-12.7b", label: "Motif 3 12.7B", note: "128k ctx · Fast reasoning", reasoning: true, contextWindow: 128000, maxOutput: 8192 },
    ],
  },
  {
    id: "longcat", name: "LongCat", tagline: "LongCat 2.5 · 1.6T MoE", speed: "~100 tok/s", color: "#f59f00", icon: "pets",
    contextWindow: 128000,
    models: [{ id: "longcat-2.5", label: "LongCat 2.5", note: "128k ctx · 1.6T MoE oversea-V2", reasoning: true, contextWindow: 128000, maxOutput: 8192 }],
  },
  {
    id: "deepai", name: "DeepAI", tagline: "6 free models · no key", speed: "~60 tok/s", color: "#0d9488", icon: "hub",
    contextWindow: 64000,
    models: [
      { id: "standard", label: "DeepAI Standard", note: "64k ctx · Balanced UI generator", vision: true, contextWindow: 64000, maxOutput: 8192 },
      { id: "qwen3.8-flash", label: "Qwen 3.8 Flash", note: "64k ctx · Fast coding", vision: true, contextWindow: 64000, maxOutput: 8192 },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "64k ctx · Clean UI layout", vision: true, contextWindow: 64000, maxOutput: 8192 },
      { id: "gpt-6-luna", label: "GPT-6 Luna", note: "64k ctx · Multimodal UI", vision: true, contextWindow: 64000, maxOutput: 8192 },
      { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", note: "64k ctx · Fast code", contextWindow: 64000, maxOutput: 8192 },
      { id: "gemma-4", label: "Gemma 4", note: "64k ctx · Compact open model", vision: true, contextWindow: 64000, maxOutput: 8192 },
    ],
  },
  {
    id: "chatjimmy", name: "ChatJimmy", tagline: "Llama 3.1 8B · instant micro-tasks", speed: "20,000+ tok/s", color: "#d6336c", icon: "rocket_launch", role: "title",
    contextWindow: 32000,
    models: [{ id: "llama3.1-8b", label: "Llama 3.1 8B", note: "32k ctx · 20,000+ tok/s micro-task engine", contextWindow: 32000, maxOutput: 4096 }],
  },
];

export const DEMO_PROVIDER: ProviderMeta = {
  id: "demo", name: "Zeus Demo Engine", tagline: "Offline template designer", speed: "instant", color: "#868e96", icon: "draw",
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
