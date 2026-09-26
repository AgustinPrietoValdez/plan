import type { CSSProperties } from "react";
import { FRESHNESS_COLOR, FRESHNESS_LABEL, daysOld, freshnessStatus } from "../../lib/coffeeFreshness";
import { activeBeans, avgFlowGs, isLowStock, lastSession, sessionRatio } from "../../lib/coffeeStock";
import { addDays, todayYmd, ymd } from "../../lib/date";
import { useBrewSessions, useCoffeeBeans } from "../../lib/queries";
import type { BrewSession, CoffeeBean } from "../../types";
import { cupsToday, fmtClock, fmtDayMonth } from "./cafeFlow";

/* 1g · Café · Bodega — pantalla de ENTRADA del tab Café.
 *
 * Contrato de la shell (`shell.ts`): root `.m-screen`, header `.m-scr-head`,
 * UN solo scroller `.m-scroll` (padding-top 14px, gap 12px según el handoff).
 * Contrato del flujo (`CafeMobileView.tsx` + `cafeFlow.ts`): esta pantalla es
 * de SOLO LECTURA — no rutea (`cafeScreen` lo maneja el padre), no toca el BLE
 * y no muta nada. El brew nuevo lo arranca el FAB de la nav (`onFab` de
 * `CafeMobileView`); por eso acá NO hay botón "Nuevo brew".
 *
 * Decisión del usuario: **sin folder-tabs**. Historial y Recetas de café son
 * sólo de escritorio.
 *
 * Prefijo CSS: `.m-cafe-*` (`.m-brew-*` es de 1i, `.m-live-*` de 1h).
 * `--home-s` / `fluid()` son DESKTOP-ONLY: nada de eso acá. */

/** Coma decimal (el diseño escribe `15,6` y `3,1`). Los enteros van sin coma. */
function dec(n: number, digits = 1): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits).replace(".", ",");
}

/** `hoy 09:12` / `ayer 09:12` / `12/08 09:12`. `createdAt` es ISO **UTC**: se
 *  compara la fecha LOCAL (un `slice(0,10)` corre el día en los brews de la
 *  noche). */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = todayYmd();
  const yesterday = ymd(addDays(new Date(), -1));
  const day = ymd(d);
  if (day === today) return `hoy ${hhmm}`;
  if (day === yesterday) return `ayer ${hhmm}`;
  return `${fmtDayMonth(day)} ${hhmm}`;
}

/** `La Cabra · tostado 26/07 · 20 días`. Los pedazos que no existen se caen
 *  (hay granos sin tostador y sin fecha de tueste). */
function beanMeta(b: CoffeeBean): string {
  const parts: string[] = [];
  if (b.roaster.trim()) parts.push(b.roaster.trim());
  if (b.roastedOn) {
    parts.push(`tostado ${fmtDayMonth(b.roastedOn)}`);
    const d = daysOld(b.roastedOn);
    if (d != null && d >= 0) parts.push(`${d} día${d === 1 ? "" : "s"}`);
  } else {
    parts.push("sin fecha de tueste");
  }
  return parts.join(" · ");
}

function BeanRow({ bean: b }: { bean: CoffeeBean }) {
  const status = freshnessStatus(b.roastedOn);
  const weight = Math.round(b.weightGrams);
  // El 0 g va en `--danger` (handoff) aunque NO cuente como "por reponer"
  // (regla del escritorio en `coffeeStock.isLowStock`). Ver TODO ahí.
  const weightCls = weight <= 0 ? " is-empty" : isLowStock(b) ? " is-low" : "";

  return (
    <div className="m-cafe-bean" style={{ "--fresh": FRESHNESS_COLOR[status] } as CSSProperties}>
      <span className="m-cafe-dot" />
      <div className="m-cafe-bean-main">
        <div className="m-cafe-bean-name">{b.name}</div>
        <div className="m-cafe-bean-meta">{beanMeta(b)}</div>
      </div>
      <div className="m-cafe-bean-right">
        <div className={`m-cafe-weight m-mono${weightCls}`}>{weight} g</div>
        <div className="m-cafe-fresh">{FRESHNESS_LABEL[status]}</div>
      </div>
    </div>
  );
}

