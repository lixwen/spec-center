import type { ReviewerRecommendation, SpecUnit } from "../domain/models";

export interface ReviewBrief {
  label: "Advisory";
  overview: string;
  scope: string[];
  keyChanges: string[];
  reviewerFocus: string[];
  risks: string[];
  baselineMode: "with_product_baseline" | "without_product_baseline";
}

export interface SpecIssue {
  kind:
    | "Missing"
    | "Incomplete"
    | "Ambiguous"
    | "Regression Risk"
    | "Gap"
    | "Inconsistency"
    | "Coverage Gap"
    | "Review Gap";
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  rationale: string;
  baselineNote?: string;
}

export function generateReviewBrief(
  spec: SpecUnit,
  deltaContent: string,
  baselineContent?: string | null
): ReviewBrief {
  const baselineNote = baselineContent
    ? "Baseline context is available and should be compared before approval."
    : "This capability is new and has no product baseline yet.";

  return {
    label: "Advisory",
    overview: `${spec.capability} is under review in ${spec.repo}.`,
    scope: [
      `Owner role: ${spec.owner_role}`,
      baselineNote
    ],
    keyChanges: [
      firstMeaningfulLine(deltaContent),
      "Review is locked to the current baseline snapshot."
    ],
    reviewerFocus: [
      "Check missing scenarios and edge conditions.",
      "Verify terminology matches the product baseline.",
      "Confirm repo bindings and reviewer coverage are complete."
    ],
    risks: baselineContent
      ? [
          "Regression against existing product baseline behavior.",
          "Review comments may remain open when PM attempts approval."
        ]
      : ["New capability without historical baseline increases ambiguity risk."],
    baselineMode: baselineContent
      ? "with_product_baseline"
      : "without_product_baseline"
  };
}

export function detectSingleSpecIssues(
  deltaContent: string,
  baselineContent?: string | null
): SpecIssue[] {
  const issues: SpecIssue[] = [];

  if (!/timeout/i.test(deltaContent)) {
    issues.push({
      kind: "Missing",
      severity: "high",
      title: "Timeout path not specified",
      message: "Timeout or retry handling is not described.",
      rationale: "Reviewers cannot verify failure behavior without an explicit timeout or retry path."
    });
  }

  if (!/must|shall/i.test(deltaContent)) {
    issues.push({
      kind: "Ambiguous",
      severity: "medium",
      title: "Normative language is weak",
      message: "Normative language is weak; requirements may be hard to verify.",
      rationale: "Words like should or appropriate leave too much room for interpretation during implementation and QA."
    });
  }

  if (baselineContent && /single channel/i.test(baselineContent)) {
    issues.push({
      kind: "Regression Risk",
      severity: "high",
      title: "Baseline compatibility is unclear",
      message:
        "The baseline mentions single-channel payments, but the delta does not describe compatibility or migration.",
      rationale: "A baseline behavior is already documented, so the change should either preserve it or explain the migration path.",
      baselineNote: "Product baseline references single-channel behavior."
    });
  }

  if (!/status|state/i.test(deltaContent)) {
    issues.push({
      kind: "Incomplete",
      severity: "medium",
      title: "Lifecycle details are partial",
      message: "State transitions or output states are not fully described.",
      rationale: "Specs that omit states make downstream API and UI review harder."
    });
  }

  if (baselineContent && !/baseline|compat|existing/i.test(deltaContent)) {
    issues.push({
      kind: "Gap",
      severity: "low",
      title: "Delta does not mention existing baseline scope",
      message: "The delta never references how existing baseline behavior is carried forward.",
      rationale: "Explicit carry-forward language helps reviewers separate intentional change from omission.",
      baselineNote: "Baseline context is present for this capability."
    });
  }

  return issues;
}

export function detectCrossSpecIssues(specs: SpecUnit[]): SpecIssue[] {
  if (specs.length < 2) {
    return [];
  }

  const issues: SpecIssue[] = [];
  const repos = new Set(specs.map((spec) => spec.repo));
  const capabilities = new Set(specs.map((spec) => spec.capability));

  if (repos.size === 1 && capabilities.size > 1) {
    issues.push({
      kind: "Inconsistency",
      severity: "medium",
      title: "Shared flow spans multiple capability specs",
      message:
        "The change splits one review flow across multiple capability labels, which can hide contradictory assumptions.",
      rationale: "When one repo change touches several adjacent capability names, reviewers should verify terminology and handoff consistency."
    });
  }

  return issues;
}

export function recommendReviewers(specs: SpecUnit[]): ReviewerRecommendation[] {
  const recommendations: ReviewerRecommendation[] = [];

  if (specs.length > 0) {
    recommendations.push({
      user: "qa",
      role: "QA",
      score: 0.92,
      rationale:
        "QA already participates in capability validation and is well positioned to compare delta behavior against baseline expectations."
    });
  }

  if (specs.length > 1) {
    recommendations.push({
      user: "eng",
      role: "Engineer",
      score: 0.81,
      rationale:
        "Engineering review is recommended because the change spans multiple capability specs."
    });
  }

  return recommendations;
}

function firstMeaningfulLine(content: string): string {
  return (
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#")) ??
    "No summary line detected."
  );
}
