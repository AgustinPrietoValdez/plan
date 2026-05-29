import { create } from "zustand";
import type { Task } from "../types";
import { todayYmd } from "./date";

export type View = "day" | "week" | "month" | "project" | "recurring" | "budget" | "habits" | "compras";

export type EditorState =
  | { mode: "closed" }
  | { mode: "edit"; taskId: string }
  | { mode: "create"; prefill: Partial<Task> };

interface AppState {
  view: View;
  viewDate: string;
  selectedDay: string;
  viewProjectId: string | null;
  draggingTaskId: string | null;
  dropTargetDay: string | null;
  editor: EditorState;
  completingTaskId: string | null;
  categoryManagerOpen: boolean;
  projectManagerOpen: boolean;
  expenseCategoryManagerOpen: boolean;
  budgetManagerOpen: boolean;
  savingsGoalManagerOpen: boolean;
  expenseEditor: { mode: "closed" } | { mode: "edit"; expenseId: string } | { mode: "create"; prefill: Partial<{ amount: number; categoryId: string | null; spentOn: string; note: string }> };
  budgetMonth: string;
  filterCategoryId: string | null;
  sidebarOpen: boolean;

  setView: (v: View) => void;
  setViewDate: (ymd: string) => void;
  setSelectedDay: (ymd: string) => void;
  setViewProject: (id: string | null) => void;
  startDrag: (taskId: string) => void;
  setDropTarget: (day: string | null) => void;
  endDrag: () => void;
  openEdit: (taskId: string) => void;
  openCreate: (prefill?: Partial<Task>) => void;
  closeEditor: () => void;
  openCompletion: (taskId: string) => void;
  closeCompletion: () => void;
  openCategoryManager: () => void;
  closeCategoryManager: () => void;
  openProjectManager: () => void;
  closeProjectManager: () => void;
  openExpenseCategoryManager: () => void;
  closeExpenseCategoryManager: () => void;
  openBudgetManager: () => void;
  closeBudgetManager: () => void;
  openSavingsGoalManager: () => void;
  closeSavingsGoalManager: () => void;
  openExpenseEdit: (expenseId: string) => void;
  openExpenseCreate: (prefill?: { amount?: number; categoryId?: string | null; spentOn?: string; note?: string }) => void;
  closeExpenseEditor: () => void;
  setBudgetMonth: (yyyymm: string) => void;
  setFilterCategory: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useApp = create<AppState>((set) => ({
  view: "month",
  viewDate: todayYmd(),
  selectedDay: todayYmd(),
  viewProjectId: null,
  draggingTaskId: null,
  dropTargetDay: null,
  editor: { mode: "closed" },
  completingTaskId: null,
  categoryManagerOpen: false,
  projectManagerOpen: false,
  expenseCategoryManagerOpen: false,
  budgetManagerOpen: false,
  savingsGoalManagerOpen: false,
  expenseEditor: { mode: "closed" },
  budgetMonth: todayYmd().slice(0, 7),
  filterCategoryId: null,
  sidebarOpen: false,

  setView: (view) => set({ view }),
  setViewDate: (viewDate) => set({ viewDate }),
  setSelectedDay: (selectedDay) => set({ selectedDay }),
  setViewProject: (viewProjectId) => set({ viewProjectId }),
  startDrag: (taskId) => set({ draggingTaskId: taskId, dropTargetDay: null }),
  setDropTarget: (dropTargetDay) => set({ dropTargetDay }),
  endDrag: () => set({ draggingTaskId: null, dropTargetDay: null }),
  openEdit: (taskId) => set({ editor: { mode: "edit", taskId } }),
  openCreate: (prefill = {}) => set({ editor: { mode: "create", prefill } }),
  closeEditor: () => set({ editor: { mode: "closed" } }),
  openCompletion: (taskId) => set({ completingTaskId: taskId }),
  closeCompletion: () => set({ completingTaskId: null }),
  openCategoryManager: () => set({ categoryManagerOpen: true }),
  closeCategoryManager: () => set({ categoryManagerOpen: false }),
  openProjectManager: () => set({ projectManagerOpen: true }),
  closeProjectManager: () => set({ projectManagerOpen: false }),
  openExpenseCategoryManager: () => set({ expenseCategoryManagerOpen: true }),
  closeExpenseCategoryManager: () => set({ expenseCategoryManagerOpen: false }),
  openBudgetManager: () => set({ budgetManagerOpen: true }),
  closeBudgetManager: () => set({ budgetManagerOpen: false }),
  openSavingsGoalManager: () => set({ savingsGoalManagerOpen: true }),
  closeSavingsGoalManager: () => set({ savingsGoalManagerOpen: false }),
  openExpenseEdit: (expenseId) => set({ expenseEditor: { mode: "edit", expenseId } }),
  openExpenseCreate: (prefill = {}) => set({ expenseEditor: { mode: "create", prefill } }),
  closeExpenseEditor: () => set({ expenseEditor: { mode: "closed" } }),
  setBudgetMonth: (budgetMonth) => set({ budgetMonth }),
  setFilterCategory: (filterCategoryId) => set({ filterCategoryId }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
