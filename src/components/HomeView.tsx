import React, { type ReactNode } from "react";
import { addDays, daysBetween, DOW_LONG_ES, fromYmd, MONTH_LONG_ES, MONTH_SHORT_ES, todayYmd, ymd } from "../lib/date";
import { useFrameScale } from "../lib/uiScale";
import { useApp } from "../lib/store";
import {
  useTasks,
  useEvents,
  useExpenses,
  useExpenseCategories,
  useBudgets,
  useProjects,
  useCategories,
  useInventory,
  useRecipes,
  useRecipeIngredients,
  useIngredients,
  useCoffeeBeans,
  useFinanzasSettings,
} from "../lib/queries";
import { colorsForHue } from "../lib/categoryColor";
import { suggestRecipesForExpiringLots } from "../lib/compras";
import { CURRENCY, DEFAULT_RATES_PER_USD, convertViaUsd, fmtNumber } from "../lib/money";
import { SpendingPie } from "./SpendingPie";
import { IAlert, ICal, ICheck, ICoffee, IFork } from "./icons";
import type { CalendarEvent, Task } from "../types";

// The approved mockup is a fixed-px design authored in a 1280×720 frame that is
// meant to render at 2× on a 2560×1440 screen. `useFrameScale()` returns the single
// factor that fits that frame into the window — the SAME factor the rail and topbar
// use — so the whole Home screen stays coherent. `fluid(n)` means "n px at the
// mockup's scale": it resolves to `calc(var(--s) * n px)`, where `--s` is set to
// that factor on the Home root, cascading to every descendant.
function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

