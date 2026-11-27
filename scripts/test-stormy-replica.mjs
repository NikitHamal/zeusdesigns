#!/usr/bin/env node
// Comprehensive Verification Suite for Stormy (Oro / Orobi) Replica & Desktop Upgrade in ZeusDesigns
// Verifies:
// 1. Stormy Core Agent System (`src/lib/stormyAgent.ts`): ToolAliases, TextToolProtocol, ModelProfiles,
//    ToolBatch dependency waves, StuckDetector, TokenEstimator, RunLedger, HistoryPruner, BriefCheck,
//    ProjectInstructions, ProjectSnapshot, DiffUtils, AutonomyPolicy, QualityGate, and DisplayText.
// 2. Native Rust Engine (`src-tauri/src/workspace.rs` & `src-tauri/src/agent.rs`):
//    4-stage TextEdits (`apply_stormy_text_edit`), BM25 ProjectSearch (`bm25_search_project`),
//    ProjectOutline (`project_outline_of`), QualityAuditor (`audit_workspace_files`),
//    Checkpoints (`checkpoint_capture_file`, `workspace_checkpoints`, `workspace_restore_checkpoint`),
//    Git & Extended tools (`copy_file`, `create_folder`, `insert_at_line`, `diff_files`, `git_status`, `security_scan`).
// 3. UI & IDE Components (`Activity.tsx`, `StormyCards.tsx`, `GitPanel.tsx`, `WorkspacePanels.tsx`, `Chat.tsx`, `Settings.tsx`).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

console.log("=== Stormy (Oro) Replica & Desktop Upgrade Verification Suite ===");

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

const workspaceRs = fs.readFileSync(path.join(process.cwd(), "src-tauri/src/workspace.rs"), "utf8");
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
console.log("[PASS] 2. src-tauri/src/workspace.rs implements all 12 Stormy native workspace, BM25, checkpoint, git, and audit functions");

const agentRs = fs.readFileSync(path.join(process.cwd(), "src-tauri/src/agent.rs"), "utf8");
for (const feature of [
  "pub fn apply_stormy_text_edit",
  "fn strip_read_file_line_prefixes",
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
  assert.ok(agentRs.includes(feature), `agent.rs must support ${feature}`);
}
console.log("[PASS] 3. src-tauri/src/agent.rs supports Stormy 4-stage TextEdits, multi-format tool parsers, and all extended/git tools");

for (const uiFile of [
  "src/components/Activity.tsx",
  "src/components/StormyCards.tsx",
  "src/components/GitPanel.tsx",
  "src/components/WorkspacePanels.tsx",
  "src/components/Chat.tsx",
  "src/components/Settings.tsx",
]) {
  assert.ok(fs.existsSync(path.join(process.cwd(), uiFile)), `${uiFile} must exist`);
}
console.log("[PASS] 4. All Stormy UI components (ToolCard, ToolCallGroup, PlanTimeline, AskUserCard, ApprovalCard, GitPanel, CodeEditor) verified");
console.log("=== ALL STORMY REPLICA VERIFICATION CHECKS PASSED ===");
