import { createServer } from "vite";

import config from "../../vite.config";

const [target] = process.argv.slice(2);
if (!target || new URL(target).hostname !== "127.0.0.1") {
  throw new Error("The proxy test requires a loopback backend");
}

const configuredProxy = config.server?.proxy?.["/api"];
const proxy =
  typeof configuredProxy === "string" ? target : { ...configuredProxy, target };
const server = await createServer({
  ...config,
  configFile: false,
  logLevel: "silent",
  server: {
    ...config.server,
    port: 0,
    proxy: { ...config.server?.proxy, "/api": proxy },
    strictPort: true,
  },
});
await server.listen();

const address = server.httpServer?.address();
if (!address || typeof address === "string") {
  await server.close();
  throw new Error("The proxy test did not start an HTTP listener");
}
process.stdout.write(
  `${JSON.stringify({ origin: `http://127.0.0.1:${address.port}` })}\n`
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (async () => {
      await server.close();
      process.exit(0);
    })();
  });
}
