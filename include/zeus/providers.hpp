#pragma once
#include <string>
#include <vector>
#include <functional>
#include <map>
#include <mutex>
#include <cstdint>

namespace zeus {

enum class ProviderFormat {
    SCRAPER_INCEPTION,   // Mercury 3 (chat.inceptionlabs.ai) 1,000-2,000+ tok/s diffusion LLM
    SCRAPER_CHATJIMMY,   // ChatJimmy (chatjimmy.ai) 20,000+ tok/s Llama 3.1 8B instant title & micro-task engine
    SCRAPER_MOTIF,       // Motif (chat.motiftech.io) Motif 3 102B / 12.7B Reasoning
    SCRAPER_K2HORIZON,   // K2Horizon (chat.ifm.ai) IFM/K2-Horizon-375B-A23B
    SCRAPER_QWEN,        // Qwen (chat.qwen.ai) Qwen4 Max / Qwen3.8 Max + OSS vision upload
    SCRAPER_DEEPAI,      // DeepAI (api.deepai.org) IslandKey + attachment upload
    SCRAPER_LONGCAT,     // LongCat (longcat.chat) LongCat 2.5 1.6T MoE
    SCRAPER_GEMINIWEB,   // Gemini Web (gemini.google.com/app) anonymous Flash-Lite StreamGenerate
    SCRAPER_KILO,        // Kilo Gateway (api.kilo.ai/api/gateway) free frontier & VL models
    SCRAPER_NIMCLOUD,    // NVIDIA NIM OpenAI Cloud (mmoranguito-openai-nim-proxy / garystu-openai-nim-proxy)
    SCRAPER_COLIBRIQWEN, // Colibri Qwen 3.6 MoE Cloud (kartik1302-qwen-3-6-35b-a3b.hf.space)
    SCRAPER_FREELLMHUB, // FreeLLM Hub (bun008-freellmapi.hf.space)
    SCRAPER_AIBRIDGE, // AI Bridge Gateway (w902287-ai-bridge.hf.space)
    SCRAPER_HFROUTER, // HF Router Hub (cgjgj-ollamahftraemonitor.hf.space)
    SCRAPER_LITELLMHUB, // LiteLLM Frontier Hub (alchoholpad-litellm.hf.space)
    SCRAPER_GEMWEB2API, // Gemini Web Gateway (chenian233-gemini-web2api.hf.space)
    SCRAPER_VIREONIX,   // Vireonix (vireonix.ai/v1) anonymous request-aware router, 1M context
    SCRAPER_OPENCODEZEN,// OpenCode Zen (opencode.ai/zen/v1) free tier, Bearer public
    SCRAPER_GEMMA4VL,    // Gemma 4 Vision & QAT Studio (will-resolute / titoo3 / hispa-nico / elseodelasgalletas / gefdsv)
    SCRAPER_PHI4CLOUD,   // Phi-4 & Llama 3.1 Abliterated Cloud (5fp-phi-4-gguf / fggaerg / deleriousson)
    SCRAPER_LLAMACPPCLOUD,// Llama.cpp LFM & SmolVLM Cloud (r1000th / ramedde / aliroohan179 / apathy-exe)
    SCRAPER_OLLAMACLOUD, // Ollama Multi-Model Cloud (deepak7376 / qweret6565 / gentle-tech / amarbruhman / zurikoff / clarasu)
    SCRAPER_GEMMA4PRO,   // Gemma 4 Flagship Cluster (rikunarita-gemma-4-e4b / hispa-nico-gemma4-e2b / ismizo-gemma4)
    SCRAPER_FRONTIERLAB, // Frontier Open-Weights Lab (bananamort-inkling-2-mini / apathy-exe-qwen3-8-flash-next / nanbeige4.3-33b / usermma-mellum2)
    SCRAPER_LIQUIDAI,    // Liquid AI LFM Gateway (apathy-exe-lfm2-5-24b-a2b / usermma-lfm2-5-8b-a1b / lfm3-1-7b)
    SCRAPER_BONSAICLOUD, // Bonsai & Ternary Frontier (bananamort-ternary-bonsai-2-27b / mikeee-bonsai-8b / vibethinker-3b-q4)
    SCRAPER_UNSLOTHCLOUD,// Unsloth Gemma 4 Cloud (elseodelasgalletas-gemma4-e2b / bleak-openai-compatible-server-gemma4)
    SCRAPER_KOBOLDCLOUD, // KoboldAI Multi-Node Cloud (koboldai / nanoph / nxdev-org koboldcpp nodes)
    SCRAPER_PTERO,       // Ptero (ptero.pro/wp-json/mlp/v1/chat) GPT-6.1 Terra & GLM 5.3 Flash + vision
    SCRAPER_UNIKEY,      // Unikey (getunikey.ai/api/anonymous/chat/completions) Kimi K3, K2.7 Code, Grok 4.3
    SCRAPER_BLOCKRUN,    // BlockRun (blockrun.ai/api/v1) zero-key NVIDIA, MiniMax M3.1, Poolside, Cohere
    SCRAPER_OVHCLOUD,    // OVHcloud AI (oai.endpoints.kepler.ai.cloud.ovh.net/v1) DeepSeek V4.1, Qwen 3.8 VL, Gemma 4
    SCRAPER_FREECC,      // FreeClaude & Gemini 4 (calkotter-free-claude-code.hf.space / dherain24-claude-proxy.hf.space)
    SCRAPER_VLMRUN,      // VLM Run Gateway (gateway.vlm.run/v1/openai) DiffusionGemma 26B A4B VL, Qwen 3.5 VL, GLM-OCR
    SCRAPER_TOGETHER2API,// Together Frontier (lolmaobruhhh-test.hf.space/v1) GLM 5.3, Kimi K3, Muse Glimmer 30B
    SCRAPER_HFCLUSTER,   // HF Frontier Cluster (apathy-exe-qwen3-8-27b / wanyamaelis-qwen3-8-27b / gemma4 spaces)
    SCRAPER_AIHORDE,     // AI Horde (oai.aihorde.net/v1) Qwen 3.8 Flash Next, Qwen 3.8 27B, Gemma 4
    SCRAPER_APISFREELLM, // APIsFreeLLM (api.apisfreellm.com/v1) 10,000 req/day zero-key stream
    SCRAPER_LLM7,        // LLM7 (api.llm7.io/v1) Codestral Latest, Gemma 3 27B, GPT-OSS 20B
    SCRAPER_POLLINATIONS,// Pollinations (text.pollinations.ai/openai) OpenAI reasoning stream
    SCRAPER_YQCLOUD,     // YQCloud (api.binjie.fun/api/generateStream) zero-auth fast stream
    OFFICIAL_OPENAI,     // OpenAI-compatible (/v1/chat/completions)
    OFFICIAL_ANTHROPIC,  // Anthropic Messages API (/v1/messages)
    OFFICIAL_GEMINI      // Google Gemini API (/v1beta/models/{model}:streamGenerateContent)
};

struct ModelSpec {
    std::string id;
    std::string label;
    std::string note;
    bool supports_reasoning = false;
    bool supports_web_search = false;
    bool supports_vision = false;
    int tokens_per_sec_estimate = 120;
};

struct ProviderPreset {
    std::string slug;
    std::string label;
    ProviderFormat format;
    std::string base_url;
    std::string default_model;
    std::vector<ModelSpec> models;
    int context_window = 128000;
    int max_output_tokens = 8192;
    bool key_required = false;
    std::string badge;
};

struct ChatMessage {
    std::string role;      // "system", "user", "assistant"
    std::string content;
    std::string reasoning; // Repaired automatically for K2Horizon multi-turn history
};

struct StreamChunk {
    std::string type;      // "text", "thought", "search", "tool_call", "done", "error", "retry"
    std::string content;
    std::string model;
    int prompt_tokens = 0;
    int completion_tokens = 0;
};

using StreamCallback = std::function<void(const StreamChunk&)>;

class KeylessProviderEngine {
public:
    KeylessProviderEngine();
    ~KeylessProviderEngine() = default;

