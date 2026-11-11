import { Database as SqliteDatabase } from "bun:sqlite";

import { ServerConfig } from "@english-prompt-evaluation/env/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Context, Effect, Layer, Redacted, Schema } from "effect";

import * as schema from "./schema";

export type DrizzleClient = BunSQLiteDatabase<typeof schema> & {
  $client: SqliteDatabase;
};

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    cause: Schema.Defect(),
  }
) {}

/**
 * Drizzle stays the query vocabulary; this service owns the connection
 * lifecycle and turns rejected queries into a typed `DatabaseError`.
 */
export class Database extends Context.Service<
  Database,
  {
    readonly client: DrizzleClient;
    run<A>(
      query: (client: DrizzleClient) => A
    ): Effect.Effect<A, DatabaseError>;
  }
>()("@english-prompt-evaluation/db/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const config = yield* ServerConfig;

      const connection = yield* Effect.acquireRelease(
        Effect.try({
          catch: (cause) => new DatabaseError({ cause }),
          try: () =>
            new SqliteDatabase(
              Redacted.value(config.databaseUrl).replace(/^file:/u, "")
            ),
        }),
        (openConnection) => Effect.sync(() => openConnection.close())
      );

      yield* Effect.try({
        catch: (cause) => new DatabaseError({ cause }),
        try: () =>
          connection.exec(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;"
          ),
      });

      const client = drizzle({ client: connection, schema });

      yield* Effect.try({
        catch: (cause) => new DatabaseError({ cause }),
        try: () => migrate(client, { migrationsFolder: config.migrationsPath }),
      });

      return Database.of({
        client,
        run: Effect.fn("Database.run")(
          <A>(query: (client: DrizzleClient) => A) =>
            Effect.try({
              catch: (cause) => new DatabaseError({ cause }),
              try: () => query(client),
            })
        ),
      });
    })
  );
}
