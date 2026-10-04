import "server-only";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { AppError } from "./http";

export interface SqlConnection {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends SqlConnection {
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
}
const globalDb = globalThis as typeof globalThis & {
  pathwayveDatabase?: Promise<Database>;
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
    return {
      query: (sql, params) => pool.query(sql, params),
      async transaction(work) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const value = await work(client);
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    };
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
  const db = new PGlite(dataDir);
  await db.exec(
    await readFile(resolve("db/migrations/001_schedules.sql"), "utf8"),
  );
  return {
    query: (sql, params) => db.query(sql, params),
    transaction: (work) => db.transaction(work),
  };
}
export function getDatabase() {
  globalDb.pathwayveDatabase ??= connect().catch((error) => {
    delete globalDb.pathwayveDatabase;
    throw error;
  });
  return globalDb.pathwayveDatabase;
}
