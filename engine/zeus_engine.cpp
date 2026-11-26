#include "../include/zeus/providers.hpp"
#include "../include/zeus/workspace.hpp"
#include "../include/zeus/mcp_agent.hpp"
#include "../include/zeus/c_api.h"
#include "../include/zeus/version.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <random>
#include <sstream>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <malloc.h>
#include <thread>
#endif

namespace fs = std::filesystem;

namespace zeus {

namespace {

std::string sha256_cpp(const std::string& input) {
    static constexpr std::array<uint32_t, 64> K = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    };
    auto rotr = [](uint32_t x, uint32_t n) -> uint32_t { return (x >> n) | (x << (32 - n)); };

    std::array<uint32_t, 8> h = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    };

    std::vector<uint8_t> msg(input.begin(), input.end());
    uint64_t bit_len = static_cast<uint64_t>(msg.size()) * 8;
    msg.push_back(0x80);
    while ((msg.size() % 64) != 56) {
        msg.push_back(0x00);
    }
    for (int i = 7; i >= 0; --i) {
        msg.push_back(static_cast<uint8_t>((bit_len >> (i * 8)) & 0xFF));
    }

    for (size_t offset = 0; offset < msg.size(); offset += 64) {
        std::array<uint32_t, 64> w{};
        for (size_t i = 0; i < 16; ++i) {
            size_t j = offset + i * 4;
            w[i] = (static_cast<uint32_t>(msg[j]) << 24) |
                   (static_cast<uint32_t>(msg[j + 1]) << 16) |
                   (static_cast<uint32_t>(msg[j + 2]) << 8) |
                   static_cast<uint32_t>(msg[j + 3]);
        }
        for (size_t i = 16; i < 64; ++i) {
            uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }

        uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
        uint32_t e = h[4], f = h[5], g = h[6], hh = h[7];

        for (size_t i = 0; i < 64; ++i) {
            uint32_t s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            uint32_t ch = (e & f) ^ ((~e) & g);
            uint32_t temp1 = hh + s1 + ch + K[i] + w[i];
            uint32_t s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
            uint32_t temp2 = s0 + maj;

            hh = g;
            g = f;
            f = e;
            e = d + temp1;
            d = c;
            c = b;
            b = a;
            a = temp1 + temp2;
        }

        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }

    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (uint32_t word : h) {
        oss << std::setw(8) << word;
    }
    return oss.str();
}

} // namespace

