import { useEffect } from "react";
import type { Account } from "../types";
import { shiftMonth, todayYmd } from "./date";
import { computeNetWorth } from "./netWorth";
import { useNetWorthSnapshots, useUpsertNetWorthSnapshot } from "./queries";

/**
 * Takes ONE net-worth snapshot per calendar month (not daily, per design): when the most
 * recently completed month has no stored snapshot yet, computes it from CURRENT balances/rates
 * and saves it. No historical reconstruction — the chart starts empty and fills in going forward.
 */
export function useNetWorthSnapshot(
  accounts: Account[],
  baseCurrency: string,
  ratesPerUsd: Record<string, number>,
  ready: boolean,
) {
  const snapshotsQ = useNetWorthSnapshots();
  const upsert = useUpsertNetWorthSnapshot();

  useEffect(() => {
    if (!ready || !snapshotsQ.isSuccess) return;
    const lastCompletedMonth = shiftMonth(todayYmd().slice(0, 7), -1);
    const exists = (snapshotsQ.data ?? []).some((s) => s.month === lastCompletedMonth);
    if (exists) return;
    const amount = computeNetWorth(accounts, baseCurrency, ratesPerUsd);
    upsert.mutate({ month: lastCompletedMonth, amount, currency: baseCurrency });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, snapshotsQ.isSuccess, snapshotsQ.data, baseCurrency]);

  return snapshotsQ;
}
