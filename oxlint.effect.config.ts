import { recommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

// Type-aware Effect linting, scoped to the server-side workspaces that use
// Effect. Kept out of `oxlint.config.ts` because `options.typeAware` is a
// whole-config switch and would activate type-aware `typescript/*` rules
// across `apps/web`, which holds no Effect code. See docs/agents/effect.md.
export default defineConfig({
  ignorePatterns: [
    ...core.ignorePatterns,
    // drizzle-kit loads this config outside any Effect runtime.
    "packages/db/drizzle.config.ts",
  ],
  options: recommended.options,
  plugins: recommended.plugins,
  rules: recommended.rules,
});
