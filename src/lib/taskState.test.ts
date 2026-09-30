import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../types";
import { isNotFinished } from "./taskState";

function task(p: Partial<Task>): Task {
  return {
    id: "t", title: "t", projectId: null, categoryId: null, priority: "med", duration: 30,
    actualDuration: null, day: null, due: null, recurring: false, recurrence: null,
    recurrenceParentId: null, notes: "", subtasks: [], done: false, isHabit: false,
    completedAt: null, createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  };
}

describe("isNotFinished", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 10, 0)); // hoy = 2026-09-29
  });
  afterEach(() => { vi.useRealTimers(); });

  it("tarea de un día pasado sin terminar => no terminada", () => {
    expect(isNotFinished(task({ day: "2026-09-28" }))).toBe(true);
    expect(isNotFinished(task({ day: "2025-12-31" }))).toBe(true);
  });

  it("hoy y futuro no cuentan", () => {
    expect(isNotFinished(task({ day: "2026-09-29" }))).toBe(false);
    expect(isNotFinished(task({ day: "2026-10-01" }))).toBe(false);
  });

  it("hecha => false", () => {
    expect(isNotFinished(task({ day: "2026-09-01", done: true }))).toBe(false);
  });

  it("hábito nunca queda como no terminado", () => {
    expect(isNotFinished(task({ day: "2026-09-01", isHabit: true }))).toBe(false);
  });

  it("con regla activa la agarra el roll-forward, no es sobrante", () => {
    expect(
      isNotFinished(task({ day: "2026-09-01", recurrence: { kind: "daily", interval: 1 } })),
    ).toBe(false);
  });

  it("instancia recurrente congelada (sin regla, con padre) sí cuenta", () => {
    expect(
      isNotFinished(task({ day: "2026-09-01", recurring: true, recurrenceParentId: "root" })),
    ).toBe(true);
  });

  it("sin día (inbox) => false", () => {
    expect(isNotFinished(task({ day: null }))).toBe(false);
  });

  it("el límite es la medianoche local", () => {
    vi.setSystemTime(new Date(2026, 8, 30, 0, 0, 1));
    expect(isNotFinished(task({ day: "2026-09-29" }))).toBe(true);
  });
});
