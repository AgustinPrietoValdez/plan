import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { repo } from "./repo";

/** Runs the account-balance self-heal (see repo.reconcileAccountBalances) once
 *  per session per user, right after login/app start. */
export function useReconcileAccountBalances(userId: string | undefined) {
  const qc = useQueryClient();
  const ranRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (ranRef.current === userId) return;
    ranRef.current = userId;

    (async () => {
      try {
        await repo.reconcileAccountBalances();
        qc.invalidateQueries({ queryKey: ["accounts"] });
      } catch (err) {
        console.error("Failed to reconcile account balances:", err);
      }
    })();
  }, [userId, qc]);
}