export function HomeView() {
  const { setView, budgetMonth, openCompletion } = useApp();
  const today = todayYmd();
  const todayDate = fromYmd(today);
  const weekEnd = ymd(addDays(todayDate, 6));
  const s = useFrameScale();
  const donutSize = 160 * s;

  const tasks = useTasks().data ?? [];
  const allEvents = useEvents().data ?? [];
  const expenses = useExpenses().data ?? [];
  const expenseCategories = (useExpenseCategories().data ?? []).filter((c) => !c.archived);
  const budgets = useBudgets().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const inventory = useInventory().data ?? [];
  const recipes = useRecipes().data ?? [];
  const recipeIngredients = useRecipeIngredients().data ?? [];
  const ingredients = useIngredients().data ?? [];
  // solo granos activos: los terminados (finishedAt) ya no se tienen, no van en el Home
  const coffeeBeans = (useCoffeeBeans().data ?? []).filter((b) => !b.finishedAt && !b.deletedAt);

  // Project → color dot
  const catByProjectId = new Map(
    projects.map((p) => [p.id, categories.find((c) => c.id === p.categoryId)])
  );
  function taskDotColor(projectId: string | null): string {
    if (!projectId) return "var(--fg-subtle)";
    const cat = catByProjectId.get(projectId);
    return cat ? colorsForHue(cat.hue).bg : "var(--fg-subtle)";
  }

  // ---- Tu día: tareas pendientes primero, despues las hechas (tachadas) ----
  const pendingToday = tasks.filter((t) => !t.deletedAt && !t.done && t.day === today);
  const doneToday = tasks.filter((t) => !t.deletedAt && t.done && t.day === today);
  const todayAll = [...pendingToday, ...doneToday];
  const todayProgressPct = todayAll.length > 0 ? Math.round((doneToday.length / todayAll.length) * 100) : 0;

  const todayEventsCount = allEvents.filter((e) => !e.deletedAt && e.day === today).length;
  const upcomingEvents = allEvents
    .filter((e) => !e.deletedAt && e.day >= today && e.day <= weekEnd)
    .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : (a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1);
  const eventsRangeLabel = `${todayDate.getDate()}–${addDays(todayDate, 6).getDate()} ${MONTH_SHORT_ES[addDays(todayDate, 6).getMonth()]}`;

  // ---- Presupuesto ----
  const finSettingsQ = useFinanzasSettings();
  // Expenses can be entered in any currency (EUR/ARS/USD) — convert each to nominal
  // DKK before charting, same as BudgetView, or the pie treats every amount as DKK.
  const ratesPerUsd: Record<string, number> = {
    USD: 1,
    DKK: finSettingsQ.data?.ratesPerUsd.DKK ?? DEFAULT_RATES_PER_USD.DKK,
    EUR: finSettingsQ.data?.ratesPerUsd.EUR ?? DEFAULT_RATES_PER_USD.EUR,
    ARS: finSettingsQ.data?.ratesPerUsd.ARS ?? DEFAULT_RATES_PER_USD.ARS,
  };
  const monthExpenses = expenses.filter((e) => !e.deletedAt && (e.spentOn ?? "").slice(0, 7) === budgetMonth);
  const monthExpensesForPie = monthExpenses.map((e) => ({
    ...e,
    amount: convertViaUsd(e.amount, e.currency, CURRENCY, ratesPerUsd),
    currency: CURRENCY,
  }));
  // Piechart limit excludes hidden categories' own budget cap too, so hiding one
  // actually shrinks the denominator and the remaining %s recalculate (not just the arcs).
  const chartBudgetLimit = budgets
    .filter((b) => !expenseCategories.find((c) => c.id === b.categoryId)?.hiddenFromChart)
    .reduce((s, b) => s + b.monthlyAmount, 0);
  // Same "exclude hidden categories" filter as chartBudgetLimit — otherwise a hidden
  // category's spending inflates the numerator without a matching denominator and the
  // % shown here disagrees with the donut's own center total (which filters the same way).
  const totalSpent = monthExpensesForPie
    .filter((e) => !expenseCategories.find((c) => c.id === e.categoryId)?.hiddenFromChart)
    .reduce((s, e) => s + e.amount, 0);
  const usedPct = chartBudgetLimit > 0 ? Math.round((totalSpent / chartBudgetLimit) * 100) : 0;
  const usedTone = usedPct >= 95 ? "var(--danger)" : usedPct >= 75 ? "var(--warn)" : "var(--ok)";
  const usedLabel = usedPct >= 95 ? "al límite" : usedPct >= 75 ? "cuidado" : "vas bien";
  const [by, bm] = budgetMonth.split("-").map(Number);
  const monthLabel = MONTH_LONG_ES[bm - 1].replace(/^./, (c) => c.toUpperCase());
  void by;

  // ---- Compras ----
  const expiringSoon = inventory
    .filter((l) => !l.deletedAt && l.expiresOn != null && l.expiresOn <= weekEnd)
    .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const suggestions = suggestRecipesForExpiringLots(inventory, recipes, recipeIngredients, 7).slice(0, 3);

  // ---- Café ----
  const lowStockBeans = coffeeBeans.filter((b) => b.weightGrams <= 50);

  const pendingCount = pendingToday.length;
  const greetingDay = DOW_LONG_ES[todayDate.getDay()].toLowerCase();

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: fluid(16), padding: fluid(20), overflow: "hidden", ["--s" as string]: s } as React.CSSProperties}>
      {/* Saludo + resumen + stat cards */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: fluid(16), flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: fluid(22), fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            Buen {greetingDay}, Agus
          </div>
          <div style={{ fontSize: fluid(13), color: "var(--fg-muted)", marginTop: 2 }}>
            Tenés <b style={{ color: "var(--fg)" }}>{pendingCount} {pendingCount === 1 ? "tarea" : "tareas"}</b> y{" "}
            <b style={{ color: "var(--fg)" }}>{todayEventsCount} {todayEventsCount === 1 ? "evento" : "eventos"}</b> hoy
            {" · "}{expiringSoon.length} ingredientes por vencer esta semana
          </div>
        </div>
        <div style={{ display: "flex", gap: fluid(10), flexShrink: 0 }}>
          <StatCard value={pendingCount} label="Pendientes" tone="var(--accent)" />
          <StatCard value={`${usedPct}%`} label="Presupuesto" tone="var(--violet)" />
          <StatCard value={expiringSoon.length} label="Por vencer" tone="var(--warn)" />
        </div>
      </div>

      {/* Grid principal */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: fluid(16) }}>

        {/* Columna izquierda — Tu día */}
        <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(14), padding: fluid(18), display: "flex", flexDirection: "column", gap: fluid(14), boxShadow: "var(--shadow-sm)", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: fluid(10), flexShrink: 0 }}>
            <IconBadge tone="var(--accent)"><ICal size={16} /></IconBadge>
            <div style={{ fontSize: fluid(15), fontWeight: 600, letterSpacing: "-0.01em", flex: 1 }}>Tu día</div>
            <span style={{ fontSize: fluid(12), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
              {doneToday.length} de {todayAll.length} hecho
            </span>
          </div>
          <div style={{ height: fluid(6), borderRadius: 99, background: "var(--bg-sunken)", overflow: "hidden", flexShrink: 0 }}>
            <div style={{ height: "100%", width: `${todayProgressPct}%`, background: "var(--accent)", borderRadius: 99, transition: "width .3s ease-out" }} />
          </div>

          <SectionLabel>Tareas · Hoy</SectionLabel>
          {/* Tasks take ~half the card and scroll internally past that; events get
              the other half — so a long task list never crowds out the events. */}
          <div style={{ display: "flex", flexDirection: "column", gap: fluid(8), overflowY: "auto", minHeight: 0, flex: "1 1 0" }}>
            {todayAll.length === 0 ? (
              <Empty text="Sin tareas para hoy" />
            ) : (
              todayAll.map((t) => (
                <TaskRow key={t.id} task={t} dotColor={taskDotColor(t.projectId)} onCheck={() => openCompletion(t.id)} />
              ))
            )}
          </div>

          <SectionLabel style={{ marginTop: 2 }}>Eventos · {eventsRangeLabel}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: fluid(8), overflowY: "auto", minHeight: 0, flex: "1 1 0" }}>
            {upcomingEvents.length === 0 ? (
              <Empty text="Sin eventos próximos" />
            ) : (
              upcomingEvents.map((ev, i) => <EventRow key={ev.id} event={ev} highlight={i === 0} />)
            )}
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setView("day")}
            style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: fluid(6), fontSize: fluid(12), color: "var(--accent)", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            Abrir calendario <span aria-hidden>›</span>
          </div>
        </div>

        {/* Columna derecha — Presupuesto hero + secundarias */}
        <div style={{ display: "flex", flexDirection: "column", gap: fluid(16), minHeight: 0 }}>

          {/* Presupuesto (hero) */}
          <div style={{ flex: "0 0 auto", background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(14), padding: `${fluid(16)} ${fluid(20)}`, display: "flex", flexDirection: "column", gap: fluid(12), boxShadow: "var(--shadow-sm)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: fluid(10) }}>
              <IconBadge tone="var(--violet)"><span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 14 }}>kr</span></IconBadge>
              <div style={{ fontSize: fluid(15), fontWeight: 600, letterSpacing: "-0.01em", flex: 1 }}>Presupuesto · {monthLabel}</div>
              <span style={{ fontSize: fluid(11), fontWeight: 600, color: usedTone, background: `color-mix(in oklch, ${usedTone} 14%, var(--bg))`, padding: `${fluid(3)} ${fluid(9)}`, borderRadius: 999 }}>
                {usedPct}% usado · {usedLabel}
              </span>
            </div>
            {monthExpenses.length === 0 ? (
              <Empty text="Sin gastos este mes." />
            ) : (
              <SpendingPie
                expenses={monthExpensesForPie}
                categories={expenseCategories}
                layout="row"
                fill={false}
                sizePx={donutSize}
                scale={s}
                limit={chartBudgetLimit > 0 ? chartBudgetLimit : undefined}
                budgets={budgets}
                legendVariant="bars"
                centerLabel={chartBudgetLimit > 0 ? `de ${fmtNumber(chartBudgetLimit)} kr` : undefined}
              />
            )}
          </div>

          {/* Secundarias: Por vencer + Café, lado a lado */}
          <div style={{ flex: "1 1 auto", minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: fluid(16), alignItems: "stretch" }}>

            {/* Por vencer */}
            <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(14), boxShadow: "var(--shadow-sm)", overflow: "hidden", padding: `${fluid(14)} ${fluid(16)}`, display: "flex", flexDirection: "column", gap: fluid(10), minHeight: 0 }}>
              {/* Top half slightly shorter than the bottom half → the section label sits
                  a bit above the midpoint, while still fitting 3 items above and 3 below. */}
              <div style={{ flex: 0.9, minHeight: 0, display: "flex", flexDirection: "column", gap: fluid(10) }}>
              <div style={{ display: "flex", alignItems: "center", gap: fluid(10), flexShrink: 0 }}>
                <IconBadge tone="var(--warn)" size={fluid(26)}><IAlert size={14} /></IconBadge>
                <div style={{ fontSize: fluid(13), fontWeight: 600, flex: 1 }}>Por vencer</div>
                <CountBadge tone="var(--warn)">{expiringSoon.length} lotes</CountBadge>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: fluid(8), overflow: "hidden" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: fluid(8), overflowY: "auto", minHeight: 0, flex: 1 }}>
                  {expiringSoon.length === 0 ? (
                    <Empty text="Nada por vencer pronto" />
                  ) : (
                    expiringSoon.slice(0, 3).map((l) => {
                      const daysLeft = daysBetween(todayDate, fromYmd(l.expiresOn!));
                      const label = daysLeft <= 0 ? "hoy" : daysLeft === 1 ? "mañana" : `${daysLeft} días`;
                      const tone = daysLeft <= 1 ? "var(--danger)" : "var(--warn)";
                      return (
                        <ItemRow key={l.id} dotColor={tone} name={ingredientById.get(l.ingredientId)?.name ?? "—"} meta={label} metaTone={tone} />
                      );
                    })
                  )}
                </div>
                {expiringSoon.length > 0 && <WarningBanner tone="var(--warn)" icon="⏳" text="Usalos pronto — cociná con esto" />}
              </div>
              </div>
              {/* Bottom half: starts with the section label so it sits at the card's
                  midpoint (same for Café), then the list, then the CTA pinned to the bottom. */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: fluid(10) }}>
                <SectionLabel style={{ flexShrink: 0 }}>Recetas recomendadas</SectionLabel>
                {suggestions.length === 0 ? (
                  <Empty text="Sin sugerencias por ahora" />
                ) : (
                  suggestions.map((sug) => (
                    <div key={sug.recipe.id} style={{ display: "flex", alignItems: "center", gap: fluid(9), fontSize: fluid(12.5) }}>
                      <EmojiBadge tone="oklch(0.68 0.16 60)"><IFork size={Math.round(13 * s)} /></EmojiBadge>
                      <span style={{ flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sug.recipe.name}</span>
                    </div>
                  ))
                )}
                <CtaRow tone="oklch(0.5 0.10 70)" onClick={() => setView("compras")}>Ver recetas</CtaRow>
              </div>
            </div>

            {/* Café en casa */}
            <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(14), boxShadow: "var(--shadow-sm)", overflow: "hidden", padding: `${fluid(14)} ${fluid(16)}`, display: "flex", flexDirection: "column", gap: fluid(10), minHeight: 0 }}>
              <div style={{ flex: 0.9, minHeight: 0, display: "flex", flexDirection: "column", gap: fluid(10) }}>
              <div style={{ display: "flex", alignItems: "center", gap: fluid(10), flexShrink: 0 }}>
                <IconBadge tone="oklch(0.55 0.10 50)" size={fluid(26)}><ICoffee size={Math.round(16 * s)} /></IconBadge>
                <div style={{ fontSize: fluid(13), fontWeight: 600, flex: 1 }}>Café en casa</div>
                <CountBadge tone="oklch(0.5 0.08 50)">{coffeeBeans.length} abiertos</CountBadge>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: fluid(8), overflow: "hidden" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: fluid(8), overflowY: "auto", minHeight: 0, flex: 1 }}>
                  {coffeeBeans.length === 0 ? (
                    <Empty text="Sin granos registrados" />
                  ) : (
                    coffeeBeans.slice(0, 3).map((b) => {
                      const tone = b.weightGrams <= 0 ? "var(--danger)" : b.weightGrams <= 50 ? "var(--warn)" : "oklch(0.62 0.17 145)";
                      const name = b.weightGrams <= 0 ? `${b.name} · agotado` : `${b.name}${b.roaster ? ` · ${b.roaster}` : ""}`;
                      return <ItemRow key={b.id} dotColor={tone} name={name} meta={`${b.weightGrams} g`} metaTone={b.weightGrams <= 50 ? tone : "var(--fg-muted)"} />;
                    })
                  )}
                </div>
                {lowStockBeans.length > 0 && <WarningBanner tone="var(--danger)" icon="⚠" text="Queda poco — conviene reponer" />}
              </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: fluid(10) }}>
                <SectionLabel style={{ flexShrink: 0 }}>De tu lista de deseados</SectionLabel>
                {/* TODO: wishlist de café real (a diseñar) — placeholders por ahora, ver pedido del usuario */}
                <div style={{ display: "flex", alignItems: "center", gap: fluid(9), fontSize: fluid(12.5) }}>
                  <EmojiBadge tone="oklch(0.55 0.10 50)"><ICoffee size={Math.round(13 * s)} /></EmojiBadge>
                  <span style={{ flex: 1 }}><span style={{ fontWeight: 500 }}>Colombia Huila</span> <span style={{ color: "var(--fg-subtle)" }}>· Café Rituals</span></span>
                  <span style={{ fontSize: fluid(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>kr 165</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: fluid(9), fontSize: fluid(12.5) }}>
                  <EmojiBadge tone="oklch(0.55 0.10 50)"><ICoffee size={Math.round(13 * s)} /></EmojiBadge>
                  <span style={{ flex: 1 }}><span style={{ fontWeight: 500 }}>Kenia Nyeri AA</span> <span style={{ color: "var(--fg-subtle)" }}>· La Nena</span></span>
                  <span style={{ fontSize: fluid(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>kr 190</span>
                </div>
                <CtaRow tone="oklch(0.5 0.10 50)" onClick={() => setView("cafe")}>Agregar a compras</CtaRow>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Primitives ----

function StatCard({ value, label, tone }: { value: ReactNode; label: string; tone: string }) {
  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(10), padding: `${fluid(8)} ${fluid(14)}`, textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: fluid(19), fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: tone }}>{value}</div>
      <div style={{ fontSize: fluid(10), textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-subtle)" }}>{label}</div>
    </div>
  );
}

function IconBadge({ tone, size = fluid(30), children }: { tone: string; size?: string; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: fluid(9), color: tone, background: `color-mix(in oklch, ${tone} 15%, var(--bg))`, flexShrink: 0 }}>
      {children}
    </span>
  );
}

