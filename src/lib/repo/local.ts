import type {
  Automation,
  BrewDatapoint,
  BrewSession,
  Budget,
  CalendarEvent,
  Category,
  CoffeeBean,
  CoffeeRecipe,
  CoffeeRecipeStep,
  CoffeeTweak,
  ComprasSettings,
  Expense,
  ExpenseCategory,
  ExpenseLineItem,
  HabitLog,
  Income,
  Project,
  ProjectEstado,
  Milestone,
  RecurrenceRule,
  SavingsContribution,
  SavingsGoal,
  ShoppingItem,
  Ingredient,
  IngredientCategory,
  IngredientDimension,
  IngredientPresentation,
  InventoryItem,
  MealLog,
  MealPlanEntry,
  MealSlot,
  MealTimes,
  MealType,
  Recipe,
  RecipeIngredient,
  SavedList,
  SavedListItem,
  Subtask,
  Task,
} from "../../types";
import { supabase } from "../supabase";
import { boolFromDb, getDb, parseJson } from "../db";
import type {
  BrewSessionCreate,
  BudgetUpsert,
  CategoryCreate,
  AutomationCreate,
  AutomationPatch,
  CoffeeBeanCreate,
  CoffeeBeanPatch,
  CoffeeRecipeCreate,
  CoffeeRecipePatch,
  EventCreate,
  ExpenseCategoryCreate,
  ExpenseCreate,
  ExpenseLineItemCreate,
  HabitLogUpsert,
  IncomeUpsert,
  ProjectCreate,
  Repo,
  SavingsContributionUpsert,
  SavingsGoalCreate,
  ShoppingItemCreate,
  IngredientCategoryCreate,
  IngredientCreate,
  IngredientPresentationCreate,
  RecipeCreate,
  RecipeIngredientCreate,
  SavedListCreate,
  MealPlanEntryCreate,
  InventoryCreate,
  MealLogCreate,
  ComprasSettingsUpsert,
  TaskCreate,
} from "./types";

interface DbTaskRow {
  id: string;
  user_id: string;
  title: string;
  project_id: string | null;
  category_id: string | null;
  priority: "low" | "med" | "high";
  duration: number;
  actual_duration: number | null;
  day: string | null;
  due: string | null;
  recurring: number;
  recurrence: string | null;
  recurrence_parent_id: string | null;
  notes: string;
  subtasks: string;
  done: number;
  is_habit: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

interface DbProjectRow {
  id: string;
  user_id: string;
  name: string;
  category_id: string;
  objetivo: string;
  estado: string;
  milestones: string;
  archived: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

interface DbCategoryRow {
  id: string;
  user_id: string;
  name: string;
  hue: number;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

const fromDbTask = (r: DbTaskRow): Task => ({
  id: r.id,
  title: r.title,
  projectId: r.project_id,
  categoryId: r.category_id,
  priority: r.priority,
  duration: r.duration,
  actualDuration: r.actual_duration,
  day: r.day,
  due: r.due,
  recurring: boolFromDb(r.recurring),
  recurrence: parseJson<RecurrenceRule | null>(r.recurrence, null),
  recurrenceParentId: r.recurrence_parent_id,
  notes: r.notes,
  subtasks: parseJson<Subtask[]>(r.subtasks, []),
  done: boolFromDb(r.done),
  isHabit: boolFromDb(r.is_habit ?? 0),
  completedAt: r.completed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  version: r.version,
});

const fromDbProject = (r: DbProjectRow): Project => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id,
  objetivo: r.objetivo ?? "",
  estado: (r.estado as ProjectEstado) || "activo",
  milestones: parseJson<Milestone[]>(r.milestones, []),
  archived: boolFromDb(r.archived),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  version: r.version,
});

const fromDbCategory = (r: DbCategoryRow): Category => ({
  id: r.id,
  name: r.name,
  hue: r.hue,
  position: r.position,
  archived: boolFromDb(r.archived),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  version: r.version,
});

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function enqueue(
  userId: string,
  op: "insert" | "update" | "delete",
  entity:
    | "tasks"
    | "projects"
    | "categories"
    | "expense_categories"
    | "ingredient_categories"
    | "expenses"
    | "budgets"
    | "savings_goals"
    | "savings_contributions"
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
    | "events"
    | "expense_line_items"
    | "coffee_beans"
    | "coffee_recipes"
    | "brew_sessions",
  entityId: string,
  payload: unknown,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO outbox (user_id, op, entity, entity_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, op, entity, entityId, payload === null ? null : JSON.stringify(payload), now()],
  );
  // Fire-and-forget signal that there's work to drain.
  window.dispatchEvent(new CustomEvent("outbox:enqueued"));
}

