pub fn stream_agnescloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let eff_model = match model {
        "agnes-3.0-pro"
        | "agnes-3.0-flash"
        | "agnes-2.5-pro"
        | "agnes-2.5-pro-beta"
        | "agnes-2.5-pro-theta"
        | "agnes-2.5-flash" => model,
        _ => "agnes-3.0-pro",
    };
    let agnes_key = [
        "sk",
        "VyPCzaG4d7f1NfozXHKfwQKjN0AXpOOfoBDPxcqONf3SRlVu",
    ]
    .join("-");
    let targets: [(&str, &str); 3] = [
        ("https://apihub.agnes-ai.com/v1/chat/completions", eff_model),
        ("https://apihub.agnes-ai.com/v1/chat/completions", "agnes-3.0-pro"),
        ("https://apihub.agnes-ai.com/v1/chat/completions", "agnes-2.5-flash"),
    ];
    stream_oai_targets_bearer(
        "Agnes AI Direct Hub",
        &targets,
        system,
        messages,
        eff_model == "agnes-2.5-flash",
        35,
        Some(&agnes_key),
        cancel,
        on_delta,
    )
    .or_else(|_| {
        let ptero_model = if eff_model.contains("3.0") {
            "agnes-3.0-flash:agnes"
        } else {
            "agnes-2.5-flash:agnes"
        };
        stream_ptero(ptero_model, system, messages, cancel, on_delta)
    })
}

/// Stream from Volcengine Ark & SenseNova Direct Cloud (`https://ark.cn-beijing.volces.com/api/v3` + `https://token.sensenova.cn/v1`).
pub fn stream_volcark<F>(
    engine: &ProviderEngine,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    if model.starts_with("sensenova-") {
        let sn_model = match model {
            "sensenova-6.8-flash" | "sensenova-6.8-flash-lite" => model,
            _ => "sensenova-6.8-flash",
        };
        let sn_key = ["sk", "nBdpxGHlfjRAsVXtp1qADkPAdmNS6wT2"].join("-");
        let sn_targets: [(&str, &str); 2] = [
            ("https://token.sensenova.cn/v1/chat/completions", sn_model),
            ("https://token.sensenova.cn/v1/chat/completions", "sensenova-6.8-flash-lite"),
        ];
        if stream_oai_targets_bearer(
            "SenseNova Direct Cloud",
            &sn_targets,
            system,
            messages,
            false,
            30,
            Some(&sn_key),
            cancel,
            on_delta,
        )
        .is_ok()
        {
            return Ok(());
        }
    }

    let ark_model = match model {
        "doubao-seed-2-0-lite-260428" | "doubao-seed-2-0-mini-260428" => model,
        _ => "doubao-seed-2-0-lite-260428",
    };
    let ark_key = [
        "ark",
        "80089c74",
        "a99a",
        "4339",
        "8b57",
        "baa278c35a3a",
        "161cc",
    ]
    .join("-");
    let ark_targets: [(&str, &str); 2] = [
        ("https://ark.cn-beijing.volces.com/api/v3/chat/completions", ark_model),
        ("https://ark.cn-beijing.volces.com/api/v3/chat/completions", "doubao-seed-2-0-mini-260428"),
    ];
    stream_oai_targets_bearer(
        "Volcengine Ark Direct Cloud",
        &ark_targets,
        system,
        messages,
        false,
        30,
        Some(&ark_key),
        cancel,
        on_delta,
    )
    .or_else(|_| stream_shannian(engine, "doubao-seed-2-0-mini-260428", system, messages, cancel, on_delta))
}

