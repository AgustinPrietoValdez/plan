import { describe, expect, it } from "vitest";
import { fmtDuration, priColor, priLabel, priLabelEs } from "./format";

describe("fmtDuration", () => {
  it("null / undefined / 0 => guion largo", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(undefined)).toBe("—");
    expect(fmtDuration(0)).toBe("—");
  });

  it("menos de una hora en minutos", () => {
    expect(fmtDuration(1)).toBe("1m");
    expect(fmtDuration(59)).toBe("59m");
  });

  it("horas exactas sin minutos", () => {
    expect(fmtDuration(60)).toBe("1h");
    expect(fmtDuration(180)).toBe("3h");
  });

  it("horas y minutos", () => {
    expect(fmtDuration(61)).toBe("1h 1m");
    expect(fmtDuration(135)).toBe("2h 15m");
  });
});

describe("priLabel / priLabelEs / priColor", () => {
  it("etiquetas en ingles", () => {
    expect(priLabel("high")).toBe("High");
    expect(priLabel("med")).toBe("Med");
    expect(priLabel("low")).toBe("Low");
  });

  it("etiquetas en castellano", () => {
    expect(priLabelEs("high")).toBe("Alta");
    expect(priLabelEs("med")).toBe("Media");
    expect(priLabelEs("low")).toBe("Baja");
  });

  it("colores por token", () => {
    expect(priColor("high")).toBe("var(--danger)");
    expect(priColor("med")).toBe("var(--warn)");
    expect(priColor("low")).toBe("var(--ok)");
  });
});
