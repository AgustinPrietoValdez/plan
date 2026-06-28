import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getDb } from "./db";
import { supabase } from "./supabase";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

type Entity =
  | "tasks"
  | "projects"
  | "categories"
  | "expense_categories"
  | "expenses"
  | "budgets"
  | "savings_goals"
  | "savings_contributions"
  | "accounts"
  | "account_transfers"
  | "incomes"
  | "habit_logs"
  | "shopping_items"
  | "ingredients"
  | "ingredient_presentations"
  | "recipes"
  | "recipe_ingredients"
  | "saved_lists"
  | "meal_plan_entries"
  | "inventory"
  | "meal_log"
  | "compras_settings"
  | "coffee_beans"
  | "coffee_recipes"
  | "brew_sessions";

interface OutboxRow {
  id: number;
  user_id: string;
  op: "insert" | "update" | "delete";
  entity: Entity;
  entity_id: string;
  payload: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

const META_LAST_SYNC = (userId: string, entity: string) =>
  `last_sync:${userId}:${entity}`;

let statusListeners = new Set<(s: SyncStatus) => void>();
let currentStatus: SyncStatus = "idle";
let drainInFlight = false;
let pullInFlight = false;

function setStatus(s: SyncStatus) {
  currentStatus = s;
  statusListeners.forEach((cb) => cb(s));
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  statusListeners.add(cb);
  cb(currentStatus);
  return () => {
    statusListeners.delete(cb);
  };
}

async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string | null }[]>(
    "SELECT value FROM meta WHERE key = ?",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
    [key, value],
  );
}

/** Push pending mutations to Supabase. Idempotent — safe to call repeatedly. */
export async function drainOutbox(userId: string): Promise<void> {
  if (drainInFlight) return;
  if (!navigator.onLine) {
    setStatus("offline");
    return;
  }
  drainInFlight = true;
  setStatus("syncing");
  try {
    const db = await getDb();
    while (true) {
      const rows = await db.select<OutboxRow[]>(
        "SELECT * FROM outbox WHERE user_id = ? ORDER BY id ASC LIMIT 1",
        [userId],
      );
      const row = rows[0];
      if (!row) break;

      try {
        await applyToServer(row);
        await db.execute("DELETE FROM outbox WHERE id = ?", [row.id]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.execute(
          "UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?",
          [msg, row.id],
        );
        // If the error looks like a network failure, stop and retry later.
        if (isNetworkError(e)) {
          setStatus("offline");
          return;
        }
        // Otherwise the row is stuck — drop it after 5 attempts to avoid
        // blocking the queue, log a warning so the user notices.
        if (row.attempts + 1 >= 5) {
          console.error("Giving up on outbox row after 5 attempts:", row, e);
          await db.execute("DELETE FROM outbox WHERE id = ?", [row.id]);
        } else {
          throw e;
        }
      }
    }
    setStatus("idle");
  } catch (e) {
    console.error("drainOutbox failed:", e);
    setStatus("error");
  } finally {
    drainInFlight = false;
  }
}

async function applyToServer(row: OutboxRow): Promise<void> {
  const payload = row.payload ? JSON.parse(row.payload) : null;
  if (row.op === "insert") {
    if (!payload) throw new Error("insert without payload");
    const { error } = await supabase.from(row.entity).insert(payload);
    if (error) throw error;
  } else if (row.op === "update") {
    if (!payload) throw new Error("update without payload");
    // upsert: server may not have the row if a previous insert is still
    // queued; upsert handles both cases idempotently.
    const { error } = await supabase.from(row.entity).upsert(payload);
    if (error) throw error;
  } else if (row.op === "delete") {
    const { error } = await supabase
      .from(row.entity)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.entity_id);
    if (error) throw error;
  }
}

function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("failed to fetch")
  );
}

