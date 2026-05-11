import type { Evaluator } from "../evaluator";
import { costThresholdEvaluator } from "./cost-threshold";
import { keywordCoverageEvaluator } from "./keyword-coverage";
import { toolSelectionEvaluator } from "./tool-selection";
import { trajectoryEfficiencyEvaluator } from "./trajectory-efficiency";

export function getAllCodeEvaluators(): Evaluator[] {
  return [
    toolSelectionEvaluator,
    trajectoryEfficiencyEvaluator,
    costThresholdEvaluator,
    keywordCoverageEvaluator
  ];
}

export { costThresholdEvaluator } from "./cost-threshold";
export { keywordCoverageEvaluator } from "./keyword-coverage";
export { toolSelectionEvaluator } from "./tool-selection";
export { trajectoryEfficiencyEvaluator } from "./trajectory-efficiency";
