import { useEffect, useState, type ReactNode } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { signOut, useSession } from "../lib/auth";
import { onSyncStatus, type SyncStatus } from "../lib/sync";
import { useApp } from "../lib/store";
import { AREA_OF_VIEW, AREA_DEFAULT_VIEW, type Area, type View } from "../lib/store";
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
import { useFrameScale } from "../lib/uiScale";

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

/** The 5 top-level areas, in rail order. */
const AREAS: { area: Area; label: string }[] = [
  { area: "home", label: "Home" },
  { area: "calendario", label: "Calendario" },
  { area: "presupuesto", label: "Finanzas" },
  { area: "compras", label: "Compras" },
  { area: "cafe", label: "Café" },
];

/** Rail icon for an area, sized via `px` so it scales with the frame on Home. */
function railIconFor(area: Area, px: (n: number) => number): ReactNode {
  switch (area) {
    case "home":
      return <span style={{ fontSize: px(16) }}>🏠</span>;
    case "calendario":
      return <ICal size={px(17)} />;
    case "presupuesto":
      return <span style={{ ...krIcon, fontSize: px(14), width: "auto" }}>kr</span>;
    case "compras":
      return <IList size={px(17)} />;
    case "cafe":
      return <span style={{ fontSize: px(16) }}>☕</span>;
    default:
      return null;
  }
}

export function Sidebar() {
  const { view, setView } = useApp();
  // Automations lives in the "home" area but is reached from the rail's bolt icon,
  // and highlights neither Home nor anything else.
  const activeArea: Area | null = view === "automations" ? null : AREA_OF_VIEW[view];

  return (
    <>
      <Rail activeArea={activeArea} view={view} setView={setView} />
      {activeArea !== "home" && <SidePanel activeArea={activeArea} />}
    </>
  );
}

// ---- Rail: 64px icon-only nav, always visible (every screen) ----

function Rail({ activeArea, view, setView }: { activeArea: Area | null; view: View; setView: (v: View) => void }) {
  const frameScale = useFrameScale();
  const s = view === "home" ? frameScale : 1;
  const px = (n: number) => Math.round(n * s);
  return (
    <aside className="rail">
      <div className="rail-logo">P</div>
      <button className="rail-btn" title="Buscar" style={{ marginTop: px(2) }}>
        <ISearch size={px(16)} />
      </button>
      <div className="rail-sep" />
      {AREAS.map((a) => (
        <button
          key={a.area}
          className={`rail-btn ${activeArea === a.area ? "active" : ""}`}
          title={a.label}
          onClick={() => setView(AREA_DEFAULT_VIEW[a.area])}
        >
          {railIconFor(a.area, px)}
        </button>
      ))}
      <div className="rail-spacer" />
      <button
        className={`rail-btn ${view === "automations" ? "active" : ""}`}
        title="Automatizaciones"
        onClick={() => setView("automations")}
      >
        <IBolt size={px(16)} />
      </button>
      <RailAvatar scale={s} />
    </aside>
  );
}

function RailAvatar({ scale = 1 }: { scale?: number }) {
  const px = (n: number) => Math.round(n * scale);
  const [open, setOpen] = useState(false);
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

  const dotColor =
    syncStatus === "idle" ? "var(--ok)" : syncStatus === "syncing" ? "var(--accent)" : syncStatus === "offline" ? "var(--fg-subtle)" : "var(--danger)";
  const statusLabel =
    syncStatus === "idle" ? "Synced" : syncStatus === "syncing" ? "Syncing…" : syncStatus === "offline" ? "Offline — changes saved locally" : "Sync error";

  return (
    <div className="rail-avatar-wrap">
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />}
      <button
        className="rail-btn"
        title={email || "Guest"}
        onClick={() => setOpen((o) => !o)}
        style={{ width: px(28), height: px(28), borderRadius: "50%", background: "var(--c-peach)", color: "var(--c-peach-fg)", fontWeight: 600, fontSize: px(11), border: "none", position: "relative" }}
      >
        {initials || "?"}
        <span
          title={statusLabel}
          style={{
            position: "absolute", right: -1, bottom: -1, width: px(9), height: px(9), borderRadius: "50%",
            background: dotColor, border: "2px solid var(--bg-sunken)",
            animation: syncStatus === "syncing" ? "pulse-dot 1.2s ease-in-out infinite" : undefined,
          }}
        />
      </button>
      {open && (
        <div className="rail-popover">
          <span style={{ fontSize: 12, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={email}>
            {email || "Guest"}
          </span>
          <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{statusLabel}</span>
          <button className="kbd" onClick={() => void signOut()} style={{ cursor: "pointer", alignSelf: "flex-start" }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Side panel: contextual lists (Projects/Categories/etc.), hidden on Home ----

function SidePanel({ activeArea }: { activeArea: Area | null }) {
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
  } = useApp();

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <MiniMonth
          viewDate={viewDate}
          setViewDate={setViewDate}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          tasks={tasks}
        />

        {activeArea === "calendario" && (
          <>
            <div className="sidebar-section" style={{ paddingTop: 8 }}>
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
            <div className="sidebar-section" style={{ paddingTop: 8 }}>
              <div className="sidebar-section-title">Categorías de gasto</div>
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
            <div className="sidebar-section" style={{ paddingTop: 8 }}>
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
            <div className="sidebar-section" style={{ paddingTop: 8 }}>
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
    </aside>
  );
}
