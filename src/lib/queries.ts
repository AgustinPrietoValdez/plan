import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarEvent, SavingsGoal, ShoppingItem, Task } from "../types";
import {
  repo,
  type AccountCreate, type AccountPatch,
  type AccountTransferCreate, type AccountTransferPatch,
  type AutomationCreate, type AutomationPatch,
  type BudgetUpsert,
  type CoffeeBeanCreate, type CoffeeBeanPatch,
  type CoffeeRecipeCreate, type CoffeeRecipePatch,
  type CoffeeWishlistItemCreate, type CoffeeWishlistItemPatch,
  type CategoryCreate, type CategoryPatch,
  type EventCreate, type EventPatch,
  type ExpenseCategoryCreate, type ExpenseCategoryPatch,
  type ExpenseCreate, type ExpensePatch,
  type ExpenseLineItemCreate, type ExpenseLineItemPatch,
  type HabitLogUpsert,
  type IncomeUpsert,
  type ProjectCreate, type ProjectPatch,
  type SavingsContributionUpsert,
  type SavingsGoalCreate, type SavingsGoalPatch,
  type ShoppingItemCreate, type ShoppingItemPatch,
  type IngredientCategoryCreate, type IngredientCategoryPatch,
  type IngredientCreate, type IngredientPatch,
  type IngredientPresentationCreate, type IngredientPresentationPatch,
  type RecipeCreate, type RecipePatch,
  type RecipeIngredientCreate, type RecipeIngredientPatch,
  type SavedListCreate, type SavedListPatch,
  type MealPlanEntryCreate, type MealPlanEntryPatch,
  type InventoryCreate, type InventoryPatch,
  type MealLogCreate,
  type ComprasSettingsUpsert,
  type FinanzasSettingsUpsert,
  type NetWorthSnapshotUpsert,
  type TaskCreate, type TaskPatch,
  type BrewSessionAssign,
  type BrewSessionCreate,
} from "./repo";

const KEYS = {
  automations: ["automations"] as const,
  coffeeBeans: ["coffee_beans"] as const,
  coffeeRecipes: ["coffee_recipes"] as const,
  coffeeWishlistItems: ["coffee_wishlist_items"] as const,
  events: ["events"] as const,
  tasks: ["tasks"] as const,
  projects: ["projects"] as const,
  categories: ["categories"] as const,
  expenseCategories: ["expense_categories"] as const,
  expenses: ["expenses"] as const,
  expenseLineItems: ["expense_line_items"] as const,
  budgets: ["budgets"] as const,
  savingsGoals: ["savings_goals"] as const,
  savingsContributions: ["savings_contributions"] as const,
  accounts: ["accounts"] as const,
  accountTransfers: ["account_transfers"] as const,
  incomes: ["incomes"] as const,
  habitLogs: ["habit_logs"] as const,
  shoppingItems: ["shopping_items"] as const,
  ingredientCategories: ["ingredient_categories"] as const,
  ingredients: ["ingredients"] as const,
  ingredientPresentations: ["ingredient_presentations"] as const,
  recipes: ["recipes"] as const,
  recipeIngredients: ["recipe_ingredients"] as const,
  savedLists: ["saved_lists"] as const,
  mealPlanEntries: ["meal_plan_entries"] as const,
  inventory: ["inventory"] as const,
  mealLogs: ["meal_log"] as const,
  comprasSettings: ["compras_settings"] as const,
  finanzasSettings: ["finanzas_settings"] as const,
  netWorthSnapshots: ["net_worth_snapshots"] as const,
  brewSessions: ["brew_sessions"] as const,
  brewDatapoints: (sessionId: string) => ["brew_datapoints", sessionId] as const,
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
    // Create the next occurrence BEFORE freezing this one. If the app gets
    // killed partway through, worst case is a harmless duplicate instance —
    // never a dead chain (the old bug: freeze-then-create meant a crash
    // between the two steps permanently lost the recurrence rule, since it
    // only ever lives on the single active instance).
    if (task.recurrence && task.day) {
      const { nextOccurrence } = await import("./recurrence");
      const nextDay = nextOccurrence(task.recurrence, task.day);
      if (nextDay) {
        const parentId = task.recurrenceParentId ?? task.id;
        // Idempotency guard: if a prior attempt already created the next
        // occurrence (e.g. the app was killed right after that create but
        // before this instance got frozen, and the user is completing it
        // again after relaunch), don't create a second sibling — that would
        // fork the chain into two parallel copies that both keep advancing.
        const siblings = await repo.listTasks();
        const alreadyExists = siblings.some(
          (t) =>
            !t.deletedAt &&
            t.day === nextDay &&
            (t.recurrenceParentId ?? t.id) === parentId,
        );
        if (!alreadyExists) {
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
    }

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.expenses });
      qc.invalidateQueries({ queryKey: KEYS.accounts }); // balance auto-calc
    },
  });
}

