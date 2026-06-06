import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getDb } from "./db";
import { drainOutbox } from "./sync";

/**
 * Detects writes made to the SQLite file by OTHER processes (e.g. tools/plan_cli.py
 * or the job-search plan-import scripts) while the app is open, and reacts by
 * refetching queries + draining the outbox they may have enqueued. Closes #3.
 *
 * Mechanism: `PRAGMA data_version` is a cheap per-connection counter that changes
 * when a different connection commits to the database. We poll it every few
 * seconds and also on window focus.
 *
 * Note: the sql plugin uses a connection pool, so the app's own writes can also
 * bump data_version (different pooled connection). That just causes an extra
 * refetch/drain, which is harmless — drain is already triggered on every local
 * enqueue anyway.
 */
const POLL_MS = 3_000;

export function useExternalChangesPoller(userId: string | undefined): void {
  const qc = useQueryClient();
  const lastVersion = useRef<number | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const check = async () => {
      if (cancelled || checking.current) return;
      checking.current = true;
      try {
        const db = await getDb();
        const rows = await db.select<{ data_version: number }[]>("PRAGMA data_version");
        const version = rows[0]?.data_version;
        if (version == null) return;

        if (lastVersion.current !== null && version !== lastVersion.current) {
          // Something else wrote to the DB: refresh everything the UI holds
          // and push whatever the external writer enqueued in the outbox.
          await qc.invalidateQueries();
          await drainOutbox(userId);
        }
        lastVersion.current = version;
      } catch {
        // DB busy or app shutting down — try again next tick.
      } finally {
        checking.current = false;
      }
    };

    void check(); // capture the baseline immediately

    const interval = window.setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, qc]);
}
