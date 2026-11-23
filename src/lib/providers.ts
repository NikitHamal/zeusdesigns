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
    id: "zencloud", name: "Zen & NIM Multi-Cloud", tagline: "Ring 2.6 1T · Qwen3 Coder 480B · Mistral Large 3 675B · Groq & Cerebras", speed: "~220 tok/s", color: "#0ca678", icon: "hub",
    contextWindow: 262144,
    models: [
      { id: "anthropic/zen/ring-2.6-1t-free", label: "Ring 2.6 1T MoE", note: "262k ctx · 1T MoE frontier reasoning & UI architect", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "anthropic/nvidia_nim/qwen/qwen3-coder-480b-a35b-instruct", label: "Qwen 3 Coder 480B A35B", note: "262k ctx · Alibaba 480B MoE flagship frontend & code architect", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "anthropic/nvidia_nim/mistralai/mistral-large-3-675b-instruct-2512", label: "Mistral Large 3 675B", note: "262k ctx · Mistral 675B flagship instruction & UI synthesis", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "anthropic/zen/nemotron-3-super-free", label: "Nemotron 3 Super Free", note: "262k ctx · NVIDIA 120B MoE reasoning & UI architect", reasoning: true, vision: false, contextWindow: 262144, maxOutput: 16384 },
      { id: "anthropic/nvidia_nim/stepfun-ai/step-3.5-flash", label: "StepFun Step 3.5 Flash", note: "128k ctx · StepFun fast reasoning & frontend coder", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/nvidia_nim/z-ai/glm4.7", label: "GLM 4.7 (NIM)", note: "128k ctx · Z.ai reasoning & UI coder", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/nvidia_nim/minimaxai/minimax-m2.7", label: "MiniMax M2.7 (NIM)", note: "256k ctx · MiniMax agentic UI & code generator", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "anthropic/zen/minimax-m2.5-free", label: "MiniMax M2.5 Free", note: "256k ctx · OpenCode Zen fast UI generator", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "anthropic/zen/big-pickle", label: "Zen Big Pickle", note: "256k ctx · OpenCode Zen stealth frontier coder", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "anthropic/silicon/deepseek-ai/DeepSeek-V3", label: "DeepSeek V3 671B", note: "128k ctx · SiliconFlow 671B MoE coding & layout specialist", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/silicon/Qwen/Qwen3-Coder-30B-A3B-Instruct", label: "Qwen 3 Coder 30B", note: "128k ctx · SiliconFlow 30B A3B fast frontend coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/silicon/Qwen/Qwen3.6-35B-A3B", label: "Qwen 3.6 35B MoE", note: "128k ctx · SiliconFlow 35B A3B UI coder", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/silicon/Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B Instruct", note: "128k ctx · Dense 72B instruction & code", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/groq/llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B LPU", note: "128k ctx · Groq LPU ultra-fast 70B coder", reasoning: false, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/groq/qwen3-32b", label: "Groq Qwen 3 32B LPU", note: "128k ctx · Groq LPU fast reasoning & UI", reasoning: true, vision: false, contextWindow: 128000, maxOutput: 16384 },
      { id: "anthropic/cerebras/llama3.1-8b", label: "Cerebras Llama 3.1 8B", note: "64k ctx · Wafer-scale 2,000+ tok/s instant coder", reasoning: false, vision: false, contextWindow: 64000, maxOutput: 8192 },
      { id: "anthropic/auto", label: "Zen & NIM Auto Router", note: "256k ctx · Fastest available multi-cloud route", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
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
      { id: "minicpm5-1b", label: "OpenBMB MiniCPM 5", note: "64k ctx · Ultra-fast lightweight instruction & code model", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "liquidai", name: "Liquid AI LFM Gateway", tagline: "LFM 2.5 24B A2B Q8 · LFM 3 1.7B · state-space UI synthesis", speed: "~175 tok/s", color: "#0c8599", icon: "waves",
    contextWindow: 131072,
    models: [
      { id: "lfm2.5-24b-a2b", label: "Liquid LFM 2.5 24B A2B (Q8_0)", note: "128k ctx · Liquid AI 24B A2B MoE flagship in 8-bit Q8_0", reasoning: true, vision: false, contextWindow: 131072, maxOutput: 12288 },
      { id: "lfm3-1.7b", label: "Liquid LFM 3 1.7B", note: "64k ctx · Next-gen LFM 3 ultra-low-latency UI & copy engine", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
      { id: "lfm2.5-2.6b", label: "Liquid LFM 2.5 2.6B", note: "64k ctx · Compact state-space code & layout generator", reasoning: false, vision: false, contextWindow: 65536, maxOutput: 8192 },
    ],
  },
  {
    id: "claudebridge", name: "Claude & Gemini Bridge", tagline: "Claude 4 Opus/Sonnet/Haiku Bridge · multimodal SSE", speed: "~160 tok/s", color: "#d96b43", icon: "deployed_code",
    contextWindow: 200000,
    models: [
      { id: "claude-opus-4-20250514", label: "Claude Opus 4 Bridge", note: "200k ctx · Multimodal UI architecture & deep layout synthesis", reasoning: true, vision: true, contextWindow: 200000, maxOutput: 16384 },
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 Bridge", note: "200k ctx · Balanced frontend code & multimodal vision", reasoning: true, vision: true, contextWindow: 200000, maxOutput: 16384 },
      { id: "claude-haiku-4-20250514", label: "Claude Haiku 4 Bridge", note: "200k ctx · High-speed UI & component synthesis", reasoning: false, vision: true, contextWindow: 200000, maxOutput: 16384 },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet Bridge", note: "200k ctx · Precision HTML/CSS & interactive screen builder", reasoning: false, vision: true, contextWindow: 200000, maxOutput: 16384 },
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
      { id: "claude-3-freecc-no-thinking/gemini/models/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite VL", note: "1M ctx · Low-latency multimodal vision & layout", reasoning: false, vision: true, contextWindow: 262144, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/moonshotai/kimi-k3.1-pro", label: "Kimi K3.1 Pro", note: "256k ctx · Moonshot K3.1 Pro flagship software engineer", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/stepfun-ai/step-5-preview", label: "StepFun Step 5 Preview", note: "256k ctx · StepFun Step 5 frontier reasoning & code", reasoning: true, vision: false, contextWindow: 256000, maxOutput: 16384 },
      { id: "claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b", label: "Nemotron 3.5 Super VL 120B", note: "262k ctx · NVIDIA 120B MoE vision & UI architect", reasoning: true, vision: true, contextWindow: 262144, maxOutput: 16384 },
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