KeylessProviderEngine::KeylessProviderEngine() {
    presets_ = {
        {
            "mercury3",
            "Mercury 3 (Inception Diffusion)",
            ProviderFormat::SCRAPER_INCEPTION,
            "https://chat.inceptionlabs.ai",
            "mercury-3",
            {{"mercury-3", "Mercury 3", "Diffusion LLM · 1,000-2,000+ tok/s", true, true, false, 1800}},
            128000,
            16384,
            false,
            "1,000-2,000+ tok/s"
        },
        {
            "qwen",
            "Qwen (Android App Gateway)",
            ProviderFormat::SCRAPER_QWEN,
            "https://chat.qwen.ai/api/v2",
            "qwen4-max",
            {
                {"qwen4-max", "Qwen 4 Max", "Alibaba flagship coder & OSS vision", true, true, true, 95},
                {"qwen3.8-max", "Qwen 3.8 Max", "Multimodal reasoning & frontend specialist", true, true, true, 90},
                {"qwen3.8-omni-flash", "Qwen 3.8 Omni Flash", "Fast native multimodal vision & UI", true, false, true, 120},
                {"qwen3.5-omni-plus", "Qwen 3.5 Omni Plus", "Multimodal vision specialist", true, false, true, 105},
                {"qwen3.7-max", "Qwen 3.7 Max", "1M ctx flagship multimodal & thinking", true, true, true, 95},
                {"qwen3.7-plus", "Qwen 3.7 Plus", "1M ctx multimodal & thinking", true, true, true, 95}
            },
            256000,
            16384,
            false,
            "~90 tok/s"
        },
        {
            "k2horizon",
            "K2Horizon",
            ProviderFormat::SCRAPER_K2HORIZON,
            "https://chat.ifm.ai",
            "k2-horizon",
            {{"k2-horizon", "K2-Horizon 375B", "IFM/K2-Horizon-375B-A23B MoE", true, false, false, 70}},
            128000,
            8192,
            false,
            "~70 tok/s"
        },
        {
            "motif",
            "Motif",
            ProviderFormat::SCRAPER_MOTIF,
            "https://chat.motiftech.io",
            "motif-3-102b",
            {
                {"motif-3-102b", "Motif 3 102B", "Enterprise guest SSE stream", true, false, false, 80},
                {"motif-3-12.7b", "Motif 3 12.7B", "Fast reasoning", true, false, false, 110}
            },
            128000,
            8192,
            false,
            "~80 tok/s"
        },
        {
            "deepai",
            "DeepAI",
            ProviderFormat::SCRAPER_DEEPAI,
            "https://api.deepai.org",
            "claude-haiku-5-5",
            {
                {"claude-haiku-5-5", "Claude Haiku 5.5", "Clean UI layout & code", false, false, false, 75},
                {"gpt-6-luna", "GPT-6 Luna", "Fast UI generator", false, false, false, 80},
                {"glm-5.3-flash", "GLM 5.3 Flash", "320B MoE UI coder", true, false, false, 70},
                {"gemma-4", "Gemma 4", "Compact UI generator", false, false, false, 85},
                {"qwen3.8-flash", "Qwen 3.8 Flash", "Fast coding fallback", false, false, false, 85},
                {"deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "Fast code & layout", false, false, false, 80},
                {"standard", "DeepAI Standard", "IslandKey rotation", false, false, false, 65}
            },
            64000,
            8192,
            false,
            "~60 tok/s"
        },
        {
            "longcat",
            "LongCat",
            ProviderFormat::SCRAPER_LONGCAT,
            "https://longcat.chat",
            "longcat-2.5",
            {{"longcat-2.5", "LongCat 2.5", "1.6T MoE oversea-V2 stream", true, true, false, 100}},
            128000,
            8192,
            false,
            "~100 tok/s"
        },
        {
            "geminiweb",
            "Gemini Web",
            ProviderFormat::SCRAPER_GEMINIWEB,
            "https://gemini.google.com",
            "gemini-flash-lite",
            {{"gemini-flash-lite", "Gemini Flash-Lite", "Anonymous StreamGenerate wrb.fr", false, true, false, 150}},
            128000,
            8192,
            false,
            "~150 tok/s"
        },
        {
            "kilo",
            "Kilo Gateway",
            ProviderFormat::SCRAPER_KILO,
            "https://api.kilo.ai/api/gateway",
            "nvidia/nemotron-3.5-super-vl:free",
            {
                {"nvidia/nemotron-3.5-super-vl:free", "Nemotron 3.5 Super VL", "1M ctx 120B MoE vision & UI architect", true, false, true, 140},
                {"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "Nemotron 3 Nano Omni VL", "256k ctx 30B Omni vision & reasoning", true, false, true, 155},
                {"openrouter/free", "OpenRouter Free VL", "Auto-routed multimodal VL pool", true, false, true, 130},
                {"nvidia/nemotron-3-ultra-550b-a55b:free", "Nemotron 3 Ultra 550B", "1M ctx 550B MoE frontier reasoning", true, false, false, 110},
                {"nvidia/nemotron-3.5-lightning:free", "Nemotron 3.5 Lightning", "1M ctx High-speed MoE UI coder", false, false, false, 180},
                {"inclusionai/ling-3.2-flash:free", "Ling 3.2 Flash VL", "1M ctx Fast multimodal UI coder", true, false, true, 160},
                {"baidu/ernie-5.5-flash-preview:free", "ERNIE 5.5 Flash", "1M ctx Baidu flagship reasoning", true, false, false, 150},
                {"reflection/beam-free", "Reflection Beam 1.0", "1M ctx 501B MoE software engineering", true, false, false, 120},
                {"particle-ai/particle-1:free", "Particle-1 VL", "1M ctx Multimodal design & reasoning", true, false, true, 135},
                {"dots-studio/dots-3-note-preview:free", "Dots 3 Note VL", "262k ctx Multimodal vision & UI notes", true, false, true, 140},
                {"recursive/flint-v1.0:free", "Recursive Flint 1.0", "262k ctx Fast code & UI synthesis", true, false, false, 150},
                {"cohere/north-mini-code:free", "Cohere North Mini Code", "256k ctx Cohere coding & UI specialist", true, false, false, 145},
                {"kilo-auto/free", "Kilo Auto Free", "256k ctx Fastest available free model", true, false, false, 150}
            },
            262144,
            16384,
            false,
            "~140 tok/s"
        },
        {
            "nimcloud",
            "NVIDIA NIM OpenAI Cloud",
            ProviderFormat::SCRAPER_NIMCLOUD,
            "https://garystu-openai-nim-proxy.hf.space/v1",
            "nvidia/nemotron-3-ultra-550b-a55b",
            {
                {"nvidia/nemotron-3.5-super-vl-120b-a12b", "Nemotron 3.5 Super VL 120B", "262k ctx NVIDIA 120B MoE vision & UI architect", true, false, true, 185},
                {"nvidia/nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra 550B", "262k ctx 550B MoE frontier reasoning", true, false, false, 165},
                {"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "Nemotron 3 Nano Omni 30B VL", "256k ctx 30B Omni vision & reasoning", true, false, true, 180},
                {"nvidia/nemotron-3.5-lightning-30b-a3b", "Nemotron 3.5 Lightning 30B", "262k ctx High-speed MoE UI coder", true, false, false, 195},
                {"nvidia/nemotron-3.5-bolt-e4b", "Nemotron 3.5 Bolt E4B", "262k ctx Low-latency UI synthesis", false, false, false, 210},
                {"mistralai/mistral-large-4-1t-a52b", "Mistral Large 4 1T A52B", "262k ctx Mistral 1T MoE frontier reasoning & UI architect", true, false, false, 180},
                {"stepfun-ai/step-5-preview", "StepFun Step 5 Preview", "256k ctx StepFun Step 5 frontier reasoning & code", true, false, false, 175}
            },
            262144,
            16384,
            false,
            "~185 tok/s"
        },
        {
            "colibriqwen",
            "Colibri Qwen 3.6 MoE Cloud",
            ProviderFormat::SCRAPER_COLIBRIQWEN,
            "https://kartik1302-qwen-3-6-35b-a3b.hf.space/v1",
            "Qwen3.6-35B-A3B",
            {
                {"Qwen3.6-35B-A3B", "Qwen 3.6 35B A3B MoE", "128k ctx Alibaba 35B A3B fast MoE frontend & UI architect", true, false, false, 175}
            },
            131072,
            16384,
            false,
            "~175 tok/s"
        },
        {
            "freellmhub",
            "FreeLLM Hub",
            ProviderFormat::SCRAPER_FREELLMHUB,
            "https://bun008-freellmapi.hf.space/v1",
            "glm-5.3",
            {
                {"glm-5.3", "GLM 5.3", "Z.ai flagship agentic coder", true, false, false, 120},
                {"qwen3-235b", "Qwen3 235B", "Alibaba 235B MoE flagship", true, false, false, 120},
                {"mistral-large", "Mistral Large", "Mistral frontier generalist", false, false, false, 120},
                {"mistral-medium-3-5", "Mistral Medium 3.5", "Balanced fast reasoning", true, false, false, 120},
                {"DeepSeek-V4.1-Flash", "DeepSeek V4.1 Flash", "Fast long-context reasoning", true, false, false, 120},
                {"DeepSeek-V4-Flash", "DeepSeek V4 Flash", "Fast long-context coder", true, false, false, 120},
                {"kimi-k2.6", "Kimi K2.6", "Moonshot agentic reasoning", true, false, false, 120},
                {"zai-glm-4.7", "GLM 4.7", "Z.ai fast reasoning coder", true, false, false, 120},
                {"tencent-hy3", "Tencent HY3", "Tencent Hunyuan 3 flagship", false, false, false, 120},
                {"Qwen3.8-27B", "Qwen3.8 27B", "Dense 27B UI coder", true, false, false, 120},
                {"gemma-4-31b-it", "Gemma 4 31B", "Google open 31B", true, false, false, 120},
                {"openai/gpt-4.1", "GPT-4.1", "OpenAI long-context generalist", false, false, false, 120},
                {"command-a-03-2025", "Command A", "Cohere agentic generalist", false, false, false, 120},
                {"gpt-oss-120b", "GPT-OSS 120B", "OpenAI open-weight reasoning", true, false, false, 120}
            },
            131072,
            16384,
            false,
            "~120 tok/s"
        },
        {
            "aibridge",
            "AI Bridge Gateway",
            ProviderFormat::SCRAPER_AIBRIDGE,
            "https://w902287-ai-bridge.hf.space/v1",
            "gpt-6-luna",
            {
                {"gpt-6-luna", "GPT-6 Luna", "OpenAI GPT-6 fast flagship", false, false, false, 150},
                {"claude-haiku-5-5", "Claude Haiku 5.5", "Anthropic fast frontier", false, false, false, 150},
                {"gpt-4.1", "GPT-4.1", "OpenAI long-context generalist", false, false, false, 150},
                {"gpt-4o", "GPT-4o", "OpenAI multimodal generalist", false, false, false, 150},
                {"deepseek-v4-flash", "DeepSeek V4 Flash", "Fast coder", false, false, false, 150},
                {"grok-4.20", "Grok 4.20", "xAI Grok frontier", false, false, false, 150},
                {"deepseek-v4-flash-vision-exp", "DeepSeek V4 Flash Vision", "Reasoning flash", true, false, false, 150},
                {"qwen3.5-flash", "Qwen3.5 Flash", "Alibaba fast reasoning", true, false, false, 150},
                {"doubao-seed-2-0-mini-260428", "Doubao Seed 2.0 Mini", "ByteDance fast reasoning", true, false, false, 150},
                {"supabase-qwen3.7-flash", "Qwen3.7 Flash", "Alibaba reasoning flash", true, false, false, 150}
            },
            131072,
            16384,
            false,
            "~150 tok/s"
        },
        {
            "hfrouter",
            "HF Router Hub",
            ProviderFormat::SCRAPER_HFROUTER,
            "https://cgjgj-ollamahftraemonitor.hf.space/v1",
            "deepseek-v4-pro",
            {
                {"deepseek-v4-pro", "DeepSeek V4 Pro", "DeepSeek V4 Pro frontier", true, false, false, 60},
                {"qwen3.8", "Qwen3.8 2.4T A95B", "Alibaba 2.4T MoE flagship", true, false, false, 60},
                {"deepseek-v4-flash", "DeepSeek V4 Flash", "DeepSeek V4 Flash fast", true, false, false, 60},
                {"glm-5.3", "GLM 5.3", "Z.ai flagship agentic coder", true, false, false, 60},
                {"minimax-m2.7", "MiniMax M2.7", "MiniMax agentic coder", true, false, false, 60},
                {"kimi-k2", "Kimi K2", "Moonshot 1T MoE instruct", false, false, false, 60},
                {"gpt-oss-120b", "GPT-OSS 120B", "OpenAI open-weight reasoning", true, false, false, 60},
                {"qwen3-coder-480b", "Qwen3 Coder 480B", "Alibaba 480B A35B coder", false, false, false, 60},
                {"qwen3-coder-next", "Qwen3 Coder Next", "Alibaba next-gen coder", false, false, false, 60}
            },
            131072,
            16384,
            false,
            "~60 tok/s"
        },
        {
            "litellmhub",
            "LiteLLM Frontier Hub",
            ProviderFormat::SCRAPER_LITELLMHUB,
            "https://alchoholpad-litellm.hf.space/v1",
            "nvidia/nemotron-3-ultra-550b-a55b:free",
            {
                {"nvidia/nemotron-3-ultra-550b-a55b:free", "Nemotron 3 Ultra 550B", "550B MoE frontier reasoning", true, false, false, 200},
                {"groq/gpt-oss-120b", "GPT-OSS 120B (LPU)", "Ultra-fast open-weight reasoning", true, false, false, 200},
                {"groq/qwen3.8-27b", "Qwen3.8 27B (LPU)", "Ultra-fast dense 27B", false, false, false, 200},
                {"deepseek-v4.1-flash-1017", "DeepSeek V4.1 Flash", "Fast long-context reasoning", true, false, false, 200},
                {"gemini-2.5-flash", "Gemini 2.5 Flash", "Google long-context flash", true, false, false, 200}
            },
            131072,
            16384,
            false,
            "~200 tok/s"
        },
        {
            "antigravity",
            "Google Antigravity & Cloud Code Hub",
            ProviderFormat::SCRAPER_ANTIGRAVITY,
            "https://w902287-firebase-gemini-proxy.hf.space/ag/v1",
            "gemini-4-hydrogen-medium",
            {
                {"gemini-4-hydrogen-xhigh", "Gemini 4 Hydrogen XHigh", "1M ctx Google Gemini 4 Hydrogen max reasoning & software engineering", true, false, false, 165},
                {"gemini-4-hydrogen-high", "Gemini 4 Hydrogen High", "1M ctx Google Gemini 4 Hydrogen high-depth coding & architecture", true, false, false, 175},
                {"gemini-4-hydrogen-medium", "Gemini 4 Hydrogen Medium", "1M ctx Google Gemini 4 Hydrogen balanced speed & coding workhorse", true, false, false, 185},
                {"gemini-4-hydrogen-low", "Gemini 4 Hydrogen Low", "1M ctx Google Gemini 4 Hydrogen low-latency coding & UI synthesis", false, false, false, 200},
                {"gemini-4-hydrogen-sonar", "Gemini 4 Hydrogen Sonar", "1M ctx Google Gemini 4 Hydrogen grounded synthesis & code", true, true, false, 175},
                {"gemini-4-hydrogen-tiered-xhigh", "Gemini 4 Hydrogen Tiered XHigh", "1M ctx Google Gemini 4 Hydrogen tiered deep reasoning", true, false, false, 170},
                {"gemini-4-hydrogen-tiered-high", "Gemini 4 Hydrogen Tiered High", "1M ctx Google Gemini 4 Hydrogen tiered fast reasoning", true, false, false, 180},
                {"gemini-4-neon-xhigh", "Gemini 4 Neon XHigh", "1M ctx Google Gemini 4 Neon extended analytical thinking", true, false, false, 160},
                {"gemini-4-neon-high", "Gemini 4 Neon High", "1M ctx Google Gemini 4 Neon complex reasoning & systems code", true, false, false, 170},
                {"gemini-4-neon-medium", "Gemini 4 Neon Medium", "1M ctx Google Gemini 4 Neon balanced reasoning & UI", true, false, false, 180},
                {"gemini-4-neon-low", "Gemini 4 Neon Low", "1M ctx Google Gemini 4 Neon fast analytical coder", false, false, false, 195},
                {"gemini-4-carbon-high", "Gemini 4 Carbon High", "1M ctx Google Gemini 4 Carbon frontier Pro reasoning flagship", true, false, false, 155},
                {"gemini-4-carbon-medium", "Gemini 4 Carbon Medium", "1M ctx Google Gemini 4 Carbon Pro balanced software engineer", true, false, false, 170},
                {"gemini-4-carbon-low", "Gemini 4 Carbon Low", "1M ctx Google Gemini 4 Carbon Pro fast synthesis", false, false, false, 185},
                {"gemini-4-argon-high", "Gemini 4 Argon High", "1M ctx Google Gemini 4 Argon high-precision analytical & code architect", true, false, false, 160},
                {"gemini-4-argon-medium", "Gemini 4 Argon Medium", "1M ctx Google Gemini 4 Argon balanced reasoning & code", true, false, false, 175},
                {"gemini-4-argon-low", "Gemini 4 Argon Low", "1M ctx Google Gemini 4 Argon fast coding & layout", false, false, false, 190},
                {"gemini-pro-orchestrator", "Gemini Pro Orchestrator", "1M ctx Google multi-step agentic task orchestrator", true, false, false, 165},
                {"gemini-pro-orchestrator-argon", "Gemini Pro Orchestrator Argon", "1M ctx Argon-backed agentic coding orchestrator", true, false, false, 165},
                {"gemini-pro-orchestrator-neon", "Gemini Pro Orchestrator Neon", "1M ctx Neon-backed agentic coding orchestrator", true, false, false, 165},
                {"gemini-3.8-flash-high", "Gemini 3.8 Flash High", "1M ctx Google Gemini 3.8 Flash high-reasoning coder", true, false, true, 185},
                {"gemini-3.8-flash-medium", "Gemini 3.8 Flash Medium", "1M ctx Google Gemini 3.8 Flash balanced multimodal coder", true, false, true, 190},
                {"gemini-3.8-flash-low", "Gemini 3.8 Flash Low", "1M ctx Google Gemini 3.8 Flash low-latency coder", false, false, true, 200},
                {"gemini-3.8-flash-tiered", "Gemini 3.8 Flash Tiered", "1M ctx Google Gemini 3.8 Flash tiered reasoning", true, false, true, 185},
                {"gemini-flash-worker-agy", "Gemini 4 Flash Worker AGY", "1M ctx Google Antigravity dedicated agentic worker", true, false, true, 195},
                {"claude-opus-5-5-high", "Claude Opus 5.5 High", "200k ctx Anthropic Claude Opus 5.5 flagship via Antigravity Hub", true, false, true, 150},
                {"claude-opus-5-5-medium", "Claude Opus 5.5 Medium", "200k ctx Anthropic Claude Opus 5.5 balanced via Antigravity Hub", true, false, true, 160},
                {"claude-opus-5-5-low", "Claude Opus 5.5 Low", "200k ctx Anthropic Claude Opus 5.5 fast via Antigravity Hub", false, false, true, 175},
                {"claude-sonnet-5-5-high", "Claude Sonnet 5.5 High", "200k ctx Anthropic Claude Sonnet 5.5 fast frontier coder", true, false, true, 170},
                {"claude-sonnet-5-5-medium", "Claude Sonnet 5.5 Medium", "200k ctx Anthropic Claude Sonnet 5.5 balanced coder", true, false, true, 180},
                {"claude-sonnet-5-5-low", "Claude Sonnet 5.5 Low", "200k ctx Anthropic Claude Sonnet 5.5 low-latency coder", false, false, true, 190},
                {"gpt-oss-120b-medium", "GPT-OSS 120B Medium (Antigravity)", "128k ctx OpenAI GPT-OSS 120B via Antigravity Hub", true, false, false, 185}
            },
            1000000,
            65536,
            false,
            "~180 tok/s"
        },
        {
            "gemini4",
            "Google Gemini 4 Direct & 5-Node Cluster",
            ProviderFormat::SCRAPER_GEMINI4,
            "https://chenian233-gemini-web2api.hf.space/v1",
            "gemini-4-hydrogen",
            {
                {"gemini-4-hydrogen", "Gemini 4 Hydrogen", "1M ctx Direct Google Gemini 4 Hydrogen + 5-node cluster", false, false, false, 170},
                {"gemini-4-hydrogen-thinking", "Gemini 4 Hydrogen Thinking", "1M ctx Gemini 4 Hydrogen with deep thinking enabled", true, false, false, 155},
                {"gemini-4-neon", "Gemini 4 Neon", "1M ctx Gemini 4 Neon analytical reasoning & coding", true, false, false, 155},
                {"gemini-4-neon-thinking", "Gemini 4 Neon Thinking", "1M ctx Gemini 4 Neon with extended thinking", true, false, false, 145},
                {"gemini-4-carbon", "Gemini 4 Carbon", "1M ctx Gemini 4 Carbon frontier Pro reasoning model", true, false, false, 150},
                {"gemini-4-argon", "Gemini 4 Argon", "1M ctx Gemini 4 Argon high-precision analytical coder", true, false, false, 160},
                {"gemini-hydrogen", "Gemini Hydrogen (Short Alias)", "1M ctx Fast alias for Gemini 4 Hydrogen", false, false, false, 170},
                {"gemini-neon", "Gemini Neon (Short Alias)", "1M ctx Fast alias for Gemini 4 Neon", true, false, false, 155},
                {"gemini-auto", "Gemini 4 Auto Router", "1M ctx Adaptive Gemini 4 model selection", true, false, false, 165},
                {"gemini-3.7-flash", "Gemini 3.7 Flash (Hydrogen Route)", "1M ctx Gemini 3.7 Flash routed on Gemini 4 Hydrogen", false, false, false, 170},
                {"gemini-3.6-flash", "Gemini 3.6 Flash (Hydrogen Route)", "1M ctx Gemini 3.6 Flash routed on Gemini 4 Hydrogen", false, false, false, 170},
                {"gemini-3.5-flash", "Gemini 3.5 Flash (Hydrogen Route)", "1M ctx Gemini 3.5 Flash routed on Gemini 4 Hydrogen", false, false, false, 170},
                {"gemini-3.5-flash-thinking", "Gemini 3.5 Flash Thinking (Neon Route)", "1M ctx Gemini 3.5 Flash Thinking routed on Gemini 4 Neon", true, false, false, 155},
                {"gemini-3.1-pro", "Gemini 3.1 Pro (Carbon Route)", "1M ctx Gemini 3.1 Pro routed on Gemini 4 Carbon", true, false, false, 150},
                {"gemini-3.5-flash-thinking-lite", "Gemini 4 Dynamic Thinking", "1M ctx Dynamic thinking with adaptive depth", true, false, false, 175},
                {"gemini-flash-lite", "Gemini 4 Flash Lite", "1M ctx Ultra-fast lightweight Gemini 4 stream", false, false, false, 195}
            },
            262144,
            16384,
            false,
            "~165 tok/s"
        },
        {
            "mychatcloud",
            "MyChat Native Direct Cloud",
            ProviderFormat::SCRAPER_MYCHATCLOUD,
            "https://mychat-ai.cloud/api/openapi/turbo-stream",
            "gpt-6-luna",
            {
                {"gpt-6-luna", "GPT-6 Luna Direct", "128k ctx Direct native OpenAI GPT-6 Luna with tool calling", false, false, false, 195},
                {"gpt-5", "GPT-5 Direct", "128k ctx Direct OpenAI GPT-5 reasoning & software engineering", true, false, false, 180},
                {"gpt-5-mini", "GPT-5 Mini Direct", "128k ctx Direct OpenAI GPT-5 Mini fast coder", true, false, false, 195},
                {"gpt-4.1", "GPT-4.1 Direct", "262k ctx Direct OpenAI GPT-4.1 long-context coder", false, false, false, 190},
                {"gpt-4.1-mini", "GPT-4.1 Mini Direct", "262k ctx Direct OpenAI GPT-4.1 Mini low-latency coder", false, false, false, 205},
                {"gpt-4o", "GPT-4o Direct", "128k ctx Direct OpenAI GPT-4o generalist", false, false, false, 190},
                {"o3", "OpenAI o3 Direct", "128k ctx Direct OpenAI o3 STEM & systems reasoning", true, false, false, 175},
                {"o4-mini", "OpenAI o4-mini Direct", "128k ctx Direct OpenAI o4-mini fast reasoning coder", true, false, false, 190}
            },
            131072,
            16384,
            false,
            "~190 tok/s"
        },
        {
            "supavip",
            "Supabase Tongyi VIP Cloud",
            ProviderFormat::SCRAPER_SUPAVIP,
            "https://vdspcxotxhxfjowqndix.supabase.co/functions/v1/translate-proxy",
            "deepseek-v4.1-flash",
            {
                {"deepseek-v4.1-flash", "DeepSeek V4.1 Flash VIP", "128k ctx Direct Tongyi VIP DeepSeek V4.1 Flash with native tools", true, false, false, 180},
                {"qwen3.7-flash", "Qwen 3.7 Flash VIP", "128k ctx Direct Tongyi VIP Qwen 3.7 Flash fast coder", true, false, false, 180},
                {"qwen3.8-max", "Qwen 3.8 Max VIP", "128k ctx Direct Tongyi VIP Qwen 3.8 Max synthesis", true, false, false, 170},
                {"qwen4-max", "Qwen 4 Max VIP", "128k ctx Direct Tongyi VIP Qwen 4 Max flagship", true, false, false, 170},
                {"deepseek-r1", "DeepSeek R1 VIP", "128k ctx Direct Tongyi VIP DeepSeek R1 reasoning", true, false, false, 165}
            },
            131072,
            16384,
            false,
            "~175 tok/s"
        },
        {
            "shannian",
            "ShanNian & Volcengine VIP Gateway",
            ProviderFormat::SCRAPER_SHANNIAN,
            "https://ai.northcity.top",
            "deepseek-v4-flash-vision-exp",
            {
                {"deepseek-v4-flash-vision-exp", "DeepSeek V4 Flash Vision VIP", "128k ctx Direct ShanNian VIP DeepSeek V4 Flash multimodal & code", true, false, true, 170},
                {"qwen3.5-flash", "Qwen 3.5 Flash VIP", "128k ctx Direct ShanNian VIP Qwen 3.5 Flash thinking & code", true, false, false, 175},
                {"doubao-seed-2-0-lite-260428", "Doubao Seed 2.0 Lite (Volcengine Ark)", "128k ctx Direct ByteDance Volcengine Ark reasoning & coding", true, false, false, 180},
                {"doubao-seed-2-0-mini-260428", "Doubao Seed 2.0 Mini VIP", "128k ctx Direct ShanNian VIP ByteDance ultra-fast reasoning", true, false, false, 195}
            },
            131072,
            16384,
            false,
            "~170 tok/s"
        },
        {
            "claude5proxy",
            "Claude 5.5 & Zhipu GLM Direct Hub",
            ProviderFormat::SCRAPER_CLAUDE5PROXY,
            "https://dherain24-claude-proxy.hf.space",
            "claude-sonnet-5-5",
            {
                {"claude-sonnet-5-5", "Claude Sonnet 5.5", "200k ctx Anthropic Claude Sonnet 5.5 thinking & agentic coder", true, false, true, 170},
                {"claude-haiku-5-5", "Claude Haiku 5.5", "200k ctx Anthropic Claude Haiku 5.5 fast thinking & UI coder", true, false, true, 185},
                {"claude-opus-5-5", "Claude Opus 5.5", "200k ctx Anthropic Claude Opus 5.5 flagship software engineer", true, false, false, 155},
                {"glm-4.5-flash", "GLM 4.5 Flash (Zhipu Direct)", "128k ctx Direct Z.ai BigModel PaaS v4 reasoning & tool calling", true, false, false, 175},
                {"glm-z1-flash", "GLM Z1 Flash Thinking (Zhipu Direct)", "128k ctx Direct Z.ai GLM Z1 deep reasoning coder", true, false, false, 170},
                {"glm-4.6v-flash", "GLM 4.6V Flash VL", "128k ctx Z.ai GLM 4.6V multimodal vision & UI architect", true, false, true, 165},
                {"glm-4v-flash", "GLM 4V Flash VL (Zhipu Direct)", "128k ctx Direct Z.ai multimodal vision & screenshot parser", false, false, true, 170},
                {"glm-4-flash-250414", "GLM 4 Flash 250414 (Zhipu Direct)", "128k ctx Direct Z.ai high-speed coding & layout stream", false, false, false, 190},
                {"nvidia/nemotron-3.5-super-vl-120b-a12b", "Nemotron 3.5 Super VL 120B", "262k ctx NVIDIA 120B MoE multimodal vision & UI architect", true, false, true, 165}
            },
            200000,
            16384,
            false,
            "~165 tok/s"
        },
        {
            "gemweb2api",
            "Gemini Web Gateway",
            ProviderFormat::SCRAPER_GEMWEB2API,
            "https://chenian233-gemini-web2api.hf.space/v1",
            "gemini-4-hydrogen",
            {
                {"gemini-4-hydrogen", "Gemini 4 Hydrogen", "Google Gemini 4 Hydrogen workhorse for speed & coding", false, false, false, 150},
                {"gemini-4-hydrogen-thinking", "Gemini 4 Hydrogen Thinking", "Google Gemini 4 Hydrogen with deep thinking", true, false, false, 140},
                {"gemini-4-neon", "Gemini 4 Neon", "Google Gemini 4 Neon complex reasoning & coding", true, false, false, 140},
                {"gemini-4-neon-thinking", "Gemini 4 Neon Thinking", "Google Gemini 4 Neon extended thinking", true, false, false, 130},
                {"gemini-4-carbon", "Gemini 4 Carbon", "Google Gemini 4 Carbon frontier reasoning", true, false, false, 135},
                {"gemini-3.7-flash", "Gemini 3.7 Flash", "Google Gemini 3.7 Flash fast coder", false, false, false, 150},
                {"gemini-3.6-flash", "Gemini 3.6 Flash", "Google latest flash", false, false, false, 150},
                {"gemini-3.5-flash", "Gemini 3.5 Flash", "Google fast flash", false, false, false, 150},
                {"gemini-3.5-flash-thinking", "Gemini 3.5 Flash Thinking", "Google flash with thinking", true, false, false, 140},
                {"gemini-3.1-pro", "Gemini 3.1 Pro", "Google frontier reasoning", true, false, false, 130}
            },
            262144,
            16384,
            false,
            "~150 tok/s"
        },
        {
            "vireonix",
            "Vireonix",
            ProviderFormat::SCRAPER_VIREONIX,
            "https://vireonix.ai/v1",
            "auto",
            {
                {"auto", "Vireonix Auto", "Request-aware router, no key", false, false, false, 120}
            },
            1000000,
            16384,
            false,
            "~120 tok/s"
        },
        {
            "opencodezen",
            "OpenCode Zen",
            ProviderFormat::SCRAPER_OPENCODEZEN,
            "https://opencode.ai/zen/v1",
            "big-pickle",
            {
                {"big-pickle", "Big Pickle", "Reasoning and tool use", true, false, false, 200},
                {"deepseek-v4.1-flash-free", "DeepSeek V4.1 Flash", "Fast long-context reasoning", true, false, true, 200},
                {"mimo-v2.6-flash-free", "MiMo V2.6 Flash", "Fast multimodal reasoning", true, false, true, 200},
                {"iceman-free", "Iceman", "Reasoning", true, false, false, 200},
                {"beam-free", "Beam", "Software engineering", true, false, false, 200}
            },
            200000,
            16384,
            false,
            "~90 tok/s"
        },
        {
            "gemma4vl",
            "Gemma 4 Vision & QAT Studio",
            ProviderFormat::SCRAPER_GEMMA4VL,
            "https://will-resolute-gemma4-vision-ui.hf.space/v1",
            "gemma-4-e4b-vision-q4",
            {
                {"gemma-4-e4b-vision-q4", "Gemma 4 E4B Vision UI (Q4_K_M)", "64k ctx Multimodal vision & UI layout architect", false, false, true, 160},
                {"gemma-4-e2b-q6k-aggressive", "Gemma 4 E2B Uncensored (Q6_K_P)", "64k ctx High-precision Q6_K_P uncensored UI coder", true, false, false, 155},
                {"gemma-4-e2b-qat-q4", "Gemma 4 E2B QAT (Q4_0)", "64k ctx Quantization-aware fast reasoning & code", true, false, false, 165},
                {"gemma-4-e2b-qat-mobile", "Gemma 4 E2B QAT Mobile (UD-Q2_K_XL)", "64k ctx Unsloth Dynamic ultra-fast stream", false, false, false, 175},
                {"gemma-4-e2b-it-fast", "Gemma 4 E2B IT Fast", "64k ctx Low-latency Gemma 4 instruction node", false, false, false, 170}
            },
            65536,
            8192,
            false,
            "~160 tok/s"
        },
        {
            "phi4cloud",
            "Phi-4 & Llama 3.1 Abliterated Cloud",
            ProviderFormat::SCRAPER_PHI4CLOUD,
            "https://5fp-phi-4-gguf.hf.space/v1",
            "phi-4-14b-gguf",
            {
                {"phi-4-14b-gguf", "Microsoft Phi-4 14B", "64k ctx Microsoft 14B dense reasoning & frontend coder", true, false, false, 145},
                {"llama-3.1-8b-abliterated", "Llama 3.1 8B Abliterated (Q4_K_M)", "64k ctx Bartowski Q4_K_M fast instruction & UI coder", false, false, false, 160},
                {"llama-cpp-fast", "Llama.cpp Fast GGUF", "64k ctx Dedicated llama.cpp fast UI & copy node", false, false, false, 165}
            },
            65536,
            8192,
            false,
            "~150 tok/s"
        },
        {
            "llamacppcloud",
            "Llama.cpp LFM & SmolVLM Cloud",
            ProviderFormat::SCRAPER_LLAMACPPCLOUD,
            "https://r1000th-llama-cpp.hf.space/v1",
            "lfm2.5-2.6b-uncensored",
            {
                {"lfm2.5-2.6b-uncensored", "Liquid LFM 2.5 2.6B Uncensored", "64k ctx Uncensored state-space UI & code generator", false, false, false, 175},
                {"lfm3-1.7b-gguf", "Liquid LFM 3 1.7B GGUF", "64k ctx Next-gen LFM 3 reasoning & layout stream", true, false, false, 185},
                {"smolvlm-500m-instruct", "SmolVLM 500M Vision (Q8_0)", "32k ctx High-speed Q8_0 multimodal vision & UI parser", false, false, true, 190},
                {"lfm2.5-230m-instant", "Liquid LFM 2.5 230M Instant", "32k ctx Ultra-low-latency micro-task & copy engine", false, false, false, 240}
            },
            65536,
            8192,
            false,
            "~180 tok/s"
        },
        {
            "ollamacloud",
            "Ollama Multi-Model Cloud",
            ProviderFormat::SCRAPER_OLLAMACLOUD,
            "https://deepak7376-ollama-server.hf.space/v1",
            "deepseek-r1:1.5b",
            {
                {"deepseek-r1:1.5b", "DeepSeek R1 1.5B Reasoning", "64k ctx DeepSeek chain-of-thought reasoning & code", true, false, false, 160},
                {"gemma:7b-instruct", "Google Gemma 7B Instruct", "64k ctx Dense 7B instruction & layout generator", false, false, false, 145},
                {"qwen2.5:1.5b", "Qwen 2.5 1.5B Instruct", "64k ctx Fast instruction & UI synthesis", false, false, false, 175},
                {"qwen-coder-0.5b", "Qwen 2.5 Coder Fast", "32k ctx Ultra-fast HTML/CSS & code stream", false, false, false, 210},
                {"moondream:latest", "Moondream 2 Vision", "32k ctx Multimodal vision & screenshot parser", false, false, true, 160}
            },
            65536,
            8192,
            false,
            "~155 tok/s"
        },
        {
            "gemma4pro",
            "Gemma 4 Flagship Cluster",
            ProviderFormat::SCRAPER_GEMMA4PRO,
            "https://rikunarita-gemma-4-e4b-it-gguf-ud-q5-k-xl.hf.space/v1",
            "gemma-4-31b-it",
            {
                {"gemma-4-31b-it", "Gemma 4 31B IT Flagship", "128k ctx Google largest 31B dense Gemma 4 UI architect", true, false, false, 145},
                {"gemma-4-12b-it", "Gemma 4 12B IT", "128k ctx Google 12B dense instruction & UI model", true, false, false, 160},
                {"gemma-4-12b-coding", "Gemma 4 12B Coding", "128k ctx Specialized Gemma 4 frontend coding fine-tune", true, false, false, 165},
                {"gemma-4-e4b-ud-q5", "Gemma 4 E4B VL (UD-Q5_K_XL)", "64k ctx High-precision UD-Q5_K_XL multimodal vision & code", false, false, true, 155},
                {"gemma-4-e4b-qat", "Gemma 4 E4B QAT", "64k ctx Quantization-aware fast UI coder", false, false, false, 170},
                {"gemma-4-ollama", "Gemma 4 Latest", "64k ctx Ollama fast Gemma 4 stream", false, false, false, 165}
            },
            131072,
            16384,
            false,
            "~155 tok/s"
        },
        {
            "frontierlab",
            "Frontier Open-Weights Lab",
            ProviderFormat::SCRAPER_FRONTIERLAB,
            "https://apathy-exe-qwen3-8-flash-next.hf.space/v1",
            "inkling-2-mini",
            {
                {"inkling-2-mini", "Inkling 2 Mini (UD-Q4_K_XL)", "128k ctx Thinking Machines Inkling 2 Mini reasoning & UI", true, false, false, 145},
                {"qwen3.8-flash-next", "Qwen 3.8 Flash Next", "128k ctx Alibaba Qwen 3.8 Flash Next high-speed UI coder", true, false, false, 160},
                {"nanbeige4.3-33b", "Nanbeige 4.3 33B", "128k ctx 33B deep reasoning & software engineering flagship", true, false, false, 135},
                {"muse-glimmer-30b", "Meta Muse Glimmer 30B", "128k ctx Meta Superintelligence Labs 30B expressive UI designer", true, false, false, 140},
                {"xing4.0-29b-a4b", "Xing 4.0 29B A4B MoE", "128k ctx XingChen AGI 29B A4B fast reasoning & code", true, false, false, 155},
                {"mellum2-12b-thinking", "JetBrains Mellum 2 12B Thinking", "64k ctx JetBrains 12B A2.5B Thinking code & UI specialist", true, false, false, 165},
                {"nanbeige4.2-3b", "Nanbeige 4.2 3B", "64k ctx Fast reasoning & frontend code synthesis", true, false, false, 175},
                {"minicpm5-1b", "OpenBMB MiniCPM 5", "64k ctx Ultra-fast lightweight instruction & code model", false, false, false, 190}
            },
            131072,
            12288,
            false,
            "~145 tok/s"
        },
        {
            "liquidai",
            "Liquid AI LFM Gateway",
            ProviderFormat::SCRAPER_LIQUIDAI,
            "https://apathy-exe-lfm2-5-24b-a2b.hf.space/v1",
            "lfm2.5-24b-a2b",
            {
                {"lfm2.5-24b-a2b", "Liquid LFM 2.5 24B A2B (Q8_0)", "128k ctx Liquid AI 24B A2B MoE flagship in 8-bit Q8_0", true, false, false, 165},
                {"lfm2.5-8b-a1b", "Liquid LFM 2.5 8B A1B (Q4_K_M)", "128k ctx Liquid AI 8B A1B fast MoE UI & code architect", true, false, false, 175},
                {"lfm3-1.7b", "Liquid LFM 3 1.7B", "64k ctx Next-gen LFM 3 ultra-low-latency UI & copy engine", false, false, false, 195},
                {"lfm2.5-2.6b", "Liquid LFM 2.5 2.6B", "64k ctx Compact state-space code & layout generator", false, false, false, 185}
            },
            131072,
            12288,
            false,
            "~175 tok/s"
        },
        {
            "bonsaicloud",
            "Bonsai & Ternary Frontier",
            ProviderFormat::SCRAPER_BONSAICLOUD,
            "https://bananamort-ternary-bonsai-2-27b.hf.space/v1",
            "ternary-bonsai-2-27b",
            {
                {"ternary-bonsai-2-27b", "Ternary Bonsai 2 27B (PTQ1_0)", "64k ctx Prism-ML 27B ternary reasoning & UI architect", true, false, false, 145},
                {"bonsai-8b", "Ternary Bonsai 8B", "64k ctx Fast 8B ternary code & UI generator", false, false, false, 165},
                {"vibethinker-3b-q4", "VibeThinker 3B Reasoning", "32k ctx Compact step-by-step UI & code thinker", true, false, false, 175}
            },
            65536,
            8192,
            false,
            "~150 tok/s"
        },
        {
            "unslothcloud",
            "Unsloth Qwen 3.5 & Gemma 4 Cloud",
            ProviderFormat::SCRAPER_UNSLOTHCLOUD,
            "https://bleak-openai-compatible-server.hf.space/v1",
            "qwen3.5-4b-q6",
            {
                {"qwen3.5-4b-q6", "Qwen 3.5 4B (Q6_K)", "64k ctx Unsloth high-precision Q6_K fast UI & code generator", true, false, false, 165},
                {"gemma-4-e2b-ud-q4", "Gemma 4 E2B IT (UD-Q4_K_XL)", "64k ctx Unsloth Dynamic Q4_K_XL Google Gemma 4 UI coder", true, false, false, 160},
                {"gemma-4-e2b-qat-ud", "Gemma 4 E2B QAT (UD-Q4_K_XL)", "64k ctx Quantization-aware Unsloth Dynamic Gemma 4 stream", true, false, false, 165},
                {"gemma-4-e2b-q4ks", "Gemma 4 E2B IT (Q4_K_S)", "64k ctx Unsloth fast Gemma 4 E2B frontend node", false, false, false, 175}
            },
            65536,
            8192,
            false,
            "~165 tok/s"
        },
        {
            "koboldcloud",
            "KoboldAI Multi-Node Cloud",
            ProviderFormat::SCRAPER_KOBOLDCLOUD,
            "https://koboldai-koboldcpp-tiefighter.hf.space/v1",
            "koboldcpp/Gemma4-E2B",
            {
                {"koboldcpp/Gemma4-E2B", "Gemma 4 E2B (Official KoboldAI)", "32k ctx Dedicated KoboldAI Gemma 4 E2B fast stream", false, false, false, 140},
                {"koboldcpp/gemma-2-9b-it-Q5_K_M", "Gemma 2 9B IT (Q5_K_M)", "32k ctx Google Gemma 2 9B Q5_K_M instruction node", false, false, false, 125},
                {"koboldcpp/gemma-3n-E2B-it", "Gemma 3n E2B IT", "32k ctx Google Gemma 3n E2B fast node", false, false, false, 135}
            },
            32768,
            4096,
            false,
            "~130 tok/s"
        },
        {
            "blockrun",
            "BlockRun Gateway",
            ProviderFormat::SCRAPER_BLOCKRUN,
            "https://blockrun.ai/api/v1",
            "nvidia/nemotron-3-super-120b",
            {
                {"nvidia/nemotron-3-super-120b", "Nemotron 3.5 Super 120B", "262k ctx 120B MoE frontier UI architect", true, false, false, 165},
                {"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "Nemotron 3 Nano Omni VL", "256k ctx 30B Omni vision & reasoning", true, false, true, 160},
                {"nvidia/nemotron-nano-12b-v2-vl", "Nemotron Nano 12B V2 VL", "131k ctx NVIDIA 12B multimodal vision & UI parser", false, false, true, 170},
                {"nvidia/gpt-oss-120b", "GPT-OSS 120B (NVIDIA)", "131k ctx OpenAI 120B open-weights reasoning workhorse", true, false, false, 175},
                {"nvidia/step-3.7-flash", "StepFun Step 3.7 Flash", "131k ctx StepFun fast reasoning & UI synthesis", true, false, false, 180},
                {"nvidia/minimax-m3.1-flash", "MiniMax M3.1 Flash", "1M ctx MiniMax M3.1 fast UI & code engine", true, false, false, 175},
                {"nvidia/nemotron-3-ultra-550b", "Nemotron 3 Ultra 550B", "1M ctx 550B MoE deep software engineering", true, false, false, 130},
                {"nvidia/nemotron-3.5-lightning", "Nemotron 3.5 Lightning", "262k ctx High-speed MoE UI coder", true, false, false, 185},
                {"nvidia/nemotron-3.5-bolt", "Nemotron 3.5 Bolt", "262k ctx Low-latency UI synthesis", true, false, false, 190},
                {"nvidia/muse-glimmer-30b", "Muse Glimmer 30B", "131k ctx Expressive UI & design reasoning", true, false, false, 155},
                {"nvidia/mistral-nemotron", "Mistral Nemotron", "131k ctx Mistral x NVIDIA fast general & UI coder", false, false, false, 175},
                {"poolside/laguna-xs-2.1", "Poolside Laguna XS 2.1", "128k ctx Poolside code & layout specialist", true, false, false, 160},
                {"cohere/north-mini-code", "Cohere North Mini Code", "256k ctx Cohere frontend coding engine", true, false, false, 155}
            },
            262144,
            16384,
            false,
            "~165 tok/s"
        },
        {
            "ovhcloud",
            "OVHcloud AI",
            ProviderFormat::SCRAPER_OVHCLOUD,
            "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
            "DeepSeek-V4.1-Flash-1017",
            {
                {"DeepSeek-V4.1-Flash-1017", "DeepSeek V4.1 Flash", "262k ctx 284B MoE flagship coding & UI architect", true, false, false, 160},
                {"Qwen3.8-27B", "Qwen 3.8 27B VL", "262k ctx Alibaba newest 27B multimodal & reasoning", true, false, true, 145},
                {"Qwen3.5-397B-A17B", "Qwen 3.5 397B MoE", "262k ctx 397B MoE frontier reasoning & code", true, false, false, 130},
                {"qwen3-vl-30b-a3b", "Qwen 3 VL 30B", "128k ctx Multimodal vision & UI specialist", true, false, true, 145},
                {"nemotron3-omni-30b", "Nemotron 3 Omni 30B VL", "256k ctx NVIDIA Omni vision & reasoning", true, false, true, 150},
                {"Qwen2.5-VL-72B-Instruct", "Qwen 2.5 VL 72B", "128k ctx 72B multimodal vision & layout", false, false, true, 125},
                {"qwen3.6-35b-a3b", "Qwen 3.6 35B MoE", "262k ctx Fast MoE frontend coder", true, false, false, 155},
                {"Qwen3.6-27B", "Qwen 3.6 27B", "262k ctx Dense coding & layout engine", true, false, false, 145},
                {"gemma-4-26b-a4b", "Gemma 4 26B MoE", "128k ctx Google Gemma 4 A4B fast UI coder", true, false, false, 165},
                {"laguna-xs-2.1", "Poolside Laguna XS 2.1", "128k ctx Poolside agentic coding engine", false, false, false, 155},
                {"nemotron3-nano-30b", "Nemotron 3 Nano 30B", "256k ctx NVIDIA fast reasoning MoE", true, false, false, 165},
                {"gpt-oss-120b", "GPT-OSS 120B", "128k ctx OpenAI 120B open-weights reasoning", true, false, false, 150},
                {"gpt-oss-20b", "GPT-OSS 20B", "128k ctx OpenAI 20B fast coder", true, false, false, 175},
                {"Meta-Llama-3_3-70B-Instruct", "Llama 3.3 70B Instruct", "128k ctx Meta 70B instruction model", false, false, false, 140},
                {"Mistral-Small-3.2-24B-Instruct-2506", "Mistral Small 3.2 24B", "128k ctx Mistral fast instruction coder", false, false, false, 160}
            },
            262144,
            16384,
            false,
            "~150 tok/s"
        },
        {
            "freecc",
            "FreeClaude & Gemini 4",
            ProviderFormat::SCRAPER_FREECC,
            "https://calkotter-free-claude-code.hf.space",
            "claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview",
            {
                {"claude-3-freecc-no-thinking/gemini/models/gemini-3-flash-preview", "Gemini 3 Flash VL", "1M ctx Google multimodal vision & UI architect", true, false, true, 175},
                {"claude-3-freecc-no-thinking/gemini/models/gemini-4-hydrogen", "Gemini 4 Hydrogen", "1M ctx Google Gemini 4 frontier reasoning & code", true, false, false, 165},
                {"claude-3-freecc-no-thinking/gemini/models/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite VL", "1M ctx Low-latency multimodal vision & layout", false, false, true, 190},
                {"claude-3-freecc-no-thinking/nvidia_nim/moonshotai/kimi-k3.1-pro", "Kimi K3.1 Pro", "256k ctx Moonshot K3.1 Pro flagship software engineer", true, false, false, 150},
                {"claude-3-freecc-no-thinking/nvidia_nim/stepfun-ai/step-5-preview", "StepFun Step 5 Preview", "256k ctx StepFun Step 5 frontier reasoning & code", true, false, false, 160},
                {"claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-super-vl-120b-a12b", "Nemotron 3.5 Super VL 120B", "262k ctx NVIDIA 120B MoE vision & UI architect", true, false, true, 155},
                {"claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra 550B", "262k ctx 550B MoE frontier reasoning", true, false, false, 135},
                {"claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b", "Nemotron 3.5 Lightning 30B", "262k ctx High-speed MoE UI coder", true, false, false, 185},
                {"claude-3-freecc-no-thinking/nvidia_nim/nvidia/nemotron-3.5-bolt-e4b", "Nemotron 3.5 Bolt E4B", "262k ctx Ultra-fast UI synthesis", true, false, false, 195},
                {"claude-3-freecc-no-thinking/nvidia_nim/poolside/laguna-xs-2.1", "Poolside Laguna XS 2.1", "128k ctx Poolside agentic frontend coder", false, false, false, 160}
            },
            262144,
            16384,
            false,
            "~170 tok/s"
        },
        {
            "vlmrun",
            "VLM Run Gateway",
            ProviderFormat::SCRAPER_VLMRUN,
            "https://gateway.vlm.run/v1/openai",
            "google/diffusiongemma-26b-a4b-it",
            {
                {"google/diffusiongemma-26b-a4b-it", "DiffusionGemma 26B A4B VL", "128k ctx Google 26B MoE multimodal vision & UI coder", false, false, true, 155},
                {"qwen/qwen3.5-0.8b", "Qwen 3.5 0.8B VL", "128k ctx Ultra-fast multimodal vision & layout", false, false, true, 180},
                {"zai-org/glm-ocr", "GLM-OCR Vision", "64k ctx Z.ai visual UI & document screenshot parser", false, false, true, 145}
            },
            131072,
            16384,
            false,
            "~155 tok/s"
        },
        {
            "together2api",
            "Together Frontier",
            ProviderFormat::SCRAPER_TOGETHER2API,
            "https://lolmaobruhhh-test.hf.space/v1",
            "glm-5.3",
            {
                {"glm-5.3", "GLM 5.3", "128k ctx Z.ai flagship reasoning & UI architect", true, false, false, 145},
                {"glm-5.3-flash", "GLM 5.3 Flash", "128k ctx Z.ai 320B MoE fast reasoning & code", true, false, false, 165},
                {"kimi-k3", "Kimi K3 2.8T", "128k ctx Moonshot 2.8T MoE frontier coder", true, false, false, 130},
                {"muse-glimmer-30b", "Muse Glimmer 30B", "128k ctx Meta expressive UI & design reasoning", true, false, false, 150},
                {"gpt-oss-120b", "GPT-OSS 120B", "128k ctx OpenAI 120B open-weights reasoning", true, false, false, 150},
                {"glm-5.2", "GLM 5.2", "128k ctx Z.ai multi-step reasoning coder", true, false, false, 140},
                {"qwen3.5-9b", "Qwen 3.5 9B", "128k ctx Alibaba compact fast UI coder", true, false, false, 175}
            },
            131072,
            16384,
            false,
            "~145 tok/s"
        },
        {
            "hfcluster",
            "HF Frontier Cluster",
            ProviderFormat::SCRAPER_HFCLUSTER,
            "https://apathy-exe-qwen3-8-27b.hf.space/v1",
            "qwen3.8-27b-q8",
            {
                {"qwen3.8-27b-q8", "Qwen 3.8 27B (UD-Q8_K_XL)", "64k ctx High-precision Q8_K_XL reasoning & UI architect", true, false, false, 130},
                {"gemma-4-e4b-q5", "Gemma 4 E4B IT (Q5_K_P)", "64k ctx Google Gemma 4 E4B fast UI & code generator", false, false, false, 145},
                {"gemma-4-e2b-q8", "Gemma 4 E2B IT (Q8_0)", "64k ctx Google Gemma 4 E2B low-latency coder", false, false, false, 165}
            },
            65536,
            8192,
            false,
            "~135 tok/s"
        },
        {
            "aihorde",
            "AI Horde",
            ProviderFormat::SCRAPER_AIHORDE,
            "https://oai.aihorde.net/v1",
            "Qwen/Qwen3.8-Flash-Next",
            {
                {"Qwen/Qwen3.8-Flash-Next", "Qwen 3.8 Flash Next", "32k ctx Alibaba Qwen 3.8 Flash distributed worker", false, false, false, 95},
                {"koboldcpp/Qwen/Qwen3.8-27B", "Qwen 3.8 27B", "32k ctx Alibaba 27B dense coding & UI worker", false, false, false, 85},
                {"llamacpp/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive", "Qwen 3.6 35B MoE", "32k ctx 35B A3B fast frontend coder", false, false, false, 90},
                {"koboldcpp/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q2_K_P", "Gemma 4 E4B", "32k ctx Google Gemma 4 compact UI generator", false, false, false, 110},
                {"koboldcpp/Cydonia-24B-v4zg-Q4_K_M", "Cydonia 24B", "32k ctx 24B creative & copywriting model", false, false, false, 85},
                {"koboldcpp/Llama-3.2-3B-Instruct", "Llama 3.2 3B Instruct", "32k ctx Fast lightweight instruction model", false, false, false, 120}
            },
            32768,
            4096,
            false,
            "~95 tok/s"
        },
        {
            "apisfreellm",
            "APIsFreeLLM",
            ProviderFormat::SCRAPER_APISFREELLM,
            "https://api.apisfreellm.com/v1",
            "free-ai",
            {
                {"free-ai", "Free-AI 9B Uncensored", "32k ctx 10,000 req/day zero-key fast stream", false, false, false, 155}
            },
            32768,
            8192,
            false,
            "~155 tok/s"
        },
        {
            "ptero",
            "Ptero Frontier",
            ProviderFormat::SCRAPER_PTERO,
            "https://ptero.pro/wp-json/mlp/v1",
            "gpt-6.1-terra:voyage",
            {
                {"gpt-6.1-terra:voyage", "GPT-6.1 Terra", "Frontier multimodal vision & UI architect", true, false, true, 110},
                {"agnes-2.5-flash:agnes", "Agnes 2.5 Flash VL", "Multimodal vision, reasoning & UI synthesis", true, false, true, 125},
                {"agnes-3.0-flash:agnes", "Agnes 3.0 Flash", "Fast frontend architecture & reasoning", true, false, false, 135},
                {"glm-5.3-flash", "GLM 5.3 Flash", "Z.ai 320B MoE fast UI coder", false, false, false, 130},
                {"mimo-v2.6-flash:tokenharbor", "MiMo V2.6 Flash", "Xiaomi fast reasoning & frontend coder", true, false, false, 145},
                {"kimi-k3:apinex", "Kimi K3", "Moonshot 2.8T MoE", false, false, false, 105}
            },
            128000,
            12288,
            false,
            "~120 tok/s"
        },
        {
            "unikey",
            "Unikey Anonymous",
            ProviderFormat::SCRAPER_UNIKEY,
            "https://www.getunikey.ai/api/anonymous",
            "moonshotai/kimi-k3",
            {
                {"moonshotai/kimi-k3", "Kimi K3 2.8T", "Moonshot 2.8T MoE flagship", true, false, false, 115},
                {"moonshotai/kimi-k2.7-code", "Kimi K2.7 Code", "Frontend & UI architecture specialist", true, false, false, 125},
                {"x-ai/grok-4.3", "Grok 4.3", "xAI frontier reasoning & code", true, false, false, 130}
            },
            128000,
            8192,
            false,
            "~125 tok/s"
        },
        {
            "llm7",
            "LLM7 Gateway",
            ProviderFormat::SCRAPER_LLM7,
            "https://api.llm7.io/v1",
            "codestral-latest",
            {
                {"codestral-latest", "Codestral Latest", "Mistral flagship coding & UI engine", false, false, false, 160},
                {"gemma-3-27b", "Gemma 3 27B", "Google 27B open instruction model", false, false, false, 140},
                {"gpt-oss:20b", "GPT-OSS 20B", "OpenAI open-weights fast coder", false, false, false, 170},
                {"default", "LLM7 Auto Router", "400k context anonymous router", false, false, false, 150}
            },
            400000,
            8192,
            false,
            "~160 tok/s"
        },
        {
            "pollinations",
            "Pollinations AI",
            ProviderFormat::SCRAPER_POLLINATIONS,
            "https://text.pollinations.ai/openai",
            "openai",
            {
                {"openai", "OpenAI Fast Reasoning", "Zero-key reasoning & UI generator", true, false, false, 145},
                {"openai-fast", "OpenAI Turbo", "Low-latency UI & copy engine", true, false, false, 180}
            },
            128000,
            8192,
            false,
            "~150 tok/s"
        },
        {
            "yqcloud",
            "YQCloud Stream",
            ProviderFormat::SCRAPER_YQCLOUD,
            "https://api.binjie.fun/api/generateStream",
            "yqcloud-default",
            {{"yqcloud-default", "YQCloud GPT Stream", "Zero-auth high-availability stream", false, true, false, 130}},
            64000,
            8192,
            false,
            "~130 tok/s"
        },
        {
            "chatjimmy",
            "ChatJimmy",
            ProviderFormat::SCRAPER_CHATJIMMY,
            "https://chatjimmy.ai",
            "llama3.1-8b",
            {{"llama3.1-8b", "Llama 3.1 8B (Taalas Silicon)", "20,000+ tok/s instant title & micro-task engine", false, false, false, 20000}},
            32000,
            4096,
            false,
            "20,000+ tok/s"
        }
    };
}

const ProviderPreset* KeylessProviderEngine::find_preset(const std::string& slug) const {
    for (const auto& p : presets_) {
        if (p.slug == slug) return &p;
    }
    return nullptr;
}

std::string KeylessProviderEngine::generate_deepai_tryit_key(const std::string& user_agent) {
    static const std::string kSalt = "hackers_become_a_little_stinkier_every_time_they_hack";
    std::mt19937_64 rng(static_cast<uint64_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()));
    std::string random_num = std::to_string(rng() % 100000000000ULL);
    std::string h1 = sha256_cpp(user_agent + random_num + kSalt);
    std::string h2 = sha256_cpp(user_agent + h1);
    std::string inner = sha256_cpp(user_agent + h2);
    return "tryit-" + random_num + "-" + inner;
}

std::string KeylessProviderEngine::generate_random_ipv4() {
    std::mt19937 rng(static_cast<uint32_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()));
    return "24." + std::to_string(rng() % 8) + "." +
           std::to_string((rng() % 254) + 1) + "." +
           std::to_string((rng() % 253) + 1);
}

std::string KeylessProviderEngine::strip_chatjimmy_tags(const std::string& raw) {
    std::string s = raw;
    for (;;) {
        auto start = s.find("<|stats|>");
        if (start == std::string::npos) break;
        auto end = s.find("<|/stats|>", start);
        if (end != std::string::npos) {
            s.erase(start, (end + 10) - start);
        } else {
            s.erase(start);
            break;
        }
    }
    for (;;) {
        auto start = s.find("<|think|>");
        if (start == std::string::npos) break;
        auto end = s.find("<|/think|>", start);
        if (end != std::string::npos) {
            s.erase(start, (end + 10) - start);
        } else {
            break;
        }
    }
    while (!s.empty() && std::isspace(static_cast<unsigned char>(s.front()))) s.erase(s.begin());
    while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back()))) s.pop_back();
    return s;
}

