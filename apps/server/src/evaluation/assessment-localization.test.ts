import { describe, expect, it } from "bun:test";

import { Effect } from "effect";

import { localizeModelAssessment } from "./assessment-localization";
import type { AssessmentFinding, ModelAssessment } from "./evaluation-model";
import { applyCorrections } from "./rubric-v1";

const assessmentFor = (
  findings: readonly AssessmentFinding[]
): ModelAssessment => ({
  findings,
  nonEnglishSpans: [],
  suggestions: [],
  summary: "Synthetic localization fixture.",
});

const findingFor = (
  originalText: string,
  correction: string,
  byteStart = 0
): AssessmentFinding => ({
  byteEnd: byteStart + Buffer.byteLength(originalText, "utf-8"),
  byteStart,
  category: "Verb form/tense",
  correction,
  explanation: "Synthetic correction.",
  originalText,
  severity: "Minor",
});

describe("deterministic assessment localization", () => {
  it("canonicalizes equivalent wider edits without changing corrected bytes", async () => {
    const sample = "The client did a request. The command fail.";
    const findings = [
      findingFor("did a ", "made a ", sample.indexOf("did a ")),
      findingFor(
        "command fail",
        "command fails",
        sample.indexOf("command fail")
      ),
    ];
    const localized = localizeModelAssessment(sample, assessmentFor(findings));

    expect(
      localized.findings.map(({ originalText, correction }) => ({
        correction,
        originalText,
      }))
    ).toEqual([
      { correction: "made", originalText: "did" },
      { correction: "fails", originalText: "fail" },
    ]);
    expect(
      await Effect.runPromise(applyCorrections(sample, localized.findings))
    ).toBe(await Effect.runPromise(applyCorrections(sample, findings)));
  });

  it("expands partial words while preserving the exact edit, including UTF-8", async () => {
    const sample = "the café is open.";
    const findings = [
      findingFor("t", "T"),
      findingFor("é", "e", Buffer.byteLength("the caf", "utf-8")),
    ];
    const localized = localizeModelAssessment(sample, assessmentFor(findings));

    expect(
      localized.findings.map(({ originalText, correction }) => ({
        correction,
        originalText,
      }))
    ).toEqual([
      { correction: "The", originalText: "the" },
      { correction: "cafe", originalText: "café" },
    ]);
    expect(
      await Effect.runPromise(applyCorrections(sample, localized.findings))
    ).toBe("The cafe is open.");
  });

  it("safely localizes one unique adjacent duplicate as a whole phrase", async () => {
    const sample = "The service restarted automatically automatically.";
    const duplicate = {
      ...findingFor("automatically", "", 1),
      category: "Other" as const,
    };
    const localized = localizeModelAssessment(
      sample,
      assessmentFor([duplicate])
    );

    expect(localized.findings[0]).toMatchObject({
      category: "Other",
      correction: "automatically",
      originalText: "automatically automatically",
      severity: "Minor",
    });
    expect(
      await Effect.runPromise(applyCorrections(sample, localized.findings))
    ).toBe("The service restarted automatically.");
  });

  it("does not guess an ambiguous occurrence or manufacture absent source text", () => {
    const ambiguous = findingFor("fail", "fails", 1);
    const absent = findingFor("missing", "present", 0);
    const sample = "They fail. We fail.";

    expect(
      localizeModelAssessment(sample, assessmentFor([ambiguous, absent]))
        .findings
    ).toEqual([ambiguous, absent]);
  });

  it("does not repair separate duplicates or make a no-op valid", () => {
    const sample =
      "The service restarted automatically. It stopped automatically.";
    const duplicate = {
      ...findingFor("automatically", "", 1),
      category: "Other" as const,
    };
    const noOp = findingFor("service", "service", sample.indexOf("service"));

    expect(
      localizeModelAssessment(sample, assessmentFor([duplicate, noOp])).findings
    ).toEqual([duplicate, noOp]);
  });

  it("never relocates a valid edit to an unrelated adjacent duplicate", () => {
    const sample = "Delete foo. Keep foo foo.";
    const finding = {
      ...findingFor("foo", "", 7),
      category: "Other" as const,
    };

    expect(
      localizeModelAssessment(sample, assessmentFor([finding])).findings
    ).toEqual([finding]);
  });

  it("does not coalesce partial hyphenated, apostrophized, or combining-mark words", () => {
    const finding = {
      ...findingFor("foo", "", 1),
      category: "Other" as const,
    };

    for (const sample of [
      "Use foo foo-bar.",
      "Use foo foo's.",
      "Use foo foo\u0301.",
    ]) {
      expect(
        localizeModelAssessment(sample, assessmentFor([finding])).findings
      ).toEqual([finding]);
    }
  });

  it("requires both complete-word occurrences to form the adjacent pair", () => {
    const sample = "Use bar-foo foo. Keep foo.";
    const finding = {
      ...findingFor("foo", "", 1),
      category: "Other" as const,
    };

    expect(
      localizeModelAssessment(sample, assessmentFor([finding])).findings
    ).toEqual([finding]);
  });

  it("never coalesces part of an alphanumeric or underscore token", () => {
    const finding = {
      ...findingFor("foo", "", 1),
      category: "Other" as const,
    };

    for (const sample of [
      "Use foo foo2.",
      "Use 2foo foo.",
      "Use foo foo_bar.",
    ]) {
      expect(
        localizeModelAssessment(sample, assessmentFor([finding])).findings
      ).toEqual([finding]);
    }
  });
});
