import { describe, expect, it } from "vitest";
import {
  convertViaUsd,
  CURRENCY,
  DEFAULT_RATES_PER_USD,
  fmtMoney,
  fmtMoneyIn,
  fmtNumber,
  fmtUsdFromDkk,
  parseMoney,
} from "./money";

// Intl mete espacios duros (U+00A0 / U+202F) entre numero y simbolo: normalizamos.
const norm = (s: string) => s.replace(/\s/g, " ");

const RATES: Record<string, number> = { USD: 1, DKK: 6.9, EUR: 0.92, ARS: 1000 };

describe("fmtMoney", () => {
  it("formatea en DKK con locale da-DK y 2 decimales", () => {
    expect(CURRENCY).toBe("DKK");
    expect(norm(fmtMoney(1234.5))).toBe("1.234,50 kr.");
  });

  it("compact redondea a enteros", () => {
    expect(norm(fmtMoney(1234.5, { compact: true }))).toBe("1.235 kr.");
  });

  it("cero y negativos", () => {
    expect(norm(fmtMoney(0))).toBe("0,00 kr.");
    expect(norm(fmtMoney(-10))).toBe("-10,00 kr.");
  });

  it("NaN / Infinity se muestran como 0", () => {
    expect(norm(fmtMoney(NaN))).toBe("0,00 kr.");
    expect(norm(fmtMoney(Infinity))).toBe("0,00 kr.");
  });

  it("redondea a 2 decimales", () => {
    expect(norm(fmtMoney(1.006))).toBe("1,01 kr.");
  });
});

describe("fmtNumber", () => {
  it("agrupa con punto y sin simbolo", () => {
    expect(fmtNumber(7000)).toBe("7.000");
    expect(fmtNumber(1234567.6)).toBe("1.234.568");
  });
  it("no finitos => 0", () => {
    expect(fmtNumber(NaN)).toBe("0");
  });
});

describe("parseMoney", () => {
  it("vacio => null", () => {
    expect(parseMoney("")).toBeNull();
  });

  it("basura => null", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("kr.")).toBeNull();
  });

  it("estilo danes 1.234,56", () => {
    expect(parseMoney("1.234,56")).toBeCloseTo(1234.56);
    expect(parseMoney("1.234.567,89")).toBeCloseTo(1234567.89);
  });

  it("estilo ingles 1234.56", () => {
    expect(parseMoney("1234.56")).toBeCloseTo(1234.56);
    expect(parseMoney("12.5")).toBeCloseTo(12.5);
  });

  it("coma decimal sola", () => {
    expect(parseMoney("12,50")).toBeCloseTo(12.5);
  });

  it("ignora espacios y letras (kr, DKK)", () => {
    expect(parseMoney(" 1 234,50 kr")).toBeCloseTo(1234.5);
    expect(parseMoney("DKK 99")).toBe(99);
  });

  it("negativos y cero", () => {
    expect(parseMoney("-50")).toBe(-50);
    expect(parseMoney("0")).toBe(0);
  });

  // BUG sospechado (money.ts:36): el regex de "punto de miles" /\.(?=\d{3}\b)/
  // tambien borra el punto decimal de un numero en estilo ingles con exactamente
  // 3 decimales, asi que "0.125" (p.ej. un precio por gramo) se parsea como 125.
  // Con parte entera 0 no hay ambiguedad posible: no es un separador de miles.
  it.fails("estilo ingles con 3 decimales: 0.125 => 0.125", () => {
    expect(parseMoney("0.125")).toBeCloseTo(0.125);
  });
});

describe("fmtUsdFromDkk", () => {
  it("convierte DKK -> USD con la tasa DKK por USD", () => {
    // 12 / 6.9 = 1.739...
    expect(fmtUsdFromDkk(12, 6.9)).toBe("$1.74");
    expect(fmtUsdFromDkk(69, 6.9)).toBe("$10.00");
  });

  it("tasa 0 o negativa => $0.00 (no divide por cero)", () => {
    expect(fmtUsdFromDkk(100, 0)).toBe("$0.00");
    expect(fmtUsdFromDkk(100, -5)).toBe("$0.00");
  });

  it("montos negativos", () => {
    expect(fmtUsdFromDkk(-69, 6.9)).toBe("-$10.00");
  });
});

describe("convertViaUsd", () => {
  it("misma moneda => sin cambios", () => {
    expect(convertViaUsd(123, "DKK", "DKK", RATES)).toBe(123);
  });

  it("DKK -> USD y USD -> DKK", () => {
    expect(convertViaUsd(69, "DKK", "USD", RATES)).toBeCloseTo(10);
    expect(convertViaUsd(10, "USD", "DKK", RATES)).toBeCloseTo(69);
  });

  it("cruzado via USD: EUR -> DKK", () => {
    // 92 EUR = 100 USD = 690 DKK
    expect(convertViaUsd(92, "EUR", "DKK", RATES)).toBeCloseTo(690);
    expect(convertViaUsd(690, "DKK", "EUR", RATES)).toBeCloseTo(92);
  });

  it("ida y vuelta devuelve el monto original", () => {
    const ars = convertViaUsd(50, "DKK", "ARS", RATES);
    expect(convertViaUsd(ars, "ARS", "DKK", RATES)).toBeCloseTo(50);
  });

  it("moneda desconocida (origen o destino) pasa sin cambios", () => {
    expect(convertViaUsd(100, "GBP", "DKK", RATES)).toBe(100);
    expect(convertViaUsd(100, "DKK", "GBP", RATES)).toBe(100);
  });

  it("tasa 0 se trata como faltante (no divide por cero)", () => {
    expect(convertViaUsd(100, "DKK", "USD", { USD: 1, DKK: 0 })).toBe(100);
  });

  it("cero y negativos", () => {
    expect(convertViaUsd(0, "DKK", "USD", RATES)).toBe(0);
    expect(convertViaUsd(-69, "DKK", "USD", RATES)).toBeCloseTo(-10);
  });

  it("los defaults incluyen las 4 monedas con USD = 1", () => {
    expect(DEFAULT_RATES_PER_USD.USD).toBe(1);
    expect(Object.keys(DEFAULT_RATES_PER_USD).sort()).toEqual(["ARS", "DKK", "EUR", "USD"]);
  });
});

describe("fmtMoneyIn", () => {
  it("EUR con locale de-DE", () => {
    expect(norm(fmtMoneyIn(50, "EUR"))).toBe("50,00 €");
  });

  it("USD con locale en-US", () => {
    expect(fmtMoneyIn(1234.5, "USD")).toBe("$1,234.50");
  });

  it("DKK con locale da-DK", () => {
    expect(norm(fmtMoneyIn(1234.5, "DKK"))).toBe("1.234,50 kr.");
  });

  it("ARS sin decimales, locale es-AR", () => {
    expect(norm(fmtMoneyIn(1234567.8, "ARS"))).toBe("$ 1.234.568");
  });

  it("moneda sin locale conocido cae a en-US", () => {
    expect(fmtMoneyIn(5, "GBP")).toBe("£5.00");
  });

  it("formatter cacheado da el mismo resultado en llamadas repetidas", () => {
    expect(fmtMoneyIn(1, "USD")).toBe(fmtMoneyIn(1, "USD"));
  });

  it("no finitos => 0", () => {
    expect(fmtMoneyIn(NaN, "USD")).toBe("$0.00");
  });
});