function LastBrewCard({ session }: { session: BrewSession | null }) {
  if (!session) {
    return (
      <section className="m-card m-cafe-card" style={{ "--r": "14px" } as CSSProperties}>
        <div className="m-cafe-card-head">
          <span className="m-cafe-brew-badge">⏱</span>
          <div className="m-cafe-brew-title">Último brew</div>
        </div>
        <div className="m-cafe-hint">Todavía no guardaste ningún brew.</div>
      </section>
    );
  }

  const flow = avgFlowGs(session);
  const ratio = sessionRatio(session);
  // "V60 · Etiopía Guji · 1:16". Las sesiones capturadas por el Pi vienen con
  // `beanName`/`recipeName` vacíos ⇒ el pedazo se cae en vez de quedar " · · ".
  const summary = [session.recipeName, session.beanName, ratio ? `1:${ratio}` : ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");

  const stats: { value: string; label: string }[] = [
    { value: session.doseGrams > 0 ? dec(session.doseGrams) : "—", label: "g dosis" },
    { value: session.totalWaterGrams > 0 ? dec(session.totalWaterGrams, 0) : "—", label: "g agua" },
    { value: session.durationMs > 0 ? fmtClock(session.durationMs / 1000) : "—", label: "tiempo" },
    { value: flow != null ? dec(flow) : "—", label: "g/s" },
  ];

  return (
    <section className="m-card m-cafe-card" style={{ "--r": "14px" } as CSSProperties}>
      <div className="m-cafe-card-head">
        <span className="m-cafe-brew-badge">⏱</span>
        <div className="m-cafe-brew-title">Último brew</div>
        <span className="m-cafe-card-aside">{fmtWhen(session.createdAt)}</span>
      </div>
      <div className="m-cafe-stats">
        {stats.map((s) => (
          <div className="m-cafe-stat" key={s.label}>
            <div className="m-cafe-stat-val m-mono">{s.value}</div>
            <div className="m-cafe-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      {/* El "te salió <nota>" del diseño NO tiene fuente: `saveBrew()` nunca
          escribe `BrewSession.notes` (la nota de cierre va a `bean.lastTweak`,
          que es del GRANO). Se muestra sólo si algún día la sesión trae notas.
          TODO(usuario): ver reporte 1g. */}
      {(summary || session.notes.trim()) && (
        <div className="m-cafe-summary">
          {summary}
          {session.notes.trim() && (
            <>
              {summary ? " · " : ""}te salió <b className="m-cafe-note">{session.notes.trim()}</b>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function CafeBodegaView() {
  const { data: beans = [] } = useCoffeeBeans();
  const { data: sessions = [] } = useBrewSessions();

  // `listCoffeeBeans()` NO filtra `finished_at` ⇒ sin `activeBeans` reaparecen
  // los granos terminados (mismo criterio que el estante de 1i).
  // TODO(usuario): el orden es el del repo (`created_at ASC`); el handoff no
  // define si debería ordenarse por días de tueste o por peso restante.
  const shelf = activeBeans(beans);
  const low = shelf.filter(isLowStock);
  const cups = cupsToday(sessions);
  const last = lastSession(sessions);

  // "3 granos abiertos · 1 por reponer" (el segundo pedazo sólo si hay).
  const sub = shelf.length === 0
    ? "Sin granos abiertos"
    : `${shelf.length} grano${shelf.length === 1 ? "" : "s"} abierto${shelf.length === 1 ? "" : "s"}`
      + (low.length > 0 ? ` · ${low.length} por reponer` : "");

  // El banner del diseño nombra UN grano. Con varios se muestra el peor (el de
  // menos café); el conteo de arriba ya dice cuántos son.
  const worst = low.length > 0 ? low.reduce((a, b) => (b.weightGrams < a.weightGrams ? b : a)) : null;

  return (
    <div className="m-screen">
      <header className="m-scr-head">
        <div className="m-scr-head-row">
          <span
            className="m-scr-badge"
            style={{ "--badge-bg": "var(--c-peach)", "--badge-fg": "var(--c-peach-fg)" } as CSSProperties}
          >
            ☕
          </span>
          <div className="m-scr-titles">
            <div className="m-scr-title">Café</div>
            <div className="m-scr-sub">{sub}</div>
          </div>
          {/* Mismo criterio que el anillo de 1i: 1 sesión de hoy = 1 taza
              (`cupsToday` de `cafeFlow.ts`, helper compartido). */}
          <span className="m-scr-pill m-cafe-cups">{cups} taza{cups === 1 ? "" : "s"} hoy</span>
        </div>
      </header>

      <div
        className="m-scroll"
        style={{ "--m-scroll-pt": "14px", "--m-scroll-gap": "12px" } as CSSProperties}
      >
        <section className="m-card m-cafe-card" style={{ "--r": "14px" } as CSSProperties}>
          <div className="m-cafe-card-head">
            <div className="m-label" style={{ flex: 1 }}>En la bodega</div>
            <span className="m-cafe-card-aside">frescura · peso</span>
          </div>

          {shelf.length === 0 ? (
            <div className="m-cafe-hint">Sin granos abiertos. Cargá una bolsa desde el escritorio.</div>
          ) : (
            shelf.map((b) => <BeanRow key={b.id} bean={b} />)
          )}

          {worst && (
            <div className="m-cafe-alert">
              <span aria-hidden>⚠</span>
              <span>{worst.name}: queda poco — conviene reponer</span>
            </div>
          )}
        </section>

        <LastBrewCard session={last} />

        {/* El FAB tapa ~32px del final del scroller. */}
        <div className="m-scroll-tail" />
      </div>
    </div>
  );
}
