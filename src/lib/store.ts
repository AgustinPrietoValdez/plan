import { create } from "zustand";
import type { Task } from "../types";
import { todayYmd, weekStartOf } from "./date";

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
// "ingredientes" se fusiono adentro de "listas" (columna derecha), "recetas"
// se fusiono adentro de "plan" (columna derecha), e "inventario" se fusiono
// adentro de "listas" (mitad inferior de la columna izquierda) — no quedan
// como tabs propios.
export type ComprasTab = "listas" | "plan" | "ajustes";

export const COMPRAS_TABS: { id: ComprasTab; label: string; icon: string; ready: boolean }[] = [
  { id: "listas", label: "Listas", icon: "🧾", ready: true },
  { id: "plan", label: "Plan semanal", icon: "🍽️", ready: true },
  { id: "ajustes", label: "Ajustes", icon: "⚙️", ready: true },
];

/** Sub-tabs shown inside the Cafe area. */
export type CafeTab = "inventario" | "historial" | "recetas";

export const CAFE_TABS: { id: CafeTab; label: string; icon: string }[] = [
  { id: "inventario", label: "Inventario", icon: "📦" },
  { id: "historial", label: "Historial", icon: "🕓" },
  { id: "recetas", label: "Recetas", icon: "📖" },
];

/** Sub-tabs shown inside the Finanzas (ex-Presupuesto) area. */
// "inversiones" se fusiono adentro de "holdings" (columna derecha, con su
// propio piechart de portfolio) — no queda como tab propio.
export type FinanzasTab = "presupuesto" | "ahorros" | "holdings";

export const FINANZAS_TABS: { id: FinanzasTab; label: string; icon: string }[] = [
  { id: "presupuesto", label: "Presupuesto", icon: "📊" },
  { id: "ahorros", label: "Ahorros", icon: "🎯" },
  { id: "holdings", label: "Holdings", icon: "🏦" },
];

/** Tab activo de la bottom nav de la app mobile (Android). Vive en el store
 *  porque el FAB de la shell puede empujar navegación (README: "Global
 *  (Zustand): tab activo"). El tipo canónico está en
 *  `src/components/mobile/shell.ts`; acá se repite para no meter una
 *  dependencia de `lib/` hacia `components/`. */
export type MobileTabId = "plan" | "fin" | "compras" | "cafe";

/** Pantalla dentro del tab Café. El flujo tiene CINCO pasos después de la
 *  bodega y se recorre en este orden (decisión del usuario, 2026-08-16):
 *
 *    bodega (1g) → elegir grano+receta+dosis (1i) → tweak (último ajuste)
 *      → conexion (balanza + pava) → brew (1h) → finish (cierre + cata)
 *
 *  · `conexion` es un paso PROPIO: el scan/conexión de balanza y pava, que hoy
 *    vive dentro de las fases `home`/`scanning` de `BrewView`, se reubica acá
 *    (no se borra). Al conectarse la pava empieza a calentar sola y el usuario
 *    toca "Continuar".
 *  · COMPUERTA: no se entra a `brew` sin pasar por `conexion`.
 *  · `tweak` y `finish` (steppers + café usado que descuenta stock + notas +
 *    cata) se MANTIENEN tal cual; se rediseñan aparte más adelante.
 *
 *  El FAB del tab Café manda a "elegir". El BORRADOR del brew (grano + receta
 *  + dosis) NO va acá: vive en `CafeMobileView`. */
export type CafeScreen = "bodega" | "elegir" | "tweak" | "conexion" | "brew" | "finish";

/** Destino puntual con el que se puede ABRIR (o traer al frente) la app mobile,
 *  pedido desde afuera de React — hoy el widget de Android de "próximo evento":
 *  tocarlo abre ese evento, y si no hay evento abre el tab Plan.
 *
 *  `tab` es a dónde va la shell. `openEventId` es el destino DENTRO del tab, y
 *  lo resuelve la pantalla destino (1c), no la shell. */
export interface MobileRoute {
  tab: MobileTabId;
  /** Evento a abrir dentro del tab. Lo consume la pantalla destino. */
  openEventId?: string;
}

/** Una ruta ya pedida, con el sello que le pone el store.
 *  `token` es un contador monotónico: identifica CADA pedido aunque el puente
 *  nativo reuse el mismo objeto `MobileRoute` (comparar por referencia hacía
 *  que el segundo tap idéntico se ignorara en silencio).
 *  `requestedAt` es para el TTL. */
export type PendingMobileRoute = MobileRoute & {
  token: number;
  requestedAt: number;
};

/** Una ruta es la respuesta a UN toque del usuario en el widget: se drena y se
 *  aplica en milisegundos. Si sobrevive más que esto es que nadie la consumió
 *  (p.ej. `openEventId` con la pantalla destino todavía sin implementar) y hay
 *  que tirarla: la WebView de Android vive días, y una ruta parqueada de ayer
 *  abriría un evento viejo de golpe cuando la pantalla destino por fin monte. */
export const MOBILE_ROUTE_TTL_MS = 60_000;

