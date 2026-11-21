fn main() {
    for icon in ["icons/icon.ico", "icons/icon.png", "icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png"] {
        println!("cargo:rerun-if-changed={icon}");
    }
    println!("cargo:rerun-if-changed=../engine/zeus_engine.cpp");
    println!("cargo:rerun-if-changed=../include/zeus/c_api.h");
    println!("cargo:rerun-if-changed=../include/zeus/providers.hpp");
    println!("cargo:rerun-if-changed=../include/zeus/workspace.hpp");
    println!("cargo:rerun-if-changed=../include/zeus/mcp_agent.hpp");

    cc::Build::new()
        .cpp(true)
        .std("c++20")
        .include("../include")
        .file("../engine/zeus_engine.cpp")
        .warnings(false)
        .compile("zeus_engine");

    tauri_build::build()
}
