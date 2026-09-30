import { describe, expect, it } from "vitest";
import {
  baseUnit,
  formatQuantity,
  leastWastePresentation,
  parseQuantity,
  toBase,
  unitOptions,
  type PresentationLike,
} from "./units";

function pres(id: string, size: number, kind: PresentationLike["kind"] = "package"): PresentationLike {
  return { id, label: id, size, kind };
}

describe("baseUnit", () => {
  it("g / ml / u segun la dimension", () => {
    expect(baseUnit("weight")).toBe("g");
    expect(baseUnit("volume")).toBe("ml");
    expect(baseUnit("count")).toBe("u");
  });
});

describe("parseQuantity", () => {
  it("enteros y decimales con punto o coma", () => {
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity("0.5")).toBe(0.5);
    expect(parseQuantity("0,5")).toBe(0.5);
    expect(parseQuantity("  2,25  ")).toBe(2.25);
  });

  it("fracciones, con o sin espacios", () => {
    expect(parseQuantity("1/2")).toBe(0.5);
    expect(parseQuantity("3 / 4")).toBe(0.75);
    expect(parseQuantity("5/2")).toBe(2.5);
  });

  it("denominador cero => null", () => {
    expect(parseQuantity("1/0")).toBeNull();
    expect(parseQuantity("0/0")).toBeNull();
  });

  it("vacio o basura => null", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("   ")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("1/2/3")).toBeNull();
    expect(parseQuantity("Infinity")).toBeNull();
  });

  it("cero es valido", () => {
    expect(parseQuantity("0")).toBe(0);
  });
});

describe("formatQuantity", () => {
  it("peso: g por debajo de 1000, kg desde 1000", () => {
    expect(formatQuantity(0, "weight")).toBe("0 g");
    expect(formatQuantity(250, "weight")).toBe("250 g");
    expect(formatQuantity(999, "weight")).toBe("999 g");
    expect(formatQuantity(1000, "weight")).toBe("1 kg");
    expect(formatQuantity(1500, "weight")).toBe("1,5 kg");
  });

  it("volumen: ml por debajo de 1000, L desde 1000", () => {
    expect(formatQuantity(330, "volume")).toBe("330 ml");
    expect(formatQuantity(1000, "volume")).toBe("1 L");
    expect(formatQuantity(2250, "volume")).toBe("2,25 L");
  });

  it("redondea a 3 decimales con coma", () => {
    expect(formatQuantity(12.34567, "weight")).toBe("12,346 g");
  });

  it("conteo: enteros y fracciones lindas", () => {
    expect(formatQuantity(2, "count")).toBe("2");
    expect(formatQuantity(0.5, "count")).toBe("½");
    expect(formatQuantity(0.25, "count")).toBe("¼");
    expect(formatQuantity(1.5, "count")).toBe("1 ½");
    expect(formatQuantity(2.75, "count")).toBe("2 ¾");
  });

  it("conteo: fraccion no linda cae a decimal", () => {
    expect(formatQuantity(1.2, "count")).toBe("1,2");
    expect(formatQuantity(0, "count")).toBe("0");
  });

  // Sospecha de bug: para negativos Math.floor(-0.5) = -1 y el resto da 0.5,
  // asi que se pinta "½" (positivo) porque `whole > 0` es falso y se descarta
  // el signo. Deberia mostrar "-0,5" (o al menos algo negativo).
  it.fails("conteo negativo no deberia perder el signo", () => {
    expect(formatQuantity(-0.5, "count")).not.toBe("½");
  });
});

