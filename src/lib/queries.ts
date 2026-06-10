import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ShoppingItem, Task } from "../types";
import {
  repo,
  type BudgetUpsert,
  type CategoryCreate, type CategoryPatch,
  type ExpenseCategoryCreate, type ExpenseCategoryPatch,
  type ExpenseCreate, type ExpensePatch,
  type HabitLogUpsert,
  type IncomeUpsert,
  type ProjectCreate, type ProjectPatch,
  type SavingsContributionUpsert,
  type SavingsGoalCreate, type SavingsGoalPatch,
  type ShoppingItemCreate, type ShoppingItemPatch,
  type IngredientCreate, type IngredientPatch,
  type IngredientPresentationCreate, type IngredientPresentationPatch,
  type RecipeCreate, type RecipePatch,
  type RecipeIngredientCreate, type RecipeIngredientPatch,
  type SavedListCreate, type SavedListPatch,
  type MealPlanEntryCreate, type MealPlanEntryPatch,
  type InventoryCreate, type InventoryPatch,
  type MealLogCreate,
  type ComprasSettingsUpsert,
  type TaskCreate, type TaskPatch,
} from "./repo";

const KEYS = {
  tasks: ["tasks"] as const,
  projects: ["projects"] as const,
  categories: ["categories"] as const,
  expenseCategories: ["expense_categories"] as const,
  expenses: ["expenses"] as const,
  budgets: ["budgets"] as const,
  savingsGoals: ["savings_goals"] as const,
  savingsContributions: ["savings_contributions"] as const,
  incomes: ["incomes"] as const,
  habitLogs: ["habit_logs"] as const,
  shoppingItems: ["shopping_items"] as const,
  ingredients: ["ingredients"] as const,
  ingredientPresentations: ["ingredient_presentations"] as const,
  recipes: ["recipes"] as const,
  recipeIngredients: ["recipe_ingredients"] as const,
  savedLists: ["saved_lists"] as const,
  mealPlanEntries: ["meal_plan_entries"] as const,
  inventory: ["inventory"] as const,
  mealLogs: ["meal_log"] as const,
  comprasSettings: ["compras_settings"] as const,
};

export function useTasks() {
  return useQuery({ queryKey: KEYS.tasks, queryFn: () => repo.listTasks() });
}

export function useProjects() {
  return useQuery({ queryKey: KEYS.projects, queryFn: () => repo.listProjects() });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreate) => repo.createTask(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tasks }),
  });
}

export function usePatchTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      repo.patchTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: KEYS.tasks });
      const previous = qc.getQueryData<Task[]>(KEYS.tasks);
      if (previous) {
        qc.setQueryData<Task[]>(
          KEYS.tasks,
          previous.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEYS.tasks, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.tasks }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tasks }),
  });
}

export function useCompleteTask() {
  const patch = usePatchTask();
  const create = useCreateTask();
  const habitLog = useUpsertHabitLog();
  return async (task: Task, actualDuration: number) => {
    await patch.mutateAsync({
      id: task.id,
      patch: {
        done: true,
        actualDuration,
        completedAt: new Date().toISOString(),
        // Freeze the rule on the completed instance so the chain stays
        // attached to the parent without continuing to "appear" as active.
        recurrence: null,
      },
    });

    if (task.isHabit && task.day) {
      const habitTaskId = task.recurrenceParentId ?? task.id;
      await habitLog.mutateAsync({ taskId: habitTaskId, day: task.day, done: true });
    }

    if (task.recurrence && task.day) {
      const { nextOccurrence } = await import("./recurrence");
      const nextDay = nextOccurrence(task.recurrence, task.day);
      if (nextDay) {
        const parentId = task.recurrenceParentId ?? task.id;
        await create.mutateAsync({
          title: task.title,
          projectId: task.projectId,
          categoryId: task.categoryId,
          priority: task.priority,
          duration: task.duration,
          day: nextDay,
          due: null,
          recurring: true,
          recurrence: task.recurrence,
          recurrenceParentId: parentId,
          notes: task.notes,
          subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
          isHabit: task.isHabit,
        });
      }
    }
  };
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectCreate) => repo.createProject(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.projects }),
  });
}

