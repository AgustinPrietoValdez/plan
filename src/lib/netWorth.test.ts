import { describe, expect, it } from "vitest";
import type { Account } from "../types";
import { computeNetWorth } from "./netWorth";

const RATES: Record<string, number> = { USD: 1, DKK: 6.9, EUR: 0.92, ARS: 1000 };

function acc(currency: string, balance: number): Account {
  // Solo `currency` y `balance` importan para el calculo.
  return { id: `${currency}-${balance}`, currency, balance } as unknown as Account;
}

describe("computeNetWorth", () => {
  it("sin cuentas => 0", () => {
    expect(computeNetWorth([], "DKK", RATES)).toBe(0);
  });

  it("todas en la moneda base se suman tal cual", () => {
    expect(computeNetWorth([acc("DKK", 100), acc("DKK", 250.5)], "DKK", RATES)).toBeCloseTo(350.5);
  });

  it("convierte cada cuenta a la moneda base via USD", () => {
    // 10 USD = 69 DKK; 92 EUR = 690 DKK; 1000 ARS = 6.9 DKK
    const total = computeNetWorth([acc("USD", 10), acc("EUR", 92), acc("ARS", 1000), acc("DKK", 1)], "DKK", RATES);
    expect(total).toBeCloseTo(69 + 690 + 6.9 + 1);
  });

  it("en otra moneda base (USD)", () => {
    expect(computeNetWorth([acc("DKK", 69), acc("EUR", 92)], "USD", RATES)).toBeCloseTo(110);
  });

  it("saldos negativos restan (deudas)", () => {
    expect(computeNetWorth([acc("DKK", 100), acc("USD", -10)], "DKK", RATES)).toBeCloseTo(31);
  });

  it("moneda sin tasa pasa sin convertir", () => {
    expect(computeNetWorth([acc("GBP", 50), acc("DKK", 10)], "DKK", RATES)).toBeCloseTo(60);
  });
});
