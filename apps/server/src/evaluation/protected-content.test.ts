import { describe, expect, it } from "bun:test";

import { findProtectedTechnicalContent } from "./protected-content";

const protectedText = (sample: string) =>
  findProtectedTechnicalContent(sample).map((span) => span.originalText);

describe("Protected Technical Content", () => {
  it("protects shell builtins and path executables as complete command lines", () => {
    const commands = [
      "echo bad grammar",
      "printf '%s' bad grammar",
      "export FOO=bar",
      "kill 123",
      "./script.sh bad grammar",
      "env FOO=bar bun test",
      "VAR=one\\ two node app.js",
      'VAR="one two" node app.js',
    ];

    expect(protectedText(commands.join("\n"))).toEqual(commands);
  });

  it("does not mistake slash-separated prose for a path executable", () => {
    const sample = [
      "and/or are valid alternatives.",
      "input/output values is wrong.",
      "scripts/run.sh bad grammar",
    ].join("\n");

    expect(protectedText(sample)).toEqual(["scripts/run.sh bad grammar"]);
  });

  it("protects extensionless paths beneath known project roots", () => {
    const paths = ["src/components", "packages/db", "docs/product/PRD"];
    const sample = `Open ${paths.join(", ")}.`;

    expect(protectedText(sample)).toEqual(paths);
  });

  it("protects YAML, TOML, and XML structured data", () => {
    const yaml = "message: bad grammar\nenabled: true";
    const toml = 'message = "bad grammar"';
    const xml = "<config><message>bad grammar</message></config>";
    const sample = ["Review this.", yaml, "", toml, "", xml, "Continue."].join(
      "\n"
    );

    expect(protectedText(sample)).toEqual([yaml, toml, xml]);
  });

  it("protects nested YAML containing sequence entries", () => {
    const yaml = [
      "services:",
      "  app:",
      "    ports:",
      '      - "3000:3000"',
      "    environment:",
      "      ENABLED: true",
    ].join("\n");

    expect(protectedText(`Review this.\n${yaml}\nContinue.`)).toEqual([yaml]);
  });

  it("keeps internal YAML comments and blank lines inside the protected block", () => {
    const yaml = [
      "services:",
      "  # Runtime service",
      "",
      "  app:",
      "    enabled: true",
    ].join("\n");

    expect(protectedText(`Review this.\n${yaml}\nContinue.`)).toEqual([yaml]);
  });

  it("protects explicit-root, indentless, flow, and block-scalar YAML", () => {
    const explicitRoot = ["---", "- one", "- two"].join("\n");
    const indentless = ["items:", "- one", "- two"].join("\n");
    const flow = "config: [one, two]";
    const blockScalar = ["message: |", "  bad grammar stays exact"].join("\n");
    const sample = [
      "Review this.",
      explicitRoot,
      "",
      indentless,
      "",
      flow,
      "",
      blockScalar,
      "Continue.",
    ].join("\n");

    expect(protectedText(sample)).toEqual([
      explicitRoot,
      indentless,
      flow,
      blockScalar,
    ]);
    expect(protectedText("- This are wrong.\n- They is wrong.")).toEqual([]);
  });

  it("protects root YAML flow collections without hiding bracketed prose", () => {
    const flowMapping = "{message: bad grammar}";
    const flowSequence = "[one, two]";
    const multilineFlowMapping = [
      "{message: bad grammar,",
      " enabled: true}",
    ].join("\n");
    const multilineFlowSequence = ["[one,", " two]"].join("\n");
    const explicitFlowMapping = ["---", flowMapping].join("\n");
    const explicitFlowSequence = ["---", flowSequence].join("\n");
    const sample = [
      "Review this.",
      flowMapping,
      "",
      flowSequence,
      "",
      multilineFlowMapping,
      "",
      multilineFlowSequence,
      "",
      explicitFlowMapping,
      "",
      explicitFlowSequence,
      "Continue.",
    ].join("\n");

    expect(protectedText(sample)).toEqual([
      flowMapping,
      flowSequence,
      multilineFlowMapping,
      multilineFlowSequence,
      explicitFlowMapping,
      explicitFlowSequence,
    ]);
    expect(protectedText("[This are wrong]\n{This are wrong}")).toEqual([]);
  });

  it("protects a complete balanced nested JSON block", () => {
    const json = [
      "{",
      '  "outer": {',
      '    "message": "bad grammar"',
      "  }",
      "}",
    ].join("\n");

    expect(protectedText(`Review this.\n${json}\nContinue.`)).toEqual([json]);
  });

  it("keeps natural labeled prose and ambiguous equals prose evaluable", () => {
    const sample = [
      "Note: This are wrong.",
      "Reason: It fail.",
      "Enabled: true",
      "Title: A short draft",
      "Summary: This are unclear.",
      "message = bad grammar",
      "[This are wrong]",
      "{This are wrong}",
    ].join("\n");

    expect(protectedText(sample)).toEqual([]);
  });

  it("protects commands and structured data copied inside quotes", () => {
    const command = "bun run bad grammar";
    const escapedJson = String.raw`{\"message\":\"bad grammar\"}`;
    const sample = [
      `She copied "${command}" exactly.`,
      `She copied "${escapedJson}" exactly.`,
    ].join("\n");

    expect(protectedText(sample)).toEqual([command, escapedJson]);
  });

  it("honors variable-length Markdown fences", () => {
    const code = [
      "````md",
      "technical ``` marker",
      "bad grammar code",
      "````",
    ].join("\n");
    const sample = `${code}\nReal prose.`;

    expect(protectedText(sample)).toEqual([code]);
  });

  it("honors fenced code nested in a Markdown blockquote", () => {
    const code = ["> ~~~txt", "> technical bad grammar", "> ~~~"].join("\n");

    expect(protectedText(`${code}\nReal prose.`)).toEqual([code]);
  });

  it("honors matching multi-backtick inline-code delimiters", () => {
    const sample = "Explain ``foo`bad grammar`` please.";

    expect(protectedText(sample)).toEqual(["``foo`bad grammar``"]);
  });

  it("leaves sentence punctuation after URLs and Windows paths evaluable", () => {
    const sample =
      "Visit https://example.com,, then C:\\tmp\\file.txt,, please.";

    expect(protectedText(sample)).toEqual([
      "https://example.com",
      "C:\\tmp\\file.txt",
    ]);
  });

  it("does not mistake missing sentence spaces for dotted identifiers", () => {
    const sample =
      "This works.It fails. Please stop.Then continue. This works.then it fails. Please stop.and continue. Use config.value.";

    expect(protectedText(sample)).toEqual(["config.value"]);
  });

  it("protects opaque UUID and ULID identifiers", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const ulid = "01J5A3N8P4Q7Z6Y2X9W0K1M2B3";
    const sample = `Request ID ${uuid} failed. Trace ${ulid} ended.`;

    expect(protectedText(sample)).toEqual([uuid, ulid]);
  });

  it("protects space-timestamp, syslog, and uncaught-error log lines", () => {
    const logs = [
      "2026-09-10 12:00:00 INFO command failed badly",
      "Sep 10 12:00:00 host app[123]: command failed badly",
      "Uncaught TypeError: command failed badly",
    ];

    expect(protectedText(logs.join("\n"))).toEqual(logs);
  });
});
