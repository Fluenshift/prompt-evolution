import type { AssessmentSpan } from "./evaluation-model";

const SHELL_COMMANDS = new Set([
  "apt",
  "apt-get",
  "aws",
  "az",
  "bash",
  "brew",
  "bun",
  "cargo",
  "cat",
  "cd",
  "chmod",
  "chown",
  "composer",
  "cp",
  "curl",
  "deno",
  "docker",
  "docker-compose",
  "dotnet",
  "echo",
  "env",
  "export",
  "find",
  "gcloud",
  "gh",
  "git",
  "go",
  "grep",
  "helm",
  "java",
  "javac",
  "jq",
  "kill",
  "kubectl",
  "less",
  "ls",
  "make",
  "mise",
  "mkdir",
  "mv",
  "mysql",
  "node",
  "npm",
  "npx",
  "openssl",
  "pip",
  "pip3",
  "pnpm",
  "podman",
  "poetry",
  "printf",
  "ps",
  "psql",
  "pwd",
  "python",
  "python3",
  "rg",
  "rm",
  "rsync",
  "ruby",
  "rustc",
  "sed",
  "sh",
  "source",
  "ssh",
  "sudo",
  "swift",
  "systemctl",
  "tail",
  "tar",
  "terraform",
  "touch",
  "tsc",
  "type",
  "unset",
  "uv",
  "vim",
  "wget",
  "yarn",
  "zsh",
]);

const AMBIGUOUS_SHELL_COMMANDS = new Set([
  "cat",
  "env",
  "find",
  "go",
  "kill",
  "less",
  "make",
  "ruby",
  "swift",
  "tail",
  "touch",
]);

const hasCommandEvidence = (
  command: string,
  argumentsText: string
): boolean => {
  if (/^(?:--?\S+|\.{1,2}\/|~\/|\/|[A-Za-z]:\\)/u.test(argumentsText)) {
    return true;
  }
  if (command === "go") {
    return /^(?:build|clean|env|fmt|generate|get|install|list|mod|run|test|tool|version|vet|work)(?:\s|$)/u.test(
      argumentsText
    );
  }
  if (command === "env") {
    return /^(?:--?\S+\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=\S+)(?:\s|$)/u.test(
      argumentsText
    );
  }
  if (command === "make") {
    return /^(?:all|build|check|clean|dev|install|lint|release|test)(?:\s|$)/u.test(
      argumentsText
    );
  }
  if (command === "swift") {
    return /^(?:build|package|run|test)(?:\s|$)/u.test(argumentsText);
  }
  if (command === "kill") {
    return /^\d+(?:\s|$)/u.test(argumentsText);
  }
  return /(?:^|\s)\S+[./\\]\S*(?:\s|$)/u.test(argumentsText);
};

const startsWithShellCommand = (line: string): boolean => {
  const match = line.match(
    /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\\.|[^\s])+)[\s]+)*(?<command>[^\s]+)(?:\s+(?<arguments>.*))?$/u
  );
  const executable = match?.groups?.command;
  if (executable === undefined) {
    return false;
  }

  if (
    /^(?:\.{1,2}\/|~\/|\/|[A-Za-z]:\\)\S+/u.test(executable) ||
    /^(?:[^/\s]+\/)+[^/\s]+\.(?:bash|js|mjs|py|rb|sh)(?:\s|$)/iu.test(
      executable
    )
  ) {
    return true;
  }

  const command = executable
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/\.exe$/u, "");
  if (command === undefined || command !== command.toLowerCase()) {
    return false;
  }
  if (!SHELL_COMMANDS.has(command)) {
    return false;
  }

  const argumentsText = match?.groups?.arguments ?? "";
  if (/[.!?]$/u.test(line) && !hasCommandEvidence(command, argumentsText)) {
    return false;
  }
  if (AMBIGUOUS_SHELL_COMMANDS.has(command)) {
    return hasCommandEvidence(command, argumentsText);
  }
  return true;
};

const trimmedTechnicalTokenLength = (token: string): number => {
  let end = token.length;
  while (end > 0 && /[!,.?:;]/u.test(token[end - 1] ?? "")) {
    end -= 1;
  }

  const pairs = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ] as const;
  let changed = true;
  while (changed && end > 0) {
    changed = false;
    for (const [opening, closing] of pairs) {
      if (token[end - 1] !== closing) {
        continue;
      }
      const value = token.slice(0, end);
      const openingCount = value.split(opening).length - 1;
      const closingCount = value.split(closing).length - 1;
      if (closingCount > openingCount) {
        end -= 1;
        changed = true;
      }
    }
  }

  return end;
};