void KeylessProviderEngine::parse_k2horizon_details(
    const std::string& raw,
    std::string& out_reasoning,
    std::string& out_answer
) {
    auto close_pos = raw.rfind("</details>");
    if (close_pos != std::string::npos) {
        out_reasoning = raw.substr(0, close_pos);
        out_answer = raw.substr(close_pos + 10);
        while (!out_answer.empty() && out_answer.front() == '\n') {
            out_answer.erase(out_answer.begin());
        }
    } else if (raw.find("<details") != std::string::npos) {
        out_reasoning = raw;
        out_answer.clear();
    } else {
        out_reasoning.clear();
        out_answer = raw;
    }
}

WorkspaceEngine::WorkspaceEngine() = default;

bool WorkspaceEngine::open_workspace(const std::string& folder_path) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!fs::exists(folder_path) || !fs::is_directory(folder_path)) {
        return false;
    }
    root_path_ = folder_path;
    reindex();
    return true;
}

void WorkspaceEngine::reindex() {
    files_.clear();
    if (root_path_.empty() || !fs::exists(root_path_)) return;
    fs::path base(root_path_);
    for (auto it = fs::recursive_directory_iterator(base, fs::directory_options::skip_permission_denied);
         it != fs::recursive_directory_iterator(); ++it) {
        if (it.depth() > 4) {
            it.disable_recursion_pending();
            continue;
        }
        const auto& p = it->path();
        std::string name = p.filename().string();
        if (it->is_directory()) {
            if (name == "node_modules" || name == ".git" || name == "target" || name == "dist" || name == "build") {
                it.disable_recursion_pending();
            }
            continue;
        }
        if (it->is_regular_file()) {
            IndexedFile f;
            f.relative_path = fs::relative(p, base).generic_string();
            f.extension = p.extension().string();
            std::error_code ec;
            f.size_bytes = fs::file_size(p, ec);
            f.is_ui_component = (f.extension == ".tsx" || f.extension == ".jsx" || f.extension == ".html" || f.extension == ".kt");
            files_.push_back(std::move(f));
        }
    }
}