function EmojiBadge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span style={{ width: fluid(20), height: fluid(20), borderRadius: fluid(6), background: `color-mix(in oklch, ${tone} 14%, var(--bg))`, color: tone, display: "grid", placeItems: "center", fontSize: fluid(11), flex: "0 0 auto" }}>
      {children}
    </span>
  );
}

function CountBadge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span style={{ fontSize: fluid(11), fontWeight: 600, color: tone, background: `color-mix(in oklch, ${tone} 15%, var(--bg))`, padding: `${fluid(1)} ${fluid(7)}`, borderRadius: 999, flexShrink: 0 }}>
      {children}
    </span>
  );
}

function SectionLabel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--fg-muted)", flexShrink: 0, ...style }}>
      {children}
    </div>
  );
}

function WarningBanner({ tone, icon, text }: { tone: string; icon: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: fluid(8), padding: `${fluid(8)} ${fluid(10)}`, borderRadius: fluid(9), background: `color-mix(in oklch, ${tone} 10%, var(--bg))`, border: `1px solid color-mix(in oklch, ${tone} 30%, transparent)`, flexShrink: 0 }}>
      <span style={{ fontSize: fluid(13) }}>{icon}</span>
      <span style={{ fontSize: fluid(12), color: tone, fontWeight: 600, flex: 1 }}>{text}</span>
    </div>
  );
}