export function usePatchProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectPatch }) =>
      repo.patchProject(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.projects }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.projects });
      qc.invalidateQueries({ queryKey: KEYS.tasks });
    },
  });
}

export function useCategories() {
  return useQuery({ queryKey: KEYS.categories, queryFn: () => repo.listCategories() });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryCreate) => repo.createCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.categories }),
  });
}

export function usePatchCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CategoryPatch }) =>
      repo.patchCategory(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.categories }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.categories }),
  });
}

// ---------- expense categories ----------
export function useExpenseCategories() {
  return useQuery({ queryKey: KEYS.expenseCategories, queryFn: () => repo.listExpenseCategories() });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseCategoryCreate) => repo.createExpenseCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenseCategories }),
  });
}

export function usePatchExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ExpenseCategoryPatch }) =>
      repo.patchExpenseCategory(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenseCategories }),
  });
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteExpenseCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenseCategories }),
  });
}

// ---------- expenses ----------
export function useExpenses() {
  return useQuery({ queryKey: KEYS.expenses, queryFn: () => repo.listExpenses() });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseCreate) => repo.createExpense(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenses }),
  });
}

export function usePatchExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ExpensePatch }) =>
      repo.patchExpense(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenses }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenses }),
  });
}

// ---------- budgets ----------
export function useBudgets() {
  return useQuery({ queryKey: KEYS.budgets, queryFn: () => repo.listBudgets() });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetUpsert) => repo.upsertBudget(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.budgets }),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteBudget(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.budgets }),
  });
}

// ---------- savings goals ----------
export function useSavingsGoals() {
  return useQuery({ queryKey: KEYS.savingsGoals, queryFn: () => repo.listSavingsGoals() });
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavingsGoalCreate) => repo.createSavingsGoal(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.savingsGoals }),
  });
}

export function usePatchSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SavingsGoalPatch }) =>
      repo.patchSavingsGoal(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.savingsGoals }),
  });
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteSavingsGoal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.savingsGoals });
      qc.invalidateQueries({ queryKey: KEYS.savingsContributions });
    },
  });
}

// ---------- savings contributions ----------
export function useSavingsContributions() {
  return useQuery({
    queryKey: KEYS.savingsContributions,
    queryFn: () => repo.listSavingsContributions(),
  });
}

export function useUpsertSavingsContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavingsContributionUpsert) => repo.upsertSavingsContribution(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.savingsContributions }),
  });
}

// ---------- incomes ----------
export function useIncomes() {
  return useQuery({ queryKey: KEYS.incomes, queryFn: () => repo.listIncomes() });
}

export function useUpsertIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IncomeUpsert) => repo.upsertIncome(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.incomes }),
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteIncome(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.incomes }),
  });
}

// ---------- habit_logs ----------
export function useHabitLogs() {
  return useQuery({ queryKey: KEYS.habitLogs, queryFn: () => repo.listHabitLogs() });
}

export function useUpsertHabitLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HabitLogUpsert) => repo.upsertHabitLog(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.habitLogs }),
    onError: (err) => console.error("[upsertHabitLog]", err),
  });
}

export function useDeleteHabitLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteHabitLog(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.habitLogs }),
  });
}

// ---------- shopping_items ----------
export function useShoppingItems() {
  return useQuery({ queryKey: KEYS.shoppingItems, queryFn: () => repo.listShoppingItems() });
}

export function useCreateShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ShoppingItemCreate) => repo.createShoppingItem(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.shoppingItems }),
  });
}

export function usePatchShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ShoppingItemPatch }) =>
      repo.patchShoppingItem(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: KEYS.shoppingItems });
      const previous = qc.getQueryData<ShoppingItem[]>(KEYS.shoppingItems);
      if (previous) {
        qc.setQueryData<ShoppingItem[]>(
          KEYS.shoppingItems,
          previous.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEYS.shoppingItems, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.shoppingItems }),
  });
}

export function useDeleteShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteShoppingItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.shoppingItems }),
  });
}

// ---------- ingredients ----------
export function useIngredients() {
  return useQuery({ queryKey: KEYS.ingredients, queryFn: () => repo.listIngredients() });
}

