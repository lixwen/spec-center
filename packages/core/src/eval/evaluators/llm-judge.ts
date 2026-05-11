import type { AITrace, AISpan, EvalExample, EvalResult } from "../../domain/models";
import type { Evaluator } from "../evaluator";
import { labelFromScore } from "../evaluator";
import { getAIClient, getChatModel } from "../../services/rag-service";

const NAME = "llm-judge";

function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim()) as unknown;
    } catch {
      /* continue */
    }
  }
  return null;
}

function averageNumericScores(value: unknown): number | null {
  if (value === null || typeof value !== "object") return null;
  const nums = Object.values(value as Record<string, unknown>).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clampScore(s: number): number {
  return Math.max(0, Math.min(1, s));
}

export const llmJudgeEvaluator: Evaluator = {
  name: NAME,
  type: "llm-judge",
  async evaluate(
    _trace: AITrace,
    _spans: AISpan[],
    example: EvalExample,
    agentOutput: string,
    params?: Record<string, number | string | boolean>
  ): Promise<EvalResult> {
    if (!agentOutput?.trim()) {
      return {
        evaluator: NAME,
        score: 0,
        label: "fail",
        reason: "no agent output to judge"
      };
    }

    const client = getAIClient();
    const model = (process.env.EVAL_JUDGE_MODEL ?? "").trim() || getChatModel();
    const userPrompt = `You are scoring an assistant reply. Reply with a single JSON object whose values are numbers between 0 and 1 (dimension scores). No other text.\n\nTask:\n${example.input}\n\nAssistant output:\n${agentOutput}`;

    let raw: string;
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0
      });
      const msg = res.choices[0]?.message?.content;
      raw = typeof msg === "string" ? msg : "";
    } catch (e) {
      return {
        evaluator: NAME,
        score: 0,
        label: "fail",
        reason: `LLM judge request failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }

    const parsed = extractJsonValue(raw);
    const avg = averageNumericScores(parsed);
    if (avg === null) {
      return {
        evaluator: NAME,
        score: 0,
        label: "fail",
        reason: "LLM judge returned invalid or unparseable JSON"
      };
    }

    const score = clampScore(avg);
    return {
      evaluator: NAME,
      score,
      label: labelFromScore(score, params),
      reason: "LLM judge averaged numeric dimension scores"
    };
  }
};
