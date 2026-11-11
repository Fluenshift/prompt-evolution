import { randomUUID } from "node:crypto";
import path from "node:path";

import { Schema } from "effect";
import { Elysia } from "elysia";

import {
  EVALUATION_HTTP_IDLE_TIMEOUT_SECONDS,
  EVALUATION_MAX_OUTPUT_TOKENS,
  EVALUATION_REQUEST_TIMEOUT_MILLISECONDS,
} from "./evaluation/evaluation-request-policy";
import { ERROR_CATEGORIES } from "./evaluation/rubric-v1";
import type { StoredEvaluation } from "./evaluation/writing-evaluation";
import type {
  ProgressEvidence,
  ProgressEvidenceSelection,
  ProgressPeriod,
  ProgressSummary,
} from "./progress/progress-insights";

export interface SetupStatus {
  readonly configured: boolean;
  readonly dataLocation: string;
  readonly model: string;
  readonly provider: string;
  readonly rubricVersion: string;
}

export interface EvaluationLogEvent {
  readonly code:
    | EvaluationFailureCode
    | "created"
    | "internal-error"
    | "no-english";
  readonly correlationId: string;
  readonly durationMilliseconds: number;
  readonly maxOutputTokens: number;
  readonly model: string;
  readonly provider: string;
  readonly requestTimeoutMilliseconds: number;
}

export type EvaluationEndpointResult =
  | { readonly evaluation: StoredEvaluation; readonly kind: "created" }
  | { readonly kind: "no-english" }
  | {
      readonly code:
        | "configuration-missing"
        | "invalid-assessment"
        | "invalid-writing-sample"
        | "persistence-failure"
        | "provider-credits-exhausted"
        | "provider-output-incomplete"
        | "provider-rate-limited"
        | "provider-rejected"
        | "provider-timeout"
        | "provider-unavailable";
      readonly kind: "failure";
      readonly retryable: boolean;
    };

type EvaluationFailureCode = Extract<
  EvaluationEndpointResult,
  { readonly kind: "failure" }
>["code"];

const FAILURE_STATUS = {
  "configuration-missing": 503,
  "invalid-assessment": 502,
  "invalid-writing-sample": 400,
  "persistence-failure": 500,
  "provider-credits-exhausted": 503,
  "provider-output-incomplete": 502,
  "provider-rate-limited": 429,
  "provider-rejected": 502,
  "provider-timeout": 504,
  "provider-unavailable": 503,
} as const satisfies Record<EvaluationFailureCode, number>;

const resultCode = (
  result: EvaluationEndpointResult
): EvaluationLogEvent["code"] =>
  result.kind === "failure" ? result.code : result.kind;

const evaluationLogEvent = (
  code: EvaluationLogEvent["code"],
  correlationId: string,
  durationMilliseconds: number,
  setup: SetupStatus | undefined
): EvaluationLogEvent => ({
  code,
  correlationId,
  durationMilliseconds,
  maxOutputTokens: EVALUATION_MAX_OUTPUT_TOKENS,
  model: setup?.model ?? "unconfigured",
  provider: setup?.provider ?? "unconfigured",
  requestTimeoutMilliseconds: EVALUATION_REQUEST_TIMEOUT_MILLISECONDS,
});

const safelyLogEvaluation = (
  logEvaluation: AppOptions["logEvaluation"],
  event: EvaluationLogEvent
) => {
  try {
    logEvaluation?.(event);
  } catch {
    // Observability must never change the Evaluation outcome.
  }
};

const parsePeriod = (value: string | undefined): ProgressPeriod | null =>
  value === "7-days" || value === "30-days" || value === "all" ? value : null;

const parseSelection = (
  query: Record<string, string | undefined>
): ProgressEvidenceSelection | null => {
  if (query.insight === "finding-rate" || query.insight === "average-score") {
    return { kind: query.insight };
  }
  if (
    query.insight === "category" &&
    ERROR_CATEGORIES.includes(
      query.category as (typeof ERROR_CATEGORIES)[number]
    )
  ) {
    return {
      category: query.category as (typeof ERROR_CATEGORIES)[number],
      kind: "category",
    };
  }
  if (
    query.insight === "correction" &&
    query.originalText !== undefined &&
    query.correction !== undefined
  ) {
    return {
      correction: query.correction,
      kind: "correction",
      originalText: query.originalText,
    };
  }
  return null;
};

export interface AppOptions {
  readonly deleteEvaluation?: (evaluationId: string) => Promise<void>;
  readonly evaluateWriting?: (
    writingSample: string
  ) => Promise<EvaluationEndpointResult>;
  readonly getEvaluation?: (evaluationId: string) => Promise<unknown | null>;
  readonly getProgressEvidence?: (options: {
    period: ProgressPeriod;
    selection: ProgressEvidenceSelection;
  }) => Promise<ProgressEvidence>;
  readonly getProgressSummary?: (options: {
    period: ProgressPeriod;
  }) => Promise<ProgressSummary | object>;
  readonly listEvaluations?: () => Promise<readonly unknown[]>;
  readonly logEvaluation?: (event: EvaluationLogEvent) => void;
  readonly serveWeb: boolean;
  readonly setup?: SetupStatus;
  readonly webDistPath: string;
}