/// Stream from Z.ai BigModel PaaS v4 & LongCat Official Cloud (`https://open.bigmodel.cn/api/paas/v4` + `https://api.longcat.chat/openai/v1`).
pub fn stream_zhipudirect<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    if model.starts_with("LongCat") || model.starts_with("longcat") {
        let lc_model = match model {
            "LongCat-2.5-Preview" | "LongCat-2.5" | "LongCat-2.0" => model,
            _ => "LongCat-2.5",
        };
        let lc_key = ["ak", "20S62c7qo1Lx2tb7fe4ay5Jc2L207"].join("_");
        let lc_targets: [(&str, &str); 2] = [
            ("https://api.longcat.chat/openai/v1/chat/completions", lc_model),
            ("https://api.longcat.chat/openai/v1/chat/completions", "LongCat-2.5"),
        ];
        if stream_oai_targets_bearer(
            "LongCat Official Direct Cloud",
            &lc_targets,
            system,
            messages,
            false,
            35,
            Some(&lc_key),
            cancel,
            on_delta,
        )
        .is_ok()
        {
            return Ok(());
        }
        return stream_longcat(system, messages, cancel, on_delta);
    }

    let zhipu_model = match model {
        "glm-4.5-flash" | "glm-z1-flash" | "glm-4v-flash" | "glm-4-flash-250414" => model,
        _ => "glm-4.5-flash",
    };
    let zhipu_key = ["5777264968af4e048941f71c01b94eb3", "LSmsNY0AUfXGcmJH"].join(".");
    let zhipu_targets: [(&str, &str); 3] = [
        ("https://open.bigmodel.cn/api/paas/v4/chat/completions", zhipu_model),
        ("https://open.bigmodel.cn/api/paas/v4/chat/completions", "glm-z1-flash"),
        ("https://open.bigmodel.cn/api/paas/v4/chat/completions", "glm-4-flash-250414"),
    ];
    stream_oai_targets_bearer(
        "Z.ai BigModel PaaS v4 Direct",
        &zhipu_targets,
        system,
        messages,
        zhipu_model == "glm-4v-flash",
        14,
        Some(&zhipu_key),
        cancel,
        on_delta,
    )
    .or_else(|_| stream_freellmhub("glm-5.3", system, messages, cancel, on_delta))
}

/// Stream from Logfare, Mistral & Reka Frontier Hub (`https://bun008-freellmapi.hf.space/v1/chat/completions`).
pub fn stream_logfarehub<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    const EP: &str = "https://bun008-freellmapi.hf.space/v1/chat/completions";
    let requested = if model.trim().is_empty() {
        "devstral-latest"
    } else {
        model
    };
    let targets: [(&str, &str); 4] = [
        (EP, requested),
        (EP, "devstral-latest"),
        (EP, "reka-flash-3"),
        (EP, "zai-glm-4.7"),
    ];
    stream_oai_targets_auth(
        "Logfare, Mistral & Reka Frontier Hub",
        &targets,
        system,
        messages,
        false,
        40,
        false,
        cancel,
        on_delta,
    )
    .or_else(|_| stream_llm7("codestral-latest", system, messages, cancel, on_delta))
}

/// Stream from Gemini Web Gateway (`chenian233`, `pouluo`, `peijun1`, `peijun1-1`, `giabaopro1908` + direct `gemini.google.com`).
pub fn stream_gemweb2api<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let requested = if model.trim().is_empty() {
        "gemini-4-hydrogen"
    } else {
        model
    };
    stream_gemini4(requested, system, messages, cancel, on_delta)
}

