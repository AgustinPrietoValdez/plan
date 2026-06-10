import React, { type ReactNode, useRef, useEffect, useState } from "react";
import { todayYmd, fromYmd, ymd, addDays } from "../lib/date";
import { useApp } from "../lib/store";
import {
  useTasks,
  useEvents,
  useExpenses,
  useExpenseCategories,
  useBudgets,
  useProjects,
  useCategories,
  useShoppingItems,
  useInventory,
  useRecipes,
  useRecipeIngredients,
  useIngredients,
} from "../lib/queries";
import { colorsForHue } from "../lib/categoryColor";
import { suggestRecipesForExpiringLots } from "../lib/compras";
import { SpendingPie } from "./SpendingPie";
import { ICal, ICart } from "./icons";
import type { CalendarEvent, Task } from "../types";

export function HomeView() {
  const { setView, budgetMonth, openEventCreate } = useApp();
  const today = todayYmd();
  const soon = ymd(addDays(fromYmd(today), 3));

  const tasks = useTasks().data ?? [];
  const allEvents = useEvents().data ?? [];
  const expenses = useExpenses().data ?? [];
  const expenseCategories = (useExpenseCategories().data ?? []).filter((c) => !c.archived);
  const budgets = useBudgets().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const shopping = useShoppingItems().data ?? [];
  const inventory = useInventory().data ?? [];
  const recipes = useRecipes().data ?? [];
  const recipeIngredients = useRecipeIngredients().data ?? [];
  const ingredients = useIngredients().data ?? [];

  // Project → color dot
  const catByProjectId = new Map(
    projects.map((p) => [p.id, categories.find((c) => c.id === p.categoryId)])
  );
  function taskDotColor(projectId: string | null): string {
    if (!projectId) return "var(--fg-subtle)";
    const cat = catByProjectId.get(projectId);
    return cat ? colorsForHue(cat.hue).bg : "var(--fg-subtle)";
  }

  // ---- Calendario: mide cuántas filas caben ----
  const calBodyRef = useRef<HTMLDivElement>(null);
  const [calSlots, setCalSlots] = useState(5);

  useEffect(() => {
    const el = calBodyRef.current;
    if (!el) return;
    const measure = () => {
      const totalH = el.clientHeight;
      const vw = window.innerWidth;
      // Font size del clamp(11px, 0.85vw, 15px) en px reales
      const fs = Math.min(15, Math.max(11, vw * 0.85 / 100));
      // Altura fija: línea divisora (1px) + dos gaps del card body (10px c/u) = 21px
      const divH = 21;
      // Altura del GroupLabel: fontSize + paddingBottom(4)
      const labelH = fs + 4;
      // Altura disponible por grupo (mitad del total menos overhead)
      const perGroup = (totalH - divH) / 2 - labelH;
      // Mínima altura cómoda por fila = 2× el font-size
      const minRowH = fs * 2;
      setCalSlots(Math.max(1, Math.floor(perGroup / minRowH)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const todayTasks = tasks.filter((t) => !t.deletedAt && !t.done && t.day === today);

  const in7 = ymd(addDays(fromYmd(today), 7));
  const upcomingEvents = allEvents
    .filter((e) => !e.deletedAt && e.day >= today && e.day <= in7)
    .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : (a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1);

  // ---- Presupuesto ----
  const monthExpenses = expenses.filter((e) => !e.deletedAt && (e.spentOn ?? "").slice(0, 7) === budgetMonth);
  const totalBudget = budgets.reduce((s, b) => s + b.monthlyAmount, 0);

  // ---- Compras ----
  const pending = shopping.filter((i) => !i.deletedAt && !i.bought);
  const expiringSoon = inventory
    .filter((l) => !l.deletedAt && l.expiresOn != null && l.expiresOn <= soon)
    .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const suggestions = suggestRecipesForExpiringLots(inventory, recipes, recipeIngredients, 5).slice(0, 3);

  return (
    <div className="day-view-main" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header style={{ paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-subtle)", fontWeight: 600 }}>
          Home
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Hoy
        </div>
      </header>

      <div
        style={{
          paddingTop: 14,
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 16,
        }}
      >
        {/* Calendario */}
        <Card title="Calendario" tone="var(--accent)" icon={<ICal size={16} />} onVer={() => setView("day")}>
          <div ref={calBodyRef} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
            {/* Hoy */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <GroupLabel>Hoy · {todayTasks.length}</GroupLabel>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {todayTasks.length === 0 ? (
                  <TaskRow dotColor="var(--fg-subtle)" muted>Sin tareas para hoy</TaskRow>
                ) : (
                  todayTasks.slice(0, calSlots).map((t) => (
                    <TaskRow key={t.id} dotColor={taskDotColor(t.projectId)} task={t}>
                      {t.title}
                    </TaskRow>
                  ))
                )}
              </div>
            </div>

            <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />

            {/* Próximos eventos */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <GroupLabel style={{ flex: 1 }}>Eventos · {upcomingEvents.length}</GroupLabel>
                <button
                  className="icon-btn"
                  style={{ width: 18, height: 18, marginBottom: 4 }}
                  onClick={() => openEventCreate({ day: today })}
                  title="Nuevo evento"
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                </button>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {upcomingEvents.length === 0 ? (
                  <TaskRow dotColor="var(--accent)" muted>Sin eventos próximos</TaskRow>
                ) : (
                  upcomingEvents.slice(0, calSlots).map((ev) => (
                    <EventRow key={ev.id} event={ev} />
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Presupuesto */}
        <Card title="Presupuesto" tone="oklch(0.62 0.17 305)" icon={<span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 13 }}>kr</span>} onVer={() => setView("budget")}>
          {monthExpenses.length === 0 ? (
            <Empty text="Sin gastos este mes." />
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
              <SpendingPie
                expenses={monthExpenses}
                categories={expenseCategories}
                layout="row"
                size={160}
                limit={totalBudget > 0 ? totalBudget : undefined}
              />
            </div>
          )}
        </Card>

        {/* Compras */}
        <Card title="Compras" tone="var(--ok)" icon={<ICart size={16} />} onVer={() => setView("compras")}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <GroupLabel>Por vencer · {expiringSoon.length}</GroupLabel>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              {expiringSoon.length === 0 ? (
                <TaskRow dotColor="var(--ok)" muted>Nada por vencer pronto</TaskRow>
              ) : (
                expiringSoon.slice(0, 5).map((l) => (
                  <TaskRow key={l.id} dotColor="var(--ok)" muted>
                    <span style={{ opacity: 0.65 }}>{l.expiresOn?.slice(5)}</span>
                    {" · "}
                    {ingredientById.get(l.ingredientId)?.name ?? "—"}
                  </TaskRow>
                ))
              )}
            </div>
          </div>

          {suggestions.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
              <div style={{ flexShrink: 0 }}>
                <GroupLabel>Te conviene cocinar</GroupLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 4 }}>
                  {suggestions.map((s) => (
                    <Chip key={s.recipe.id} tone="oklch(0.68 0.16 60)">{s.recipe.name}</Chip>
                  ))}
                </div>
              </div>
            </>
          )}

          <Sub>{pending.length} en la lista de compras</Sub>
        </Card>

        {/* Café */}
        <Card title="Café" tone="oklch(0.55 0.10 50)" icon={<span style={{ fontSize: 16 }}>☕</span>} onVer={() => setView("cafe")}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Empty text="Módulo de café: próximamente (Fase 6)." />
            <Sub>Va a mostrar tus cafés en rango (3 a 6 semanas) y cuál toca pedir.</Sub>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---- Card shell ----

function Card({
  title, icon, tone, onVer, children,
}: {
  title: string; icon: ReactNode; tone: string; onVer?: () => void; children: ReactNode;
}) {
  return (
    <div
      role={onVer ? "button" : undefined}
      tabIndex={onVer ? 0 : undefined}
      onClick={onVer}
      onKeyDown={onVer ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVer(); } } : undefined}
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: "clamp(14px, 1.4vw, 28px)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
        cursor: onVer ? "pointer" : "default",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: tone, borderRadius: "12px 0 0 12px" }} />
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, color: tone, background: `color-mix(in oklch, ${tone} 18%, var(--bg))` }}>
          {icon}
        </span>
        <div style={{ fontSize: "clamp(12px, 0.95vw, 16px)", textTransform: "uppercase", letterSpacing: ".06em", color: tone, fontWeight: 700, flex: 1 }}>
          {title}
        </div>
        {onVer && (
          <span aria-hidden style={{ border: `1px solid color-mix(in oklch, ${tone} 40%, transparent)`, background: `color-mix(in oklch, ${tone} 12%, transparent)`, color: tone, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999 }}>
            Ver →
          </span>
        )}
      </div>
      {/* Body */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ---- Primitives ----

function GroupLabel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: "clamp(11px, 0.85vw, 15px)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--fg-muted)", flexShrink: 0, paddingBottom: 4, ...style }}>
      {children}
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const timeStr = event.startTime
    ? event.endTime
      ? `${event.startTime}–${event.endTime}`
      : event.startTime
    : event.day.slice(5);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "clamp(5px, 0.5vw, 10px)",
      flex: 1, minHeight: 16, overflow: "hidden",
    }}>
      <span style={{ width: "clamp(7px, 0.6vw, 11px)", height: "clamp(7px, 0.6vw, 11px)", borderRadius: 3, background: "var(--accent)", flexShrink: 0 }} />
      <span style={{
        fontSize: "clamp(11px, 0.85vw, 15px)", color: "var(--fg-muted)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
      }}>
        <span style={{ color: "var(--accent)", opacity: 0.85, marginRight: 4 }}>{timeStr}</span>
        {event.title}
      </span>
    </div>
  );
}

function TaskRow({
  children, dotColor, muted, task,
}: {
  children: ReactNode; dotColor: string; muted?: boolean; task?: Task;
}) {
  void task;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "clamp(5px, 0.5vw, 10px)",
      flex: 1,
      minHeight: 16,
      overflow: "hidden",
    }}>
      <span style={{ width: "clamp(7px, 0.6vw, 11px)", height: "clamp(7px, 0.6vw, 11px)", borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <span style={{
        fontSize: "clamp(11px, 0.85vw, 15px)",
        color: muted ? "var(--fg-subtle)" : "var(--fg-muted)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: 1,
      }}>
        {children}
      </span>
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: tone, background: `color-mix(in oklch, ${tone} 14%, var(--bg))`, border: `1px solid color-mix(in oklch, ${tone} 45%, transparent)`, padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, flex: "none" }} />
      {children}
    </span>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: "clamp(11px, 0.8vw, 14px)", color: "var(--fg-subtle)", flexShrink: 0 }}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: "clamp(13px, 1.0vw, 16px)", color: "var(--fg-subtle)", textAlign: "center" }}>{text}</div>;
}
