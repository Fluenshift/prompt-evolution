CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`original_text` text NOT NULL,
	`content_hash` text NOT NULL,
	`submitted_at` text NOT NULL,
	`evaluated_at` text NOT NULL,
	`corrected_text` text NOT NULL,
	`summary` text NOT NULL,
	`score` integer NOT NULL,
	`band` text NOT NULL,
	`evaluated_english_word_count` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`rubric_version` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_milliseconds` integer
);
--> statement-breakpoint
CREATE INDEX `evaluations_evaluated_at_idx` ON `evaluations` (`evaluated_at`);--> statement-breakpoint
CREATE INDEX `evaluations_rubric_evaluated_at_idx` ON `evaluations` (`rubric_version`,`evaluated_at`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_id` text NOT NULL,
	`position` integer NOT NULL,
	`byte_start` integer NOT NULL,
	`byte_end` integer NOT NULL,
	`original_text` text NOT NULL,
	`correction` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`explanation` text NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `findings_evaluation_position_idx` ON `findings` (`evaluation_id`,`position`);--> statement-breakpoint
CREATE INDEX `findings_category_idx` ON `findings` (`category`);--> statement-breakpoint
CREATE INDEX `findings_correction_idx` ON `findings` (`original_text`,`correction`);--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_id` text NOT NULL,
	`position` integer NOT NULL,
	`byte_start` integer NOT NULL,
	`byte_end` integer NOT NULL,
	`original_text` text NOT NULL,
	`alternative` text,
	`explanation` text NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suggestions_evaluation_position_idx` ON `suggestions` (`evaluation_id`,`position`);