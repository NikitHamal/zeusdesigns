import type { Effort } from "../types";
import { findProvider, type ModelInfo, type ProviderMeta } from "./providers";

export const EFFORT_ORDER: Effort[] = ["low", "medium", "high", "max"];

const FLAGSHIP = /ultra|-pro\b|\bpro\b|opus|fable|kimi-k2|glm-5|qwen3-235b|mistral-large-4|step-5|beam|k2-horizon|gemini-4|gemini-pro-orchestrator|gemini-3\.1|gpt-oss-120b|sonnet|big-pickle|minimax-m2|deepseek-v4-pro|longcat|qwen4|grok-4|gpt-6|gpt-5|o3/i;
const SMALL = /(^|[^\d])(0\.\d|1|1\.\d|2|3|4|e2b|e4b)b\b|lite|lightning|bolt|nano|mini|tiny|flash-lite|fast|instant|moondream|smol|230m|500m/i;

/** Reasoning tiers a model really honours. Empty when the model does not reason. */
export function reasoningTiers(model?: ModelInfo | null): Effort[] {
  if (!model?.reasoning) return [];
  const id = `${model.id} ${model.label}`;
  if (FLAGSHIP.test(id)) return ["low", "medium", "high", "max"];
  if (SMALL.test(id)) return ["low", "medium"];
  return ["low", "medium", "high"];
}

export function clampEffort(effort: Effort, tiers: Effort[]): Effort {
  if (!tiers.length || tiers.includes(effort)) return effort;
  const want = EFFORT_ORDER.indexOf(effort);
  return [...tiers].sort((a, b) => Math.abs(EFFORT_ORDER.indexOf(a) - want) - Math.abs(EFFORT_ORDER.indexOf(b) - want))[0];
}

export function fmtCtx(n?: number, verified?: boolean): string {
  if (!n) return "";
  const v = n >= 1_000_000 ? `${+(n / 1_048_576).toFixed(n % 1_048_576 === 0 || n === 1_000_000 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`;
  return verified ? v : `~${v}`;
}

export function currentModel(providerId: string, modelId: string): { provider: ProviderMeta; model?: ModelInfo } {
  const provider = findProvider(providerId);
  return { provider, model: provider.models.find((m) => m.id === modelId) };
}