export function usePatchExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ExpensePatch }) =>
      repo.patchExpense(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.expenses });
      qc.invalidateQueries({ queryKey: KEYS.accounts });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.expenses });
      qc.invalidateQueries({ queryKey: KEYS.accounts });
    },
  });
}

// ---------- expense line items ----------
export function useExpenseLineItems() {
  return useQuery({ queryKey: KEYS.expenseLineItems, queryFn: () => repo.listExpenseLineItems() });
}

export function useCreateExpenseLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseLineItemCreate) => repo.createExpenseLineItem(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenseLineItems }),
  });
}

export function usePatchExpenseLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ExpenseLineItemPatch }) =>
      repo.patchExpenseLineItem(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenseLineItems }),
  });
}

export function useDeleteExpenseLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteExpenseLineItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenseLineItems }),
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
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: KEYS.savingsGoals });
      const previous = qc.getQueryData<SavingsGoal[]>(KEYS.savingsGoals);
      if (previous) {
        qc.setQueryData<SavingsGoal[]>(
          KEYS.savingsGoals,
          previous.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        );
      }
      return { previous };
    },
    onError: (err, vars, ctx) => {
      console.error("[patchSavingsGoal] FAILED", vars, err);
      if (ctx?.previous) qc.setQueryData(KEYS.savingsGoals, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.savingsGoals }),
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

// ---------- accounts ----------
export function useAccounts() {
  return useQuery({ queryKey: KEYS.accounts, queryFn: () => repo.listAccounts() });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountCreate) => repo.createAccount(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.accounts }),
  });
}

export function usePatchAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AccountPatch }) =>
      repo.patchAccount(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.accounts }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.accounts }),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.incomes });
      qc.invalidateQueries({ queryKey: KEYS.accounts }); // balance auto-calc
    },
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteIncome(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.incomes });
      qc.invalidateQueries({ queryKey: KEYS.accounts });
    },
  });
}

// ---------- account_transfers ----------
export function useAccountTransfers() {
  return useQuery({ queryKey: KEYS.accountTransfers, queryFn: () => repo.listAccountTransfers() });
}

export function useCreateAccountTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountTransferCreate) => repo.createAccountTransfer(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.accountTransfers });
      qc.invalidateQueries({ queryKey: KEYS.accounts }); // balance auto-calc
    },
  });
}

export function usePatchAccountTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AccountTransferPatch }) =>
      repo.patchAccountTransfer(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.accountTransfers });
      qc.invalidateQueries({ queryKey: KEYS.accounts });
    },
  });
}

export function useDeleteAccountTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteAccountTransfer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.accountTransfers });
      qc.invalidateQueries({ queryKey: KEYS.accounts });
    },
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

// ---------- ingredient categories ----------
export function useIngredientCategories() {
  return useQuery({ queryKey: KEYS.ingredientCategories, queryFn: () => repo.listIngredientCategories() });
}

export function useCreateIngredientCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IngredientCategoryCreate) => repo.createIngredientCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.ingredientCategories }),
  });
}

export function usePatchIngredientCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IngredientCategoryPatch }) =>
      repo.patchIngredientCategory(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.ingredientCategories }),
  });
}

export function useDeleteIngredientCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteIngredientCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.ingredientCategories });
      qc.invalidateQueries({ queryKey: KEYS.ingredients });
    },
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

// ---------- finanzas_settings ----------
export function useFinanzasSettings() {
  return useQuery({ queryKey: KEYS.finanzasSettings, queryFn: () => repo.getFinanzasSettings() });
}

export function useUpsertFinanzasSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FinanzasSettingsUpsert) => repo.upsertFinanzasSettings(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.finanzasSettings }),
  });
}

// ---------- net_worth_snapshots ----------
export function useNetWorthSnapshots() {
  return useQuery({ queryKey: KEYS.netWorthSnapshots, queryFn: () => repo.listNetWorthSnapshots() });
}

