#pragma once
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <functional>
#include <cstdint>

namespace zeus {

struct MemoryItem {
    std::string id;
    std::string text;
    std::string category = "general";
    uint64_t created_at = 0;
};

struct McpServerDescriptor {
    std::string id;
    std::string name;
    std::string transport = "stdio"; // "stdio" | "http" | "builtin"
    std::string command;
    std::vector<std::string> args;
    std::string status = "connected";
};

struct McpToolSchema {
    std::string server_id;
    std::string server_name;
    std::string name;
    std::string description;
    std::string input_schema_json;
};

struct AgentToolCallEvent {
    std::string id;
    std::string name;
    std::string path_arg;
    std::string body;
    bool ok = true;
    std::string output;
};

class PersistentMemoryStore {
public:
    explicit PersistentMemoryStore(const std::string& storage_dir = "");
    std::vector<MemoryItem> list() const;
    std::vector<MemoryItem> add(const std::string& text, const std::string& category = "general");
    std::vector<MemoryItem> remove(const std::string& id);
    std::string build_system_context() const;

private:
    std::string storage_path_;
    mutable std::mutex mutex_;
    std::vector<MemoryItem> items_;
    void load();
    void save() const;
};

class NativeMcpClient {
public:
    explicit NativeMcpClient(const std::string& storage_dir = "");
    std::vector<McpServerDescriptor> list_servers() const;
    std::vector<McpServerDescriptor> add_server(
        const std::string& name,
        const std::string& command,
        const std::vector<std::string>& args = {},
        const std::string& transport = "stdio"
    );
    std::vector<McpServerDescriptor> remove_server(const std::string& id);
    std::vector<McpToolSchema> discover_tools() const;
    std::string invoke_tool(
        const std::string& server_id,
        const std::string& tool_name,
        const std::string& arguments_json,
        bool& out_ok
    ) const;

private:
    std::string storage_path_;
    mutable std::mutex mutex_;
    std::vector<McpServerDescriptor> servers_;
    void persist() const;
};

} // namespace zeus