export const createApp = ({
  deleteEvaluation,
  evaluateWriting,
  getEvaluation,
  getProgressEvidence,
  getProgressSummary,
  listEvaluations,
  logEvaluation,
  serveWeb,
  setup,
  webDistPath,
}: AppOptions) => {
  const app = new Elysia({
    serve: { idleTimeout: EVALUATION_HTTP_IDLE_TIMEOUT_SECONDS },
  })
    .onError(({ code, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { code: "not-found", error: "Not Found" };
      }
      if (code === "VALIDATION" || code === "PARSE") {
        set.status = 400;
        return {
          code: "invalid-request",
          error: "Request could not be completed",
        };
      }
      set.status = 500;
      return {
        code: "internal-error",
        error: "Request could not be completed",
      };
    })
    .onRequest(({ request, set }) => {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        set.headers["cache-control"] = "no-store";
      }
      const host = request.headers.get("host");
      const origin = request.headers.get("origin");
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        (host !== null && host !== url.host) ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin !== null && origin !== url.origin)
      ) {
        set.status = 403;
        return {
          code: "forbidden",
          error: "Only same-origin localhost access is allowed",
        };
      }
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > 256 * 1024) {
        set.status = 413;
        return {
          code: "sample-too-large",
          error: "Writing Sample is too large",
        };
      }
    })
    .get("/api/health", () => ({ status: "ok" as const }))
    .post(
      "/api/evaluations",
      async ({ body, set }) => {
        const correlationId = randomUUID();
        const startedAt = performance.now();
        set.headers["x-correlation-id"] = correlationId;
        if (!evaluateWriting) {
          set.status = 503;
          return { error: "Evaluation is not configured" };
        }

        let result: EvaluationEndpointResult;
        try {
          result = await evaluateWriting(body.writingSample);
        } catch (error) {
          safelyLogEvaluation(
            logEvaluation,
            evaluationLogEvent(
              "internal-error",
              correlationId,
              Math.round(performance.now() - startedAt),
              setup
            )
          );
          throw error;
        }
        safelyLogEvaluation(
          logEvaluation,
          evaluationLogEvent(
            resultCode(result),
            correlationId,
            Math.round(performance.now() - startedAt),
            setup
          )
        );
        if (result.kind === "created") {
          set.status = 201;
          return result;
        }

        if (result.kind === "no-english") {
          set.status = 422;
          return result;
        }

        set.status = FAILURE_STATUS[result.code];
        return result;
      },
      {
        body: Schema.toStandardSchemaV1(
          Schema.Struct({ writingSample: Schema.String })
        ),
      }
    )
    .get("/api/evaluations", ({ set }) => {
      if (!listEvaluations) {
        set.status = 503;
        return { code: "not-ready", error: "History is not available" };
      }
      return listEvaluations();
    })
    .get("/api/evaluations/:evaluationId", async ({ params, set }) => {
      if (!getEvaluation) {
        set.status = 503;
        return { code: "not-ready", error: "History is not available" };
      }
      const evaluation = await getEvaluation(params.evaluationId);
      if (evaluation === null) {
        set.status = 404;
        return { code: "not-found", error: "Evaluation not found" };
      }
      return evaluation;
    })
    .delete("/api/evaluations/:evaluationId", async ({ params, set }) => {
      if (!deleteEvaluation) {
        set.status = 503;
        return { code: "not-ready", error: "History is not available" };
      }
      await deleteEvaluation(params.evaluationId);
      set.status = 204;
    })
    .get("/api/progress", ({ query, set }) => {
      if (!getProgressSummary) {
        set.status = 503;
        return { code: "not-ready", error: "Progress is not available" };
      }
      const period = parsePeriod(query.period);
      if (period === null) {
        set.status = 400;
        return { code: "invalid-period", error: "Progress period is invalid" };
      }
      return getProgressSummary({ period });
    })
    .get("/api/progress/evidence", ({ query, set }) => {
      if (!getProgressEvidence) {
        set.status = 503;
        return { code: "not-ready", error: "Progress is not available" };
      }
      const period = parsePeriod(query.period);
      const selection = parseSelection(query);
      if (period === null || selection === null) {
        set.status = 400;
        return {
          code: "invalid-selection",
          error: "Progress selection is invalid",
        };
      }
      return getProgressEvidence({ period, selection });
    })
    .get("/api/setup", ({ set }) => {
      if (!setup) {
        set.status = 503;
        return { code: "not-ready", error: "Setup status is not available" };
      }
      return setup;
    });

  if (!serveWeb) {
    return app;
  }

  const root = path.resolve(webDistPath);
  const index = Bun.file(path.resolve(root, "index.html"));

  return app.get("/*", async ({ path: requestPath, set }) => {
    if (requestPath.startsWith("/api/")) {
      set.status = 404;
      return { error: "Not Found" };
    }

    const assetPath = path.resolve(root, `.${requestPath}`);
    const insideRoot = assetPath.startsWith(`${root}${path.sep}`);
    const asset = Bun.file(assetPath);

    if (
      insideRoot &&
      requestPath.startsWith("/assets/") &&
      (await asset.exists())
    ) {
      set.headers["cache-control"] = "public, max-age=31536000, immutable";
      return asset;
    }

    if (requestPath.startsWith("/assets/")) {
      set.status = 404;
      return "Not Found";
    }

    set.headers["cache-control"] = "no-cache";
    return index;
  });
};
