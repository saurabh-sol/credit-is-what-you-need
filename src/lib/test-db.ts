import { PGlite } from "@electric-sql/pglite";
import { configureDb, type Backend, type Sql } from "./db.ts";

// An embedded Postgres for the tests: the real dialect, no server, gone when
// the process ends. Call it before anything that touches the database.
export async function useTestDatabase() {
  const lite = new PGlite();
  await lite.waitReady;
  const wrap = (client: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  }): Sql => ({
    async query<T>(text: string, params: unknown[] = []) {
      const result = await client.query(text, params);
      return { rows: result.rows as T[], rowCount: result.affectedRows ?? 0 };
    },
  });
  const backend: Backend = {
    ...wrap(lite),
    async exec(text) {
      await lite.exec(text);
    },
    transaction: (work) => lite.transaction((tx) => work(wrap(tx))),
  };
  configureDb(backend);
  return lite;
}
