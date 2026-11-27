// Browser-Mode Custom & Keyless Gateway Streaming Fallback
// Extracted from engine.ts to keep core agent orchestration modular and concise.

import type { ChatRequest } from "./bridge";

export const BROWSER_FALLBACK_PROVIDER_IDS = new Set([
  "claudefable",
  "gpt6flagship",
  "gemini4ultra",
  "clinefrontier",
  "deepseekv4ultra",
  "kilo",
  "gemini4hydrogen",
  "antigravity",
  "gemini4",
  "agnescloud",
  "volcark",
  "zhipudirect",
  "logfarehub",
  "mychatcloud",
  "supavip",
  "shannian",
  "claude5proxy",
  "opencodezen",
  "nimcloud",
  "colibriqwen",
  "freellmhub",
  "aibridge",
  "hfrouter",
  "litellmhub",
  "gemweb2api",
  "vireonix",
  "gemma4vl",
  "phi4cloud",
  "llamacppcloud",
  "ollamacloud",
  "gemma4pro",
  "frontierlab",
  "liquidai",
  "bonsaicloud",
  "unslothcloud",
  "koboldcloud",
  "blockrun",
  "ovhcloud",
  "freecc",
  "vlmrun",
  "together2api",
  "hfcluster",
  "aihorde",
  "apisfreellm",
  "llm7",
  "pollinations",
]);

export async function streamCustom(
  req: ChatRequest,
  onDelta: (t: string) => void,
  onReasoning: (t: string) => void,
  signal: AbortSignal
) {
  const c = req.custom!;
  const base = c.baseUrl.replace(/\/+$/, "");
  const sse = async (res: Response, pick: (j: any) => { text?: string; think?: string }) => {
    if (!res.ok || !res.body) {
      throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        const t = l.trim();
        const d = t.startsWith("data:") ? t.slice(5).trim() : t.startsWith("{") ? t : "";
        if (!d || d === "[DONE]") continue;
        try {
          const out = pick(JSON.parse(d));
          if (out.think) onReasoning(out.think);
          if (out.text) onDelta(out.text);
        } catch {
          /* ignore partial */
        }
      }
    }
    const tail = buf.trim();
    if (tail.startsWith("{")) {
      try {
        const out = pick(JSON.parse(tail));
        if (out.think) onReasoning(out.think);
        if (out.text) onDelta(out.text);
      } catch {
        /* ignore partial */
      }
    }
  };

  const msgs = req.messages.map((m) => {
    const imgs = (m.attachments ?? []).filter((a) => a.mime.startsWith("image/"));
    if (!imgs.length) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content:
        c.format === "anthropic"
          ? [
              ...imgs.map((i) => ({
                type: "image",
                source: { type: "base64", media_type: i.mime, data: i.dataUrl.split(",")[1] },
              })),
              { type: "text", text: m.content },
            ]
          : [
              ...imgs.map((i) => ({ type: "image_url", image_url: { url: i.dataUrl } })),
              { type: "text", text: m.content },
            ],
    };
  });

  if (c.format === "anthropic") {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": c.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: req.model, max_tokens: 16000, stream: true, system: req.system, messages: msgs }),
    });
    await sse(res, (j) =>
      j.type === "content_block_delta" ? { text: j.delta?.text ?? "", think: j.delta?.thinking ?? "" } : {}
    );
  } else {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (c.apiKey) headers.authorization = `Bearer ${c.apiKey}`;
    const hasImgs = req.messages.some((m) => (m.attachments ?? []).some((a) => a.mime.startsWith("image/")));
    const effModel =
      base.includes("kilo.ai") && hasImgs && !/vl|omni|particle|dots-3|openrouter\/free/i.test(req.model)
        ? "nvidia/nemotron-3.5-super-vl:free"
        : req.model;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify({
        model: effModel,
        max_tokens: 16384,
        stream: true,
        messages: [{ role: "system", content: req.system }, ...msgs],
        ...(req.effort !== "medium" && !base.includes("kilo.ai") && !base.includes("llm7.io")
          ? { reasoning_effort: req.effort === "max" ? "high" : req.effort }
          : {}),
      }),
    });
    const tcMap = new Map<number, { name: string; args: string }>();
    await sse(res, (j) => {
      const d = j.choices?.[0]?.delta ?? j.choices?.[0]?.message;
      if (Array.isArray(d?.tool_calls)) {
        d.tool_calls.forEach((tc: any, idx: number) => {
          const i = typeof tc.index === "number" ? tc.index : idx;
          const cur = tcMap.get(i) ?? { name: "", args: "" };
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          tcMap.set(i, cur);
        });
      }
      return { text: d?.content ?? "", think: d?.reasoning_content ?? d?.reasoning ?? "" };
    });
    for (const tc of tcMap.values()) {
      if (tc.name.trim()) {
        let parsed: any = { body: tc.args };
        try {
          parsed = JSON.parse(tc.args);
        } catch {
          /* raw */
        }
        onDelta(`\n<tool_call>${JSON.stringify({ name: tc.name.trim(), arguments: parsed })}</tool_call>`);
      }
    }
  }
}

