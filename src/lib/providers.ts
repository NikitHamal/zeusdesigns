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
    models: [{ id: "mercury-3", label: "Mercury 3", note: "128k ctx · Diffusion UI architect", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 }],
  },
  {
    id: "kilo", name: "Kilo Gateway", tagline: "Free frontier & VL pool · no key", speed: "~140 tok/s", color: "#2f9e66", icon: "bolt",
    contextWindow: 262144,
    models: [
      { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL", note: "1M ctx · 120B MoE vision & UI architect", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron 3 Nano Omni VL", note: "256k ctx · 30B Omni vision & reasoning", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "openrouter/free", label: "OpenRouter Free VL", note: "200k ctx · Auto-routed multimodal VL pool", reasoning: true, vision: true, contextWindow: 200000, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B", note: "1M ctx · 550B MoE frontier reasoning", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", note: "1M ctx · High-speed MoE UI coder", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "inclusionai/ling-3.2-flash:free", label: "Ling 3.2 Flash VL", note: "1M ctx · Fast multimodal UI coder", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "baidu/ernie-5.5-flash-preview:free", label: "ERNIE 5.5 Flash", note: "1M ctx · Flagship reasoning & layout", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "reflection/beam-free", label: "Reflection Beam 1.0", note: "1M ctx · 501B MoE software engineering", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "particle-ai/particle-1:free", label: "Particle-1 VL", note: "1M ctx · Multimodal design & reasoning", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "dots-studio/dots-3-note-preview:free", label: "Dots 3 Note VL", note: "262k ctx · Multimodal vision & UI notes", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "recursive/flint-v1.0:free", label: "Recursive Flint 1.0", note: "262k ctx · Fast code & UI synthesis", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "cohere/north-mini-code:free", label: "Cohere North Mini Code", note: "256k ctx · Cohere coding & UI specialist", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "kilo-auto/free", label: "Kilo Auto Free", note: "256k ctx · Fastest available free model", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
    ],
  },
  {
    id: "blockrun", name: "BlockRun Gateway", tagline: "NVIDIA & MiniMax M3.1 · zero-key x402 free pool", speed: "~165 tok/s", color: "#12b886", icon: "bolt",
    contextWindow: 262144,
    models: [
      { id: "nvidia/nemotron-3-super-120b", label: "Nemotron 3.5 Super 120B", note: "262k ctx · 120B MoE frontier UI architect", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni VL", note: "256k ctx · 30B Omni vision & reasoning", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "nvidia/minimax-m3.1-flash", label: "MiniMax M3.1 Flash", note: "1M ctx · MiniMax M3.1 fast UI & code engine", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-ultra-550b", label: "Nemotron 3 Ultra 550B", note: "1M ctx · 550B MoE deep software engineering", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3.5-lightning", label: "Nemotron 3.5 Lightning", note: "262k ctx · High-speed MoE UI coder", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3.5-bolt", label: "Nemotron 3.5 Bolt", note: "262k ctx · Low-latency UI synthesis", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/muse-glimmer-30b", label: "Muse Glimmer 30B", note: "131k ctx · Expressive UI & design reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "poolside/laguna-xs-2.1", label: "Poolside Laguna XS 2.1", note: "128k ctx · Poolside code & layout specialist", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "cohere/north-mini-code", label: "Cohere North Mini Code", note: "256k ctx · Cohere frontend coding engine", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
    ],
  },
  {
    id: "ovhcloud", name: "OVHcloud AI", tagline: "DeepSeek V4.1 · Qwen 3.8 · Gemma 4 · EU keyless", speed: "~150 tok/s", color: "#0c8599", icon: "cloud_done",
    contextWindow: 262144,
    models: [
      { id: "DeepSeek-V4.1-Flash-1017", label: "DeepSeek V4.1 Flash", note: "262k ctx · 284B MoE flagship coding & UI architect", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "Qwen3.8-27B", label: "Qwen 3.8 27B VL", note: "262k ctx · Alibaba newest 27B multimodal & reasoning", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "Qwen3.5-397B-A17B", label: "Qwen 3.5 397B MoE", note: "262k ctx · 397B MoE frontier reasoning & code", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "qwen3-vl-30b-a3b", label: "Qwen 3 VL 30B", note: "128k ctx · Multimodal vision & UI specialist", reasoning: true, vision: true, contextWindow: 128000, maxOutput: 16384 },
      { id: "nemotron3-omni-30b", label: "Nemotron 3 Omni 30B VL", note: "256k ctx · NVIDIA Omni vision & reasoning", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "Qwen2.5-VL-72B-Instruct", label: "Qwen 2.5 VL 72B", note: "128k ctx · 72B multimodal vision & layout", reasoning: false, vision: true, contextWindow: 128000, maxOutput: 16384 },
      { id: "qwen3.6-35b-a3b", label: "Qwen 3.6 35B MoE", note: "262k ctx · Fast MoE frontend coder", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "Qwen3.6-27B", label: "Qwen 3.6 27B", note: "262k ctx · Dense coding & layout engine", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "gemma-4-26b-a4b", label: "Gemma 4 26B MoE", note: "128k ctx · Google Gemma 4 A4B fast UI coder", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "laguna-xs-2.1", label: "Poolside Laguna XS 2.1", note: "128k ctx · Poolside agentic coding engine", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "nemotron3-nano-30b", label: "Nemotron 3 Nano 30B", note: "256k ctx · NVIDIA fast reasoning MoE", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", note: "128k ctx · OpenAI 120B open-weights reasoning", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "gpt-oss-20b", label: "GPT-OSS 20B", note: "128k ctx · OpenAI 20B fast coder", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "Meta-Llama-3_3-70B-Instruct", label: "Llama 3.3 70B Instruct", note: "128k ctx · Meta 70B instruction model", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "Mistral-Small-3.2-24B-Instruct-2506", label: "Mistral Small 3.2 24B", note: "128k ctx · Mistral fast instruction coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
    ],
  },
  {
    id: "apisfreellm", name: "APIsFreeLLM", tagline: "10,000 req/day · zero-key OpenAI stream", speed: "~155 tok/s", color: "#d9480f", icon: "Generating_tokens",
    contextWindow: 32768,
    models: [
      { id: "free-ai", label: "Free-AI 9B Uncensored", note: "32k ctx · 10,000 req/day zero-key fast stream", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 8192 },
    ],
  },
  {
    id: "qwen", name: "Qwen", tagline: "Alibaba Qwen · OSS vision & coder", speed: "~90 tok/s", color: "#c26d2d", icon: "forum",
    contextWindow: 256000,
    models: [
      { id: "qwen4-max", label: "Qwen 4 Max", note: "1M ctx · Flagship coder & OSS vision architect", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "qwen3.8-max", label: "Qwen 3.8 Max", note: "1M ctx · Multimodal reasoning & frontend specialist", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "qwen3.8-omni-flash", label: "Qwen 3.8 Omni Flash", note: "1M ctx · Fast native multimodal vision & UI", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "qwen3.5-omni-plus", label: "Qwen 3.5 Omni Plus", note: "1M ctx · Multimodal vision specialist", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "qwen3.7-max", label: "Qwen 3.7 Max", note: "1M ctx · Flagship multimodal & thinking", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "qwen3.7-plus", label: "Qwen 3.7 Plus", note: "1M ctx · Multimodal & thinking", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
    ],
  },
  {
    id: "ptero", name: "Ptero Frontier", tagline: "GPT-6.1 Terra & Agnes 2.5 VL · GLM 5.3", speed: "~120 tok/s", color: "#0ca678", icon: "deployed_code",
    contextWindow: 128000,
    models: [
      { id: "gpt-6.1-terra:voyage", label: "GPT-6.1 Terra", note: "128k ctx · Frontier multimodal vision & UI architect", reasoning: true, vision: true, contextWindow: 128000, maxOutput: 12288 },
      { id: "agnes-2.5-flash:agnes", label: "Agnes 2.5 Flash VL", note: "128k ctx · Multimodal vision, reasoning & UI synthesis", reasoning: true, vision: true, contextWindow: 128000, maxOutput: 12288 },
      { id: "agnes-3.0-flash:agnes", label: "Agnes 3.0 Flash", note: "128k ctx · Fast frontend architecture & reasoning", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 12288 },
      { id: "glm-5.3-flash", label: "GLM 5.3 Flash (Ptero)", note: "128k ctx · Z.ai 320B MoE fast UI coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 12288 },
      { id: "mimo-v2.6-flash:tokenharbor", label: "MiMo V2.6 Flash", note: "128k ctx · Xiaomi fast reasoning & frontend coder", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 12288 },
      { id: "kimi-k3:apinex", label: "Kimi K3 (Ptero)", note: "128k ctx · Moonshot 2.8T MoE", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 12288 },
    ],
  },
  {
    id: "unikey", name: "Unikey Anonymous", tagline: "Kimi K3 · K2.7 Code · Grok 4.3", speed: "~125 tok/s", color: "#e67700", icon: "key_off",
    contextWindow: 128000,
    models: [
      { id: "moonshotai/kimi-k3", label: "Kimi K3 2.8T", note: "128k ctx · Moonshot 2.8T MoE flagship", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 },
      { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code", note: "128k ctx · Frontend & UI architecture specialist", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 },
      { id: "x-ai/grok-4.3", label: "Grok 4.3", note: "128k ctx · xAI frontier reasoning & code", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 },
    ],
  },
  {
    id: "llm7", name: "LLM7 Gateway", tagline: "Codestral & Gemma 3 · 400k ctx", speed: "~160 tok/s", color: "#d9480f", icon: "terminal",
    contextWindow: 400000,
    models: [
      { id: "codestral-latest", label: "Codestral Latest", note: "400k ctx · Mistral flagship coding & UI engine", reasoning: false, vision: false, contextWindow: 400000, maxOutput: 8192 },
      { id: "gemma-3-27b", label: "Gemma 3 27B", note: "128k ctx · Google 27B open instruction model", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 8192 },
      { id: "gpt-oss:20b", label: "GPT-OSS 20B", note: "128k ctx · OpenAI open-weights fast coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 8192 },
      { id: "default", label: "LLM7 Auto Router", note: "400k ctx · Anonymous router", reasoning: false, vision: false, contextWindow: 400000, maxOutput: 8192 },
    ],
  },
  {
    id: "pollinations", name: "Pollinations AI", tagline: "Zero-key OpenAI reasoning", speed: "~150 tok/s", color: "#5c940d", icon: "eco",
    contextWindow: 128000,
    models: [
      { id: "openai", label: "OpenAI Fast Reasoning", note: "128k ctx · Zero-key reasoning & UI generator", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 },
      { id: "openai-fast", label: "OpenAI Turbo", note: "128k ctx · Low-latency UI & copy engine", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 },
    ],
  },
  {
    id: "yqcloud", name: "YQCloud Stream", tagline: "Zero-auth instant stream", speed: "~130 tok/s", color: "#b45309", icon: "cloud_done",
    contextWindow: 64000,
    models: [
      { id: "yqcloud-default", label: "YQCloud GPT Stream", note: "64k ctx · Zero-auth high-availability stream", reasoning: false, vision: false, contextWindow: 64000, maxOutput: 8192 },
    ],
  },
  {
    id: "deepai", name: "DeepAI", tagline: "7 free models · IslandKey rotation", speed: "~60 tok/s", color: "#0d9488", icon: "hub",
    contextWindow: 64000,
    models: [
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "64k ctx · Clean UI layout & code", vision: false, contextWindow: 64000, maxOutput: 8192 },
      { id: "gpt-6-luna", label: "GPT-6 Luna", note: "64k ctx · Fast UI & copy generator", vision: false, contextWindow: 64000, maxOutput: 8192 },
      { id: "glm-5.3-flash", label: "GLM 5.3 Flash", note: "64k ctx · 320B MoE UI coder", reasoning: true, vision: false, contextWindow: 64000, maxOutput: 8192 },
      { id: "gemma-4", label: "Gemma 4", note: "64k ctx · Compact UI generator", vision: false, contextWindow: 64000, maxOutput: 8192 },
      { id: "qwen3.8-flash", label: "Qwen 3.8 Flash", note: "64k ctx · Fast coding", vision: false, contextWindow: 64000, maxOutput: 8192 },
      { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", note: "64k ctx · Fast code", vision: false, contextWindow: 64000, maxOutput: 8192 },
      { id: "standard", label: "DeepAI Standard", note: "64k ctx · Balanced UI generator", vision: false, contextWindow: 64000, maxOutput: 8192 },
    ],
  },
  {
    id: "k2horizon", name: "K2Horizon", tagline: "IFM K2 · 375B MoE reasoning", speed: "~70 tok/s", color: "#e8590c", icon: "neurology",
    contextWindow: 128000,
    models: [{ id: "k2-horizon", label: "K2-Horizon 375B", note: "128k ctx · 375B MoE deep reasoning", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 }],
  },
  {
    id: "motif", name: "Motif", tagline: "Motif 3 · reasoning", speed: "~80 tok/s", color: "#0ca678", icon: "hexagon",
    contextWindow: 128000,
    models: [
      { id: "motif-3-102b", label: "Motif 3 102B", note: "128k ctx · Enterprise 102B reasoning", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 },
      { id: "motif-3-12.7b", label: "Motif 3 12.7B", note: "128k ctx · Fast reasoning", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 },
    ],
  },
  {
    id: "longcat", name: "LongCat", tagline: "LongCat 2.5 · 1.6T MoE", speed: "~100 tok/s", color: "#f59f00", icon: "pets",
    contextWindow: 128000,
    models: [{ id: "longcat-2.5", label: "LongCat 2.5", note: "128k ctx · 1.6T MoE oversea-V2", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 8192 }],
  },
  {
    id: "geminiweb", name: "Gemini Web", tagline: "Anonymous Gemini Flash-Lite", speed: "~150 tok/s", color: "#2f9e66", icon: "diamond",
    contextWindow: 128000,
    models: [{ id: "gemini-flash-lite", label: "Gemini Flash-Lite", note: "128k ctx · Fast UI generation", vision: false, contextWindow: 128000, maxOutput: 8192 }],
  },
  {
    id: "chatjimmy", name: "ChatJimmy", tagline: "Llama 3.1 8B · instant micro-tasks", speed: "20,000+ tok/s", color: "#d6336c", icon: "rocket_launch", role: "title",
    contextWindow: 32000,
    models: [{ id: "llama3.1-8b", label: "Llama 3.1 8B", note: "32k ctx · 20,000+ tok/s micro-task engine", vision: false, contextWindow: 32000, maxOutput: 4096 }],
  },
];

export const DEMO_PROVIDER: ProviderMeta = {
  id: "demo", name: "Zeus Demo Engine", tagline: "Offline template designer", speed: "instant", color: "#868e96", icon: "draw",
  models: [{ id: "zeus-templates", label: "Template designer", note: "Used when the native engine is unavailable", vision: false }],
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

/** Returns true ONLY when the active provider + model supports image/file attachments. */
export function supportsAttachments(providerId: string, modelId: string): boolean {
  if (providerId.startsWith("custom:")) return true;
  const prov = findProvider(providerId);
  const model = prov.models.find((m) => m.id === modelId) ?? prov.models[0];
  return !!model?.vision;
}
