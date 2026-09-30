import { describe, expect, it } from "vitest";
import type { Category } from "../types";
import { colorsForCategory, colorsForHue, DEFAULT_CATEGORIES, HUE_PRESETS } from "./categoryColor";

describe("colorsForHue", () => {
  it("par bg/fg OKLCH con los tokens del diseño", () => {
    expect(colorsForHue(245)).toEqual({ bg: "oklch(0.90 0.05 245)", fg: "oklch(0.42 0.10 245)" });
  });

  it("normaliza hues fuera de rango a [0, 360)", () => {
    expect(colorsForHue(360).bg).toBe("oklch(0.90 0.05 0)");
    expect(colorsForHue(370).bg).toBe("oklch(0.90 0.05 10)");
    expect(colorsForHue(-30).bg).toBe("oklch(0.90 0.05 330)");
    expect(colorsForHue(-720).fg).toBe("oklch(0.42 0.10 0)");
  });
});

describe("colorsForCategory", () => {
  it("usa el hue de la categoria", () => {
    const c = { id: "c", name: "x", hue: 90 } as Category;
    expect(colorsForCategory(c)).toEqual(colorsForHue(90));
  });
});

describe("constantes", () => {
  it("7 categorias por default con nombres unicos", () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(7);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.name)).size).toBe(7);
  });

  it("12 presets equiespaciados cada 30 grados", () => {
    expect(HUE_PRESETS).toHaveLength(12);
    HUE_PRESETS.forEach((h, i) => expect(h).toBe(i * 30));
  });
});
