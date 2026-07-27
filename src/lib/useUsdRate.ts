import { useAutoExchangeRates } from "./exchangeRates";

/** Read-only DKK→USD rate (DKK per 1 USD) for Compras — reuses Finanzas'
 *  automatic daily cotización (`finanzas_settings.ratesPerUsd`) instead of a
 *  separate manual field, so both areas always agree. */
export function useUsdRate(): number {
  const { ratesPerUsd } = useAutoExchangeRates();
  return ratesPerUsd.DKK;
}
