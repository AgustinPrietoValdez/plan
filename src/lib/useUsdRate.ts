import { useComprasSettings } from "./queries";
import { DEFAULT_DKK_PER_USD } from "./money";

/** Read-only DKK→USD rate (DKK per 1 USD), from the synced Compras settings.
 *  The rate is configured on desktop (Compras → Ajustes), not on the phone. */
export function useUsdRate(): number {
  const q = useComprasSettings();
  return q.data?.dkkPerUsd ?? DEFAULT_DKK_PER_USD;
}
