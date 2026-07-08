import type {
  Account,
  AccountTransfer,
  Automation,
  BrewDatapoint,
  BrewSession,
  Budget,
  CalendarEvent,
  Category,
  CoffeeBean,
  CoffeeRecipe,
  CoffeeTweak,
  ComprasSettings,
  Expense,
  ExpenseCategory,
  ExpenseLineItem,
  FinanzasSettings,
  HabitLog,
  Income,
  Ingredient,
  IngredientCategory,
  IngredientPresentation,
  InventoryItem,
  MealLog,
  MealPlanEntry,
  NetWorthSnapshot,
  Project,
  ProjectEstado,
  Milestone,
  Recipe,
  RecipeIngredient,
  SavedList,
  SavingsContribution,
  SavingsGoal,
  ShoppingItem,
  Task,
} from "../../types";

export type TaskCreate = Pick<
  Task,
  | "title"
  | "projectId"
  | "categoryId"
  | "priority"
  | "duration"
  | "day"
  | "due"
  | "recurring"
  | "recurrence"
  | "recurrenceParentId"
  | "notes"
  | "subtasks"
> & { isHabit?: boolean };

export type TaskPatch = Partial<
  Omit<Task, "id" | "createdAt" | "version">
>;

export type ProjectCreate = Pick<Project, "name" | "categoryId"> & {
  objetivo?: string;
  estado?: ProjectEstado;
  milestones?: Milestone[];
};
export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt" | "version">>;

export type CategoryCreate = Pick<Category, "name" | "hue"> & { position?: number };
export type CategoryPatch = Partial<Omit<Category, "id" | "createdAt" | "version">>;

export type ExpenseCategoryCreate = Pick<ExpenseCategory, "name" | "hue"> & { position?: number };
export type ExpenseCategoryPatch = Partial<Omit<ExpenseCategory, "id" | "createdAt" | "version">>;

export type IngredientCategoryCreate = Pick<IngredientCategory, "name" | "hue"> & { position?: number };
export type IngredientCategoryPatch = Partial<Omit<IngredientCategory, "id" | "createdAt" | "version">>;

export type ExpenseCreate = Pick<
  Expense,
  "name" | "amount" | "currency" | "categoryId" | "spentOn" | "note" | "recurrence" | "recurrenceParentId"
> & { accountId?: string | null; goalId?: string | null };
export type ExpensePatch = Partial<Omit<Expense, "id" | "createdAt" | "version">>;

export type ExpenseLineItemCreate = Pick<ExpenseLineItem, "expenseId" | "name" | "quantity" | "unitPrice">;
export type ExpenseLineItemPatch = Partial<Omit<ExpenseLineItem, "id" | "expenseId" | "createdAt" | "version">>;

export type BudgetUpsert = Pick<Budget, "categoryId" | "monthlyAmount" | "currency">;

export type SavingsGoalCreate = Pick<SavingsGoal, "name" | "targetAmount"> & {
  position?: number;
  savingsPercent?: number;
  isOverflowTarget?: boolean;
  destinationAccountId?: string | null;
};
export type SavingsGoalPatch = Partial<Omit<SavingsGoal, "id" | "createdAt" | "version">>;

export type SavingsContributionUpsert = Pick<SavingsContribution, "goalId" | "month" | "amount">;

export type AccountCreate = Pick<
  Account,
  "name" | "owner" | "type" | "currency" | "balance" | "openingBalance"
> & {
  balanceAsOf?: string | null;
  receivesIncome?: boolean;
  paysExpenses?: boolean;
  isSavingsTarget?: boolean;
  isInvestmentTarget?: boolean;
  syncSource?: string;
  externalRef?: string | null;
  institution?: string;
  note?: string;
  position?: number;
};
export type AccountPatch = Partial<Omit<Account, "id" | "createdAt" | "version">>;

export type IncomeUpsert = Pick<Income, "month" | "amount" | "currency"> & {
  note?: string;
  accountId?: string | null;
};

export type AccountTransferCreate = Pick<
  AccountTransfer,
  "fromAccountId" | "toAccountId" | "amount" | "currency" | "transferredOn" | "kind"
> & { goalId?: string | null; note?: string };
export type AccountTransferPatch = Partial<Omit<AccountTransfer, "id" | "createdAt" | "version">>;

export type HabitLogUpsert = Pick<HabitLog, "taskId" | "day" | "done">;

