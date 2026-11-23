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
      { id: "liquid/lfm-3-1.7b:free", label: "Liquid LFM 3 1.7B", note: "128k ctx · Fast state-space UI & code generator", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 8192 },
      { id: "stealth/glyph-cluster", label: "Stealth Glyph Cluster", note: "256k ctx · Stealth frontier UI & code model", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "kilo-auto/free", label: "Kilo Auto Free", note: "256k ctx · Fastest available free model", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
    ],
  },
  {
    id: "nimcloud", name: "NVIDIA NIM OpenAI Cloud", tagline: "Nemotron 3.5 Super VL · Ultra 550B · Step 5 · OpenAI stream", speed: "~185 tok/s", color: "#0ca678", icon: "hub",
    contextWindow: 262144,
    models: [
      { id: "nvidia/nemotron-3.5-super-vl-120b-a12b", label: "Nemotron 3.5 Super VL 120B", note: "262k ctx · NVIDIA 120B MoE vision & UI architect", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron 3 Ultra 550B", note: "262k ctx · 550B MoE frontier reasoning & software engineering", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni 30B VL", note: "256k ctx · 30B Omni vision & reasoning", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning 30B", note: "262k ctx · High-speed MoE UI coder", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3.5-bolt-e4b", label: "Nemotron 3.5 Bolt E4B", note: "262k ctx · Low-latency UI synthesis", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "mistralai/mistral-large-4-1t-a52b", label: "Mistral Large 4 1T A52B", note: "262k ctx · Mistral 1T MoE frontier reasoning & UI architect", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "stepfun-ai/step-5-preview", label: "StepFun Step 5 Preview", note: "256k ctx · StepFun Step 5 frontier reasoning & code", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
    ],
  },
  {
    id: "colibriqwen", name: "Colibri Qwen 3.6 MoE Cloud", tagline: "Qwen 3.6 35B A3B MoE · dedicated high-speed vLLM", speed: "~175 tok/s", color: "#d96b43", icon: "bolt",
    contextWindow: 131072,
    models: [
      { id: "Qwen3.6-35B-A3B", label: "Qwen 3.6 35B A3B MoE", note: "128k ctx · Alibaba 35B A3B fast MoE frontend & UI architect", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
    ],
  },
  {
    id: "freellmhub", name: "FreeLLM Hub", tagline: "", speed: "~120 tok/s", color: "#e8590c", icon: "cloud",
    contextWindow: 131072,
    models: [
      { id: "glm-5.3", label: "GLM 5.3", note: "Z.ai flagship agentic coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "qwen3-235b", label: "Qwen3 235B", note: "Alibaba 235B MoE flagship", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "mistral-large", label: "Mistral Large", note: "Mistral frontier generalist", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "mistral-medium-3-5", label: "Mistral Medium 3.5", note: "Balanced fast reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "DeepSeek-V4.1-Flash", label: "DeepSeek V4.1 Flash", note: "Fast long-context reasoning", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "DeepSeek-V4-Flash", label: "DeepSeek V4 Flash", note: "Fast long-context coder", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "kimi-k2.6", label: "Kimi K2.6", note: "Moonshot agentic reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "zai-glm-4.7", label: "GLM 4.7", note: "Z.ai fast reasoning coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "tencent-hy3", label: "Tencent HY3", note: "Tencent Hunyuan 3 flagship", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "Qwen3.8-27B", label: "Qwen3.8 27B", note: "Dense 27B UI coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gemma-4-31b-it", label: "Gemma 4 31B", note: "Google open 31B", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "openai/gpt-4.1", label: "GPT-4.1", note: "OpenAI long-context generalist", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "command-a-03-2025", label: "Command A", note: "Cohere agentic generalist", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", note: "OpenAI open-weight reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
    ],
  },
  {
    id: "aibridge", name: "AI Bridge Gateway", tagline: "", speed: "~150 tok/s", color: "#c2255c", icon: "swap_horiz",
    contextWindow: 131072,
    models: [
      { id: "gpt-6-luna", label: "GPT-6 Luna", note: "OpenAI GPT-6 fast flagship", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Anthropic fast frontier", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gpt-4.1", label: "GPT-4.1", note: "OpenAI long-context generalist", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "gpt-4o", label: "GPT-4o", note: "OpenAI multimodal generalist", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", note: "Fast coder", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "grok-4.20", label: "Grok 4.20", note: "xAI Grok frontier", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "deepseek-v4-flash-vision-exp", label: "DeepSeek V4 Flash Vision", note: "Reasoning flash", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "qwen3.5-flash", label: "Qwen3.5 Flash", note: "Alibaba fast reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "doubao-seed-2-0-mini-260428", label: "Doubao Seed 2.0 Mini", note: "ByteDance fast reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "supabase-qwen3.7-flash", label: "Qwen3.7 Flash", note: "Alibaba reasoning flash", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
    ],
  },
  {
    id: "hfrouter", name: "HF Router Hub", tagline: "", speed: "~60 tok/s", color: "#2b8a3e", icon: "route",
    contextWindow: 131072,
    models: [
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", note: "DeepSeek V4 Pro frontier", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "qwen3.8", label: "Qwen3.8 2.4T A95B", note: "Alibaba 2.4T MoE flagship", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", note: "DeepSeek V4 Flash fast", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "glm-5.3", label: "GLM 5.3", note: "Z.ai flagship agentic coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "minimax-m2.7", label: "MiniMax M2.7", note: "MiniMax agentic coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "kimi-k2", label: "Kimi K2", note: "Moonshot 1T MoE instruct", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", note: "OpenAI open-weight reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "qwen3-coder-480b", label: "Qwen3 Coder 480B", note: "Alibaba 480B A35B coder", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "qwen3-coder-next", label: "Qwen3 Coder Next", note: "Alibaba next-gen coder", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
    ],
  },
  {
    id: "litellmhub", name: "LiteLLM Frontier Hub", tagline: "", speed: "~200 tok/s", color: "#e67700", icon: "bolt",
    contextWindow: 131072,
    models: [
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B", note: "550B MoE frontier reasoning", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "groq/gpt-oss-120b", label: "GPT-OSS 120B (LPU)", note: "Ultra-fast open-weight reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "groq/qwen3.8-27b", label: "Qwen3.8 27B (LPU)", note: "Ultra-fast dense 27B", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "deepseek-v4.1-flash-1017", label: "DeepSeek V4.1 Flash", note: "Fast long-context reasoning", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Google long-context flash", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
    ],
  },
  {
    id: "gemweb2api", name: "Gemini Web Gateway", tagline: "", speed: "~60 tok/s", color: "#1c7ed6", icon: "language",
    contextWindow: 262144,
    models: [
      { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", note: "Google frontier reasoning", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Google fast flash", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "gemini-3.5-flash-thinking", label: "Gemini 3.5 Flash Thinking", note: "Google flash with thinking", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", note: "Google latest flash", reasoning: false, vision: false, contextWindow: 262144, maxOutput: 16384 },
    ],
  },
  {
    id: "gemma4vl", name: "Gemma 4 Vision & QAT Studio", tagline: "Gemma 4 E4B Vision UI · Q6_K Uncensored · QAT Mobile", speed: "~160 tok/s", color: "#12b886", icon: "visibility",
    contextWindow: 65536,
    models: [
      { id: "gemma-4-e4b-vision-q4", label: "Gemma 4 E4B Vision UI (Q4_K_M)", note: "64k ctx · Multimodal vision & UI layout architect", reasoning: false, vision: true, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-q6k-aggressive", label: "Gemma 4 E2B Uncensored (Q6_K_P)", note: "64k ctx · High-precision Q6_K_P uncensored UI coder", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-qat-q4", label: "Gemma 4 E2B QAT (Q4_0)", note: "64k ctx · Quantization-aware fast reasoning & code", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-qat-mobile", label: "Gemma 4 E2B QAT Mobile (UD-Q2_K_XL)", note: "64k ctx · Unsloth Dynamic ultra-fast stream", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-it-fast", label: "Gemma 4 E2B IT Fast", note: "64k ctx · Low-latency Gemma 4 instruction node", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "phi4cloud", name: "Phi-4 & Llama 3.1 Abliterated Cloud", tagline: "Microsoft Phi-4 14B · Llama 3.1 8B Abliterated · GGUF", speed: "~150 tok/s", color: "#e67700", icon: "neurology",
    contextWindow: 65536,
    models: [
      { id: "phi-4-14b-gguf", label: "Microsoft Phi-4 14B", note: "64k ctx · Microsoft 14B dense reasoning & frontend coder", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "llama-3.1-8b-abliterated", label: "Llama 3.1 8B Abliterated (Q4_K_M)", note: "64k ctx · Bartowski Q4_K_M fast instruction & UI coder", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "llama-cpp-fast", label: "Llama.cpp Fast GGUF", note: "64k ctx · Dedicated llama.cpp fast UI & copy node", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "llamacppcloud", name: "Llama.cpp LFM & SmolVLM Cloud", tagline: "Liquid LFM 2.5 2.6B Uncensored · LFM 3 1.7B · SmolVLM Vision", speed: "~180 tok/s", color: "#0c8599", icon: "waves",
    contextWindow: 65536,
    models: [
      { id: "lfm2.5-2.6b-uncensored", label: "Liquid LFM 2.5 2.6B Uncensored", note: "64k ctx · Uncensored state-space UI & code generator", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "lfm3-1.7b-gguf", label: "Liquid LFM 3 1.7B GGUF", note: "64k ctx · Next-gen LFM 3 reasoning & layout stream", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "smolvlm-500m-instruct", label: "SmolVLM 500M Vision (Q8_0)", note: "32k ctx · High-speed Q8_0 multimodal vision & UI parser", reasoning: false, vision: true, contextWindow: 32768, maxOutput: 4096 },
      { id: "lfm2.5-230m-instant", label: "Liquid LFM 2.5 230M Instant", note: "32k ctx · Ultra-low-latency micro-task & copy engine", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
    ],
  },
  {
    id: "ollamacloud", name: "Ollama Multi-Model Cloud", tagline: "DeepSeek R1 · Gemma 7B · Qwen 2.5 Coder · Moondream VL", speed: "~155 tok/s", color: "#5c940d", icon: "dns",
    contextWindow: 65536,
    models: [
      { id: "deepseek-r1:1.5b", label: "DeepSeek R1 1.5B Reasoning", note: "64k ctx · DeepSeek chain-of-thought reasoning & code", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma:7b-instruct", label: "Google Gemma 7B Instruct", note: "64k ctx · Dense 7B instruction & layout generator", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "qwen2.5:1.5b", label: "Qwen 2.5 1.5B Instruct", note: "64k ctx · Fast instruction & UI synthesis", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "qwen-coder-0.5b", label: "Qwen 2.5 Coder Fast", note: "32k ctx · Ultra-fast HTML/CSS & code stream", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 8192 },
      { id: "moondream:latest", label: "Moondream 2 Vision", note: "32k ctx · Multimodal vision & screenshot parser", reasoning: false, vision: true, contextWindow: 32768, maxOutput: 4096 },
    ],
  },
  {
    id: "gemma4pro", name: "Gemma 4 Flagship Cluster", tagline: "Gemma 4 31B · 12B Coding · E4B Vision · zero-key vLLM", speed: "~155 tok/s", color: "#2f9e66", icon: "memory",
    contextWindow: 131072,
    models: [
      { id: "gemma-4-31b-it", label: "Gemma 4 31B IT Flagship", note: "128k ctx · Google largest 31B dense Gemma 4 UI architect", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gemma-4-12b-it", label: "Gemma 4 12B IT", note: "128k ctx · Google 12B dense instruction & UI model", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gemma-4-12b-coding", label: "Gemma 4 12B Coding", note: "128k ctx · Specialized Gemma 4 frontend coding fine-tune", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gemma-4-e4b-ud-q5", label: "Gemma 4 E4B VL (UD-Q5_K_XL)", note: "64k ctx · High-precision UD-Q5_K_XL multimodal vision & code", reasoning: false, vision: true, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e4b-qat", label: "Gemma 4 E4B QAT", note: "64k ctx · Quantization-aware fast UI coder", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-ollama", label: "Gemma 4 Latest", note: "64k ctx · Ollama fast Gemma 4 stream", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "frontierlab", name: "Frontier Open-Weights Lab", tagline: "Inkling 2 Mini · Qwen 3.8 Flash Next · Nanbeige 4.3 33B · Mellum 2", speed: "~145 tok/s", color: "#e67700", icon: "neurology",
    contextWindow: 131072,
    models: [
      { id: "inkling-2-mini", label: "Inkling 2 Mini (UD-Q4_K_XL)", note: "128k ctx · Thinking Machines Inkling 2 Mini reasoning & UI", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "qwen3.8-flash-next", label: "Qwen 3.8 Flash Next", note: "128k ctx · Alibaba Qwen 3.8 Flash Next high-speed UI coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "nanbeige4.3-33b", label: "Nanbeige 4.3 33B", note: "128k ctx · 33B deep reasoning & software engineering flagship", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "muse-glimmer-30b", label: "Meta Muse Glimmer 30B", note: "128k ctx · Meta Superintelligence Labs 30B expressive UI designer", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "xing4.0-29b-a4b", label: "Xing 4.0 29B A4B MoE", note: "128k ctx · XingChen AGI 29B A4B fast reasoning & code", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "mellum2-12b-thinking", label: "JetBrains Mellum 2 12B Thinking", note: "64k ctx · JetBrains 12B A2.5B Thinking code & UI specialist", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "nanbeige4.2-3b", label: "Nanbeige 4.2 3B", note: "64k ctx · Fast reasoning & frontend code synthesis", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "minicpm5-1b", label: "OpenBMB MiniCPM 5", note: "64k ctx · Ultra-fast lightweight instruction & code model", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "liquidai", name: "Liquid AI LFM Gateway", tagline: "LFM 2.5 24B A2B Q8 · 8B A1B · LFM 3 1.7B · state-space UI synthesis", speed: "~175 tok/s", color: "#0c8599", icon: "waves",
    contextWindow: 131072,
    models: [
      { id: "lfm2.5-24b-a2b", label: "Liquid LFM 2.5 24B A2B (Q8_0)", note: "128k ctx · Liquid AI 24B A2B MoE flagship in 8-bit Q8_0", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "lfm2.5-8b-a1b", label: "Liquid LFM 2.5 8B A1B (Q4_K_M)", note: "128k ctx · Liquid AI 8B A1B fast MoE UI & code architect", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "lfm3-1.7b", label: "Liquid LFM 3 1.7B", note: "64k ctx · Next-gen LFM 3 ultra-low-latency UI & copy engine", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "lfm2.5-2.6b", label: "Liquid LFM 2.5 2.6B", note: "64k ctx · Compact state-space code & layout generator", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "bonsaicloud", name: "Bonsai & Ternary Frontier", tagline: "Prism Ternary Bonsai 2 27B · Bonsai 8B · VibeThinker 3B", speed: "~150 tok/s", color: "#2f9e66", icon: "eco",
    contextWindow: 65536,
    models: [
      { id: "ternary-bonsai-2-27b", label: "Ternary Bonsai 2 27B (PTQ1_0)", note: "64k ctx · Prism-ML 27B ternary reasoning & UI architect", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "bonsai-8b", label: "Ternary Bonsai 8B", note: "64k ctx · Fast 8B ternary code & UI generator", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "vibethinker-3b-q4", label: "VibeThinker 3B Reasoning", note: "32k ctx · Compact step-by-step UI & code thinker", reasoning: true, vision: false, contextWindow: 32768, maxOutput: 8192 },
    ],
  },
  {
    id: "unslothcloud", name: "Unsloth Qwen 3.5 & Gemma 4 Cloud", tagline: "Qwen 3.5 4B Q6_K · Gemma 4 UD-Q4_K_XL · QAT multi-node", speed: "~165 tok/s", color: "#12b886", icon: "memory",
    contextWindow: 65536,
    models: [
      { id: "qwen3.5-4b-q6", label: "Qwen 3.5 4B (Q6_K)", note: "64k ctx · Unsloth high-precision Q6_K fast UI & code generator", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-ud-q4", label: "Gemma 4 E2B IT (UD-Q4_K_XL)", note: "64k ctx · Unsloth Dynamic Q4_K_XL Google Gemma 4 UI coder", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-qat-ud", label: "Gemma 4 E2B QAT (UD-Q4_K_XL)", note: "64k ctx · Quantization-aware Unsloth Dynamic Gemma 4 stream", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-q4ks", label: "Gemma 4 E2B IT (Q4_K_S)", note: "64k ctx · Unsloth fast Gemma 4 E2B frontend node", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "koboldcloud", name: "KoboldAI Multi-Node Cloud", tagline: "Official KoboldAI Gemma 4 E2B · Gemma 3n · Gemma 2 9B", speed: "~130 tok/s", color: "#5c940d", icon: "dns",
    contextWindow: 32768,
    models: [
      { id: "koboldcpp/Gemma4-E2B", label: "Gemma 4 E2B (Official KoboldAI)", note: "32k ctx · Dedicated KoboldAI Gemma 4 E2B fast stream", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
      { id: "koboldcpp/gemma-2-9b-it-Q5_K_M", label: "Gemma 2 9B IT (Q5_K_M)", note: "32k ctx · Google Gemma 2 9B Q5_K_M instruction node", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
      { id: "koboldcpp/gemma-3n-E2B-it", label: "Gemma 3n E2B IT", note: "32k ctx · Google Gemma 3n E2B fast node", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
    ],
  },
  {
    id: "blockrun", name: "BlockRun Gateway", tagline: "NVIDIA & MiniMax M3.1 · zero-key x402 free pool", speed: "~165 tok/s", color: "#12b886", icon: "bolt",
    contextWindow: 262144,
    models: [
      { id: "nvidia/nemotron-3-super-120b", label: "Nemotron 3.5 Super 120B", note: "262k ctx · 120B MoE frontier UI architect", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni VL", note: "256k ctx · 30B Omni vision & reasoning", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "nvidia/nemotron-nano-12b-v2-vl", label: "Nemotron Nano 12B V2 VL", note: "131k ctx · NVIDIA 12B multimodal vision & UI parser", reasoning: false, vision: true, contextWindow: 131072, maxOutput: 16384 },
      { id: "nvidia/gpt-oss-120b", label: "GPT-OSS 120B (NVIDIA)", note: "131k ctx · OpenAI 120B open-weights reasoning workhorse", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "nvidia/step-3.7-flash", label: "StepFun Step 3.7 Flash", note: "131k ctx · StepFun fast reasoning & UI synthesis", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "nvidia/minimax-m3.1-flash", label: "MiniMax M3.1 Flash", note: "1M ctx · MiniMax M3.1 fast UI & code engine", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3-ultra-550b", label: "Nemotron 3 Ultra 550B", note: "1M ctx · 550B MoE deep software engineering", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3.5-lightning", label: "Nemotron 3.5 Lightning", note: "262k ctx · High-speed MoE UI coder", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/nemotron-3.5-bolt", label: "Nemotron 3.5 Bolt", note: "262k ctx · Low-latency UI synthesis", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "nvidia/muse-glimmer-30b", label: "Muse Glimmer 30B", note: "131k ctx · Expressive UI & design reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "nvidia/mistral-nemotron", label: "Mistral Nemotron", note: "131k ctx · Mistral × NVIDIA fast general & UI coder", reasoning: false, vision: false, contextWindow: 131072, maxOutput: 16384 },
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
    id: "freecc", name: "FreeClaude & Gemini 4", tagline: "Gemini 4 Hydrogen · Gemini 3 VL · Kimi K3.1 Pro · Step 5", speed: "~170 tok/s", color: "#d96b43", icon: "diamond",
    contextWindow: 262144,
    models: [
      { id: "claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview", label: "Gemini 3 Flash VL", note: "1M ctx · Google multimodal vision & UI architect", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen", label: "Gemini 4 Hydrogen", note: "1M ctx · Google Gemini 4 frontier reasoning & code", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/gemini/models/gemini-3.5-flash", label: "Gemini 3.5 Flash VL", note: "1M ctx · Sub-second Google Gemini 3.5 multimodal vision & code", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/gemini/models/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite VL", note: "1M ctx · Low-latency multimodal vision & layout", reasoning: false, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/moonshotai/kimi-k3.1-pro", label: "Kimi K3.1 Pro", note: "256k ctx · Moonshot K3.1 Pro flagship software engineer", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/stepfun-ai/step-5-preview", label: "StepFun Step 5 Preview", note: "256k ctx · StepFun Step 5 frontier reasoning & code", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b", label: "Nemotron 3.5 Super VL 120B", note: "262k ctx · NVIDIA 120B MoE vision & UI architect", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni 30B VL", note: "256k ctx · NVIDIA 30B Omni reasoning & vision", reasoning: true, vision: true, contextWindow: 256000, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron 3 Ultra 550B", note: "262k ctx · 550B MoE frontier reasoning", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning 30B", note: "262k ctx · High-speed MoE UI coder", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-bolt-e4b", label: "Nemotron 3.5 Bolt E4B", note: "262k ctx · Ultra-fast UI synthesis", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/poolside/laguna-xs-2.1", label: "Poolside Laguna XS 2.1", note: "128k ctx · Poolside agentic frontend coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
    ],
  },
  {
    id: "vlmrun", name: "VLM Run Gateway", tagline: "DiffusionGemma 26B VL · Qwen 3.5 VL · GLM-OCR · zero-key", speed: "~155 tok/s", color: "#0ca678", icon: "visibility",
    contextWindow: 131072,
    models: [
      { id: "google/diffusiongemma-26b-a4b-it", label: "DiffusionGemma 26B A4B VL", note: "128k ctx · Google 26B MoE multimodal vision & UI coder", reasoning: false, vision: true, contextWindow: 131072, maxOutput: 16384 },
      { id: "qwen/qwen3.5-0.8b", label: "Qwen 3.5 0.8B VL", note: "128k ctx · Ultra-fast multimodal vision & layout", reasoning: false, vision: true, contextWindow: 131072, maxOutput: 8192 },
      { id: "zai-org/glm-ocr", label: "GLM-OCR Vision", note: "64k ctx · Z.ai visual UI & document screenshot parser", reasoning: false, vision: true, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "together2api", name: "Together Frontier", tagline: "GLM 5.3 · Kimi K3 · Muse Glimmer · zero-key", speed: "~145 tok/s", color: "#e67700", icon: "hub",
    contextWindow: 131072,
    models: [
      { id: "glm-5.3", label: "GLM 5.3", note: "128k ctx · Z.ai flagship reasoning & UI architect", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "glm-5.3-flash", label: "GLM 5.3 Flash", note: "128k ctx · Z.ai 320B MoE fast reasoning & code", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "kimi-k3", label: "Kimi K3 2.8T", note: "128k ctx · Moonshot 2.8T MoE frontier coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "muse-glimmer-30b", label: "Muse Glimmer 30B", note: "128k ctx · Meta expressive UI & design reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", note: "128k ctx · OpenAI 120B open-weights reasoning", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "glm-5.2", label: "GLM 5.2", note: "128k ctx · Z.ai multi-step reasoning coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
      { id: "qwen3.5-9b", label: "Qwen 3.5 9B", note: "128k ctx · Alibaba compact fast UI coder", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 16384 },
    ],
  },
  {
    id: "hfcluster", name: "HF Frontier Cluster", tagline: "Qwen 3.8 27B Q8 · Gemma 4 E4B/E2B · zero-key multi-space", speed: "~135 tok/s", color: "#d9480f", icon: "memory",
    contextWindow: 65536,
    models: [
      { id: "qwen3.8-27b-q8", label: "Qwen 3.8 27B (UD-Q8_K_XL)", note: "64k ctx · High-precision Q8_K_XL reasoning & UI architect", reasoning: true, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e4b-q5", label: "Gemma 4 E4B IT (Q5_K_P)", note: "64k ctx · Google Gemma 4 E4B fast UI & code generator", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "gemma-4-e2b-q8", label: "Gemma 4 E2B IT (Q8_0)", note: "64k ctx · Google Gemma 4 E2B low-latency coder", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "aihorde", name: "AI Horde", tagline: "Qwen 3.8 · Gemma 4 · zero-key distributed pool", speed: "~95 tok/s", color: "#5c940d", icon: "dns",
    contextWindow: 32768,
    models: [
      { id: "Qwen/Qwen3.8-Flash-Next", label: "Qwen 3.8 Flash Next", note: "32k ctx · Alibaba Qwen 3.8 Flash distributed worker", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
      { id: "koboldcpp/Qwen/Qwen3.8-27B", label: "Qwen 3.8 27B", note: "32k ctx · Alibaba 27B dense coding & UI worker", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
      { id: "llamacpp/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive", label: "Qwen 3.6 35B MoE", note: "32k ctx · 35B A3B fast frontend coder", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
      { id: "koboldcpp/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q2_K_P", label: "Gemma 4 E4B", note: "32k ctx · Google Gemma 4 compact UI generator", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
      { id: "koboldcpp/Cydonia-24B-v4zg-Q4_K_M", label: "Cydonia 24B", note: "32k ctx · 24B creative & copywriting model", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
      { id: "koboldcpp/Llama-3.2-3B-Instruct", label: "Llama 3.2 3B Instruct", note: "32k ctx · Fast lightweight instruction model", reasoning: false, vision: false, contextWindow: 32768, maxOutput: 4096 },
    ],
  },
  {
    id: "apisfreellm", name: "APIsFreeLLM", tagline: "10,000 req/day · zero-key OpenAI stream", speed: "~155 tok/s", color: "#d9480f", icon: "terminal",
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
    id: "ptero", name: "Ptero Frontier", tagline: "Agnes 3.0 & 2.5 Flash VL · Ising 31B · GLM 5.3", speed: "~140 tok/s", color: "#0ca678", icon: "deployed_code",
    contextWindow: 128000,
    models: [
      { id: "agnes-2.5-flash:agnes", label: "Agnes 2.5 Flash VL", note: "128k ctx · Multimodal vision, reasoning & UI synthesis", reasoning: true, vision: true, contextWindow: 128000, maxOutput: 12288 },
      { id: "agnes-3.0-flash:agnes", label: "Agnes 3.0 Flash", note: "128k ctx · Fast frontend architecture & reasoning", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 12288 },
      { id: "ising-calibration-1.5-31b:bluesminds", label: "Ising Calibration 1.5 31B", note: "128k ctx · 31B dense code & UI synthesis", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 12288 },
      { id: "mimo-v2.6-flash:tokenharbor", label: "MiMo V2.6 Flash", note: "128k ctx · Xiaomi fast reasoning & frontend coder", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 12288 },
      { id: "glm-5.3-flash", label: "GLM 5.3 Flash (Ptero)", note: "128k ctx · Z.ai 320B MoE fast UI coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 12288 },
    ],
  },
  {
    id: "unikey", name: "Unikey Anonymous", tagline: "Claude Opus 5.5 · GPT-6.1 Sol · GPT-6 Astra · Kimi K3 · Grok 4.3", speed: "~145 tok/s", color: "#e67700", icon: "key_off",
    contextWindow: 200000,
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "200k ctx · Anthropic flagship agentic coding & UI architect", reasoning: true, vision: false, contextWindow: 200000, maxOutput: 16384 },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", note: "200k ctx · OpenAI deep reasoning & software engineering", reasoning: true, vision: false, contextWindow: 200000, maxOutput: 16384 },
      { id: "gpt-6-astra", label: "GPT-6 Astra", note: "200k ctx · OpenAI flagship reasoning & layout synthesis", reasoning: true, vision: false, contextWindow: 200000, maxOutput: 16384 },
      { id: "gpt-6-luna", label: "GPT-6 Luna", note: "128k ctx · OpenAI high-speed UI & frontend coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 12288 },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", note: "128k ctx · DeepSeek V4 fast coding & UI synthesis", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 12288 },
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