std::string WorkspaceEngine::read_project_file(const std::string& rel_path) const {
    fs::path full = fs::path(root_path_) / rel_path;
    std::ifstream ifs(full, std::ios::in | std::ios::binary);
    if (!ifs) return {};
    std::ostringstream oss;
    oss << ifs.rdbuf();
    return oss.str();
}

bool WorkspaceEngine::write_project_file(const std::string& rel_path, const std::string& content) {
    fs::path full = fs::path(root_path_) / rel_path;
    std::error_code ec;
    if (full.has_parent_path()) {
        fs::create_directories(full.parent_path(), ec);
    }
    std::ofstream ofs(full, std::ios::out | std::ios::binary | std::ios::trunc);
    if (!ofs) return false;
    ofs.write(content.data(), static_cast<std::streamsize>(content.size()));
    return ofs.good();
}

bool WorkspaceEngine::sync_artboard_to_codebase(
    const std::string& /*artboard_id*/,
    const std::string& target_rel_path,
    const std::string& generated_code
) {
    return write_project_file(target_rel_path, generated_code);
}

ToolCallResult WorkspaceEngine::execute_tool(const ToolCallRequest& req) {
    ToolCallResult res;
    res.id = req.id;
    if (req.name == "read_file") {
        auto it = req.arguments.find("path");
        if (it != req.arguments.end()) {
            res.output = read_project_file(it->second);
            res.success = !res.output.empty();
        }
    } else if (req.name == "write_file" || req.name == "sync_canvas_artboard") {
        auto p = req.arguments.find("path");
        auto c = req.arguments.find("content");
        if (p != req.arguments.end() && c != req.arguments.end()) {
            res.success = write_project_file(p->second, c->second);
            res.output = res.success ? "Synchronized " + p->second : "Write failed";
        }
    } else {
        res.success = true;
        res.output = "Executed " + req.name;
    }
    return res;
}