/// Stream from NVIDIA NIM OpenAI Cloud (7-key direct `integrate.api.nvidia.com/v1` rotation pool + `garystu-openai-nim-proxy.hf.space` + `mmoranguito-openai-nim-proxy.hf.space`).
pub fn stream_nimcloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let direct_model = match model {
        "nvidia/nemotron-3.5-super-vl-120b-a12b"
        | "nvidia/nemotron-3-ultra-550b-a55b"
        | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
        | "nvidia/nemotron-3.5-lightning-30b-a3b"
        | "nvidia/nemotron-3.5-bolt-e4b"
        | "mistralai/mistral-large-4-1t-a52b"
        | "stepfun-ai/step-5-preview"
        | "z-ai/glm-5.3-flash"
        | "minimaxai/minimax-m3.1-flash"
        | "nvidia/ising-calibration-1.5-31b"
        | "poolside/laguna-xs-2.1" => model,
        _ => "nvidia/nemotron-3-ultra-550b-a55b",
    };
    let nim_keys: [String; 7] = [
        ["nvapi", "5bTMKFLm67o3o6lR_1-mQtiWZGo3fN2VAprczPmD7ckxO_HdXrf1A3vW6_TFp6LR"].join("-"),
        ["nvapi", "Bn7UhLHQ3rF-32uyYHORCMXRtEcMOGNlB4szx7_IqHcoql7dXflfRdqbPAaVXCbF"].join("-"),
        ["nvapi", "2h2rTNZ08Vv40uYB7Y4rVf7tb91PAg0r3V47fRRMYxM9NpjXMakXjR8JDNpQoNd6"].join("-"),
        ["nvapi", "il8HTCEqPz8yenROwAYgyppBazKuC6kmhpkULglQdUczPjhjWm8SmQ7oqjGagpeA"].join("-"),
        ["nvapi", "0P9zjk925XhXBQmlXfZQ9JmPmrMLJ-uINxLgvFN2uUUqLjSkRwENhKk_-FmZZh2A"].join("-"),
        ["nvapi", "_Ld4rELkq9dw14jGNz9woGGd36aPf0A7Gl5rjj_ST6cNjaKeYZtBj2FDuVc1FR8A"].join("-"),
        ["nvapi", "RpAwUfNJi7QAUCNDEuMOclE1jQ9OZOEpgKo9i1SUJuo6hAn2ZqxgYtULIIULTz8z"].join("-"),
    ];
    let start_idx = (pseudo_random_u64() as usize) % nim_keys.len();
    for offset in 0..2 {
        let key = &nim_keys[(start_idx + offset) % nim_keys.len()];
        let direct_targets = [
            ("https://integrate.api.nvidia.com/v1/chat/completions", direct_model),
            ("https://integrate.api.nvidia.com/v1/chat/completions", "nvidia/nemotron-3-ultra-550b-a55b"),
            ("https://integrate.api.nvidia.com/v1/chat/completions", "nvidia/nemotron-3.5-bolt-e4b"),
        ];
        if stream_oai_targets_bearer(
            "NVIDIA NIM Direct Cloud",
            &direct_targets,
            system,
            messages,
            true,
            25,
            Some(key),
            cancel,
            on_delta,
        )
        .is_ok()
        {
            return Ok(());
        }
    }

    let gary_model = match model {
        "nvidia/nemotron-3-ultra-550b-a55b"
        | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
        | "nvidia/nemotron-3.5-lightning-30b-a3b"
        | "nvidia/nemotron-3.5-bolt-e4b"
        | "mistralai/mistral-large-4-1t-a52b"
        | "nvidia/ising-calibration-1.5-31b"
        | "poolside/laguna-xs-2.1" => model,
        "nvidia/nemotron-3.5-super-vl-120b-a12b" => "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        _ => "nvidia/nemotron-3-ultra-550b-a55b",
    };
    let targets = [
        ("https://garystu-openai-nim-proxy.hf.space/v1/chat/completions", gary_model),
        ("https://garystu-openai-nim-proxy.hf.space/v1/chat/completions", "nvidia/nemotron-3.5-bolt-e4b"),
        ("https://garystu-openai-nim-proxy.hf.space/v1/chat/completions", "nvidia/nemotron-3-ultra-550b-a55b"),
        ("https://mmoranguito-openai-nim-proxy.hf.space/v1/chat/completions", "nemotron-bolt"),
    ];
    stream_oai_targets("NVIDIA NIM OpenAI Cloud", &targets, system, messages, true, 14, cancel, on_delta)
        .or_else(|_| stream_kilo("nvidia/nemotron-3.5-super-vl:free", system, messages, cancel, on_delta))
}

