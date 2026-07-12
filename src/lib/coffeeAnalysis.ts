// Boton "Analizar" del modulo Cafe (desktop-only): junta la info del grano +
// sus brews/catas, deja elegir una foto, y lanza una terminal con Claude Code
// para analizar el cafe contra COFFEE_GUIDE.md / CATA_GUIDE.md.
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { BrewSession, CoffeeBean } from "../types";
import { localRepo } from "./repo/local";

// Misma idea que DEFAULT_VAULT_PATH en obsidian.ts: ruta fija del repo en la PC.
const REPO_PATH = "C:\\Users\\agusp\\Documentos\\Organization_App\\calendar-app";

function fmtTweak(t: CoffeeBean["lastTweak"]): string {
  if (!t) return "(sin ajuste)";
  const parts: string[] = [];
  if (t.recipeId) parts.push(`receta=${t.recipeId}`);
  if (t.grindSize) parts.push(`molienda=${t.grindSize}`);
  if (t.doseGrams != null) parts.push(`dosis=${t.doseGrams}g`);
  if (t.totalWaterGrams != null) parts.push(`agua=${t.totalWaterGrams}g`);
  if (t.tempCelsius != null) parts.push(`temp=${t.tempCelsius}C`);
  if (t.notes) parts.push(`notas="${t.notes}"`);
  return parts.length ? parts.join(", ") : "(sin ajuste)";
}

function buildContext(b: CoffeeBean, brews: BrewSession[]): string {
  const lines: string[] = [];
  lines.push(`# Contexto del grano: ${b.name}`, "");
  lines.push("## Ficha");
  lines.push(`- Roaster: ${b.roaster || "?"}`);
  lines.push(`- Pais: ${b.country || "?"}`);
  lines.push(`- Variedad: ${b.varietal || "?"}`);
  lines.push(`- Proceso: ${b.process || "?"}`);
  lines.push(`- Productor: ${b.producer || "?"}`);
  lines.push(`- Tostado: ${b.roastedOn || "?"}`);
  lines.push(`- Stock: ${b.weightGrams}g`);
  lines.push(`- Estado: ${b.finishedAt ? "terminado" : "activo"}`);
  if (b.notes) lines.push(`- Notas: ${b.notes}`);
  lines.push("");
  lines.push("## Cata");
  lines.push(`- Cata inicial: ${b.cataInicial || "(vacia)"}`);
  lines.push(`- Nota final: ${b.notaFinal || "(vacia)"}`);
  lines.push(`- Ultimo ajuste (last_tweak): ${fmtTweak(b.lastTweak)}`);
  lines.push("");
  lines.push(`## Brews registrados (${brews.length})`);
  if (brews.length === 0) {
    lines.push("- (ninguno todavia)");
  } else {
    for (const s of brews) {
      const secs = Math.round((s.durationMs || 0) / 1000);
      const day = (s.createdAt || "").slice(0, 10);
      lines.push(
        `- ${day} | ${s.recipeName || "?"} | dosis ${s.doseGrams}g agua ${s.totalWaterGrams}g | ${secs}s` +
          (s.notes ? ` | ${s.notes}` : ""),
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function analyzeCoffee(b: CoffeeBean): Promise<void> {
  // 1) foto opcional
  let photoPath: string | null = null;
  try {
    const sel = await open({
      multiple: false,
      directory: false,
      title: `Foto del grano "${b.name}" (cancelar si no tenes)`,
      filters: [{ name: "Imagenes", extensions: ["jpg", "jpeg", "png", "webp", "gif", "heic"] }],
    });
    if (typeof sel === "string") photoPath = sel;
  } catch (err) {
    console.warn("[analyzeCoffee] dialog skipped:", err);
  }

  // 2) brews del grano
  let brews: BrewSession[] = [];
  try {
    const all = await localRepo.listBrewSessions();
    brews = all.filter((s) => s.beanId === b.id);
  } catch (err) {
    console.warn("[analyzeCoffee] brews fetch failed:", err);
  }

  // 3) lanzar la terminal con Claude
  const context = buildContext(b, brews);
  await invoke("launch_coffee_analysis", { repoPath: REPO_PATH, context, photoPath });
}

// Fase 7c: pregunta puntual sobre un brew que no salio como se esperaba.
// Mismo mecanismo que analyzeCoffee (terminal con Claude), pero el prompt
// parte de la queja del usuario en vez de armar una receta inicial.
export async function askAboutBrew(b: CoffeeBean, lastBrew: BrewSession | null, question: string): Promise<void> {
  const context = buildContext(b, lastBrew ? [lastBrew] : []);
  await invoke("launch_coffee_question", { repoPath: REPO_PATH, context, question });
}