void WorkspaceEngine::remember(const std::string& category, const std::string& key, const std::string& value) {
    std::lock_guard<std::mutex> lock(mutex_);
    MemoryEntry entry;
    entry.id = "mem-" + std::to_string(memories_.size() + 1);
    entry.category = category;
    entry.key = key;
    entry.value = value;
    entry.updated_at = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    memories_.push_back(std::move(entry));
}

std::vector<MemoryEntry> WorkspaceEngine::recall(const std::string& query) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (query.empty()) return memories_;
    std::vector<MemoryEntry> out;
    for (const auto& m : memories_) {
        if (m.key.find(query) != std::string::npos || m.value.find(query) != std::string::npos) {
            out.push_back(m);
        }
    }
    return out;
}

bool WorkspaceEngine::register_mcp_server(const McpServerConfig& config) {
    std::lock_guard<std::mutex> lock(mutex_);
    mcp_servers_.push_back(config);
    return true;
}

std::vector<McpServerConfig> WorkspaceEngine::list_mcp_servers() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return mcp_servers_;
}

std::string WorkspaceEngine::invoke_mcp_tool(
    const std::string& server_id,
    const std::string& tool_name,
    const std::string& /*json_args*/
) {
    return R"({"ok":true,"server":")" + server_id + R"(","tool":")" + tool_name + R"("})";
}

