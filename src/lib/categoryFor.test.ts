import { describe, expect, it } from "vitest";
import type { Category, Project } from "../types";
import { colorsForHue } from "./categoryColor";
import { categoryById, categoryFor, colorsById, colorsFor, nameFor, projectFor } from "./categoryFor";

function cat(p: Partial<Category>): Category {
  return {
    id: "c", name: "Cat", hue: 100, position: 0, archived: false,
    createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  };
}

function proj(p: Partial<Project>): Project {
  return {
    id: "p", name: "Proj", categoryId: "c", objetivo: "", estado: "activo", milestones: [],
    archived: false, createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  } as Project;
}

const FALLBACK = { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };

const design = cat({ id: "design", name: "Design", hue: 245 });
const eng = cat({ id: "eng", name: "Engineering", hue: 295 });
const old = cat({ id: "old", name: "Old", hue: 10, archived: true });
const categories = [design, eng, old];
const pEng = proj({ id: "pEng", categoryId: "eng" });
const pOld = proj({ id: "pOld", categoryId: "old" });
const projects = [pEng, pOld];

describe("categoryFor", () => {
  it("la categoria explicita de la tarea gana", () => {
    expect(categoryFor({ categoryId: "design", projectId: "pEng" }, categories, projects)).toBe(design);
  });

  it("sin categoria propia usa la del proyecto", () => {
    expect(categoryFor({ categoryId: null, projectId: "pEng" }, categories, projects)).toBe(eng);
  });

  it("categoria de la tarea archivada => cae a la del proyecto", () => {
    expect(categoryFor({ categoryId: "old", projectId: "pEng" }, categories, projects)).toBe(eng);
  });

  it("categoria inexistente => cae a la del proyecto", () => {
    expect(categoryFor({ categoryId: "nope", projectId: "pEng" }, categories, projects)).toBe(eng);
  });

  it("proyecto con categoria archivada => null", () => {
    expect(categoryFor({ categoryId: null, projectId: "pOld" }, categories, projects)).toBeNull();
  });

  it("proyecto inexistente o sin nada => null", () => {
    expect(categoryFor({ categoryId: null, projectId: "ghost" }, categories, projects)).toBeNull();
    expect(categoryFor({ categoryId: null, projectId: null }, categories, projects)).toBeNull();
    expect(categoryFor({ categoryId: "design", projectId: null }, [], [])).toBeNull();
  });
});

describe("colorsFor / nameFor", () => {
  it("colores de la categoria resuelta", () => {
    expect(colorsFor({ categoryId: null, projectId: "pEng" }, categories, projects)).toEqual(colorsForHue(295));
  });

  it("fallback neutro sin categoria", () => {
    expect(colorsFor({ categoryId: null, projectId: null }, categories, projects)).toEqual(FALLBACK);
  });

  it("nombre o Uncategorized", () => {
    expect(nameFor({ categoryId: "design", projectId: null }, categories, projects)).toBe("Design");
    expect(nameFor({ categoryId: null, projectId: "pOld" }, categories, projects)).toBe("Uncategorized");
  });
});

describe("projectFor", () => {
  it("encuentra el proyecto o null", () => {
    expect(projectFor({ projectId: "pEng" }, projects)).toBe(pEng);
    expect(projectFor({ projectId: "ghost" }, projects)).toBeNull();
    expect(projectFor({ projectId: null }, projects)).toBeNull();
  });
});

describe("categoryById / colorsById", () => {
  it("busca por id, incluyendo archivadas", () => {
    expect(categoryById("design", categories)).toBe(design);
    expect(categoryById("old", categories)).toBe(old);
  });

  it("id vacio / null / undefined / inexistente => null", () => {
    expect(categoryById(null, categories)).toBeNull();
    expect(categoryById(undefined, categories)).toBeNull();
    expect(categoryById("", categories)).toBeNull();
    expect(categoryById("nope", categories)).toBeNull();
  });

  it("colores por id con fallback", () => {
    expect(colorsById("design", categories)).toEqual(colorsForHue(245));
    expect(colorsById(null, categories)).toEqual(FALLBACK);
  });
});
