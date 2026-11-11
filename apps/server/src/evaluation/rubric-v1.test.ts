import { describe, expect, it } from "bun:test";

import { Effect, Exit } from "effect";

import {
  applyCorrections,
  countEnglishWords,
  proficiencyBandForScore,
  scoreEvaluation,
} from "./rubric-v1";

describe("Rubric Version 1", () => {
  it("counts letter words while keeping internal apostrophes and hyphens", () => {
    expect(countEnglishWords("Don't re-run naïve APIs: 42 ✅")).toBe(4);
    expect(countEnglishWords("中文 Русский")).toBe(2);
  });

  it("matches approved score anchors and band boundaries", () => {
    expect(scoreEvaluation(9, [])).toBe(100);
    expect(scoreEvaluation(9, ["Minor"])).toBe(85);
    expect(scoreEvaluation(9, ["Minor", "Minor"])).toBe(70);
    expect(scoreEvaluation(9, ["Moderate"])).toBe(65);
    expect(scoreEvaluation(9, ["Major"])).toBe(40);
    expect(scoreEvaluation(40, ["Moderate"])).toBe(83);
    expect(proficiencyBandForScore(49)).toBe("Needs revision");
    expect(proficiencyBandForScore(50)).toBe("Understandable");
    expect(proficiencyBandForScore(70)).toBe("Clear");
    expect(proficiencyBandForScore(85)).toBe("Natural");
  });

  it("applies non-overlapping corrections using UTF-8 byte offsets", async () => {
    const original = "Olá, command fail twice.";
    const corrected = await Effect.runPromise(
      applyCorrections(original, [
        {
          byteEnd: 18,
          byteStart: 14,
          correction: "fails",
          originalText: "fail",
        },
      ])
    );

    expect(corrected).toBe("Olá, command fails twice.");
  });

  it("rejects mismatched and overlapping correction spans", async () => {
    const outcome = await Effect.runPromiseExit(
      applyCorrections("file are missing", [
        {
          byteEnd: 8,
          byteStart: 5,
          correction: "is",
          originalText: "are",
        },
        {
          byteEnd: 12,
          byteStart: 7,
          correction: "exists",
          originalText: "e mis",
        },
      ])
    );

    expect(Exit.isFailure(outcome)).toBeTrue();
  });

  it("rejects correction offsets that split a UTF-8 code point", async () => {
    const outcome = await Effect.runPromiseExit(
      applyCorrections("é is valid", [
        {
          byteEnd: 1,
          byteStart: 0,
          correction: "e",
          originalText: "�",
        },
      ])
    );

    expect(Exit.isFailure(outcome)).toBeTrue();
  });
});
