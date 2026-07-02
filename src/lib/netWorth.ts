import type { Account } from "../types";
import { convertViaUsd } from "./money";

/** Sum of every account's balance, converted to `baseCurrency` via a USD pivot. */
export function computeNetWorth(
  accounts: Account[],
  baseCurrency: string,
  ratesPerUsd: Record<string, number>,
): number {
  return accounts.reduce((s, a) => s + convertViaUsd(a.balance, a.currency, baseCurrency, ratesPerUsd), 0);
}
