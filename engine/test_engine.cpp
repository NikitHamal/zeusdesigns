#include "../include/zeus/c_api.h"
#include "../include/zeus/providers.hpp"
#include "../include/zeus/workspace.hpp"
#include "../include/zeus/mcp_agent.hpp"

#include <cassert>
#include <cstring>
#include <iostream>
#include <string>

int main() {
    const char* ver = zeus_engine_version();
    assert(ver != nullptr && std::strlen(ver) > 0);

    char key_buf[256]{};
    zeus_generate_deepai_tryit_key("Mozilla/5.0", key_buf, sizeof(key_buf));
    std::string key(key_buf);
    assert(key.rfind("tryit-", 0) == 0);
    assert(key.size() > 70);

    char jimmy_buf[256]{};
    zeus_clean_chatjimmy_output(
        "<|think|>plan<|/think|>Material 3 Expressive Audio App<|stats|>{\"tps\":20500}<|/stats|>",
        jimmy_buf,
        sizeof(jimmy_buf)
    );
    assert(std::string(jimmy_buf) == "Material 3 Expressive Audio App");

    char k2_buf[256]{};
    zeus_split_k2_details(
        "<details type=\"reasoning\">\n> analyzing layout\n</details>\n<artboard name=\"Home\">HTML</artboard>",
        k2_buf,
        sizeof(k2_buf)
    );
    assert(std::string(k2_buf) == "<artboard name=\"Home\">HTML</artboard>");

    char title_buf[128]{};
    int rc = zeus_title_generate("Design a Material 3 Expressive fitness dashboard with spring motion", title_buf, sizeof(title_buf));
    assert(rc == 0);
    assert(std::string(title_buf) == "Design a Material 3 Expressive");

    char cat_buf[32768]{};
    int count = zeus_providers_catalog_json(cat_buf, sizeof(cat_buf));
    assert(count == 34);
    std::string cat(cat_buf);
    assert(cat.find("mercury3") != std::string::npos);
    assert(cat.find("longcat") != std::string::npos);
    assert(cat.find("geminiweb") != std::string::npos);
    assert(cat.find("kilo") != std::string::npos);
    assert(cat.find("nimcloud") != std::string::npos);
    assert(cat.find("colibriqwen") != std::string::npos);
    assert(cat.find("gemma4vl") != std::string::npos);
    assert(cat.find("phi4cloud") != std::string::npos);
    assert(cat.find("llamacppcloud") != std::string::npos);
    assert(cat.find("ollamacloud") != std::string::npos);
    assert(cat.find("gemma4pro") != std::string::npos);
    assert(cat.find("frontierlab") != std::string::npos);
    assert(cat.find("liquidai") != std::string::npos);
    assert(cat.find("bonsaicloud") != std::string::npos);
    assert(cat.find("unslothcloud") != std::string::npos);
    assert(cat.find("koboldcloud") != std::string::npos);
    assert(cat.find("blockrun") != std::string::npos);
    assert(cat.find("ovhcloud") != std::string::npos);
    assert(cat.find("freecc") != std::string::npos);
    assert(cat.find("vlmrun") != std::string::npos);
    assert(cat.find("together2api") != std::string::npos);
    assert(cat.find("hfcluster") != std::string::npos);
    assert(cat.find("aihorde") != std::string::npos);
    assert(cat.find("apisfreellm") != std::string::npos);
    assert(cat.find("ptero") != std::string::npos);
    assert(cat.find("unikey") != std::string::npos);
    assert(cat.find("llm7") != std::string::npos);
    assert(cat.find("pollinations") != std::string::npos);
    assert(cat.find("yqcloud") != std::string::npos);
    assert(cat.find("chatjimmy") != std::string::npos);

    zeus::PersistentMemoryStore mem;
    auto items = mem.add("Use 28px extra-large corners on hero cards", "design_system");
    assert(items.size() >= 2);

    zeus::NativeMcpClient mcp;
    assert(mcp.list_servers().size() >= 2);
    assert(mcp.discover_tools().size() >= 2);

    std::cout << "All C++20 zeus_engine tests passed (" << count << " keyless providers verified).\n";
    return 0;
}
