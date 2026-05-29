import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Schedule,
  cancelAll,
  isPermissionGranted,
} from "@tauri-apps/plugin-notification";
import {
  useComprasSettings,
  useIngredients,
  useInventory,
  useRecipeIngredients,
  useRecipes,
} from "./queries";
import { suggestRecipesForExpiringLots } from "./compras";
import { fromYmd } from "./date";
import type { MealSlot } from "../types";

const SLOT_ORDER: MealSlot[] = ["desayuno", "almuerzo", "merienda", "cena"];
const SLOT_PHRASE: Record<MealSlot, string> = {
  desayuno: "el desayuno",
  almuerzo: "el almuerzo",
  merienda: "la merienda",
  cena: "la cena",
};

/** Schedules local notifications on the phone from the synced Compras settings.
 *  Permission must be granted via a user gesture (Android initializes its
 *  permission launcher only after the activity is interactive), so when
 *  notifications are enabled in settings but the OS permission isn't granted,
 *  `needsPermission` becomes true and the UI shows a one-tap "enable" button. */
export function useComprasNotifications() {
  const settingsQ = useComprasSettings();
  const inventoryQ = useInventory();
  const ingredientsQ = useIngredients();
  const recipesQ = useRecipes();
  const recipeIngredientsQ = useRecipeIngredients();
  const settings = settingsQ.data;
  const inventory = inventoryQ.data;
  const ingredients = ingredientsQ.data;
  const recipes = recipesQ.data;
  const recipeIngredients = recipeIngredientsQ.data;
  const [needsPermission, setNeedsPermission] = useState(false);

  // Stable key — only re-schedule when the meaningful inputs change, not on
  // every realtime row update (each sync returns new array refs and would
  // otherwise re-fire the effect).
  const configKey = useMemo(() => {
    if (!settings?.notificationsEnabled) return "off";
    return JSON.stringify({
      meal: settings.mealTimes,
      lead: settings.expiryWarnDays,
      lots: (inventory ?? [])
        .filter((l) => l.expiresOn)
        .map((l) => ({ i: l.id, e: l.expiresOn, ing: l.ingredientId }))
        .sort((a, b) => a.i.localeCompare(b.i)),
      names: (ingredients ?? [])
        .map((i) => ({ i: i.id, n: i.name }))
        .sort((a, b) => a.i.localeCompare(b.i)),
      recipes: (recipes ?? [])
        .map((r) => ({ i: r.id, n: r.name }))
        .sort((a, b) => a.i.localeCompare(b.i)),
      ris: (recipeIngredients ?? [])
        .map((ri) => ({ i: ri.id, r: ri.recipeId, ing: ri.ingredientId }))
        .sort((a, b) => a.i.localeCompare(b.i)),
    });
  }, [settings, inventory, ingredients, recipes, recipeIngredients]);

  const schedule = useCallback(async () => {
    await cancelAll();
    if (!settings?.notificationsEnabled) return;

    let id = 1;

    // NOTE: two layers of plugin foot-gun to dodge here.
    // 1) The plugin's `sendNotification` JS helper uses the Web Notifications
    //    API (`new window.Notification`), which fires immediately and ignores
    //    the `schedule` field. So we have to invoke the Rust command directly.
    // 2) `Schedule.interval(...)`/`Schedule.at(...)` return objects with the
    //    sibling variants set to `undefined` (e.g. `{at, interval: undefined,
    //    every: undefined}`). Tauri's IPC bridge turns `undefined` into `null`,
    //    and serde's externally-tagged `Schedule` enum refuses any payload
    //    where more than one variant key is present (even if nulled). The
    //    deserializer silently falls back to `schedule: None`, which makes the
    //    plugin treat the notification as instant — causing the spam. Strip
    //    nullish keys before invoking.
    const scheduleNotification = (options: {
      id: number;
      title: string;
      body: string;
      schedule: ReturnType<typeof Schedule.interval> | ReturnType<typeof Schedule.at>;
    }) => {
      const raw = options.schedule as unknown as Record<string, unknown>;
      const cleanSchedule = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v != null),
      );
      return invoke("plugin:notification|notify", {
        options: { ...options, schedule: cleanSchedule },
      });
    };

    for (const slot of SLOT_ORDER) {
      const time = settings.mealTimes[slot];
      if (!time) continue;
      const [h, m] = time.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
      await scheduleNotification({
        id: id++,
        title: "¿Qué vas a comer?",
        body: `Es la hora de ${SLOT_PHRASE[slot]}. Registralo en la app.`,
        schedule: Schedule.interval({ hour: h, minute: m, second: 0 }, true),
      });
    }

    const nameById = new Map((ingredients ?? []).map((i) => [i.id, i.name]));
    const lead = settings.expiryWarnDays ?? 2;
    const now = Date.now();

    // Map ingredientId → best recipe (highest coverage) that uses an expiring lot
    // of that ingredient. Computed once; reused per lot to enrich the alert body.
    const suggestionByIngredient = new Map<string, string>();
    const suggestions = suggestRecipesForExpiringLots(
      inventory ?? [],
      recipes ?? [],
      recipeIngredients ?? [],
      Math.max(lead, 5),
    );
    for (const s of suggestions) {
      for (const ingId of s.matchedIngredientIds) {
        if (!suggestionByIngredient.has(ingId)) {
          suggestionByIngredient.set(ingId, s.recipe.name);
        }
      }
    }

    for (const lot of inventory ?? []) {
      if (!lot.expiresOn) continue;
      const warn = fromYmd(lot.expiresOn);
      warn.setDate(warn.getDate() - lead);
      warn.setHours(9, 0, 0, 0);
      if (warn.getTime() <= now) continue;
      const name = nameById.get(lot.ingredientId) ?? "Un producto";
      const suggested = suggestionByIngredient.get(lot.ingredientId);
      const body = suggested
        ? `${name} vence el ${lot.expiresOn}. Podés cocinar ${suggested}.`
        : `${name} vence el ${lot.expiresOn}.`;
      await scheduleNotification({
        id: id++,
        title: "Algo se va a vencer",
        body,
        schedule: Schedule.at(warn, false, true),
      });
    }
  }, [settings, inventory, ingredients, recipes, recipeIngredients]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!settings?.notificationsEnabled) {
          await cancelAll();
          if (!cancelled) setNeedsPermission(false);
          return;
        }
        const granted = await isPermissionGranted();
        if (cancelled) return;
        if (granted) {
          setNeedsPermission(false);
          await schedule();
        } else {
          setNeedsPermission(true);
        }
      } catch (e) {
        console.error("notifications check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // configKey collapses inventory/ingredient array identity churn into a
    // stable string; schedule is re-derived but only used when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  /** Call from a user gesture: triggers our MainActivity-side permission
   *  launcher (which works, unlike the plugin's broken one), or opens the
   *  app's notification settings page if the OS has silenced the prompt. */
  const enableNotifications = useCallback(async () => {
    try {
      await invoke("request_or_open_notification_settings");
    } catch (e) {
      console.error("request_or_open_notification_settings failed:", e);
    }
    // Re-check after a short delay so the OS has time to update state once the
    // user taps Allow / returns from settings. Optimistic: if not granted yet,
    // the next render of the banner stays visible and the user can re-tap.
    setTimeout(async () => {
      try {
        const granted = await isPermissionGranted();
        if (granted) {
          setNeedsPermission(false);
          await invoke("plugin:notification|notify", {
            options: {
              title: "Notificaciones activadas",
              body: "Te voy a avisar de vencimientos y horarios de comida.",
            },
          });
          await schedule();
        }
      } catch {
        /* ignore */
      }
    }, 600);
  }, [schedule]);

  return { needsPermission, enableNotifications };
}
