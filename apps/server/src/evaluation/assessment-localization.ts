import type {
  AssessmentFinding,
  AssessmentSpan,
  ModelAssessment,
} from "./evaluation-model";
import { isUtf8ByteBoundary } from "./utf8";

const WORD_PATTERN = /\p{L}[\p{L}\p{M}'’\-‑]*/gu;

const spanMatchesSource = (source: Buffer, span: AssessmentSpan) =>
  span.byteStart >= 0 &&
  span.byteEnd > span.byteStart &&
  span.byteEnd <= source.byteLength &&
  isUtf8ByteBoundary(source, span.byteStart) &&
  isUtf8ByteBoundary(source, span.byteEnd) &&
  source.subarray(span.byteStart, span.byteEnd).toString("utf-8") ===
    span.originalText;

const uniqueOccurrence = (source: Buffer, originalText: string) => {
  const target = Buffer.from(originalText, "utf-8");
  const first = source.indexOf(target);
  if (
    target.byteLength === 0 ||
    first === -1 ||
    source.includes(target, first + 1)
  ) {
    return;
  }
  return { byteEnd: first + target.byteLength, byteStart: first };
};

const reanchorUniqueSpan = <Span extends AssessmentSpan>(
  source: Buffer,
  span: Span
): Span => {
  if (spanMatchesSource(source, span)) {
    return span;
  }
  const occurrence = uniqueOccurrence(source, span.originalText);
  return occurrence === undefined ? span : { ...span, ...occurrence };
};

const coalesceAdjacentDuplicate = (
  source: Buffer,
  finding: AssessmentFinding
) => {
  if (
    finding.category !== "Other" ||
    finding.correction !== "" ||
    !/^\p{L}[\p{L}\p{M}]*$/u.test(finding.originalText)
  ) {
    return;
  }
  const repeatedText = `${finding.originalText} ${finding.originalText}`;
  const occurrence = uniqueOccurrence(source, repeatedText);
  if (occurrence === undefined) {
    return;
  }
  const before = source.subarray(0, occurrence.byteStart).toString("utf-8");
  const after = source.subarray(occurrence.byteEnd).toString("utf-8");
  if (
    /[\p{L}\p{M}\p{N}_'’\-‑]$/u.test(before) ||
    /^[\p{L}\p{M}\p{N}_'’\-‑]/u.test(after)
  ) {
    return;
  }
  if (
    spanMatchesSource(source, finding) &&
    (finding.byteStart < occurrence.byteStart ||
      finding.byteEnd > occurrence.byteEnd)
  ) {
    return;
  }
  const text = source.toString("utf-8");
  const completeOccurrences = [...text.matchAll(WORD_PATTERN)].filter(
    (word) => word[0] === finding.originalText
  );
  const [firstWord, secondWord] = completeOccurrences;
  if (
    completeOccurrences.length !== 2 ||
    firstWord === undefined ||
    secondWord === undefined ||
    Buffer.byteLength(text.slice(0, firstWord.index), "utf-8") !==
      occurrence.byteStart ||
    Buffer.byteLength(text.slice(0, secondWord.index), "utf-8") !==
      occurrence.byteStart +
        Buffer.byteLength(`${finding.originalText} `, "utf-8")
  ) {
    return;
  }
  return {
    ...finding,
    ...occurrence,
    correction: finding.originalText,
    originalText: repeatedText,
  };
};

const expandPartialWords = (
  source: Buffer,
  finding: AssessmentFinding
): AssessmentFinding => {
  const text = source.toString("utf-8");
  const originalStart = source
    .subarray(0, finding.byteStart)
    .toString("utf-8").length;
  const originalEnd = source
    .subarray(0, finding.byteEnd)
    .toString("utf-8").length;
  let start = originalStart;
  let end = originalEnd;
  for (const word of text.matchAll(WORD_PATTERN)) {
    const wordEnd = word.index + word[0].length;
    if (word.index < originalStart && originalStart < wordEnd) {
      start = word.index;
    }
    if (word.index < originalEnd && originalEnd < wordEnd) {
      end = wordEnd;
    }
  }
  return {
    ...finding,
    byteEnd: Buffer.byteLength(text.slice(0, end), "utf-8"),
    byteStart: Buffer.byteLength(text.slice(0, start), "utf-8"),
    correction:
      text.slice(start, originalStart) +
      finding.correction +
      text.slice(originalEnd, end),
    originalText: text.slice(start, end),
  };
};

const commonPrefix = (left: string, right: string) => {
  let length = 0;
  while (length < left.length && left[length] === right[length]) {
    length += 1;
  }
  return left.slice(0, length);
};

const commonSuffix = (left: string, right: string) => {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - length - 1] === right[right.length - length - 1]
  ) {
    length += 1;
  }
  return length === 0 ? "" : left.slice(-length);
};

const trimUnchangedWordContext = (
  finding: AssessmentFinding
): AssessmentFinding => {
  const prefix =
    commonPrefix(finding.originalText, finding.correction).match(
      /^.*\s/su
    )?.[0] ?? "";
  const originalAfterPrefix = finding.originalText.slice(prefix.length);
  const correctionAfterPrefix = finding.correction.slice(prefix.length);
  const suffix =
    commonSuffix(originalAfterPrefix, correctionAfterPrefix).match(
      /\s.*$/su
    )?.[0] ?? "";
  const originalText = originalAfterPrefix.slice(
    0,
    originalAfterPrefix.length - suffix.length
  );
  if (originalText.length === 0) {
    return finding;
  }
  return {
    ...finding,
    byteEnd: finding.byteEnd - Buffer.byteLength(suffix, "utf-8"),
    byteStart: finding.byteStart + Buffer.byteLength(prefix, "utf-8"),
    correction: correctionAfterPrefix.slice(
      0,
      correctionAfterPrefix.length - suffix.length
    ),
    originalText,
  };
};

const localizeFinding = (source: Buffer, finding: AssessmentFinding) => {
  const anchored =
    coalesceAdjacentDuplicate(source, finding) ??
    reanchorUniqueSpan(source, finding);
  if (
    !spanMatchesSource(source, anchored) ||
    anchored.correction === anchored.originalText
  ) {
    return anchored;
  }
  return trimUnchangedWordContext(expandPartialWords(source, anchored));
};

/** Localize source bytes without changing model-authored linguistic judgments. */
export const localizeModelAssessment = (
  writingSample: string,
  assessment: ModelAssessment
): ModelAssessment => {
  const source = Buffer.from(writingSample, "utf-8");
  return {
    ...assessment,
    findings: assessment.findings.map((finding) =>
      localizeFinding(source, finding)
    ),
    nonEnglishSpans: assessment.nonEnglishSpans.map((span) =>
      reanchorUniqueSpan(source, span)
    ),
    suggestions: assessment.suggestions.map((span) =>
      reanchorUniqueSpan(source, span)
    ),
  };
};
