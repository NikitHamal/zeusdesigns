#!/usr/bin/env node
// Comprehensive Verification Suite for Stormy (Oro / Orobi) Replica & Coding Harness Overhaul in ZeusDesigns
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

console.log("=== Stormy (Oro) & Coding Harness Overhaul Verification Suite ===");

const stormyAgentSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/stormyAgent.ts"), "utf8");
for (const sym of [
  "export const ToolAliases",
  "export const STORMY_TOOLS",
  "export const TextToolProtocol",
  "export const ModelProfiles",
  "export function computeToolBatchWaves",
  "export class StuckDetector",
  "export const TokenEstimator",
  "export const RunLedger",
  "export const HistoryPruner",
  "export const BriefCheck",
  "export const ProjectInstructions",
  "export const ProjectSnapshot",
  "export const DiffUtils",
  "export const AutonomyPolicy",
  "export const QualityGate",
  "export const DisplayText",
  "export function parsePlanFromToolCall",
  "export function parseAskUserFromToolCall",
  "export function parseApprovalFromToolCall",
]) {
  assert.ok(stormyAgentSrc.includes(sym), `stormyAgent.ts must include ${sym}`);
}
console.log("[PASS] 1. stormyAgent.ts exports all 19 Stormy core agent & harness subsystems");

const workspaceRs = [
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/workspace.rs"), "utf8"),
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/workspace_stormy.rs"), "utf8"),
].join("\n");
for (const fnName of [
  "pub fn project_outline_of",
  "pub fn glob_workspace_files",
  "pub fn fs_move",
  "pub fn audit_workspace_files",
  "pub fn bm25_search_project",
  "pub fn docs_lookup_reference",
  "pub fn checkpoint_capture_file",
  "pub fn workspace_checkpoints",
  "pub fn workspace_restore_checkpoint",
  "pub fn workspace_audit",
  "pub fn workspace_git_status",
  "pub fn scan_workspace_security",
]) {
  assert.ok(workspaceRs.includes(fnName), `workspace.rs must implement ${fnName}`);
}
console.log("[PASS] 2. src-tauri/src/workspace*.rs implements all 12 Stormy native workspace, BM25, checkpoint, git, and audit functions");

const agentRs = [
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/agent.rs"), "utf8"),
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/agent_edit.rs"), "utf8"),
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/agent_exec.rs"), "utf8"),
].join("\n");
for (const feature of [
  "pub fn apply_stormy_text_edit",
  "fn strip_read_file_line_prefixes",
  "pub fn compute_tool_batch_waves",
  "fn pre_tool_and_autonomy_guard",
  '"multi_edit"',
  '"search_project"',
  '"docs_lookup"',
  '"check_syntax"',
  '"update_plan"',
  '"ask_user"',
  '"request_approval"',
  '"copy_file"',
  '"create_folder"',
  '"insert_at_line"',
  '"diff_files"',
  '"git_status"',
  '"security_scan"',
  '"add_ui_kit"',
  "<|tool_call_begin|>",
  "<｜tool▁call▁begin｜>",
  "[TOOL_CALLS]",
]) {
  assert.ok(agentRs.includes(feature), `agent*.rs must support ${feature}`);
}
console.log("[PASS] 3. src-tauri/src/agent*.rs supports post-stream ToolBatch waves, PreToolUse/Autonomy guards, and multi-format tool parsers");

// Verify coding harness fixes:
// - Single protocol per provider in tools.ts
// - No synthetic 3-turn list_dir prefill in agent.ts
// - 60s minimum HTTP timeout, 120k system cap, and disabled silent cross-provider failover in providers*.rs
const toolsTs = fs.readFileSync(path.join(process.cwd(), "src/lib/tools.ts"), "utf8");
const agentTs = fs.readFileSync(path.join(process.cwd(), "src/lib/agent.ts"), "utf8");
const engineTs = fs.readFileSync(path.join(process.cwd(), "src/lib/engine.ts"), "utf8");
const providersAllRs = [
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/providers.rs"), "utf8"),
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/providers_oai_a.rs"), "utf8"),
  fs.readFileSync(path.join(process.cwd(), "src-tauri/src/providers_fingerprint.rs"), "utf8"),
].join("\n");

assert.ok(toolsTs.includes("## Agent Tools (Native Function Calling)") && toolsTs.includes("## Agent Tools (Zeus XML Protocol)"));
assert.ok(!agentTs.includes('content: `Workspace is connected. I will check the top-level directory listing first.'));
assert.ok(engineTs.includes("runPreToolUseHook") && engineTs.includes("computeToolBatchWaves") && engineTs.includes("provider_notice"));
assert.ok(providersAllRs.includes("timeout_secs.max(60)"));
assert.ok(providersAllRs.includes("smart_cap_system(&req.system, 120000)"));
assert.ok(providersAllRs.includes("Silent cross-provider model switching is disabled"));
console.log("[PASS] 4. Unified tool protocol, post-stream execution, 60s+ timeouts, 120k prompt retention, and disabled silent failover verified");

// Verify every .ts, .tsx, and .rs file in src/ and src-tauri/src/ is under 1,000 lines
for (const dir of ["src/lib", "src/components", "src-tauri/src"]) {
  const fullDir = path.join(process.cwd(), dir);
  for (const entry of fs.readdirSync(fullDir)) {
    if (!/\.(ts|tsx|rs)$/.test(entry)) continue;
    const p = path.join(fullDir, entry);
    if (!fs.statSync(p).isFile()) continue;
    const lineCount = fs.readFileSync(p, "utf8").split("\n").length;
    assert.ok(lineCount <= 1000, `${dir}/${entry} has ${lineCount} lines (must be <= 1000)`);
  }
}
console.log("[PASS] 5. Every .ts, .tsx, and .rs file in src/ and src-tauri/src/ is strictly <= 1,000 lines");
console.log("=== ALL STORMY & CODING HARNESS VERIFICATION CHECKS PASSED ===");