    const std::vector<ProviderPreset>& get_presets() const { return presets_; }
    const ProviderPreset* find_preset(const std::string& slug) const;

    // Stream chat completion from any bundled keyless provider or custom BYOK endpoint
    bool stream_chat(
        const std::string& provider_slug,
        const std::string& model_id,
        const std::vector<ChatMessage>& messages,
        const std::string& reasoning_effort,
        bool web_search,
        const std::string& custom_api_key,
        const std::string& custom_base_url,
        StreamCallback on_chunk
    );

    // Ultra-fast 20,000+ tok/s ChatJimmy (Llama 3.1 8B) auto-title generator & micro-task engine
    std::string generate_instant_title(const std::string& first_user_message);
    std::string run_micro_task(const std::string& system_prompt, const std::string& user_prompt);

    // Cryptographic & session rotation helpers ported from NEB backend_python
    static std::string generate_deepai_tryit_key(const std::string& user_agent);
    static std::string generate_random_ipv4();
    static std::string strip_chatjimmy_tags(const std::string& raw);
    static void parse_k2horizon_details(const std::string& raw, std::string& out_reasoning, std::string& out_answer);

private:
    std::vector<ProviderPreset> presets_;
    std::mutex session_mutex_;
    std::string inception_session_token_;
    int64_t inception_token_expires_ = 0;
    std::string motif_conversation_id_;
    std::string gemini_fsid_;
    std::string gemini_bl_;
    std::string gemini_snlm0e_;

    std::string ensure_inception_session();
    bool warm_gemini_web_session();
};

} // namespace zeus
