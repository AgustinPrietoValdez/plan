import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:calendar.db").catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export type DbBool = 0 | 1;

/** Convert SQLite INTEGER (0/1) to TS boolean. */
export function boolFromDb(v: number | null | undefined): boolean {
  return v === 1;
}

/** Parse a JSON-stored TEXT column safely. Returns fallback on parse failure. */
export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
