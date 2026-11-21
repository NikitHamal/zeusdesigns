#pragma once
#include <string>
#include <vector>
#include <map>
#include <functional>
#include <mutex>

namespace zeus {

struct IndexedFile {
    std::string relative_path;
    std::string extension;
    uint64_t size_bytes = 0;
    int64_t last_modified = 0;
    std::string language;
    bool is_ui_component = false;
};

struct MemoryEntry {
    std::string id;
    std::string category; // "design_system", "architecture", "user_pref", "component_map"
    std::string key;
    std::string value;
    int64_t updated_at = 0;
};

struct ToolCallRequest {
    std::string id;
    std::string name; // "read_file", "write_file", "edit_file", "list_dir", "search_code", "run_shell", "sync_canvas_artboard"
    std::map<std::string, std::string> arguments;
};

struct ToolCallResult {
    std::string id;
    bool success = false;
    std::string output;
};

struct McpServerConfig {
    std::string id;
    std::string name;
    std::string transport; // "stdio" or "sse"
    std::string command_or_url;
    std::vector<std::string> args;
    bool connected = false;
};

class WorkspaceEngine {
public:
    WorkspaceEngine();
    ~WorkspaceEngine() = default;

    // Local project folder indexer & live file synchronization
    bool open_workspace(const std::string& folder_path);
    const std::string& root_path() const { return root_path_; }
    const std::vector<IndexedFile>& indexed_files() const { return files_; }
    void reindex();

    // Agentic file & shell tools
    ToolCallResult execute_tool(const ToolCallRequest& req);
    std::string read_project_file(const std::string& rel_path) const;
    bool write_project_file(const std::string& rel_path, const std::string& content);
    bool sync_artboard_to_codebase(const std::string& artboard_id, const std::string& target_rel_path, const std::string& generated_code);

    // Persistent Memory System
    void remember(const std::string& category, const std::string& key, const std::string& value);
    std::vector<MemoryEntry> recall(const std::string& query = "") const;
    bool save_memory_to_disk() const;
    bool load_memory_from_disk();

    // Native MCP Client Integration (JSON-RPC 2.0)
    bool register_mcp_server(const McpServerConfig& config);
    std::vector<McpServerConfig> list_mcp_servers() const;
    std::string invoke_mcp_tool(const std::string& server_id, const std::string& tool_name, const std::string& json_args);

private:
    std::string root_path_;
    std::vector<IndexedFile> files_;
    std::vector<MemoryEntry> memories_;
    std::vector<McpServerConfig> mcp_servers_;
    mutable std::mutex mutex_;
};

} // namespace zeus
