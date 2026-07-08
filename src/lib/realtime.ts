import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { applyRealtime } from "./sync";
import { supabase } from "./supabase";

export function useRealtimeSync(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("tasks", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("projects", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("categories", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_categories", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("expense_categories", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("expenses", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("budgets", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "savings_goals", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("savings_goals", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "savings_contributions", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("savings_contributions", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incomes", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("incomes", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "habit_logs", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("habit_logs", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_items", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("shopping_items", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ingredients", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("ingredients", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ingredient_presentations", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("ingredient_presentations", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipes", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("recipes", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipe_ingredients", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("recipe_ingredients", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "saved_lists", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("saved_lists", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meal_plan_entries", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("meal_plan_entries", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("inventory", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meal_log", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("meal_log", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "compras_settings", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("compras_settings", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("events", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_line_items", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("expense_line_items", row, qc);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automations", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row) void applyRealtime("automations", row, qc);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