export const localRepo: Repo = {
  async listTasks() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbTaskRow[]>(
      "SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbTask);
  },

  async getTask(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbTaskRow[]>(
      "SELECT * FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    return rows[0] ? fromDbTask(rows[0]) : null;
  },

  async createTask(input: TaskCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const task: Task = {
      id: newId(),
      title: input.title,
      projectId: input.projectId,
      categoryId: input.categoryId,
      priority: input.priority,
      duration: input.duration,
      actualDuration: null,
      day: input.day,
      due: input.due,
      recurring: input.recurring,
      recurrence: input.recurrence,
      recurrenceParentId: input.recurrenceParentId,
      notes: input.notes,
      subtasks: input.subtasks,
      done: false,
      isHabit: input.isHabit ?? false,
      completedAt: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO tasks
        (id, user_id, title, project_id, category_id, priority, duration,
         actual_duration, day, due, recurring, recurrence, recurrence_parent_id,
         notes, subtasks, done, is_habit, completed_at, created_at, updated_at,
         deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id, userId, task.title, task.projectId, task.categoryId, task.priority,
        task.duration, task.actualDuration, task.day, task.due,
        task.recurring ? 1 : 0,
        task.recurrence ? JSON.stringify(task.recurrence) : null,
        task.recurrenceParentId, task.notes, JSON.stringify(task.subtasks),
        task.done ? 1 : 0, task.isHabit ? 1 : 0,
        task.completedAt, task.createdAt, task.updatedAt,
        task.deletedAt, task.version,
      ],
    );
    await enqueue(userId, "insert", "tasks", task.id, taskToWire(task, userId));
    return task;
  },

  async patchTask(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const existing = await this.getTask(id);
    if (!existing) throw new Error(`Task ${id} not found`);
    const updated: Task = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE tasks SET
         title = ?, project_id = ?, category_id = ?, priority = ?, duration = ?,
         actual_duration = ?, day = ?, due = ?, recurring = ?, recurrence = ?,
         recurrence_parent_id = ?, notes = ?, subtasks = ?, done = ?,
         is_habit = ?, completed_at = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.title, updated.projectId, updated.categoryId, updated.priority,
        updated.duration, updated.actualDuration, updated.day, updated.due,
        updated.recurring ? 1 : 0,
        updated.recurrence ? JSON.stringify(updated.recurrence) : null,
        updated.recurrenceParentId, updated.notes, JSON.stringify(updated.subtasks),
        updated.done ? 1 : 0, updated.isHabit ? 1 : 0,
        updated.completedAt, updated.updatedAt,
        updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "tasks", id, taskToWire(updated, userId));
    return updated;
  },

  async deleteTask(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE tasks SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "tasks", id, null);
  },

  async listProjects() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbProjectRow[]>(
      "SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbProject);
  },

  async createProject(input: ProjectCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const project: Project = {
      id: newId(),
      name: input.name,
      categoryId: input.categoryId,
      objetivo: input.objetivo ?? "",
      estado: input.estado ?? "activo",
      milestones: input.milestones ?? [],
      archived: false,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO projects
        (id, user_id, name, category_id, objetivo, estado, milestones, archived, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [project.id, userId, project.name, project.categoryId, project.objetivo, project.estado,
       JSON.stringify(project.milestones), 0, project.createdAt, project.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "projects", project.id, projectToWire(project, userId));
    return project;
  },

  async patchProject(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbProjectRow[]>(
      "SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Project ${id} not found`);
    const existing = fromDbProject(rows[0]);
    const updated: Project = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE projects SET name = ?, category_id = ?, objetivo = ?, estado = ?, milestones = ?,
         archived = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.categoryId, updated.objetivo, updated.estado,
        JSON.stringify(updated.milestones), updated.archived ? 1 : 0,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "projects", id, projectToWire(updated, userId));
    return updated;
  },

  async deleteProject(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE projects SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "projects", id, null);
  },

  async listCategories() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbCategoryRow[]>(
      "SELECT * FROM categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY position ASC",
      [userId],
    );
    return rows.map(fromDbCategory);
  },

  async createCategory(input: CategoryCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const category: Category = {
      id: newId(),
      name: input.name,
      hue: input.hue,
      position: input.position ?? 0,
      archived: false,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO categories
        (id, user_id, name, hue, position, archived, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category.id, userId, category.name, category.hue, category.position, 0,
        category.createdAt, category.updatedAt, null, 1,
      ],
    );
    await enqueue(userId, "insert", "categories", category.id, categoryToWire(category, userId));
    return category;
  },

  async patchCategory(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbCategoryRow[]>(
      "SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Category ${id} not found`);
    const existing = fromDbCategory(rows[0]);
    const updated: Category = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE categories SET name = ?, hue = ?, position = ?, archived = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.hue, updated.position, updated.archived ? 1 : 0,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "categories", id, categoryToWire(updated, userId));
    return updated;
  },

  async deleteCategory(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE categories SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "categories", id, null);
  },

  // ---------- expense categories ----------
  async listExpenseCategories() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbExpenseCategoryRow[]>(
      "SELECT * FROM expense_categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY position ASC",
      [userId],
    );
    return rows.map(fromDbExpenseCategory);
  },

  async createExpenseCategory(input: ExpenseCategoryCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const cat: ExpenseCategory = {
      id: newId(),
      name: input.name,
      hue: input.hue,
      position: input.position ?? 0,
      archived: false,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO expense_categories
        (id, user_id, name, hue, position, archived, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cat.id, userId, cat.name, cat.hue, cat.position, 0, cat.createdAt, cat.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "expense_categories", cat.id, expenseCategoryToWire(cat, userId));
    return cat;
  },

  async patchExpenseCategory(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbExpenseCategoryRow[]>(
      "SELECT * FROM expense_categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Expense category ${id} not found`);
    const existing = fromDbExpenseCategory(rows[0]);
    const updated: ExpenseCategory = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE expense_categories SET name = ?, hue = ?, position = ?, archived = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.hue, updated.position, updated.archived ? 1 : 0,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "expense_categories", id, expenseCategoryToWire(updated, userId));
    return updated;
  },

  async deleteExpenseCategory(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE expense_categories SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "expense_categories", id, null);
  },

  // ---------- expenses ----------
  async listExpenses() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbExpenseRow[]>(
      "SELECT * FROM expenses WHERE user_id = ? AND deleted_at IS NULL ORDER BY spent_on DESC",
      [userId],
    );
    return rows.map(fromDbExpense);
  },

  async createExpense(input: ExpenseCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const exp: Expense = {
      id: newId(),
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      categoryId: input.categoryId,
      spentOn: input.spentOn,
      note: input.note,
      recurrence: input.recurrence,
      recurrenceParentId: input.recurrenceParentId,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO expenses
        (id, user_id, name, amount, currency, category_id, spent_on, note,
         recurrence, recurrence_parent_id, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        exp.id, userId, exp.name, exp.amount, exp.currency, exp.categoryId, exp.spentOn,
        exp.note,
        exp.recurrence ? JSON.stringify(exp.recurrence) : null,
        exp.recurrenceParentId,
        exp.createdAt, exp.updatedAt, null, 1,
      ],
    );
    await enqueue(userId, "insert", "expenses", exp.id, expenseToWire(exp, userId));
    return exp;
  },

  async patchExpense(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbExpenseRow[]>(
      "SELECT * FROM expenses WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Expense ${id} not found`);
    const existing = fromDbExpense(rows[0]);
    const updated: Expense = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE expenses SET name = ?, amount = ?, currency = ?, category_id = ?, spent_on = ?,
         note = ?, recurrence = ?, recurrence_parent_id = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.amount, updated.currency, updated.categoryId, updated.spentOn,
        updated.note,
        updated.recurrence ? JSON.stringify(updated.recurrence) : null,
        updated.recurrenceParentId,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "expenses", id, expenseToWire(updated, userId));
    return updated;
  },

  async deleteExpense(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE expenses SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "expenses", id, null);
  },

  // ---------- expense_line_items ----------
  async listExpenseLineItems() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbExpenseLineItemRow[]>(
      "SELECT * FROM expense_line_items WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
      [userId],
    );
    return rows.map(fromDbExpenseLineItem);
  },

  async createExpenseLineItem(input: ExpenseLineItemCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const li: ExpenseLineItem = {
      id: newId(),
      expenseId: input.expenseId,
      name: input.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO expense_line_items
        (id, user_id, expense_id, name, quantity, unit_price, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [li.id, userId, li.expenseId, li.name, li.quantity, li.unitPrice, li.createdAt, li.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "expense_line_items", li.id, expenseLineItemToWire(li, userId));
    return li;
  },

  async patchExpenseLineItem(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbExpenseLineItemRow[]>(
      "SELECT * FROM expense_line_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`ExpenseLineItem ${id} not found`);
    const existing = fromDbExpenseLineItem(rows[0]);
    const updated: ExpenseLineItem = {
      ...existing,
      ...patch,
      id: existing.id,
      expenseId: existing.expenseId,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE expense_line_items SET name = ?, quantity = ?, unit_price = ?,
         updated_at = ?, deleted_at = ?, version = ? WHERE id = ? AND user_id = ?`,
      [updated.name, updated.quantity, updated.unitPrice, updated.updatedAt, updated.deletedAt, updated.version, id, userId],
    );
    await enqueue(userId, "update", "expense_line_items", id, expenseLineItemToWire(updated, userId));
    return updated;
  },

  async deleteExpenseLineItem(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE expense_line_items SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "expense_line_items", id, null);
  },

  // ---------- budgets ----------
  async listBudgets() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbBudgetRow[]>(
      "SELECT * FROM budgets WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbBudget);
  },

  async upsertBudget(input: BudgetUpsert) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const existing = await db.select<DbBudgetRow[]>(
      "SELECT * FROM budgets WHERE user_id = ? AND category_id = ? AND deleted_at IS NULL LIMIT 1",
      [userId, input.categoryId],
    );
    if (existing[0]) {
      const prev = fromDbBudget(existing[0]);
      const updated: Budget = {
        ...prev,
        monthlyAmount: input.monthlyAmount,
        currency: input.currency,
        updatedAt: ts,
        version: prev.version + 1,
      };
      await db.execute(
        `UPDATE budgets SET monthly_amount = ?, currency = ?, updated_at = ?, version = ?
         WHERE id = ? AND user_id = ?`,
        [updated.monthlyAmount, updated.currency, updated.updatedAt, updated.version, updated.id, userId],
      );
      await enqueue(userId, "update", "budgets", updated.id, budgetToWire(updated, userId));
      return updated;
    }
    const created: Budget = {
      id: newId(),
      categoryId: input.categoryId,
      monthlyAmount: input.monthlyAmount,
      currency: input.currency,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO budgets
        (id, user_id, category_id, monthly_amount, currency, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [created.id, userId, created.categoryId, created.monthlyAmount, created.currency,
       created.createdAt, created.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "budgets", created.id, budgetToWire(created, userId));
    return created;
  },

  async deleteBudget(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE budgets SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "budgets", id, null);
  },

  // ---------- savings_goals ----------
  async listSavingsGoals() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbSavingsGoalRow[]>(
      "SELECT * FROM savings_goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY position ASC",
      [userId],
    );
    return rows.map(fromDbSavingsGoal);
  },

  async createSavingsGoal(input: SavingsGoalCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const goal: SavingsGoal = {
      id: newId(),
      name: input.name,
      targetAmount: input.targetAmount,
      savingsPercent: input.savingsPercent ?? 0,
      isOverflowTarget: input.isOverflowTarget ?? false,
      position: input.position ?? 0,
      purchasedAt: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO savings_goals
        (id, user_id, name, target_amount, savings_percent, is_overflow_target, position, purchased_at, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [goal.id, userId, goal.name, goal.targetAmount, goal.savingsPercent, goal.isOverflowTarget ? 1 : 0, goal.position, goal.purchasedAt, goal.createdAt, goal.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "savings_goals", goal.id, savingsGoalToWire(goal, userId));
    return goal;
  },

  async patchSavingsGoal(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();

    // If setting this goal as the overflow target, clear the flag from all others first.
    if (patch.isOverflowTarget === true) {
      const others = await db.select<DbSavingsGoalRow[]>(
        "SELECT * FROM savings_goals WHERE user_id = ? AND is_overflow_target = 1 AND id != ? AND deleted_at IS NULL",
        [userId, id],
      );
      const clearTs = now();
      for (const other of others) {
        await db.execute(
          "UPDATE savings_goals SET is_overflow_target = 0, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
          [clearTs, other.id, userId],
        );
        const cleared = fromDbSavingsGoal({ ...other, is_overflow_target: 0, updated_at: clearTs, version: other.version + 1 });
        await enqueue(userId, "update", "savings_goals", other.id, savingsGoalToWire(cleared, userId));
      }
    }

    const rows = await db.select<DbSavingsGoalRow[]>(
      "SELECT * FROM savings_goals WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Savings goal ${id} not found`);
    const existing = fromDbSavingsGoal(rows[0]);
    const updated: SavingsGoal = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE savings_goals SET name = ?, target_amount = ?, savings_percent = ?, is_overflow_target = ?,
         position = ?, purchased_at = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.targetAmount, updated.savingsPercent, updated.isOverflowTarget ? 1 : 0,
        updated.position, updated.purchasedAt,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "savings_goals", id, savingsGoalToWire(updated, userId));
    return updated;
  },

  async deleteSavingsGoal(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE savings_goals SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "savings_goals", id, null);
  },

  // ---------- savings_contributions ----------
  async listSavingsContributions() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbSavingsContribRow[]>(
      "SELECT * FROM savings_contributions WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbSavingsContrib);
  },

  async upsertSavingsContribution(input: SavingsContributionUpsert) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const existing = await db.select<DbSavingsContribRow[]>(
      "SELECT * FROM savings_contributions WHERE user_id = ? AND goal_id = ? AND month = ? AND deleted_at IS NULL LIMIT 1",
      [userId, input.goalId, input.month],
    );
    if (existing[0]) {
      const prev = fromDbSavingsContrib(existing[0]);
      const updated: SavingsContribution = {
        ...prev,
        amount: input.amount,
        updatedAt: ts,
        version: prev.version + 1,
      };
      await db.execute(
        `UPDATE savings_contributions SET amount = ?, updated_at = ?, version = ?
         WHERE id = ? AND user_id = ?`,
        [updated.amount, updated.updatedAt, updated.version, updated.id, userId],
      );
      await enqueue(userId, "update", "savings_contributions", updated.id, savingsContribToWire(updated, userId));
      return updated;
    }
    const created: SavingsContribution = {
      id: newId(),
      goalId: input.goalId,
      month: input.month,
      amount: input.amount,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO savings_contributions
        (id, user_id, goal_id, month, amount, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [created.id, userId, created.goalId, created.month, created.amount, created.createdAt, created.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "savings_contributions", created.id, savingsContribToWire(created, userId));
    return created;
  },

  async deleteSavingsContribution(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE savings_contributions SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "savings_contributions", id, null);
  },

  // ---------- incomes ----------
  async listIncomes() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbIncomeRow[]>(
      "SELECT * FROM incomes WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbIncome);
  },

  async upsertIncome(input: IncomeUpsert) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const existing = await db.select<DbIncomeRow[]>(
      "SELECT * FROM incomes WHERE user_id = ? AND month = ? AND deleted_at IS NULL LIMIT 1",
      [userId, input.month],
    );
    if (existing[0]) {
      const prev = fromDbIncome(existing[0]);
      const updated: Income = {
        ...prev,
        amount: input.amount,
        currency: input.currency,
        note: input.note ?? prev.note,
        updatedAt: ts,
        version: prev.version + 1,
      };
      await db.execute(
        `UPDATE incomes SET amount = ?, currency = ?, note = ?, updated_at = ?, version = ?
         WHERE id = ? AND user_id = ?`,
        [updated.amount, updated.currency, updated.note, updated.updatedAt, updated.version, updated.id, userId],
      );
      await enqueue(userId, "update", "incomes", updated.id, incomeToWire(updated, userId));
      return updated;
    }
    const created: Income = {
      id: newId(),
      month: input.month,
      amount: input.amount,
      currency: input.currency,
      note: input.note ?? "",
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO incomes
        (id, user_id, month, amount, currency, note, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [created.id, userId, created.month, created.amount, created.currency, created.note,
       created.createdAt, created.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "incomes", created.id, incomeToWire(created, userId));
    return created;
  },

  async deleteIncome(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE incomes SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "incomes", id, null);
  },

  // ---------- habit_logs ----------
  async listHabitLogs() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbHabitLogRow[]>(
      "SELECT * FROM habit_logs WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbHabitLog);
  },

  async upsertHabitLog(input: HabitLogUpsert) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    // Query without deleted_at filter so we can restore soft-deleted rows —
    // a plain INSERT would fail on the UNIQUE INDEX (user_id, task_id, day)
    // even when the conflicting row has deleted_at set.
    const existing = await db.select<DbHabitLogRow[]>(
      "SELECT * FROM habit_logs WHERE user_id = ? AND task_id = ? AND day = ? LIMIT 1",
      [userId, input.taskId, input.day],
    );
    if (existing[0]) {
      const prev = fromDbHabitLog(existing[0]);
      const updated: HabitLog = {
        ...prev,
        done: input.done,
        deletedAt: null,
        updatedAt: ts,
        version: prev.version + 1,
      };
      await db.execute(
        `UPDATE habit_logs SET done = ?, deleted_at = NULL, updated_at = ?, version = ?
         WHERE id = ? AND user_id = ?`,
        [updated.done ? 1 : 0, updated.updatedAt, updated.version, updated.id, userId],
      );
      await enqueue(userId, "update", "habit_logs", updated.id, habitLogToWire(updated, userId));
      return updated;
    }
    const created: HabitLog = {
      id: newId(),
      taskId: input.taskId,
      day: input.day,
      done: input.done,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO habit_logs
        (id, user_id, task_id, day, done, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [created.id, userId, created.taskId, created.day, created.done ? 1 : 0,
       created.createdAt, created.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "habit_logs", created.id, habitLogToWire(created, userId));
    return created;
  },

  async deleteHabitLog(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE habit_logs SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "habit_logs", id, null);
  },

  // ---------- shopping_items ----------
  async listShoppingItems() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbShoppingItemRow[]>(
      "SELECT * FROM shopping_items WHERE user_id = ? AND deleted_at IS NULL ORDER BY position ASC, created_at ASC",
      [userId],
    );
    return rows.map(fromDbShoppingItem);
  },

  async createShoppingItem(input: ShoppingItemCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const item: ShoppingItem = {
      id: newId(),
      name: input.name,
      quantity: input.quantity,
      bought: false,
      position: input.position ?? 0,
      ingredientId: input.ingredientId ?? null,
      presentationId: input.presentationId ?? null,
      unit: input.unit ?? null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO shopping_items
        (id, user_id, name, quantity, bought, position, ingredient_id, presentation_id, unit, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, userId, item.name, item.quantity, 0, item.position,
        item.ingredientId, item.presentationId, item.unit,
        item.createdAt, item.updatedAt, null, 1,
      ],
    );
    await enqueue(userId, "insert", "shopping_items", item.id, shoppingItemToWire(item, userId));
    return item;
  },

  async patchShoppingItem(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbShoppingItemRow[]>(
      "SELECT * FROM shopping_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Shopping item ${id} not found`);
    const existing = fromDbShoppingItem(rows[0]);
    const updated: ShoppingItem = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE shopping_items SET name = ?, quantity = ?, bought = ?, position = ?, ingredient_id = ?, presentation_id = ?, unit = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.quantity, updated.bought ? 1 : 0, updated.position,
        updated.ingredientId, updated.presentationId, updated.unit,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "shopping_items", id, shoppingItemToWire(updated, userId));
    return updated;
  },

  async deleteShoppingItem(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE shopping_items SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "shopping_items", id, null);
  },

  // ---------- ingredients ----------
  // ---------- ingredient categories ----------
  async listIngredientCategories() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbIngredientCategoryRow[]>(
      "SELECT * FROM ingredient_categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY position ASC",
      [userId],
    );
    return rows.map(fromDbIngredientCategory);
  },

  async createIngredientCategory(input: IngredientCategoryCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const cat: IngredientCategory = {
      id: newId(),
      name: input.name,
      hue: input.hue,
      position: input.position ?? 0,
      archived: false,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO ingredient_categories
        (id, user_id, name, hue, position, archived, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cat.id, userId, cat.name, cat.hue, cat.position, 0, cat.createdAt, cat.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "ingredient_categories", cat.id, ingredientCategoryToWire(cat, userId));
    return cat;
  },

  async patchIngredientCategory(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbIngredientCategoryRow[]>(
      "SELECT * FROM ingredient_categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Ingredient category ${id} not found`);
    const existing = fromDbIngredientCategory(rows[0]);
    const updated: IngredientCategory = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE ingredient_categories SET name = ?, hue = ?, position = ?, archived = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.hue, updated.position, updated.archived ? 1 : 0,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "ingredient_categories", id, ingredientCategoryToWire(updated, userId));
    return updated;
  },

  async deleteIngredientCategory(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE ingredient_categories SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "ingredient_categories", id, null);
  },

  // ---------- ingredients ----------
  async listIngredients() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbIngredientRow[]>(
      "SELECT * FROM ingredients WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC",
      [userId],
    );
    return rows.map(fromDbIngredient);
  },

  async createIngredient(input: IngredientCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const ing: Ingredient = {
      id: newId(),
      name: input.name,
      categoryId: input.categoryId ?? null,
      dimension: input.dimension,
      shelfLifeDays: input.shelfLifeDays,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO ingredients
        (id, user_id, name, category_id, dimension, shelf_life_days, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ing.id, userId, ing.name, ing.categoryId, ing.dimension, ing.shelfLifeDays, ing.createdAt, ing.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "ingredients", ing.id, ingredientToWire(ing, userId));
    return ing;
  },

  async patchIngredient(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbIngredientRow[]>(
      "SELECT * FROM ingredients WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Ingredient ${id} not found`);
    const existing = fromDbIngredient(rows[0]);
    const updated: Ingredient = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE ingredients SET name = ?, category_id = ?, dimension = ?, shelf_life_days = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.categoryId, updated.dimension, updated.shelfLifeDays,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "ingredients", id, ingredientToWire(updated, userId));
    return updated;
  },

  async deleteIngredient(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE ingredients SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "ingredients", id, null);
  },

  // ---------- ingredient_presentations ----------
  async listIngredientPresentations() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbIngredientPresentationRow[]>(
      "SELECT * FROM ingredient_presentations WHERE user_id = ? AND deleted_at IS NULL ORDER BY size ASC",
      [userId],
    );
    return rows.map(fromDbIngredientPresentation);
  },

  async createIngredientPresentation(input: IngredientPresentationCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const p: IngredientPresentation = {
      id: newId(),
      ingredientId: input.ingredientId,
      label: input.label,
      size: input.size,
      price: input.price,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO ingredient_presentations
        (id, user_id, ingredient_id, label, size, price, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, userId, p.ingredientId, p.label, p.size, p.price, p.createdAt, p.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "ingredient_presentations", p.id, ingredientPresentationToWire(p, userId));
    return p;
  },

  async patchIngredientPresentation(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbIngredientPresentationRow[]>(
      "SELECT * FROM ingredient_presentations WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Ingredient presentation ${id} not found`);
    const existing = fromDbIngredientPresentation(rows[0]);
    const updated: IngredientPresentation = {
      ...existing,
      ...patch,
      id: existing.id,
      ingredientId: existing.ingredientId,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE ingredient_presentations SET label = ?, size = ?, price = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.label, updated.size, updated.price,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "ingredient_presentations", id, ingredientPresentationToWire(updated, userId));
    return updated;
  },

  async deleteIngredientPresentation(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE ingredient_presentations SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "ingredient_presentations", id, null);
  },

  // ---------- recipes ----------
  async listRecipes() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbRecipeRow[]>(
      "SELECT * FROM recipes WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC",
      [userId],
    );
    return rows.map(fromDbRecipe);
  },

  async createRecipe(input: RecipeCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const r: Recipe = {
      id: newId(),
      name: input.name,
      servings: input.servings,
      mealType: input.mealType,
      steps: input.steps,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO recipes
        (id, user_id, name, servings, meal_type, steps, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, userId, r.name, r.servings, r.mealType, JSON.stringify(r.steps), r.createdAt, r.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "recipes", r.id, recipeToWire(r, userId));
    return r;
  },

  async patchRecipe(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbRecipeRow[]>(
      "SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Recipe ${id} not found`);
    const existing = fromDbRecipe(rows[0]);
    const updated: Recipe = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE recipes SET name = ?, servings = ?, meal_type = ?, steps = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, updated.servings, updated.mealType, JSON.stringify(updated.steps),
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "recipes", id, recipeToWire(updated, userId));
    return updated;
  },

  async deleteRecipe(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE recipes SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "recipes", id, null);
  },

  // ---------- recipe_ingredients ----------
  async listRecipeIngredients() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbRecipeIngredientRow[]>(
      "SELECT * FROM recipe_ingredients WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbRecipeIngredient);
  },

  async createRecipeIngredient(input: RecipeIngredientCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const ri: RecipeIngredient = {
      id: newId(),
      recipeId: input.recipeId,
      ingredientId: input.ingredientId ?? null,
      categoryId: input.categoryId ?? null,
      quantity: input.quantity,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO recipe_ingredients
        (id, user_id, recipe_id, ingredient_id, category_id, quantity, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ri.id, userId, ri.recipeId, ri.ingredientId ?? "", ri.categoryId, ri.quantity, ri.createdAt, ri.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "recipe_ingredients", ri.id, recipeIngredientToWire(ri, userId));
    return ri;
  },

  async patchRecipeIngredient(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbRecipeIngredientRow[]>(
      "SELECT * FROM recipe_ingredients WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Recipe ingredient ${id} not found`);
    const existing = fromDbRecipeIngredient(rows[0]);
    const updated: RecipeIngredient = {
      ...existing,
      ...patch,
      id: existing.id,
      recipeId: existing.recipeId,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE recipe_ingredients SET ingredient_id = ?, category_id = ?, quantity = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.ingredientId ?? "", updated.categoryId, updated.quantity,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "recipe_ingredients", id, recipeIngredientToWire(updated, userId));
    return updated;
  },

  async deleteRecipeIngredient(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE recipe_ingredients SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "recipe_ingredients", id, null);
  },

  // ---------- saved_lists ----------
  async listSavedLists() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbSavedListRow[]>(
      "SELECT * FROM saved_lists WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC",
      [userId],
    );
    return rows.map(fromDbSavedList);
  },

  async createSavedList(input: SavedListCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const list: SavedList = {
      id: newId(),
      name: input.name,
      items: input.items,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO saved_lists
        (id, user_id, name, items, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [list.id, userId, list.name, JSON.stringify(list.items), list.createdAt, list.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "saved_lists", list.id, savedListToWire(list, userId));
    return list;
  },

  async patchSavedList(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbSavedListRow[]>(
      "SELECT * FROM saved_lists WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Saved list ${id} not found`);
    const existing = fromDbSavedList(rows[0]);
    const updated: SavedList = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE saved_lists SET name = ?, items = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name, JSON.stringify(updated.items),
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "saved_lists", id, savedListToWire(updated, userId));
    return updated;
  },

  async deleteSavedList(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE saved_lists SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "saved_lists", id, null);
  },

  // ---------- meal_plan_entries ----------
  async listMealPlanEntries() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbMealPlanEntryRow[]>(
      "SELECT * FROM meal_plan_entries WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbMealPlanEntry);
  },

  async createMealPlanEntry(input: MealPlanEntryCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const e: MealPlanEntry = {
      id: newId(),
      weekStart: input.weekStart,
      recipeId: input.recipeId,
      targetServings: input.targetServings,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO meal_plan_entries
        (id, user_id, week_start, recipe_id, target_servings, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, userId, e.weekStart, e.recipeId, e.targetServings, e.createdAt, e.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "meal_plan_entries", e.id, mealPlanEntryToWire(e, userId));
    return e;
  },

  async patchMealPlanEntry(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbMealPlanEntryRow[]>(
      "SELECT * FROM meal_plan_entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Meal plan entry ${id} not found`);
    const existing = fromDbMealPlanEntry(rows[0]);
    const updated: MealPlanEntry = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE meal_plan_entries SET week_start = ?, recipe_id = ?, target_servings = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.weekStart, updated.recipeId, updated.targetServings,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "meal_plan_entries", id, mealPlanEntryToWire(updated, userId));
    return updated;
  },

  async deleteMealPlanEntry(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE meal_plan_entries SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "meal_plan_entries", id, null);
  },

  // ---------- inventory ----------
  async listInventory() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbInventoryRow[]>(
      "SELECT * FROM inventory WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbInventory);
  },

  async createInventory(input: InventoryCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const created: InventoryItem = {
      id: newId(),
      ingredientId: input.ingredientId,
      presentationId: input.presentationId,
      quantity: input.quantity,
      expiresOn: input.expiresOn,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO inventory
        (id, user_id, ingredient_id, presentation_id, quantity, expires_on, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [created.id, userId, created.ingredientId, created.presentationId, created.quantity, created.expiresOn, created.createdAt, created.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "inventory", created.id, inventoryToWire(created, userId));
    return created;
  },

  async patchInventory(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbInventoryRow[]>(
      "SELECT * FROM inventory WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Inventory lot ${id} not found`);
    const existing = fromDbInventory(rows[0]);
    const updated: InventoryItem = {
      ...existing,
      ...patch,
      id: existing.id,
      ingredientId: existing.ingredientId,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE inventory SET presentation_id = ?, quantity = ?, expires_on = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.presentationId, updated.quantity, updated.expiresOn,
        updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    await enqueue(userId, "update", "inventory", id, inventoryToWire(updated, userId));
    return updated;
  },

  async deleteInventory(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE inventory SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "inventory", id, null);
  },

  // ---------- meal_log ----------
  async listMealLogs() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbMealLogRow[]>(
      "SELECT * FROM meal_log WHERE user_id = ? AND deleted_at IS NULL ORDER BY eaten_on DESC",
      [userId],
    );
    return rows.map(fromDbMealLog);
  },

  async createMealLog(input: MealLogCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const log: MealLog = {
      id: newId(),
      eatenOn: input.eatenOn,
      mealSlot: input.mealSlot,
      recipeId: input.recipeId,
      servings: input.servings,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO meal_log
        (id, user_id, eaten_on, meal_slot, recipe_id, servings, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [log.id, userId, log.eatenOn, log.mealSlot, log.recipeId, log.servings, log.createdAt, log.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "meal_log", log.id, mealLogToWire(log, userId));
    return log;
  },

  async deleteMealLog(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE meal_log SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "meal_log", id, null);
  },

  // ---------- compras_settings (one row per user) ----------
  async getComprasSettings() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbComprasSettingsRow[]>(
      "SELECT * FROM compras_settings WHERE user_id = ? AND deleted_at IS NULL LIMIT 1",
      [userId],
    );
    return rows[0] ? fromDbComprasSettings(rows[0]) : null;
  },

  async upsertComprasSettings(input: ComprasSettingsUpsert) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const rows = await db.select<DbComprasSettingsRow[]>(
      "SELECT * FROM compras_settings WHERE user_id = ? AND deleted_at IS NULL LIMIT 1",
      [userId],
    );
    const prev = rows[0]
      ? fromDbComprasSettings(rows[0])
      : null;
    const merged: ComprasSettings = {
      id: prev?.id ?? newId(),
      mealTimes: input.mealTimes ?? prev?.mealTimes ?? {
        desayuno: "08:00", almuerzo: "13:00", merienda: "17:00", cena: "21:00",
      },
      expiryWarnDays: input.expiryWarnDays ?? prev?.expiryWarnDays ?? 2,
      notificationsEnabled: input.notificationsEnabled ?? prev?.notificationsEnabled ?? false,
      dkkPerUsd: input.dkkPerUsd ?? prev?.dkkPerUsd ?? 6.9,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
      deletedAt: null,
      version: (prev?.version ?? 0) + 1,
    };
    if (prev) {
      await db.execute(
        `UPDATE compras_settings SET meal_times = ?, expiry_warn_days = ?, notifications_enabled = ?, dkk_per_usd = ?, updated_at = ?, version = ?
         WHERE id = ? AND user_id = ?`,
        [
          JSON.stringify(merged.mealTimes), merged.expiryWarnDays, merged.notificationsEnabled ? 1 : 0,
          merged.dkkPerUsd, merged.updatedAt, merged.version, merged.id, userId,
        ],
      );
      await enqueue(userId, "update", "compras_settings", merged.id, comprasSettingsToWire(merged, userId));
    } else {
      await db.execute(
        `INSERT INTO compras_settings
          (id, user_id, meal_times, expiry_warn_days, notifications_enabled, dkk_per_usd, created_at, updated_at, deleted_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          merged.id, userId, JSON.stringify(merged.mealTimes), merged.expiryWarnDays,
          merged.notificationsEnabled ? 1 : 0, merged.dkkPerUsd, merged.createdAt, merged.updatedAt, null, merged.version,
        ],
      );
      await enqueue(userId, "insert", "compras_settings", merged.id, comprasSettingsToWire(merged, userId));
    }
    return merged;
  },

  async listEvents() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbEventRow[]>(
      "SELECT * FROM events WHERE user_id = ? AND deleted_at IS NULL",
      [userId],
    );
    return rows.map(fromDbEvent);
  },

  async createEvent(input: EventCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const event: CalendarEvent = {
      id: newId(),
      title: input.title,
      day: input.day,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      location: input.location ?? "",
      notifyMinutesBefore: input.notifyMinutesBefore ?? null,
      notes: input.notes ?? "",
      categoryId: input.categoryId ?? null,
      projectId: input.projectId ?? null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO events
        (id, user_id, title, day, start_time, end_time, location, notify_minutes_before, notes, category_id, project_id, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, userId, event.title, event.day, event.startTime, event.endTime, event.location,
       event.notifyMinutesBefore, event.notes, event.categoryId, event.projectId,
       event.createdAt, event.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "events", event.id, eventToWire(event, userId));
    return event;
  },

  async patchEvent(id, patch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbEventRow[]>(
      "SELECT * FROM events WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Event ${id} not found`);
    const existing = fromDbEvent(rows[0]);
    const updated: CalendarEvent = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE events SET title = ?, day = ?, start_time = ?, end_time = ?, location = ?,
         notify_minutes_before = ?, notes = ?, category_id = ?, project_id = ?,
         updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [updated.title, updated.day, updated.startTime, updated.endTime, updated.location,
       updated.notifyMinutesBefore, updated.notes, updated.categoryId, updated.projectId,
       updated.updatedAt, updated.deletedAt, updated.version, id, userId],
    );
    await enqueue(userId, "update", "events", id, eventToWire(updated, userId));
    return updated;
  },

  async deleteEvent(id) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE events SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "events", id, null);
  },

  // ---------- automations (local-only — no enqueue) ----------
  async listAutomations() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbAutomationRow[]>(
      "SELECT * FROM automations WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
      [userId],
    );
    return rows.map(fromDbAutomation);
  },

  async createAutomation(input: AutomationCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const automation: Automation = {
      id: newId(),
      projectId: input.projectId ?? null,
      name: input.name,
      kind: input.kind,
      config: input.config ?? {},
      trigger: input.trigger ?? "manual",
      schedule: input.schedule ?? null,
      enabled: input.enabled ?? true,
      notes: input.notes ?? "",
      lastRunAt: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO automations
        (id, user_id, project_id, name, kind, config, trigger, schedule, enabled, notes, last_run_at, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        automation.id, userId, automation.projectId, automation.name, automation.kind,
        JSON.stringify(automation.config), automation.trigger, automation.schedule,
        automation.enabled ? 1 : 0, automation.notes, null,
        automation.createdAt, automation.updatedAt, null, 1,
      ],
    );
    return automation;
  },

  async patchAutomation(id: string, patch: AutomationPatch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbAutomationRow[]>(
      "SELECT * FROM automations WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`Automation ${id} not found`);
    const existing = fromDbAutomation(rows[0]);
    const updated: Automation = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      version: existing.version + 1,
    };
    await db.execute(
      `UPDATE automations SET project_id = ?, name = ?, kind = ?, config = ?, trigger = ?,
         schedule = ?, enabled = ?, notes = ?, last_run_at = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.projectId, updated.name, updated.kind, JSON.stringify(updated.config),
        updated.trigger, updated.schedule, updated.enabled ? 1 : 0, updated.notes,
        updated.lastRunAt, updated.updatedAt, updated.deletedAt, updated.version,
        id, userId,
      ],
    );
    return updated;
  },

  async deleteAutomation(id: string) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE automations SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
  },

  // ---------- coffee beans ----------
  async listCoffeeBeans() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbCoffeeBeanRow[]>(
      "SELECT * FROM coffee_beans WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
      [userId],
    );
    return rows.map(fromDbCoffeeBean);
  },

  async createCoffeeBean(input: CoffeeBeanCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const bean: CoffeeBean = {
      id: newId(),
      name: input.name,
      roaster: input.roaster ?? "",
      varietal: input.varietal ?? "",
      country: input.country ?? "",
      process: input.process ?? "",
      producer: input.producer ?? "",
      roastedOn: input.roastedOn ?? null,
      weightGrams: input.weightGrams ?? 0,
      notes: input.notes ?? "",
      cataInicial: input.cataInicial ?? "",
      notaFinal: input.notaFinal ?? "",
      lastTweak: input.lastTweak ?? null,
      finishedAt: input.finishedAt ?? null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO coffee_beans
        (id, user_id, name, roaster, varietal, country, process, producer, roasted_on,
         weight_grams, notes, cata_inicial, nota_final, last_tweak, finished_at, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bean.id, userId, bean.name, bean.roaster, bean.varietal, bean.country, bean.process,
       bean.producer, bean.roastedOn, bean.weightGrams, bean.notes,
       bean.cataInicial, bean.notaFinal, bean.lastTweak ? JSON.stringify(bean.lastTweak) : "",
       bean.finishedAt,
       bean.createdAt, bean.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "coffee_beans", bean.id, coffeeBeanToWire(bean, userId));
    return bean;
  },

  async patchCoffeeBean(id: string, patch: CoffeeBeanPatch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbCoffeeBeanRow[]>(
      "SELECT * FROM coffee_beans WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`CoffeeBean ${id} not found`);
    const existing = fromDbCoffeeBean(rows[0]);
    const updated: CoffeeBean = {
      ...existing, ...patch, id: existing.id, createdAt: existing.createdAt,
      updatedAt: now(), version: existing.version + 1,
    };
    await db.execute(
      `UPDATE coffee_beans SET name = ?, roaster = ?, varietal = ?, country = ?, process = ?,
         producer = ?, roasted_on = ?, weight_grams = ?, notes = ?,
         cata_inicial = ?, nota_final = ?, last_tweak = ?, finished_at = ?,
         updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [updated.name, updated.roaster, updated.varietal, updated.country, updated.process,
       updated.producer, updated.roastedOn, updated.weightGrams,
       updated.notes, updated.cataInicial, updated.notaFinal,
       updated.lastTweak ? JSON.stringify(updated.lastTweak) : "",
       updated.finishedAt,
       updated.updatedAt, updated.deletedAt, updated.version, id, userId],
    );
    await enqueue(userId, "update", "coffee_beans", id, coffeeBeanToWire(updated, userId));
    return updated;
  },

  /** Descuenta gramos del stock del grano. Si llega a 0, lo marca terminado
   *  (finished_at). Devuelve el grano actualizado. */
  async consumeCoffeeBean(id: string, grams: number) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbCoffeeBeanRow[]>(
      "SELECT * FROM coffee_beans WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`CoffeeBean ${id} not found`);
    const existing = fromDbCoffeeBean(rows[0]);
    const newWeight = Math.max(0, existing.weightGrams - Math.max(0, grams));
    const patch: CoffeeBeanPatch = { weightGrams: newWeight };
    if (newWeight <= 0 && !existing.finishedAt) patch.finishedAt = now();
    return localRepo.patchCoffeeBean(id, patch);
  },

  async deleteCoffeeBean(id: string) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE coffee_beans SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "coffee_beans", id, null);
  },

  // ---------- coffee recipes ----------
  async listCoffeeRecipes() {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbCoffeeRecipeRow[]>(
      "SELECT * FROM coffee_recipes WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
      [userId],
    );
    return rows.map(fromDbCoffeeRecipe);
  },

  async createCoffeeRecipe(input: CoffeeRecipeCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const recipe: CoffeeRecipe = {
      id: newId(),
      name: input.name,
      coffeeType: input.coffeeType ?? "",
      ratio: input.ratio ?? 15,
      tempCelsius: input.tempCelsius ?? 93,
      grindSize: input.grindSize ?? "",
      steps: input.steps ?? [],
      notes: input.notes ?? "",
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.execute(
      `INSERT INTO coffee_recipes
        (id, user_id, name, coffee_type, ratio, temp_celsius, grind_size, steps, notes,
         created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipe.id, userId, recipe.name, recipe.coffeeType, recipe.ratio, recipe.tempCelsius,
       recipe.grindSize, JSON.stringify(recipe.steps), recipe.notes,
       recipe.createdAt, recipe.updatedAt, null, 1],
    );
    await enqueue(userId, "insert", "coffee_recipes", recipe.id, coffeeRecipeToWire(recipe, userId));
    return recipe;
  },

  async patchCoffeeRecipe(id: string, patch: CoffeeRecipePatch) {
    const userId = await requireUserId();
    const db = await getDb();
    const rows = await db.select<DbCoffeeRecipeRow[]>(
      "SELECT * FROM coffee_recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [id, userId],
    );
    if (!rows[0]) throw new Error(`CoffeeRecipe ${id} not found`);
    const existing = fromDbCoffeeRecipe(rows[0]);
    const updated: CoffeeRecipe = {
      ...existing, ...patch, id: existing.id, createdAt: existing.createdAt,
      updatedAt: now(), version: existing.version + 1,
    };
    await db.execute(
      `UPDATE coffee_recipes SET name = ?, coffee_type = ?, ratio = ?, temp_celsius = ?,
         grind_size = ?, steps = ?, notes = ?, updated_at = ?, deleted_at = ?, version = ?
       WHERE id = ? AND user_id = ?`,
      [updated.name, updated.coffeeType, updated.ratio, updated.tempCelsius,
       updated.grindSize, JSON.stringify(updated.steps), updated.notes,
       updated.updatedAt, updated.deletedAt, updated.version, id, userId],
    );
    await enqueue(userId, "update", "coffee_recipes", id, coffeeRecipeToWire(updated, userId));
    return updated;
  },

  async deleteCoffeeRecipe(id: string) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE coffee_recipes SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await enqueue(userId, "delete", "coffee_recipes", id, null);
  },

  // ── Brew sessions ──────────────────────────────────────────────────────────

  async listBrewSessions(recipeId?: string) {
    const userId = await requireUserId();
    const db = await getDb();
    interface Row {
      id: string; recipe_id: string | null; recipe_name: string;
      bean_id: string | null; bean_name: string; dose_grams: number;
      total_water_grams: number; duration_ms: number; notes: string;
      created_at: string; updated_at: string; deleted_at: string | null; version: number;
    }
    const rows = recipeId
      ? await db.select<Row[]>(
          "SELECT * FROM brew_sessions WHERE user_id = ? AND recipe_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
          [userId, recipeId],
        )
      : await db.select<Row[]>(
          "SELECT * FROM brew_sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
          [userId],
        );
    return rows.map((r): BrewSession => ({
      id: r.id, recipeId: r.recipe_id, recipeName: r.recipe_name,
      beanId: r.bean_id, beanName: r.bean_name, doseGrams: r.dose_grams,
      totalWaterGrams: r.total_water_grams, durationMs: r.duration_ms,
      notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
      deletedAt: r.deleted_at, version: r.version,
    }));
  },

  async createBrewSession(input: BrewSessionCreate) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    const session: BrewSession = {
      id: newId(),
      recipeId: input.recipeId ?? null,
      recipeName: input.recipeName ?? "",
      beanId: input.beanId ?? null,
      beanName: input.beanName ?? "",
      doseGrams: input.doseGrams,
      totalWaterGrams: input.totalWaterGrams ?? 0,
      durationMs: input.durationMs ?? 0,
      notes: input.notes ?? "",
      createdAt: ts, updatedAt: ts, deletedAt: null, version: 1,
    };
    const points = input.datapoints ?? [];
    const wirePoints = points.map((p) => ({
      timer_ms: p.timerMs, weight_g: p.weightG ?? null, flow_g_s: p.flowGs ?? null, step_idx: p.stepIdx,
    }));
    await db.execute(
      `INSERT INTO brew_sessions
        (id, user_id, recipe_id, recipe_name, bean_id, bean_name,
         dose_grams, total_water_grams, duration_ms, notes, datapoints,
         created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.id, userId, session.recipeId, session.recipeName,
       session.beanId, session.beanName, session.doseGrams,
       session.totalWaterGrams, session.durationMs, session.notes,
       JSON.stringify(wirePoints),
       session.createdAt, session.updatedAt, null, 1],
    );
    // tambien guardar los puntos en la tabla local para lectura rapida del chart
    if (points.length > 0) {
      for (let i = 0; i < points.length; i += 100) {
        for (const p of points.slice(i, i + 100)) {
          await db.execute(
            "INSERT INTO brew_datapoints (session_id, timer_ms, weight_g, flow_g_s, step_idx) VALUES (?, ?, ?, ?, ?)",
            [session.id, p.timerMs, p.weightG ?? null, p.flowGs ?? null, p.stepIdx],
          );
        }
      }
    }
    await enqueue(userId, "insert", "brew_sessions", session.id, {
      id: session.id, user_id: userId, recipe_id: session.recipeId,
      recipe_name: session.recipeName, bean_id: session.beanId,
      bean_name: session.beanName, dose_grams: session.doseGrams,
      total_water_grams: session.totalWaterGrams, duration_ms: session.durationMs,
      notes: session.notes, datapoints: wirePoints, created_at: session.createdAt,
      updated_at: session.updatedAt, deleted_at: null, version: 1,
    });
    return session;
  },

  async addBrewDatapoints(
    sessionId: string,
    points: Omit<BrewDatapoint, "id" | "sessionId">[],
  ) {
    if (points.length === 0) return;
    const db = await getDb();
    // batch insert in chunks of 100 to avoid SQLite limits
    for (let i = 0; i < points.length; i += 100) {
      const chunk = points.slice(i, i + 100);
      for (const p of chunk) {
        await db.execute(
          "INSERT INTO brew_datapoints (session_id, timer_ms, weight_g, flow_g_s, step_idx) VALUES (?, ?, ?, ?, ?)",
          [sessionId, p.timerMs, p.weightG ?? null, p.flowGs ?? null, p.stepIdx],
        );
      }
    }
  },

  async getBrewDatapoints(sessionId: string) {
    const db = await getDb();
    interface Row { id: number; session_id: string; timer_ms: number; weight_g: number | null; flow_g_s: number | null; step_idx: number }
    const rows = await db.select<Row[]>(
      "SELECT * FROM brew_datapoints WHERE session_id = ? ORDER BY timer_ms ASC",
      [sessionId],
    );
    return rows.map((r): BrewDatapoint => ({
      id: r.id, sessionId: r.session_id, timerMs: r.timer_ms,
      weightG: r.weight_g, flowGs: r.flow_g_s, stepIdx: r.step_idx,
    }));
  },

  async deleteBrewSession(id: string) {
    const userId = await requireUserId();
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE brew_sessions SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?",
      [ts, ts, id, userId],
    );
    await db.execute("DELETE FROM brew_datapoints WHERE session_id = ?", [id]);
    await enqueue(userId, "delete", "brew_sessions", id, null);
  },
};

