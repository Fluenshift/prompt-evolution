import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Database } from "@english-prompt-evaluation/db";
import { ServerConfig } from "@english-prompt-evaluation/env/server";
import { Layer, Option, Redacted } from "effect";

export const makeTemporaryDatabase = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "prompt-evolution-"));
  const databasePath = path.join(directory, "test.sqlite");
  const config = Layer.succeed(
    ServerConfig,
    ServerConfig.of({
      dataDisplayPath: Option.none(),
      databaseUrl: Redacted.make(databasePath),
      host: "127.0.0.1",
      migrationsPath: path.resolve(
        import.meta.dir,
        "../../../../packages/db/src/migrations"
      ),
      nodeEnv: "test",
      port: 3000,
      webDistPath: "../web/dist",
    })
  );

  return {
    databasePath,
    directory,
    layer: Database.layer.pipe(Layer.provide(config)),
  };
};
