import type {
  Budget,
  Category,
  ComprasSettings,
  Expense,
  ExpenseCategory,
  HabitLog,
  Income,
  Ingredient,
  IngredientPresentation,
  InventoryItem,
  MealLog,
  MealPlanEntry,
  Project,
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

export type ProjectCreate = Pick<Project, "name" | "categoryId">;
export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt" | "version">>;

export type CategoryCreate = Pick<Category, "name" | "hue"> & { position?: number };
export type CategoryPatch = Partial<Omit<Category, "id" | "createdAt" | "version">>;

export type ExpenseCategoryCreate = Pick<ExpenseCategory, "name" | "hue"> & { position?: number };
export type ExpenseCategoryPatch = Partial<Omit<ExpenseCategory, "id" | "createdAt" | "version">>;

export type ExpenseCreate = Pick<
  Expense,
  "amount" | "currency" | "categoryId" | "spentOn" | "note" | "recurrence" | "recurrenceParentId"
>;
export type ExpensePatch = Partial<Omit<Expense, "id" | "createdAt" | "version">>;

export type BudgetUpsert = Pick<Budget, "categoryId" | "monthlyAmount" | "currency">;

export type SavingsGoalCreate = Pick<SavingsGoal, "name" | "targetAmount"> & { position?: number };
export type SavingsGoalPatch = Partial<Omit<SavingsGoal, "id" | "createdAt" | "version">>;

export type SavingsContributionUpsert = Pick<SavingsContribution, "goalId" | "month" | "amount">;

export type IncomeUpsert = Pick<Income, "month" | "amount" | "currency"> & { note?: string };

export type HabitLogUpsert = Pick<HabitLog, "taskId" | "day" | "done">;

export type ShoppingItemCreate = Pick<ShoppingItem, "name" | "quantity"> & {
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

export type IngredientCreate = Pick<Ingredient, "name" | "dimension" | "shelfLifeDays">;
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

export type RecipeIngredientCreate = Pick<RecipeIngredient, "recipeId" | "ingredientId" | "quantity">;
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

  listBudgets(): Promise<Budget[]>;
  upsertBudget(input: BudgetUpsert): Promise<Budget>;
  deleteBudget(id: string): Promise<void>;

  listSavingsGoals(): Promise<SavingsGoal[]>;
  createSavingsGoal(input: SavingsGoalCreate): Promise<SavingsGoal>;
  patchSavingsGoal(id: string, patch: SavingsGoalPatch): Promise<SavingsGoal>;
  deleteSavingsGoal(id: string): Promise<void>;

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
}
