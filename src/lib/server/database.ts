import "server-only";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Kysely, PostgresDialect, CompiledQuery } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { pgliteDialect } from "./pglite-dialect";
import { Pool } from "pg";
import { AppError } from "./http";

export interface SqlConnection {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends SqlConnection {
  authDb?: Kysely<Record<string, never>>;
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
}
function wrap(db: Kysely<Record<string, never>>): Database {
  return {
    authDb: db,
    query: (sql, params = []) =>
      db.executeQuery(CompiledQuery.raw(sql, params)),
    transaction: (work) =>
      db.transaction().execute((tx) =>
        work({
          query: (sql, params = []) =>
            tx.executeQuery(CompiledQuery.raw(sql, params)),
        }),
      ),
  };
}
const globalDb = globalThis as typeof globalThis & {
  pathwayveDatabase?: Promise<Database>;
  pathwayveCalendarMigration?: Promise<unknown>;
};
async function connect(): Promise<Database> {
  const url = process.env.DATABASE_URL || process.env.TIGER_DATABASE_URL;
  if (url) {
    const pool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    return wrap(new Kysely({ dialect: new PostgresDialect({ pool }) }));
  }
  if (process.env.NODE_ENV === "production")
    throw new AppError(
      "DATABASE_CONFIGURATION",
      "Configure DATABASE_URL and run npm run db:migrate to save schedules in production.",
      503,
    );
  const dataDir = resolve(
    /* turbopackIgnore: true */ process.env.PGLITE_DATA_DIR ||
      ".pathwayve/database",
  );
  await mkdir(dirname(dataDir), { recursive: true });
  const client = await PGlite.create(dataDir);
  for (const file of (await readdir(resolve("db/migrations")))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await client.exec(await readFile(resolve("db/migrations", file), "utf8"));
  }
  return wrap(new Kysely({ dialect: pgliteDialect(client) }));
}
export async function getDatabase() {
  globalDb.pathwayveDatabase ??= connect().catch((error) => {
    delete globalDb.pathwayveDatabase;
    throw error;
  });
  const database = await globalDb.pathwayveDatabase;
  // A hot-reloaded development server may already have an embedded connection.
  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.DATABASE_URL &&
    !process.env.TIGER_DATABASE_URL
  ) {
    globalDb.pathwayveCalendarMigration ??= readFile(
      resolve("db/migrations/002_google_calendar.sql"),
      "utf8",
    )
      .then((sql) => database.query(sql))
      .catch((error) => {
        delete globalDb.pathwayveCalendarMigration;
        throw error;
      });
    await globalDb.pathwayveCalendarMigration;
  }
  return database;
}
