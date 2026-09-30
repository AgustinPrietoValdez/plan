import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addDays,
  daysBetween,
  fmtHomeSubtitle,
  fromYmd,
  getMonthGrid,
  getWeekNumber,
  monthOfWeek,
  sameDay,
  shiftMonth,
  shiftWeek,
  startOfMonth,
  startOfWeek,
  todayYmd,
  weekLabel,
  weekStartOf,
  weekStartShortLabel,
  weekStartsInMonth,
  weeksInMonth,
  ymd,
} from "./date";

// Zona con DST (la del usuario) para que los casos de cambio de hora sean reales
// y deterministas en cualquier máquina.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = "Europe/Copenhagen"; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe("ymd / fromYmd", () => {
  it("formatea con ceros a la izquierda", () => {
    expect(ymd(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("ida y vuelta es identidad (incluye 29/02 bisiesto)", () => {
    for (const s of ["2026-01-01", "2026-12-31", "2028-02-29", "2026-03-29", "2026-10-25"]) {
      expect(ymd(fromYmd(s))).toBe(s);
    }
  });

  it("fromYmd da medianoche local", () => {
    const d = fromYmd("2026-03-29");
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });
});

describe("addDays", () => {
  it("cruza fin de mes y de año", () => {
    expect(ymd(addDays(fromYmd("2026-01-31"), 1))).toBe("2026-02-01");
    expect(ymd(addDays(fromYmd("2026-12-31"), 1))).toBe("2027-01-01");
    expect(ymd(addDays(fromYmd("2026-03-01"), -1))).toBe("2026-02-28");
    expect(ymd(addDays(fromYmd("2028-03-01"), -1))).toBe("2028-02-29");
  });

  it("no muta el original", () => {
    const d = fromYmd("2026-05-10");
    addDays(d, 3);
    expect(ymd(d)).toBe("2026-05-10");
  });

  it("atraviesa el cambio de hora sin perder un día", () => {
    expect(ymd(addDays(fromYmd("2026-03-28"), 2))).toBe("2026-03-30");
    expect(ymd(addDays(fromYmd("2026-10-24"), 2))).toBe("2026-10-26");
  });
});

describe("daysBetween", () => {
  it("cuenta días calendario, con signo", () => {
    expect(daysBetween(fromYmd("2026-01-01"), fromYmd("2026-01-31"))).toBe(30);
    expect(daysBetween(fromYmd("2026-01-31"), fromYmd("2026-01-01"))).toBe(-30);
    expect(daysBetween(fromYmd("2026-01-01"), fromYmd("2026-01-01"))).toBe(0);
  });

  it("año bisiesto", () => {
    expect(daysBetween(fromYmd("2028-02-28"), fromYmd("2028-03-01"))).toBe(2);
    expect(daysBetween(fromYmd("2028-01-01"), fromYmd("2029-01-01"))).toBe(366);
  });

  it("DST-safe: el cambio de hora no altera la cuenta", () => {
    expect(daysBetween(fromYmd("2026-03-28"), fromYmd("2026-03-30"))).toBe(2);
    expect(daysBetween(fromYmd("2026-10-24"), fromYmd("2026-10-26"))).toBe(2);
  });

  it("ignora la hora del día", () => {
    expect(daysBetween(new Date(2026, 4, 1, 23, 59), new Date(2026, 4, 2, 0, 1))).toBe(1);
  });
});

describe("sameDay / startOfMonth / startOfWeek", () => {
  it("sameDay ignora la hora", () => {
    expect(sameDay(new Date(2026, 4, 1, 1), new Date(2026, 4, 1, 23))).toBe(true);
    expect(sameDay(new Date(2026, 4, 1), new Date(2026, 4, 2))).toBe(false);
    expect(sameDay(new Date(2026, 4, 1), new Date(2027, 4, 1))).toBe(false);
  });

  it("startOfMonth", () => {
    expect(ymd(startOfMonth(new Date(2026, 1, 28, 15)))).toBe("2026-02-01");
  });

  it("startOfWeek es domingo a medianoche", () => {
    const s = startOfWeek(new Date(2026, 8, 30, 18, 30)); // miércoles
    expect(ymd(s)).toBe("2026-09-27");
    expect(s.getDay()).toBe(0);
    expect(s.getHours()).toBe(0);
    // domingo -> sí mismo
    expect(ymd(startOfWeek(fromYmd("2026-09-27")))).toBe("2026-09-27");
    // cruza mes
    expect(ymd(startOfWeek(fromYmd("2026-10-01")))).toBe("2026-09-27");
  });
});

describe("getMonthGrid", () => {
  it("42 días consecutivos empezando en domingo y conteniendo el mes", () => {
    const grid = getMonthGrid(new Date(2026, 8, 15));
    expect(grid).toHaveLength(42);
    expect(ymd(grid[0])).toBe("2026-08-30");
    expect(grid[0].getDay()).toBe(0);
    expect(ymd(grid[41])).toBe("2026-10-10");
    for (let i = 1; i < grid.length; i++) expect(daysBetween(grid[i - 1], grid[i])).toBe(1);
  });

  it("mes que empieza en domingo arranca en el 1", () => {
    expect(ymd(getMonthGrid(new Date(2026, 1, 10))[0])).toBe("2026-02-01");
  });
});

describe("todayYmd", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("usa la fecha local", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 23, 59));
    expect(todayYmd()).toBe("2026-09-29");
  });
});

describe("shiftMonth", () => {
  it("avanza y retrocede cruzando años", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-05", 0)).toBe("2026-05");
  });

  it("deltas de más de un año", () => {
    expect(shiftMonth("2026-03", 25)).toBe("2028-04");
    expect(shiftMonth("2026-03", -27)).toBe("2023-12");
  });
});

