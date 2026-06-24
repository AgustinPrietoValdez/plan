import { useEffect, useState, type ReactNode } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { signOut, useSession } from "../lib/auth";
import { onSyncStatus, type SyncStatus } from "../lib/sync";
import { useApp } from "../lib/store";
import { AREA_OF_VIEW, AREA_DEFAULT_VIEW, type Area } from "../lib/store";
import {
  useCategories,
  useProjects,
  useTasks,
  useExpenseCategories,
  useIngredientCategories,
  useCoffeeRecipes,
} from "../lib/queries";
import { IBolt, ICal, IList, IPlus, ISearch } from "./icons";
import { MiniMonth } from "./MiniMonth";

const SIDEBAR_CATEGORIES_LIMIT = 5;

const emojiIcon = { width: 14, textAlign: "center", fontSize: 13, lineHeight: 1 } as const;
const krIcon = {
  width: 14,
  textAlign: "center",
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1,
  fontFamily: "var(--font-mono)",
} as const;

/** The 5 top-level areas, in sidebar order. */
const AREAS: { area: Area; label: string; icon: ReactNode }[] = [
  { area: "home", label: "Home", icon: <span style={emojiIcon}>🏠</span> },
  { area: "calendario", label: "Calendario", icon: <ICal size={14} /> },
  { area: "presupuesto", label: "Presupuesto", icon: <span style={krIcon}>kr</span> },
  { area: "compras", label: "Compras", icon: <IList size={14} /> },
  { area: "cafe", label: "Café", icon: <span style={emojiIcon}>☕</span> },
];

