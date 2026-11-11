import "dotenv/config";
import { Config, Context, Effect, Layer } from "effect";
import type { Option, Redacted } from "effect";

/**
 * Server-side configuration, read through Effect `Config` so that every value
 * is validated once when the layer is built rather than at import time.
 */
export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly databaseUrl: Redacted.Redacted<string>;
    readonly dataDisplayPath: Option.Option<string>;
    readonly host: string;
    readonly migrationsPath: string;
    readonly nodeEnv: "development" | "production" | "test";
    readonly port: number;
    readonly webDistPath: string;
  }
>()("@english-prompt-evaluation/env/ServerConfig") {
  static readonly layer = Layer.effect(
    ServerConfig,
    Effect.gen(function* () {
      const [
        databaseUrl,
        dataDisplayPath,
        host,
        migrationsPath,
        nodeEnv,
        port,
        webDistPath,
      ] = yield* Config.all([
        Config.redacted("DATABASE_URL"),
        Config.option(Config.nonEmptyString("DATA_DISPLAY_PATH")),
        Config.nonEmptyString("SERVER_HOST").pipe(
          Config.withDefault("127.0.0.1")
        ),
        Config.nonEmptyString("MIGRATIONS_PATH").pipe(
          Config.withDefault("../../packages/db/src/migrations")
        ),
        Config.literals(["development", "production", "test"], "NODE_ENV").pipe(
          Config.withDefault("development" as const)
        ),
        Config.port("SERVER_PORT").pipe(Config.withDefault(3000)),
        Config.nonEmptyString("WEB_DIST_PATH").pipe(
          Config.withDefault("../web/dist")
        ),
      ]);

      return ServerConfig.of({
        dataDisplayPath,
        databaseUrl,
        host,
        migrationsPath,
        nodeEnv,
        port,
        webDistPath,
      });
    })
  );
}
