import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  formatRule,
  isExpectedDay,
  nextOccurrence,
  previousOccurrence,
  type RecurrenceRule,
} from "./recurrence";

// Zona con DST para que los cruces de cambio de hora sean reales y deterministas.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = "Europe/Copenhagen"; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

const daily = (interval = 1): RecurrenceRule => ({ kind: "daily", interval });
const weekly = (weekdays: number[], interval = 1): RecurrenceRule => ({ kind: "weekly", interval, weekdays });
const monthly = (dayOfMonth: number, interval = 1): RecurrenceRule => ({ kind: "monthly", interval, dayOfMonth });

// Referencia: 2026-09-28 es lunes.

describe("nextOccurrence — daily", () => {
  it("suma el intervalo", () => {
    expect(nextOccurrence(daily(), "2026-09-28")).toBe("2026-09-29");
    expect(nextOccurrence(daily(3), "2026-09-28")).toBe("2026-10-01");
  });

  it("intervalo 0 o negativo se trata como 1", () => {
    expect(nextOccurrence(daily(0), "2026-09-28")).toBe("2026-09-29");
    expect(nextOccurrence(daily(-5), "2026-09-28")).toBe("2026-09-29");
  });

  it("cruza fin de año, bisiesto y DST", () => {
    expect(nextOccurrence(daily(), "2026-12-31")).toBe("2027-01-01");
    expect(nextOccurrence(daily(), "2028-02-28")).toBe("2028-02-29");
    expect(nextOccurrence(daily(), "2026-03-28")).toBe("2026-03-29");
    expect(nextOccurrence(daily(), "2026-10-25")).toBe("2026-10-26");
  });
});

describe("nextOccurrence — weekly", () => {
  it("siguiente día marcado, estrictamente después", () => {
    expect(nextOccurrence(weekly([1, 3, 5]), "2026-09-28")).toBe("2026-09-30");
    expect(nextOccurrence(weekly([1, 3, 5]), "2026-10-02")).toBe("2026-10-05");
    expect(nextOccurrence(weekly([1]), "2026-09-28")).toBe("2026-10-05");
  });

  it("weekdays desordenados funcionan igual", () => {
    expect(nextOccurrence(weekly([5, 1]), "2026-09-28")).toBe("2026-10-02");
  });

  it("desde un día no marcado", () => {
    expect(nextOccurrence(weekly([0]), "2026-09-30")).toBe("2026-10-04");
  });

  it("sin weekdays => null (regla malformada)", () => {
    expect(nextOccurrence(weekly([]), "2026-09-28")).toBeNull();
  });

  it("cada 2 semanas, un solo día", () => {
    expect(nextOccurrence(weekly([1], 2), "2026-09-28")).toBe("2026-10-12");
  });

  it("cruza el cambio de hora", () => {
    expect(nextOccurrence(weekly([0]), "2026-10-24")).toBe("2026-10-25");
    expect(nextOccurrence(weekly([0]), "2026-03-28")).toBe("2026-03-29");
  });

  // BUG sospechado (recurrence.ts:224-229): `weekIndex` dice contar semanas
  // desde 1970-01-04 (domingo) pero divide directamente los ms desde
  // 1970-01-01, que es JUEVES. Las "semanas" quedan jueves→miércoles, así que
  // con interval > 1 y varios días, el lunes y el viernes de la MISMA semana
  // (dom→sáb, como documenta 0=Sun..6=Sat) caen en semanas distintas.
  it.fails("cada 2 semanas lun+vie: desde el lunes sigue el viernes de esa semana", () => {
    expect(nextOccurrence(weekly([1, 5], 2), "2026-09-28")).toBe("2026-10-02");
  });

  it.fails("cada 2 semanas lun+vie: desde el viernes salta la semana siguiente", () => {
    expect(nextOccurrence(weekly([1, 5], 2), "2026-10-02")).toBe("2026-10-12");
  });
});

