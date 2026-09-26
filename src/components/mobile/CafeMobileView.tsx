import { useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { activeBeans } from "../../lib/coffeeStock";
import { useCoffeeBeans, useCoffeeRecipes } from "../../lib/queries";
import { useApp, type CafeScreen } from "../../lib/store";
import { BrewConnectView } from "./BrewConnectView";
import { BrewSetupView } from "./BrewSetupView";
import { BrewTweakView } from "./BrewTweakView";
import { BrewView } from "./BrewView";
import { CafeBodegaView } from "./CafeBodegaView";
import {
  applyTweak, beanSpecificFor, emptyDraft, snapDose, useCafeDevices,
  type BrewDraft, type BrewSnapshot,
} from "./cafeFlow";
import type { MobileScreenProps } from "./shell";

/* ═══════════════════════════════════════════════════════════════════════════
   CONTRATO DEL FLUJO DE CAFÉ (mobile) — lo mantiene el agente de 1i.
   1g (bodega) y 1h (brew en vivo) programan contra esto.
   Tipos y helpers: `cafeFlow.ts`. Contrato de la shell: `shell.ts`.
   ═══════════════════════════════════════════════════════════════════════════

   ── 1. Las seis pantallas ──────────────────────────────────────────────────

     bodega (1g) → elegir (1i) → tweak → conexion → brew (1h) → finish

   El estado de pantalla es `cafeScreen` en `lib/store.ts` (Zustand). Este
   componente es el ÚNICO que lo rutea; nadie más lo lee para decidir qué
   renderizar. Cambiar de pantalla = `setCafeScreen(...)`, y para las
   transiciones del flujo se usan los callbacks que este componente pasa a cada
   hija (`onNext` / `onBack` / `onContinue` / `onDone`), nunca `setCafeScreen`
   desde adentro de una hija.

   `tweak` se SALTEA cuando el grano no tiene `lastTweak` (mismo criterio que el
   `confirmRecipe()` del BrewView viejo).

   ── 2. El borrador (`BrewDraft`) — qué viaja entre pantallas ───────────────

   Vive acá, en `useState`. NO va al store (es estado local del flujo) y NO se
   persiste. Campos (ver `cafeFlow.ts`):

     beanId          string | null   grano elegido en 1i
     generalRecipeId string | null   receta GENERAL elegida en 1i
     doseGrams       number          dosis DECLARADA por el stepper (0,5 g, 8–40)
     doseTouched     boolean         el usuario movió el stepper a mano
     doseBeforeTweak number | null   dosis previa a que la del ajuste la pisara
     apply           TweakApply      qué variables del `lastTweak` se aplican
     applyFor        string | null   grano cuyos toggles describe `apply`

   **Se guarda el id de la receta GENERAL, nunca la receta resuelta.** La receta
   efectiva se DERIVA en cada render, en dos pasos:

     baseRecipe      = beanSpecificFor(recipes, general, beanId) ?? general
     effectiveRecipe = applyTweak(baseRecipe, bean.lastTweak, draft.apply)

   Si se guardara la receta ya resuelta (como hacía `setSelectedRecipe`), cambiar
   de grano dejaría pegada la receta ajustada del grano ANTERIOR.

   La derivación vale hasta `conexion`. Al entrar al brew la receta efectiva y el
   grano se CONGELAN en un `BrewSnapshot` (ver §4): el brew en vivo no puede
   colgar de un lookup de react-query.

   El grano se busca con `activeBeans()` (`lib/coffeeStock.ts`), la MISMA regla
   que la bodega y el estante de 1i: ni borrado ni terminado. Con `!deletedAt`
   solo, un grano que `consumeCoffeeBean` auto-marcó terminado al llegar a 0 g
   desaparecía del estante pero el router lo seguía resolviendo.

   Agua = `waterFor(effectiveRecipe, doseGrams)` = `round(ratio × dosis)`.
   `CoffeeRecipe.ratio` es un campo real; no se deriva de nada.

   ── 3. Quién es dueño del BLE ──────────────────────────────────────────────

   `src/lib/ble.ts` es un singleton de módulo (un solo `notifUnlisten`, una sola
   conexión): dos suscriptores se pisan. Por eso:

     · `useCafeDevices()` se instancia UNA sola vez, ACÁ. Este componente no se
       desmonta nunca (la shell oculta el tab con `hidden`).
     · Las pantallas reciben el objeto `CafeDevices` por props.
     · NINGUNA pantalla del flujo importa `lib/ble.ts` directamente. 1g y 1h
       tampoco: si 1h necesita `sendTare`/`sendStartTimer` (comandos sueltos, sin
       suscripción) los puede llamar, pero conectar / desconectar / suscribir va
       siempre por `CafeDevices`.
     · `elegir` y `tweak` NO tocan el BLE. El scan se dispara en `conexion`.
     · `scanForScales` bloquea 8 s (y hasta ~20 s más si Android pide permisos):
       `devices.startScan()` es fire-and-forget, nunca se `await`-ea.

   ── 4. La compuerta ────────────────────────────────────────────────────────

   No se entra a `brew` sin pasar por `conexion`: el "Continuar" de la pantalla
   de conexión CONGELA `{ bean, recipe efectiva, doseGrams }` en `brewSnapshot`
   (`BrewSnapshot` de `cafeFlow.ts`). Ese snapshot ES la compuerta: si
   `cafeScreen` llega a `brew`/`finish` sin él, este componente rebota a
   `elegir`. Se limpia al terminar/descartar el brew.

   El snapshot no es sólo una compuerta: mientras el brew corre, `BrewView` NO
   depende de que las queries de granos/recetas sigan resolviendo el borrador.
   Sin él, descontar el stock (que puede marcar el grano terminado), un pull de
   sync o una edición de la receta desmontaban `BrewView` a mitad de brew (tara,
   timer y datapoints perdidos) o le movían los objetivos y el agua guardada.

   ── 5. Ciclo de vida del brew ──────────────────────────────────────────────

   `BrewView` se MONTA al entrar a `brew` ⇒ montarlo ES arrancar el brew
   (tara + precalentado + reset de contadores en su efecto de montaje). Sus dos
   fases internas (`brewing` / `finish`) se reflejan en `cafeScreen` vía
   `onPhaseChange`. Al guardar llama `onDone()`: se limpia el borrador, se apaga
   `brewSnapshot` y se vuelve a `bodega`.

   El tab Café NUNCA se desmonta: desmontarlo cortaría la suscripción BLE y
   perdería el brew en curso (timer + datapoints están en estado de `BrewView`).

   **Si se cae la balanza a mitad de brew** (decisión del usuario, 2026-08-16):
   NO se reconecta desde el brew. `BrewView` mira el pico de peso contra
   `BREW_HAS_WATER_G` (`cafeFlow.ts`):
     · ya había agua ⇒ se queda en `brew` sin balanza: el cronómetro y el avance
       de pasos por tiempo siguen, pero la sesión se DESCARTA (no se escriben
       `BrewSession` ni datapoints; sí el stock y el `lastTweak`).
     · todavía no había agua ⇒ `onAbort()` ⇒ `abortBrew()`: se tira el snapshot
       y se vuelve a `conexion` (la única pantalla con scan) conservando el
       borrador. Es el único camino que sale del brew sin pasar por `finish`.

   ── 6. FAB ─────────────────────────────────────────────────────────────────

   Este componente expone `onFab` (contrato de `shell.ts`): brew nuevo ⇒ borrador
   limpio + `elegir`. Con un brew en curso (`brew`/`finish`) el FAB NO hace nada
   (perdería la sesión sin guardar).

   ── 7. TODOs abiertos (decide el usuario) ──────────────────────────────────

   · P5/P7 · Volver atrás: el diseño de 1i no tiene botón de volver. Agregué uno
     (‹) porque si no la Bodega queda inalcanzable desde el flujo. El botón
     FÍSICO de Android no está cableado a nada todavía.
   · Al volver al tab con un brew corriendo se entra a la pantalla donde estaba
     (`cafeScreen` es estado global) — no está definido si debería ser así.
   · La dosis pasó de MEDIDA (balanza) a DECLARADA (stepper): lo que se guarda en
     `brew_sessions.dose_grams` y en `lastTweak` es ahora la intención, no lo real.
   ═══════════════════════════════════════════════════════════════════════════ */

export function CafeMobileView({ ref }: MobileScreenProps) {
  const cafeScreen = useApp((s) => s.cafeScreen);
  const setCafeScreen = useApp((s) => s.setCafeScreen);

  const { data: beans = [] } = useCoffeeBeans();
  const { data: recipes = [] } = useCoffeeRecipes();

  const [draft, setDraft] = useState<BrewDraft>(emptyDraft);
  // Congelado al armar el brew (§4). `null` = no hay brew en curso.
  const [brewSnapshot, setBrewSnapshot] = useState<BrewSnapshot | null>(null);

  // Dueño ÚNICO del BLE en mobile (ver §3 arriba).
  const devices = useCafeDevices();

  const patchDraft = useCallback((patch: Partial<BrewDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  // ── derivaciones del borrador ────────────────────────────────────────────
  // MISMA regla que la bodega y el estante de 1i: `activeBeans` (ni borrado ni
  // terminado). Es la única definición: no se re-filtra a mano acá.
  const bean = useMemo(
    () => activeBeans(beans).find((b) => b.id === draft.beanId) ?? null,
    [beans, draft.beanId],
  );
  const general = useMemo(
    () => recipes.find((r) => r.id === draft.generalRecipeId && !r.deletedAt) ?? null,
    [recipes, draft.generalRecipeId],
  );
  const baseRecipe = useMemo(
    () => beanSpecificFor(recipes, general, bean?.id ?? null) ?? general,
    [recipes, general, bean],
  );
  const effectiveRecipe = useMemo(
    () => (baseRecipe ? applyTweak(baseRecipe, bean?.lastTweak ?? null, draft.apply) : null),
    [baseRecipe, bean, draft.apply],
  );

  const hasTweak = !!bean?.lastTweak;

  // ── navegación del flujo ─────────────────────────────────────────────────
  const startNewBrew = useCallback(() => {
    setDraft(emptyDraft());
    setBrewSnapshot(null);
    setCafeScreen("elegir");
  }, [setCafeScreen]);

  const leaveSetup = useCallback(() => {
    // 1i → tweak si el grano tiene ajuste guardado; si no, directo a conexión.
    // La dosis del ajuste ya sembró el stepper en 1i; el toggle "Dosis" arranca
    // apagado si el usuario lo movió a mano (si no le borraríamos su elección).
    //
    // Los toggles se siembran UNA vez por grano (`applyFor`): antes esto corría
    // en CADA transición elegir→tweak, así que volver con ‹ y entrar de nuevo
    // borraba sin aviso lo que el usuario había apagado.
    if (hasTweak && bean) {
      if (draft.applyFor !== bean.id) {
        patchDraft({
          apply: { grind: true, temp: true, dose: !draft.doseTouched, water: true },
          applyFor: bean.id,
        });
      }
      setCafeScreen("tweak");
    } else {
      setCafeScreen("conexion");
    }
  }, [hasTweak, bean, draft.applyFor, draft.doseTouched, patchDraft, setCafeScreen]);

  // COMPUERTA: congela grano + receta efectiva + dosis (§4). De acá en adelante
  // el brew no vuelve a mirar las queries.
  const armBrew = useCallback(() => {
    if (!bean || !effectiveRecipe) return;
    setBrewSnapshot({ bean, recipe: effectiveRecipe, doseGrams: draft.doseGrams });
    setCafeScreen("brew");
  }, [bean, effectiveRecipe, draft.doseGrams, setCafeScreen]);

  const finishBrew = useCallback(() => {
    setBrewSnapshot(null);
    setDraft(emptyDraft());
    setCafeScreen("bodega");
  }, [setCafeScreen]);

  // Se cayó la balanza ANTES de que hubiera agua (`BREW_HAS_WATER_G`): no hay
  // brew que salvar ⇒ se descarta el snapshot y se vuelve a `conexion`, que es
  // la única pantalla con scan. El BORRADOR se conserva (grano, receta, dosis,
  // toggles): el usuario reconecta y toca "Continuar" de nuevo, sin re-elegir
  // nada. La pava NO se toca: sigue conectada y calentando, y `BrewConnectView`
  // le re-manda la temperatura al montarse.
  const abortBrew = useCallback(() => {
    setBrewSnapshot(null);
    setCafeScreen("conexion");
  }, [setCafeScreen]);

  const onBrewPhase = useCallback((p: "brewing" | "finish") => {
    setCafeScreen(p === "finish" ? "finish" : "brew");
  }, [setCafeScreen]);

  // Al elegir grano en 1i, sembrar la dosis con el último ajuste (si el usuario
  // no tocó el stepper). Lo hace `BrewSetupView` al tildar; esto cubre el caso
  // de entrar con un `beanId` ya puesto (ej. desde la Bodega, 1g).
  useEffect(() => {
    if (!bean || draft.doseTouched) return;
    const t = bean.lastTweak?.doseGrams;
    if (t == null) return;
    const seeded = snapDose(t);
    // Se recuerda la dosis que se pisa: es a la que vuelve el toggle "Dosis"
    // de la pantalla `tweak` cuando se APAGA.
    setDraft((d) => (
      d.doseGrams === seeded ? d : { ...d, doseGrams: seeded, doseBeforeTweak: d.doseGrams }
    ));
  }, [bean, draft.doseTouched]);

  // ── compuerta + pantallas imposibles ─────────────────────────────────────
  // Qué pantalla se puede mostrar de verdad con el borrador que hay.
  let screen: CafeScreen = cafeScreen;
  // El brew SOLO depende del snapshot: si acá se mirara `effectiveRecipe` (que
  // se deriva de las queries), un refetch podría desmontar el brew en curso.
  if ((screen === "brew" || screen === "finish") && !brewSnapshot) screen = "elegir";
  if (screen === "conexion" && !(effectiveRecipe && bean)) screen = "elegir";
  if (screen === "tweak" && !(hasTweak && baseRecipe && bean)) {
    screen = effectiveRecipe && bean ? "conexion" : "elegir";
  }

  useEffect(() => {
    if (screen !== cafeScreen) setCafeScreen(screen);
  }, [screen, cafeScreen, setCafeScreen]);

  useImperativeHandle(ref, () => ({
    onFab: () => {
      // Con un brew en curso el FAB no descarta la sesión.
      if (cafeScreen === "brew" || cafeScreen === "finish") return;
      startNewBrew();
    },
  }), [cafeScreen, startNewBrew]);

  // ── render ───────────────────────────────────────────────────────────────
  if (screen === "elegir") {
    return (
      <BrewSetupView
        draft={draft}
        onChange={patchDraft}
        onBack={() => setCafeScreen("bodega")}
        onNext={leaveSetup}
      />
    );
  }

  if (screen === "tweak" && bean && baseRecipe) {
    return (
      <BrewTweakView
        bean={bean}
        recipe={baseRecipe}
        draft={draft}
        onChange={patchDraft}
        onBack={() => setCafeScreen("elegir")}
        onNext={() => setCafeScreen("conexion")}
      />
    );
  }

  if (screen === "conexion" && effectiveRecipe && bean) {
    return (
      <BrewConnectView
        bean={bean}
        recipe={effectiveRecipe}
        doseGrams={draft.doseGrams}
        devices={devices}
        onBack={() => setCafeScreen(hasTweak ? "tweak" : "elegir")}
        onContinue={armBrew}
      />
    );
  }

  if ((screen === "brew" || screen === "finish") && brewSnapshot) {
    // `.m-screen--legacy`: `BrewView` todavía maneja su propio alto y su propio
    // scroll. El modificador se borra cuando 1h lo migre al contrato de la shell.
    //
    // Todo lo que consume el brew sale del SNAPSHOT congelado en `armBrew`
    // (§4): grano, receta efectiva y dosis no cambian mientras dure el brew.
    return (
      <div className="m-screen m-screen--legacy">
        <BrewView
          bean={brewSnapshot.bean}
          recipe={brewSnapshot.recipe}
          doseGrams={brewSnapshot.doseGrams}
          devices={devices}
          onPhaseChange={onBrewPhase}
          onDone={finishBrew}
          onAbort={abortBrew}
        />
      </div>
    );
  }

  // ── bodega (1g) ──────────────────────────────────────────────────────────
  // Pantalla de entrada del tab. Es de sólo lectura y no navega: el brew nuevo
  // lo arranca el FAB de la nav (`onFab` ⇒ `startNewBrew`).
  return <CafeBodegaView />;
}
