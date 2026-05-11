import type { AITrace, AISpan, EvalExample, EvalResult } from "../../domain/models";
import type { Evaluator } from "../evaluator";
import { labelFromScore } from "../evaluator";

const NAME = "cost-threshold";

function envNumber(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numberFromParams(
  params: Record<string, number | string | boolean> | undefined,
  key: string,
  fallback: number
): number {
  if (!params) return fallback;
  const v = params[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

export const costThresholdEvaluator: Evaluator = {
  name: NAME,
  type: "code-based",
  async evaluate(
    trace: AITrace,
    _spans: AISpan[],
    _example: EvalExample,
    _agentOutput: string,
    params?: Record<string, number | string | boolean>
  ): Promise<EvalResult> {
    const maxCostUsd = numberFromParams(params, "maxCostUsd", envNumber("EVAL_MAX_COST_USD", 0.1));
    const maxTokens = numberFromParams(params, "maxTokens", envNumber("EVAL_MAX_TOKENS", 50_000));

    const cost = trace.estimatedCostUsd;
    const totalTokens = trace.totalPromptTokens + trace.totalCompletionTokens;

    const costExceeded =
      cost !== undefined && Number.isFinite(cost) && cost > maxCostUsd;
    const tokensExceeded = totalTokens > maxTokens;

    let score: number;
    if (!costExceeded && !tokensExceeded) score = 1;
    else if (costExceeded && tokensExceeded) score = 0;
    else score = 0.5;

    const label = labelFromScore(score, params);

    return {
      evaluator: NAME,
      score,
      label,
      reason:
        score >= 1
          ? "within cost and token limits"
          : score === 0.5
            ? "one of cost or token limits exceeded"
            : "cost and token limits both exceeded",
      details: {
        estimatedCostUsd: cost,
        totalTokens,
        maxCostUsd,
        maxTokens,
        costExceeded: !!costExceeded,
        tokensExceeded
      }
    };
  }
};