describe("weekStartOf (semana sábado → viernes)", () => {
  it("sábado es su propio inicio", () => {
    expect(weekStartOf("2026-09-26")).toBe("2026-09-26");
  });

  it("domingo y viernes vuelven al sábado anterior", () => {
    expect(weekStartOf("2026-09-27")).toBe("2026-09-26");
    expect(weekStartOf("2026-10-02")).toBe("2026-09-26");
  });

  it("cruza año", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-26");
  });

  it("sin argumento usa hoy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    expect(weekStartOf()).toBe("2026-09-26");
    vi.useRealTimers();
  });
});

describe("shiftWeek", () => {
  it("mueve de a 7 días, también sobre el cambio de hora", () => {
    expect(shiftWeek("2026-09-26", 1)).toBe("2026-10-03");
    expect(shiftWeek("2026-09-26", -1)).toBe("2026-09-19");
    expect(shiftWeek("2026-10-24", 1)).toBe("2026-10-31");
    expect(shiftWeek("2026-03-28", 1)).toBe("2026-04-04");
    expect(shiftWeek("2026-12-26", 1)).toBe("2027-01-02");
  });
});

describe("weekLabel / weekStartShortLabel", () => {
  it("rango dd/mm – dd/mm", () => {
    expect(weekLabel("2026-09-26")).toBe("26/09 – 02/10");
  });

  it("semana que termina el 1ro no imprime '00'", () => {
    expect(weekLabel("2026-04-25")).toBe("25/04 – 01/05");
  });

  it("etiqueta corta en español", () => {
    expect(weekStartShortLabel("2026-08-15")).toBe("15 ago");
    expect(weekStartShortLabel("2026-01-03")).toBe("3 ene");
  });
});

describe("monthOfWeek / weekStartsInMonth / weeksInMonth", () => {
  it("la semana pertenece al mes con la mayoría de sus días", () => {
    // Sáb 31/10 -> 6 días en noviembre
    expect(monthOfWeek("2026-10-31")).toBe("2026-11");
    // Sáb 29/08 -> 6 días en septiembre
    expect(monthOfWeek("2026-08-29")).toBe("2026-09");
    // Sáb 26/09 -> 5 días en septiembre, 2 en octubre
    expect(monthOfWeek("2026-09-26")).toBe("2026-09");
    // Sáb 27/12/2025 -> 4 días en 2025
    expect(monthOfWeek("2025-12-27")).toBe("2025-12");
  });

  it("lista los sábados del mes (incluye semana que arranca en el mes anterior)", () => {
    expect(weekStartsInMonth("2026-09")).toEqual([
      "2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26",
    ]);
    expect(weekStartsInMonth("2026-11")[0]).toBe("2026-10-31");
    expect(weekStartsInMonth("2026-10")).toEqual([
      "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24",
    ]);
  });

  it("4 o 5 semanas (una por cada martes del mes)", () => {
    expect(weeksInMonth("2026-09")).toBe(5);
    expect(weeksInMonth("2026-10")).toBe(4);
    expect(weeksInMonth("2026-02")).toBe(4);
  });

  it("las semanas de un año se reparten sin huecos ni duplicados", () => {
    for (const [year, expected] of [[2026, 52], [2030, 53], [2028, 52]] as const) {
      const all: string[] = [];
      for (let m = 1; m <= 12; m++) all.push(...weekStartsInMonth(`${year}-${String(m).padStart(2, "0")}`));
      expect(all).toHaveLength(expected);
      expect(new Set(all).size).toBe(all.length);
      for (let i = 1; i < all.length; i++) expect(shiftWeek(all[i - 1], 1)).toBe(all[i]);
    }
  });
});

describe("getWeekNumber / fmtHomeSubtitle", () => {
  it("1ro de enero es semana 1 y la semana cambia en domingo", () => {
    expect(getWeekNumber(fromYmd("2026-01-01"))).toBe(1); // jueves
    expect(getWeekNumber(fromYmd("2026-01-03"))).toBe(1); // sábado
    expect(getWeekNumber(fromYmd("2026-01-04"))).toBe(2); // domingo
  });

  it("dentro del horario de verano no se corre", () => {
    expect(getWeekNumber(fromYmd("2026-07-18"))).toBe(29); // sábado
    expect(getWeekNumber(fromYmd("2026-07-19"))).toBe(30); // domingo
  });

  it("subtítulo del Home (ejemplo del comentario)", () => {
    expect(fmtHomeSubtitle(fromYmd("2025-07-19"))).toBe("Sábado, 19 de julio · Semana 29");
  });

  // BUG sospechado (date.ts:154-158): `diff` se calcula con getTime(), así que
  // incluye el corrimiento de DST. En zonas donde el 1ro de enero cae en horario
  // de verano (hemisferio sur, p.ej. America/Santiago), después de que termina el
  // DST `diff` es N + 1/24 en vez de N y, en los sábados (donde el cociente es
  // entero exacto), Math.ceil salta a la semana siguiente.
  // Sáb 2026-05-02: el viernes y el sábado deberían dar la misma semana (18).
  it.fails("en zona con DST en enero (hemisferio sur) el sábado no salta de semana", () => {
    process.env.TZ = "America/Santiago";
    try {
      expect(getWeekNumber(fromYmd("2026-05-01"))).toBe(18);
      expect(getWeekNumber(fromYmd("2026-05-02"))).toBe(18);
    } finally {
      process.env.TZ = "Europe/Copenhagen";
    }
  });
});
