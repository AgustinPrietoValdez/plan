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

export type ProjectEstado = "activo" | "pausado" | "terminado";

export interface Milestone {
  id: string;
  title: string;
  description: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  categoryId: string;
  objetivo: string; // NEW: meta del proyecto (= Description en la guia)
  estado: ProjectEstado; // NEW: activo|pausado|terminado
  milestones: Milestone[]; // NEW: hitos/fases (JSON en db)
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
  hiddenFromChart: boolean; // excluida del piechart/leyenda de Presupuesto, pero sigue activa
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
  accountId: string | null; // cuenta que pago el gasto (null = sin cuenta)
  goalId: string | null; // objetivo de ahorro que compra este gasto (Ahorros > Registrar compra)
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
  destinationAccountId: string | null; // cuenta de ahorro/recuperacion (a donde entra la plata)
  purchaseAccountId: string | null; // cuenta desde la que sale la plata al comprar el goal
  position: number;
  purchasedAt: string | null;
  active: boolean; // false = excluido del reparto de % en Presupuesto, pero editable en Ahorros
  priority: boolean; // true = se compro sin llegar al objetivo, hay que recuperar la plata adelantada
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
  accountId: string | null; // cuenta que recibe el ingreso (null = general)
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
  weekStart: string; // lunes de la semana a la que pertenece esta lista (YYYY-MM-DD)
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
  ingredientId: string | null; // null = slot generico (usar categoryId)
  categoryId: string | null; // NEW: ingredient_categories.id cuando es slot generico
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

export interface CoffeeTweak {
  grindSize?: string; // override de la molienda de la receta
  doseGrams?: number;
  totalWaterGrams?: number;
  tempCelsius?: number;
  notes: string; // texto libre
  recipeId?: string | null; // para que receta fue el ajuste (contexto)
  at: string; // ISO timestamp del ajuste
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
  cataInicial: string; // que busco en este cafe (al abrir el grano)
  notaFinal: string; // a donde llegue (al terminarlo)
  lastTweak: CoffeeTweak | null; // ultimo ajuste; salta al brewear este grano
  finishedAt: string | null; // null = activo; ISO = terminado (no tengo mas)
  rating: number | null; // 1-10, cargado al marcar terminado
  flavorTags: string[]; // tags de sabor, cargados al marcar terminado
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type CoffeeStepType = "action" | "pour";
export type WaterMode = "x_cafe" | "pct_agua";

export interface CoffeeRecipeStep {
  type: CoffeeStepType;
  timeSeconds: number;
  description: string;
  waterMode?: WaterMode;    // por paso; default "x_cafe" si ausente
  waterRatio?: number;      // × café (x_cafe) o % del agua total (pct_agua)
  autoComplete?: boolean;   // toma el % que sobra de los otros pours automaticamente
  flowTarget?: number;      // g/s objetivo (banda lento/bien/rápido)
  waterGrams?: number;      // campo legacy — recetas creadas antes de 6b-1
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
  // Receta especifica por grano: general = ambos null; especifica (AI) = ambos seteados.
  beanId: string | null;
  baseRecipeId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface BrewSession {
  id: string;
  recipeId: string | null;
  recipeName: string;
  beanId: string | null;
  beanName: string;
  doseGrams: number;
  totalWaterGrams: number;
  durationMs: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface BrewDatapoint {
  id: number;
  sessionId: string;
  timerMs: number;
  weightG: number | null;
  flowGs: number | null;
  stepIdx: number;
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

export type AccountOwner = "agus" | "sofi" | "shared";
export type AccountType = "checking" | "savings" | "investment" | "broker" | "cash";
export type AccountCurrency = "DKK" | "USD" | "EUR" | "ARS";

export interface Account {
  id: string;
  name: string;
  owner: AccountOwner;
  type: AccountType;
  currency: AccountCurrency;
  balance: number;
  openingBalance: number;
  balanceAsOf: string | null; // YYYY-MM-DD
  receivesIncome: boolean;
  paysExpenses: boolean;
  isSavingsTarget: boolean;
  isInvestmentTarget: boolean;
  syncSource: string; // default 'manual'
  externalRef: string | null;
  institution: string;
  note: string;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type TransferKind = "transfer" | "savings" | "investment";

export interface AccountTransfer {
  id: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number; // en la moneda de la cuenta origen
  currency: string;
  transferredOn: string; // YYYY-MM-DD
  kind: TransferKind;
  goalId: string | null; // meta de ahorro asociada (opcional)
  note: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

/** Finanzas: multi-currency FX settings, one row per user (mirrors ComprasSettings).
 *  ratesPerUsd = units of each currency per 1 USD; ARS uses the "oficial" rate. */
export interface FinanzasSettings {
  id: string;
  baseCurrency: AccountCurrency;
  ratesPerUsd: Record<AccountCurrency, number>;
  ratesUpdatedAt: string | null; // ISO timestamp of the last successful fetch
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

/** Holdings: one net-worth snapshot per user per calendar month (not daily). */
export interface NetWorthSnapshot {
  id: string;
  month: string; // "YYYY-MM"
  amount: number;
  currency: string;
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
