/** The Error Categories permitted by Rubric Version 1. */
export const ERROR_CATEGORIES = [
  "Spelling",
  "Article",
  "Verb form/tense",
  "Preposition",
  "Word choice",
  "Grammar/syntax",
  "Punctuation/capitalization",
  "Clarity",
  "Other",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export type FindingSeverity = "Minor" | "Moderate" | "Major";

export type ProficiencyBand =
  | "Needs revision"
  | "Understandable"
  | "Clear"
  | "Natural";

export interface EvaluationFinding {
  byteEnd?: number;
  byteStart?: number;
  category: ErrorCategory;
  correction: string;
  explanation: string;
  originalText: string;
  severity: FindingSeverity;
}

export interface EvaluationSuggestion {
  alternative?: string;
  byteEnd?: number;
  byteStart?: number;
  explanation: string;
  originalText: string;
}

export interface Evaluation {
  band: ProficiencyBand;
  correctedText: string;
  evaluatedAt: string;
  evaluatedEnglishWordCount: number;
  findings: EvaluationFinding[];
  id: string;
  model: string;
  originalText: string;
  provider: string;
  rubricVersion: string;
  score: number;
  suggestions: EvaluationSuggestion[];
  summary: string;
}

export type EvaluationSubmissionResult =
  | { evaluation: Evaluation; kind: "created" }
  | { kind: "no-english" };

export type EvaluationSummary = Pick<
  Evaluation,
  "band" | "evaluatedAt" | "id" | "rubricVersion" | "score" | "summary"
>;

export interface CategoryRecurrence {
  category: ErrorCategory;
  evaluationCount: number;
  recurrencePercentage: number;
}

export interface RecurringCorrection {
  correction: string;
  occurrenceCount: number;
  originalText: string;
}

export interface CategoryDistribution {
  category: ErrorCategory;
  findingCount: number;
}

export type ProgressPeriod = "7-days" | "30-days" | "all";

/**
 * One Rubric Version's evidence. Segments are computed independently so no
 * rate, recurrence, distribution, or average crosses a version boundary.
 */
export interface ProgressSegment {
  averageBand: ProficiencyBand | null;
  averageScore: number | null;
  categoryDistributions: readonly CategoryDistribution[];
  categoryRecurrences: readonly CategoryRecurrence[];
  evaluatedEnglishWordCount: number;
  evaluationCount: number;
  findingCount: number;
  findingRate: number | null;
  recurringCorrections: readonly RecurringCorrection[];
  rubricVersion: string;
}

export interface ProgressSummary extends ProgressSegment {
  incompatibleSegments: readonly ProgressSegment[];
  period: ProgressPeriod;
}

export type ProgressEvidenceSelection =
  | { category: ErrorCategory; kind: "category" }
  | { correction: string; kind: "correction"; originalText: string }
  | { kind: "average-score" }
  | { kind: "finding-rate" };

/**
 * A retained Finding located by its Evaluation and its position inside that
 * Evaluation, because Findings carry no durable identity yet.
 */
export interface ProgressEvidenceFinding {
  category: ErrorCategory;
  correction: string;
  evaluatedAt: string;
  evaluationId: string;
  evaluationSummary: string;
  explanation: string;
  findingIndex: number;
  originalText: string;
  severity: FindingSeverity;
}

export interface ProgressEvidenceEvaluation {
  band: ProficiencyBand;
  evaluatedAt: string;
  evaluatedEnglishWordCount: number;
  findingCount: number;
  id: string;
  score: number;
  summary: string;
}

export interface ProgressEvidence {
  evaluations: readonly ProgressEvidenceEvaluation[];
  findings: readonly ProgressEvidenceFinding[];
  period: ProgressPeriod;
  rubricVersion: string;
  selection: ProgressEvidenceSelection;
}

export interface SetupStatus {
  configured: boolean;
  dataLocation: string;
  model: string;
  provider: string;
  rubricVersion: string;
}

export interface EvaluationClient {
  deleteEvaluation: (evaluationId: string) => Promise<void>;
  evaluateWriting: (
    writingSample: string
  ) => Promise<EvaluationSubmissionResult>;
  getEvaluation: (evaluationId: string) => Promise<Evaluation | null>;
  getProgressEvidence: (options: {
    period: ProgressPeriod;
    selection: ProgressEvidenceSelection;
  }) => Promise<ProgressEvidence>;
  getProgressSummary: (options: {
    period: ProgressPeriod;
  }) => Promise<ProgressSummary>;
  getSetupStatus: () => Promise<SetupStatus>;
  listEvaluations: () => Promise<readonly EvaluationSummary[]>;
}
