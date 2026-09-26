import { useEffect, useRef, useState, type RefObject } from "react";
import { useSession } from "../../lib/auth";
import { useMaterializeRecurringExpenses } from "../../lib/materializeRecurringExpenses";
import { useTasks } from "../../lib/queries";
import { useRealtimeSync } from "../../lib/realtime";
import { useReconcileAccountBalances } from "../../lib/reconcileBalances";
import { useRollForwardRecurringTasks } from "../../lib/rollForward";
import { useApp, MOBILE_ROUTE_TTL_MS } from "../../lib/store";
import { useSyncEngine } from "../../lib/sync";
import { useComprasNotifications } from "../../lib/useComprasNotifications";
import { useEventNotifications } from "../../lib/useEventNotifications";
import { CafeMobileView } from "./CafeMobileView";
import { FinanzasMobileView } from "./FinanzasMobileView";
import { MobileModalHost } from "./MobileModalHost";
import { MobileTabBar } from "./MobileTabBar";
import { PlanDelDiaView } from "./PlanDelDiaView";
import { ShoppingListView } from "./ShoppingListView";
import type { MobileScreenHandle, MobileTab } from "./shell";

/** Shell de la app mobile (Tauri Android).
 *
 *  Estructura: `.m-app` = flex column, 100dvh, overflow hidden.
 *    [ .m-slot × 4 ]      ← las 4 pantallas; la activa visible, el resto `hidden`
 *    [ .m-notif-banner ]  ← opcional
 *    [ .m-nav ]           ← bottom nav + FAB, EN FLUJO (no fixed)
 *  + `MobileModalHost` (modales, `position:fixed`).
 *
 *  El contrato que cumplen las 4 pantallas está en `shell.ts`. Esta shell NO
 *  dibuja headers: cada pantalla trae el suyo.
 *
 *  Montaje: una pantalla se monta la primera vez que se la visita y se queda
 *  montada (oculta con `hidden`). Desmontar Café cortaría la suscripción BLE y
 *  perdería el brew en curso.
 *
 *  Rutas externas (widget de Android): la shell solo consume
 *  `pendingMobileRoute` del store. El punto de entrada único es
 *  `useApp.getState().requestMobileRoute(route)` — ver `lib/store.ts`.
 */
