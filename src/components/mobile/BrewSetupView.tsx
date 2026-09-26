import type { CSSProperties } from "react";
import { FRESHNESS_COLOR, FRESHNESS_LABEL, freshnessStatus } from "../../lib/coffeeFreshness";
import { activeBeans } from "../../lib/coffeeStock";
import { useBrewSessions, useCoffeeBeans, useCoffeeRecipes } from "../../lib/queries";
import type { CoffeeBean } from "../../types";
import {
  CUPS_GOAL_PER_DAY, DOSE_MAX, DOSE_MIN, DOSE_RING_MAX, DOSE_STEP,
  beanSpecificFor, cupsToday, fmtDayMonth, freshnessPct, recipeMeta, restingBanner,
  snapDose, waterFor,
  type BrewDraft,
} from "./cafeFlow";

/* 1i · Café · Elegí grano, receta y peso.
 *
 * Contrato de la shell (`shell.ts`): root `.m-screen` (+ `--sunken`), UN solo
 * scroller `.m-scroll`; la ÚNICA excepción permitida es el estante horizontal
 * (`overflow-x:auto; overflow-y:hidden`). Sin header ⇒ `.m-scroll--top-safe`
 * es obligatorio.
 *
 * Esta pantalla NO toca `lib/ble.ts`: el scan/conexión es la pantalla
 * `conexion`, que va después de los tweaks. */

function ring(color: string, pct: number): CSSProperties {
  return { "--ring-c": color, "--ring-pct": `${pct}%` } as CSSProperties;
}

/** Los 2 chips del handoff son "notas de cata".
 *  TODO(usuario · sin fuente): `bean.flavorTags` SOLO se escribe al marcar el
 *  grano TERMINADO ⇒ para un grano del estante siempre está vacío, y
 *  `cataInicial` es texto libre multilínea (no parseable a 2 chips). Usamos
 *  `country` + `varietal`, lo único estructurado que existe hoy y lo que el
 *  `BeanTile` del escritorio ya pinta como dos pills. */
function beanChips(b: CoffeeBean): string[] {
  return [b.country, b.varietal].map((s) => (s ?? "").trim()).filter(Boolean).slice(0, 2);
}