let mobileRouteSeq = 0;

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
  merchantManagerOpen: boolean;
  budgetManagerOpen: boolean;
  expenseEditor: { mode: "closed" } | { mode: "edit"; expenseId: string } | { mode: "create"; prefill: Partial<{ amount: number; categoryId: string | null; spentOn: string; note: string; accountId: string | null; goalId: string | null }> };
  eventEditor: { mode: "closed" } | { mode: "edit"; eventId: string } | { mode: "create"; prefill: { day?: string } };
  /** Presupuesto se navega SIEMPRE por mes. Que un presupuesto sea semanal es
   *  una propiedad de la categoría (su tope se multiplica por las semanas del
   *  mes), no un modo de navegación. */
  budgetMonth: string;
  filterCategoryId: string | null;
  sidebarOpen: boolean;
  comprasTab: ComprasTab;
  comprasWeek: string; // lunes de la semana que se ve en Listas (YYYY-MM-DD)
  cafeTab: CafeTab;
  finanzasTab: FinanzasTab;
  /** Solo mobile. */
  mobileTab: MobileTabId;
  /** Solo mobile: pantalla dentro del tab Café. */
  cafeScreen: CafeScreen;
  /** Solo mobile: ruta pedida desde afuera (widget de Android / deep link) que
   *  todavía no se aplicó del todo. `null` = nada pendiente. */
  pendingMobileRoute: PendingMobileRoute | null;

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
  openMerchantManager: () => void;
  closeMerchantManager: () => void;
  openBudgetManager: () => void;
  closeBudgetManager: () => void;
  openExpenseEdit: (expenseId: string) => void;
  openExpenseCreate: (prefill?: { amount?: number; categoryId?: string | null; spentOn?: string; note?: string; accountId?: string | null; goalId?: string | null }) => void;
  closeExpenseEditor: () => void;
  openEventEdit: (eventId: string) => void;
  openEventCreate: (prefill?: { day?: string }) => void;
  closeEventEditor: () => void;
  setBudgetMonth: (yyyymm: string) => void;
  setFilterCategory: (id: string | null) => void;
  toggleSidebar: () => void;
  setComprasTab: (t: ComprasTab) => void;
  setComprasWeek: (weekStart: string) => void;
  setCafeTab: (t: CafeTab) => void;
  setFinanzasTab: (t: FinanzasTab) => void;
  setMobileTab: (t: MobileTabId) => void;
  setCafeScreen: (s: CafeScreen) => void;
  /** PUNTO DE ENTRADA ÚNICO para abrir la app mobile en un destino puntual.
   *
   *  Lo llama código que NO es React (lector del intent de Android, deep link,
   *  bridge nativo) con:
   *      useApp.getState().requestMobileRoute({ tab: "plan", openEventId })
   *  y también sirve estando la app ya abierta: Android la trae al frente sin
   *  remontar, así que el arranque NO puede ser el único camino.
   *
   *  Hoy el único emisor es el lector del intent del widget
   *  (`useAndroidWidgetRoute` en `lib/useEventNotifications.ts`), que retira la
   *  ruta de nativo con `take_pending_mobile_route` al montar y en cada
   *  `visibilitychange`/`focus`. Es UN solo camino: no hay prop de arranque.
   *
   *  Qué pasa después:
   *   1. `MobileApp` la aplica UNA sola vez por `token` (no por identidad de
   *      objeto: el puente nativo puede reusar el mismo objeto y el segundo tap
   *      se perdía). Mueve `mobileTab` a `route.tab` y nada más.
   *   2. Si la ruta NO trae `openEventId`, la shell la consume ahí mismo.
   *      Si SÍ lo trae, queda PARQUEADA: la pantalla destino (1c) la lee y
   *      llama `consumeMobileRoute()` cuando abrió el evento.
   *   3. Si nadie la consume en `MOBILE_ROUTE_TTL_MS`, la shell la tira
   *      (`expireMobileRoute`). Nunca queda una ruta de ayer esperando. */
  requestMobileRoute: (route: MobileRoute) => void;
  /** La pantalla destino avisa que ya resolvió la ruta parqueada. */
  consumeMobileRoute: () => void;
  /** La shell tira las rutas parqueadas que se pasaron de `MOBILE_ROUTE_TTL_MS`.
   *  `token` evita que se descarte una ruta MÁS NUEVA que llegó mientras tanto. */
  expireMobileRoute: (token: number) => void;
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
  merchantManagerOpen: false,
  budgetManagerOpen: false,
  expenseEditor: { mode: "closed" },
  eventEditor: { mode: "closed" },
  budgetMonth: todayYmd().slice(0, 7),
  filterCategoryId: null,
  sidebarOpen: false,
  comprasTab: "listas",
  comprasWeek: weekStartOf(),
  cafeTab: "inventario",
  finanzasTab: "presupuesto",
  mobileTab: "plan",
  cafeScreen: "bodega",
  pendingMobileRoute: null,

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
  openMerchantManager: () => set({ merchantManagerOpen: true }),
  closeMerchantManager: () => set({ merchantManagerOpen: false }),
  openBudgetManager: () => set({ budgetManagerOpen: true }),
  closeBudgetManager: () => set({ budgetManagerOpen: false }),
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
  setComprasWeek: (comprasWeek) => set({ comprasWeek }),
  setCafeTab: (cafeTab) => set({ cafeTab }),
  setFinanzasTab: (finanzasTab) => set({ finanzasTab }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  setCafeScreen: (cafeScreen) => set({ cafeScreen }),
  requestMobileRoute: (route) =>
    set({ pendingMobileRoute: { ...route, token: ++mobileRouteSeq, requestedAt: Date.now() } }),
  consumeMobileRoute: () => set({ pendingMobileRoute: null }),
  expireMobileRoute: (token) =>
    set((s) => (s.pendingMobileRoute?.token === token ? { pendingMobileRoute: null } : s)),
}));
