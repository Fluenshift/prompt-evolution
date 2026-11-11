import { describe, expect, it } from "bun:test";
import path from "node:path";

import { ServerConfig } from "@english-prompt-evaluation/env/server";
import { Effect, Exit, Layer, Option, Redacted } from "effect";

import { Database, DatabaseError } from "./index";

const TestServerConfig = Layer.succeed(
  ServerConfig,
  ServerConfig.of({
    dataDisplayPath: Option.none(),
    databaseUrl: Redacted.make(":memory:"),
    host: "127.0.0.1",
    migrationsPath: path.resolve(import.meta.dir, "migrations"),
    nodeEnv: "test",
    port: 3000,
    webDistPath: "../web/dist",
  })
);

const TestDatabase = Database.layer.pipe(Layer.provide(TestServerConfig));

describe("Database", () => {
  it("migrates product tables and enables durable SQLite invariants", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.run((client) => ({
          foreignKeys: client.$client.query("pragma foreign_keys").get() as {
            foreign_keys: number;
          },
          journalMode: client.$client.query("pragma journal_mode").get() as {
            journal_mode: string;
          },
          tables: client.$client
            .query(
              "select name from sqlite_master where type = 'table' and name in ('evaluations', 'findings', 'suggestions') order by name"
            )
            .all() as { name: string }[],
        }));
      }).pipe(Effect.provide(TestDatabase))
    );

    expect(result.tables.map(({ name }) => name)).toEqual([
      "evaluations",
      "findings",
      "suggestions",
    ]);
    expect(result.foreignKeys.foreign_keys).toBe(1);
    expect(result.journalMode.journal_mode).toBe("memory");
  });

  it("reports connection startup failures as DatabaseError", async () => {
    const brokenConfig = Layer.succeed(
      ServerConfig,
      ServerConfig.of({
        dataDisplayPath: Option.none(),
        databaseUrl: Redacted.make("/dev/null/database.sqlite"),
        host: "127.0.0.1",
        migrationsPath: path.resolve(import.meta.dir, "migrations"),
        nodeEnv: "test",
        port: 3000,
        webDistPath: "../web/dist",
      })
    );
    const outcome = await Effect.runPromiseExit(
      Database.pipe(
        Effect.provide(Database.layer.pipe(Layer.provide(brokenConfig)))
      )
    );

    expect(Exit.isFailure(outcome)).toBe(true);
    expect(Option.getOrUndefined(Exit.findErrorOption(outcome))).toBeInstanceOf(
      DatabaseError
    );
  });
});
