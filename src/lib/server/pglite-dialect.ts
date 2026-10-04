import { PGlite } from "@electric-sql/pglite";
import {
  CompiledQuery,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from "kysely";

// PGlite has one connection. Hold the lease for an entire Kysely transaction,
// including auth operations, so concurrent requests cannot share a transaction.
export function pgliteDialect(client: PGlite): Dialect {
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      const result = await client.query<R>(query.sql, [...query.parameters]);
      return {
        rows: result.rows,
        numAffectedRows: BigInt(result.affectedRows ?? 0),
      };
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("Streaming is not supported by the local database.");
    },
  };
  let tail = Promise.resolve();
  let release: (() => void) | undefined;
  const driver: Driver = {
    async init() {
      await client.waitReady;
    },
    async acquireConnection() {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      release = unlock;
      return connection;
    },
    async releaseConnection() {
      const unlock = release;
      release = undefined;
      unlock?.();
    },
    async beginTransaction(conn) {
      await conn.executeQuery(CompiledQuery.raw("BEGIN"));
    },
    async commitTransaction(conn) {
      await conn.executeQuery(CompiledQuery.raw("COMMIT"));
    },
    async rollbackTransaction(conn) {
      await conn.executeQuery(CompiledQuery.raw("ROLLBACK"));
    },
    async destroy() {
      await tail;
      await client.close();
    },
  };
  return {
    createDriver: () => driver,
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
}