export function MobileApp() {
  const { session } = useSession();
  useSyncEngine(session?.user.id);
  useRealtimeSync(session?.user.id);
  const { needsPermission, enableNotifications } = useComprasNotifications();
  useEventNotifications();
  // ══ HOOKS DE MANTENIMIENTO ════════════════════════════════════════════════
  // Decisión del usuario (2026-08-16): el teléfono es CLIENTE COMPLETO, o sea
  // que también ESCRIBE. Sin esto, las tareas recurrentes no ruedan y los
  // gastos recurrentes no se materializan mientras el usuario solo abra el
  // celular — y eso lo ven directo 1c (Plan) y 1d (Finanzas).
  //
  // Corren en los dos lados a la vez sin duplicar porque las instancias de
  // recurrencia ahora se crean con un id ESTABLE derivado de (cadena, día)
  // — `lib/recurrenceInstanceId.ts` — en vez de un uuid random. Dos
  // dispositivos que ruedan el mismo día generan el mismo id, así que la
  // segunda escritura pisa a la primera en vez de sumar una fila.
  //
  // NO se montan los seeds (`useSeedDefaultCategories`,
  // `useSeedDefaultExpenseCategories`) ni `useExternalChangesPoller`: el usuario
  // pidió el roll-forward y la materialización, no aquéllos.
  //
  // `useReconcileAccountBalances` SÍ va, y es consecuencia directa de montar
  // `useMaterializeRecurringExpenses`: materializar un gasto TOCA EL SALDO de la
  // cuenta, y ese ajuste no es transaccional con el INSERT del gasto (ver el
  // comentario largo en `createExpense`, en `lib/repo/local.ts`). El reconcile
  // es justamente el que recalcula el saldo desde el ledger y repara la deriva.
  // Dejar que el celular escriba gastos sin montarlo era abrir el agujero sin
  // poner el parche que ya existe.
  const tasksQ = useTasks();
  useRollForwardRecurringTasks(tasksQ.data, Boolean(session?.user.id) && tasksQ.isSuccess);
  useMaterializeRecurringExpenses(session?.user.id);
  useReconcileAccountBalances(session?.user.id);

  const mobileTab = useApp((s) => s.mobileTab);
  const setMobileTab = useApp((s) => s.setMobileTab);
  const setCafeScreen = useApp((s) => s.setCafeScreen);

  // Un handle por tab. El FAB de la nav llama al `onFab` de la pantalla activa;
  // si esa pantalla no expone ninguno, cae al default del tab (abajo).
  const planRef = useRef<MobileScreenHandle | null>(null);
  const finRef = useRef<MobileScreenHandle | null>(null);
  const comprasRef = useRef<MobileScreenHandle | null>(null);
  const cafeRef = useRef<MobileScreenHandle | null>(null);
  const handles: Record<MobileTab, RefObject<MobileScreenHandle | null>> = {
    plan: planRef,
    fin: finRef,
    compras: comprasRef,
    cafe: cafeRef,
  };

  // Montar al primer uso; nunca desmontar.
  //
  // Se DERIVA en render (no en un efecto): con `useEffect` el primer toque de
  // un tab pintaba un frame con los 4 slots en `hidden` — pantalla en blanco —
  // y en esa ventana el FAB era no-op porque el handle todavía no existía.
  // Ajustar estado durante el render es el patrón que React documenta para
  // esto: re-renderiza antes de pintar, así que el frame vacío no llega nunca.
  const [mounted, setMounted] = useState<MobileTab[]>(() => [mobileTab]);
  const mountedNow = mounted.includes(mobileTab) ? mounted : [...mounted, mobileTab];
  if (mountedNow !== mounted) setMounted(mountedNow);

  // ── ruta pedida desde afuera (widget de Android) ──────────────────────────
  // UN SOLO camino: el lector del intent (`useAndroidWidgetRoute`, en
  // `lib/useEventNotifications.ts`) retira la ruta de nativo con
  // `take_pending_mobile_route` — al montar y en cada `visibilitychange`/
  // `focus` — y llama `requestMobileRoute(...)`. La shell solo consume el
  // store; no hay prop de arranque (sería un segundo camino para lo mismo).
  const pendingRoute = useApp((s) => s.pendingMobileRoute);
  const consumeMobileRoute = useApp((s) => s.consumeMobileRoute);
  const expireMobileRoute = useApp((s) => s.expireMobileRoute);

  // Se aplica UNA vez por `token` (contador del store), NO por identidad del
  // objeto: el puente nativo puede devolver el mismo objeto dos veces y el
  // segundo tap se ignoraba en silencio. Tampoco se re-aplica en cada render ni
  // pisa la navegación que el usuario haga después.
  const appliedToken = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingRoute || appliedToken.current === pendingRoute.token) return;
    appliedToken.current = pendingRoute.token;

    // Ruta vieja (la app estuvo dormida entre el pedido y el render): se tira.
    if (Date.now() - pendingRoute.requestedAt > MOBILE_ROUTE_TTL_MS) {
      expireMobileRoute(pendingRoute.token);
      return;
    }

    setMobileTab(pendingRoute.tab);

    if (!pendingRoute.openEventId) {
      consumeMobileRoute();
      return;
    }
    // El destino DENTRO del tab lo resuelve la pantalla, no la shell: 1c lee
    // `pendingMobileRoute`, abre el evento y llama `consumeMobileRoute()`.
    // Si NADIE la consume (pantalla destino todavía no implementada), la
    // tiramos al vencer el TTL: sin esto la ruta queda parqueada para siempre y
    // el primer mount de la pantalla destino —quizá días después— abriría un
    // evento pedido hace días.
    const token = pendingRoute.token;
    const id = window.setTimeout(() => expireMobileRoute(token), MOBILE_ROUTE_TTL_MS);
    return () => window.clearTimeout(id);
  }, [pendingRoute, setMobileTab, consumeMobileRoute, expireMobileRoute]);

  /** FAB de la nav. Primero le pregunta a la pantalla activa (`onFab` del
   *  handle); si no expone ninguno, cae al default del tab.
   *
   *  Quién lo implementa hoy:
   *    plan    → handle de 1c (menú Tarea / Evento → sheets mobile; hoy stub)
   *    fin     → handle de 1d (bottom-sheet mobile de gasto; hoy stub)
   *    compras → handle de 1j (abre el `AddSheet`, que ya funciona)
   *    cafe    → default de la shell: arranca brew nuevo ⇒ pantalla "elegir" */
  const onFab = () => {
    const custom = handles[mobileTab].current?.onFab;
    if (custom) {
      custom();
      return;
    }
    if (mobileTab === "cafe") {
      // Fallback: `CafeMobileView` YA rutea por `cafeScreen` y expone su propio
      // `onFab` (arranca brew nuevo con borrador limpio). Se llega acá sólo si
      // todavía no montó su handle ⇒ dejamos el estado en "elegir".
      setCafeScreen("elegir");
    }
    // plan / fin / compras: la pantalla es dueña de su FAB. Si se llega acá es
    // que todavía no montó su handle ⇒ no hacemos nada (nunca un default que
    // el diseño no pidió).
  };

  return (
    <div className="m-app">
      {/* Decisión del usuario (2026-08-16): `RecipesView` (recetas de COMIDA) y
          el tab "Tickets" quedan FUERA de la nav por ahora — se rediseñan
          después. `RecipesView.tsx` y sus clases CSS NO se borran: siguen en el
          repo, sin entrada, esperando ese rediseño.
          (Recetas e Historial de CAFÉ son solo desktop: tampoco entran acá.) */}
      {mountedNow.includes("plan") && (
        <div className="m-slot" hidden={mobileTab !== "plan"}>
          <PlanDelDiaView ref={planRef} />
        </div>
      )}
      {mountedNow.includes("fin") && (
        <div className="m-slot" hidden={mobileTab !== "fin"}>
          <FinanzasMobileView ref={finRef} />
        </div>
      )}
      {mountedNow.includes("compras") && (
        <div className="m-slot" hidden={mobileTab !== "compras"}>
          <ShoppingListView ref={comprasRef} />
        </div>
      )}
      {mountedNow.includes("cafe") && (
        <div className="m-slot" hidden={mobileTab !== "cafe"}>
          <CafeMobileView ref={cafeRef} />
        </div>
      )}

      {/* TODO(P4 · decide el usuario): el banner de permiso de notificaciones
          vivía debajo del header global, que ya no existe. Queda acá, pegado
          arriba de la nav, hasta que el diseño diga dónde va. */}
      {needsPermission && (
        <button className="m-notif-banner" type="button" onClick={() => void enableNotifications()}>
          Tocá para activar las notificaciones
        </button>
      )}

      <MobileTabBar active={mobileTab} onSelect={setMobileTab} onFab={onFab} />

      <MobileModalHost />
    </div>
  );
}