export function useCreateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IngredientCreate) => repo.createIngredient(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.ingredients }),
  });
}

export function usePatchIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IngredientPatch }) =>
      repo.patchIngredient(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.ingredients }),
  });
}

export function useDeleteIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteIngredient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.ingredients });
      qc.invalidateQueries({ queryKey: KEYS.ingredientPresentations });
    },
  });
}

// ---------- ingredient_presentations ----------
export function useIngredientPresentations() {
  return useQuery({
    queryKey: KEYS.ingredientPresentations,
    queryFn: () => repo.listIngredientPresentations(),
  });
}

export function useCreateIngredientPresentation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IngredientPresentationCreate) => repo.createIngredientPresentation(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.ingredientPresentations }),
  });
}

export function usePatchIngredientPresentation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IngredientPresentationPatch }) =>
      repo.patchIngredientPresentation(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.ingredientPresentations }),
  });
}

export function useDeleteIngredientPresentation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteIngredientPresentation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.ingredientPresentations }),
  });
}

// ---------- recipes ----------
export function useRecipes() {
  return useQuery({ queryKey: KEYS.recipes, queryFn: () => repo.listRecipes() });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeCreate) => repo.createRecipe(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.recipes }),
  });
}

export function usePatchRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RecipePatch }) => repo.patchRecipe(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.recipes }),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteRecipe(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.recipes });
      qc.invalidateQueries({ queryKey: KEYS.recipeIngredients });
    },
  });
}

// ---------- recipe_ingredients ----------
export function useRecipeIngredients() {
  return useQuery({ queryKey: KEYS.recipeIngredients, queryFn: () => repo.listRecipeIngredients() });
}

export function useCreateRecipeIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeIngredientCreate) => repo.createRecipeIngredient(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.recipeIngredients }),
  });
}

export function usePatchRecipeIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RecipeIngredientPatch }) =>
      repo.patchRecipeIngredient(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.recipeIngredients }),
  });
}

export function useDeleteRecipeIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteRecipeIngredient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.recipeIngredients }),
  });
}

// ---------- saved_lists ----------
export function useSavedLists() {
  return useQuery({ queryKey: KEYS.savedLists, queryFn: () => repo.listSavedLists() });
}

export function useCreateSavedList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavedListCreate) => repo.createSavedList(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.savedLists }),
  });
}

export function usePatchSavedList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SavedListPatch }) => repo.patchSavedList(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.savedLists }),
  });
}

export function useDeleteSavedList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteSavedList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.savedLists }),
  });
}

// ---------- meal_plan_entries ----------
export function useMealPlanEntries() {
  return useQuery({ queryKey: KEYS.mealPlanEntries, queryFn: () => repo.listMealPlanEntries() });
}

export function useCreateMealPlanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MealPlanEntryCreate) => repo.createMealPlanEntry(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.mealPlanEntries }),
  });
}

export function usePatchMealPlanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MealPlanEntryPatch }) =>
      repo.patchMealPlanEntry(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.mealPlanEntries }),
  });
}

export function useDeleteMealPlanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteMealPlanEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.mealPlanEntries }),
  });
}

// ---------- inventory ----------
export function useInventory() {
  return useQuery({ queryKey: KEYS.inventory, queryFn: () => repo.listInventory() });
}

export function useCreateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InventoryCreate) => repo.createInventory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.inventory }),
  });
}

export function usePatchInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: InventoryPatch }) => repo.patchInventory(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.inventory }),
  });
}

export function useDeleteInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteInventory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.inventory }),
  });
}

// ---------- meal_log ----------
export function useMealLogs() {
  return useQuery({ queryKey: KEYS.mealLogs, queryFn: () => repo.listMealLogs() });
}

export function useCreateMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MealLogCreate) => repo.createMealLog(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.mealLogs }),
  });
}

export function useDeleteMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteMealLog(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.mealLogs }),
  });
}

// ---------- compras_settings ----------
export function useComprasSettings() {
  return useQuery({ queryKey: KEYS.comprasSettings, queryFn: () => repo.getComprasSettings() });
}

export function useUpsertComprasSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ComprasSettingsUpsert) => repo.upsertComprasSettings(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.comprasSettings }),
  });
}