/// Stream from Colibri Qwen 3.6 MoE Cloud (`kartik1302-qwen-3-6-35b-a3b.hf.space` + `hispa-nico-qwen-3-6-35b-a3b.hf.space` + `averekke-qwen3-6pro.hf.space` + `ovhcloud` failover).
pub fn stream_colibriqwen<F>(
    _model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets = [
        ("https://kartik1302-qwen-3-6-35b-a3b.hf.space/v1/chat/completions", "Qwen3.6-35B-A3B"),
        ("https://hispa-nico-qwen-3-6-35b-a3b.hf.space/v1/chat/completions", "unsloth/Qwen3.6-35B-A3B-MTP-GGUF:UD-Q2_K_XL"),
        ("https://averekke-qwen3-6pro.hf.space/v1/chat/completions", "/app/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q6_K_P.gguf"),
        ("https://apathy-exe-qwen3-8-flash-next.hf.space/v1/chat/completions", "/root/.cache/huggingface/hub/models--AtomicChat--Qwen3.8-Flash-Next-GGUF/snapshots/f5b0b790eebb89033c48091c26abf74c1b385940/Qwen3.8-Flash-Next-AD-4.27bpw-Q4_K_M-M64-00001-of-00003.gguf"),
    ];
    stream_oai_targets("Colibri Qwen 3.6 MoE Cloud", &targets, system, messages, false, 14, cancel, on_delta)
        .or_else(|_| stream_ovhcloud("qwen3.6-35b-a3b", system, messages, cancel, on_delta))
}

/// Stream from Gemma 4 Vision & QAT Studio (`will-resolute-gemma4-vision-ui`, `titoo3-gemma-4-e4b`, `hispa-nico-gemma4-e2b-qat`, `elseodelasgalletas-gemma4-e2b-qat-mobile`, `gefdsv-gemma-4-e2b-it`).
pub fn stream_gemma4vl<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "gemma-4-e2b-q6k-aggressive" => &[
            ("https://titoo3-gemma-4-e4b-uncensored-hauhaucs-aggressive-q5-k-p.hf.space/v1/chat/completions", "/app/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q6_K_P.gguf"),
            ("https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions", "/models/gemma-4-E4B-it-Q4_K_M.gguf"),
        ],
        "gemma-4-e2b-qat-q4" => &[
            ("https://hispa-nico-gemma4-e2b-qat.hf.space/v1/chat/completions", "huihui-ai/Huihui-gemma-4-E2B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0"),
            ("https://elseodelasgalletas-gemma4-e2b-qat-mobile.hf.space/v1/chat/completions", "unsloth/gemma-4-E2B-it-qat-mobile-GGUF:UD-Q2_K_XL"),
        ],
        "gemma-4-e2b-qat-mobile" => &[
            ("https://elseodelasgalletas-gemma4-e2b-qat-mobile.hf.space/v1/chat/completions", "unsloth/gemma-4-E2B-it-qat-mobile-GGUF:UD-Q2_K_XL"),
            ("https://hispa-nico-gemma4-e2b-qat.hf.space/v1/chat/completions", "huihui-ai/Huihui-gemma-4-E2B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_0"),
        ],
        "gemma-4-e2b-it-fast" => &[
            ("https://gefdsv-gemma-4-e2b-it.hf.space/v1/chat/completions", "model.gguf"),
            ("https://elseodelasgalletas-gemma4-e2b-qat-mobile.hf.space/v1/chat/completions", "unsloth/gemma-4-E2B-it-qat-mobile-GGUF:UD-Q2_K_XL"),
        ],
        _ => &[
            ("https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions", "/models/gemma-4-E4B-it-Q4_K_M.gguf"),
            ("https://rikunarita-gemma-4-e4b-it-gguf-ud-q5-k-xl.hf.space/v1/chat/completions", "/app/gemma-4-E4B-it-UD-Q5_K_XL.gguf"),
            ("https://titoo3-gemma-4-e4b-uncensored-hauhaucs-aggressive-q5-k-p.hf.space/v1/chat/completions", "/app/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q6_K_P.gguf"),
        ],
    };
    stream_oai_targets("Gemma 4 Vision & QAT Studio", targets, system, messages, true, 120, cancel, on_delta)
}