export type ShoppingItemCreate = Pick<ShoppingItem, "name" | "quantity" | "weekStart"> & {
  position?: number;
  ingredientId?: string | null;
  presentationId?: string | null;
  unit?: string | null;
};
export type ShoppingItemPatch = Partial<Omit<ShoppingItem, "id" | "createdAt" | "version">>;

export type SavedListCreate = Pick<SavedList, "name" | "items">;
export type SavedListPatch = Partial<Omit<SavedList, "id" | "createdAt" | "version">>;

export type MealPlanEntryCreate = Pick<MealPlanEntry, "weekStart" | "recipeId" | "targetServings">;
export type MealPlanEntryPatch = Partial<Omit<MealPlanEntry, "id" | "createdAt" | "version">>;

export type InventoryCreate = Pick<InventoryItem, "ingredientId" | "presentationId" | "quantity" | "expiresOn">;
export type InventoryPatch = Partial<Omit<InventoryItem, "id" | "ingredientId" | "createdAt" | "version">>;

export type MealLogCreate = Pick<MealLog, "eatenOn" | "mealSlot" | "recipeId" | "servings">;

export type ComprasSettingsUpsert = Partial<
  Pick<ComprasSettings, "mealTimes" | "expiryWarnDays" | "notificationsEnabled" | "dkkPerUsd">
>;

export type FinanzasSettingsUpsert = Partial<
  Pick<FinanzasSettings, "baseCurrency" | "ratesPerUsd" | "ratesUpdatedAt">
>;

export type NetWorthSnapshotUpsert = Pick<NetWorthSnapshot, "month" | "amount" | "currency">;

export type CoffeeBeanCreate = Pick<CoffeeBean, "name"> & {
  roaster?: string;
  varietal?: string;
  country?: string;
  process?: string;
  producer?: string;
  roastedOn?: string | null;
  weightGrams?: number;
  notes?: string;
  cataInicial?: string;
  notaFinal?: string;
  lastTweak?: CoffeeTweak | null;
  finishedAt?: string | null;
};
export type CoffeeBeanPatch = Partial<Omit<CoffeeBean, "id" | "createdAt" | "version">>;

export type CoffeeRecipeCreate = Pick<CoffeeRecipe, "name"> & {
  coffeeType?: string;
  ratio?: number;
  tempCelsius?: number;
  grindSize?: string;
  steps?: CoffeeRecipe["steps"];
  notes?: string;
  beanId?: string | null;
  baseRecipeId?: string | null;
};
export type CoffeeRecipePatch = Partial<Omit<CoffeeRecipe, "id" | "createdAt" | "version">>;

export type BrewSessionCreate = {
  recipeId?: string | null;
  recipeName?: string;
  beanId?: string | null;
  beanName?: string;
  doseGrams: number;
  totalWaterGrams?: number;
  durationMs?: number;
  notes?: string;
  datapoints?: Omit<BrewDatapoint, "id" | "sessionId">[];
};

export type AutomationCreate = Pick<Automation, "name" | "kind"> & {
  projectId?: string | null;
  config?: Record<string, unknown>;
  trigger?: "manual" | "scheduled";
  schedule?: string | null;
  enabled?: boolean;
  notes?: string;
};
export type AutomationPatch = Partial<Omit<Automation, "id" | "createdAt" | "version">>;

export type EventCreate = Pick<CalendarEvent, "title" | "day"> & {
  startTime?: string | null;
  endTime?: string | null;
  location?: string;
  notifyMinutesBefore?: number | null;
  notes?: string;
  categoryId?: string | null;
  projectId?: string | null;
};

export type EventPatch = Partial<Omit<CalendarEvent, "id" | "createdAt" | "version">>;

export type IngredientCreate = Pick<Ingredient, "name" | "categoryId" | "dimension" | "shelfLifeDays">;
export type IngredientPatch = Partial<Omit<Ingredient, "id" | "createdAt" | "version">>;

export type IngredientPresentationCreate = Pick<
  IngredientPresentation,
  "ingredientId" | "label" | "size" | "price"
>;
export type IngredientPresentationPatch = Partial<
  Omit<IngredientPresentation, "id" | "ingredientId" | "createdAt" | "version">
>;

export type RecipeCreate = Pick<Recipe, "name" | "servings" | "mealType" | "steps">;
export type RecipePatch = Partial<Omit<Recipe, "id" | "createdAt" | "version">>;

