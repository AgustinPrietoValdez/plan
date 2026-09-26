import type { CSSProperties } from "react";
import type { CoffeeBean, CoffeeRecipe } from "../../types";
import { snapDose, waterFor, type BrewDraft, type TweakApply } from "./cafeFlow";

/* Café · Último ajuste (pantalla propia del flujo mobile).
 *
 * Es la fase `tweak` que vivía dentro de `BrewView` (toggles por variable del
 * `lastTweak` del grano), MOVIDA a su propia pantalla. El usuario la pidió
 * explícitamente: sin ella los ajustes se guardan al terminar el brew y no se
 * leen nunca.
 *
 * Diferencia con el `BrewView` viejo: acá NO se muta la receta. Los toggles
 * viven en `draft.apply` y la receta efectiva se DERIVA en `CafeMobileView`
 * (`applyTweak`), así cambiar de grano no deja pegado el ajuste del anterior.
 *
 * La dosis ya se eligió en 1i (stepper). El toggle "Dosis" sigue existiendo:
 * encendido pisa el stepper con la dosis del ajuste y APAGADO la restaura
 * (`draft.doseBeforeTweak`). Arranca APAGADO si el usuario movió el stepper a
 * mano (si no, le borraríamos lo que acaba de elegir) — el resto arranca
 * encendido, como antes.
 *
 * Los toggles NO se re-siembran al volver a esta pantalla: `CafeMobileView` los
 * inicializa una vez por grano (`draft.applyFor`). */

export function BrewTweakView({ bean, recipe, draft, onChange, onBack, onNext }: {
  bean: CoffeeBean;
  /** Receta base ya resuelta a la específica del grano (sin el ajuste aplicado). */
  recipe: CoffeeRecipe;
  draft: BrewDraft;
  onChange: (patch: Partial<BrewDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = bean.lastTweak;

  const rows: { key: keyof TweakApply; label: string; val: string }[] = [];
  if (t?.grindSize) rows.push({ key: "grind", label: "Molienda", val: t.grindSize });
  if (t?.tempCelsius != null) rows.push({ key: "temp", label: "Temperatura", val: `${t.tempCelsius}°C` });
  if (t?.doseGrams != null) rows.push({ key: "dose", label: "Dosis", val: `${t.doseGrams} g` });
  if (t?.totalWaterGrams && t?.doseGrams) {
    rows.push({
      key: "water",
      label: "Agua / ratio",
      val: `${t.totalWaterGrams} g (1:${(t.totalWaterGrams / t.doseGrams).toFixed(1)})`,
    });
  }

  function toggle(key: keyof TweakApply) {
    const apply = { ...draft.apply, [key]: !draft.apply[key] };
    // "Dosis" es la única que además toca el borrador: encendida pisa el
    // stepper de 1i con la dosis del ajuste, APAGADA la restaura. Antes apagarla
    // no restauraba nada ⇒ "omitir" dejaba exactamente el mismo número que
    // "usar" y el toggle era inerte.
    const patch: Partial<BrewDraft> = { apply };
    if (key === "dose" && t?.doseGrams != null) {
      if (apply.dose) {
        patch.doseBeforeTweak = draft.doseGrams;
        patch.doseGrams = snapDose(t.doseGrams);
        patch.doseTouched = false;
      } else if (draft.doseBeforeTweak != null) {
        patch.doseGrams = draft.doseBeforeTweak;
        patch.doseBeforeTweak = null;
        // Omitir la dosis del ajuste es una elección explícita: se marca como
        // tocada para que el sembrado de `CafeMobileView` no vuelva a pisarla.
        patch.doseTouched = true;
      }
    }
    onChange(patch);
  }

  // Preview de lo que va a salir con los toggles como están.
  const previewRatio = draft.apply.water && t?.totalWaterGrams && t?.doseGrams
    ? Math.round((t.totalWaterGrams / t.doseGrams) * 100) / 100
    : recipe.ratio;
  const previewTemp = draft.apply.temp && t?.tempCelsius != null ? t.tempCelsius : recipe.tempCelsius;
  const previewWater = waterFor({ ...recipe, ratio: previewRatio }, draft.doseGrams);

  return (
    <div className="m-screen">
      <header className="m-scr-head">
        <div className="m-scr-head-row">
          <button type="button" className="m-brew-back" onClick={onBack} aria-label="Volver">‹</button>
          <div className="m-scr-titles">
            <div className="m-scr-title">Último ajuste</div>
            <div className="m-scr-sub">{bean.name} · {recipe.name}</div>
          </div>
        </div>
      </header>

      <div
        className="m-scroll"
        style={{ "--m-scroll-pt": "14px", "--m-scroll-gap": "12px" } as CSSProperties}
      >
        <div className="m-brew-tweak-lead">
          Elegí qué variables del último ajuste aplicar a este brew.
        </div>

        {rows.length === 0 && (
          <div className="m-brew-tweak-lead">El último ajuste no tiene variables, solo notas.</div>
        )}

        {rows.map((r) => {
          const on = draft.apply[r.key];
          return (
            <button
              key={r.key}
              type="button"
              className={`m-brew-tweak-row${on ? " is-on" : ""}`}
              onClick={() => toggle(r.key)}
            >
              <span className="m-brew-tweak-txt">
                <span className="m-brew-tweak-label">{r.label}</span>
                <span className="m-brew-tweak-val">{r.val}</span>
              </span>
              <span className="m-brew-tweak-flag">{on ? "usar ✓" : "omitir"}</span>
            </button>
          );
        })}

        {t?.notes && (
          <div className="m-brew-tweak-notes">
            <div className="m-label">Notas del ajuste</div>
            <div>{t.notes}</div>
          </div>
        )}

        <div className="m-brew-tweak-preview">
          <div className="m-label">Con estos ajustes</div>
          <div className="m-mono">
            {draft.doseGrams.toFixed(1)} g · {previewWater} g agua
            {previewRatio > 0 ? ` · 1:${previewRatio}` : ""}
            {previewTemp > 0 ? ` · ${previewTemp}°C` : ""}
          </div>
        </div>

        <div className="m-scroll-tail" />
      </div>

      <div className="m-brew-footer">
        <button type="button" className="m-brew-cta" onClick={onNext}>Siguiente →</button>
      </div>
    </div>
  );
}
