import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BrewAssignModal } from "./components/BrewAssignModal";
import { BudgetManager } from "./components/BudgetManager";
import { BudgetView } from "./components/BudgetView";
import { AhorrosView } from "./components/finanzas/AhorrosView";
import { HoldingsView } from "./components/finanzas/HoldingsView";
import { CategoryManager } from "./components/CategoryManager";
import { CompletionModal } from "./components/CompletionModal";
import { ComprasView } from "./components/ComprasView";
import { CafeView } from "./components/CafeView";
import { AutomationsView } from "./components/AutomationsView";
import { HomeView } from "./components/HomeView";
import { AreaTabs } from "./components/AreaTabs";
import { DayView } from "./components/DayView";
import { ExpenseCategoryManager } from "./components/ExpenseCategoryManager";
import { EventEditor } from "./components/EventEditor";
import { ExpenseEditor } from "./components/ExpenseEditor";
import { HabitsView } from "./components/HabitsView";
import { MonthView } from "./components/MonthView";
import { ProjectManager } from "./components/ProjectManager";
import { ProjectView } from "./components/ProjectView";
import { RecurringView } from "./components/RecurringView";
import { Sidebar } from "./components/Sidebar";
import { TaskEditor } from "./components/TaskEditor";
import { TaskStrip } from "./components/TaskStrip";
import { Topbar } from "./components/Topbar";
import { IChevD } from "./components/icons";
import { WeekView } from "./components/WeekView";
import { DragGhost } from "./components/dnd/DragGhost";
import { useSession } from "./lib/auth";
import { useFrameScale } from "./lib/uiScale";
import { fromYmd, todayYmd, ymd } from "./lib/date";
import { useApp, AREA_OF_VIEW, CALENDARIO_TABS, type View } from "./lib/store";
import { useCategories, useDeleteTask, useHabitLogs, usePatchTask, useProjects, useTasks } from "./lib/queries";
import type { CalendarEvent } from "./types";
import { useRealtimeSync } from "./lib/realtime";
import { useRollForwardRecurringTasks } from "./lib/rollForward";
import { useSeedDefaultCategories } from "./lib/seedCategories";
import { useSeedDefaultExpenseCategories } from "./lib/seedExpenseCategories";
import { useReconcileAccountBalances } from "./lib/reconcileBalances";
import { useExternalChangesPoller } from "./lib/externalChanges";
import { useSyncEngine } from "./lib/sync";
import { useEventNotifications } from "./lib/useEventNotifications";
import type { Task } from "./types";