export type RecipeIngredientCreate = Pick<RecipeIngredient, "recipeId" | "quantity"> & {
  ingredientId?: string | null;
  categoryId?: string | null;
};
export type RecipeIngredientPatch = Partial<
  Omit<RecipeIngredient, "id" | "recipeId" | "createdAt" | "version">
>;

export interface Repo {
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: TaskCreate): Promise<Task>;
  patchTask(id: string, patch: TaskPatch): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  listProjects(): Promise<Project[]>;
  createProject(input: ProjectCreate): Promise<Project>;
  patchProject(id: string, patch: ProjectPatch): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  listCategories(): Promise<Category[]>;
  createCategory(input: CategoryCreate): Promise<Category>;
  patchCategory(id: string, patch: CategoryPatch): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  listExpenseCategories(): Promise<ExpenseCategory[]>;
  createExpenseCategory(input: ExpenseCategoryCreate): Promise<ExpenseCategory>;
  patchExpenseCategory(id: string, patch: ExpenseCategoryPatch): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: string): Promise<void>;

  listExpenses(): Promise<Expense[]>;
  createExpense(input: ExpenseCreate): Promise<Expense>;
  patchExpense(id: string, patch: ExpensePatch): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  listExpenseLineItems(): Promise<ExpenseLineItem[]>;
  createExpenseLineItem(input: ExpenseLineItemCreate): Promise<ExpenseLineItem>;
  patchExpenseLineItem(id: string, patch: ExpenseLineItemPatch): Promise<ExpenseLineItem>;
  deleteExpenseLineItem(id: string): Promise<void>;

  listBudgets(): Promise<Budget[]>;
  upsertBudget(input: BudgetUpsert): Promise<Budget>;
  deleteBudget(id: string): Promise<void>;

  listSavingsGoals(): Promise<SavingsGoal[]>;
  createSavingsGoal(input: SavingsGoalCreate): Promise<SavingsGoal>;
  patchSavingsGoal(id: string, patch: SavingsGoalPatch): Promise<SavingsGoal>;
  deleteSavingsGoal(id: string): Promise<void>;

  listAccounts(): Promise<Account[]>;
  createAccount(input: AccountCreate): Promise<Account>;
  patchAccount(id: string, patch: AccountPatch): Promise<Account>;
  deleteAccount(id: string): Promise<void>;
  /** Recompute each account's balance from openingBalance + the ledger
   *  (expenses/incomes/transfers) since balanceAsOf, and self-heal any drift
   *  found (e.g. from a process kill mid-write). Safe to call repeatedly. */
  reconcileAccountBalances(): Promise<void>;

  listAccountTransfers(): Promise<AccountTransfer[]>;
  createAccountTransfer(input: AccountTransferCreate): Promise<AccountTransfer>;
  patchAccountTransfer(id: string, patch: AccountTransferPatch): Promise<AccountTransfer>;
  deleteAccountTransfer(id: string): Promise<void>;

  listSavingsContributions(): Promise<SavingsContribution[]>;
  upsertSavingsContribution(input: SavingsContributionUpsert): Promise<SavingsContribution>;
  deleteSavingsContribution(id: string): Promise<void>;

  listIncomes(): Promise<Income[]>;
  upsertIncome(input: IncomeUpsert): Promise<Income>;
  deleteIncome(id: string): Promise<void>;

  listHabitLogs(): Promise<HabitLog[]>;
  upsertHabitLog(input: HabitLogUpsert): Promise<HabitLog>;
  deleteHabitLog(id: string): Promise<void>;

  listShoppingItems(): Promise<ShoppingItem[]>;
  createShoppingItem(input: ShoppingItemCreate): Promise<ShoppingItem>;
  patchShoppingItem(id: string, patch: ShoppingItemPatch): Promise<ShoppingItem>;
  deleteShoppingItem(id: string): Promise<void>;

  listIngredientCategories(): Promise<IngredientCategory[]>;
  createIngredientCategory(input: IngredientCategoryCreate): Promise<IngredientCategory>;
  patchIngredientCategory(id: string, patch: IngredientCategoryPatch): Promise<IngredientCategory>;
  deleteIngredientCategory(id: string): Promise<void>;

  listIngredients(): Promise<Ingredient[]>;
  createIngredient(input: IngredientCreate): Promise<Ingredient>;
  patchIngredient(id: string, patch: IngredientPatch): Promise<Ingredient>;
  deleteIngredient(id: string): Promise<void>;

  listIngredientPresentations(): Promise<IngredientPresentation[]>;
  createIngredientPresentation(input: IngredientPresentationCreate): Promise<IngredientPresentation>;
  patchIngredientPresentation(id: string, patch: IngredientPresentationPatch): Promise<IngredientPresentation>;
  deleteIngredientPresentation(id: string): Promise<void>;

  listRecipes(): Promise<Recipe[]>;
  createRecipe(input: RecipeCreate): Promise<Recipe>;
  patchRecipe(id: string, patch: RecipePatch): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;

  listRecipeIngredients(): Promise<RecipeIngredient[]>;
  createRecipeIngredient(input: RecipeIngredientCreate): Promise<RecipeIngredient>;
  patchRecipeIngredient(id: string, patch: RecipeIngredientPatch): Promise<RecipeIngredient>;
  deleteRecipeIngredient(id: string): Promise<void>;

  listSavedLists(): Promise<SavedList[]>;
  createSavedList(input: SavedListCreate): Promise<SavedList>;
  patchSavedList(id: string, patch: SavedListPatch): Promise<SavedList>;
  deleteSavedList(id: string): Promise<void>;

  listMealPlanEntries(): Promise<MealPlanEntry[]>;
  createMealPlanEntry(input: MealPlanEntryCreate): Promise<MealPlanEntry>;
  patchMealPlanEntry(id: string, patch: MealPlanEntryPatch): Promise<MealPlanEntry>;
  deleteMealPlanEntry(id: string): Promise<void>;

  listInventory(): Promise<InventoryItem[]>;
  createInventory(input: InventoryCreate): Promise<InventoryItem>;
  patchInventory(id: string, patch: InventoryPatch): Promise<InventoryItem>;
  deleteInventory(id: string): Promise<void>;

  listMealLogs(): Promise<MealLog[]>;
  createMealLog(input: MealLogCreate): Promise<MealLog>;
  deleteMealLog(id: string): Promise<void>;

  getComprasSettings(): Promise<ComprasSettings | null>;
  upsertComprasSettings(input: ComprasSettingsUpsert): Promise<ComprasSettings>;

  getFinanzasSettings(): Promise<FinanzasSettings | null>;
  upsertFinanzasSettings(input: FinanzasSettingsUpsert): Promise<FinanzasSettings>;

  listNetWorthSnapshots(): Promise<NetWorthSnapshot[]>;
  upsertNetWorthSnapshot(input: NetWorthSnapshotUpsert): Promise<NetWorthSnapshot>;

  listEvents(): Promise<CalendarEvent[]>;
  createEvent(input: EventCreate): Promise<CalendarEvent>;
  patchEvent(id: string, patch: EventPatch): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;

  listAutomations(): Promise<Automation[]>;
  createAutomation(input: AutomationCreate): Promise<Automation>;
  patchAutomation(id: string, patch: AutomationPatch): Promise<Automation>;
  deleteAutomation(id: string): Promise<void>;

  listCoffeeBeans(): Promise<CoffeeBean[]>;
  createCoffeeBean(input: CoffeeBeanCreate): Promise<CoffeeBean>;
  patchCoffeeBean(id: string, patch: CoffeeBeanPatch): Promise<CoffeeBean>;
  consumeCoffeeBean(id: string, grams: number): Promise<CoffeeBean>;
  deleteCoffeeBean(id: string): Promise<void>;

  listCoffeeRecipes(): Promise<CoffeeRecipe[]>;
  createCoffeeRecipe(input: CoffeeRecipeCreate): Promise<CoffeeRecipe>;
  patchCoffeeRecipe(id: string, patch: CoffeeRecipePatch): Promise<CoffeeRecipe>;
  deleteCoffeeRecipe(id: string): Promise<void>;

  listBrewSessions(recipeId?: string): Promise<BrewSession[]>;
  createBrewSession(input: BrewSessionCreate): Promise<BrewSession>;
  addBrewDatapoints(sessionId: string, points: Omit<BrewDatapoint, "id" | "sessionId">[]): Promise<void>;
  getBrewDatapoints(sessionId: string): Promise<BrewDatapoint[]>;
  deleteBrewSession(id: string): Promise<void>;
}