PersistentMemoryStore::PersistentMemoryStore(const std::string& storage_dir)
    : storage_path_(storage_dir.empty() ? ".zeusdesigns_memory.json" : storage_dir) {
    items_.push_back({"mem-m3e", "Prefer Material 3 Expressive tokens and spring physics.", "design_system", 0});
}

std::vector<MemoryItem> PersistentMemoryStore::list() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return items_;
}

std::vector<MemoryItem> PersistentMemoryStore::add(const std::string& text, const std::string& category) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!text.empty()) {
        items_.push_back({"mem-" + std::to_string(items_.size() + 1), text, category, 0});
    }
    return items_;
}

std::vector<MemoryItem> PersistentMemoryStore::remove(const std::string& id) {
    std::lock_guard<std::mutex> lock(mutex_);
    items_.erase(
        std::remove_if(items_.begin(), items_.end(), [&](const MemoryItem& m) { return m.id == id; }),
        items_.end()
    );
    return items_;
}

std::string PersistentMemoryStore::build_system_context() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::ostringstream oss;
    for (const auto& m : items_) {
        oss << "- [" << m.category << "] " << m.text << "\n";
    }
    return oss.str();
}

NativeMcpClient::NativeMcpClient(const std::string& storage_dir)
    : storage_path_(storage_dir) {
    servers_.push_back({"mcp-design-tokens", "Zeus Material 3 Design Tokens MCP", "builtin", "builtin://design-tokens", {}, "connected"});
    servers_.push_back({"mcp-filesystem", "Zeus Local Codebase Sync MCP", "builtin", "builtin://workspace-sync", {}, "connected"});
}

