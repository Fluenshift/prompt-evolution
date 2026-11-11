import { describe, expect, test } from "vitest";

import type {
  Evaluation,
  ProgressEvidence,
  ProgressSummary,
} from "./evaluation-client";
import {
  EvaluationRequestError,
  createHttpEvaluationClient,
} from "./http-evaluation-client";

const retainedEvaluation: Evaluation = {
  band: "Natural",
  correctedText: "  Explain this code.\n",
  evaluatedAt: "2026-09-07T12:00:00.000Z",
  evaluatedEnglishWordCount: 3,
  findings: [],
  id: "retained-evaluation",
  model: "openai/gpt-5.6-terra",
  originalText: "  Explain this code.\n",
  provider: "OpenRouter",
  rubricVersion: "1",
  score: 100,
  suggestions: [],
  summary: "No errors found.",
};

const progressSummary: ProgressSummary = {
  averageBand: "Natural",
  averageScore: 100,
  categoryDistributions: [],
  categoryRecurrences: [],
  evaluatedEnglishWordCount: 3,
  evaluationCount: 1,
  findingCount: 0,
  findingRate: 0,
  incompatibleSegments: [],
  period: "30-days",
  recurringCorrections: [],
  rubricVersion: "1",
};

describe("HTTP Evaluation client", () => {
  test("maps a deleted or unknown Evaluation to missing", async () => {
    const client = createHttpEvaluationClient({
      fetch: () =>
        Promise.resolve(
          Response.json(
            { code: "NOT_FOUND", error: "Evaluation not found" },
            { status: 404 }
          )
        ),
    });

    expect(await client.getEvaluation("deleted")).toBeNull();
  });
  test("opens a retained Evaluation using an encoded identity", async () => {
    const client = createHttpEvaluationClient({
      fetch: (input) => {
        expect(input).toBe("/api/evaluations/a%2Fb%20%3F");
        return Promise.resolve(Response.json(retainedEvaluation));
      },
    });

    expect(await client.getEvaluation("a/b ?")).toEqual(retainedEvaluation);
  });
  test("submits exact writing and receives its durable Evaluation", async () => {
    const client = createHttpEvaluationClient({
      fetch: async (input, init) => {
        const request = new Request(
          new URL(String(input), "http://localhost"),
          init
        );
        expect(new URL(request.url).pathname).toBe("/api/evaluations");
        expect(request.method).toBe("POST");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(await request.json()).toEqual({
          writingSample: "  Explain this code.\n",
        });
        return Response.json(
          { evaluation: retainedEvaluation, kind: "created" },
          { status: 201 }
        );
      },
    });

    expect(await client.evaluateWriting("  Explain this code.\n")).toEqual({
      evaluation: retainedEvaluation,
      kind: "created",
    });
  });
  test("reads retained history from the same-origin API", async () => {
    const client = createHttpEvaluationClient({
      fetch: (input) => {
        expect(input).toBe("/api/evaluations");
        return Promise.resolve(
          Response.json([
            {
              band: "Clear",
              evaluatedAt: "2026-09-07T12:00:00.000Z",
              id: "retained-evaluation",
              rubricVersion: "1",
              score: 80,
              summary: "One article correction.",
            },
          ])
        );
      },
    });

    expect(await client.listEvaluations()).toEqual([
      {
        band: "Clear",
        evaluatedAt: "2026-09-07T12:00:00.000Z",
        id: "retained-evaluation",
        rubricVersion: "1",
        score: 80,
        summary: "One article correction.",
      },
    ]);
  });

  test("deletes exactly one encoded Evaluation identity", async () => {
    const client = createHttpEvaluationClient({
      fetch: (input, init) => {
        expect(input).toBe("/api/evaluations/a%2Fb");
        expect(init?.method).toBe("DELETE");
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    await expect(client.deleteEvaluation("a/b")).resolves.toBeUndefined();
  });

  test("loads Progress and encoded source evidence", async () => {
    const evidence: ProgressEvidence = {
      evaluations: [],
      findings: [],
      period: "all",
      rubricVersion: "1",
      selection: {
        correction: "does",
        kind: "correction",
        originalText: "do this?",
      },
    };
    const client = createHttpEvaluationClient({
      fetch: (input) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/progress") {
          expect(url.searchParams.get("period")).toBe("30-days");
          return Promise.resolve(Response.json(progressSummary));
        }
        expect(url.pathname).toBe("/api/progress/evidence");
        expect(Object.fromEntries(url.searchParams)).toEqual({
          correction: "does",
          insight: "correction",
          originalText: "do this?",
          period: "all",
        });
        return Promise.resolve(Response.json(evidence));
      },
    });

    expect(await client.getProgressSummary({ period: "30-days" })).toEqual(
      progressSummary
    );
    expect(
      await client.getProgressEvidence({
        period: "all",
        selection: {
          correction: "does",
          kind: "correction",
          originalText: "do this?",
        },
      })
    ).toEqual(evidence);
  });

  test("preserves the no-English result returned with validation status", async () => {
    const client = createHttpEvaluationClient({
      fetch: () =>
        Promise.resolve(Response.json({ kind: "no-english" }, { status: 422 })),
    });

    expect(await client.evaluateWriting("Não há inglês.")).toEqual({
      kind: "no-english",
    });
  });

  test("raises safe typed errors for failed API operations", async () => {
    const client = createHttpEvaluationClient({
      fetch: () =>
        Promise.resolve(
          Response.json(
            {
              code: "provider-unavailable",
              error: "private-provider-cause",
              kind: "failure",
              retryable: true,
            },
            { status: 503 }
          )
        ),
    });

    const failure = await client
      .evaluateWriting("Private sample")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EvaluationRequestError);
    expect(failure).toMatchObject({
      code: "provider-unavailable",
      retryable: true,
      status: 503,
    });
    expect(String(failure)).not.toContain("private-provider-cause");
  });

  test("loads accurate server-side setup status", async () => {
    const status = {
      configured: true,
      dataLocation: "/data/local.db",
      model: "openai/gpt-5.6-terra",
      provider: "OpenRouter",
      rubricVersion: "1",
    };
    const client = createHttpEvaluationClient({
      fetch: (input) => {
        expect(input).toBe("/api/setup");
        return Promise.resolve(Response.json(status));
      },
    });

    expect(await client.getSetupStatus()).toEqual(status);
  });
});
