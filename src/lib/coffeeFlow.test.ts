import { describe, expect, it } from "vitest";
import { FLOW_TARGET_FALLBACK, flowBand } from "./coffeeFlow";

describe("flowBand", () => {
  it("dentro de ±30% => bien", () => {
    expect(flowBand(3, 3)).toEqual({ tone: "ok", label: "bien", target: 3 });
    expect(flowBand(2.2, 3).tone).toBe("ok");
    expect(flowBand(3.8, 3).tone).toBe("ok");
  });

  it("por debajo del 70% => lento; por encima del 130% => rapido", () => {
    expect(flowBand(2, 3)).toEqual({ tone: "slow", label: "lento", target: 3 });
    expect(flowBand(4, 3)).toEqual({ tone: "fast", label: "rápido", target: 3 });
  });

  it("los bordes exactos cuentan como bien", () => {
    expect(flowBand(7, 10).tone).toBe("ok");
    expect(flowBand(13, 10).tone).toBe("ok");
    expect(flowBand(6.99, 10).tone).toBe("slow");
    expect(flowBand(13.01, 10).tone).toBe("fast");
  });

  it("flujo 0 => lento", () => {
    expect(flowBand(0, 3).tone).toBe("slow");
  });

  it("usa el valor absoluto: flujo negativo no se lee como lento", () => {
    expect(flowBand(-3, 3).tone).toBe("ok");
    expect(flowBand(-5, 3).tone).toBe("fast");
  });

  it("sin objetivo, 0 o negativo => fallback", () => {
    expect(flowBand(3).target).toBe(FLOW_TARGET_FALLBACK);
    expect(flowBand(3, null).target).toBe(FLOW_TARGET_FALLBACK);
    expect(flowBand(3, 0).target).toBe(FLOW_TARGET_FALLBACK);
    expect(flowBand(3, -2).target).toBe(FLOW_TARGET_FALLBACK);
    expect(flowBand(3, -2).tone).toBe("ok");
  });

  it("respeta el objetivo del paso", () => {
    expect(flowBand(3, 6)).toEqual({ tone: "slow", label: "lento", target: 6 });
  });
});