describe("toBase", () => {
  it("kg / l / L multiplican por 1000", () => {
    expect(toBase(1.5, "kg")).toBe(1500);
    expect(toBase(2, "l")).toBe(2000);
    expect(toBase(0.25, "L")).toBe(250);
  });

  it("unidades base e unidades desconocidas quedan igual", () => {
    expect(toBase(300, "g")).toBe(300);
    expect(toBase(300, "ml")).toBe(300);
    expect(toBase(3, "u")).toBe(3);
    expect(toBase(7, "taza")).toBe(7);
  });

  it("cero y negativos se convierten igual", () => {
    expect(toBase(0, "kg")).toBe(0);
    expect(toBase(-1, "kg")).toBe(-1000);
  });
});

describe("unitOptions", () => {
  it("opciones por dimension", () => {
    expect(unitOptions("weight").map((o) => o.unit)).toEqual(["g", "kg"]);
    expect(unitOptions("volume")).toEqual([{ unit: "ml", label: "ml" }, { unit: "l", label: "L" }]);
    expect(unitOptions("count")).toEqual([{ unit: "u", label: "u" }]);
  });

  it("cada opcion convierte coherentemente con toBase", () => {
    expect(toBase(1, unitOptions("volume")[1].unit)).toBe(1000);
    expect(toBase(1, unitOptions("weight")[1].unit)).toBe(1000);
  });
});

describe("leastWastePresentation", () => {
  it("combina paquetes para desperdicio cero", () => {
    const r = leastWastePresentation(750, [pres("p500", 500), pres("p250", 250)]);
    expect(r).not.toBeNull();
    expect(r!.waste).toBe(0);
    expect(r!.total).toBe(750);
    // 1x500+1x250 y 3x250 empatan (mismo total): cualquiera vale, pero debe sumar 750
    expect(500 * (r!.counts.get("p500") ?? 0) + 250 * (r!.counts.get("p250") ?? 0)).toBe(750);
  });

  it("combinacion mixta cuando ningun tamano solo es exacto", () => {
    const r = leastWastePresentation(800, [pres("p500", 500), pres("p300", 300)]);
    expect(r!.waste).toBe(0);
    expect(r!.counts.get("p500")).toBe(1);
    expect(r!.counts.get("p300")).toBe(1);
  });

  it("un solo tamano: redondea hacia arriba", () => {
    const r = leastWastePresentation(600, [pres("p500", 500)]);
    expect(r!.counts.get("p500")).toBe(2);
    expect(r!.total).toBe(1000);
    expect(r!.waste).toBe(400);
  });

  it("prefiere muchos chicos a uno grande si desperdicia menos", () => {
    const r = leastWastePresentation(100, [pres("big", 1000), pres("small", 30)]);
    expect(r!.counts.get("big") ?? 0).toBe(0);
    expect(r!.counts.get("small")).toBe(4);
    expect(r!.waste).toBe(20);
  });

  it("exacto con un paquete => desperdicio 0", () => {
    const r = leastWastePresentation(500, [pres("p500", 500), pres("p1000", 1000)]);
    expect(r!.total).toBe(500);
    expect(r!.waste).toBe(0);
  });

  it("ignora bulk y tamanos <= 0", () => {
    const r = leastWastePresentation(300, [pres("bulk", 0, "bulk"), pres("zero", 0), pres("p200", 200)]);
    expect(r!.counts.has("bulk")).toBe(false);
    expect(r!.counts.has("zero")).toBe(false);
    expect(r!.counts.get("p200")).toBe(2);
  });

  it("sin paquetes utilizables => null", () => {
    expect(leastWastePresentation(100, [])).toBeNull();
    expect(leastWastePresentation(100, [pres("b", 500, "bulk")])).toBeNull();
  });

  it("necesidad cero o negativa => null", () => {
    expect(leastWastePresentation(0, [pres("p", 100)])).toBeNull();
    expect(leastWastePresentation(-5, [pres("p", 100)])).toBeNull();
  });

  it("cantidades fraccionarias de conteo", () => {
    const r = leastWastePresentation(0.5, [pres("unidad", 1)]);
    expect(r!.counts.get("unidad")).toBe(1);
    expect(r!.waste).toBe(0.5);
  });
});