interface CharacterRange {
  end: number;
  start: number;
}

interface SourceLine {
  content: string;
  start: number;
}

const toByteSpan = (
  source: string,
  { end, start }: CharacterRange
): AssessmentSpan => ({
  byteEnd: Buffer.byteLength(source.slice(0, end), "utf-8"),
  byteStart: Buffer.byteLength(source.slice(0, start), "utf-8"),
  originalText: source.slice(start, end),
});

const sourceLines = (source: string): readonly SourceLine[] =>
  [...source.matchAll(/^(?<content>[^\r\n]*)(?:\r?\n|$)/gmu)]
    .filter((match) => match[0].length > 0)
    .map((match) => ({
      content: match.groups?.content ?? "",
      start: match.index,
    }));

const isJson = (candidate: string): boolean => {
  try {
    JSON.parse(candidate);
    return true;
  } catch {
    return false;
  }
};

const isYamlMappingLine = (line: string): boolean =>
  /^[\t ]*(?:-[\t ]+)?(?:[A-Za-z_][\w.-]*|"[^"\r\n]+"|'[^'\r\n]+'):[\t ]*(?:\S.*)?$/u.test(
    line
  );

const hasTechnicalYamlKey = (line: string): boolean => {
  const [key] = line
    .trimStart()
    .replace(/^-[\t ]+/u, "")
    .split(":", 1);
  return (
    key?.startsWith('"') ||
    key?.startsWith("'") ||
    /^[a-z_][\w.-]*$/u.test(key ?? "")
  );
};

