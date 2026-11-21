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
            {{"mercury-3", "Mercury 3", "1,000-2,000+ tok/s diffusion LLM", true, true, false, 1600}},
            128000,
            16384,
            false,
            "1,000-2,000+ tok/s"
        },
        {
            "geminiweb",
            "Gemini Web",
            ProviderFormat::SCRAPER_GEMINIWEB,
            "https://gemini.google.com",
            "gemini-flash-lite",
            {{"gemini-flash-lite", "Gemini Flash-Lite", "Anonymous StreamGenerate", false, true, true, 150}},
            128000,
            8192,
            false,
            "~150 tok/s"
        },
        {
            "qwen",
            "Qwen (Android App Gateway)",
            ProviderFormat::SCRAPER_QWEN,
            "https://chat.qwen.ai/api/v2",
            "qwen4-max",
            {
                {"qwen4-max", "Qwen 4 Max", "Alibaba flagship coder & UI architect", true, true, true, 95},
                {"qwen3.8-max", "Qwen 3.8 Max", "Reasoning & frontend specialist", true, true, false, 90}
            },
            128000,
            8192,
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
            "longcat",
            "LongCat",
            ProviderFormat::SCRAPER_LONGCAT,
            "https://longcat.chat",
            "longcat-2.5",
            {{"longcat-2.5", "LongCat 2.5", "1.6T MoE oversea-V2", true, true, false, 100}},
            128000,
            8192,
            false,
            "~100 tok/s"
        },
        {
            "deepai",
            "DeepAI",
            ProviderFormat::SCRAPER_DEEPAI,
            "https://api.deepai.org",
            "standard",
            {
                {"standard", "DeepAI Standard", "SHA-256 tryit key rotation", false, false, true, 65},
                {"qwen3.8-flash", "Qwen 3.8 Flash", "Fast coding fallback", false, false, true, 85}
            },
            64000,
            8192,
            false,
            "~60 tok/s"
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

} // namespace zeus

extern "C" {

const char* zeus_engine_version(void) {
    return zeus::VERSION;
}

void zeus_generate_deepai_tryit_key(const char* user_agent, char* out_buf, size_t out_len) {
    if (!out_buf || out_len == 0) return;
    std::string key = zeus::KeylessProviderEngine::generate_deepai_tryit_key(user_agent ? user_agent : "Mozilla/5.0");
    std::strncpy(out_buf, key.c_str(), out_len - 1);
    out_buf[out_len - 1] = '\0';
}

void zeus_clean_chatjimmy_output(const char* raw_text, char* out_buf, size_t out_len) {
    if (!out_buf || out_len == 0) return;
    std::string cleaned = zeus::KeylessProviderEngine::strip_chatjimmy_tags(raw_text ? raw_text : "");
    std::strncpy(out_buf, cleaned.c_str(), out_len - 1);
    out_buf[out_len - 1] = '\0';
}

void zeus_split_k2_details(const char* raw_content, char* out_answer, size_t out_len) {
    if (!out_answer || out_len == 0) return;
    std::string reasoning, answer;
    zeus::KeylessProviderEngine::parse_k2horizon_details(raw_content ? raw_content : "", reasoning, answer);
    std::strncpy(out_answer, answer.c_str(), out_len - 1);
    out_answer[out_len - 1] = '\0';
}

} // extern "C"