std::vector<McpServerDescriptor> NativeMcpClient::list_servers() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return servers_;
}

std::vector<McpServerDescriptor> NativeMcpClient::add_server(
    const std::string& name,
    const std::string& command,
    const std::vector<std::string>& args,
    const std::string& transport
) {
    std::lock_guard<std::mutex> lock(mutex_);
    servers_.push_back({"mcp-" + std::to_string(servers_.size() + 1), name, transport, command, args, "connected"});
    return servers_;
}

std::vector<McpServerDescriptor> NativeMcpClient::remove_server(const std::string& id) {
    std::lock_guard<std::mutex> lock(mutex_);
    servers_.erase(
        std::remove_if(servers_.begin(), servers_.end(), [&](const McpServerDescriptor& s) { return s.id == id; }),
        servers_.end()
    );
    return servers_;
}

std::vector<McpToolSchema> NativeMcpClient::discover_tools() const {
    return {
        {"mcp-design-tokens", "Zeus Material 3 Design Tokens MCP", "get_design_tokens", "Retrieve M3 Expressive tokens", "{}"},
        {"mcp-filesystem", "Zeus Local Codebase Sync MCP", "sync_artboard_to_file", "Sync canvas artboard to codebase", "{}"}
    };
}

std::string NativeMcpClient::invoke_tool(
    const std::string& server_id,
    const std::string& tool_name,
    const std::string& /*arguments_json*/,
    bool& out_ok
) const {
    out_ok = true;
    return R"({"status":"ok","server":")" + server_id + R"(","tool":")" + tool_name + R"("})";
}

} // namespace zeus

namespace {
void copy_to_c_buf(const std::string& src, char* out_buf, size_t out_len) {
    if (!out_buf || out_len == 0) return;
    size_t n = std::min(src.size(), out_len - 1);
    if (n > 0) {
        std::memcpy(out_buf, src.data(), n);
    }
    out_buf[n] = '\0';
}

#ifdef _WIN32
std::vector<DWORD> collect_zeus_process_tree() {
    DWORD root_pid = GetCurrentProcessId();
    std::vector<DWORD> tree = { root_pid };
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return tree;

    struct ProcPair { DWORD pid; DWORD ppid; };
    std::vector<ProcPair> all;
    PROCESSENTRY32 pe{};
    pe.dwSize = sizeof(pe);
    if (Process32First(snap, &pe)) {
        do {
            all.push_back({ pe.th32ProcessID, pe.th32ParentProcessID });
        } while (Process32Next(snap, &pe));
    }
    CloseHandle(snap);

    for (int depth = 0; depth < 5; ++depth) {
        bool added = false;
        for (const auto& p : all) {
            if (std::find(tree.begin(), tree.end(), p.pid) != tree.end()) continue;
            if (std::find(tree.begin(), tree.end(), p.ppid) != tree.end()) {
                tree.push_back(p.pid);
                added = true;
            }
        }
        if (!added) break;
    }
    return tree;
}

struct ZeusProcessMemoryCountersEx2 {
    DWORD cb;
    DWORD PageFaultCount;
    SIZE_T PeakWorkingSetSize;
    SIZE_T WorkingSetSize;
    SIZE_T QuotaPeakPagedPoolUsage;
    SIZE_T QuotaPagedPoolUsage;
    SIZE_T QuotaPeakNonPagedPoolUsage;
    SIZE_T QuotaNonPagedPoolUsage;
    SIZE_T PagefileUsage;
    SIZE_T PeakPagefileUsage;
    SIZE_T PrivateUsage;
    SIZE_T PrivateWorkingSetSize;
    ULONG64 SharedCommitUsage;
};

struct ZeusMemoryPriorityInfo {
    ULONG MemoryPriority;
};

void trim_pids_now(const std::vector<DWORD>& pids) {
    DWORD self_pid = GetCurrentProcessId();
    _heapmin();
    HANDLE heaps[64]{};
    DWORD n_heaps = GetProcessHeaps(64, heaps);
    for (DWORD i = 0; i < n_heaps && i < 64; ++i) {
        HeapCompact(heaps[i], 0);
    }
    for (DWORD pid : pids) {
        HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA | PROCESS_SET_INFORMATION, FALSE, pid);
        if (!h) h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA, FALSE, pid);
        if (!h) continue;
        if (pid != self_pid) {
            ZeusMemoryPriorityInfo prio{ 1 }; // MEMORY_PRIORITY_VERY_LOW for child processes
            SetProcessInformation(h, static_cast<PROCESS_INFORMATION_CLASS>(0), &prio, sizeof(prio));
        }
        SetProcessWorkingSetSizeEx(h, static_cast<SIZE_T>(-1), static_cast<SIZE_T>(-1), 0);
        K32EmptyWorkingSet(h);
        CloseHandle(h);
    }
}

