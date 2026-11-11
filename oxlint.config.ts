import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

// Effect is server-side only. See docs/agents/effect.md.
const effectSources = [
  "apps/server/**/*.ts",
  "packages/db/**/*.ts",
  "packages/env/**/*.ts",
];

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [...core.ignorePatterns, "packages/ui/src/components/**"],
  overrides: [
    {
      files: effectSources,
      rules: {
        // `Effect.gen(function* () {})` and `Effect.fn(function* () {})` are
        // the documented generator syntax; the name lives on `Effect.fn`.
        "eslint/func-names": "off",
        // Tagged errors are declared beside the service that raises them.
        "eslint/max-classes-per-file": "off",
        // Effect service shapes are declared with method signatures.
        "typescript/method-signature-style": "off",
        // False positive on `Schema.TaggedError<E>()(...)`, which builds a
        // class rather than throwing one.
        "unicorn/throw-new-error": "off",
      },
    },
  ],
});