describe("nextOccurrence — monthly", () => {
  it("mismo día el mes siguiente", () => {
    expect(nextOccurrence(monthly(15), "2026-09-15")).toBe("2026-10-15");
  });

  it("día 31 se ajusta al último día del mes (bisiesto incluido)", () => {
    expect(nextOccurrence(monthly(31), "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(monthly(31), "2028-01-31")).toBe("2028-02-29");
    expect(nextOccurrence(monthly(31), "2026-03-31")).toBe("2026-04-30");
  });

  it("después de un mes corto vuelve al día pedido", () => {
    expect(nextOccurrence(monthly(31), "2026-02-28")).toBe("2026-03-31");
  });

  it("intervalos que cruzan de año", () => {
    expect(nextOccurrence(monthly(15, 3), "2026-11-15")).toBe("2027-02-15");
    expect(nextOccurrence(monthly(10, 12), "2026-05-10")).toBe("2027-05-10");
    expect(nextOccurrence(monthly(1), "2026-12-01")).toBe("2027-01-01");
  });

  it("dayOfMonth fuera de rango se acota a 1..31", () => {
    expect(nextOccurrence(monthly(0), "2026-09-01")).toBe("2026-10-01");
    expect(nextOccurrence(monthly(40), "2026-09-30")).toBe("2026-10-31");
  });

  it("intervalo 0 se trata como 1", () => {
    expect(nextOccurrence(monthly(5, 0), "2026-09-05")).toBe("2026-10-05");
  });

  // BUG sospechado (recurrence.ts:206-218): la rama mensual siempre salta
  // `interval` meses desde el mes de `from`, sin mirar si el día pedido todavía
  // no pasó ese mes. El contrato es "strictly AFTER from" (y así se comporta la
  // rama semanal desde un día no marcado), pero desde el 05/01 con día 20
  // devuelve 20/02 salteando el 20/01.
  it.fails("desde antes del día pedido devuelve ese mismo mes", () => {
    expect(nextOccurrence(monthly(20), "2026-01-05")).toBe("2026-01-20");
  });
});

describe("previousOccurrence", () => {
  it("daily", () => {
    expect(previousOccurrence(daily(), "2026-01-01")).toBe("2025-12-31");
    expect(previousOccurrence(daily(2), "2028-03-01")).toBe("2028-02-28");
    expect(previousOccurrence(daily(0), "2026-03-30")).toBe("2026-03-29");
  });

  it("weekly", () => {
    expect(previousOccurrence(weekly([1, 5]), "2026-10-02")).toBe("2026-09-28");
    expect(previousOccurrence(weekly([1]), "2026-09-28")).toBe("2026-09-21");
    expect(previousOccurrence(weekly([1], 2), "2026-09-28")).toBe("2026-09-14");
    expect(previousOccurrence(weekly([]), "2026-09-28")).toBeNull();
  });

  it("monthly ajusta a fin de mes y cruza año", () => {
    expect(previousOccurrence(monthly(31), "2026-03-31")).toBe("2026-02-28");
    expect(previousOccurrence(monthly(31), "2028-03-31")).toBe("2028-02-29");
    expect(previousOccurrence(monthly(15), "2026-01-15")).toBe("2025-12-15");
    expect(previousOccurrence(monthly(15, 14), "2026-01-15")).toBe("2024-11-15");
  });

  it("es la inversa de nextOccurrence sobre días de ocurrencia", () => {
    const cases: [RecurrenceRule, string][] = [
      [daily(3), "2026-10-24"],
      [weekly([2, 4]), "2026-09-29"],
      [weekly([6], 3), "2026-10-03"],
      [monthly(10, 2), "2026-12-10"],
    ];
    for (const [rule, day] of cases) {
      const next = nextOccurrence(rule, day)!;
      expect(previousOccurrence(rule, next)).toBe(day);
    }
  });
});

describe("formatRule", () => {
  it("daily", () => {
    expect(formatRule(daily())).toBe("Every day");
    expect(formatRule(daily(3))).toBe("Every 3 days");
  });

  it("weekly", () => {
    expect(formatRule(weekly([1, 3]))).toBe("Weekly on Mon, Wed");
    expect(formatRule(weekly([0, 6], 2))).toBe("Every 2 weeks on Sun, Sat");
    expect(formatRule(weekly([]))).toBe("Weekly (no days)");
  });

  it("monthly con sufijos ordinales (11-13 son 'th')", () => {
    expect(formatRule(monthly(1))).toBe("Monthly on the 1st");
    expect(formatRule(monthly(2))).toBe("Monthly on the 2nd");
    expect(formatRule(monthly(3))).toBe("Monthly on the 3rd");
    expect(formatRule(monthly(4))).toBe("Monthly on the 4th");
    expect(formatRule(monthly(11))).toBe("Monthly on the 11th");
    expect(formatRule(monthly(12))).toBe("Monthly on the 12th");
    expect(formatRule(monthly(13))).toBe("Monthly on the 13th");
    expect(formatRule(monthly(21))).toBe("Monthly on the 21st");
    expect(formatRule(monthly(22))).toBe("Monthly on the 22nd");
    expect(formatRule(monthly(31, 2))).toBe("Every 2 months on the 31st");
  });
});

describe("DEFAULT_RULES", () => {
  it("una regla por kind, con el kind correcto", () => {
    for (const kind of ["daily", "weekly", "monthly"] as const) {
      expect(DEFAULT_RULES[kind].kind).toBe(kind);
      expect(DEFAULT_RULES[kind].interval).toBe(1);
    }
    expect(nextOccurrence(DEFAULT_RULES.weekly, "2026-09-28")).toBe("2026-10-05");
  });
});

describe("isExpectedDay", () => {
  it("daily siempre", () => {
    expect(isExpectedDay(daily(5), "2026-09-28")).toBe(true);
  });

  it("weekly por día de semana, ignorando interval", () => {
    expect(isExpectedDay(weekly([1], 2), "2026-09-28")).toBe(true);
    expect(isExpectedDay(weekly([1], 2), "2026-10-05")).toBe(true);
    expect(isExpectedDay(weekly([1]), "2026-09-29")).toBe(false);
    expect(isExpectedDay(weekly([]), "2026-09-28")).toBe(false);
  });

  it("monthly: día exacto o último del mes si el mes es corto", () => {
    expect(isExpectedDay(monthly(15), "2026-09-15")).toBe(true);
    expect(isExpectedDay(monthly(15), "2026-09-16")).toBe(false);
    expect(isExpectedDay(monthly(31), "2026-02-28")).toBe(true);
    expect(isExpectedDay(monthly(31), "2028-02-28")).toBe(false);
    expect(isExpectedDay(monthly(31), "2028-02-29")).toBe(true);
    expect(isExpectedDay(monthly(31), "2026-04-30")).toBe(true);
    expect(isExpectedDay(monthly(30), "2026-03-30")).toBe(true);
    expect(isExpectedDay(monthly(30), "2026-03-31")).toBe(false);
  });
});
