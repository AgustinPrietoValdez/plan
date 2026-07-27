/** Live FX rates for Finanzas (DKK/EUR from the ECB via Frankfurter, ARS oficial via DolarAPI).
 *  Both are free, keyless public APIs — no secret to manage. */

import { useEffect, useState } from "react";
import { useFinanzasSettings, useUpsertFinanzasSettings } from "./queries";
import { DEFAULT_RATES_PER_USD } from "./money";

export interface LiveRates {
  dkkPerUsd: number;
  eurPerUsd: number;
  arsPerUsd: number;
}

export async function fetchLiveRates(): Promise<LiveRates> {
  const [ecbRes, arsRes] = await Promise.all([
    // frankfurter.app rebranded to frankfurter.dev and now 301s there; the redirect's
    // response lacks the CORS headers fetch() needs, so it fails silently in-app even
    // though curl follows it fine. Hit the new domain directly.
    fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=DKK,EUR"),
    fetch("https://dolarapi.com/v1/dolares/oficial"),
  ]);
  if (!ecbRes.ok) throw new Error(`frankfurter.app: HTTP ${ecbRes.status}`);
  if (!arsRes.ok) throw new Error(`dolarapi.com: HTTP ${arsRes.status}`);

  const ecb = (await ecbRes.json()) as { rates?: { DKK?: number; EUR?: number } };
  const ars = (await arsRes.json()) as { venta?: number };

  const dkkPerUsd = ecb.rates?.DKK;
  const eurPerUsd = ecb.rates?.EUR;
  const arsPerUsd = ars.venta;
  if (!dkkPerUsd || !eurPerUsd || !arsPerUsd) {
    throw new Error("Respuesta de cotizacion incompleta");
  }
  return { dkkPerUsd, eurPerUsd, arsPerUsd };
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export interface AutoExchangeRates {
  ratesPerUsd: Record<string, number>;
  ratesUpdatedAt: string | null;
  refreshing: boolean;
  refreshError: string | null;
  refresh: () => Promise<void>;
}

/** Cotizacion automatica compartida (DKK/EUR/ARS por USD), guardada en
 *  `finanzas_settings` y refrescada una vez por dia en cuanto se conoce la fila
 *  — sin importar si la pantalla que la dispara es Finanzas > Holdings o
 *  Compras, ambas leen/escriben la misma fila, asi que la primera que se abre
 *  en el dia la actualiza para las dos. Antes Compras tenia su propia
 *  cotizacion manual (`compras_settings.dkkPerUsd`); ahora reusa esta. */
export function useAutoExchangeRates(): AutoExchangeRates {
  const finSettingsQ = useFinanzasSettings();
  const upsertFinSettings = useUpsertFinanzasSettings();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const ratesPerUsd: Record<string, number> = {
    USD: 1,
    DKK: finSettingsQ.data?.ratesPerUsd.DKK ?? DEFAULT_RATES_PER_USD.DKK,
    EUR: finSettingsQ.data?.ratesPerUsd.EUR ?? DEFAULT_RATES_PER_USD.EUR,
    ARS: finSettingsQ.data?.ratesPerUsd.ARS ?? DEFAULT_RATES_PER_USD.ARS,
  };
  const ratesUpdatedAt = finSettingsQ.data?.ratesUpdatedAt ?? null;

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const live = await fetchLiveRates();
      await upsertFinSettings.mutateAsync({
        ratesPerUsd: { USD: 1, DKK: live.dkkPerUsd, EUR: live.eurPerUsd, ARS: live.arsPerUsd },
        ratesUpdatedAt: new Date().toISOString(),
      });
    } catch {
      setRefreshError("No se pudo actualizar la cotizacion");
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch once a day, automatically, as soon as the settings row is known.
  useEffect(() => {
    if (!finSettingsQ.isSuccess || isToday(ratesUpdatedAt)) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finSettingsQ.isSuccess, ratesUpdatedAt]);

  return { ratesPerUsd, ratesUpdatedAt, refreshing, refreshError, refresh };
}