/** Pull deltas from Supabase since the last successful pull. */
export async function pullDeltas(userId: string, qc: QueryClient): Promise<void> {
  if (pullInFlight) return;
  if (!navigator.onLine) {
    setStatus("offline");
    return;
  }
  pullInFlight = true;
  if (currentStatus === "idle") setStatus("syncing");
  try {
    let any = false;
    any = (await pullEntity(userId, "tasks")) || any;
    any = (await pullEntity(userId, "projects")) || any;
    any = (await pullEntity(userId, "categories")) || any;
    any = (await pullEntity(userId, "expense_categories")) || any;
    any = (await pullEntity(userId, "expenses")) || any;
    any = (await pullEntity(userId, "budgets")) || any;
    any = (await pullEntity(userId, "savings_goals")) || any;
    any = (await pullEntity(userId, "savings_contributions")) || any;
    any = (await pullEntity(userId, "accounts")) || any;
    any = (await pullEntity(userId, "account_transfers")) || any;
    any = (await pullEntity(userId, "incomes")) || any;
    any = (await pullEntity(userId, "habit_logs")) || any;
    any = (await pullEntity(userId, "shopping_items")) || any;
    any = (await pullEntity(userId, "ingredients")) || any;
    any = (await pullEntity(userId, "ingredient_presentations")) || any;
    any = (await pullEntity(userId, "recipes")) || any;
    any = (await pullEntity(userId, "recipe_ingredients")) || any;
    any = (await pullEntity(userId, "saved_lists")) || any;
    any = (await pullEntity(userId, "meal_plan_entries")) || any;
    any = (await pullEntity(userId, "inventory")) || any;
    any = (await pullEntity(userId, "meal_log")) || any;
    any = (await pullEntity(userId, "compras_settings")) || any;
    try { any = (await pullEntity(userId, "coffee_beans")) || any; } catch (e) { console.warn("coffee_beans pull skipped:", e); }
    try { any = (await pullEntity(userId, "coffee_recipes")) || any; } catch (e) { console.warn("coffee_recipes pull skipped:", e); }
    try { any = (await pullEntity(userId, "brew_sessions")) || any; } catch (e) { console.warn("brew_sessions pull skipped:", e); }
    if (any) {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["expense_categories"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["savings_goals"] });
      qc.invalidateQueries({ queryKey: ["savings_contributions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account_transfers"] });
      qc.invalidateQueries({ queryKey: ["incomes"] });
      qc.invalidateQueries({ queryKey: ["habit_logs"] });
      qc.invalidateQueries({ queryKey: ["shopping_items"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      qc.invalidateQueries({ queryKey: ["ingredient_presentations"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["recipe_ingredients"] });
      qc.invalidateQueries({ queryKey: ["saved_lists"] });
      qc.invalidateQueries({ queryKey: ["meal_plan_entries"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["meal_log"] });
      qc.invalidateQueries({ queryKey: ["compras_settings"] });
      qc.invalidateQueries({ queryKey: ["coffee_beans"] });
      qc.invalidateQueries({ queryKey: ["coffee_recipes"] });
      qc.invalidateQueries({ queryKey: ["brew_sessions"] });
      qc.invalidateQueries({ queryKey: ["brew_datapoints"] });
    }
    if (currentStatus === "syncing") setStatus("idle");
  } catch (e) {
    console.error("pullDeltas failed:", e);
    if (isNetworkError(e)) setStatus("offline");
    else setStatus("error");
  } finally {
    pullInFlight = false;
  }
}

async function pullEntity(
  userId: string,
  entity: Entity,
): Promise<boolean> {
  const lastSync = await getMeta(META_LAST_SYNC(userId, entity));
  const query = supabase.from(entity).select("*").eq("user_id", userId);
  const filtered = lastSync ? query.gt("updated_at", lastSync) : query;
  const { data, error } = await filtered;
  if (error) throw error;
  if (!data || data.length === 0) return false;

  let maxUpdated = lastSync ?? "";
  for (const row of data as Record<string, unknown>[]) {
    await upsertLocal(entity, row);
    const u = row.updated_at as string | undefined;
    if (u && u > maxUpdated) maxUpdated = u;
  }
  if (maxUpdated) await setMeta(META_LAST_SYNC(userId, entity), maxUpdated);
  return true;
}

async function upsertLocal(
  entity: Entity,
  row: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  if (entity === "tasks") {
    await db.execute(
      `INSERT OR REPLACE INTO tasks
        (id, user_id, title, project_id, category_id, priority, duration,
         actual_duration, day, due, recurring, recurrence, recurrence_parent_id,
         notes, subtasks, done, is_habit, completed_at, created_at, updated_at,
         deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.title, row.project_id, row.category_id,
        row.priority, row.duration, row.actual_duration, row.day, row.due,
        row.recurring ? 1 : 0,
        row.recurrence ? JSON.stringify(row.recurrence) : null,
        row.recurrence_parent_id, row.notes,
        JSON.stringify(row.subtasks ?? []),
        row.done ? 1 : 0, row.is_habit ? 1 : 0,
        row.completed_at, row.created_at, row.updated_at,
        row.deleted_at, row.version,
      ],
    );
  } else if (entity === "projects") {
    await db.execute(
      `INSERT OR REPLACE INTO projects
        (id, user_id, name, category_id, objetivo, estado, milestones, archived, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.category_id,
        row.objetivo ?? "", row.estado ?? "activo",
        typeof row.milestones === "string" ? row.milestones : JSON.stringify(row.milestones ?? []),
        row.archived ? 1 : 0, row.created_at, row.updated_at,
        row.deleted_at, row.version,
      ],
    );
  } else if (entity === "categories") {
    await db.execute(
      `INSERT OR REPLACE INTO categories
        (id, user_id, name, hue, position, archived, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.hue, row.position,
        row.archived ? 1 : 0, row.created_at, row.updated_at,
        row.deleted_at, row.version,
      ],
    );
  } else if (entity === "expense_categories") {
    await db.execute(
      `INSERT OR REPLACE INTO expense_categories
        (id, user_id, name, hue, position, archived, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.hue, row.position,
        row.archived ? 1 : 0, row.created_at, row.updated_at,
        row.deleted_at, row.version,
      ],
    );
  } else if (entity === "expenses") {
    await db.execute(
      `INSERT OR REPLACE INTO expenses
        (id, user_id, name, amount, currency, category_id, spent_on, note, account_id,
         recurrence, recurrence_parent_id, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name ?? "", row.amount, row.currency, row.category_id,
        row.spent_on, row.note, row.account_id ?? null,
        row.recurrence ? JSON.stringify(row.recurrence) : null,
        row.recurrence_parent_id, row.created_at, row.updated_at,
        row.deleted_at, row.version,
      ],
    );
  } else if (entity === "budgets") {
    await db.execute(
      `INSERT OR REPLACE INTO budgets
        (id, user_id, category_id, monthly_amount, currency, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.category_id, row.monthly_amount, row.currency,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "savings_goals") {
    await db.execute(
      `INSERT OR REPLACE INTO savings_goals
        (id, user_id, name, target_amount, savings_percent, is_overflow_target, destination_account_id, position, purchased_at, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.target_amount,
        row.savings_percent ?? 0, row.is_overflow_target ? 1 : 0, row.destination_account_id ?? null,
        row.position, row.purchased_at,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "savings_contributions") {
    await db.execute(
      `INSERT OR REPLACE INTO savings_contributions
        (id, user_id, goal_id, month, amount, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.goal_id, row.month, row.amount,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "accounts") {
    await db.execute(
      `INSERT OR REPLACE INTO accounts
        (id, user_id, name, owner, type, currency, balance, opening_balance, balance_as_of,
         receives_income, pays_expenses, is_savings_target, is_investment_target,
         sync_source, external_ref, institution, note, position, archived,
         created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.owner ?? "shared", row.type ?? "checking",
        row.currency ?? "DKK", row.balance ?? 0, row.opening_balance ?? 0, row.balance_as_of ?? null,
        row.receives_income ? 1 : 0, row.pays_expenses ? 1 : 0,
        row.is_savings_target ? 1 : 0, row.is_investment_target ? 1 : 0,
        row.sync_source ?? "manual", row.external_ref ?? null, row.institution ?? "", row.note ?? "",
        row.position ?? 0, row.archived ? 1 : 0,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "account_transfers") {
    await db.execute(
      `INSERT OR REPLACE INTO account_transfers
        (id, user_id, from_account_id, to_account_id, amount, currency, transferred_on, kind, goal_id, note, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.from_account_id ?? null, row.to_account_id ?? null,
        row.amount ?? 0, row.currency ?? "DKK", row.transferred_on, row.kind ?? "transfer",
        row.goal_id ?? null, row.note ?? "",
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "incomes") {
    await db.execute(
      `INSERT OR REPLACE INTO incomes
        (id, user_id, month, amount, currency, account_id, note, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.month, row.amount, row.currency, row.account_id ?? null, row.note ?? "",
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "habit_logs") {
    await db.execute(
      `INSERT OR REPLACE INTO habit_logs
        (id, user_id, task_id, day, done, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.task_id, row.day,
        row.done ? 1 : 0,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "shopping_items") {
    await db.execute(
      `INSERT OR REPLACE INTO shopping_items
        (id, user_id, name, quantity, bought, position, ingredient_id, presentation_id, unit, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.quantity,
        row.bought ? 1 : 0, row.position,
        row.ingredient_id ?? null, row.presentation_id ?? null, row.unit ?? null,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "ingredients") {
    await db.execute(
      `INSERT OR REPLACE INTO ingredients
        (id, user_id, name, dimension, shelf_life_days, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.dimension, row.shelf_life_days ?? null,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "ingredient_presentations") {
    await db.execute(
      `INSERT OR REPLACE INTO ingredient_presentations
        (id, user_id, ingredient_id, label, size, price, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.ingredient_id, row.label, row.size, row.price ?? null,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "recipes") {
    await db.execute(
      `INSERT OR REPLACE INTO recipes
        (id, user_id, name, servings, meal_type, steps, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.servings, row.meal_type,
        JSON.stringify(row.steps ?? []),
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "recipe_ingredients") {
    await db.execute(
      `INSERT OR REPLACE INTO recipe_ingredients
        (id, user_id, recipe_id, ingredient_id, category_id, quantity, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.recipe_id, row.ingredient_id ?? "", row.category_id ?? null, row.quantity,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "saved_lists") {
    await db.execute(
      `INSERT OR REPLACE INTO saved_lists
        (id, user_id, name, items, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name,
        JSON.stringify(row.items ?? []),
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "meal_plan_entries") {
    await db.execute(
      `INSERT OR REPLACE INTO meal_plan_entries
        (id, user_id, week_start, recipe_id, target_servings, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.week_start, row.recipe_id, row.target_servings,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "inventory") {
    await db.execute(
      `INSERT OR REPLACE INTO inventory
        (id, user_id, ingredient_id, presentation_id, quantity, expires_on, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.ingredient_id, row.presentation_id ?? null, row.quantity, row.expires_on ?? null,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "meal_log") {
    await db.execute(
      `INSERT OR REPLACE INTO meal_log
        (id, user_id, eaten_on, meal_slot, recipe_id, servings, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.eaten_on, row.meal_slot, row.recipe_id, row.servings,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "compras_settings") {
    await db.execute(
      `INSERT OR REPLACE INTO compras_settings
        (id, user_id, meal_times, expiry_warn_days, notifications_enabled, dkk_per_usd, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id,
        typeof row.meal_times === "string" ? row.meal_times : JSON.stringify(row.meal_times ?? {}),
        row.expiry_warn_days, row.notifications_enabled ? 1 : 0, row.dkk_per_usd,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "coffee_beans") {
    await db.execute(
      `INSERT OR REPLACE INTO coffee_beans
        (id, user_id, name, roaster, varietal, country, process, producer, roasted_on, weight_grams, notes, cata_inicial, nota_final, last_tweak, finished_at, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.roaster ?? "", row.varietal ?? "", row.country ?? "",
        row.process ?? "", row.producer ?? "", row.roasted_on ?? null, row.weight_grams ?? 0, row.notes ?? "",
        row.cata_inicial ?? "", row.nota_final ?? "",
        typeof row.last_tweak === "string" ? row.last_tweak : JSON.stringify(row.last_tweak ?? null),
        row.finished_at ?? null,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "coffee_recipes") {
    await db.execute(
      `INSERT OR REPLACE INTO coffee_recipes
        (id, user_id, name, coffee_type, ratio, temp_celsius, grind_size, steps, notes, bean_id, base_recipe_id, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.name, row.coffee_type ?? "", row.ratio ?? 15, row.temp_celsius ?? 93,
        row.grind_size ?? "", typeof row.steps === "string" ? row.steps : JSON.stringify(row.steps ?? []),
        row.notes ?? "", row.bean_id ?? null, row.base_recipe_id ?? null,
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
  } else if (entity === "brew_sessions") {
    await db.execute(
      `INSERT OR REPLACE INTO brew_sessions
        (id, user_id, recipe_id, recipe_name, bean_id, bean_name,
         dose_grams, total_water_grams, duration_ms, notes, datapoints,
         created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.user_id, row.recipe_id ?? null, row.recipe_name ?? "",
        row.bean_id ?? null, row.bean_name ?? "", row.dose_grams ?? 0,
        row.total_water_grams ?? 0, row.duration_ms ?? 0, row.notes ?? "",
        typeof row.datapoints === "string" ? row.datapoints : JSON.stringify(row.datapoints ?? []),
        row.created_at, row.updated_at, row.deleted_at, row.version,
      ],
    );
    // reconstruir los datapoints locales desde el blob (idempotente: borrar antes)
    await db.execute("DELETE FROM brew_datapoints WHERE session_id = ?", [row.id]);
    if (!row.deleted_at) {
      const raw = typeof row.datapoints === "string" ? row.datapoints : JSON.stringify(row.datapoints ?? []);
      let points: Array<{ timer_ms?: number; weight_g?: number | null; flow_g_s?: number | null; step_idx?: number }> = [];
      try { points = JSON.parse(raw); } catch { points = []; }
      for (let i = 0; i < points.length; i += 100) {
        for (const p of points.slice(i, i + 100)) {
          await db.execute(
            "INSERT INTO brew_datapoints (session_id, timer_ms, weight_g, flow_g_s, step_idx) VALUES (?, ?, ?, ?, ?)",
            [row.id, p.timer_ms ?? 0, p.weight_g ?? null, p.flow_g_s ?? null, p.step_idx ?? 0],
          );
        }
      }
    }
  }
}

/** Apply a Realtime payload to local SQLite then invalidate matching queries. */
export async function applyRealtime(
  entity: Entity,
  row: Record<string, unknown>,
  qc: QueryClient,
): Promise<void> {
  await upsertLocal(entity, row);
  qc.invalidateQueries({ queryKey: [entity] });
}

/** React hook: kicks off sync + listens for online/offline + outbox enqueues. */
export function useSyncEngine(userId: string | undefined): SyncStatus {
  const qc = useQueryClient();
  const [status, setStatusState] = useState<SyncStatus>(currentStatus);

  useEffect(() => onSyncStatus(setStatusState), []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await drainOutbox(userId);
      await pullDeltas(userId, qc);
    };

    // Initial sync
    void tick();

    // Periodic poll: every 60s, in case Realtime missed an update.
    const interval = window.setInterval(() => void tick(), 60_000);

    // Outbox enqueue → drain immediately
    const onEnqueued = () => void drainOutbox(userId);
    window.addEventListener("outbox:enqueued", onEnqueued);

    // Online → drain + pull
    const onOnline = () => void tick();
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if (!navigator.onLine) setStatus("offline");

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("outbox:enqueued", onEnqueued);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [userId, qc]);

  return status;
}
