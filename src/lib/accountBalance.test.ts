import { describe, expect, it } from "vitest";
import { deriveAccountBalances, type BalanceAccount, type BalanceLedger } from "./accountBalance";

const RATES = { USD: 1, DKK: 6.5, EUR: 0.9, ARS: 1500 };
const TODAY = "2026-09-29";

const usd: BalanceAccount = { id: "usd", currency: "USD", openingBalance: 1000, balanceAsOf: "2026-07-01" };
const dkk: BalanceAccount = { id: "dkk", currency: "DKK", openingBalance: 650, balanceAsOf: "2026-07-01" };

function ledger(p: Partial<BalanceLedger>): BalanceLedger {
  return { expenses: [], incomes: [], transfers: [], ...p };
}

const run = (l: Partial<BalanceLedger>, accounts = [usd, dkk], upTo = TODAY) =>
  deriveAccountBalances(accounts, ledger(l), RATES, upTo);

describe("deriveAccountBalances", () => {
  it("sin movimientos = saldo inicial", () => {
    const b = run({});
    expect(b.get("usd")).toBe(1000);
    expect(b.get("dkk")).toBe(650);
  });

  it("gastos convertidos a la moneda de la cuenta", () => {
    const b = run({ expenses: [{ accountId: "usd", amount: 65, currency: "DKK", spentOn: "2026-08-01" }] });
    expect(b.get("usd")).toBeCloseTo(990);
  });

  it("gastos del mismo dia del saldo inicial cuentan (las bicis salen de los 10.000)", () => {
    const b = run({ expenses: [{ accountId: "usd", amount: 100, currency: "USD", spentOn: "2026-07-01" }] });
    expect(b.get("usd")).toBe(900);
  });

  it("antes del saldo inicial no cuenta", () => {
    const b = run({ expenses: [{ accountId: "usd", amount: 100, currency: "USD", spentOn: "2026-06-30" }] });
    expect(b.get("usd")).toBe(1000);
  });

  it("lo futuro no cuenta hasta que llega su dia", () => {
    const l = { expenses: [{ accountId: "dkk", amount: 280, currency: "DKK", spentOn: "2026-10-01" }] };
    expect(run(l).get("dkk")).toBe(650);
    expect(run(l, [usd, dkk], "2026-10-01").get("dkk")).toBe(370);
  });

  it("ingresos mensuales: cuentan desde el dia 1 de su mes", () => {
    const l = { incomes: [
      { accountId: "dkk", amount: 8000, currency: "DKK", month: "2026-09" },
      { accountId: "dkk", amount: 8662, currency: "DKK", month: "2026-10" },
      { accountId: "dkk", amount: 500, currency: "DKK", month: "2026-06" }, // antes del saldo inicial
    ] };
    expect(run(l).get("dkk")).toBe(8650);
  });

  it("ingresos en DKK se convierten a la moneda de la cuenta", () => {
    const b = run({ incomes: [{ accountId: "usd", amount: 650, currency: "DKK", month: "2026-09" }] });
    expect(b.get("usd")).toBeCloseTo(1100);
  });

  it("transferencia: sale en la moneda de origen y entra convertida", () => {
    const b = run({ transfers: [{ fromAccountId: "dkk", toAccountId: "usd", amount: 130, currency: "DKK", transferredOn: "2026-09-01" }] });
    expect(b.get("dkk")).toBe(520);
    expect(b.get("usd")).toBeCloseTo(1020);
  });

  it("cada pata respeta el saldo inicial de su propia cuenta", () => {
    const late: BalanceAccount = { ...usd, balanceAsOf: "2026-09-15" };
    const b = run({ transfers: [{ fromAccountId: "dkk", toAccountId: "usd", amount: 65, currency: "DKK", transferredOn: "2026-09-01" }] }, [late, dkk]);
    expect(b.get("dkk")).toBe(585);
    expect(b.get("usd")).toBe(1000);
  });

  it("ajuste de saldo (una sola pata) suma o resta", () => {
    const b = run({ transfers: [
      { fromAccountId: null, toAccountId: "usd", amount: 50, currency: "USD", transferredOn: TODAY },
      { fromAccountId: "dkk", toAccountId: null, amount: 20, currency: "DKK", transferredOn: TODAY },
    ] });
    expect(b.get("usd")).toBe(1050);
    expect(b.get("dkk")).toBe(630);
  });

  it("ignora movimientos sin cuenta o de cuentas que no estan", () => {
    const b = run({
      expenses: [
        { accountId: null, amount: 999, currency: "USD", spentOn: "2026-08-01" },
        { accountId: "borrada", amount: 999, currency: "USD", spentOn: "2026-08-01" },
      ],
      transfers: [{ fromAccountId: "borrada", toAccountId: "usd", amount: 10, currency: "USD", transferredOn: "2026-08-01" }],
    });
    expect(b.get("usd")).toBe(1010);
  });

  it("sin balanceAsOf cuenta todo el historial", () => {
    const acc: BalanceAccount = { ...usd, balanceAsOf: null };
    const b = run({ expenses: [{ accountId: "usd", amount: 10, currency: "USD", spentOn: "2020-01-01" }] }, [acc]);
    expect(b.get("usd")).toBe(990);
  });

  it("tope de fin de mes con 'YYYY-MM-31' (snapshots de patrimonio)", () => {
    const l = { expenses: [
      { accountId: "usd", amount: 10, currency: "USD", spentOn: "2026-08-31" },
      { accountId: "usd", amount: 20, currency: "USD", spentOn: "2026-09-01" },
    ] };
    expect(run(l, [usd], "2026-08-31").get("usd")).toBe(990);
  });

  it("no depende del orden: es la misma cuenta en compu y celu", () => {
    const e1 = { accountId: "usd", amount: 10, currency: "USD", spentOn: "2026-08-01" };
    const e2 = { accountId: "usd", amount: 65, currency: "DKK", spentOn: "2026-08-02" };
    expect(run({ expenses: [e1, e2] }).get("usd")).toBeCloseTo(run({ expenses: [e2, e1] }).get("usd")!);
  });
});
