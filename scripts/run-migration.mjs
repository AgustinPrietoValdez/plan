// Apply a SQL migration to the linked Supabase project via the Management API.
// Requires a Personal Access Token (PAT) from https://supabase.com/dashboard/account/tokens
// passed via SUPABASE_ACCESS_TOKEN env var.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/run-migration.mjs supabase/migrations/0001_initial.sql

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
if (!PROJECT_REF) {
  console.error(
    "Missing SUPABASE_PROJECT_REF. Set it to the project ref of your Supabase project (the slug, e.g. 'xxxxxxxxxxxx').",
  );
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("usage: SUPABASE_PROJECT_REF=xxx SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/run-migration.mjs <path-to-sql-file>");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN. Generate one at https://supabase.com/dashboard/account/tokens",
  );
  process.exit(1);
}

const sql = readFileSync(resolve(file), "utf8");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);

const text = await res.text();
if (!res.ok) {
  console.error(`Migration failed (${res.status}):`);
  console.error(text);
  process.exit(1);
}

console.log("Migration applied:");
console.log(text);
