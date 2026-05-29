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
