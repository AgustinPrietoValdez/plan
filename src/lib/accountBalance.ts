import type { Account } from "../types";
import { convertViaUsd } from "./money";

// Saldo de cuenta DERIVADO: openingBalance (al día balanceAsOf) + ingresos − gastos
// ± transferencias entre balanceAsOf y `upTo` (inclusive, normalmente hoy). Nunca se
// acumula en la DB: antes se hacía y el `balance` absoluto se sincronizaba
// last-write-wins entre compu y celu, que se pisaban los descuentos (set 2026).
//
// Lo con fecha futura no cuenta hasta que llega su día (decisión del usuario). Los
// ingresos son mensuales (`month` = "YYYY-MM") y cuentan desde el día 1 de su mes.

export type BalanceAccount = Pick<Account, "id" | "currency" | "openingBalance" | "balanceAsOf">;

export interface BalanceExpense {
  accountId: string | null;
  amount: number;
  currency: string;
  spentOn: string;
}

export interface BalanceIncome {
  accountId: string | null;
  amount: number;
  currency: string;
  month: string;
}

/** Incluye los ajustes de saldo (kind "adjustment"): una sola pata, la otra en null. */
export interface BalanceTransfer {
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
  currency: string;
  transferredOn: string;
}

export interface BalanceLedger {
  expenses: BalanceExpense[];
  incomes: BalanceIncome[];
  transfers: BalanceTransfer[];
}

/** Gastos e ingresos se convierten de su moneda a la de la cuenta; las transferencias salen
 *  en la moneda de la cuenta origen y entran convertidas a la de destino. Todo con las tasas
 *  ACTUALES (decisión del usuario): si el tipo de cambio mueve el saldo, se corrige con un
 *  ajuste de "Saldo actual". */
export function deriveAccountBalances(
  accounts: BalanceAccount[],
  ledger: BalanceLedger,
  ratesPerUsd: Record<string, number>,
  upTo: string,
): Map<string, number> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out = new Map<string, number>(accounts.map((a) => [a.id, a.openingBalance]));
  const floor = (a: BalanceAccount) => a.balanceAsOf ?? "0000-00-00";
  const inWindow = (a: BalanceAccount, day: string) => day >= floor(a) && day <= upTo;
  const add = (a: BalanceAccount, delta: number) => out.set(a.id, out.get(a.id)! + delta);

  for (const e of ledger.expenses) {
    const a = e.accountId ? byId.get(e.accountId) : undefined;
    if (a && inWindow(a, e.spentOn)) add(a, -convertViaUsd(e.amount, e.currency, a.currency, ratesPerUsd));
  }
  for (const i of ledger.incomes) {
    const a = i.accountId ? byId.get(i.accountId) : undefined;
    if (a && i.month >= floor(a).slice(0, 7) && `${i.month}-01` <= upTo) {
      add(a, convertViaUsd(i.amount, i.currency, a.currency, ratesPerUsd));
    }
  }
  for (const t of ledger.transfers) {
    const from = t.fromAccountId ? byId.get(t.fromAccountId) : undefined;
    const to = t.toAccountId ? byId.get(t.toAccountId) : undefined;
    const fromCur = from?.currency ?? t.currency;
    if (from && inWindow(from, t.transferredOn)) add(from, -t.amount);
    if (to && inWindow(to, t.transferredOn)) add(to, convertViaUsd(t.amount, fromCur, to.currency, ratesPerUsd));
  }
  return out;
}
