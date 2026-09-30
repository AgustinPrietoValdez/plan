import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrewSession, CoffeeBean } from "../types";

// `buildContext` es privado; se testea a traves de lo que se le pasa a invoke.
// Solo se stubbean los tres bordes (invoke, dialogo, repo) — nada de SQLite.
const { invokeMock, openMock, listMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  listMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("./repo/local", () => ({ localRepo: { listBrewSessions: listMock } }));

import { analyzeCoffee, askAboutBrew } from "./coffeeAnalysis";

function bean(p: Partial<CoffeeBean>): CoffeeBean {
  return {
    id: "b1", name: "Huila", roaster: "", varietal: "", country: "", process: "", producer: "",
    roastedOn: null, weightGrams: 200, initialWeightGrams: 250, notes: "", cataInicial: "",
    notaFinal: "", lastTweak: null, finishedAt: null, rating: null, flavorTags: [],
    createdAt: "", updatedAt: "", deletedAt: null, version: 1, ...p,
  };
}
function session(p: Partial<BrewSession>): BrewSession {
  return {
    id: "s", recipeId: null, recipeName: "V60", beanId: "b1", beanName: "", doseGrams: 15,
    totalWaterGrams: 250, durationMs: 180_400, notes: "", createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "", deletedAt: null, version: 1, ...p,
  };
}

function lastContext(): string {
  const calls = invokeMock.mock.calls;
  const call = calls[calls.length - 1];
  return (call[1] as { context: string }).context;
}

beforeEach(() => {
  invokeMock.mockReset().mockResolvedValue(undefined);
  openMock.mockReset();
  listMock.mockReset();
});

describe("askAboutBrew (contexto)", () => {
  it("campos vacios => '?' / '(vacia)' / '(sin ajuste)'", async () => {
    await askAboutBrew(bean({}), null, "por que sale amargo?");
    const [cmd, args] = invokeMock.mock.calls[0];
    expect(cmd).toBe("launch_coffee_question");
    expect((args as { question: string }).question).toBe("por que sale amargo?");
    const ctx = lastContext();
    expect(ctx).toContain("# Contexto del grano: Huila");
    expect(ctx).toContain("- Roaster: ?");
    expect(ctx).toContain("- Stock: 200g");
    expect(ctx).toContain("- Estado: activo");
    expect(ctx).toContain("- Cata inicial: (vacia)");
    expect(ctx).toContain("- Ultimo ajuste (last_tweak): (sin ajuste)");
    expect(ctx).toContain("## Brews registrados (0)\n- (ninguno todavia)");
    expect(ctx).not.toContain("- Notas:");
  });

  it("formatea el ultimo ajuste y el brew", async () => {
    const b = bean({
      roaster: "Prolog",
      finishedAt: "2026-09-10",
      notes: "rico",
      lastTweak: { grindSize: "22", doseGrams: 16, tempCelsius: 94, notes: "mas fino", at: "" },
    });
    await askAboutBrew(b, session({ notes: "amargo" }), "q");
    const ctx = lastContext();
    expect(ctx).toContain("- Roaster: Prolog");
    expect(ctx).toContain("- Estado: terminado");
    expect(ctx).toContain("- Notas: rico");
    expect(ctx).toContain('molienda=22, dosis=16g, temp=94C, notas="mas fino"');
    expect(ctx).toContain("## Brews registrados (1)\n- 2026-09-01 | V60 | dosis 15g agua 250g | 180s | amargo");
  });

  it("ajuste sin ningun campo => (sin ajuste)", async () => {
    await askAboutBrew(bean({ lastTweak: { notes: "", at: "" } }), null, "q");
    expect(lastContext()).toContain("(last_tweak): (sin ajuste)");
  });

  it("dosis 0 en el ajuste igual se muestra", async () => {
    await askAboutBrew(bean({ lastTweak: { doseGrams: 0, notes: "", at: "" } }), null, "q");
    expect(lastContext()).toContain("(last_tweak): dosis=0g");
  });
});

describe("analyzeCoffee", () => {
  it("filtra brews por grano y pasa la foto elegida", async () => {
    openMock.mockResolvedValue("C:\\foto.jpg");
    listMock.mockResolvedValue([session({ id: "a" }), session({ id: "b", beanId: "otro" })]);
    await analyzeCoffee(bean({}));
    const [cmd, args] = invokeMock.mock.calls[0];
    expect(cmd).toBe("launch_coffee_analysis");
    expect((args as { photoPath: string | null }).photoPath).toBe("C:\\foto.jpg");
    expect(lastContext()).toContain("## Brews registrados (1)");
  });

  it("dialogo cancelado o con error y repo roto => sigue sin foto ni brews", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    openMock.mockRejectedValue(new Error("no dialog"));
    listMock.mockRejectedValue(new Error("no db"));
    await analyzeCoffee(bean({}));
    const args = invokeMock.mock.calls[0][1] as { photoPath: string | null };
    expect(args.photoPath).toBeNull();
    expect(lastContext()).toContain("## Brews registrados (0)");
    warn.mockRestore();
  });
});
