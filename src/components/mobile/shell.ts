import type { Ref } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   CONTRATO DE LA SHELL MOBILE
   ═══════════════════════════════════════════════════════════════════════════

   Este archivo lo mantiene el agente de SHELL. Las 6 pantallas hijas
   (1c Plan · 1d Finanzas · 1j Compras · 1g/1i/1h Café) lo IMPORTAN y programan
   contra él; no lo editan.

   ── 1. DOM raíz de una pantalla ────────────────────────────────────────────

     <div className="m-screen">                 // root, SIEMPRE
       <header className="m-scr-head">          // OPCIONAL (flex:none)
         <div className="m-scr-head-row"> … </div>
       </header>
       <div className="m-scroll"> … </div>      // el ÚNICO scroller
     </div>

   Reglas duras:
     · `.m-screen` es flex column, flex:1, min-height:0, overflow:hidden.
       Lo pinta el CSS de la shell — la hija NO le pone alto ni fondo propio
       (para 1i existe el modificador `.m-screen--sunken`).
     · UN SOLO scroller por pantalla: `.m-scroll`. Nada adentro puede tener
       `overflow-y:auto` salvo el estante horizontal de 1i
       (`overflow-x:auto; overflow-y:hidden`).
     · PROHIBIDO en las hijas: `position:fixed` (salvo overlays/bottom-sheets,
       ver punto 5), `height:100vh/100dvh/100%` en el root, montar su propia
       bottom-nav o su propio FAB.
     · El header, si existe, va DENTRO de la hija (nunca en la shell).
     · La shell monta las 4 pantallas y oculta las inactivas con `hidden` sobre
       un wrapper `.m-slot` — la hija NO se desmonta al cambiar de tab (si Café
       se desmontara se corta la suscripción BLE y se pierde el brew en curso).

   ── 2. Padding / gap del scroller ──────────────────────────────────────────

   `.m-scroll` base = padding 16px 16px 18px, display:flex column, gap 14px.
   Se ajusta con custom props en el style de la hija (NO con clases nuevas):

     --m-scroll-pt  (default 16px)   padding-top
     --m-scroll-px  (default 16px)   padding lateral
     --m-scroll-pb  (default 18px)   padding-bottom
     --m-scroll-gap (default 14px)   gap entre bloques

   NOTA (desvío respecto del análisis): el análisis proponía un único
   `--m-scroll-pad` con el shorthand. No se puede, porque `.m-scroll--top-safe`
   necesita sumarle `env(safe-area-inset-top)` SOLO al top. Por eso son 4
   longhands.

   Valores por pantalla (del handoff):
     1c plan     : defaults + `.m-scroll--top-safe` (no tiene header)
     1d finanzas : --m-scroll-pt:18px; --m-scroll-pb:18px; --m-scroll-gap:18px
     1g bodega   : --m-scroll-pt:14px; --m-scroll-gap:12px
                   (SOLO Bodega: Historial y Recetas de café son solo desktop ⇒
                    su header NO lleva folder-tabs)
     1h brew     : --m-scroll-pt:16px; --m-scroll-pb:16px; --m-scroll-gap:13px
     1i elegir   : `.m-scroll--flush` + --m-scroll-pt:16px; --m-scroll-pb:18px;
                   --m-scroll-gap:14px + `.m-scroll--top-safe` (no tiene header)
     1j compras  : `.m-scroll--flush` (padding 0, gap 0; filas full-bleed)

   Modificadores:
     `.m-scroll--flush`     → pone los 4 longhands en 0 (después se pueden pisar)
     `.m-scroll--top-safe`  → suma env(safe-area-inset-top) al padding-top.
                              OBLIGATORIO en las pantallas SIN `.m-scr-head`
                              (1c y 1i), si no el contenido queda bajo la barra
                              de estado de Android.

   ── 3. Safe-area ───────────────────────────────────────────────────────────
     · Arriba con header  : lo resuelve `.m-scr-head`
                            (padding-top: calc(env(safe-area-inset-top) + 14px)).
     · Arriba sin header  : `.m-scroll--top-safe`.
     · Abajo              : lo resuelve `.m-nav` de la shell
                            (padding-bottom: calc(8px + env(safe-area-inset-bottom))).
       Ninguna hija agrega padding por la nav: la nav está EN FLUJO, no fixed.

   ── 4. FAB (overlap) ───────────────────────────────────────────────────────
   El FAB de 54px sube 26px + 3px de borde sobre la nav ⇒ tapa una franja
   centrada de ~32px del final del viewport de scroll. Cualquier pantalla con
   una lista larga o filas full-bleed cierra el scroller con:

       <div className="m-scroll-tail" />        // spacer flex:none de 34px

   ── 5. Overlays ────────────────────────────────────────────────────────────
   Los bottom-sheets / modales de una pantalla (ej. el `AddSheet` de 1j) se
   renderizan como hermanos de `.m-scroll` DENTRO de `.m-screen`, con
   `position:fixed` (`.m-sheet-backdrop`). Es la única excepción al punto 1.

   ── 6. Props y FAB ─────────────────────────────────────────────────────────
   Ninguna pantalla recibe datos por props: cada una lee sus hooks de
   `src/lib/queries.ts` y su estado de `useApp()`.

   La ÚNICA prop es `ref` (React 19: ref-as-prop, sin `forwardRef`). La shell
   guarda un ref por tab y, al tocar el FAB, llama `ref.current?.onFab?.()`.
   Si la pantalla activa no expone `onFab`, la shell cae a su acción default
   (ver `MobileApp.tsx`).

       export function ComprasScreen({ ref }: MobileScreenProps) {
         const [sheetOpen, setSheetOpen] = useState(false);
         useImperativeHandle(ref, () => ({ onFab: () => setSheetOpen(true) }), []);
         …
       }

   ⚠ DEPS: `useImperativeHandle` congela el closure según SUS deps. El `[]` de
   arriba es válido SOLO porque ese `onFab` no lee nada que cambie (`setSheetOpen`
   es estable). **Declará tus deps de verdad**: si tu `onFab` lee estado, props o
   datos de una query, con `[]` vas a operar sobre el valor del PRIMER render y
   el bug es silencioso. Ejemplo con dependencias reales:

       const [tab, setTab] = useState("bodega");
       const beans = useCoffeeBeans().data;
       useImperativeHandle(
         ref,
         () => ({ onFab: () => nuevoBrew(tab, beans) }),
         [tab, beans],          // ← si esto queda en [], `beans` es undefined para siempre
       );

   Alternativa sin trampa: guardá la lógica en un ref actualizado en cada render,
   o usá un handler que lea el estado desde el store en vez de capturarlo.

   Acción del FAB por tab (decisión del usuario, 2026-08-16):
     plan    → `onFab` de 1c: menú/acción corta TAREA o EVENTO y de ahí al
               bottom-sheet mobile correspondiente (sheets NUEVOS, los hace 1c).
     fin     → `onFab` de 1d: bottom-sheet mobile de carga de gasto (NUEVO —
               no se porta el `ExpenseEditor` de escritorio).
     compras → `onFab` de 1j: abre el `AddSheet`, que vive en la pantalla.
     cafe    → default de la shell: `setCafeScreen("elegir")` (brew nuevo → 1i).

   Hoy plan y fin traen un STUB de sheet para que el enganche esté probado; 1c
   y 1d lo reemplazan por el real sin tocar la shell.

   `openCompletion` / `openCreate` / `openExpenseCreate` / `openEventCreate` YA
   NO son no-ops: `MobileModalHost` los consume (ver ese archivo).

   ── 7. Mutaciones ──────────────────────────────────────────────────────────
   Patrón OUTBOX: toda mutación va por los hooks de `src/lib/queries.ts`
   (`useToggleBought`, `usePatchShoppingItem`, `useCompleteTask`, …). Nada de
   SQL directo desde una vista mobile.

   ── 8. Escalado ────────────────────────────────────────────────────────────
   `--home-s` / `fluid()` son DESKTOP-ONLY. En mobile todo va en px fijos.

   ── 9. El tab Café son SEIS pantallas, no tres ─────────────────────────────
   Decisión del usuario (2026-08-16). Estado en `cafeScreen` (`lib/store.ts`),
   contenedor en `CafeMobileView.tsx`:

     bodega (1g) → elegir (1i) → tweak → conexion → brew (1h) → finish

   · `conexion` (balanza + pava) es un paso PROPIO, DESPUÉS de elegir grano,
     receta y tweaks. Se REUBICA el scan que hoy vive en `home`/`scanning` de
     `BrewView`; no se borra. Al conectarse, la pava calienta sola y el usuario
     toca "Continuar".
   · COMPUERTA: no se entra a `brew` sin pasar por `conexion`.
   · `tweak` (último ajuste) y `finish` (steppers + café usado que descuenta
     stock + notas + cata) se MANTIENEN tal cual; se rediseñan aparte.
   · El tab Café NO se desmonta nunca (corta el BLE).

   ── 10. Abrir la app en un destino puntual (widget de Android) ──────────────
   `MobileRoute` (`lib/store.ts`) = `{ tab: MobileTab; openEventId?: string }`.

   Dos vías, un solo contrato:
     · App cerrada → `main.tsx` lee el intent y pasa `initialRoute` a
       `MobileApp` (se aplica una sola vez al montar).
     · App ya abierta (Android la trae al frente sin remontar) →
       `useApp.getState().requestMobileRoute(route)`.

   Qué hace la shell: mueve `mobileTab` a `route.tab`, UNA vez por ruta. Nada
   más. El destino DENTRO del tab lo resuelve la pantalla:
     · sin `openEventId` → la shell consume la ruta y listo;
     · con `openEventId` → la ruta queda PARQUEADA en `pendingMobileRoute`;
       1c la lee, abre el evento y llama `consumeMobileRoute()`.

   La lectura del intent de Android la hace el agente del widget; la pantalla de
   evento, el agente de 1c. La shell no elige destino.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Los 4 tabs de la bottom nav. */
export type MobileTab = "plan" | "fin" | "compras" | "cafe";

/** Lo que una pantalla le expone a la shell. Todo opcional. */
export interface MobileScreenHandle {
  /** El FAB de la nav se tocó estando esta pantalla activa. Si no se
   *  implementa, la shell ejecuta la acción default del tab. */
  onFab?: () => void;
}

/** Única prop que recibe una pantalla mobile. */
export interface MobileScreenProps {
  ref?: Ref<MobileScreenHandle>;
}

/** Orden y contenido de la bottom nav. Los emoji son los iconos (no `icons.tsx`):
 *  el handoff los pide explícitamente. El FAB va entre el índice 1 y el 2. */
export const MOBILE_TABS: { id: MobileTab; icon: string; label: string }[] = [
  { id: "plan", icon: "🏠", label: "Plan" },
  { id: "fin", icon: "💰", label: "Finanzas" },
  { id: "compras", icon: "🛒", label: "Compras" },
  { id: "cafe", icon: "☕", label: "Café" },
];
