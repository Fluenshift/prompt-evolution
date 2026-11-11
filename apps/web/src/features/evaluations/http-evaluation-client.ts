import type {
  Evaluation,
  EvaluationClient,
  EvaluationSubmissionResult,
  EvaluationSummary,
  ProgressEvidence,
  ProgressEvidenceSelection,
  ProgressPeriod,
  ProgressSummary,
  SetupStatus,
} from "./evaluation-client";

interface HttpEvaluationClientOptions {
  fetch?: typeof globalThis.fetch;
}

interface ApiFailure {
  readonly code?: string;
  readonly kind?: string;
  readonly retryable?: boolean;
}

export class EvaluationRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(response: Response, failure?: ApiFailure) {
    super("Evaluation request could not be completed");
    this.name = "EvaluationRequestError";
    this.code = failure?.code ?? "request-failed";
    this.retryable = failure?.retryable ?? response.status >= 500;
    this.status = response.status;
  }
}

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const asFailure = (value: unknown): ApiFailure | undefined =>
  typeof value === "object" && value !== null ? value : undefined;

const requireJson = async <A>(response: Response): Promise<A> => {
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new EvaluationRequestError(response, asFailure(payload));
  }
  if (payload === undefined) {
    throw new EvaluationRequestError(response);
  }
  return payload as A;
};

const evidenceSearch = (
  period: ProgressPeriod,
  selection: ProgressEvidenceSelection
) => {
  const search = new URLSearchParams({ insight: selection.kind, period });
  if (selection.kind === "category") {
    search.set("category", selection.category);
  } else if (selection.kind === "correction") {
    search.set("correction", selection.correction);
    search.set("originalText", selection.originalText);
  }
  return search;
};

export const createHttpEvaluationClient = ({
  fetch = globalThis.fetch,
}: HttpEvaluationClientOptions = {}): EvaluationClient => ({
  async deleteEvaluation(evaluationId: string): Promise<void> {
    const response = await fetch(
      `/api/evaluations/${encodeURIComponent(evaluationId)}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      throw new EvaluationRequestError(
        response,
        asFailure(await parseJson(response))
      );
    }
  },

  async evaluateWriting(
    writingSample: string
  ): Promise<EvaluationSubmissionResult> {
    const response = await fetch("/api/evaluations", {
      body: JSON.stringify({ writingSample }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await parseJson(response);
    if (
      response.status === 422 &&
      typeof payload === "object" &&
      payload !== null &&
      "kind" in payload &&
      payload.kind === "no-english"
    ) {
      return { kind: "no-english" };
    }
    if (!response.ok || payload === undefined) {
      throw new EvaluationRequestError(response, asFailure(payload));
    }
    return payload as EvaluationSubmissionResult;
  },

  async getEvaluation(evaluationId: string): Promise<Evaluation | null> {
    const response = await fetch(
      `/api/evaluations/${encodeURIComponent(evaluationId)}`
    );
    if (response.status === 404) {
      return null;
    }
    return requireJson<Evaluation>(response);
  },

  async getProgressEvidence({
    period,
    selection,
  }: {
    period: ProgressPeriod;
    selection: ProgressEvidenceSelection;
  }): Promise<ProgressEvidence> {
    const search = evidenceSearch(period, selection);
    return requireJson<ProgressEvidence>(
      await fetch(`/api/progress/evidence?${search.toString()}`)
    );
  },

  async getProgressSummary({
    period,
  }: {
    period: ProgressPeriod;
  }): Promise<ProgressSummary> {
    const search = new URLSearchParams({ period });
    return requireJson<ProgressSummary>(
      await fetch(`/api/progress?${search.toString()}`)
    );
  },

  async getSetupStatus(): Promise<SetupStatus> {
    return requireJson<SetupStatus>(await fetch("/api/setup"));
  },

  async listEvaluations(): Promise<readonly EvaluationSummary[]> {
    return requireJson<readonly EvaluationSummary[]>(
      await fetch("/api/evaluations")
    );
  },
});