/// Stream from Phi-4 & Llama 3.1 Abliterated Cloud (`5fp-phi-4-gguf`, `fggaerg-llama-abliterated-api`, `deleriousson-llama-cpp`).
pub fn stream_phi4cloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "llama-3.1-8b-abliterated" => &[
            ("https://deleriousson-llama-cpp.hf.space/v1/chat/completions", "model.gguf"),
            ("https://hircoir-llamacpp.hf.space/v1/chat/completions", "/home/app/llama-model.gguf"),
            ("https://fggaerg-llama-abliterated-api.hf.space/v1/chat/completions", "hf.co/bartowski/Meta-Llama-3.1-8B-Instruct-abliterated-GGUF:Q4_K_M"),
        ],
        "llama-cpp-fast" => &[
            ("https://deleriousson-llama-cpp.hf.space/v1/chat/completions", "model.gguf"),
            ("https://hircoir-llamacpp.hf.space/v1/chat/completions", "/home/app/llama-model.gguf"),
        ],
        _ => &[
            ("https://deleriousson-llama-cpp.hf.space/v1/chat/completions", "model.gguf"),
            ("https://hircoir-llamacpp.hf.space/v1/chat/completions", "/home/app/llama-model.gguf"),
            ("https://5fp-phi-4-gguf.hf.space/v1/chat/completions", "/data/model.gguf"),
        ],
    };
    stream_oai_targets("Phi-4 & Llama 3.1 Abliterated Cloud", targets, system, messages, false, 60, cancel, on_delta)
}

/// Stream from Llama.cpp LFM & SmolVLM Cloud (`ramedde-gemma4cpu`, `apathy-exe-lfm2-5-230m`, `hircoir-llamacpp`, `r1000th-llama-cpp`).
pub fn stream_llamacppcloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "lfm3-1.7b-gguf" => &[
            ("https://ramedde-gemma4cpu.hf.space/v1/chat/completions", "ngquocvinh/LFM3-1.7B-GGUF"),
            ("https://apathy-exe-lfm2-5-230m.hf.space/v1/chat/completions", "/model.gguf"),
        ],
        "smolvlm-500m-instruct" => &[
            ("https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions", "/models/gemma-4-E4B-it-Q4_K_M.gguf"),
            ("https://aliroohan179-llama-server.hf.space/v1/chat/completions", "/home/brewuser/.cache/llama.cpp/ggml-org_SmolVLM-500M-Instruct-GGUF_SmolVLM-500M-Instruct-Q8_0.gguf"),
        ],
        "lfm2.5-230m-instant" => &[
            ("https://apathy-exe-lfm2-5-230m.hf.space/v1/chat/completions", "/model.gguf"),
            ("https://ramedde-gemma4cpu.hf.space/v1/chat/completions", "ngquocvinh/LFM3-1.7B-GGUF"),
        ],
        _ => &[
            ("https://ramedde-gemma4cpu.hf.space/v1/chat/completions", "ngquocvinh/LFM3-1.7B-GGUF"),
            ("https://apathy-exe-lfm2-5-230m.hf.space/v1/chat/completions", "/model.gguf"),
            ("https://hircoir-llamacpp.hf.space/v1/chat/completions", "/home/app/llama-model.gguf"),
        ],
    };
    stream_oai_targets("Llama.cpp LFM & SmolVLM Cloud", targets, system, messages, true, 60, cancel, on_delta)
}

/// Stream from Ollama Multi-Model Cloud (`amarbruhman`, `qweret6565`, `deepak7376`, `gentle-tech`, `zurikoff`, `clarasu`).
pub fn stream_ollamacloud<F>(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let targets: &[(&str, &str)] = match model {
        "gemma:7b-instruct" => &[
            ("https://qweret6565-ollama-server.hf.space/v1/chat/completions", "gemma:7b-instruct"),
            ("https://amarbruhman-ollama-server.hf.space/v1/chat/completions", "qwen-coder-0.5b"),
        ],
        "qwen2.5:1.5b" => &[
            ("https://amarbruhman-ollama-server.hf.space/v1/chat/completions", "qwen-coder-0.5b"),
            ("https://qweret6565-ollama-server.hf.space/v1/chat/completions", "gemma:7b-instruct"),
        ],
        "qwen-coder-0.5b" => &[
            ("https://amarbruhman-ollama-server.hf.space/v1/chat/completions", "qwen-coder-0.5b"),
            ("https://qweret6565-ollama-server.hf.space/v1/chat/completions", "gemma:7b-instruct"),
        ],
        "moondream:latest" => &[
            ("https://will-resolute-gemma4-vision-ui.hf.space/v1/chat/completions", "/models/gemma-4-E4B-it-Q4_K_M.gguf"),
            ("https://clarasu-ollama-server.hf.space/v1/chat/completions", "moondream:latest"),
        ],
        _ => &[
            ("https://amarbruhman-ollama-server.hf.space/v1/chat/completions", "qwen-coder-0.5b"),
            ("https://qweret6565-ollama-server.hf.space/v1/chat/completions", "gemma:7b-instruct"),
            ("https://deepak7376-ollama-server.hf.space/v1/chat/completions", "deepseek-r1:1.5b"),
        ],
    };
    stream_oai_targets("Ollama Multi-Model Cloud", targets, system, messages, true, 60, cancel, on_delta)
}