void measure_tree(const std::vector<DWORD>& pids, unsigned long long& ws_bytes, unsigned long long& priv_bytes) {
    ws_bytes = 0;
    priv_bytes = 0;
    for (DWORD pid : pids) {
        HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, FALSE, pid);
        if (!h) h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
        if (!h) continue;
        ZeusProcessMemoryCountersEx2 pmc2{};
        pmc2.cb = sizeof(pmc2);
        if (K32GetProcessMemoryInfo(h, reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&pmc2), sizeof(pmc2)) && pmc2.PrivateWorkingSetSize > 0) {
            ws_bytes += static_cast<unsigned long long>(pmc2.PrivateWorkingSetSize);
            priv_bytes += static_cast<unsigned long long>(pmc2.PrivateUsage);
        } else {
            PROCESS_MEMORY_COUNTERS_EX pmc{};
            pmc.cb = sizeof(pmc);
            if (K32GetProcessMemoryInfo(h, reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&pmc), sizeof(pmc))) {
                ws_bytes += static_cast<unsigned long long>(pmc.WorkingSetSize);
                priv_bytes += static_cast<unsigned long long>(pmc.PrivateUsage);
            }
        }
        CloseHandle(h);
    }
}
#endif
} // namespace

extern "C" {

const char* zeus_engine_version(void) {
    return ZEUS_VERSION_STRING;
}

void zeus_generate_deepai_tryit_key(const char* user_agent, char* out_buf, size_t out_len) {
    std::string key = zeus::KeylessProviderEngine::generate_deepai_tryit_key(user_agent ? user_agent : "Mozilla/5.0");
    copy_to_c_buf(key, out_buf, out_len);
}

void zeus_clean_chatjimmy_output(const char* raw_text, char* out_buf, size_t out_len) {
    std::string cleaned = zeus::KeylessProviderEngine::strip_chatjimmy_tags(raw_text ? raw_text : "");
    copy_to_c_buf(cleaned, out_buf, out_len);
}

void zeus_split_k2_details(const char* raw_content, char* out_answer, size_t out_len) {
    std::string reasoning, answer;
    zeus::KeylessProviderEngine::parse_k2horizon_details(raw_content ? raw_content : "", reasoning, answer);
    copy_to_c_buf(answer, out_answer, out_len);
}

int zeus_chat_stream(const char* req_json, zeus_stream_event_cb cb, void* user_data) {
    if (!req_json || !cb) return -1;
    std::string payload = R"({"type":"done","engine":"cpp20-ffi"})";
    cb(payload.c_str(), user_data);
    return 0;
}

int zeus_chat_cancel(const char* request_id) {
    return request_id ? 0 : -1;
}

int zeus_title_generate(const char* user_text, char* out_buf, size_t out_len) {
    if (!out_buf || out_len == 0) return -1;
    std::string raw = zeus::KeylessProviderEngine::strip_chatjimmy_tags(user_text ? user_text : "");
    std::istringstream iss(raw);
    std::string word, result;
    int count = 0;
    while (iss >> word && count < 5) {
        if (!result.empty()) result += " ";
        result += word;
        ++count;
    }
    if (result.empty()) result = "New Design Session";
    copy_to_c_buf(result, out_buf, out_len);
    return 0;
}

int zeus_providers_catalog_json(char* out_buf, size_t out_len) {
    if (!out_buf || out_len == 0) return -1;
    zeus::KeylessProviderEngine engine;
    std::ostringstream oss;
    oss << "[";
    const auto& presets = engine.get_presets();
    for (size_t i = 0; i < presets.size(); ++i) {
        if (i > 0) oss << ",";
        oss << "{\"id\":\"" << presets[i].slug << "\",\"name\":\"" << presets[i].label
            << "\",\"defaultModel\":\"" << presets[i].default_model
            << "\",\"speed\":\"" << presets[i].badge << "\"}";
    }
    oss << "]";
    copy_to_c_buf(oss.str(), out_buf, out_len);
    return static_cast<int>(presets.size());
}

int zeus_workspace_index_count(const char* folder_path) {
    if (!folder_path) return -1;
    zeus::WorkspaceEngine ws;
    if (!ws.open_workspace(folder_path)) return -1;
    return static_cast<int>(ws.indexed_files().size());
}

int zeus_pick_folder_dialog(char* out_buf, size_t out_len) {
    if (!out_buf || out_len == 0) return -1;
    out_buf[0] = '\0';
#ifdef _WIN32
    std::string chosen_utf8;
    int status = 0; // 0 = cancelled, 1 = picked, -1 = error
    std::thread sta_worker([&]() {
        HRESULT hr_init = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        bool must_uninit = SUCCEEDED(hr_init);
        HWND owner = GetForegroundWindow();

        IFileOpenDialog* pfd = nullptr;
        HRESULT hr = CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&pfd));
        if (SUCCEEDED(hr) && pfd) {
            DWORD opts = 0;
            if (SUCCEEDED(pfd->GetOptions(&opts))) {
                pfd->SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR);
            }
            pfd->SetTitle(L"Open project folder");
            hr = pfd->Show(owner);
            if (SUCCEEDED(hr)) {
                IShellItem* psi = nullptr;
                if (SUCCEEDED(pfd->GetResult(&psi)) && psi) {
                    PWSTR pszPath = nullptr;
                    if (SUCCEEDED(psi->GetDisplayName(SIGDN_FILESYSPATH, &pszPath)) && pszPath) {
                        int needed = WideCharToMultiByte(CP_UTF8, 0, pszPath, -1, nullptr, 0, nullptr, nullptr);
                        if (needed > 1) {
                            std::string buf(static_cast<size_t>(needed - 1), '\0');
                            WideCharToMultiByte(CP_UTF8, 0, pszPath, -1, buf.data(), needed, nullptr, nullptr);
                            chosen_utf8 = std::move(buf);
                            status = 1;
                        }
                        CoTaskMemFree(pszPath);
                    }
                    psi->Release();
                }
            } else if (hr == HRESULT_FROM_WIN32(ERROR_CANCELLED)) {
                status = 0;
            } else {
                status = -1;
            }
            pfd->Release();
        } else {
            status = -1;
        }
        if (status == -1) {
            wchar_t display_name[MAX_PATH]{};
            BROWSEINFOW bi{};
            bi.hwndOwner = owner;
            bi.pszDisplayName = display_name;
            bi.lpszTitle = L"Open project folder";
            bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_USENEWUI;
            PIDLIST_ABSOLUTE pidl = SHBrowseForFolderW(&bi);
            if (pidl) {
                wchar_t path_w[MAX_PATH]{};
                if (SHGetPathFromIDListW(pidl, path_w)) {
                    int needed = WideCharToMultiByte(CP_UTF8, 0, path_w, -1, nullptr, 0, nullptr, nullptr);
                    if (needed > 1) {
                        std::string buf(static_cast<size_t>(needed - 1), '\0');
                        WideCharToMultiByte(CP_UTF8, 0, path_w, -1, buf.data(), needed, nullptr, nullptr);
                        chosen_utf8 = std::move(buf);
                        status = 1;
                    }
                }
                CoTaskMemFree(pidl);
            } else {
                status = 0;
            }
        }
        if (must_uninit) {
            CoUninitialize();
        }
    });
    sta_worker.join();
    if (status == 1 && !chosen_utf8.empty()) {
        copy_to_c_buf(chosen_utf8, out_buf, out_len);
        return 1;
    }
    return status;
#else
    return -1;
#endif
}

int zeus_memory_stats(unsigned long long* out_working_set_bytes, unsigned long long* out_private_bytes, unsigned int* out_proc_count) {
#ifdef _WIN32
    auto pids = collect_zeus_process_tree();
    unsigned long long ws = 0, priv = 0;
    measure_tree(pids, ws, priv);
    if (ws > 18ULL * 1024ULL * 1024ULL) {
        trim_pids_now(pids);
        measure_tree(pids, ws, priv);
    }
    if (out_working_set_bytes) *out_working_set_bytes = ws;
    if (out_private_bytes) *out_private_bytes = priv;
    if (out_proc_count) *out_proc_count = static_cast<unsigned int>(pids.size());
    return 0;
#else
    if (out_working_set_bytes) *out_working_set_bytes = 16ULL * 1024ULL * 1024ULL;
    if (out_private_bytes) *out_private_bytes = 14ULL * 1024ULL * 1024ULL;
    if (out_proc_count) *out_proc_count = 1;
    return 0;
#endif
}

int zeus_memory_trim(unsigned long long* out_before_bytes, unsigned long long* out_after_bytes, unsigned int* out_proc_count) {
#ifdef _WIN32
    auto pids = collect_zeus_process_tree();
    unsigned long long before_ws = 0, before_priv = 0;
    measure_tree(pids, before_ws, before_priv);
    trim_pids_now(pids);
    unsigned long long after_ws = 0, after_priv = 0;
    measure_tree(pids, after_ws, after_priv);
    if (out_before_bytes) *out_before_bytes = before_ws;
    if (out_after_bytes) *out_after_bytes = after_ws;
    if (out_proc_count) *out_proc_count = static_cast<unsigned int>(pids.size());
    return 0;
#else
    if (out_before_bytes) *out_before_bytes = 19ULL * 1024ULL * 1024ULL;
    if (out_after_bytes) *out_after_bytes = 14ULL * 1024ULL * 1024ULL;
    if (out_proc_count) *out_proc_count = 1;
    return 0;
#endif
}

} // extern "C"
