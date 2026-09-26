import { useMemo } from "react";
import { CategoryManager } from "../CategoryManager";
import { CompletionModal } from "../CompletionModal";
import { EventEditor } from "../EventEditor";
import { ExpenseCategoryManager } from "../ExpenseCategoryManager";
import { ExpenseEditor } from "../ExpenseEditor";
import { MerchantManager } from "../MerchantManager";
import { TaskEditor } from "../TaskEditor";
import { useTasks } from "../../lib/queries";
import { useApp } from "../../lib/store";

/** Host de modales de la shell mobile.
 *
 *  Sin esto, `openCompletion` / `openCreate` / `openExpenseCreate` solo setean
 *  estado en el store y NADIE los consume (en escritorio los consume
 *  `App.tsx`) ⇒ tildar una tarea o tocar el FAB de Plan/Finanzas serían no-ops.
 *
 *  Decisión del usuario (2026-08-16): CREAR tarea / evento / gasto desde el FAB
 *  va a ser con bottom-sheets MOBILE NUEVOS, que implementan los agentes de 1c
 *  y 1d dentro de sus pantallas — NO se porta el `ExpenseEditor` de escritorio
 *  para eso. Lo que queda montado acá son los modales de escritorio que el
 *  resto del flujo sigue necesitando (sobre todo `CompletionModal`, que es lo
 *  que abre `openCompletion` al tildar una tarea). Miden 460-540px con
 *  `max-width:100%`, así que entran en 412px, pero con densidad de escritorio.
 *  Cuando 1c/1d tengan sus sheets, los editores de creación se pueden sacar de
 *  acá sin tocar ninguna pantalla.
 *
 *  Los *Manager* van montados porque los editores de arriba los pueden abrir
 *  (botón "gestionar categorías" / "comercios"); si no, esos botones serían
 *  callejones sin salida.
 *
 *  OJO: NO envolver esto en el div de `--home-s` de `App.tsx`. En mobile
 *  `--home-s` vale 1 (que es el tamaño correcto para el teléfono). */
export function MobileModalHost() {
  const editor = useApp((s) => s.editor);
  const closeEditor = useApp((s) => s.closeEditor);
  const openCreate = useApp((s) => s.openCreate);
  const completingTaskId = useApp((s) => s.completingTaskId);
  const closeCompletion = useApp((s) => s.closeCompletion);
  const expenseEditor = useApp((s) => s.expenseEditor);
  const closeExpenseEditor = useApp((s) => s.closeExpenseEditor);
  const eventEditor = useApp((s) => s.eventEditor);
  const openEventCreate = useApp((s) => s.openEventCreate);
  const closeEventEditor = useApp((s) => s.closeEventEditor);
  const categoryManagerOpen = useApp((s) => s.categoryManagerOpen);
  const closeCategoryManager = useApp((s) => s.closeCategoryManager);
  const expenseCategoryManagerOpen = useApp((s) => s.expenseCategoryManagerOpen);
  const closeExpenseCategoryManager = useApp((s) => s.closeExpenseCategoryManager);
  const merchantManagerOpen = useApp((s) => s.merchantManagerOpen);
  const closeMerchantManager = useApp((s) => s.closeMerchantManager);

  const tasksQ = useTasks();
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const editingTask = useMemo(
    () => (editor.mode === "edit" ? tasks.find((t) => t.id === editor.taskId) : undefined),
    [editor, tasks],
  );
  const completingTask = useMemo(
    () => (completingTaskId ? tasks.find((t) => t.id === completingTaskId) : undefined),
    [completingTaskId, tasks],
  );

  return (
    <>
      {editor.mode === "edit" && editingTask && (
        <TaskEditor mode="edit" task={editingTask} onClose={closeEditor} />
      )}
      {editor.mode === "create" && (
        <TaskEditor
          mode="create"
          prefill={editor.prefill}
          onClose={closeEditor}
          onSwitchToEvent={() => {
            closeEditor();
            openEventCreate({});
          }}
        />
      )}
      {completingTask && <CompletionModal task={completingTask} onClose={closeCompletion} />}
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
          onSwitchToTask={() => {
            closeEventEditor();
            openCreate({});
          }}
        />
      )}
      {/* Estos se abren DESDE los editores de arriba y declaran su propio
          z-index 110 en su backdrop, así que el orden de montaje no importa
          (misma regla que `App.tsx`). */}
      {categoryManagerOpen && <CategoryManager onClose={closeCategoryManager} />}
      {expenseCategoryManagerOpen && (
        <ExpenseCategoryManager onClose={closeExpenseCategoryManager} />
      )}
      {merchantManagerOpen && <MerchantManager onClose={closeMerchantManager} />}
    </>
  );
}
