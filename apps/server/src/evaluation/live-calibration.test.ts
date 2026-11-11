import { describe, expect, it } from "bun:test";

import {
  validateCalibrationBudget,
  validateFixtureAssessment,
  validateFixtureSet,
} from "./live-calibration";
import {
  LIVE_CALIBRATION_FIXTURES,
  LIVE_CALIBRATION_REQUIREMENTS,
} from "./live-calibration-fixtures";
import { ERROR_CATEGORIES } from "./rubric-v1";

describe("live model calibration", () => {
  it("includes previous measured spend in the no-retry budget preflight", () => {
    expect(validateCalibrationBudget(0.565324)).toContain(
      "Calibration preflight exceeds the remaining approved budget"
    );
    expect(validateCalibrationBudget(2)).toContain(
      "Calibration preflight exceeds the remaining approved budget"
    );
    expect(validateCalibrationBudget(1.2)).toContain(
      "Calibration preflight exceeds the remaining approved budget"
    );
    expect(validateCalibrationBudget(Number.NaN)).toContain(
      "Previous calibration spend must be a finite non-negative number"
    );
  });

  it("freezes unique fixtures covering every live requirement, category, and severity", () => {
    const validation = validateFixtureSet(LIVE_CALIBRATION_FIXTURES);
    const categories = new Set(
      LIVE_CALIBRATION_FIXTURES.flatMap(({ expected }) =>
        expected.findings.map(({ category }) => category)
      )
    );
    const severities = new Set(
      LIVE_CALIBRATION_FIXTURES.flatMap(({ expected }) =>
        expected.findings.map(({ severity }) => severity)
      )
    );
    const requirements = new Set(
      LIVE_CALIBRATION_FIXTURES.flatMap(({ requirements: ids }) => ids)
    );

    expect(validation).toEqual([]);
    expect(categories).toEqual(new Set(ERROR_CATEGORIES));
    expect(severities).toEqual(new Set(["Minor", "Moderate", "Major"]));
    expect(requirements).toEqual(new Set(LIVE_CALIBRATION_REQUIREMENTS));
  });

  it("accepts the predeclared spelling outcome with exact UTF-8 byte offsets", () => {
    const fixture = LIVE_CALIBRATION_FIXTURES.find(
      ({ id }) => id === "spelling-minor-a"
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }
    const byteStart = Buffer.byteLength(
      fixture.writingSample.slice(0, fixture.writingSample.indexOf("tset")),
      "utf-8"
    );

    expect(
      validateFixtureAssessment(fixture, {
        findings: [
          {
            byteEnd: byteStart + Buffer.byteLength("tset", "utf-8"),
            byteStart,
            category: "Spelling",
            correction: "test",
            explanation: "The word is misspelled; the intended word is clear.",
            originalText: "tset",
            severity: "Minor",
          },
        ],
        nonEnglishSpans: [],
        suggestions: [],
        summary: "One local spelling error needs correction.",
      })
    ).toEqual([]);
  });

  it("rejects a changed category, unsafe span, or unexpected suggestion", () => {
    const fixture = LIVE_CALIBRATION_FIXTURES.find(
      ({ id }) => id === "spelling-minor-a"
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }

    const failures = validateFixtureAssessment(fixture, {
      findings: [
        {
          byteEnd: 4,
          byteStart: 0,
          category: "Other",
          correction: "test",
          explanation: "Changed contract.",
          originalText: "nope",
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [],
      suggestions: [
        {
          byteEnd: 6,
          byteStart: 0,
          explanation: "Optional rewrite.",
          originalText: "Review",
        },
      ],
      summary: "Changed assessment.",
    });

    expect(failures).toContain(
      "finding 1 category: expected Spelling, got Other"
    );
    expect(failures).toContain(
      'finding 1 span: bytes do not reproduce originalText "nope"'
    );
    expect(failures).toContain("suggestions: expected 0, got 1");
  });

  it("requires exact non-English bytes and any context suggestion to explain uncertainty", () => {
    const mixed = LIVE_CALIBRATION_FIXTURES.find(
      ({ id }) => id === "mixed-language"
    );
    const context = LIVE_CALIBRATION_FIXTURES.find(
      ({ id }) => id === "context-dependent-alternative"
    );
    expect(mixed).toBeDefined();
    expect(context).toBeDefined();
    if (mixed === undefined || context === undefined) {
      return;
    }

    expect(
      validateFixtureAssessment(mixed, {
        findings: [],
        nonEnglishSpans: [],
        suggestions: [],
        summary: "No errors.",
      })
    ).toContain("non-English spans: expected 1, got 0");

    const mayStart = context.writingSample.indexOf("fast");
    expect(
      validateFixtureAssessment(context, {
        findings: [],
        nonEnglishSpans: [],
        suggestions: [
          {
            alternative: "quick",
            byteEnd: mayStart + 4,
            byteStart: mayStart,
            explanation: "Quick is clearer.",
            originalText: "fast",
          },
        ],
        summary: "One optional alternative.",
      })
    ).toContain(
      "suggestion 1 explanation: must say the original is not confirmed wrong"
    );
  });
});
