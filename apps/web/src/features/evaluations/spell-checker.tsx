import { Button } from "@english-prompt-evaluation/ui/components/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@english-prompt-evaluation/ui/components/popover";
import { cn } from "@english-prompt-evaluation/ui/lib/utils";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";
import * as React from "react";

import type {
  EvaluationFinding,
  EvaluationSuggestion,
} from "@/features/evaluations/evaluation-client";

export interface TextMark {
  end: number;
  finding?: EvaluationFinding;
  id: string;
  index: number;
  kind: "finding" | "suggestion";
  originalText: string;
  start: number;
  suggestion?: EvaluationSuggestion;
}

export interface SpellCheckerProps {
  activeMarkId?: string | null;
  className?: string;
  containerClassName?: string;
  findings?: readonly EvaluationFinding[];
  onAccept?: (mark: TextMark) => void;
  onAcceptAll?: () => void;
  onActiveMarkChange?: (id: string | null) => void;
  onDismiss?: (mark: TextMark) => void;
  readOnly?: boolean;
  suggestions?: readonly EvaluationSuggestion[];
  text: string;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/** Convert UTF-8 byte offsets to JS character offsets if they match the expected text. */
const byteRangeToCharRange = (
  text: string,
  bytes: Uint8Array,
  byteStart?: number,
  byteEnd?: number,
  expected?: string
): { end: number; start: number } | null => {
  if (
    byteStart === undefined ||
    byteEnd === undefined ||
    byteStart < 0 ||
    byteEnd > bytes.length ||
    byteStart >= byteEnd
  ) {
    return null;
  }
  const slice = bytes.subarray(byteStart, byteEnd);
  const decoded = utf8Decoder.decode(slice);
  if (expected !== undefined && decoded !== expected) {
    return null;
  }
  const charStart = utf8Decoder.decode(bytes.subarray(0, byteStart)).length;
  return { end: charStart + decoded.length, start: charStart };
};

export const buildTextSpans = (
  text: string,
  findings: readonly EvaluationFinding[] = [],
  suggestions: readonly EvaluationSuggestion[] = []
): TextMark[] => {
  const marks: TextMark[] = [];
  const bytes = utf8Encoder.encode(text);

  const isOccupied = (start: number, end: number) =>
    marks.some((m) => start < m.end && end > m.start);

  let searchCursor = 0;

  // Process findings first (demonstrable errors take precedence)
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    let range = byteRangeToCharRange(
      text,
      bytes,
      finding.byteStart,
      finding.byteEnd,
      finding.originalText
    );

    if (!range || isOccupied(range.start, range.end)) {
      let idx = text.indexOf(finding.originalText, searchCursor);
      if (idx === -1) {
        idx = text.indexOf(finding.originalText, 0);
      }
      if (idx !== -1 && !isOccupied(idx, idx + finding.originalText.length)) {
        range = { end: idx + finding.originalText.length, start: idx };
        searchCursor = range.end;
      }
    }

    if (range) {
      marks.push({
        end: range.end,
        finding,
        id: `finding-${i}`,
        index: marks.length,
        kind: "finding",
        originalText: finding.originalText,
        start: range.start,
      });
    }
  }

  // Process suggestions
  searchCursor = 0;
  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];
    let range = byteRangeToCharRange(
      text,
      bytes,
      suggestion.byteStart,
      suggestion.byteEnd,
      suggestion.originalText
    );

    if (!range || isOccupied(range.start, range.end)) {
      let idx = text.indexOf(suggestion.originalText, searchCursor);
      if (idx === -1) {
        idx = text.indexOf(suggestion.originalText, 0);
      }
      if (
        idx !== -1 &&
        !isOccupied(idx, idx + suggestion.originalText.length)
      ) {
        range = { end: idx + suggestion.originalText.length, start: idx };
        searchCursor = range.end;
      }
    }

    if (range) {
      marks.push({
        end: range.end,
        id: `suggestion-${i}`,
        index: marks.length,
        kind: "suggestion",
        originalText: suggestion.originalText,
        start: range.start,
        suggestion,
      });
    }
  }

  // Sort by start position
  return marks.sort((a, b) => a.start - b.start);
};

type TextSegment =
  | { kind: "mark"; mark: TextMark; text: string }
  | { kind: "text"; text: string };

const buildSegments = (text: string, marks: readonly TextMark[]): TextSegment[] => {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const mark of marks) {
    if (mark.start > cursor) {
      segments.push({
        kind: "text",
        text: text.slice(cursor, mark.start),
      });
    }
    segments.push({
      kind: "mark",
      mark,
      text: text.slice(mark.start, mark.end),
    });
    cursor = mark.end;
  }

  if (cursor < text.length) {
    segments.push({
      kind: "text",
      text: text.slice(cursor),
    });
  }

  return segments;
};

