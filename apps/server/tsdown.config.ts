import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [/@english-prompt-evaluation\/.*/u],
    neverBundle: ["bun:sqlite"],
  },
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
});
