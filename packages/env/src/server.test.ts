import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit, Layer, Option, Redacted } from "effect";

import { ServerConfig } from "./server";

const withEnv = (env: Record<string, string>) =>
  ServerConfig.layer.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)))
  );

describe("ServerConfig", () => {
  it.effect("applies defaults when only DATABASE_URL is set", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig;

      assert.strictEqual(Redacted.value(config.databaseUrl), "file:local.db");
      assert.isTrue(Option.isNone(config.dataDisplayPath));
      assert.strictEqual(config.host, "127.0.0.1");
      assert.strictEqual(
        config.migrationsPath,
        "../../packages/db/src/migrations"
      );
      assert.strictEqual(config.nodeEnv, "development");
      assert.strictEqual(config.port, 3000);
      assert.strictEqual(config.webDistPath, "../web/dist");
    }).pipe(Effect.provide(withEnv({ DATABASE_URL: "file:local.db" })))
  );

  it.effect("reads explicit values", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig;

      assert.strictEqual(config.host, "0.0.0.0");
      assert.strictEqual(
        Option.getOrThrow(config.dataDisplayPath),
        "./retained/local.db"
      );
      assert.strictEqual(config.migrationsPath, "/srv/migrations");
      assert.strictEqual(config.nodeEnv, "production");
      assert.strictEqual(config.port, 8080);
      assert.strictEqual(config.webDistPath, "/srv/web");
    }).pipe(
      Effect.provide(
        withEnv({
          DATABASE_URL: "file:/data/local.db",
          DATA_DISPLAY_PATH: "./retained/local.db",
          MIGRATIONS_PATH: "/srv/migrations",
          NODE_ENV: "production",
          SERVER_HOST: "0.0.0.0",
          SERVER_PORT: "8080",
          WEB_DIST_PATH: "/srv/web",
        })
      )
    )
  );

  it.effect("fails when DATABASE_URL is missing", () =>
    Effect.gen(function* () {
      const outcome = yield* Effect.exit(
        Effect.provide(ServerConfig, withEnv({}))
      );

      assert.isTrue(Exit.isFailure(outcome));
    })
  );

  it.effect("rejects a NODE_ENV outside the allowed set", () =>
    Effect.gen(function* () {
      const outcome = yield* Effect.exit(
        Effect.provide(
          ServerConfig,
          withEnv({ DATABASE_URL: "file:local.db", NODE_ENV: "staging" })
        )
      );

      assert.isTrue(Exit.isFailure(outcome));
    })
  );
});