const hasStructuredYamlScalar = (line: string): boolean => {
  const value = line
    .replace(
      /^[\t ]*(?:-[\t ]+)?(?:[A-Za-z_][\w.-]*|"[^"\r\n]+"|'[^'\r\n]+'):[\t ]*/u,
      ""
    )
    .trim();
  return /^(?:["'[{]|[>|](?:[-+])?$|true\b|false\b|null\b|~$|[-+]?\d)/iu.test(
    value
  );
};

const yamlIndent = (line: string): number =>
  line.match(/^[\t ]*/u)?.[0].length ?? 0;

const isYamlSequenceLine = (line: string): boolean =>
  /^[\t ]*-[\t ]+\S.*$/u.test(line);

const isYamlCommentLine = (line: string): boolean =>
  /^[\t ]*#[\t ]?\S.*$/u.test(line);

const isYamlDocumentMarker = (line: string): boolean =>
  /^[\t ]*---[\t ]*(?:#.*)?$/u.test(line);

const startsYamlFlowCollection = (line: string): boolean =>
  /^[\t ]*[{[]/u.test(line);

interface YamlFlowCollection {
  readonly endLineIndex: number;
  readonly structured: boolean;
}

const isYamlFlowOpening = (character: string | undefined): boolean =>
  character === "{" || character === "[";

const isYamlFlowClosing = (character: string | undefined): boolean =>
  character === "}" || character === "]";

const isMatchingYamlFlowDelimiter = (
  opening: string | undefined,
  closing: string
): boolean =>
  (opening === "{" && closing === "}") || (opening === "[" && closing === "]");

const maskYamlFlowLiteral = (literal: string): string =>
  literal.replaceAll(/[^\r\n]/gu, " ");

const yamlFlowSyntax = (value: string): string =>
  value
    .replaceAll(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/gu, maskYamlFlowLiteral)
    .replaceAll(/(?<=\s)#.*$/gmu, maskYamlFlowLiteral);

class YamlFlowScanner {
  readonly #delimiters: string[];
  readonly #rootOpening: string;
  #rootHasContent = false;
  #structured = false;

  constructor(rootOpening: string) {
    this.#delimiters = [rootOpening];
    this.#rootOpening = rootOpening;
  }

  consume(character: string | undefined): boolean {
    if (this.#delimiters.length === 0) {
      return /\s/u.test(character ?? "");
    }
    if (isYamlFlowOpening(character)) {
      this.#consumeOpening(character ?? "");
      return true;
    }
    if (isYamlFlowClosing(character)) {
      return this.#consumeClosing(character ?? "");
    }
    this.#consumeScalar(character);
    return true;
  }

  result(): Pick<YamlFlowCollection, "structured"> | undefined {
    return this.#delimiters.length === 0
      ? { structured: this.#structured }
      : undefined;
  }

  #consumeClosing(character: string): boolean {
    if (!isMatchingYamlFlowDelimiter(this.#delimiters.at(-1), character)) {
      return false;
    }
    if (this.#delimiters.length === 1 && !this.#rootHasContent) {
      this.#structured = true;
    }
    this.#delimiters.pop();
    return true;
  }

  #consumeOpening(character: string): void {
    if (this.#delimiters.length === 1) {
      this.#rootHasContent = true;
      this.#structured = true;
    }
    this.#delimiters.push(character);
  }

  #consumeScalar(character: string | undefined): void {
    if (this.#delimiters.length !== 1) {
      return;
    }
    if (character === "," || (this.#rootOpening === "{" && character === ":")) {
      this.#structured = true;
    }
    if (!/\s/u.test(character ?? "")) {
      this.#rootHasContent = true;
    }
  }
}

const analyzeYamlFlowCollection = (
  candidate: string
): Pick<YamlFlowCollection, "structured"> | undefined => {
  const value = candidate.trim();
  const [rootOpening] = value;
  if (!isYamlFlowOpening(rootOpening)) {
    return undefined;
  }

  const scanner = new YamlFlowScanner(rootOpening ?? "");
  const syntax = yamlFlowSyntax(value);
  for (let index = 1; index < syntax.length; index += 1) {
    if (!scanner.consume(syntax[index])) {
      return undefined;
    }
  }
  return scanner.result();
};

const findYamlFlowCollection = (
  lines: readonly SourceLine[],
  startLineIndex: number
): YamlFlowCollection | undefined => {
  for (
    let endLineIndex = startLineIndex;
    endLineIndex < lines.length;
    endLineIndex += 1
  ) {
    const candidate = lines
      .slice(startLineIndex, endLineIndex + 1)
      .map(({ content }) => content)
      .join("\n");
    const analysis = analyzeYamlFlowCollection(candidate);
    if (analysis !== undefined) {
      return { ...analysis, endLineIndex };
    }
  }
  return undefined;
};

const inspectYamlFlowCollections = (
  lines: readonly SourceLine[]
): { readonly hasAny: boolean; readonly hasStructured: boolean } => {
  let hasAny = false;
  let hasStructured = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!startsYamlFlowCollection(lines[lineIndex]?.content ?? "")) {
      continue;
    }
    const flowCollection = findYamlFlowCollection(lines, lineIndex);
    if (flowCollection !== undefined) {
      hasAny = true;
      hasStructured ||= flowCollection.structured;
      lineIndex = flowCollection.endLineIndex;
    }
  }
  return { hasAny, hasStructured };
};

const startsYamlBlockScalar = (line: string): boolean =>
  /:[\t ]*[>|](?:[-+])?[\t ]*(?:#.*)?$/u.test(line);

const yamlMappingHasNoScalar = (line: string): boolean =>
  /:[\t ]*(?:#.*)?$/u.test(line);

const nextNonEmptyLine = (
  lines: readonly SourceLine[],
  afterLineIndex: number
): SourceLine | undefined => {
  for (
    let lineIndex = afterLineIndex + 1;
    lineIndex < lines.length;
    lineIndex += 1
  ) {
    const line = lines[lineIndex];
    if (line !== undefined && line.content.trim().length > 0) {
      return line;
    }
  }
  return undefined;
};

const blankContinuesYamlBlock = (
  lines: readonly SourceLine[],
  lineIndex: number,
  baseIndent: number,
  blockScalarParentIndent: number | undefined,
  indentlessSequenceAllowed: boolean
): boolean => {
  const next = nextNonEmptyLine(lines, lineIndex);
  if (next === undefined) {
    return false;
  }
  const indent = yamlIndent(next.content);
  if (blockScalarParentIndent !== undefined) {
    return indent > blockScalarParentIndent;
  }
  return (
    (indent > baseIndent &&
      (isYamlMappingLine(next.content) ||
        isYamlSequenceLine(next.content) ||
        isYamlCommentLine(next.content) ||
        startsYamlFlowCollection(next.content))) ||
    (indentlessSequenceAllowed &&
      indent === baseIndent &&
      (isYamlSequenceLine(next.content) ||
        startsYamlFlowCollection(next.content)))
  );
};

const flowCollectionEndInYamlBlock = (
  lines: readonly SourceLine[],
  lineIndex: number,
  startLineIndex: number,
  baseIndent: number,
  explicitDocument: boolean
): number | undefined => {
  const line = lines[lineIndex];
  if (line === undefined || !startsYamlFlowCollection(line.content)) {
    return undefined;
  }
  const flowCollection = findYamlFlowCollection(lines, lineIndex);
  if (flowCollection === undefined) {
    return undefined;
  }
  const indent = yamlIndent(line.content);
  const belongsToBlock =
    lineIndex === startLineIndex ||
    indent > baseIndent ||
    (indent === baseIndent && explicitDocument);
  if (!belongsToBlock) {
    return undefined;
  }
  const { endLineIndex } = flowCollection;
  return endLineIndex;
};

const isYamlBlockScalarContent = (
  blockScalarParentIndent: number | undefined,
  indent: number
): boolean =>
  blockScalarParentIndent !== undefined && indent > blockScalarParentIndent;

const isYamlSequenceInBlock = (
  content: string,
  indent: number,
  baseIndent: number,
  indentlessSequenceAllowed: boolean
): boolean =>
  isYamlSequenceLine(content) &&
  (indent > baseIndent || (indent === baseIndent && indentlessSequenceAllowed));

const yamlBlockEnd = (
  lines: readonly SourceLine[],
  startLineIndex: number
): number => {
  const first = lines[startLineIndex];
  if (first === undefined) {
    return startLineIndex;
  }
  const baseIndent = yamlIndent(first.content);
  const explicitDocument = isYamlDocumentMarker(first.content);
  let blockScalarParentIndent: number | undefined;
  let endLineIndex = startLineIndex;
  let indentlessSequenceAllowed = explicitDocument;

  for (
    let lineIndex = startLineIndex;
    lineIndex < lines.length;
    lineIndex += 1
  ) {
    const line = lines[lineIndex];
    if (line === undefined) {
      break;
    }
    if (line.content.trim().length === 0) {
      if (
        blankContinuesYamlBlock(
          lines,
          lineIndex,
          baseIndent,
          blockScalarParentIndent,
          indentlessSequenceAllowed
        )
      ) {
        endLineIndex = lineIndex;
        continue;
      }
      break;
    }
    const indent = yamlIndent(line.content);
    if (isYamlBlockScalarContent(blockScalarParentIndent, indent)) {
      endLineIndex = lineIndex;
      continue;
    }
    blockScalarParentIndent = undefined;

    const flowCollectionEnd = flowCollectionEndInYamlBlock(
      lines,
      lineIndex,
      startLineIndex,
      baseIndent,
      explicitDocument
    );
    if (flowCollectionEnd !== undefined) {
      endLineIndex = flowCollectionEnd;
      lineIndex = flowCollectionEnd;
      indentlessSequenceAllowed = false;
      continue;
    }

    if (isYamlDocumentMarker(line.content) && indent >= baseIndent) {
      endLineIndex = lineIndex;
      indentlessSequenceAllowed = true;
      continue;
    }
    if (isYamlMappingLine(line.content) && indent >= baseIndent) {
      endLineIndex = lineIndex;
      indentlessSequenceAllowed = yamlMappingHasNoScalar(line.content);
      if (startsYamlBlockScalar(line.content)) {
        blockScalarParentIndent = indent;
      }
      continue;
    }
    if (
      isYamlSequenceInBlock(
        line.content,
        indent,
        baseIndent,
        indentlessSequenceAllowed
      )
    ) {
      endLineIndex = lineIndex;
      indentlessSequenceAllowed = indent === baseIndent;
      continue;
    }
    if (isYamlCommentLine(line.content) && indent >= baseIndent) {
      endLineIndex = lineIndex;
      continue;
    }
    break;
  }

  return endLineIndex;
};

const isStructuredYamlBlock = (blockLines: readonly SourceLine[]): boolean => {
  const [firstLine] = blockLines;
  if (firstLine === undefined) {
    return false;
  }
  const explicitDocument = isYamlDocumentMarker(firstLine.content);
  const flowCollections = inspectYamlFlowCollections(blockLines);
  if (
    !explicitDocument &&
    !hasTechnicalYamlKey(firstLine.content) &&
    !flowCollections.hasStructured
  ) {
    return false;
  }
  const baseIndent = yamlIndent(firstLine.content);
  const mappingLines = blockLines.filter(({ content }) =>
    isYamlMappingLine(content)
  );
  const hasNestedMapping = mappingLines.some(
    ({ content }) => yamlIndent(content) > baseIndent
  );
  const hasSequence = blockLines.some(({ content }) =>
    isYamlSequenceLine(content)
  );
  const isFlatStructuredMapping =
    mappingLines.length >= 2 &&
    mappingLines.every(({ content }) => hasTechnicalYamlKey(content)) &&
    mappingLines.some(({ content }) => hasStructuredYamlScalar(content));
  const isSingleStructuredMapping =
    mappingLines.length === 1 &&
    (hasStructuredYamlScalar(firstLine.content) ||
      startsYamlBlockScalar(firstLine.content));

  return (
    (explicitDocument &&
      (mappingLines.length > 0 || hasSequence || flowCollections.hasAny)) ||
    hasNestedMapping ||
    hasSequence ||
    flowCollections.hasStructured ||
    (mappingLines.length > 0 && flowCollections.hasAny) ||
    isFlatStructuredMapping ||
    isSingleStructuredMapping
  );
};

const decodeQuotedContent = (match: RegExpMatchArray): string => {
  const rawContent = match.groups?.content ?? "";
  const [matched] = match;
  const [quote] = matched;
  if (quote !== '"') {
    return rawContent;
  }
  try {
    return JSON.parse(matched) as string;
  } catch {
    return rawContent;
  }
};

const isStructuredQuotedText = (candidate: string): boolean => {
  if (/^[{[]/u.test(candidate) && /[}\]]$/u.test(candidate)) {
    return isJson(candidate);
  }
  return /^<[A-Za-z_][\s\S]*>[\s\S]*<\/[A-Za-z_][\w:.-]*>$/u.test(candidate);
};

const findClosingFence = (
  lines: readonly SourceLine[],
  openingLineIndex: number,
  fence: string,
  sourceLength: number
): { end: number; lineIndex: number } => {
  const [fenceCharacter] = fence;
  for (
    let candidateIndex = openingLineIndex + 1;
    candidateIndex < lines.length;
    candidateIndex += 1
  ) {
    const candidate = lines[candidateIndex];
    const closing = candidate?.content.match(
      /^[\t ]{0,3}(?:>[\t ]?)*(?<fence>`{3,}|~{3,})[\t ]*$/u
    )?.groups?.fence;
    if (
      closing?.startsWith(fenceCharacter ?? "") &&
      closing.length >= fence.length &&
      candidate !== undefined
    ) {
      return {
        end: candidate.start + candidate.content.length,
        lineIndex: candidateIndex,
      };
    }
  }
  return { end: sourceLength, lineIndex: lines.length };
};

const findJsonBlockEnd = (
  source: string,
  lines: readonly SourceLine[],
  startLineIndex: number
): number | undefined => {
  const start = lines[startLineIndex];
  if (start === undefined) {
    return undefined;
  }
  for (
    let endLineIndex = startLineIndex;
    endLineIndex < lines.length;
    endLineIndex += 1
  ) {
    const end = lines[endLineIndex];
    if (
      end !== undefined &&
      isJson(source.slice(start.start, end.start + end.content.length).trim())
    ) {
      return endLineIndex;
    }
  }
  return undefined;
};

class ProtectedContentDetector {
  readonly #lines: readonly SourceLine[];
  readonly #ranges: CharacterRange[] = [];
  readonly source: string;

  constructor(source: string) {
    this.source = source;
    this.#lines = sourceLines(source);
  }

  detect(): readonly AssessmentSpan[] {
    this.#protectMarkdownFences();
    this.#protectInlineCode();
    this.#protectYaml();
    this.#protectToml();
    this.#protectXml();
    this.#protectQuotedTechnicalContent();
    this.#protectJson();
    this.#protectTechnicalLines();
    this.#protectTechnicalTokens();
    return this.#ranges.map((range) => toByteSpan(this.source, range));
  }

  #addRange(start: number, end: number): void {
    const ordered = [...this.#ranges, { end, start }].toSorted(
      (left, right) => left.start - right.start
    );
    const merged: CharacterRange[] = [];
    for (const range of ordered) {
      const previous = merged.at(-1);
      if (previous === undefined || range.start > previous.end) {
        merged.push({ ...range });
      } else {
        previous.end = Math.max(previous.end, range.end);
      }
    }
    this.#ranges.splice(0, this.#ranges.length, ...merged);
  }

  #protectMarkdownFences(): void {
    for (let lineIndex = 0; lineIndex < this.#lines.length; lineIndex += 1) {
      const line = this.#lines[lineIndex];
      const opening = line?.content.match(
        /^[\t ]{0,3}(?:>[\t ]?)*(?<fence>`{3,}|~{3,})(?<info>.*)$/u
      );
      const fence = opening?.groups?.fence;
      if (
        fence === undefined ||
        (fence.startsWith("`") && (opening?.groups?.info ?? "").includes("`"))
      ) {
        continue;
      }

      const { end, lineIndex: closingLineIndex } = findClosingFence(
        this.#lines,
        lineIndex,
        fence,
        this.source.length
      );
      this.#addRange(line?.start ?? 0, end);
      lineIndex = closingLineIndex;
    }
  }

  #containingRange(index: number): CharacterRange | undefined {
    return this.#ranges.find(
      (range) => range.start <= index && index < range.end
    );
  }

  #protectInlineCode(): void {
    for (let index = 0; index < this.source.length; index += 1) {
      const protectedRange = this.#containingRange(index);
      if (protectedRange !== undefined) {
        index = protectedRange.end - 1;
        continue;
      }
      if (this.source[index] !== "`") {
        continue;
      }

      let openingEnd = index + 1;
      while (this.source[openingEnd] === "`") {
        openingEnd += 1;
      }
      const delimiterLength = openingEnd - index;
      let candidateStart = openingEnd;
      while (candidateStart < this.source.length) {
        candidateStart = this.source.indexOf("`", candidateStart);
        if (candidateStart === -1) {
          break;
        }
        const candidateRange = this.#containingRange(candidateStart);
        if (candidateRange !== undefined) {
          candidateStart = candidateRange.end;
          continue;
        }
        let candidateEnd = candidateStart + 1;
        while (this.source[candidateEnd] === "`") {
          candidateEnd += 1;
        }
        if (candidateEnd - candidateStart === delimiterLength) {
          this.#addRange(index, candidateEnd);
          index = candidateEnd - 1;
          break;
        }
        candidateStart = candidateEnd;
      }
    }
  }

  #protectYaml(): void {
    for (let lineIndex = 0; lineIndex < this.#lines.length; lineIndex += 1) {
      const content = this.#lines[lineIndex]?.content ?? "";
      if (
        !isYamlMappingLine(content) &&
        !isYamlDocumentMarker(content) &&
        !startsYamlFlowCollection(content)
      ) {
        continue;
      }
      const blockEndIndex = yamlBlockEnd(this.#lines, lineIndex);
      const blockLines = this.#lines.slice(lineIndex, blockEndIndex + 1);
      if (isStructuredYamlBlock(blockLines)) {
        const [firstLine] = blockLines;
        const lastLine = blockLines.at(-1);
        this.#addRange(
          firstLine?.start ?? 0,
          (lastLine?.start ?? 0) + (lastLine?.content.length ?? 0)
        );
      }
      lineIndex = blockEndIndex;
    }
  }

  #protectToml(): void {
    for (const line of this.#lines) {
      if (
        /^[\t ]*(?:[A-Za-z0-9_-]+|"[^"\r\n]+"|'[^'\r\n]+')(?:[\t ]*\.[\t ]*(?:[A-Za-z0-9_-]+|"[^"\r\n]+"|'[^'\r\n]+'))*[\t ]*=[\t ]*(?:["'[{]|true\b|false\b|[-+]?\d)\S*.*$/iu.test(
          line.content
        )
      ) {
        this.#addRange(line.start, line.start + line.content.length);
      }
    }
  }

  #protectXml(): void {
    for (const pattern of [
      /<(?<tag>[A-Za-z_][\w:.-]*)(?:\s+[^<>]*?)?>[\s\S]*?<\/\k<tag>\s*>/gu,
      /<[A-Za-z_][\w:.-]*(?:\s+[^<>]*?)?\/>/gu,
    ]) {
      for (const match of this.source.matchAll(pattern)) {
        this.#addRange(match.index, match.index + match[0].length);
      }
    }
  }

  #protectQuotedTechnicalContent(): void {
    for (const pattern of [
      /"(?<content>(?:\\.|[^"\\\r\n])*)"/gu,
      /'(?<content>(?:\\.|[^'\\\r\n])*)'/gu,
    ]) {
      for (const match of this.source.matchAll(pattern)) {
        const rawContent = match.groups?.content ?? "";
        const candidate = decodeQuotedContent(match).trim();
        if (
          startsWithShellCommand(candidate) ||
          isStructuredQuotedText(candidate)
        ) {
          const contentStart = match.index + 1;
          this.#addRange(contentStart, contentStart + rawContent.length);
        }
      }
    }
  }

  #protectJson(): void {
    for (let lineIndex = 0; lineIndex < this.#lines.length; lineIndex += 1) {
      const line = this.#lines[lineIndex];
      if (line === undefined || !/^[\t ]*[{[]/u.test(line.content)) {
        continue;
      }
      const endLineIndex = findJsonBlockEnd(
        this.source,
        this.#lines,
        lineIndex
      );
      const end =
        endLineIndex === undefined ? undefined : this.#lines[endLineIndex];
      if (end !== undefined) {
        this.#addRange(line.start, end.start + end.content.length);
        lineIndex = endLineIndex ?? lineIndex;
      }
    }
  }

  #protectTechnicalLines(): void {
    for (const line of this.#lines) {
      const trimmed = line.content.trim();
      if (
        /^[$]\s/u.test(trimmed) ||
        startsWithShellCommand(trimmed) ||
        /^\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\](?:\s|:)/u.test(trimmed) ||
        /^(?:Uncaught\s+)?(?:[A-Za-z]*Error|Exception|WARN|ERROR|INFO):/u.test(
          trimmed
        ) ||
        /^\d{4}-\d{2}-\d{2}[ T]\S+\s+(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\b/u.test(
          trimmed
        ) ||
        /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+(?:\[\d+\])?:\s/u.test(
          trimmed
        ) ||
        /^\s+at\s/u.test(line.content)
      ) {
        this.#addRange(line.start, line.start + line.content.length);
      }
    }
  }

  #protectTechnicalTokens(): void {
    for (const pattern of [
      /\bhttps?:\/\/[^\s<>"']+/giu,
      /\b[A-Za-z]:\\[^\s<>"']+/gu,
    ]) {
      for (const match of this.source.matchAll(pattern)) {
        this.#addRange(
          match.index,
          match.index + trimmedTechnicalTokenLength(match[0])
        );
      }
    }

    for (const pattern of [
      /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/giu,
      /\b[0-9A-HJKMNP-TV-Z]{26}\b/gu,
      /\b[0-9a-f]{32,128}\b/giu,
      /\b(?:apps|assets|config|docs|e2e|migrations|node_modules|packages|public|scripts|src|test|tests)(?:\/[\w.@+-]+)+\b/gu,
      /\b[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:astro|bash|c|cc|conf|cpp|css|csv|env|go|h|hpp|html|ini|java|js|json|jsx|log|md|mjs|mts|php|py|rb|rs|sh|sql|svg|toml|ts|tsx|txt|xml|yaml|yml)\b/giu,
      /(?<![\w.])\.[A-Za-z][A-Za-z0-9_.-]*\b/gu,
      /\b(?:[\w@+.-]+\/)+(?:[\w@+-]+\.)+[A-Za-z0-9]+\b/gu,
      /(?<![\w])(?:\.{1,2}|~)?\/[\w.@~+\-/]+/gu,
      /\b(?:[A-Za-z]+_[A-Za-z0-9_]+|[a-z]+[A-Z][A-Za-z0-9]*)(?:\(\))?/gu,
      /\b[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+\b/gu,
      /\b(?:app|args|client|config|console|ctx|data|document|env|globalThis|module|options|process|props|request|response|schema|server|state|this|window)(?:\.[A-Za-z_$][\w$]*)+\b/gu,
      /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\(\)/gu,
      /\b[A-Za-z_$][\w$]*\(\)/gu,
    ]) {
      for (const match of this.source.matchAll(pattern)) {
        this.#addRange(match.index, match.index + match[0].length);
      }
    }
  }
}

export const findProtectedTechnicalContent = (
  writingSample: string
): readonly AssessmentSpan[] =>
  new ProtectedContentDetector(writingSample).detect();
