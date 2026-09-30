import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import { vars } from "./style";

describe("vars", () => {
  it("devuelve las custom properties como style", () => {
    expect(vars({ "--accent": "red", "--gap": 4 })).toEqual({ "--accent": "red", "--gap": 4 });
  });

  it("mezcla con el style base", () => {
    expect(vars({ "--accent": "red" }, { color: "blue", padding: 2 })).toEqual({
      color: "blue",
      padding: 2,
      "--accent": "red",
    });
  });

  it("las vars pisan claves repetidas del base", () => {
    const base = { "--accent": "blue" } as unknown as CSSProperties;
    expect(vars({ "--accent": "red" }, base)).toEqual({ "--accent": "red" });
  });

  it("no muta el base", () => {
    const base = { color: "blue" };
    vars({ "--x": 1 }, base);
    expect(base).toEqual({ color: "blue" });
  });

  it("vacio => objeto vacio", () => {
    expect(vars({})).toEqual({});
  });
});