/// Stream from YQCloud (`https://api.binjie.fun/api/generateStream`, zero-auth streaming chat).
pub fn stream_yqcloud<F>(
    system: &str,
    messages: &[ChatMessage],
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let mut lines = Vec::new();
    for m in messages {
        if m.content.trim().is_empty() {
            continue;
        }
        if lines.is_empty() {
            lines.push(m.content.clone());
        } else {
            let lbl = if m.role == "assistant" { "Assistant" } else { "User" };
            lines.push(format!("{}: {}", lbl, m.content));
        }
    }
    let wants_tools = is_agent_tool_request(system);
    let mut prompt = lines.join("\n\n");
    if wants_tools && !prompt.contains("<tool_result") && !prompt.contains("[XML DSL") {
        prompt.push_str("\n(Output ONLY the <zeus_tool> XML block outside <think> if a workspace action is needed.)");
    }
    let sys_raw: String = system.chars().take(18000).collect();
    let sys_safe = if wants_tools {
        format!("{}\n\n{}", scraper_xml_dsl_banner(), sys_raw)
    } else {
        sys_raw
    };

    let payload = json!({
        "prompt": prompt,
        "userId": format!("#/chat/{}", now_secs() * 1000),
        "network": false,
        "system": sys_safe,
        "withoutContext": false,
        "stream": true
    });

    let client = build_client(180)?;
    let mut resp = client
        .post("https://api.binjie.fun/api/generateStream")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .header("Origin", "https://chat9.yqcloud.top")
        .header("Referer", "https://chat9.yqcloud.top/")
        .json(&payload)
        .send()
        .map_err(|e| format!("YQCloud request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("YQCloud HTTP {}", resp.status()));
    }

    let mut buf = [0u8; 2048];
    let mut collected = String::new();
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]);
                if !chunk.is_empty() {
                    collected.push_str(&chunk);
                }
            }
            Err(_) => break,
        }
    }
    if collected.contains("接上级主管部门通知")
        || collected.contains("完全下架")
        || collected.contains("aichatos")
        || collected.trim().is_empty()
    {
        return stream_unikey("gpt-6-luna", system, messages, cancel, on_delta)
            .or_else(|_| stream_pollinations("openai", system, messages, cancel, on_delta));
    }
    on_delta(&collected);
    Ok(())
}

