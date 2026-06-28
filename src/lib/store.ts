import { create } from "zustand";
import type { Task } from "../types";
import { todayYmd } from "./date";

export type View =
  | "home"
  | "day"
  | "week"
  | "month"
  | "project"
  | "recurring"
  | "budget"
  | "habits"
  | "compras"
  | "cafe"
  | "automations";

/** The 4 top-level areas (the Home cards). "home" is the dashboard container. */
export type Area = "home" | "calendario" | "presupuesto" | "compras" | "cafe";

/** Which area a leaf view belongs to (drives the area tab bar + Shift+1..4). */
export const AREA_OF_VIEW: Record<View, Area> = {
  home: "home",
  day: "calendario",
  week: "calendario",
  month: "calendario",
  project: "calendario",
  recurring: "calendario",
  habits: "calendario",
  budget: "presupuesto",
  compras: "compras",
  cafe: "cafe",
  automations: "home",
};

/** Default leaf view when entering an area (e.g. from a Home card or Shift+N). */
export const AREA_DEFAULT_VIEW: Record<Area, View> = {
  home: "home",
  calendario: "day",
  presupuesto: "budget",
  compras: "compras",
  cafe: "cafe",
};

/** Tabs shown inside the Calendario area, in order (plain 1..N selects them). */
export const CALENDARIO_TABS: { view: View; label: string }[] = [
  { view: "day", label: "Día" },
  { view: "week", label: "Semana" },
  { view: "month", label: "Mes" },
  { view: "project", label: "Proyectos" },
  { view: "habits", label: "Hábitos" },
  { view: "recurring", label: "Recurrentes" },
];

/** Sub-tabs shown inside the Compras area. */
export type ComprasTab = "ingredientes" | "recetas" | "listas" | "plan" | "inventario" | "ajustes";

export const COMPRAS_TABS: { id: ComprasTab; label: string; ready: boolean }[] = [
  { id: "ingredientes", label: "Ingredientes", ready: true },
  { id: "recetas", label: "Recetas", ready: true },
  { id: "listas", label: "Listas", ready: true },
  { id: "plan", label: "Plan semanal", ready: true },
  { id: "inventario", label: "Inventario", ready: true },
  { id: "ajustes", label: "Ajustes", ready: true },
];

/** Sub-tabs shown inside the Cafe area. */
export type CafeTab = "granos" | "recetas" | "historial";

export const CAFE_TABS: { id: CafeTab; label: string }[] = [
  { id: "granos", label: "Granos" },
  { id: "recetas", label: "Recetas" },
  { id: "historial", label: "Historial" },
];

/** Sub-tabs shown inside the Finanzas (ex-Presupuesto) area. */
export type FinanzasTab = "presupuesto" | "holdings" | "inversiones" | "taxes";

export const FINANZAS_TABS: { id: FinanzasTab; label: string }[] = [
  { id: "presupuesto", label: "Presupuesto" },
  { id: "holdings", label: "Holdings" },
  { id: "inversiones", label: "Inversiones" },
  { id: "taxes", label: "Taxes" },
];

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
  eventEditor: { mode: "closed" } | { mode: "edit"; eventId: string } | { mode: "create"; prefill: { day?: string } };
  budgetMonth: string;
  filterCategoryId: string | null;
  sidebarOpen: boolean;
  comprasTab: ComprasTab;
  cafeTab: CafeTab;
  finanzasTab: FinanzasTab;

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
  openEventEdit: (eventId: string) => void;
  openEventCreate: (prefill?: { day?: string }) => void;
  closeEventEditor: () => void;
  setBudgetMonth: (yyyymm: string) => void;
  setFilterCategory: (id: string | null) => void;
  toggleSidebar: () => void;
  setComprasTab: (t: ComprasTab) => void;
  setCafeTab: (t: CafeTab) => void;
  setFinanzasTab: (t: FinanzasTab) => void;
}

export const useApp = create<AppState>((set) => ({
  view: "home",
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
  eventEditor: { mode: "closed" },
  budgetMonth: todayYmd().slice(0, 7),
  filterCategoryId: null,
  sidebarOpen: false,
  comprasTab: "listas",
  cafeTab: "granos",
  finanzasTab: "presupuesto",

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
  openEventEdit: (eventId) => set({ eventEditor: { mode: "edit", eventId } }),
  openEventCreate: (prefill = {}) => set({ eventEditor: { mode: "create", prefill } }),
  closeEventEditor: () => set({ eventEditor: { mode: "closed" } }),
  setBudgetMonth: (budgetMonth) => set({ budgetMonth }),
  setFilterCategory: (filterCategoryId) => set({ filterCategoryId }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setComprasTab: (comprasTab) => set({ comprasTab }),
  setCafeTab: (cafeTab) => set({ cafeTab }),
  setFinanzasTab: (finanzasTab) => set({ finanzasTab }),
}));
