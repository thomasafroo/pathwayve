import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import pg from "pg";
loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL || process.env.TIGER_DATABASE_URL;
if (!url) {
  console.log(
    "No remote database configured. The local development database initializes automatically when schedules are used.",
  );
} else {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      await readFile("db/migrations/001_schedules.sql", "utf8"),
    );
    await client.query("COMMIT");
    console.log("PathWayve schedule tables are ready.");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "Migration failed. Check the database connection and schema permissions.",
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
