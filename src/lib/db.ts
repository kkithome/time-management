import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;

let sql: Sql | null = null;

// Vercel's Neon integration provides DATABASE_URL (POSTGRES_URL as a fallback).
// Checked lazily so a missing variable can't break the build, only the request that needs it.
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

let schemaReady: Promise<void> | null = null;

// Creates the tables on first use, so any brand-new database works without manual SQL.
// Safe to run repeatedly.
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getSql();
    schemaReady = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS research_responses (
          participant_number  text PRIMARY KEY,
          condition_number    text NOT NULL,
          condition           text NOT NULL,
          contact             text NOT NULL,
          attendance          text NOT NULL,
          origin              text,
          already_at_location text,
          departure_time      text,
          calendar_downloaded text,
          submitted_at        timestamptz NOT NULL
        )`;
      await db`
        CREATE TABLE IF NOT EXISTS participant_names (
          token      text PRIMARY KEY,
          first_name text NOT NULL
        )`;
    })().catch((error) => {
      schemaReady = null; // try again on the next request
      throw error;
    });
  }
  return schemaReady;
}