function CtaRow({ tone, onClick, children }: { tone: string; onClick: () => void; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: fluid(6), fontSize: fluid(12), color: tone, fontWeight: 600, cursor: "pointer", marginTop: "auto", paddingTop: fluid(2), flexShrink: 0 }}
    >
      {children} <span aria-hidden>›</span>
    </div>
  );
}

function ItemRow({ dotColor, name, meta, metaTone }: { dotColor: string; name: string; meta: string; metaTone: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: fluid(9), fontSize: fluid(12.5) }}>
      <span style={{ width: fluid(8), height: fluid(8), borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <span style={{ flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <span style={{ fontSize: fluid(11), color: metaTone, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{meta}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: fluid(12.5), color: "var(--fg-subtle)", textAlign: "left", padding: `${fluid(6)} 0` }}>{text}</div>;
}

function TaskRow({ task, dotColor, onCheck }: { task: Task; dotColor: string; onCheck: () => void }) {
  const done = task.done;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: fluid(11), padding: `${fluid(9)} ${fluid(11)}`, border: "1px solid var(--line)", borderRadius: fluid(9), opacity: done ? 0.55 : 1, flexShrink: 0 }}>
      <button
        onClick={done ? undefined : onCheck}
        title={done ? "Completada" : "Marcar como hecha"}
        style={{
          width: fluid(16), height: fluid(16), borderRadius: fluid(5), flex: "0 0 auto", padding: 0, cursor: done ? "default" : "pointer",
          border: done ? "1.4px solid var(--ok)" : "1.4px solid var(--line-strong)",
          background: done ? "var(--ok)" : "none",
          color: "#fff", display: "grid", placeItems: "center",
        }}
      >
        {done && <ICheck size={10} stroke={2.4} />}
      </button>
      <span style={{ width: fluid(8), height: fluid(8), borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <span style={{ fontSize: fluid(13.5), fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: done ? "line-through" : undefined, color: done ? "var(--fg-subtle)" : "var(--fg)" }}>
        {task.title}
      </span>
      {!done && (
        <span style={{ fontSize: fluid(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {task.isHabit ? "hábito" : task.duration > 0 ? `${task.duration} min` : ""}
        </span>
      )}
    </div>
  );
}

function EventRow({ event, highlight }: { event: CalendarEvent; highlight?: boolean }) {
  const day = fromYmd(event.day);
  const timeStr = event.startTime
    ? event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime
    : null;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: fluid(11), padding: `${fluid(9)} ${fluid(11)}`, borderRadius: fluid(9), flexShrink: 0,
        border: `1px solid ${highlight ? "color-mix(in oklch, var(--accent) 25%, var(--line))" : "var(--line)"}`,
        background: highlight ? "var(--accent-soft)" : undefined,
      }}
    >
      <div style={{ textAlign: "center", flex: "0 0 auto" }}>
        <div style={{ fontSize: fluid(15), fontWeight: 700, color: "var(--accent)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{day.getDate()}</div>
        <div style={{ fontSize: fluid(9), textTransform: "uppercase", color: "var(--accent)", opacity: 0.8 }}>{MONTH_SHORT_ES[day.getMonth()]}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ fontSize: fluid(13.5), fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
        <div style={{ fontSize: fluid(11.5), color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {timeStr}{timeStr && event.location ? " · " : ""}{event.location}
        </div>
      </div>
    </div>
  );
}