// ---------- "wire" helpers: shapes that go into the outbox payload to send
// to Supabase. They use snake_case keys. ----------

function taskToWire(t: Task, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    title: t.title,
    project_id: t.projectId,
    category_id: t.categoryId,
    priority: t.priority,
    duration: t.duration,
    actual_duration: t.actualDuration,
    day: t.day,
    due: t.due,
    recurring: t.recurring,
    recurrence: t.recurrence,
    recurrence_parent_id: t.recurrenceParentId,
    notes: t.notes,
    subtasks: t.subtasks,
    done: t.done,
    is_habit: t.isHabit,
    completed_at: t.completedAt,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    deleted_at: t.deletedAt,
    version: t.version,
  };
}

function projectToWire(p: Project, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    category_id: p.categoryId,
    objetivo: p.objetivo,
    estado: p.estado,
    milestones: p.milestones,
    archived: p.archived,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt,
    version: p.version,
  };
}

function categoryToWire(c: Category, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    hue: c.hue,
    position: c.position,
    archived: c.archived,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
    version: c.version,
  };
}

interface DbExpenseCategoryRow {
  id: string;
  user_id: string;
  name: string;
  hue: number;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

interface DbExpenseRow {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  category_id: string | null;
  spent_on: string;
  note: string;
  recurrence: string | null;
  recurrence_parent_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

interface DbBudgetRow {
  id: string;
  user_id: string;
  category_id: string;
  monthly_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbExpenseCategory(r: DbExpenseCategoryRow): ExpenseCategory {
  return {
    id: r.id,
    name: r.name,
    hue: r.hue,
    position: r.position,
    archived: boolFromDb(r.archived),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function fromDbExpense(r: DbExpenseRow): Expense {
  return {
    id: r.id,
    name: r.name ?? "",
    amount: r.amount,
    currency: r.currency,
    categoryId: r.category_id,
    spentOn: r.spent_on,
    note: r.note,
    recurrence: parseJson<RecurrenceRule | null>(r.recurrence, null),
    recurrenceParentId: r.recurrence_parent_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function fromDbBudget(r: DbBudgetRow): Budget {
  return {
    id: r.id,
    categoryId: r.category_id,
    monthlyAmount: r.monthly_amount,
    currency: r.currency,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function expenseCategoryToWire(c: ExpenseCategory, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    hue: c.hue,
    position: c.position,
    archived: c.archived,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
    version: c.version,
  };
}

function expenseToWire(e: Expense, userId: string) {
  return {
    id: e.id,
    user_id: userId,
    name: e.name,
    amount: e.amount,
    currency: e.currency,
    category_id: e.categoryId,
    spent_on: e.spentOn,
    note: e.note,
    recurrence: e.recurrence,
    recurrence_parent_id: e.recurrenceParentId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
    version: e.version,
  };
}

function budgetToWire(b: Budget, userId: string) {
  return {
    id: b.id,
    user_id: userId,
    category_id: b.categoryId,
    monthly_amount: b.monthlyAmount,
    currency: b.currency,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    deleted_at: b.deletedAt,
    version: b.version,
  };
}

interface DbSavingsGoalRow {
  id: string;
  user_id: string;
  name: string;
  target_amount: number | null;
  savings_percent: number;
  is_overflow_target: number;
  position: number;
  purchased_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

interface DbSavingsContribRow {
  id: string;
  user_id: string;
  goal_id: string;
  month: string;
  amount: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbSavingsGoal(r: DbSavingsGoalRow): SavingsGoal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: r.target_amount,
    savingsPercent: r.savings_percent ?? 0,
    isOverflowTarget: boolFromDb(r.is_overflow_target ?? 0),
    position: r.position,
    purchasedAt: r.purchased_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function fromDbSavingsContrib(r: DbSavingsContribRow): SavingsContribution {
  return {
    id: r.id,
    goalId: r.goal_id,
    month: r.month,
    amount: r.amount,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function savingsGoalToWire(g: SavingsGoal, userId: string) {
  return {
    id: g.id,
    user_id: userId,
    name: g.name,
    target_amount: g.targetAmount,
    savings_percent: g.savingsPercent,
    is_overflow_target: g.isOverflowTarget,
    position: g.position,
    purchased_at: g.purchasedAt,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
    deleted_at: g.deletedAt,
    version: g.version,
  };
}

function savingsContribToWire(c: SavingsContribution, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    goal_id: c.goalId,
    month: c.month,
    amount: c.amount,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
    version: c.version,
  };
}

interface DbIncomeRow {
  id: string;
  user_id: string;
  month: string;
  amount: number;
  currency: string;
  note: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbIncome(r: DbIncomeRow): Income {
  return {
    id: r.id,
    month: r.month,
    amount: r.amount,
    currency: r.currency,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function incomeToWire(i: Income, userId: string) {
  return {
    id: i.id,
    user_id: userId,
    month: i.month,
    amount: i.amount,
    currency: i.currency,
    note: i.note,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    deleted_at: i.deletedAt,
    version: i.version,
  };
}

interface DbHabitLogRow {
  id: string;
  user_id: string;
  task_id: string;
  day: string;
  done: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbHabitLog(r: DbHabitLogRow): HabitLog {
  return {
    id: r.id,
    taskId: r.task_id,
    day: r.day,
    done: boolFromDb(r.done),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function habitLogToWire(h: HabitLog, userId: string) {
  return {
    id: h.id,
    user_id: userId,
    task_id: h.taskId,
    day: h.day,
    done: h.done,
    created_at: h.createdAt,
    updated_at: h.updatedAt,
    deleted_at: h.deletedAt,
    version: h.version,
  };
}

interface DbShoppingItemRow {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  bought: number;
  position: number;
  ingredient_id: string | null;
  presentation_id: string | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbShoppingItem(r: DbShoppingItemRow): ShoppingItem {
  return {
    id: r.id,
    name: r.name,
    quantity: r.quantity,
    bought: boolFromDb(r.bought),
    position: r.position,
    ingredientId: r.ingredient_id ?? null,
    presentationId: r.presentation_id ?? null,
    unit: r.unit ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function shoppingItemToWire(s: ShoppingItem, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    name: s.name,
    quantity: s.quantity,
    bought: s.bought,
    position: s.position,
    ingredient_id: s.ingredientId,
    presentation_id: s.presentationId,
    unit: s.unit,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    deleted_at: s.deletedAt,
    version: s.version,
  };
}

interface DbIngredientCategoryRow {
  id: string;
  user_id: string;
  name: string;
  hue: number;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbIngredientCategory(r: DbIngredientCategoryRow): IngredientCategory {
  return {
    id: r.id,
    name: r.name,
    hue: r.hue,
    position: r.position,
    archived: boolFromDb(r.archived),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function ingredientCategoryToWire(c: IngredientCategory, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    hue: c.hue,
    position: c.position,
    archived: c.archived ? 1 : 0,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
    version: c.version,
  };
}

interface DbIngredientRow {
  id: string;
  user_id: string;
  name: string;
  category_id: string | null;
  dimension: string;
  shelf_life_days: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbIngredient(r: DbIngredientRow): Ingredient {
  return {
    id: r.id,
    name: r.name,
    categoryId: r.category_id ?? null,
    dimension: r.dimension as IngredientDimension,
    shelfLifeDays: r.shelf_life_days,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function ingredientToWire(i: Ingredient, userId: string) {
  return {
    id: i.id,
    user_id: userId,
    name: i.name,
    category_id: i.categoryId,
    dimension: i.dimension,
    shelf_life_days: i.shelfLifeDays,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    deleted_at: i.deletedAt,
    version: i.version,
  };
}

interface DbIngredientPresentationRow {
  id: string;
  user_id: string;
  ingredient_id: string;
  label: string;
  size: number;
  price: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbIngredientPresentation(r: DbIngredientPresentationRow): IngredientPresentation {
  return {
    id: r.id,
    ingredientId: r.ingredient_id,
    label: r.label,
    size: r.size,
    price: r.price,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function ingredientPresentationToWire(p: IngredientPresentation, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    ingredient_id: p.ingredientId,
    label: p.label,
    size: p.size,
    price: p.price,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt,
    version: p.version,
  };
}

interface DbRecipeRow {
  id: string;
  user_id: string;
  name: string;
  servings: number;
  meal_type: string;
  steps: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbRecipe(r: DbRecipeRow): Recipe {
  return {
    id: r.id,
    name: r.name,
    servings: r.servings,
    mealType: r.meal_type as MealType,
    steps: parseJson<string[]>(r.steps, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function recipeToWire(r: Recipe, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    name: r.name,
    servings: r.servings,
    meal_type: r.mealType,
    steps: r.steps,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt,
    version: r.version,
  };
}

interface DbRecipeIngredientRow {
  id: string;
  user_id: string;
  recipe_id: string;
  ingredient_id: string;
  category_id: string | null;
  quantity: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbRecipeIngredient(r: DbRecipeIngredientRow): RecipeIngredient {
  return {
    id: r.id,
    recipeId: r.recipe_id,
    ingredientId: r.ingredient_id || null, // '' (slot generico) -> null
    categoryId: r.category_id ?? null,
    quantity: r.quantity,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function recipeIngredientToWire(ri: RecipeIngredient, userId: string) {
  return {
    id: ri.id,
    user_id: userId,
    recipe_id: ri.recipeId,
    ingredient_id: ri.ingredientId || null, // '' / null -> null para el FK del server
    category_id: ri.categoryId,
    quantity: ri.quantity,
    created_at: ri.createdAt,
    updated_at: ri.updatedAt,
    deleted_at: ri.deletedAt,
    version: ri.version,
  };
}

interface DbSavedListRow {
  id: string;
  user_id: string;
  name: string;
  items: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbSavedList(r: DbSavedListRow): SavedList {
  return {
    id: r.id,
    name: r.name,
    items: parseJson<SavedListItem[]>(r.items, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function savedListToWire(l: SavedList, userId: string) {
  return {
    id: l.id,
    user_id: userId,
    name: l.name,
    items: l.items,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
    deleted_at: l.deletedAt,
    version: l.version,
  };
}

interface DbMealPlanEntryRow {
  id: string;
  user_id: string;
  week_start: string;
  recipe_id: string;
  target_servings: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbMealPlanEntry(r: DbMealPlanEntryRow): MealPlanEntry {
  return {
    id: r.id,
    weekStart: r.week_start,
    recipeId: r.recipe_id,
    targetServings: r.target_servings,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function mealPlanEntryToWire(e: MealPlanEntry, userId: string) {
  return {
    id: e.id,
    user_id: userId,
    week_start: e.weekStart,
    recipe_id: e.recipeId,
    target_servings: e.targetServings,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
    version: e.version,
  };
}

interface DbInventoryRow {
  id: string;
  user_id: string;
  ingredient_id: string;
  presentation_id: string | null;
  quantity: number;
  expires_on: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbInventory(r: DbInventoryRow): InventoryItem {
  return {
    id: r.id,
    ingredientId: r.ingredient_id,
    presentationId: r.presentation_id ?? null,
    quantity: r.quantity,
    expiresOn: r.expires_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function inventoryToWire(i: InventoryItem, userId: string) {
  return {
    id: i.id,
    user_id: userId,
    ingredient_id: i.ingredientId,
    presentation_id: i.presentationId,
    quantity: i.quantity,
    expires_on: i.expiresOn,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    deleted_at: i.deletedAt,
    version: i.version,
  };
}

interface DbMealLogRow {
  id: string;
  user_id: string;
  eaten_on: string;
  meal_slot: string;
  recipe_id: string;
  servings: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbMealLog(r: DbMealLogRow): MealLog {
  return {
    id: r.id,
    eatenOn: r.eaten_on,
    mealSlot: r.meal_slot as MealSlot,
    recipeId: r.recipe_id,
    servings: r.servings,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function mealLogToWire(m: MealLog, userId: string) {
  return {
    id: m.id,
    user_id: userId,
    eaten_on: m.eatenOn,
    meal_slot: m.mealSlot,
    recipe_id: m.recipeId,
    servings: m.servings,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    deleted_at: m.deletedAt,
    version: m.version,
  };
}

interface DbComprasSettingsRow {
  id: string;
  user_id: string;
  meal_times: string;
  expiry_warn_days: number;
  notifications_enabled: number;
  dkk_per_usd: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbComprasSettings(r: DbComprasSettingsRow): ComprasSettings {
  return {
    id: r.id,
    mealTimes: parseJson<MealTimes>(r.meal_times, {
      desayuno: "08:00", almuerzo: "13:00", merienda: "17:00", cena: "21:00",
    }),
    expiryWarnDays: r.expiry_warn_days,
    notificationsEnabled: boolFromDb(r.notifications_enabled),
    dkkPerUsd: r.dkk_per_usd,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function comprasSettingsToWire(s: ComprasSettings, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    meal_times: s.mealTimes,
    expiry_warn_days: s.expiryWarnDays,
    notifications_enabled: s.notificationsEnabled,
    dkk_per_usd: s.dkkPerUsd,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    deleted_at: s.deletedAt,
    version: s.version,
  };
}

interface DbEventRow {
  id: string;
  user_id: string;
  title: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  notify_minutes_before: number | null;
  notes: string;
  category_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbEvent(r: DbEventRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    day: r.day,
    startTime: r.start_time,
    endTime: r.end_time,
    location: r.location,
    notifyMinutesBefore: r.notify_minutes_before,
    notes: r.notes,
    categoryId: r.category_id,
    projectId: r.project_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function eventToWire(e: CalendarEvent, userId: string) {
  return {
    id: e.id,
    user_id: userId,
    title: e.title,
    day: e.day,
    start_time: e.startTime,
    end_time: e.endTime,
    location: e.location,
    notify_minutes_before: e.notifyMinutesBefore,
    notes: e.notes,
    category_id: e.categoryId,
    project_id: e.projectId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
    version: e.version,
  };
}

interface DbExpenseLineItemRow {
  id: string;
  user_id: string;
  expense_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbExpenseLineItem(r: DbExpenseLineItemRow): ExpenseLineItem {
  return {
    id: r.id,
    expenseId: r.expense_id,
    name: r.name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function expenseLineItemToWire(li: ExpenseLineItem, userId: string) {
  return {
    id: li.id,
    user_id: userId,
    expense_id: li.expenseId,
    name: li.name,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    created_at: li.createdAt,
    updated_at: li.updatedAt,
    deleted_at: li.deletedAt,
    version: li.version,
  };
}

interface DbAutomationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  kind: string;
  config: string;
  trigger: "manual" | "scheduled";
  schedule: string | null;
  enabled: number;
  notes: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

interface DbCoffeeBeanRow {
  id: string;
  user_id: string;
  name: string;
  roaster: string;
  varietal: string;
  country: string;
  process: string;
  producer: string;
  roasted_on: string | null;
  weight_grams: number;
  notes: string;
  cata_inicial: string;
  nota_final: string;
  last_tweak: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbCoffeeBean(r: DbCoffeeBeanRow): CoffeeBean {
  return {
    id: r.id,
    name: r.name,
    roaster: r.roaster,
    varietal: r.varietal,
    country: r.country,
    process: r.process,
    producer: r.producer,
    roastedOn: r.roasted_on,
    weightGrams: r.weight_grams,
    notes: r.notes,
    cataInicial: r.cata_inicial ?? "",
    notaFinal: r.nota_final ?? "",
    lastTweak: r.last_tweak ? parseJson<CoffeeTweak | null>(r.last_tweak, null) : null,
    finishedAt: r.finished_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function coffeeBeanToWire(b: CoffeeBean, userId: string) {
  return {
    id: b.id, user_id: userId, name: b.name, roaster: b.roaster, varietal: b.varietal,
    country: b.country, process: b.process, producer: b.producer, roasted_on: b.roastedOn,
    weight_grams: b.weightGrams, notes: b.notes,
    cata_inicial: b.cataInicial, nota_final: b.notaFinal, last_tweak: b.lastTweak,
    finished_at: b.finishedAt,
    created_at: b.createdAt, updated_at: b.updatedAt, deleted_at: b.deletedAt, version: b.version,
  };
}

interface DbCoffeeRecipeRow {
  id: string;
  user_id: string;
  name: string;
  coffee_type: string;
  ratio: number;
  temp_celsius: number;
  grind_size: string;
  water_mode: string;
  steps: string;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

function fromDbCoffeeRecipe(r: DbCoffeeRecipeRow): CoffeeRecipe {
  type RawStep = Partial<CoffeeRecipeStep> & { waterGrams?: number };
  const rawSteps = parseJson<RawStep[]>(r.steps, []);
  const steps: CoffeeRecipeStep[] = rawSteps.map((s) => ({
    type: s.type ?? ((s.waterGrams ?? 0) > 0 ? "pour" : "action"),
    timeSeconds: s.timeSeconds ?? 0,
    description: s.description ?? "",
    waterMode: s.waterMode,
    waterRatio: s.waterRatio,
    autoComplete: s.autoComplete,
    flowTarget: s.flowTarget,
    waterGrams: s.waterGrams,
  }));
  return {
    id: r.id,
    name: r.name,
    coffeeType: r.coffee_type,
    ratio: r.ratio,
    tempCelsius: r.temp_celsius,
    grindSize: r.grind_size,
    steps,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}

function coffeeRecipeToWire(r: CoffeeRecipe, userId: string) {
  return {
    id: r.id, user_id: userId, name: r.name, coffee_type: r.coffeeType, ratio: r.ratio,
    temp_celsius: r.tempCelsius, grind_size: r.grindSize, steps: r.steps, notes: r.notes,
    created_at: r.createdAt, updated_at: r.updatedAt, deleted_at: r.deletedAt, version: r.version,
  };
}

function fromDbAutomation(r: DbAutomationRow): Automation {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    kind: r.kind,
    config: parseJson<Record<string, unknown>>(r.config, {}),
    trigger: r.trigger,
    schedule: r.schedule,
    enabled: boolFromDb(r.enabled),
    notes: r.notes,
    lastRunAt: r.last_run_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    version: r.version,
  };
}