export function Sidebar() {
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const expenseCategoriesQ = useExpenseCategories();
  const ingredientCategoriesQ = useIngredientCategories();
  const coffeeRecipesQ = useCoffeeRecipes();
  const tasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const expenseCategories = expenseCategoriesQ.data ?? [];
  const ingredientCategories = ingredientCategoriesQ.data ?? [];
  const coffeeRecipes = coffeeRecipesQ.data ?? [];

  const {
    view,
    viewDate,
    selectedDay,
    viewProjectId,
    setViewDate,
    setSelectedDay,
    setView,
    setViewProject,
    filterCategoryId,
    setFilterCategory,
    openCategoryManager,
    openProjectManager,
    openExpenseCategoryManager,
  } = useApp();

  // Which area's button is highlighted. Automations lives in the "home" area but
  // is reached from the header gear, so it lights up neither Home nor anything.
  const activeArea: Area | null = view === "automations" ? null : AREA_OF_VIEW[view];

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark">P</div>
          <span>Plan</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          className={`icon-btn ${view === "automations" ? "active" : ""}`}
          title="Automatizaciones"
          onClick={() => setView("automations")}
        >
          <IBolt size={14} />
        </button>
      </div>

      <div className="sidebar-search">
        <ISearch size={13} />
        <input placeholder="Search…" />
        <span className="kbd">⌘K</span>
      </div>

      <div className="sidebar-scroll">
      <div className="sidebar-section" style={{ paddingTop: 8 }}>
        <div className="nav-list">
          {AREAS.map((a) => (
            <div
              key={a.area}
              className={`nav-item ${activeArea === a.area ? "active" : ""}`}
              onClick={() => setView(AREA_DEFAULT_VIEW[a.area])}
              title={a.label}
            >
              {a.icon} {a.label}
            </div>
          ))}
        </div>
      </div>

      <MiniMonth
        viewDate={viewDate}
        setViewDate={setViewDate}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
        tasks={tasks}
      />

      {/* ---- Contextual lists for the current area ---- */}

      {activeArea === "calendario" && (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              Projects
              <button className="add" title="Manage projects" onClick={openProjectManager}>
                <IPlus size={11} />
              </button>
            </div>
          </div>
          <div className="nav-list">
            {projects
              .filter((p) => !p.archived)
              .map((p) => {
                const cat = categories.find((c) => c.id === p.categoryId);
                const colors = cat ? colorsForHue(cat.hue) : null;
                const c = tasks.filter((t) => t.projectId === p.id && !t.done).length;
                const active = view === "project" && viewProjectId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`nav-item ${active ? "active" : ""}`}
                    onClick={() => {
                      setViewProject(p.id);
                      setView("project");
                      setFilterCategory(null);
                    }}
                  >
                    <span className="dot" style={{ background: colors?.bg ?? "var(--bg-sunken)" }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    <span className="count">{c}</span>
                  </div>
                );
              })}
          </div>

          <div className="sidebar-section" style={{ marginTop: 4 }}>
            <div className="sidebar-section-title">
              Categories
              <button className="add" title="Manage categories" onClick={openCategoryManager}>
                <IPlus size={11} />
              </button>
            </div>
          </div>
          <div className="nav-list" style={{ paddingBottom: 12 }}>
            {categories
              .filter((c) => !c.archived)
              .slice(0, SIDEBAR_CATEGORIES_LIMIT)
              .map((c) => {
                const colors = colorsForHue(c.hue);
                const n = tasks.filter((t) => t.categoryId === c.id && !t.done).length;
                return (
                  <div
                    key={c.id}
                    className={`nav-item ${filterCategoryId === c.id ? "active" : ""}`}
                    onClick={() => setFilterCategory(filterCategoryId === c.id ? null : c.id)}
                  >
                    <span className="dot" style={{ background: colors.bg }} />
                    <span style={{ flex: 1 }}>{c.name}</span>
                    <span className="count">{n}</span>
                  </div>
                );
              })}
            {categories.filter((c) => !c.archived).length > SIDEBAR_CATEGORIES_LIMIT && (
              <div
                className="nav-item"
                style={{ color: "var(--fg-subtle)", fontSize: 11.5 }}
                onClick={openCategoryManager}
              >
                <span style={{ width: 8, flex: "0 0 auto" }} />
                <span style={{ flex: 1 }}>
                  + {categories.filter((c) => !c.archived).length - SIDEBAR_CATEGORIES_LIMIT} more
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {activeArea === "presupuesto" && (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              Categorías de gasto
              <button className="add" title="Gestionar categorías de gasto" onClick={openExpenseCategoryManager}>
                <IPlus size={11} />
              </button>
            </div>
          </div>
          <div className="nav-list" style={{ paddingBottom: 12 }}>
            {expenseCategories
              .filter((c) => !c.archived)
              .map((c) => (
                <div key={c.id} className="nav-item" style={{ cursor: "default" }}>
                  <span className="dot" style={{ background: colorsForHue(c.hue).bg }} />
                  <span style={{ flex: 1 }}>{c.name}</span>
                </div>
              ))}
          </div>
        </>
      )}

      {activeArea === "compras" && (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Categorías</div>
          </div>
          <div className="nav-list" style={{ paddingBottom: 12 }}>
            {ingredientCategories
              .filter((c) => !c.archived)
              .map((c) => (
                <div key={c.id} className="nav-item" style={{ cursor: "default" }}>
                  <span className="dot" style={{ background: colorsForHue(c.hue).bg }} />
                  <span style={{ flex: 1 }}>{c.name}</span>
                </div>
              ))}
          </div>
        </>
      )}

      {activeArea === "cafe" && (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Recetas</div>
          </div>
          <div className="nav-list" style={{ paddingBottom: 12 }}>
            {coffeeRecipes.filter((r) => !r.baseRecipeId).map((r) => (
              <div key={r.id} className="nav-item" style={{ cursor: "default" }}>
                <span style={emojiIcon}>☕</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.name}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      </div>

      <UserFooter />
    </aside>
  );
}

function UserFooter() {
  const { session } = useSession();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  useEffect(() => onSyncStatus(setSyncStatus), []);

  const email = session?.user.email ?? "";
  const initials = email
    ? email
        .split(/[@.]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase() ?? "")
        .join("")
    : "?";

  return (
    <div
      className="sidebar-section"
      style={{ borderTop: "1px solid var(--line)", paddingTop: 10, paddingBottom: 10 }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-muted)" }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--c-peach)",
            color: "var(--c-peach-fg)",
            display: "grid",
            placeItems: "center",
            fontWeight: 600,
            fontSize: 10,
          }}
        >
          {initials || "?"}
        </div>
        <span
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={email}
        >
          {email || "Guest"}
        </span>
        <SyncDot status={syncStatus} />
        <button className="kbd" onClick={() => void signOut()} title="Sign out" style={{ cursor: "pointer" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function SyncDot({ status }: { status: SyncStatus }) {
  const color =
    status === "idle"
      ? "var(--ok)"
      : status === "syncing"
        ? "var(--accent)"
        : status === "offline"
          ? "var(--fg-subtle)"
          : "var(--danger)";
  const label =
    status === "idle"
      ? "Synced"
      : status === "syncing"
        ? "Syncing…"
        : status === "offline"
          ? "Offline — changes saved locally"
          : "Sync error";
  return (
    <span
      title={label}
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flex: "0 0 auto",
        animation: status === "syncing" ? "pulse-dot 1.2s ease-in-out infinite" : undefined,
      }}
    />
  );
}
