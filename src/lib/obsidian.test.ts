import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Milestone } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { DEFAULT_VAULT_PATH, buildGuideMarkdown, projectSlug, scaffoldProjectGuide } from "./obsidian";

function ms(p: Partial<Milestone>): Milestone {
  return { id: "m", title: "M", description: "", done: false, ...p };
}

describe("projectSlug", () => {
  it("capitaliza la primera letra y espacios -> _", () => {
    expect(projectSlug("cargo bot")).toBe("Cargo_bot_guide.md");
    expect(projectSlug("Job search")).toBe("Job_search_guide.md");
  });

  it("colapsa espacios y recorta bordes", () => {
    expect(projectSlug("  mi   proyecto  ")).toBe("Mi_proyecto_guide.md");
  });

  it("saca tildes y enies", () => {
    expect(projectSlug("café único")).toBe("Cafe_unico_guide.md");
    expect(projectSlug("ñandú")).toBe("Nandu_guide.md");
  });

  it("descarta lo que no es ASCII imprimible", () => {
    expect(projectSlug("app ☕ 2")).toBe("App_2_guide.md");
    expect(/^[\x20-\x7e]+$/.test(projectSlug("日本 test"))).toBe(true);
  });

  it("vacio o sin ASCII => Untitled", () => {
    expect(projectSlug("")).toBe("Untitled_guide.md");
    expect(projectSlug("   ")).toBe("Untitled_guide.md");
    expect(projectSlug("日本")).toBe("Untitled_guide.md");
  });
});

describe("buildGuideMarkdown", () => {
  it("titulo, descripcion y tag del slug en minuscula", () => {
    const md = buildGuideMarkdown({ name: "Cargo bot", objetivo: "  Robot de carga ", estado: "activo", milestones: [] });
    expect(md.startsWith("# Cargo bot - Project Guide\n")).toBe(true);
    expect(md).toContain("## Description\n\nRobot de carga\n");
    expect(md).toContain("(define the timeline / phases of this project)");
    expect(md.trimEnd().endsWith("#Guide\n#cargo_bot")).toBe(true);
  });

  it("placeholders si falta objetivo", () => {
    const md = buildGuideMarkdown({ name: "X", objetivo: "   ", estado: "activo", milestones: [] });
    expect(md).toContain("(define the goal of this project)");
  });

  it("milestones con marca DONE / PROXIMO y descripcion por default", () => {
    const md = buildGuideMarkdown({
      name: "X",
      objetivo: "o",
      estado: "activo",
      milestones: [ms({ title: "Fase 1", done: true, description: " hecho " }), ms({ title: "Fase 2" })],
    });
    expect(md).toContain("### Fase 1 [DONE]\n\nhecho\n\n### Fase 2 [PROXIMO]\n\n(describe this milestone)");
  });

  it("incluye la cadena de lectura", () => {
    const md = buildGuideMarkdown({ name: "X", objetivo: "", estado: "pausado", milestones: [] });
    expect(md).toContain("`me.md` -> `Project guide template` -> this guide -> `AI.md`");
  });
});

describe("scaffoldProjectGuide", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invoca el comando con el nombre de archivo y el markdown", async () => {
    invokeMock.mockResolvedValue(undefined);
    const p = { name: "café bot", objetivo: "o", estado: "activo" as const, milestones: [] };
    const name = await scaffoldProjectGuide(p);
    expect(name).toBe("Cafe_bot_guide.md");
    expect(invokeMock).toHaveBeenCalledWith("scaffold_project_guide", {
      vaultPath: DEFAULT_VAULT_PATH,
      fileName: "Cafe_bot_guide.md",
      content: buildGuideMarkdown(p),
    });
  });

  it("propaga el error (vault-not-found)", async () => {
    invokeMock.mockRejectedValue(new Error("vault-not-found"));
    await expect(
      scaffoldProjectGuide({ name: "x", objetivo: "", estado: "activo", milestones: [] }, "C:\\nope"),
    ).rejects.toThrow("vault-not-found");
  });
});
