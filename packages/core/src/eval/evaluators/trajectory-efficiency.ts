import type { AITrace, AISpan, EvalExample, EvalResult } from "../../domain/models";
import type { Evaluator } from "../evaluator";
import { labelFromScore } from "../evaluator";

const NAME = "trajectory-efficiency";

function roundMultiplierFromParams(
  params: Record<string, number | string | boolean> | undefined
): number {
  if (!params) return 1;
  const v = params.roundMultiplier;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return 1;
}

function argsKey(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return "{}";
  try {
    return JSON.stringify(args, Object.keys(args).sort());
  } catch {
    return String(args);
  }
}

function detectToolArgLoops(toolSpans: AISpan[]): { loopDetected: boolean; pairs: string[] } {
  const pairs: string[] = [];
  let loopDetected = false;
  for (let i = 1; i < toolSpans.length; i++) {
    const a = toolSpans[i - 1]?.tool;
    const b = toolSpans[i]?.tool;
    if (!a || !b) continue;
    if (a.toolName === b.toolName && argsKey(a.args) === argsKey(b.args)) {
      loopDetected = true;
      pairs.push(`${a.toolName}:${argsKey(a.args)}`);
    }
  }
  return { loopDetected, pairs: [...new Set(pairs)] };
}

export const trajectoryEfficiencyEvaluator: Evaluator = {
  name: NAME,
  type: "code-based",
  async evaluate(
    trace: AITrace,
    spans: AISpan[],
    example: EvalExample,
    _agentOutput: string,
    params?: Record<string, number | string | boolean>
  ): Promise<EvalResult> {
    const maxRounds = example.expected?.max_rounds;
    if (maxRounds === undefined) {
      return {
        evaluator: NAME,
        score: 1,
        label: "pass",
        reason: "no expected value to check"
      };
    }

    const roundMultiplier = roundMultiplierFromParams(params);
    const effectiveMaxRounds = maxRounds * roundMultiplier;

    const actual = trace.agentRounds;
    let roundScore: number;
    if (effectiveMaxRounds <= 0) {
      roundScore = actual <= 0 ? 1 : 0;
    } else if (actual <= effectiveMaxRounds) {
      roundScore = 1;
    } else {
      roundScore = Math.max(0, 1 - (actual - effectiveMaxRounds) / effectiveMaxRounds);
    }

    const toolSpans = spans.filter((s) => s.type === "tool");
    const { loopDetected, pairs } = detectToolArgLoops(toolSpans);

    const score = roundScore;
    const label = labelFromScore(score, params);

    return {
      evaluator: NAME,
      score,
      label,
      reason:
        roundScore >= 1
          ? "trajectory within expected round budget"
          : "exceeded expected agent rounds",
      details: {
        agentRounds: actual,
        maxRounds,
        effectiveMaxRounds,
        roundMultiplier,
        loopDetected,
        loopPairs: pairs
      }
    };
  }
};
