import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;

let sql: Sql | null = null;

// Reads DATABASE_URL (POSTGRES_URL as a fallback).
// Checked lazily so a missing variable can't break the build, only the request that needs it.
// The tables are created by hand in Neon's SQL Editor; this code never creates them.
export function getSql(): Sql {
  if (!sql) {
    const connectionString =
      process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set.");
    }
    sql = neon(connectionString);
  }
  return sql;
}
