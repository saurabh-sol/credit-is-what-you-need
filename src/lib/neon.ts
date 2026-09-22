import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// One Neon client per process; survives hot reloads in dev. The driver talks
// HTTP, so there is no pool to close and it works in serverless runtimes.
const holder = globalThis as { kreditNeon?: NeonQueryFunction<false, false> };

export function sql() {
  if (!holder.kreditNeon) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set. Copy your Neon connection string into .env.local.");
    }
    holder.kreditNeon = neon(url);
  }
  return holder.kreditNeon;
}
