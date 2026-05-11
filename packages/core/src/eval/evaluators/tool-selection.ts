import type { AITrace, AISpan, EvalExample, EvalResult } from "../../domain/models";
import type { Evaluator } from "../evaluator";
import { labelFromScore } from "../evaluator";

const NAME = "tool-selection";

function uniqueToolNames(spans: AISpan[]): string[] {
  const names: string[] = [];
  for (const span of spans) {
    if (span.type !== "tool") continue;
    const n = span.tool?.toolName;
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

export const toolSelectionEvaluator: Evaluator = {
  name: NAME,
  type: "code-based",
  async evaluate(
    _trace: AITrace,
    spans: AISpan[],
    example: EvalExample,
    _agentOutput: string,
    params?: Record<string, number | string | boolean>
  ): Promise<EvalResult> {
    const expected = example.expected?.tools_used;
    if (expected === undefined || expected.length === 0) {
      return {
        evaluator: NAME,
        score: 1,
        label: "pass",
        reason: "no expected value to check"
      };
    }

    const usedNames = uniqueToolNames(spans);
    const usedSet = new Set(usedNames);
    const expectedUnique = [...new Set(expected)];
    const expectedSet = new Set(expected);

    const matched = expectedUnique.filter((t) => usedSet.has(t));
    const score = matched.length / expectedUnique.length;

    const redundantCalls = usedNames.filter((u) => !expectedSet.has(u));
    const label = labelFromScore(score, params);

    return {
      evaluator: NAME,
      score,
      label,
      reason:
        score >= 1
          ? "all expected tools were used"
          : score > 0
            ? "partial overlap with expected tools"
            : "no expected tools matched",
      details: {
        expected,
        expectedUnique,
        used: usedNames,
        matched,
        redundantCalls,
        redundantCount: redundantCalls.length
      }
    };
  }
};
