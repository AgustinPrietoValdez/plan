export type Priority = "low" | "med" | "high";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export type RecurrenceRule =
  | { kind: "daily"; interval: number }
  | { kind: "weekly"; interval: number; weekdays: number[] }
  | { kind: "monthly"; interval: number; dayOfMonth: number };

export interface Task {
  id: string;
  title: string;
  projectId: string | null;
  categoryId: string | null;
  priority: Priority;
  duration: number;
  actualDuration: number | null;
  day: string | null;
  due: string | null;
  recurring: boolean;
  recurrence: RecurrenceRule | null;
  recurrenceParentId: string | null;
  notes: string;
  subtasks: Subtask[];
  done: boolean;
  isHabit: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface HabitLog {
  id: string;
  taskId: string;
  day: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Project {
  id: string;
  name: string;
  categoryId: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Category {
  id: string;
  name: string;
  hue: number;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

/** Derived color pair for a category — computed from hue, not stored. */
export interface CategoryColors {
  bg: string;
  fg: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  hue: number;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface IngredientCategory {
  id: string;
  name: string;
  hue: number;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  spentOn: string;
  note: string;
  recurrence: RecurrenceRule | null;
  recurrenceParentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface ExpenseLineItem {
  id: string;
  expenseId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Budget {
  id: string;
  categoryId: string;
  monthlyAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number | null;
  savingsPercent: number;
  isOverflowTarget: boolean;
  position: number;
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface SavingsContribution {
  id: string;
  goalId: string;
  month: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Income {
  id: string;
  month: string;
  amount: number;
  currency: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  bought: boolean;
  position: number;
  ingredientId: string | null;
  presentationId: string | null;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface SavedListItem {
  name: string;
  quantity: number;
  ingredientId?: string | null;
  presentationId?: string | null;
  unit?: string | null;
}

export interface SavedList {
  id: string;
  name: string;
  items: SavedListItem[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type IngredientDimension = "weight" | "volume" | "count";

export interface Ingredient {
  id: string;
  name: string;
  categoryId: string | null;
  dimension: IngredientDimension;
  shelfLifeDays: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface IngredientPresentation {
  id: string;
  ingredientId: string;
  label: string;
  size: number;
  price: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type MealType = "breakfast_snack" | "lunch_dinner";

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  mealType: MealType;
  steps: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface MealPlanEntry {
  id: string;
  weekStart: string;
  recipeId: string;
  targetServings: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface InventoryItem {
  id: string;
  ingredientId: string;
  presentationId: string | null;
  quantity: number;
  expiresOn: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type MealSlot = "desayuno" | "almuerzo" | "merienda" | "cena";

export type MealTimes = Record<MealSlot, string>; // "HH:MM" per slot

export interface ComprasSettings {
  id: string;
  mealTimes: MealTimes;
  expiryWarnDays: number;
  notificationsEnabled: boolean;
  dkkPerUsd: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface MealLog {
  id: string;
  eatenOn: string;
  mealSlot: MealSlot;
  recipeId: string;
  servings: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface CoffeeBean {
  id: string;
  name: string;
  roaster: string;
  varietal: string;
  country: string;
  process: string;
  producer: string;
  roastedOn: string | null;
  weightGrams: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface CoffeeRecipeStep {
  timeSeconds: number;
  waterGrams: number;
  description: string;
}

export interface CoffeeRecipe {
  id: string;
  name: string;
  coffeeType: string;
  ratio: number;
  tempCelsius: number;
  grindSize: string;
  steps: CoffeeRecipeStep[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Automation {
  id: string;
  projectId: string | null;
  name: string;
  kind: string;
  config: Record<string, unknown>;
  trigger: "manual" | "scheduled";
  schedule: string | null;
  enabled: boolean;
  notes: string;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  day: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  notifyMinutesBefore: number | null;
  notes: string;
  categoryId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}