function App() {
  const {
    view,
    setView,
    viewDate,
    setViewDate,
    setSelectedDay,
    editor,
    openEdit,
    openCreate,
    closeEditor,
    completingTaskId,
    openCompletion,
    closeCompletion,
    categoryManagerOpen,
    closeCategoryManager,
    projectManagerOpen,
    closeProjectManager,
    expenseCategoryManagerOpen,
    closeExpenseCategoryManager,
    budgetManagerOpen,
    closeBudgetManager,
    expenseEditor,
    closeExpenseEditor,
    eventEditor,
    closeEventEditor,
    openEventEdit,
    openEventCreate,
    finanzasTab,
  } = useApp();

  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  useHabitLogs();
  const tasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const patchTask = usePatchTask();
  const deleteTaskMutation = useDeleteTask();
  const { session } = useSession();
  useSyncEngine(session?.user.id);
  useExternalChangesPoller(session?.user.id);
  useRealtimeSync(session?.user.id);
  useEventNotifications();
  useSeedDefaultCategories(session?.user.id);
  useSeedDefaultExpenseCategories(session?.user.id);
  useReconcileAccountBalances(session?.user.id);
  useRollForwardRecurringTasks(
    tasksQ.data,
    Boolean(session?.user.id) && tasksQ.isSuccess,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Home and Café are the two screens rebuilt to the 1280×720 design frame; scale
  // their chrome (rail + topbar) together with their content so they stay coherent
  // at 2K. Other views keep --home-s at 1 (their fixed-px chrome is unchanged).
  const frameScale = useFrameScale();
  const homeScale = view === "home" || view === "cafe" ? frameScale : 1;

  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // The Inbox strip is only relevant in task-centric views; collapse it
  // elsewhere (budget, compras, recurring, habits) so it doesn't get in the way.
  const isTaskView = view === "day" || view === "week" || view === "month" || view === "project";
  const [stripOpen, setStripOpen] = useState(isTaskView);
  useEffect(() => {
    setStripOpen(isTaskView);
  }, [isTaskView]);
  const inboxCount = tasks.filter((t) => t.day === null && !t.done).length;

  const onAddNew = () => openCreate({});
  const onAddNewWithPrefill = (prefill: Partial<Task>) => openCreate(prefill);
  const onOpenTask = (t: Task) => openEdit(t.id);
  const onOpenEvent = (ev: CalendarEvent) => openEventEdit(ev.id);
  const onNewEvent = (day: string) => openEventCreate({ day });

  const onToggleDone = (t: Task) => {
    if (t.done) {
      // Completing a recurring/habit task freezes its recurrence to null and
      // moves the rule onto a freshly-created successor instance. Un-completing
      // can only safely restore that rule if no successor has been acted on
      // yet — copy the rule back from the successor and remove it, rather than
      // leaving two rows both able to advance the same chain.
      const rootId = t.recurrenceParentId ?? t.id;
      const successor = tasks.find(
        (x) => x.id !== t.id && (x.recurrenceParentId ?? x.id) === rootId && x.recurrence !== null,
      );
      if (successor && !successor.done) {
        patchTask.mutate({
          id: t.id,
          patch: {
            done: false,
            actualDuration: null,
            completedAt: null,
            recurrence: successor.recurrence,
            recurring: true,
          },
        });
        deleteTaskMutation.mutate(successor.id);
      } else {
        // No untouched successor to restore the rule from (either none was
        // ever created, or it was already completed/rolled forward itself) —
        // just uncheck; it stays a plain one-off, same as today.
        patchTask.mutate({
          id: t.id,
          patch: { done: false, actualDuration: null, completedAt: null },
        });
      }
    } else {
      openCompletion(t.id);
    }
  };

  const onMonthDayClick = (day: string) => {
    setViewDate(day);
    setSelectedDay(day);
    openCreate({ day });
  };

  const onDragStart = (e: DragStartEvent) => {
    const task = e.active.data.current?.task as Task | undefined;
    if (task) setActiveTask(task);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const overId = e.over?.id;
    const task = e.active.data.current?.task as Task | undefined;
    if (!task || !overId) return;

    if (overId === "inbox") {
      if (task.day !== null) patchTask.mutate({ id: task.id, patch: { day: null } });
      return;
    }

    if (typeof overId === "string" && overId.startsWith("day:")) {
      const newDay = overId.slice(4);
      if (newDay !== task.day) patchTask.mutate({ id: task.id, patch: { day: newDay } });
    }
  };

  const onDragCancel = () => setActiveTask(null);

  const editingTask: Task | undefined = useMemo(() => {
    if (editor.mode !== "edit") return undefined;
    return tasks.find((t) => t.id === editor.taskId);
  }, [editor, tasks]);

  const completingTask: Task | undefined = useMemo(
    () => (completingTaskId ? tasks.find((t) => t.id === completingTaskId) : undefined),
    [completingTaskId, tasks],
  );

  const modalOpen =
    editor.mode !== "closed" ||
    completingTaskId !== null ||
    categoryManagerOpen ||
    projectManagerOpen ||
    expenseCategoryManagerOpen ||
    budgetManagerOpen ||
    expenseEditor.mode !== "closed" ||
    eventEditor.mode !== "closed";

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openCreate({});
      } else if (e.key === "t" || e.key === "T") {
        const t = todayYmd();
        setViewDate(t);
        setSelectedDay(t);
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const n = Number(e.code.slice(5));
        if (e.shiftKey) {
          // Shift+1..4 = switch top-level area (Calendario / Presupuesto / Compras / Cafe)
          const areaView: Record<number, View> = { 1: "day", 2: "budget", 3: "compras", 4: "cafe" };
          const v = areaView[n];
          if (v) { e.preventDefault(); setView(v); }
        } else if (AREA_OF_VIEW[view] === "calendario" && CALENDARIO_TABS[n - 1]) {
          // 1..N = select a tab within the Calendario area
          e.preventDefault();
          setView(CALENDARIO_TABS[n - 1].view);
        }
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && (e.metaKey || e.ctrlKey)) {
        if (view === "home" || view === "cafe" || view === "project" || view === "recurring" || view === "budget" || view === "habits" || view === "compras" || view === "automations") return;
        const d = fromYmd(viewDate);
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        if (view === "month") d.setMonth(d.getMonth() + dir);
        else if (view === "week") d.setDate(d.getDate() + dir * 7);
        else d.setDate(d.getDate() + dir);
        setViewDate(ymd(d));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, view, viewDate, openCreate, setView, setViewDate, setSelectedDay]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="app" style={{ ["--home-s" as string]: homeScale } as CSSProperties}>
        <Sidebar />
        <div className="main">
          {view !== "home" && view !== "cafe" && <Topbar />}
          {view !== "home" && view !== "cafe" && (stripOpen ? (
            <div style={{ position: "relative" }}>
              <TaskStrip onAddNew={onAddNew} onOpen={onOpenTask} onToggleDone={onToggleDone} />
              <button
                className="icon-btn"
                title="Minimizar inbox"
                onClick={() => setStripOpen(false)}
                style={{ position: "absolute", top: 6, right: 10, zIndex: 2 }}
              >
                <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                  <IChevD size={14} />
                </span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setStripOpen(true)}
              title="Abrir inbox"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "5px 16px",
                background: "var(--bg-elev)",
                border: "none",
                borderBottom: "1px solid var(--line)",
                color: "var(--fg-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", fontSize: 11 }}>
                Inbox
              </span>
              <span className="count-pill">{inboxCount}</span>
              <span style={{ flex: 1 }} />
              <IChevD size={14} />
            </button>
          ))}
          <AreaTabs />
          {view === "home" && <HomeView />}
          {view === "month" && (
            <MonthView
              onTaskClick={onOpenTask}
              onDayClick={onMonthDayClick}
              onToggleDone={onToggleDone}
              onEventClick={onOpenEvent}
            />
          )}
          {view === "week" && (
            <WeekView
              onTaskClick={onOpenTask}
              onToggleDone={onToggleDone}
              onEventClick={onOpenEvent}
            />
          )}
          {view === "day" && (
            <DayView
              onTaskClick={onOpenTask}
              onToggleDone={onToggleDone}
              onEventClick={onOpenEvent}
              onNewEvent={onNewEvent}
            />
          )}
          {view === "project" && (
            <ProjectView
              onTaskClick={onOpenTask}
              onToggleDone={onToggleDone}
              onAddNew={onAddNewWithPrefill}
            />
          )}
          {view === "recurring" && <RecurringView />}
          {view === "budget" && finanzasTab === "presupuesto" && <BudgetView />}
          {view === "budget" && finanzasTab === "ahorros" && <AhorrosView />}
          {view === "budget" && finanzasTab === "holdings" && <HoldingsView />}
          {view === "habits" && <HabitsView />}
          {view === "compras" && <ComprasView />}
          {view === "cafe" && <CafeView />}
          {view === "automations" && <AutomationsView />}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <DragGhost task={activeTask} projects={projects} categories={categories} />
        ) : null}
      </DragOverlay>

      {editor.mode === "edit" && editingTask && (
        <TaskEditor mode="edit" task={editingTask} onClose={closeEditor} />
      )}
      {editor.mode === "create" && (
        <TaskEditor
          mode="create"
          prefill={editor.prefill}
          onClose={closeEditor}
          onSwitchToEvent={() => { closeEditor(); openEventCreate({}); }}
        />
      )}
      {completingTask && (
        <CompletionModal task={completingTask} onClose={closeCompletion} />
      )}
      {categoryManagerOpen && <CategoryManager onClose={closeCategoryManager} />}
      {projectManagerOpen && <ProjectManager onClose={closeProjectManager} />}
      {expenseCategoryManagerOpen && <ExpenseCategoryManager onClose={closeExpenseCategoryManager} />}
      {budgetManagerOpen && <BudgetManager onClose={closeBudgetManager} />}
      {expenseEditor.mode === "edit" && (
        <ExpenseEditor mode="edit" expenseId={expenseEditor.expenseId} onClose={closeExpenseEditor} />
      )}
      {expenseEditor.mode === "create" && (
        <ExpenseEditor mode="create" prefill={expenseEditor.prefill} onClose={closeExpenseEditor} />
      )}
      {eventEditor.mode === "edit" && (
        <EventEditor mode="edit" eventId={eventEditor.eventId} onClose={closeEventEditor} />
      )}
      {eventEditor.mode === "create" && (
        <EventEditor
          mode="create"
          prefill={eventEditor.prefill}
          onClose={closeEventEditor}
          onSwitchToTask={() => { closeEventEditor(); openCreate({}); }}
        />
      )}
      {!modalOpen && <BrewAssignModal />}
    </DndContext>
  );
}

export default App;
