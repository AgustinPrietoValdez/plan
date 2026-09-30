import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { repo } from "./repo";
import type { Account } from "../types";
import { shiftMonth, todayYmd } from "./date";
import { computeNetWorth } from "./netWorth";
import { useNetWorthSnapshots, useUpsertNetWorthSnapshot } from "./queries";

/**
 * Takes ONE net-worth snapshot per calendar month (not daily, per design): when the most
 * recently completed month has no stored snapshot yet, computes it from CURRENT balances/rates
 * and saves it, then re-derives it from the ledger at that month's close (the balance is derived,
 * see lib/accountBalance.ts). The one-time fix of old drifted snapshots runs after a sync pull
 * (sync.ts).
 */
export function useNetWorthSnapshot(
  accounts: Account[],
  baseCurrency: string,
  ratesPerUsd: Record<string, number>,
  ready: boolean,
) {
  const snapshotsQ = useNetWorthSnapshots();
  const upsert = useUpsertNetWorthSnapshot();
  const qc = useQueryClient();

  useEffect(() => {
    if (!ready || !snapshotsQ.isSuccess) return;
    const lastCompletedMonth = shiftMonth(todayYmd().slice(0, 7), -1);
    const exists = (snapshotsQ.data ?? []).some((s) => s.month === lastCompletedMonth);
    if (exists) return;
    const amount = computeNetWorth(accounts, baseCurrency, ratesPerUsd);
    upsert.mutate(
      { month: lastCompletedMonth, amount, currency: baseCurrency },
      {
        onSuccess: () =>
          repo
            .recomputeNetWorthSnapshots([lastCompletedMonth])
            .then(() => qc.invalidateQueries({ queryKey: ["net_worth_snapshots"] })),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, snapshotsQ.isSuccess, snapshotsQ.data, baseCurrency]);

  return snapshotsQ;
}
