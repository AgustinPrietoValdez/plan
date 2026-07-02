/** Live FX rates for Finanzas (DKK/EUR from the ECB via Frankfurter, ARS oficial via DolarAPI).
 *  Both are free, keyless public APIs — no secret to manage. */

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
