import { afterEach, describe, expect, it, vi } from "vitest";

// El modulo importa los hooks de react-query/DB; para `fetchLiveRates` no se usan.
vi.mock("./queries", () => ({
  useFinanzasSettings: () => ({}),
  useUpsertFinanzasSettings: () => ({}),
}));

import { fetchLiveRates } from "./exchangeRates";

function res(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function stubFetch(ecb: ReturnType<typeof res>, ars: ReturnType<typeof res>) {
  const fn = vi.fn(async (url: string) => (url.includes("frankfurter") ? ecb : ars));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLiveRates", () => {
  it("combina ECB (DKK/EUR) y DolarAPI (ARS venta)", async () => {
    const fn = stubFetch(res({ rates: { DKK: 6.8, EUR: 0.91 } }), res({ compra: 990, venta: 1010 }));
    await expect(fetchLiveRates()).resolves.toEqual({ dkkPerUsd: 6.8, eurPerUsd: 0.91, arsPerUsd: 1010 });
    expect(fn).toHaveBeenCalledTimes(2);
    // Pega directo al dominio nuevo (el redirect de frankfurter.app rompe CORS).
    expect(fn.mock.calls.some(([u]) => u.startsWith("https://api.frankfurter.dev/"))).toBe(true);
  });

  it("HTTP de error en frankfurter => throw", async () => {
    stubFetch(res({}, false, 500), res({ venta: 1000 }));
    await expect(fetchLiveRates()).rejects.toThrow(/HTTP 500/);
  });

  it("HTTP de error en dolarapi => throw", async () => {
    stubFetch(res({ rates: { DKK: 6.8, EUR: 0.91 } }), res({}, false, 503));
    await expect(fetchLiveRates()).rejects.toThrow(/dolarapi.*503/);
  });

  it("respuesta incompleta (falta una tasa) => throw", async () => {
    stubFetch(res({ rates: { DKK: 6.8 } }), res({ venta: 1000 }));
    await expect(fetchLiveRates()).rejects.toThrow("Respuesta de cotizacion incompleta");
  });

  it("sin `rates` o sin `venta` => throw", async () => {
    stubFetch(res({}), res({}));
    await expect(fetchLiveRates()).rejects.toThrow("incompleta");
  });

  it("tasa 0 se considera faltante", async () => {
    stubFetch(res({ rates: { DKK: 6.8, EUR: 0.91 } }), res({ venta: 0 }));
    await expect(fetchLiveRates()).rejects.toThrow("incompleta");
  });
});