export const SpellChecker = ({
  activeMarkId: controlledActiveId,
  className,
  containerClassName,
  findings = [],
  onAccept,
  onAcceptAll,
  onActiveMarkChange,
  onDismiss,
  readOnly = false,
  suggestions = [],
  text,
}: SpellCheckerProps) => {
  const [internalActiveId, setInternalActiveId] = React.useState<string | null>(
    null
  );
  const activeId =
    controlledActiveId !== undefined ? controlledActiveId : internalActiveId;

  const setActiveId = React.useCallback(
    (id: string | null) => {
      setInternalActiveId(id);
      onActiveMarkChange?.(id);
    },
    [onActiveMarkChange]
  );

  const marks = React.useMemo(
    () => buildTextSpans(text, findings, suggestions),
    [text, findings, suggestions]
  );

  const segments = React.useMemo(
    () => buildSegments(text, marks),
    [text, marks]
  );

  const activeMarkIndex = marks.findIndex((m) => m.id === activeId);

  const handleNavigate = React.useCallback(
    (direction: -1 | 1) => {
      if (marks.length === 0) return;
      if (activeMarkIndex === -1) {
        setActiveId(direction === 1 ? marks[0].id : marks[marks.length - 1].id);
        return;
      }
      const nextIndex =
        (activeMarkIndex + direction + marks.length) % marks.length;
      setActiveId(marks[nextIndex].id);
    },
    [activeMarkIndex, marks, setActiveId]
  );

  const findingCount = marks.filter((m) => m.kind === "finding").length;
  const suggestionCount = marks.filter((m) => m.kind === "suggestion").length;
  const totalIssues = marks.length;

  return (
    <div
      className={cn(
        "bg-background/90 flex flex-col rounded-xl border shadow-xs transition-all",
        containerClassName
      )}
      data-slot="spell-checker"
    >
      {/* SpellChecker Toolbar */}
      <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          {totalIssues > 0 ? (
            <div className="flex items-center gap-1.5 font-medium">
              <span className="flex size-2 rounded-full bg-destructive animate-pulse" />
              <span>
                {totalIssues} {totalIssues === 1 ? "issue" : "issues"} detected
              </span>
            </div>
          ) : (
            <div className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-3.5" />
              <span>All clear · No errors found</span>
            </div>
          )}

          {findingCount > 0 ? (
            <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {findingCount} {findingCount === 1 ? "error" : "errors"}
            </span>
          ) : null}

          {suggestionCount > 0 ? (
            <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {suggestionCount}{" "}
              {suggestionCount === 1 ? "suggestion" : "suggestions"}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {totalIssues > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                aria-label="Previous issue"
                className="size-6 p-0"
                onClick={() => handleNavigate(-1)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <ChevronLeft className="size-3" />
              </Button>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {activeMarkIndex !== -1 ? activeMarkIndex + 1 : 1} of{" "}
                {totalIssues}
              </span>
              <Button
                aria-label="Next issue"
                className="size-6 p-0"
                onClick={() => handleNavigate(1)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <ChevronRight className="size-3" />
              </Button>
            </div>
          ) : null}

          {!readOnly && onAcceptAll && findingCount > 1 ? (
            <Button
              className="h-6 gap-1 rounded-md px-2 text-[11px]"
              onClick={onAcceptAll}
              size="xs"
              type="button"
              variant="outline"
            >
              <Sparkles className="size-3" />
              Accept all ({findingCount})
            </Button>
          ) : null}
        </div>
      </div>

      {/* Interactive Text Display */}
      <div
        className={cn(
          "min-h-[14rem] p-5 text-base leading-8 whitespace-pre-wrap break-words",
          className
        )}
      >
        {segments.map((segment, idx) => {
          if (segment.kind === "text") {
            return <React.Fragment key={`t-${idx}`}>{segment.text}</React.Fragment>;
          }

          const mark = segment.mark;
          const isFinding = mark.kind === "finding";
          const isActive = activeId === mark.id;
          const markIndex = marks.findIndex((m) => m.id === mark.id);

          return (
            <Popover
              key={mark.id}
              modal={false}
              onOpenChange={(open) => {
                setActiveId(open ? mark.id : null);
              }}
              open={isActive}
            >
              <PopoverTrigger
                aria-label={`${isFinding ? "Finding" : "Suggestion"}: ${mark.originalText}`}
                className={cn(
                  "cursor-pointer font-inherit text-inherit inline underline decoration-wavy decoration-2 underline-offset-4 rounded-xs px-0.5 py-0.5 transition-all outline-none",
                  isFinding
                    ? "decoration-destructive bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-destructive/60"
                    : "decoration-amber-500 bg-amber-500/10 hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-amber-500/60",
                  isActive &&
                    (isFinding
                      ? "bg-destructive/25 ring-2 ring-destructive/70 ring-offset-1"
                      : "bg-amber-500/25 ring-2 ring-amber-500/70 ring-offset-1")
                )}
              >
                {segment.text}
              </PopoverTrigger>

              <PopoverContent
                align="center"
                className="w-80 p-0 shadow-2xl overflow-hidden rounded-xl border"
                side="bottom"
                sideOffset={8}
              >
                {/* Popover Header */}
                <div
                  className={cn(
                    "flex items-center justify-between border-b px-3.5 py-2.5",
                    isFinding ? "bg-destructive/10" : "bg-amber-500/10"
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isFinding ? (
                      <AlertCircle className="size-3.5 text-destructive shrink-0" />
                    ) : (
                      <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <span className="font-semibold text-xs truncate">
                      {isFinding
                        ? `${mark.finding?.category}`
                        : "Optional wording"}
                    </span>
                    {isFinding ? (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full border bg-background text-muted-foreground shrink-0">
                        {mark.finding?.severity}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      {markIndex + 1} of {totalIssues}
                    </span>
                    <PopoverClose
                      aria-label="Close"
                      className="text-muted-foreground hover:text-foreground rounded-sm p-0.5 outline-none transition-colors"
                    >
                      <X className="size-3.5" />
                    </PopoverClose>
                  </div>
                </div>

                {/* Popover Body */}
                <div className="p-3.5 space-y-3">
                  {/* Original Strikethrough & Suggested Replacement */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground/70">
                        Original:
                      </span>
                      <span className="line-through decoration-destructive/60 font-medium text-foreground">
                        {mark.originalText}
                      </span>
                    </div>

                    {isFinding && mark.finding ? (
                      <div>
                        {!readOnly && onAccept ? (
                          <button
                            className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white w-full rounded-lg px-3 py-2 text-left flex items-center justify-between shadow-xs transition-all active:scale-[0.99] cursor-pointer group"
                            onClick={() => {
                              onAccept(mark);
                              setActiveId(null);
                            }}
                            type="button"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Check className="size-4 shrink-0" />
                              <span className="font-semibold text-sm truncate">
                                {mark.finding.correction}
                              </span>
                            </span>
                            <span className="text-[11px] font-medium opacity-90 group-hover:opacity-100 shrink-0">
                              Accept
                            </span>
                          </button>
                        ) : (
                          <div className="bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-200 rounded-lg border px-3 py-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 block">
                              Correction
                            </span>
                            <span className="font-semibold text-sm">
                              {mark.finding.correction}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {!isFinding && mark.suggestion?.alternative ? (
                      <div>
                        {!readOnly && onAccept ? (
                          <button
                            className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white w-full rounded-lg px-3 py-2 text-left flex items-center justify-between shadow-xs transition-all active:scale-[0.99] cursor-pointer group"
                            onClick={() => {
                              onAccept(mark);
                              setActiveId(null);
                            }}
                            type="button"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Sparkles className="size-4 shrink-0" />
                              <span className="font-semibold text-sm truncate">
                                {mark.suggestion.alternative}
                              </span>
                            </span>
                            <span className="text-[11px] font-medium opacity-90 group-hover:opacity-100 shrink-0">
                              Use wording
                            </span>
                          </button>
                        ) : (
                          <div className="bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-200 rounded-lg border px-3 py-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 block">
                              Alternative
                            </span>
                            <span className="font-semibold text-sm">
                              {mark.suggestion.alternative}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* Explanation */}
                  <p className="text-muted-foreground text-xs leading-5 break-words">
                    {isFinding
                      ? mark.finding?.explanation
                      : mark.suggestion?.explanation}
                  </p>
                </div>

                {/* Popover Footer Stepper */}
                <div className="bg-muted/30 flex items-center justify-between border-t px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label="Previous"
                      className="size-6 p-0"
                      disabled={totalIssues <= 1}
                      onClick={() => handleNavigate(-1)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ChevronLeft className="size-3" />
                    </Button>
                    <Button
                      aria-label="Next"
                      className="size-6 p-0"
                      disabled={totalIssues <= 1}
                      onClick={() => handleNavigate(1)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ChevronRight className="size-3" />
                    </Button>
                  </div>

                  {!readOnly && onDismiss ? (
                    <Button
                      className="text-muted-foreground hover:text-foreground h-6 px-2 text-[11px]"
                      onClick={() => {
                        onDismiss(mark);
                        setActiveId(null);
                      }}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      Dismiss
                    </Button>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
};
