import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createApp } from "./app";

let webDistPath = "";

const rejectUnexpectedEvaluation = () =>
  Promise.reject(new Error("must not be called"));

beforeAll(async () => {
  webDistPath = await mkdtemp(path.join(tmpdir(), "prompt-evolution-web-"));
  await mkdir(path.join(webDistPath, "assets"));
  await writeFile(
    path.join(webDistPath, "index.html"),
    "<main>Prompt Evolution</main>"
  );
  await writeFile(path.join(webDistPath, "assets", "app-123.js"), "export {};");
});

afterAll(async () => {
  await rm(webDistPath, { force: true, recursive: true });
});

describe("production HTTP application", () => {
  it("keeps the real HTTP connection open beyond the provider request deadline", () => {
    const app = createApp({ serveWeb: false, webDistPath });

    expect(app.config.serve?.idleTimeout).toBe(120);
  });

  it("serves retained History, Progress, deletion, and setup through same-origin API", async () => {
    const deleted: string[] = [];
    const app = createApp({
      deleteEvaluation: (id) => {
        deleted.push(id);
        return Promise.resolve();
      },
      getEvaluation: (id) =>
        Promise.resolve(id === "kept" ? { id: "kept" } : null),
      getProgressEvidence: ({ period, selection }) =>
        Promise.resolve({
          evaluations: [],
          findings: [],
          period,
          rubricVersion: "1",
          selection,
        }),
      getProgressSummary: ({ period }) =>
        Promise.resolve({
          evaluationCount: 0,
          incompatibleSegments: [],
          period,
          rubricVersion: "1",
        }),
      listEvaluations: () => Promise.resolve([{ id: "kept" }]),
      serveWeb: false,
      setup: {
        configured: false,
        dataLocation: "/data/local.db",
        model: "openai/gpt-5.6-terra",
        provider: "OpenRouter",
        rubricVersion: "1",
      },
      webDistPath,
    });

    const historyResponse = await app.handle(
      new Request("http://localhost/api/evaluations")
    );
    expect(historyResponse.headers.get("cache-control")).toBe("no-store");
    expect(await historyResponse.json()).toEqual([{ id: "kept" }]);
    const detailResponse = await app.handle(
      new Request("http://localhost/api/evaluations/kept")
    );
    expect(await detailResponse.json()).toEqual({ id: "kept" });
    const missingResponse = await app.handle(
      new Request("http://localhost/api/evaluations/missing")
    );
    expect(missingResponse.status).toBe(404);
    const deletionResponse = await app.handle(
      new Request("http://localhost/api/evaluations/delete", {
        method: "DELETE",
      })
    );
    expect(deletionResponse.status).toBe(204);
    expect(deleted).toEqual(["delete"]);
    const progressResponse = await app.handle(
      new Request("http://localhost/api/progress?period=7-days")
    );
    expect(await progressResponse.json()).toMatchObject({ period: "7-days" });
    const evidenceResponse = await app.handle(
      new Request(
        "http://localhost/api/progress/evidence?period=all&insight=average-score"
      )
    );
    expect(await evidenceResponse.json()).toMatchObject({
      selection: { kind: "average-score" },
    });
    const setupResponse = await app.handle(
      new Request("http://localhost/api/setup")
    );
    expect(await setupResponse.json()).toMatchObject({
      configured: false,
      provider: "OpenRouter",
    });
  });

  it("rejects malformed JSON without echoing private input", async () => {
    const app = createApp({ serveWeb: false, webDistPath });
    const response = await app.handle(
      new Request("http://localhost/api/evaluations", {
        body: JSON.stringify({
          writingSample: { private: "private-sample-sentinel" },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private-sample-sentinel");
  });

  it("maps unexpected failures to a safe internal error", async () => {
    const app = createApp({
      listEvaluations: () => Promise.reject(new Error("private-db-cause")),
      serveWeb: false,
      webDistPath,
    });
    const response = await app.handle(
      new Request("http://localhost/api/evaluations")
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "internal-error",
      error: "Request could not be completed",
    });
  });

  it("rejects declared oversized request bodies before evaluation", async () => {
    const app = createApp({
      evaluateWriting: rejectUnexpectedEvaluation,
      serveWeb: false,
      webDistPath,
    });
    const response = await app.handle(
      new Request("http://localhost/api/evaluations", {
        body: JSON.stringify({ writingSample: "Private writing." }),
        headers: {
          "content-length": String(256 * 1024 + 1),
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain("Private writing.");
  });
  it("rejects remote hosts and cross-origin writes before evaluating", async () => {
    const app = createApp({ serveWeb: false, webDistPath });
    const remote = await app.handle(
      new Request("http://attacker.example/api/health")
    );
    expect(remote.status).toBe(403);
    const crossOrigin = await app.handle(
      new Request("http://localhost/api/evaluations", {
        body: JSON.stringify({ writingSample: "Private writing." }),
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        method: "POST",
      })
    );
    expect(crossOrigin.status).toBe(403);
    expect(await crossOrigin.text()).not.toContain("Private writing.");
  });

  it("submits one exact Writing Sample through the Evaluation boundary", async () => {
    const samples: string[] = [];
    const app = createApp({
      evaluateWriting: (writingSample) => {
        samples.push(writingSample);
        return Promise.resolve({
          evaluation: {
            band: "Natural",
            correctedText: writingSample,
            evaluatedAt: "2026-09-07T12:00:00.000Z",
            evaluatedEnglishWordCount: 2,
            findings: [],
            id: "evaluation-1",
            model: "test-model",
            originalText: writingSample,
            provider: "test",
            rubricVersion: "1",
            score: 100,
            suggestions: [],
            summary: "Clear writing.",
          },
          kind: "created" as const,
        });
      },
      serveWeb: false,
      webDistPath,
    });
    const response = await app.handle(
      new Request("http://localhost/api/evaluations", {
        body: JSON.stringify({ writingSample: "  Exact sample.\n" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );

    expect(response.status).toBe(201);
    expect(samples).toEqual(["  Exact sample.\n"]);
    expect(await response.json()).toMatchObject({
      evaluation: { id: "evaluation-1" },
      kind: "created",
    });
  });

  it("maps typed evaluation failures without exposing private causes", async () => {
    const results = [
      { expectedStatus: 422, result: { kind: "no-english" as const } },
      {
        expectedStatus: 504,
        result: {
          code: "provider-timeout" as const,
          kind: "failure" as const,
          retryable: true,
        },
      },
      {
        expectedStatus: 429,
        result: {
          code: "provider-rate-limited" as const,
          kind: "failure" as const,
          retryable: true,
        },
      },
      {
        expectedStatus: 503,
        result: {
          code: "provider-credits-exhausted" as const,
          kind: "failure" as const,
          retryable: false,
        },
      },
      {
        expectedStatus: 502,
        result: {
          code: "provider-output-incomplete" as const,
          kind: "failure" as const,
          retryable: true,
        },
      },
      {
        expectedStatus: 503,
        result: {
          code: "configuration-missing" as const,
          kind: "failure" as const,
          retryable: false,
        },
      },
      {
        expectedStatus: 400,
        result: {
          code: "invalid-writing-sample" as const,
          kind: "failure" as const,
          retryable: false,
        },
      },
      {
        expectedStatus: 502,
        result: {
          code: "invalid-assessment" as const,
          kind: "failure" as const,
          retryable: true,
        },
      },
      {
        expectedStatus: 500,
        result: {
          code: "persistence-failure" as const,
          kind: "failure" as const,
          retryable: true,
        },
      },
      {
        expectedStatus: 503,
        result: {
          code: "provider-unavailable" as const,
          kind: "failure" as const,
          retryable: true,
        },
      },
      {
        expectedStatus: 502,
        result: {
          code: "provider-rejected" as const,
          kind: "failure" as const,
          retryable: true,
        },
      },
    ];

    await Promise.all(
      results.map(async ({ expectedStatus, result }) => {
        const app = createApp({
          evaluateWriting: () => Promise.resolve(result),
          serveWeb: false,
          webDistPath,
        });
        const response = await app.handle(
          new Request("http://localhost/api/evaluations", {
            body: JSON.stringify({ writingSample: "private-sample-sentinel" }),
            headers: { "content-type": "application/json" },
            method: "POST",
          })
        );

        expect(response.status).toBe(expectedStatus);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).not.toContain("private-sample-sentinel");
      })
    );
  });

  it("logs evaluation outcomes with correlation metadata but no Writing Sample", async () => {
    const events: unknown[] = [];
    const app = createApp({
      evaluateWriting: () => Promise.resolve({ kind: "no-english" }),
      logEvaluation: (event) => {
        events.push(event);
      },
      serveWeb: false,
      webDistPath,
    });
    const response = await app.handle(
      new Request("http://localhost/api/evaluations", {
        body: JSON.stringify({ writingSample: "private-writing-sentinel" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );

    expect(response.headers.get("x-correlation-id")).toMatch(
      /^[0-9a-f-]{36}$/u
    );
    expect(events).toEqual([
      expect.objectContaining({
        code: "no-english",
        correlationId: response.headers.get("x-correlation-id"),
        maxOutputTokens: 6_000,
        model: "unconfigured",
        provider: "unconfigured",
        requestTimeoutMilliseconds: 90_000,
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("private-writing-sentinel");
  });

  it("keeps API routes ahead of browser fallback", async () => {
    const app = await createApp({ serveWeb: true, webDistPath });
    const response = await app.handle(
      new Request("http://localhost/api/health")
    );
    const missingResponse = await app.handle(
      new Request("http://localhost/api/missing")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.headers.get("content-type")).toContain(
      "application/json"
    );
  });

  it("serves static assets with immutable caching", async () => {
    const app = await createApp({ serveWeb: true, webDistPath });
    const response = await app.handle(
      new Request("http://localhost/assets/app-123.js")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(await response.text()).toBe("export {};");
  });

  it("falls back to uncached index.html for direct browser routes", async () => {
    const app = await createApp({ serveWeb: true, webDistPath });
    const response = await app.handle(
      new Request("http://localhost/evaluations/evaluation-1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toContain("Prompt Evolution");
  });
});
