import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import path from "node:path";

import { createApp } from "../app";

const readProxyOrigin = async (stdout: ReadableStream<Uint8Array>) => {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Startup chunks must be read sequentially.
      const { done, value } = await reader.read();
      if (done) {
        throw new Error("The proxy test stopped before becoming ready");
      }
      output += decoder.decode(value, { stream: true });
      const newline = output.indexOf("\n");
      if (newline !== -1) {
        return (JSON.parse(output.slice(0, newline)) as { origin: string })
          .origin;
      }
    }
  } finally {
    reader.releaseLock();
  }
};

describe("real development proxy same-origin access", () => {
  const app = createApp({ serveWeb: false, webDistPath: "unused" });
  let proxy: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
  let origin: string;

  beforeAll(async () => {
    app.listen({ hostname: "127.0.0.1", port: 0 });
    const backendOrigin = app.server?.url.origin;
    if (!backendOrigin) {
      throw new Error("The proxy test backend did not start");
    }

    const webRoot = path.resolve(import.meta.dir, "../../../web");
    proxy = Bun.spawn({
      cmd: [
        process.execPath,
        path.join(webRoot, "src/test/dev-proxy-server.ts"),
        backendOrigin,
      ],
      cwd: webRoot,
      env: { ...process.env, NODE_ENV: "test" },
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    });
    origin = await Promise.race([
      readProxyOrigin(proxy.stdout),
      proxy.exited.then(async () => {
        throw new Error(
          `The proxy test could not start: ${await new Response(proxy?.stderr).text()}`
        );
      }),
    ]);
  }, 15_000);

  afterAll(async () => {
    proxy?.kill("SIGTERM");
    await proxy?.exited;
    await app.stop();
  });

  it("accepts a same-origin browser request through Vite before validating its body", async () => {
    const response = await fetch(`${origin}/api/evaluations`, {
      body: "{}",
      headers: { "content-type": "application/json", origin },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid-request" });
  });

  it("still rejects a hostile Origin through Vite", async () => {
    const response = await fetch(`${origin}/api/evaluations`, {
      body: "{}",
      headers: {
        "content-type": "application/json",
        origin: "https://hostile.example",
      },
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden" });
  });

  it("still rejects cross-site requests through Vite", async () => {
    const response = await fetch(`${origin}/api/evaluations`, {
      body: "{}",
      headers: {
        "content-type": "application/json",
        origin,
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden" });
  });

  it("provides a self-contained favicon rather than a missing favicon.ico", async () => {
    const response = await fetch(origin);
    const html = await response.text();

    expect(html).toMatch(
      /<link\b(?=[^>]*\brel="icon")(?=[^>]*\bhref="data:image\/svg\+xml,)[^>]*>/u
    );
  });
});