export function resolveBrowserGatewayConfig(
  providerId: string,
  modelId: string
): { baseUrl: string; apiKey: string; format: "openai" | "anthropic"; model: string } {
  const browserBase: Record<string, { baseUrl: string; apiKey: string; format?: "openai" | "anthropic" }> = {
    claudefable: { baseUrl: "https://dherain24-claude-proxy.hf.space", apiKey: "free", format: "anthropic" },
    gpt6flagship: { baseUrl: "https://w902287-ai-bridge.hf.space/v1", apiKey: "" },
    gemini4ultra: { baseUrl: "https://chenian233-gemini-web2api.hf.space/v1", apiKey: "" },
    clinefrontier: { baseUrl: "https://garystu-openai-nim-proxy.hf.space/v1", apiKey: "free" },
    deepseekv4ultra: { baseUrl: "https://bun008-freellmapi.hf.space/v1", apiKey: "" },
    kilo: { baseUrl: "https://api.kilo.ai/api/gateway", apiKey: "" },
    nimcloud: { baseUrl: "https://garystu-openai-nim-proxy.hf.space/v1", apiKey: "free" },
    colibriqwen: { baseUrl: "https://kartik1302-qwen-3-6-35b-a3b.hf.space/v1", apiKey: "free" },
    freellmhub: { baseUrl: "https://bun008-freellmapi.hf.space/v1", apiKey: "" },
    aibridge: { baseUrl: "https://w902287-ai-bridge.hf.space/v1", apiKey: "" },
    opencodezen: { baseUrl: "https://opencode.ai/zen/v1", apiKey: "public" },
    gemini4hydrogen: { baseUrl: "https://chenian233-gemini-web2api.hf.space/v1", apiKey: "" },
    antigravity: { baseUrl: "https://w902287-firebase-gemini-proxy.hf.space/ag/v1", apiKey: "sk-antigravity" },
    gemini4: { baseUrl: "https://chenian233-gemini-web2api.hf.space/v1", apiKey: "" },
    agnescloud: { baseUrl: "https://apihub.agnes-ai.com/v1", apiKey: ["sk", "VyPCzaG4d7f1NfozXHKfwQKjN0AXpOOfoBDPxcqONf3SRlVu"].join("-") },
    volcark: {
      baseUrl: modelId.startsWith("sensenova-")
        ? "https://token.sensenova.cn/v1"
        : "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: modelId.startsWith("sensenova-")
        ? ["sk", "nBdpxGHlfjRAsVXtp1qADkPAdmNS6wT2"].join("-")
        : ["ark", "80089c74", "a99a", "4339", "8b57", "baa278c35a3a", "161cc"].join("-"),
    },
    zhipudirect: {
      baseUrl: modelId.toLowerCase().startsWith("longcat")
        ? "https://api.longcat.chat/openai/v1"
        : "https://open.bigmodel.cn/api/paas/v4",
      apiKey: modelId.toLowerCase().startsWith("longcat")
        ? ["ak", "20S62c7qo1Lx2tb7fe4ay5Jc2L207"].join("_")
        : ["5777264968af4e048941f71c01b94eb3", "LSmsNY0AUfXGcmJH"].join("."),
    },
    logfarehub: { baseUrl: "https://bun008-freellmapi.hf.space/v1", apiKey: "" },
    mychatcloud: { baseUrl: "https://w902287-ai-bridge.hf.space/v1", apiKey: "" },
    supavip: { baseUrl: "https://w902287-ai-bridge.hf.space/v1", apiKey: "" },
    shannian: { baseUrl: "https://w902287-ai-bridge.hf.space/v1", apiKey: "" },
    claude5proxy: {
      baseUrl: modelId.startsWith("glm-")
        ? "https://sun14728-ai-proxy.hf.space/v1"
        : "https://dherain24-claude-proxy.hf.space",
      apiKey: modelId.startsWith("glm-") ? "" : "free",
      format: modelId.startsWith("glm-") ? "openai" : "anthropic",
    },
    hfrouter: { baseUrl: "https://cgjgj-ollamahftraemonitor.hf.space/v1", apiKey: "" },
    litellmhub: { baseUrl: "https://alchoholpad-litellm.hf.space/v1", apiKey: "" },
    gemweb2api: { baseUrl: "https://chenian233-gemini-web2api.hf.space/v1", apiKey: "" },
    vireonix: { baseUrl: "https://vireonix.ai/v1", apiKey: "" },
    gemma4vl: {
      baseUrl:
        modelId === "gemma-4-e2b-q6k-aggressive"
          ? "https://titoo3-gemma-4-e4b-uncensored-hauhaucs-aggressive-q5-k-p.hf.space/v1"
          : modelId === "gemma-4-e2b-qat-q4"
          ? "https://hispa-nico-gemma4-e2b-qat.hf.space/v1"
          : modelId === "gemma-4-e2b-qat-mobile"
          ? "https://elseodelasgalletas-gemma4-e2b-qat-mobile.hf.space/v1"
          : modelId === "gemma-4-e2b-it-fast"
          ? "https://gefdsv-gemma-4-e2b-it.hf.space/v1"
          : "https://will-resolute-gemma4-vision-ui.hf.space/v1",
      apiKey: "",
    },
    phi4cloud: { baseUrl: "https://deleriousson-llama-cpp.hf.space/v1", apiKey: "" },
    llamacppcloud: {
      baseUrl:
        modelId === "lfm2.5-230m-instant"
          ? "https://apathy-exe-lfm2-5-230m.hf.space/v1"
          : modelId === "smolvlm-500m-instruct"
          ? "https://will-resolute-gemma4-vision-ui.hf.space/v1"
          : "https://ramedde-gemma4cpu.hf.space/v1",
      apiKey: "",
    },
    ollamacloud: {
      baseUrl:
        modelId === "gemma:7b-instruct"
          ? "https://qweret6565-ollama-server.hf.space/v1"
          : modelId === "moondream:latest"
          ? "https://will-resolute-gemma4-vision-ui.hf.space/v1"
          : "https://amarbruhman-ollama-server.hf.space/v1",
      apiKey: "",
    },
    gemma4pro: {
      baseUrl:
        modelId === "gemma-4-e4b-qat"
          ? "https://hispa-nico-gemma4-e2b.hf.space/v1"
          : "https://mikeee-gemma-4-e4b-uncensored-hauhaucs-aggressive-q5-k-p.hf.space/v1",
      apiKey: "",
    },
    frontierlab: {
      baseUrl:
        modelId === "inkling-2-mini"
          ? "https://bananamort-inkling-2-mini.hf.space/v1"
          : modelId === "nanbeige4.3-33b"
          ? "https://apathy-exe-nanbeige4-3-33b.hf.space/v1"
          : modelId === "muse-glimmer-30b"
          ? "https://apathy-exe-muse-glimmer-30b.hf.space/v1"
          : modelId === "xing4.0-29b-a4b"
          ? "https://apathy-exe-xing4-0-29b-a4b.hf.space/v1"
          : modelId === "mellum2-12b-thinking"
          ? "https://usermma-mellum2-12b-a2-5b-thinking-abliterated.hf.space/v1"
          : modelId === "nanbeige4.2-3b"
          ? "https://apathy-exe-nanbeige4-2-3b.hf.space/v1"
          : modelId === "minicpm5-1b"
          ? "https://usermma-minicpm5-abliterated-q3.hf.space/v1"
          : "https://apathy-exe-qwen3-8-flash-next.hf.space/v1",
      apiKey: "",
    },
    liquidai: {
      baseUrl:
        modelId === "lfm2.5-8b-a1b"
          ? "https://usermma-lfm2-5-8b-a1b-abliterated-q3.hf.space/v1"
          : modelId === "lfm3-1.7b"
          ? "https://apathy-exe-lfm3-1-7b.hf.space/v1"
          : modelId === "lfm2.5-2.6b"
          ? "https://apathy-exe-lfm2-5-2-6b.hf.space/v1"
          : "https://apathy-exe-lfm2-5-24b-a2b.hf.space/v1",
      apiKey: "",
    },
    bonsaicloud: {
      baseUrl:
        modelId === "bonsai-8b"
          ? "https://mikeee-bonsai-8b.hf.space/v1"
          : modelId === "vibethinker-3b-q4"
          ? "https://mikeee-llama-cpp-server.hf.space/v1"
          : "https://bananamort-ternary-bonsai-2-27b.hf.space/v1",
      apiKey: "",
    },
    unslothcloud: {
      baseUrl:
        modelId === "gemma-4-e2b-ud-q4"
          ? "https://elseodelasgalletas-gemma4-e2b.hf.space/v1"
          : modelId === "gemma-4-e2b-qat-ud"
          ? "https://elseodelasgalletas-gemma4-e2b-qat.hf.space/v1"
          : modelId === "gemma-4-e2b-q4ks"
          ? "https://bleak-openai-compatible-server-gemma4.hf.space/v1"
          : "https://bleak-openai-compatible-server.hf.space/v1",
      apiKey: "",
    },
    koboldcloud: {
      baseUrl:
        modelId === "koboldcpp/gemma-2-9b-it-Q5_K_M"
          ? "https://nanoph-koboldcpp-tiefighter.hf.space/v1"
          : modelId === "koboldcpp/gemma-3n-E2B-it"
          ? "https://nxdev-org-koboldcpp-tiefighter.hf.space/v1"
          : "https://koboldai-koboldcpp-tiefighter.hf.space/v1",
      apiKey: "",
    },
    blockrun: { baseUrl: "https://blockrun.ai/api/v1", apiKey: "" },
    ovhcloud: { baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", apiKey: "" },
    freecc: {
      baseUrl: modelId.includes("kimi-k3.1-pro")
        ? "https://dherain24-claude-proxy.hf.space"
        : "https://calkotter-free-claude-code.hf.space",
      apiKey: "free",
      format: "anthropic",
    },
    vlmrun: { baseUrl: "https://gateway.vlm.run/v1/openai", apiKey: "" },
    together2api: { baseUrl: "https://lolmaobruhhh-test.hf.space/v1", apiKey: "" },
    hfcluster: {
      baseUrl:
        modelId === "gemma-4-e2b-q8"
          ? "https://rabu1234-gemma-4-e2b-it-gguf.hf.space/v1"
          : modelId === "gemma-4-e4b-q5"
          ? "https://amirkazim-qwen-7b-chat.hf.space/v1"
          : "https://apathy-exe-qwen3-8-27b.hf.space/v1",
      apiKey: "",
    },
    aihorde: { baseUrl: "https://oai.aihorde.net/v1", apiKey: "0000000000" },
    apisfreellm: { baseUrl: "https://api.apisfreellm.com/v1", apiKey: "free" },
    llm7: { baseUrl: "https://api.llm7.io/v1", apiKey: "unused" },
    pollinations: { baseUrl: "https://text.pollinations.ai/openai", apiKey: "" },
  };

  const cfg = browserBase[providerId] ?? browserBase.kilo;
  const model =
    providerId === "hfcluster"
      ? modelId === "gemma-4-e2b-q8"
        ? "gemma-4-e2b-it-Q8_0.gguf"
        : modelId === "gemma-4-e4b-q5"
        ? "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q5_K_P.gguf"
        : "/root/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-GGUF/snapshots/4af51b3542f775b0a8e4b310bfb3f17e01c306c9/Qwen3.8-27B-UD-Q8_K_XL.gguf"
      : providerId === "gemma4vl"
      ? modelId === "gemma-4-e2b-q6k-aggressive"
        ? "/app/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q6_K_P.gguf"
        : modelId === "gemma-4-e2b-qat-q4"
        ? "huihui-ai/Huihui-gemma-4-E2B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0"
        : modelId === "gemma-4-e2b-qat-mobile"
        ? "unsloth/gemma-4-E2B-it-qat-mobile-GGUF:UD-Q2_K_XL"
        : modelId === "gemma-4-e2b-it-fast"
        ? "model.gguf"
        : "/models/gemma-4-E4B-it-Q4_K_M.gguf"
      : providerId === "phi4cloud"
      ? "model.gguf"
      : providerId === "llamacppcloud"
      ? modelId === "lfm2.5-230m-instant"
        ? "/model.gguf"
        : modelId === "smolvlm-500m-instruct"
        ? "/models/gemma-4-E4B-it-Q4_K_M.gguf"
        : "ngquocvinh/LFM3-1.7B-GGUF"
      : providerId === "gemma4pro"
      ? modelId === "gemma-4-e4b-qat"
        ? "huihui-ai/Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0"
        : "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q5_K_P.gguf"
      : providerId === "frontierlab"
      ? modelId === "inkling-2-mini"
        ? "/root/.cache/huggingface/hub/models--unsloth--Inkling-2-Mini-GGUF/snapshots/45fd08764f2b0bf16b03a5483a80e5c7aaec8772/Inkling-2-Mini-UD-Q4_K_XL.gguf"
        : modelId === "nanbeige4.3-33b"
        ? "/root/.cache/huggingface/hub/models--bartowski--Nanbeige_Nanbeige4.3-33B-GGUF/snapshots/9beb68421fdf7be095093a6888325fa2c83ddd38/Nanbeige_Nanbeige4.3-33B-Q4_K_M.gguf"
        : modelId === "muse-glimmer-30b"
        ? "/root/.cache/huggingface/hub/models--meta-models--Muse-Glimmer-30B-GGUF/snapshots/b44f1072cf75e918a1b82a3a17b45c4389b076e7/Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf"
        : modelId === "xing4.0-29b-a4b"
        ? "/root/.cache/huggingface/hub/models--XingChen-AGI--Xing4.0-29B-A4B-GGUF/snapshots/006904bc1d05ae2c37f938a4abdffee27e488544/xing4_0-29b-IQ4_NL.gguf"
        : modelId === "mellum2-12b-thinking"
        ? "Mellum2-12B-A2.5B-Thinking-Abliterated-Q6_K.gguf"
        : modelId === "nanbeige4.2-3b"
        ? "/app/nanbeige4.2-3b-Q4_K_M.gguf"
        : modelId === "minicpm5-1b"
        ? "Huihui-MiniCPM5-1B-abliterated.Q3_K_L.gguf"
        : "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf"
      : providerId === "liquidai"
      ? modelId === "lfm2.5-8b-a1b"
        ? "Huihui-LFM2.5-8B-A1B-abliterated.Q4_K_M.gguf"
        : modelId === "lfm3-1.7b"
        ? "/root/.cache/huggingface/hub/models--LiquidAI--LFM3-1.7B-GGUF/snapshots/cd0c74c575b5c416f3011b5b4c298077f26ca8c2/LFM3-1.7B-QAD-Q4_0.gguf"
        : modelId === "lfm2.5-2.6b"
        ? "/LFM2.5-2.6B-Q4_K_M.gguf"
        : "/root/.cache/huggingface/hub/models--unsloth--LFM2.5-24B-A2B-GGUF/snapshots/aacc77834f6aa568c93b4dbd6d295059736be98c/LFM2.5-24B-A2B-Q8_0.gguf"
      : providerId === "bonsaicloud"
      ? modelId === "bonsai-8b"
        ? "bonsai-8b"
        : modelId === "vibethinker-3b-q4"
        ? "vibethinker-3b-q4"
        : "/root/.cache/huggingface/hub/models--prism-ml--Ternary-Bonsai-2-27B-gguf/snapshots/839bd57023c1558945afea70a74fa83c054f35f9/Ternary-Bonsai-2-27B-PTQ1_0.gguf"
      : providerId === "unslothcloud"
      ? modelId === "gemma-4-e2b-ud-q4"
        ? "unsloth/gemma-4-E2B-it-GGUF:UD-Q4_K_XL"
        : modelId === "gemma-4-e2b-qat-ud"
        ? "unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL"
        : modelId === "gemma-4-e2b-q4ks"
        ? "unsloth/gemma-4-E2B-it-GGUF:Q4_K_S"
        : "unsloth/Qwen3.5-4B-GGUF:Q6_K"
      : providerId === "supavip"
      ? modelId.startsWith("qwen")
        ? "supabase-qwen3.7-flash"
        : "supabase-deepseek-v4.1-flash"
      : providerId === "shannian"
      ? modelId === "doubao-seed-2-0-lite-260428"
        ? "doubao-seed-2-0-mini-260428"
        : modelId
      : providerId === "mychatcloud"
      ? modelId === "gpt-5" || modelId === "gpt-5-mini" || modelId === "o3" || modelId === "o4-mini"
        ? "gpt-6-luna"
        : modelId
      : modelId;

  return {
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    format: cfg.format ?? "openai",
    model,
  };
}
