import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../types";
import { recurrenceInstanceId } from "./recurrenceInstanceId";
import { rollForwardRecurringTasks } from "./rollForward";

// Fake mínimo en memoria del repo (el real es SQLite vía Tauri). Solo los cuatro
// métodos que usa rollForwardRecurringTasks.
const fake = vi.hoisted(() => ({
  existing: [] as unknown[],
  listTasks: vi.fn(),
  createTask: vi.fn(),
  patchTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock("./repo", () => ({ repo: fake }));

function task(p: Partial<Task>): Task {
  return {
    id: "t1", title: "Regar", projectId: "p", categoryId: "c", priority: "high", duration: 15,
    actualDuration: null, day: null, due: "2026-09-20", recurring: true, recurrence: null,
    recurrenceParentId: null, notes: "n", subtasks: [], done: false, isHabit: false,
    completedAt: null, createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  };
}

const DAILY = { kind: "daily", interval: 1 } as const;

function makeQc() {
  const invalidateQueries = vi.fn();
  return { qc: { invalidateQueries } as unknown as QueryClient, invalidateQueries };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 29, 10, 0)); // hoy = 2026-09-29 (martes)
  fake.existing = [];
  fake.listTasks.mockReset().mockImplementation(async () => fake.existing);
  fake.createTask.mockReset().mockImplementation(async (x: unknown) => x);
  fake.patchTask.mockReset().mockResolvedValue({});
  fake.deleteTask.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe("rollForwardRecurringTasks", () => {
  it("crea la próxima instancia en hoy o después y congela la vieja", () => {
    const t = task({
      day: "2026-09-26",
      recurrence: DAILY,
      subtasks: [{ id: "s", title: "s", done: true }],
    });
    const { qc, invalidateQueries } = makeQc();
    return rollForwardRecurringTasks([t], qc).then((res) => {
      expect(res).toEqual({ rolled: 1 });
      expect(fake.createTask).toHaveBeenCalledTimes(1);
      expect(fake.createTask).toHaveBeenCalledWith({
        id: recurrenceInstanceId("t1", "2026-09-29"),
        title: "Regar", projectId: "p", categoryId: "c", priority: "high", duration: 15,
        day: "2026-09-29", due: null, recurring: true, recurrence: DAILY,
        recurrenceParentId: "t1", notes: "n",
        subtasks: [{ id: "s", title: "s", done: false }],
        isHabit: false,
      });
      expect(fake.patchTask).toHaveBeenCalledWith("t1", { recurrence: null });
      expect(fake.deleteTask).not.toHaveBeenCalled();
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    });
  });

  it("no muta las subtareas originales", async () => {
    const sub = { id: "s", title: "s", done: true };
    await rollForwardRecurringTasks([task({ day: "2026-09-26", recurrence: DAILY, subtasks: [sub] })], makeQc().qc);
    expect(sub.done).toBe(true);
  });

  it("usa la raíz de la cadena (recurrenceParentId) para el id y el padre", async () => {
    await rollForwardRecurringTasks(
      [task({ id: "child", recurrenceParentId: "root", day: "2026-09-28", recurrence: DAILY })],
      makeQc().qc,
    );
    const arg = fake.createTask.mock.calls[0][0];
    expect(arg.id).toBe(recurrenceInstanceId("root", "2026-09-29"));
    expect(arg.recurrenceParentId).toBe("root");
    expect(fake.patchTask).toHaveBeenCalledWith("child", { recurrence: null });
  });

  it("saltea ocurrencias vencidas: semanal de lunes va al próximo lunes futuro", async () => {
    await rollForwardRecurringTasks(
      [task({ day: "2026-09-21", recurrence: { kind: "weekly", interval: 1, weekdays: [1] } })],
      makeQc().qc,
    );
    expect(fake.createTask.mock.calls[0][0].day).toBe("2026-10-05");
  });

  it("hábito: borra la instancia vieja en vez de congelarla", async () => {
    await rollForwardRecurringTasks([task({ day: "2026-09-27", recurrence: DAILY, isHabit: true })], makeQc().qc);
    expect(fake.createTask.mock.calls[0][0].isHabit).toBe(true);
    expect(fake.deleteTask).toHaveBeenCalledWith("t1");
    expect(fake.patchTask).not.toHaveBeenCalled();
  });

  it("ignora sin regla, sin día, hechas, de hoy, futuras y reglas malformadas", async () => {
    const { qc, invalidateQueries } = makeQc();
    const res = await rollForwardRecurringTasks(
      [
        task({ day: "2026-09-20" }),
        task({ day: null, recurrence: DAILY }),
        task({ day: "2026-09-20", recurrence: DAILY, done: true }),
        task({ day: "2026-09-29", recurrence: DAILY }),
        task({ day: "2026-10-10", recurrence: DAILY }),
        task({ day: "2026-09-20", recurrence: { kind: "weekly", interval: 1, weekdays: [] } }),
      ],
      qc,
    );
    expect(res.rolled).toBe(0);
    expect(fake.createTask).not.toHaveBeenCalled();
    expect(fake.patchTask).not.toHaveBeenCalled();
    expect(fake.deleteTask).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("idempotente: si ya existe la instancia (por id estable) no la duplica, pero congela la vieja", async () => {
    fake.existing = [task({ id: recurrenceInstanceId("t1", "2026-09-29"), day: "2026-10-01", recurrenceParentId: "t1" })];
    const res = await rollForwardRecurringTasks([task({ day: "2026-09-26", recurrence: DAILY })], makeQc().qc);
    expect(fake.createTask).not.toHaveBeenCalled();
    expect(fake.patchTask).toHaveBeenCalledWith("t1", { recurrence: null });
    expect(res.rolled).toBe(1);
  });

  it("idempotente con filas viejas de id random: detecta por (cadena, día)", async () => {
    fake.existing = [task({ id: "random-uuid", day: "2026-09-29", recurrenceParentId: "t1" })];
    await rollForwardRecurringTasks([task({ day: "2026-09-26", recurrence: DAILY })], makeQc().qc);
    expect(fake.createTask).not.toHaveBeenCalled();
  });

  it("una fila del mismo día de OTRA cadena no bloquea la creación", async () => {
    fake.existing = [task({ id: "x", day: "2026-09-29", recurrenceParentId: "other" })];
    await rollForwardRecurringTasks([task({ day: "2026-09-26", recurrence: DAILY })], makeQc().qc);
    expect(fake.createTask).toHaveBeenCalledTimes(1);
  });

  it("si falla el create no congela la vieja (la regla no se pierde) y sigue con las demás", async () => {
    fake.createTask.mockRejectedValueOnce(new Error("db"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await rollForwardRecurringTasks(
      [
        task({ id: "a", day: "2026-09-26", recurrence: DAILY }),
        task({ id: "b", day: "2026-09-26", recurrence: DAILY }),
      ],
      makeQc().qc,
    );
    expect(res.rolled).toBe(1);
    expect(fake.patchTask).toHaveBeenCalledTimes(1);
    expect(fake.patchTask).toHaveBeenCalledWith("b", { recurrence: null });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // BUG sospechado (rollForward.ts:34-41): el `guard < 366` corta el avance
  // después de 367 pasos. Una tarea diaria sin abrir la app por más de un año
  // genera la "nueva" instancia TODAVÍA en el pasado (2026-05-19), contra el
  // docstring ("next occurrence on or after today"). Para tareas reales eso deja
  // un sobrante "no terminado" espurio al rodar de nuevo al día siguiente.
  it.fails("una diaria de hace 500 días rueda a hoy", async () => {
    await rollForwardRecurringTasks([task({ day: "2025-05-17", recurrence: DAILY })], makeQc().qc);
    expect(fake.createTask.mock.calls[0][0].day).toBe("2026-09-29");
  });
});
