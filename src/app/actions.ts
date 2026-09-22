"use server";

import { sql } from "@/lib/neon";

// Proves the Neon connection works: the database's clock and Postgres version.
export async function getData() {
  const [row] = await sql()`SELECT now() AS now, version() AS version`;
  return { now: String(row.now), version: String(row.version) };
}
