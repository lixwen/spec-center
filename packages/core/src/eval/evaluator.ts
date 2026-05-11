import type { AITrace, AISpan, EvalExample, EvalResult } from "../domain/models";

export type EvaluatorType = "code-based" | "llm-judge";

export const DEFAULT_PASS_THRESHOLD = 0.7;

export function labelFromScore(
  score: number,
  params?: Record<string, number | string | boolean>
): EvalResult["label"] {
  const threshold =
    typeof params?.passThreshold === "number" && Number.isFinite(params.passThreshold)
      ? params.passThreshold
      : DEFAULT_PASS_THRESHOLD;
  if (score >= threshold) return "pass";
  if (score > 0) return "partial";
  return "fail";
}

export interface Evaluator {
  name: string;
  type: EvaluatorType;
  /** Baseline params merged under runtime/config params in the runner */
  defaultParams?: Record<string, number | string | boolean>;
  evaluate(
    trace: AITrace,
    spans: AISpan[],
    example: EvalExample,
    agentOutput: string,
    params?: Record<string, number | string | boolean>
  ): Promise<EvalResult>;
}
