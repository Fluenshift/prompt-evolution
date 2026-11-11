import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const evaluations = sqliteTable(
  "evaluations",
  {
    band: text("band").notNull(),
    contentHash: text("content_hash").notNull(),
    correctedText: text("corrected_text").notNull(),
    evaluatedAt: text("evaluated_at").notNull(),
    evaluatedEnglishWordCount: integer(
      "evaluated_english_word_count"
    ).notNull(),
    id: text("id").primaryKey(),
    inputTokens: integer("input_tokens"),
    latencyMilliseconds: integer("latency_milliseconds"),
    model: text("model").notNull(),
    originalText: text("original_text").notNull(),
    outputTokens: integer("output_tokens"),
    provider: text("provider").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    score: integer("score").notNull(),
    submittedAt: text("submitted_at").notNull(),
    summary: text("summary").notNull(),
  },
  (table) => [
    index("evaluations_evaluated_at_idx").on(table.evaluatedAt),
    index("evaluations_rubric_evaluated_at_idx").on(
      table.rubricVersion,
      table.evaluatedAt
    ),
  ]
);

export const findings = sqliteTable(
  "findings",
  {
    byteEnd: integer("byte_end").notNull(),
    byteStart: integer("byte_start").notNull(),
    category: text("category").notNull(),
    correction: text("correction").notNull(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    explanation: text("explanation").notNull(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    originalText: text("original_text").notNull(),
    position: integer("position").notNull(),
    severity: text("severity").notNull(),
  },
  (table) => [
    index("findings_evaluation_position_idx").on(
      table.evaluationId,
      table.position
    ),
    index("findings_category_idx").on(table.category),
    index("findings_correction_idx").on(table.originalText, table.correction),
  ]
);

export const suggestions = sqliteTable(
  "suggestions",
  {
    alternative: text("alternative"),
    byteEnd: integer("byte_end").notNull(),
    byteStart: integer("byte_start").notNull(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    explanation: text("explanation").notNull(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    originalText: text("original_text").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("suggestions_evaluation_position_idx").on(
      table.evaluationId,
      table.position
    ),
  ]
);

export interface DatabaseSchema {
  evaluations: typeof evaluations;
  findings: typeof findings;
  suggestions: typeof suggestions;
}
