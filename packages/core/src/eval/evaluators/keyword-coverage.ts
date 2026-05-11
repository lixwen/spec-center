import type { AITrace, AISpan, EvalExample, EvalResult } from "../../domain/models";
import type { Evaluator } from "../evaluator";
import { labelFromScore } from "../evaluator";

const NAME = "keyword-coverage";

function caseSensitiveFromParams(
  params: Record<string, number | string | boolean> | undefined
): boolean {
  if (!params) return false;
  return params.caseSensitive === true;
}

function containsMatch(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (caseSensitive) return haystack.includes(needle);
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export const keywordCoverageEvaluator: Evaluator = {
  name: NAME,
  type: "code-based",
  async evaluate(
    _trace: AITrace,
    _spans: AISpan[],
    example: EvalExample,
    agentOutput: string,
    params?: Record<string, number | string | boolean>
  ): Promise<EvalResult> {
    const caseSensitive = caseSensitiveFromParams(params);
    const keywords = example.expected?.keywords ?? [];
    const forbidden = example.expected?.should_not_contain ?? [];

    const hitForbidden = forbidden.filter((phrase) => containsMatch(agentOutput, phrase, caseSensitive));
    if (hitForbidden.length > 0) {
      return {
        evaluator: NAME,
        score: 0,
        label: "fail",
        reason: "output contains disallowed phrases",
        details: {
          keywordsMatched: [] as string[],
          keywordsMissed: [...keywords],
          hitForbidden
        }
      };
    }

    if (keywords.length === 0) {
      return {
        evaluator: NAME,
        score: 1,
        label: "pass",
        reason: "no expected value to check"
      };
    }

    const matched = keywords.filter((k) => containsMatch(agentOutput, k, caseSensitive));
    const missed = keywords.filter((k) => !containsMatch(agentOutput, k, caseSensitive));
    const score = matched.length / keywords.length;
    const label = labelFromScore(score, params);

    return {
      evaluator: NAME,
      score,
      label,
      reason:
        score >= 1
          ? "all expected keywords present"
          : score > 0
            ? "some keywords missing"
            : "no keywords matched",
      details: {
        keywordsMatched: matched,
        keywordsMissed: missed
      }
    };
  }
};
