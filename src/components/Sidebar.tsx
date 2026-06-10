import { useEffect, useState } from "react";
import { colorsForCategory } from "../lib/categoryColor";
import { signOut, useSession } from "../lib/auth";
import { onSyncStatus, type SyncStatus } from "../lib/sync";
import { todayYmd } from "../lib/date";
import { useApp } from "../lib/store";
import { useCategories, useProjects, useTasks } from "../lib/queries";
import { IChevD, ICal, ICheck, ICircle, IHabit, IInbox, IList, IPlus, IRecurring, ISearch } from "./icons";
import { MiniMonth } from "./MiniMonth";

const SIDEBAR_CATEGORIES_LIMIT = 5;

export function Sidebar() {
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const tasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

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

  const today = todayYmd();
  const inboxCount = tasks.filter((t) => t.day === null && !t.done).length;
  const todayCount = tasks.filter((t) => t.day === today && !t.done).length;
  const upcomingCount = tasks.filter(
    (t) => t.day !== null && t.day > today && !t.done,
  ).length;
  const doneCount = tasks.filter((t) => t.done).length;
  const recurringCount = tasks.filter((t) => t.recurrence !== null && !t.done).length;
  const habitCount = new Set(
    tasks
      .filter((t) => t.isHabit && !t.deletedAt)
      .map((t) => t.recurrenceParentId ?? t.id),
  ).size;

  const noFilter = !filterCategoryId && view !== "project";

  const visibleCategories = categories
    .filter((c) => !c.archived)
    .slice(0, SIDEBAR_CATEGORIES_LIMIT);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark">P</div>
          <span>Plan</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" title="Settings">
          <IChevD size={14} />
        </button>
      </div>

      <div className="sidebar-search">
        <ISearch size={13} />
        <input placeholder="Search…" />
        <span className="kbd">⌘K</span>
      </div>

      <div className="sidebar-section" style={{ paddingTop: 8 }}>
        <div className="nav-list">
          <div
            className={`nav-item ${view === "home" ? "active" : ""}`}
            onClick={() => setView("home")}
            title="Home"
          >
            <span style={{ width: 14, textAlign: "center", fontSize: 13, lineHeight: 1 }}>🏠</span> Home
          </div>
          <div
            className={`nav-item ${noFilter ? "active" : ""}`}
            onClick={() => {
              setFilterCategory(null);
              if (view === "project") setView("month");
            }}
          >
            <IInbox size={14} /> Inbox <span className="count">{inboxCount}</span>
          </div>
          <div
            className="nav-item"
            onClick={() => {
              setSelectedDay(today);
              setViewDate(today);
              setView("day");
            }}
          >
            <ICircle size={14} /> Today <span className="count">{todayCount}</span>
          </div>
          <div className="nav-item" onClick={() => setView("week")}>
            <ICal size={14} /> Upcoming <span className="count">{upcomingCount}</span>
          </div>
          <div className="nav-item">
            <ICheck size={14} /> Completed <span className="count">{doneCount}</span>
          </div>
          <div
            className={`nav-item ${view === "recurring" ? "active" : ""}`}
            onClick={() => setView("recurring")}
          >
            <IRecurring size={14} /> Recurring <span className="count">{recurringCount}</span>
          </div>
          <div
            className={`nav-item ${view === "habits" ? "active" : ""}`}
            onClick={() => setView("habits")}
            title="Habits"
          >
            <IHabit size={14} /> Habits <span className="count">{habitCount}</span>
          </div>
          <div
            className={`nav-item ${view === "budget" ? "active" : ""}`}
            onClick={() => setView("budget")}
            title="Budget"
          >
            <span style={{ width: 14, textAlign: "center", fontWeight: 700, fontSize: 13, lineHeight: 1, fontFamily: "var(--font-mono)" }}>kr</span>
            Budget
          </div>
          <div
            className={`nav-item ${view === "compras" ? "active" : ""}`}
            onClick={() => setView("compras")}
            title="Compras"
          >
            <IList size={14} /> Compras
          </div>
          <div
            className={`nav-item ${view === "cafe" ? "active" : ""}`}
            onClick={() => setView("cafe")}
            title="Cafe"
          >
            <span style={{ width: 14, textAlign: "center", fontSize: 13, lineHeight: 1 }}>☕</span> Café
          </div>
        </div>
      </div>

      <MiniMonth
        viewDate={viewDate}
        setViewDate={setViewDate}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
        tasks={tasks}
      />

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          Projects
          <button className="add" title="Manage projects" onClick={openProjectManager}>
            <IPlus size={11} />
          </button>
        </div>
      </div>
      <div className="nav-list">
        {projects.filter((p) => !p.archived).map((p) => {
          const cat = categories.find((c) => c.id === p.categoryId);
          const colors = cat ? colorsForCategory(cat) : null;
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
              <span
                className="dot"
                style={{ background: colors?.bg ?? "var(--bg-sunken)" }}
              />
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
        {visibleCategories.map((c) => {
          const colors = colorsForCategory(c);
          const n = tasks.filter((t) => t.categoryId === c.id && !t.done).length;
          return (
            <div
              key={c.id}
              className={`nav-item ${filterCategoryId === c.id ? "active" : ""}`}
              onClick={() => {
                setFilterCategory(filterCategoryId === c.id ? null : c.id);
                if (view === "project") setView("month");
              }}
            >
              <span className="dot" style={{ background: colors.bg }} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="count">{n}</span>
            </div>
          );
        })}
        {categories.length > SIDEBAR_CATEGORIES_LIMIT && (
          <div
            className="nav-item"
            style={{ color: "var(--fg-subtle)", fontSize: 11.5 }}
            onClick={openCategoryManager}
          >
            <span style={{ width: 8, flex: "0 0 auto" }} />
            <span style={{ flex: 1 }}>+ {categories.length - SIDEBAR_CATEGORIES_LIMIT} more</span>
          </div>
        )}
      </div>
      <div style={{ flex: 1 }} />
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
