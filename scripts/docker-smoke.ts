import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { request } from "node:http";
import { createServer } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..");
const COMPOSE_FILE = path.join(REPOSITORY_ROOT, "docker-compose.yml");
const TEMP_PREFIX = path.join(tmpdir(), "prompt-evolution-docker-smoke-");
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 90 * 1000;
const HOST_USER_ID = process.getuid?.() ?? 1000;
const HOST_GROUP_ID = process.getgid?.() ?? 1000;

interface CommandResult {
  readonly stderr: string;
  readonly stdout: string;
}

interface ComposePort {
  readonly host_ip?: string;
  readonly published?: string;
  readonly target?: number;
}

interface EvaluationDetail {
  readonly band: string;
  readonly correctedText: string;
  readonly evaluatedAt: string;
  readonly evaluatedEnglishWordCount: number;
  readonly findings: readonly {
    readonly byteEnd: number;
    readonly byteStart: number;
    readonly category: string;
    readonly correction: string;
    readonly explanation: string;
    readonly originalText: string;
    readonly severity: string;
  }[];
  readonly id: string;
  readonly model: string;
  readonly originalText: string;
  readonly provider: string;
  readonly rubricVersion: string;
  readonly score: number;
  readonly suggestions: readonly unknown[];
  readonly summary: string;
}

interface SetupStatus {
  readonly configured: boolean;
  readonly dataLocation: string;
  readonly model: string;
  readonly provider: string;
  readonly rubricVersion: string;
}

const report = (message: string) => {
  process.stdout.write(`${message}\n`);
};

const randomLetters = (length: number) =>
  [...randomBytes(length)]
    .map((value) => String.fromCodePoint(97 + (value % 26)))
    .join("");

const reserveLoopbackPort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const { port } = address;
  const closeEvent = once(server, "close");
  server.close();
  await closeEvent;
  return port;
};

let activeChild: ChildProcessWithoutNullStreams | null = null;
let sensitiveValues: readonly string[] = [];

const redact = (value: string) => {
  let redacted = value;
  for (const sensitive of sensitiveValues) {
    redacted = redacted.replaceAll(sensitive, "[REDACTED]");
  }
  return redacted;
};

const runCommand = async (
  command: string,
  arguments_: readonly string[],
  options: {
    readonly environment?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  } = {}
): Promise<CommandResult> => {
  const child = spawn(command, arguments_, {
    cwd: REPOSITORY_ROOT,
    env: options.environment ?? process.env,
  });
  activeChild = child;
  let stderr = "";
  let stdout = "";
  let timedOut = false;
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf-8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf-8");
  });
  const closeEvent = once(child, "close");
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);

  try {
    const [code] = (await closeEvent) as [number | null];
    if (timedOut) {
      throw new Error(`${command} timed out`);
    }
    if (code !== 0) {
      const diagnostic = redact((stderr || stdout).trim()).slice(-4000);
      throw new Error(
        `${command} exited with ${code}${diagnostic ? `: ${diagnostic}` : ""}`
      );
    }
    return { stderr, stdout };
  } finally {
    clearTimeout(timeout);
    if (activeChild === child) {
      activeChild = null;
    }
  }
};

const fetchResponse = (url: string, init?: RequestInit) =>
  fetch(url, {
    ...init,
    signal: AbortSignal.timeout(5000),
  });

const waitForHealth = async (
  baseUrl: string,
  deadline = Date.now() + HEALTH_TIMEOUT_MS
): Promise<void> => {
  if (Date.now() >= deadline) {
    throw new Error("container health endpoint did not become ready");
  }

  try {
    const response = await fetchResponse(`${baseUrl}/api/health`);
    if (response.ok) {
      return;
    }
  } catch {
    // Container is still starting.
  }
  await Bun.sleep(500);
  return waitForHealth(baseUrl, deadline);
};