export function useUpsertNetWorthSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NetWorthSnapshotUpsert) => repo.upsertNetWorthSnapshot(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.netWorthSnapshots }),
  });
}

// ---------- events ----------
export function useEvents() {
  return useQuery({ queryKey: KEYS.events, queryFn: () => repo.listEvents() });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EventCreate) => repo.createEvent(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.events }),
  });
}

export function usePatchEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EventPatch }) => repo.patchEvent(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: KEYS.events });
      const previous = qc.getQueryData<CalendarEvent[]>(KEYS.events);
      if (previous) {
        qc.setQueryData<CalendarEvent[]>(
          KEYS.events,
          previous.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEYS.events, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.events }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.events }),
  });
}

export function useAutomations() {
  return useQuery({ queryKey: KEYS.automations, queryFn: () => repo.listAutomations() });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutomationCreate) => repo.createAutomation(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.automations }),
  });
}

export function usePatchAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AutomationPatch }) =>
      repo.patchAutomation(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.automations }),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteAutomation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.automations }),
  });
}

export function useCoffeeBeans() {
  return useQuery({ queryKey: KEYS.coffeeBeans, queryFn: () => repo.listCoffeeBeans() });
}

export function useCreateCoffeeBean() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CoffeeBeanCreate) => repo.createCoffeeBean(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeBeans }),
  });
}

export function usePatchCoffeeBean() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CoffeeBeanPatch }) =>
      repo.patchCoffeeBean(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeBeans }),
  });
}

export function useDeleteCoffeeBean() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteCoffeeBean(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeBeans }),
  });
}

export function useCoffeeWishlistItems() {
  return useQuery({ queryKey: KEYS.coffeeWishlistItems, queryFn: () => repo.listCoffeeWishlistItems() });
}

export function useCreateCoffeeWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CoffeeWishlistItemCreate) => repo.createCoffeeWishlistItem(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeWishlistItems }),
  });
}

export function usePatchCoffeeWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CoffeeWishlistItemPatch }) =>
      repo.patchCoffeeWishlistItem(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeWishlistItems }),
  });
}

export function useDeleteCoffeeWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteCoffeeWishlistItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeWishlistItems }),
  });
}

export function useConsumeCoffeeBean() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, grams }: { id: string; grams: number }) =>
      repo.consumeCoffeeBean(id, grams),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeBeans }),
  });
}

export function useCoffeeRecipes() {
  return useQuery({ queryKey: KEYS.coffeeRecipes, queryFn: () => repo.listCoffeeRecipes() });
}

export function useCreateCoffeeRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CoffeeRecipeCreate) => repo.createCoffeeRecipe(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeRecipes }),
  });
}

export function usePatchCoffeeRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CoffeeRecipePatch }) =>
      repo.patchCoffeeRecipe(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeRecipes }),
  });
}

export function useDeleteCoffeeRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteCoffeeRecipe(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.coffeeRecipes }),
  });
}

export function useBrewSessions(recipeId?: string) {
  return useQuery({
    queryKey: recipeId ? [...KEYS.brewSessions, recipeId] : KEYS.brewSessions,
    queryFn: () => repo.listBrewSessions(recipeId),
  });
}

export function useBrewDatapoints(sessionId: string | null) {
  return useQuery({
    queryKey: KEYS.brewDatapoints(sessionId ?? ""),
    queryFn: () => (sessionId ? repo.getBrewDatapoints(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });
}

export function useCreateBrewSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BrewSessionCreate) => repo.createBrewSession(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.brewSessions }),
  });
}

/** Sesiones que llegaron del Pi sin grano/receta asignados. Un session
 *  creado por la app siempre trae recipeId (el brew guiado exige elegir
 *  receta), asi que ambos null es inequivoco: viene de la captura automatica.
 *  recipeId solo (sin bean) no cuenta como pendiente: el usuario puede optar
 *  por no asignar receta y no queremos re-preguntarle cada vez. */
export function usePendingBrewSessions() {
  const { data: sessions = [] } = useBrewSessions();
  return sessions.filter((s) => s.recipeId === null && s.beanId === null);
}

export function useAssignBrewSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BrewSessionAssign }) =>
      repo.assignBrewSession(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.brewSessions }),
  });
}

export function useDeleteBrewSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteBrewSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.brewSessions }),
  });
}
