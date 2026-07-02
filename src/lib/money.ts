/** Hardcoded for v1 — single currency app. */
export const CURRENCY = "DKK";
export const LOCALE = "da-DK";

const FORMATTER = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 2,
});

const COMPACT_FORMATTER = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

export function fmtMoney(amount: number, opts?: { compact?: boolean }): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return (opts?.compact ? COMPACT_FORMATTER : FORMATTER).format(n);
}

export function parseMoney(text: string): number | null {
  if (!text) return null;
  // Accept Danish-style "1.234,56" and English-style "1234.56"
  const cleaned = text
    .replace(/\s/g, "")
    .replace(/[a-zA-Z]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "") // remove thousands dots in da-DK
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// --- USD conversion (Compras): prices are entered in DKK, shown also in USD ---
// The rate is "DKK per 1 USD", configured on desktop and synced (compras_settings).
export const DEFAULT_DKK_PER_USD = 6.9;

const USD_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** Format a DKK amount as its USD equivalent, e.g. "US$1.74". */
export function fmtUsdFromDkk(dkk: number, dkkPerUsd: number): string {
  const usd = dkkPerUsd > 0 ? dkk / dkkPerUsd : 0;
  return USD_FMT.format(Number.isFinite(usd) ? usd : 0);
}

// --- Finanzas multi-currency (Holdings): DKK, USD, EUR, ARS ---
// Rates are "units of currency per 1 USD", fetched daily (see lib/exchangeRates.ts)
// and stored in finanzas_settings. These are fallbacks for a never-fetched app.
export const DEFAULT_RATES_PER_USD: Record<string, number> = {
  USD: 1,
  DKK: 6.9,
  EUR: 0.92,
  ARS: 1000,
};

/** Convert `amount` between any two currencies via a USD pivot.
 *  `ratesPerUsd` = units of each currency per 1 USD (USD: 1). Unknown currencies pass through unchanged. */
export function convertViaUsd(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  ratesPerUsd: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = ratesPerUsd[fromCurrency];
  const toRate = ratesPerUsd[toCurrency];
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

const CURRENCY_LOCALE: Record<string, string> = {
  DKK: "da-DK",
  USD: "en-US",
  EUR: "de-DE",
  ARS: "es-AR",
};
const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Format `amount` in an arbitrary currency (DKK/USD/EUR/ARS), e.g. fmtMoneyIn(50, "EUR") -> "50,00 €". */
export function fmtMoneyIn(amount: number, currency: string): string {
  let f = currencyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "ARS" ? 0 : 2,
    });
    currencyFormatters.set(currency, f);
  }
  return f.format(Number.isFinite(amount) ? amount : 0);
}