const hostileHostStatus = async (port: number) => {
  const clientRequest = request({
    headers: { host: "hostile.example" },
    hostname: "127.0.0.1",
    method: "GET",
    path: "/api/health",
    port,
  });
  clientRequest.setTimeout(5000, () => {
    clientRequest.destroy(new Error("hostile Host probe timed out"));
  });
  const responseEvent = once(clientRequest, "response");
  clientRequest.end();
  const [response] = (await responseEvent) as [IncomingMessage];
  response.resume();
  await once(response, "end");
  return response.statusCode ?? 0;
};

const assertNonLoopbackConnectionFails = async (port: number) => {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
  assert.ok(
    addresses.length > 0,
    "no non-loopback IPv4 address is available for the refusal probe"
  );

  await Promise.all(
    addresses.map(async (address) => {
      let connected = false;
      try {
        await fetchResponse(`http://${address}:${port}/api/health`);
        connected = true;
      } catch {
        // Refusal or timeout is the required loopback-only behavior.
      }
      assert.equal(
        connected,
        false,
        `application accepted a non-loopback connection through ${address}`
      );
    })
  );
};

const getJson = async <Value>(url: string): Promise<Value> => {
  const response = await fetchResponse(url);
  assert.equal(response.status, 200, `GET ${new URL(url).pathname} failed`);
  return response.json() as Promise<Value>;
};

const expectedEvaluation = (
  id: string,
  writingSample: string
): EvaluationDetail => {
  const characterStart = writingSample.indexOf("fail");
  assert.notEqual(characterStart, -1);
  const byteStart = Buffer.byteLength(
    writingSample.slice(0, characterStart),
    "utf-8"
  );

  return {
    band: "Natural",
    correctedText: writingSample.replace("fail", "fails"),
    evaluatedAt: "2026-09-08T12:00:00.000Z",
    evaluatedEnglishWordCount: 3,
    findings: [
      {
        byteEnd: byteStart + 4,
        byteStart,
        category: "Verb form/tense",
        correction: "fails",
        explanation: "A singular subject needs a singular verb.",
        originalText: "fail",
        severity: "Minor",
      },
    ],
    id,
    model: "deterministic-docker-smoke-model",
    originalText: writingSample,
    provider: "test",
    rubricVersion: "1",
    score: 85,
    suggestions: [],
    summary: "One local agreement error.",
  };
};

const assertNoSentinels = (
  label: string,
  value: string | Uint8Array,
  sentinels: readonly string[]
) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  for (const sentinel of sentinels) {
    assert.equal(
      bytes.includes(Buffer.from(sentinel, "utf-8")),
      false,
      `${label} contains a protected sentinel`
    );
  }
};

const listBrowserAssets = async (
  compose: (arguments_: readonly string[]) => Promise<CommandResult>
) => {
  const listing = await compose([
    "exec",
    "-T",
    "app",
    "bun",
    "-e",
    "const glob = new Bun.Glob('**/*'); for await (const file of glob.scan({ cwd: '../web/dist/assets', onlyFiles: true })) process.stdout.write(file + '\\n');",
  ]);
  return listing.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
};