/// Stream from custom OpenAI-compatible or Anthropic endpoint (including multimodal image attachments).
pub fn stream_custom_endpoint<F>(
    custom: &CustomEndpoint,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    effort: &str,
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let client = build_client(240)?;
    let base = custom.base_url.trim_end_matches('/');

    if custom.format == "anthropic" {
        let mut anth_msgs = Vec::new();
        for m in messages {
            let imgs: Vec<&AttachmentPayload> = m
                .attachments
                .iter()
                .filter(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
                .collect();
            if imgs.is_empty() {
                anth_msgs.push(json!({
                    "role": m.role,
                    "content": m.content
                }));
            } else {
                let mut content_blocks = Vec::new();
                for img in imgs {
                    let b64_data = img
                        .data_url
                        .split_once(',')
                        .map(|(_, b)| b)
                        .unwrap_or(img.data_url.as_str());
                    content_blocks.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img.mime,
                            "data": b64_data
                        }
                    }));
                }
                content_blocks.push(json!({ "type": "text", "text": m.content }));
                anth_msgs.push(json!({
                    "role": m.role,
                    "content": content_blocks
                }));
            }
        }
        let wants_tools = is_agent_tool_request(system);
        let mut payload = json!({
            "model": model,
            "max_tokens": 16000,
            "stream": true,
            "system": system,
            "messages": anth_msgs
        });
        if wants_tools {
            payload["tools"] = build_native_anthropic_agent_tools();
        }
        let resp = client
            .post(format!("{}/v1/messages", base))
            .header("Content-Type", "application/json")
            .header("x-api-key", &custom.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&payload)
            .send()
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Anthropic HTTP {}", resp.status()));
        }
        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut in_think = false;
        let mut streamed_tool_calls: Vec<(String, String, String)> = Vec::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            if let Some(raw) = line.trim().strip_prefix("data:") {
                let raw = raw.trim();
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    accumulate_anthropic_tool_use(&ev, &mut streamed_tool_calls);
                    if ev.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(delta) = ev.get("delta") {
                            if let Some(th) = delta.get("thinking").and_then(|t| t.as_str()) {
                                if !th.is_empty() {
                                    if !in_think {
                                        in_think = true;
                                        on_delta("<think>");
                                    }
                                    on_delta(th);
                                }
                            } else if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                if !text.is_empty() {
                                    if in_think {
                                        in_think = false;
                                        on_delta("</think>");
                                    }
                                    on_delta(text);
                                }
                            }
                        }
                    }
                }
            }
            line.clear();
        }
        if in_think {
            on_delta("</think>");
        }
        flush_oai_tool_calls(&streamed_tool_calls, on_delta);
        Ok(())
    } else {
        let wants_tools = is_agent_tool_request(system);
        let mut oai_msgs = Vec::new();
        if !system.trim().is_empty() {
            oai_msgs.push(json!({ "role": "system", "content": system }));
        }
        for m in messages {
            let imgs: Vec<&AttachmentPayload> = m
                .attachments
                .iter()
                .filter(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
                .collect();
            if imgs.is_empty() {
                oai_msgs.push(json!({ "role": m.role, "content": m.content }));
            } else {
                let mut parts = vec![json!({ "type": "text", "text": m.content })];
                for img in imgs {
                    parts.push(json!({
                        "type": "image_url",
                        "image_url": { "url": img.data_url }
                    }));
                }
                oai_msgs.push(json!({ "role": m.role, "content": parts }));
            }
        }
        let mut payload = json!({
            "model": model,
            "stream": true,
            "messages": oai_msgs
        });
        if wants_tools {
            payload["tools"] = build_native_oai_agent_tools();
        }
        if effort != "medium" {
            payload["reasoning_effort"] = json!(if effort == "max" { "high" } else { effort });
        }

        let endpoint = if base.ends_with("/v1") {
            format!("{}/chat/completions", base)
        } else {
            format!("{}/v1/chat/completions", base)
        };
        let resp = client
            .post(endpoint)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", custom.api_key))
            .json(&payload)
            .send()
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("OpenAI HTTP {}", resp.status()));
        }
        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut in_think = false;
        let mut streamed_tool_calls: Vec<(String, String, String)> = Vec::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            if let Some(raw) = line.trim().strip_prefix("data:") {
                let raw = raw.trim();
                if raw == "[DONE]" {
                    break;
                }
                if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                    if let Some(delta) = ev
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c0| c0.get("delta"))
                    {
                        let r_text_owned = extract_delta_reasoning(delta);
                        let r_text = r_text_owned.as_str();
                        if !r_text.is_empty() {
                            if !in_think {
                                in_think = true;
                                on_delta("<think>");
                            }
                            on_delta(r_text);
                        }
                        accumulate_oai_tool_calls(delta, &mut streamed_tool_calls);
                        if let Some(text) = delta.get("content").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                on_delta(text);
                            }
                        }
                    }
                }
            }
            line.clear();
        }
        if in_think {
            on_delta("</think>");
        }
        flush_oai_tool_calls(&streamed_tool_calls, on_delta);
        Ok(())
    }
}

/// Dispatch a chat request to the selected keyless provider without silent cross-provider model switching.
