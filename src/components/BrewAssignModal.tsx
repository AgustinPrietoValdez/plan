import { useEffect, useState } from "react";
import { BrewOverlayChart } from "./CafeView";
import { IX } from "./icons";
import {
  useAssignBrewSession,
  useBrewDatapoints,
  useCoffeeBeans,
  useCoffeeRecipes,
  useDeleteBrewSession,
  usePendingBrewSessions,
} from "../lib/queries";

const DEFAULT_DOSE_GRAMS = 15;

function fmtMmSs(ms: number): string {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Popup que aparece solo (sin boton que lo dispare) cuando el pull trae una
 *  sesion capturada por el Pi (recipeId y beanId null — la Pi no sabe que
 *  grano ni receta se uso, solo ve la balanza). Pide asignar grano/receta/
 *  dosis, o descartarla si fue una falsa captura. */
export function BrewAssignModal() {
  const pending = usePendingBrewSessions();
  const session = pending[0] ?? null;

  const { data: datapoints = [] } = useBrewDatapoints(session?.id ?? null);
  const { data: beans = [] } = useCoffeeBeans();
  const { data: recipes = [] } = useCoffeeRecipes();
  const assign = useAssignBrewSession();
  const deleteSession = useDeleteBrewSession();

  const activeBeans = beans.filter((b) => !b.finishedAt && !b.deletedAt);
  const generalRecipes = recipes.filter((r) => !r.baseRecipeId && !r.deletedAt);

  const [beanId, setBeanId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [doseGrams, setDoseGrams] = useState(DEFAULT_DOSE_GRAMS);

  // reset la seleccion cada vez que cambia la sesion que se esta mostrando
  useEffect(() => {
    setBeanId("");
    setRecipeId("");
    setDoseGrams(DEFAULT_DOSE_GRAMS);
  }, [session?.id]);

  if (!session) return null;

  const maxWeight = Math.max(...datapoints.map((p) => p.weightG ?? 0), 10);
  const maxFlow = Math.max(...datapoints.map((p) => p.flowGs ?? 0), 1);
  const maxTimeSec = Math.max(...datapoints.map((p) => p.timerMs / 1000), 60);

  function onDiscard() {
    if (!session) return;
    if (window.confirm("Descartar esta captura del Pi? No se puede deshacer.")) {
      deleteSession.mutate(session.id);
    }
  }

  function onAssign() {
    if (!session || !beanId) return;
    const bean = activeBeans.find((b) => b.id === beanId);
    const recipe = recipeId ? generalRecipes.find((r) => r.id === recipeId) : null;
    if (!bean) return;
    assign.mutate({
      id: session.id,
      input: {
        beanId: bean.id,
        beanName: bean.name,
        recipeId: recipe?.id ?? null,
        recipeName: recipe?.name ?? "",
        doseGrams,
      },
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "calc(var(--home-s, 1) * 480px)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--fg-muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              Brew capturado por la Pi
              {pending.length > 1 ? ` · ${pending.length} pendientes` : ""}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {new Date(session.createdAt).toLocaleString()}
            </div>
          </div>
          <button className="icon-btn" onClick={onDiscard} title="Descartar">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 16 }}>
          <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: "var(--fg-muted)" }}>
            <span>Agua total: <strong style={{ color: "var(--fg)" }}>{session.totalWaterGrams.toFixed(0)}g</strong></span>
            <span>Duracion: <strong style={{ color: "var(--fg)" }}>{fmtMmSs(session.durationMs)}</strong></span>
          </div>

          {datapoints.length > 0 && (
            <BrewOverlayChart
              sessions={[session]}
              dataBySession={{ [session.id]: datapoints }}
              maxWeight={maxWeight}
              maxFlow={maxFlow}
              maxTimeSec={maxTimeSec}
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 500 }}>Grano *</label>
            <select className="input" value={beanId} onChange={(e) => setBeanId(e.target.value)}>
              <option value="">Elegir grano...</option>
              {activeBeans.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 500 }}>Receta (opcional)</label>
            <select className="input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
              <option value="">Sin receta</option>
              {generalRecipes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 500, minWidth: 96 }}>
              Dosis (g)
            </label>
            <input
              type="number"
              min="1"
              step="0.5"
              value={doseGrams}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) setDoseGrams(v);
              }}
              className="input"
              style={{ width: 90, fontVariantNumeric: "tabular-nums", textAlign: "right" }}
            />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onDiscard}>
            Descartar
          </button>
          <div className="actions">
            <button className="btn primary" disabled={!beanId} onClick={onAssign}>
              Asignar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