export function BrewSetupView({ draft, onChange, onBack, onNext }: {
  draft: BrewDraft;
  onChange: (patch: Partial<BrewDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: beans = [] } = useCoffeeBeans();
  const { data: recipes = [] } = useCoffeeRecipes();
  const { data: sessions = [] } = useBrewSessions();

  // "Tu estante" = criterio de la Bodega del escritorio (activos y no borrados).
  // OJO: el `BrewView` viejo filtraba solo `!deletedAt` y listaba terminados.
  // La regla vive en `lib/coffeeStock.ts` y es UNA sola: acá se usa, no se copia
  // (la copia inline se desincronizaba con el router del flujo).
  const shelf = activeBeans(beans);
  const generalRecipes = recipes.filter((r) => !r.baseRecipeId && !r.deletedAt);

  const bean = shelf.find((b) => b.id === draft.beanId) ?? null;
  const general = generalRecipes.find((r) => r.id === draft.generalRecipeId) ?? null;
  // Receta EFECTIVA de esta pantalla: la específica del grano si existe. El
  // ajuste (`lastTweak`) se aplica en la pantalla siguiente, no acá.
  const effective = beanSpecificFor(recipes, general, bean?.id ?? null) ?? general;

  const water = waterFor(effective, draft.doseGrams);
  const cups = cupsToday(sessions);
  const cupsPct = Math.min(100, (cups / CUPS_GOAL_PER_DAY) * 100);
  const banner = restingBanner(shelf);

  function pickBean(b: CoffeeBean) {
    // Solo se guarda el id: la receta efectiva y el agua se DERIVAN. Si el
    // usuario no tocó el stepper, la dosis se re-siembra con el ajuste del
    // grano nuevo — recordando la que se pisa, que es a la que vuelve el toggle
    // "Dosis" de la pantalla `tweak` al apagarse.
    const seeded = draft.doseTouched
      ? null
      : snapDose(b.lastTweak?.doseGrams ?? draft.doseGrams);
    onChange({
      beanId: b.id,
      ...(seeded != null && seeded !== draft.doseGrams
        ? { doseGrams: seeded, doseBeforeTweak: draft.doseGrams }
        : {}),
    });
  }

  function bumpDose(dir: number) {
    onChange({ doseGrams: snapDose(draft.doseGrams + dir * DOSE_STEP), doseTouched: true });
  }

  const canStart = !!bean && !!effective;

  return (
    <div className="m-screen m-screen--sunken">
      <div
        className="m-scroll m-scroll--flush m-scroll--top-safe"
        style={{ "--m-scroll-pt": "16px", "--m-scroll-pb": "18px", "--m-scroll-gap": "14px" } as CSSProperties}
      >
        {/* ── encabezado + anillo de tazas del día ── */}
        <div className="m-brew-head">
          {/* TODO(P5 · decide el usuario): el diseño 1i no tiene botón de volver.
              Sin esto la Bodega queda inalcanzable desde acá (la nav no cambia
              de pantalla dentro del tab). */}
          <button type="button" className="m-brew-back" onClick={onBack} aria-label="Volver a la bodega">‹</button>
          <div className="m-brew-head-titles">
            <div className="m-brew-eyebrow">Tu estante</div>
            <div className="m-brew-title">Elegí el grano</div>
          </div>
          <div className="m-brew-ring m-brew-ring--52" style={ring("var(--c-peach-fg)", cupsPct)}>
            <div className="m-brew-ring-in m-brew-cups">{cups}/{CUPS_GOAL_PER_DAY}</div>
          </div>
        </div>

        {/* ── estante horizontal (única excepción al "un solo scroller") ── */}
        {shelf.length === 0 ? (
          <div className="m-empty">No hay café en la bodega. Se cargan desde el escritorio.</div>
        ) : (
          <div className="m-brew-shelf">
            {shelf.map((b) => {
              const st = freshnessStatus(b.roastedOn);
              const color = FRESHNESS_COLOR[st];
              const chips = beanChips(b);
              const sel = b.id === draft.beanId;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`m-brew-bean${sel ? " is-selected" : ""}`}
                  onClick={() => pickBean(b)}
                >
                  <div className="m-brew-bean-top">
                    <div className="m-brew-ring m-brew-ring--44" style={ring(color, freshnessPct(b.roastedOn))}>
                      <div className="m-brew-ring-in m-brew-bean-emoji">🫘</div>
                    </div>
                    <div className="m-brew-bean-stat">
                      <div className="m-brew-bean-weight m-mono">{Math.round(b.weightGrams)} g</div>
                      <div className="m-brew-bean-fresh" style={{ color }}>{FRESHNESS_LABEL[st]}</div>
                    </div>
                  </div>
                  <div>
                    <div className="m-brew-bean-name">{b.name}</div>
                    <div className="m-brew-bean-meta">
                      {[b.roaster, b.process].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {chips.length > 0 && (
                    <div className="m-brew-bean-chips">
                      {chips.map((c, i) => (
                        <span key={c} className={`m-brew-chip m-brew-chip--${i === 0 ? "peach" : "pink"}`}>{c}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── card "Preparar <grano>" ── */}
        <div className="m-brew-prep">
          <div className="m-brew-prep-head">
            <div className="m-label m-brew-prep-title">
              {bean ? `Preparar ${bean.name}` : "Elegí un grano del estante"}
            </div>
            {water > 0 && <span className="m-brew-prep-water m-mono">{water} g agua</span>}
          </div>

          <div className="m-brew-prep-block">
            <div className="m-label">Receta</div>
            {generalRecipes.length === 0 && (
              <div className="m-empty">No hay recetas de café. Se crean en el escritorio.</div>
            )}
            {generalRecipes.map((r) => {
              const shown = beanSpecificFor(recipes, r, bean?.id ?? null) ?? r;
              const active = draft.generalRecipeId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`m-brew-recipe-opt${active ? " is-active" : ""}`}
                  onClick={() => onChange({ generalRecipeId: r.id })}
                >
                  <span className="m-brew-recipe-radio">{active ? "✓" : ""}</span>
                  <span className="m-brew-recipe-txt">
                    <span className="m-brew-recipe-name">{r.name}</span>
                    <span className="m-brew-recipe-meta m-mono">{recipeMeta(shown)}</span>
                  </span>
                  {/* Receta ajustada por la AI para este grano: el escritorio lo
                      marca y el flujo la usa de verdad ⇒ no puede quedar invisible. */}
                  {shown.id !== r.id && <span className="m-brew-recipe-badge">✨</span>}
                </button>
              );
            })}
          </div>

          {/* ── anillo de dosis + stepper ── */}
          <div className="m-brew-dose-row">
            <div
              className="m-brew-ring m-brew-ring--104"
              style={ring("var(--c-peach-fg)", Math.min(100, (draft.doseGrams / DOSE_RING_MAX) * 100))}
            >
              <div className="m-brew-ring-in">
                <div>
                  <div className="m-brew-dose-big m-mono">{draft.doseGrams.toFixed(1)}</div>
                  <div className="m-brew-dose-cap">g de café</div>
                </div>
              </div>
            </div>
            <div className="m-brew-dose-side">
              <div className="m-label">Peso del café</div>
              <div className="m-brew-dose-stepper">
                <button
                  type="button"
                  className="m-brew-dose-btn"
                  disabled={draft.doseGrams <= DOSE_MIN}
                  onClick={() => bumpDose(-1)}
                >−</button>
                <div className="m-brew-dose-value m-mono">{draft.doseGrams.toFixed(1)} g</div>
                <button
                  type="button"
                  className="m-brew-dose-btn"
                  disabled={draft.doseGrams >= DOSE_MAX}
                  onClick={() => bumpDose(1)}
                >+</button>
              </div>
              <div className="m-brew-dose-water">
                Agua <b className="m-mono">{water} g</b>
                {effective && effective.ratio > 0 ? ` · 1:${effective.ratio}` : ""}
              </div>
            </div>
          </div>

          <button type="button" className="m-brew-cta" disabled={!canStart} onClick={onNext}>
            Empezar brew con la balanza
          </button>
        </div>

        {/* ── banner de frescura ── */}
        {banner && (
          <div className="m-brew-fresh-banner">
            <span className="m-brew-fresh-icon">☕</span>
            <div className="m-brew-fresh-txt">
              <div className="m-brew-fresh-title">
                {banner.daysLeft === 0
                  ? `${banner.name} ya entra en rango`
                  : `${banner.name} entra en rango en ${banner.daysLeft} día${banner.daysLeft === 1 ? "" : "s"}`}
              </div>
              <div className="m-brew-fresh-sub">Tostado el {fmtDayMonth(banner.roastedOn)} · descansando</div>
            </div>
          </div>
        )}

        <div className="m-scroll-tail" />
      </div>
    </div>
  );
}
