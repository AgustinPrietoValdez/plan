import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FRESHNESS_COLOR, FRESHNESS_LABEL, daysOld, freshnessStatus } from "./coffeeFreshness";

describe("freshnessStatus", () => {
  const roasted = "2026-01-01";
  const plus = (n: number) => {
    const d = new Date(2026, 0, 1 + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  it("sin fecha de tostado => unknown", () => {
    expect(freshnessStatus(null, "2026-01-10")).toBe("unknown");
  });

  it("tostado en el futuro => unknown", () => {
    expect(freshnessStatus("2026-02-01", "2026-01-31")).toBe("unknown");
  });

  it("bordes de cada rango", () => {
    expect(freshnessStatus(roasted, plus(0))).toBe("too-fresh");
    expect(freshnessStatus(roasted, plus(20))).toBe("too-fresh");
    expect(freshnessStatus(roasted, plus(21))).toBe("in-range");
    expect(freshnessStatus(roasted, plus(42))).toBe("in-range");
    expect(freshnessStatus(roasted, plus(43))).toBe("limit");
    expect(freshnessStatus(roasted, plus(49))).toBe("limit");
    expect(freshnessStatus(roasted, plus(50))).toBe("stale");
  });

  it("cruza cambio de anio", () => {
    expect(freshnessStatus("2025-12-20", "2026-01-15")).toBe("in-range");
  });

  describe("asOf por default = hoy", () => {
    afterEach(() => vi.useRealTimers());
    it("usa la fecha actual", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 29, 10, 0, 0));
      expect(daysOld("2026-09-01")).toBe(28);
      expect(freshnessStatus("2026-09-01")).toBe("in-range");
    });
  });
});

describe("daysOld", () => {
  it("null sin fecha", () => {
    expect(daysOld(null, "2026-01-01")).toBeNull();
  });
  it("dias calendario", () => {
    expect(daysOld("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysOld("2026-01-01", "2026-02-01")).toBe(31);
  });
  it("negativo si el tostado es futuro", () => {
    expect(daysOld("2026-01-05", "2026-01-01")).toBe(-4);
  });
});

// El usuario vive en Dinamarca (Europe/Copenhagen, con horario de verano).
// `fromYmd` crea medianoches LOCALES y la resta se divide por 86_400_000 con
// Math.floor: si entre las dos fechas hay un cambio a horario de verano, la
// diferencia es 1h menos que N dias y el floor da N-1. `date.ts` ya tiene
// `daysBetween` justamente para evitar esto.
describe("DST (Europe/Copenhagen)", () => {
  const prevTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Europe/Copenhagen";
  });
  afterAll(() => {
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  });

  it("la TZ del test efectivamente tiene DST", () => {
    // sanity: marzo (invierno, +60 min) vs abril (verano, +120 min)
    expect(new Date(2026, 2, 1).getTimezoneOffset()).not.toBe(new Date(2026, 3, 15).getTimezoneOffset());
  });

  // Sospecha de bug: coffeeFreshness.ts:12 y :24 — 2026-03-20 -> 2026-04-10
  // son 21 dias calendario pero da 20 (cruza el cambio de hora del 29/03).
  it.fails("daysOld cuenta dias calendario aunque cruce el cambio de hora", () => {
    expect(daysOld("2026-03-20", "2026-04-10")).toBe(21);
  });

  it.fails("freshnessStatus pasa a in-range el dia 21 aunque cruce DST", () => {
    expect(freshnessStatus("2026-03-20", "2026-04-10")).toBe("in-range");
  });
});

describe("labels y colores", () => {
  it("hay label y color para cada estado", () => {
    const keys = ["unknown", "too-fresh", "in-range", "limit", "stale"];
    expect(Object.keys(FRESHNESS_LABEL).sort()).toEqual([...keys].sort());
    expect(Object.keys(FRESHNESS_COLOR).sort()).toEqual([...keys].sort());
    expect(FRESHNESS_LABEL["in-range"]).toBe("en rango");
  });
});
