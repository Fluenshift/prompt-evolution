import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
import { Config, Effect } from "effect";

dotenv.config({
  path: "../../apps/server/.env",
});

const databaseUrl = Effect.runSync(Config.nonEmptyString("DATABASE_URL"));

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: "sqlite",
  out: "./src/migrations",
  schema: "./src/schema",
});