const main = async () => {
  const tempRoot = await mkdtemp(TEMP_PREFIX);
  const dataDirectory = path.join(tempRoot, "data");
  const safeEnvironmentOverride = path.join(tempRoot, "safe-environment.yml");
  const runtimeOverride = path.join(tempRoot, "runtime.yml");
  const projectName = `prompt-evolution-smoke-${process.pid}-${randomLetters(6)}`;
  const hostPort = await reserveLoopbackPort();
  const secretSentinel = `sk-smoke-${randomLetters(24)}`;
  const sampleSentinel = `smokesample${randomLetters(20)}`;
  const writingSample = `${sampleSentinel} Command fail.`;
  sensitiveValues = [secretSentinel, sampleSentinel, writingSample];
  await mkdir(dataDirectory);
  await Bun.write(
    safeEnvironmentOverride,
    `services:\n  app:\n    environment:\n      OPENROUTER_API_KEY: "${secretSentinel}"\n      SERVER_PORT: "3000"\n`
  );
  await Bun.write(
    runtimeOverride,
    `services:\n  app:\n    environment:\n      OPENROUTER_API_KEY: "${secretSentinel}"\n      SERVER_PORT: "3000"\n    ports: !override\n      - "127.0.0.1:${hostPort}:3000"\n`
  );

  const environment = {
    ...process.env,
    COMPOSE_IGNORE_ORPHANS: "1",
    PROMPT_EVOLUTION_DATA_DIR: dataDirectory,
    PROMPT_EVOLUTION_GID: String(HOST_GROUP_ID),
    PROMPT_EVOLUTION_UID: String(HOST_USER_ID),
  };
  const baseComposeArguments = [
    "compose",
    "--project-name",
    projectName,
    "--file",
    COMPOSE_FILE,
  ] as const;
  const runtimeComposeArguments = [
    ...baseComposeArguments,
    "--file",
    runtimeOverride,
  ] as const;
  const compose = (arguments_: readonly string[]) =>
    runCommand("docker", [...runtimeComposeArguments, ...arguments_], {
      environment,
    });
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      let downError: unknown;
      try {
        await compose([
          "down",
          "--volumes",
          "--remove-orphans",
          "--rmi",
          "local",
        ]);
      } catch (error) {
        downError = error;
      } finally {
        const resolvedTempRoot = path.resolve(tempRoot);
        assert.ok(
          resolvedTempRoot.startsWith(path.resolve(TEMP_PREFIX)),
          "refusing to remove an unexpected path"
        );
        await rm(resolvedTempRoot, { force: true, recursive: true });
      }
      if (downError) {
        throw downError;
      }
    })();
    return cleanupPromise;
  };
  const onSignal = () => {
    process.exitCode = 130;
    activeChild?.kill("SIGTERM");
    void cleanup();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  let failure: unknown;
  try {
    report("Docker smoke: validating release Compose boundary");
    const baseConfig = await runCommand(
      "docker",
      [
        ...baseComposeArguments,
        "--file",
        safeEnvironmentOverride,
        "config",
        "--format",
        "json",
      ],
      { environment }
    );
    const parsedConfig = JSON.parse(baseConfig.stdout) as {
      readonly services?: {
        readonly app?: {
          readonly ports?: ComposePort[];
          readonly user?: string;
        };
      };
    };
    assert.deepEqual(parsedConfig.services?.app?.ports, [
      {
        host_ip: "127.0.0.1",
        mode: "ingress",
        protocol: "tcp",
        published: "3001",
        target: 3000,
      },
    ]);
    assert.equal(
      parsedConfig.services?.app?.user,
      `${HOST_USER_ID}:${HOST_GROUP_ID}`
    );

    report("Docker smoke: building and starting isolated application");
    await compose(["build", "app"]);
    await compose(["up", "--detach", "--no-build", "app"]);
    const baseUrl = `http://127.0.0.1:${hostPort}`;
    await waitForHealth(baseUrl);
    const runtimeUser = await compose([
      "exec",
      "-T",
      "app",
      "bun",
      "-e",
      "process.stdout.write(String(process.getuid?.() ?? -1) + ':' + String(process.getgid?.() ?? -1))",
    ]);
    assert.equal(
      runtimeUser.stdout.trim(),
      `${HOST_USER_ID}:${HOST_GROUP_ID}`,
      "production application must run as the invoking host identity"
    );
    await compose([
      "exec",
      "-T",
      "app",
      "sh",
      "-c",
      "test ! -e /app/.mcp.json && test ! -e /app/.codex && test ! -e /app/.scratch",
    ]);

    const publishedPort = await compose(["port", "app", "3000"]);
    assert.equal(publishedPort.stdout.trim(), `127.0.0.1:${hostPort}`);
    await assertNonLoopbackConnectionFails(hostPort);
    assert.equal(await hostileHostStatus(hostPort), 403);
    const hostileOrigin = await fetchResponse(`${baseUrl}/api/evaluations`, {
      body: JSON.stringify({ writingSample }),
      headers: {
        "content-type": "application/json",
        origin: "https://hostile.example",
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    });
    assert.equal(hostileOrigin.status, 403);

    report("Docker smoke: seeding deterministic retained evidence");
    const seeded = await compose([
      "exec",
      "-T",
      "--env",
      `DOCKER_SMOKE_SAMPLE=${writingSample}`,
      "app",
      "bun",
      "src/test/seed-docker-smoke.ts",
    ]);
    const evaluationId = seeded.stdout.trim();
    assert.match(
      evaluationId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
    const beforeReplacement = await getJson<EvaluationDetail>(
      `${baseUrl}/api/evaluations/${evaluationId}`
    );
    assert.deepEqual(
      beforeReplacement,
      expectedEvaluation(evaluationId, writingSample)
    );

    report("Docker smoke: replacing container and reopening evidence");
    const firstContainerResult = await compose(["ps", "--quiet", "app"]);
    const firstContainer = firstContainerResult.stdout.trim();
    assert.notEqual(firstContainer, "");
    await compose([
      "up",
      "--detach",
      "--force-recreate",
      "--no-build",
      "--no-deps",
      "app",
    ]);
    await waitForHealth(baseUrl);
    const replacementContainerResult = await compose(["ps", "--quiet", "app"]);
    const replacementContainer = replacementContainerResult.stdout.trim();
    assert.notEqual(replacementContainer, firstContainer);
    const afterReplacement = await getJson<EvaluationDetail>(
      `${baseUrl}/api/evaluations/${evaluationId}`
    );
    assert.deepEqual(afterReplacement, beforeReplacement);

    report("Docker smoke: scanning browser assets and logs");
    const indexResponse = await fetchResponse(baseUrl);
    assert.equal(indexResponse.status, 200);
    assertNoSentinels(
      "browser index",
      new Uint8Array(await indexResponse.arrayBuffer()),
      [secretSentinel, sampleSentinel]
    );
    const assetFiles = await listBrowserAssets(compose);
    assert.ok(assetFiles.length > 0, "production browser assets are missing");
    await Promise.all(
      assetFiles.map(async (assetFile) => {
        const assetPath = assetFile
          .split("/")
          .map((part) => encodeURIComponent(part))
          .join("/");
        const assetResponse = await fetchResponse(
          `${baseUrl}/assets/${assetPath}`
        );
        assert.equal(assetResponse.status, 200, `${assetFile} was not served`);
        assertNoSentinels(
          `browser asset ${assetFile}`,
          new Uint8Array(await assetResponse.arrayBuffer()),
          [secretSentinel, sampleSentinel]
        );
      })
    );
    const setup = await getJson<SetupStatus>(`${baseUrl}/api/setup`);
    assert.deepEqual(setup, {
      configured: true,
      dataLocation: path.join(dataDirectory, "local.db"),
      model: "openai/gpt-5.6-terra",
      provider: "OpenRouter",
      rubricVersion: "1",
    });
    assertNoSentinels("setup response", JSON.stringify(setup), [
      secretSentinel,
    ]);
    const logs = await compose(["logs", "--no-color", "app"]);
    assertNoSentinels("container logs", `${logs.stdout}${logs.stderr}`, [
      secretSentinel,
      sampleSentinel,
    ]);
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    try {
      await cleanup();
    } catch (error) {
      failure ??= error;
    }
  }

  if (failure) {
    throw failure;
  }
  report("Docker smoke passed");
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Docker smoke failed: ${redact(message)}\n`);
  process.exitCode = 1;
}
