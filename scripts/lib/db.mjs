// The end-to-end scripts' way into the server's database: the same Postgres,
// through DATABASE_URL (from the environment, or .env.local). Statements use
// `?` for parameters, as the app does.
import fs from "node:fs";
import pg from "pg";

const fromEnvFile = () => {
  try {
    return fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=['"]?([^'"\n]+)/m)?.[1];
  } catch {
    return undefined;
  }
};
const url = process.env.DATABASE_URL || fromEnvFile();
if (!url) throw new Error("DATABASE_URL is not set, and .env.local has none.");

const pool = new pg.Pool({
  connectionString: url.replace(/sslmode=(prefer|require|verify-ca)\b/, "sslmode=verify-full"),
  max: 2,
  allowExitOnIdle: true, // the script ends when its last query has
});

export async function query(text, params = []) {
  let n = 0;
  return pool.query(text.replace(/\?/g, () => `$${++n}`), params);
}
