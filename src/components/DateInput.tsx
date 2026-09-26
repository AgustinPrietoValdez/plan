import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { DOW_MINI_ES, MONTH_LONG_ES, getMonthGrid, todayYmd, ymd } from "../lib/date";
import { ICal, IChevL, IChevR } from "./icons";

// Native <input type="date"> renders its displayed text (not just the picker)
// according to the OS/WebView locale, which we don't control — on this
// machine's WebView2 that's always mm/dd/yyyy regardless of the page's `lang`.
// So the text half is a plain masked text input: the display format (dd/mm/yyyy)
// is guaranteed independent of locale. Value/onChange still use ISO "yyyy-mm-dd"
// so callers don't need to change how they store dates.
//
// Dropping the native input also dropped its calendar popup, so the button next
// to the field opens our own. Two things drive that half's implementation, both
// the same as EntityPicker.tsx:
//
// 1. Modals scale through `--home-s` (see components.css:764), so every
//    hardcoded px goes through `s()`. The panel is portalled to <body> so
//    `.modal { overflow: hidden }` can't clip it — which loses the inherited
//    `--home-s`, hence re-declaring it on the portal root from the measured value.
// 2. Host modals commonly *save* on backdrop mousedown (ExpenseEditor.tsx:223)
//    and close on Escape, so every pointer/key event inside is stopped.

const s = (n: number) => `calc(var(--home-s, 1) * ${n}px)`;

const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Panel width at scale 1: 7 columns of 30px + padding. */
const PANEL_W = 238;

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string | null {
  const match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Number(y), month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function maskInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

/** First of the month to open on: the current value, else today. */
function monthOf(iso: string): Date {
  const [y, m] = iso.split("-").map(Number);
  if (y && m) return new Date(y, m - 1, 1);
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), 1);
}

interface PanelPos {
  left: number;
  top?: number;
  bottom?: number;
  scale: number;
}

export function DateInput({
  value,
  onChange,
  className,
  style,
  placeholder = "dd/mm/aaaa",
}: {
  value: string;
  onChange: (isoValue: string) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [viewMonth, setViewMonth] = useState<Date>(() => monthOf(value));

  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const raw = Number.parseFloat(getComputedStyle(el).getPropertyValue("--home-s"));
    const scale = Number.isFinite(raw) && raw > 0 ? raw : 1;
    const gap = 4 * scale;
    const margin = 12 * scale;
    const height = 268 * scale;
    const width = PANEL_W * scale;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const flipUp = below < height && above > below;
    setPos({
      // Keep the panel on screen when the field sits near the right edge.
      left: Math.max(margin, Math.min(r.left, window.innerWidth - width - margin)),
      top: flipUp ? undefined : r.bottom + gap,
      bottom: flipUp ? window.innerHeight - r.top + gap : undefined,
      scale,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onReflow = () => measure();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, measure]);

  // Escape con el calendario abierto tiene que cerrar SOLO el calendario. Los
  // modales anfitriones (TaskEditor, ExpenseEditor, EventEditor…) escuchan
  // Escape en `window`, y el panel no tiene nada enfocado, así que un handler
  // sobre el panel nunca vería el evento: sin esto, Escape cierra el modal
  // entero y el calendario se va con él. Se escucha en captura y se corta ahí,
  // que es la misma regla que ya usan los modales anidables de la app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openPanel = () => {
    setViewMonth(monthOf(value));
    setOpen(true);
  };

  const pick = (iso: string) => {
    onChange(iso);
    setText(isoToDisplay(iso));
    setOpen(false);
  };

  const shift = (delta: number) =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const today = todayYmd();
  const cells = getMonthGrid(viewMonth);

  const panel =
    open && pos ? (
      <div
        ref={panelRef}
        style={
          {
            "--home-s": String(pos.scale),
            position: "fixed",
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            width: s(PANEL_W),
            zIndex: 200,
            boxSizing: "border-box",
            padding: s(8),
            background: "var(--bg-elev)",
            border: "1px solid var(--line)",
            borderRadius: s(8),
            boxShadow: "var(--shadow-md)",
            fontFamily: "inherit",
            color: "var(--fg)",
          } as CSSProperties
        }
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: s(4),
            marginBottom: s(6),
          }}
        >
          <NavBtn label="Mes anterior" onClick={() => shift(-1)}>
            <IChevL size={12} style={{ width: s(12), height: s(12) }} />
          </NavBtn>
          <span style={{ fontSize: s(12.5), fontWeight: 600, textTransform: "capitalize" }}>
            {MONTH_LONG_ES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </span>
          <NavBtn label="Mes siguiente" onClick={() => shift(1)}>
            <IChevR size={12} style={{ width: s(12), height: s(12) }} />
          </NavBtn>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: s(1),
            fontSize: s(11),
          }}
        >
          {DOW_MINI_ES.map((d, i) => (
            <div
              key={i}
              style={{ textAlign: "center", color: "var(--fg-subtle)", fontWeight: 500, padding: `${s(2)} 0` }}
            >
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const iso = ymd(d);
            const other = d.getMonth() !== viewMonth.getMonth();
            const isToday = iso === today;
            const isSelected = iso === value;
            return (
              <div
                key={iso}
                role="button"
                title={iso}
                onClick={() => pick(iso)}
                style={{
                  textAlign: "center",
                  padding: `${s(4)} 0`,
                  borderRadius: s(4),
                  cursor: "pointer",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: isToday || isSelected ? 600 : 400,
                  opacity: other && !isSelected ? 0.6 : 1,
                  background: isSelected ? "var(--fg)" : "transparent",
                  color: isSelected
                    ? "var(--bg)"
                    : isToday
                      ? "var(--accent)"
                      : other
                        ? "var(--fg-subtle)"
                        : "var(--fg)",
                }}
              >
                {d.getDate()}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: s(6) }}>
          <button
            type="button"
            onClick={() => pick(today)}
            style={{
              border: "1px solid var(--line)",
              background: "var(--bg-elev)",
              color: "var(--fg-muted)",
              borderRadius: s(6),
              padding: `${s(4)} ${s(12)}`,
              fontSize: s(11.5),
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Hoy
          </button>
        </div>
      </div>
    ) : null;

  return (
    <span
      ref={wrapRef}
      style={{ display: "inline-flex", alignItems: "center", gap: s(4), minWidth: 0, maxWidth: "100%" }}
    >
      <input
        type="text"
        inputMode="numeric"
        className={className}
        style={style}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const masked = maskInput(e.target.value);
          setText(masked);
          if (masked === "") {
            onChange("");
            return;
          }
          const iso = displayToIso(masked);
          if (iso) onChange(iso);
        }}
        onBlur={() => setText(isoToDisplay(value))}
      />
      <button
        type="button"
        aria-label="Abrir calendario"
        title="Abrir calendario"
        aria-expanded={open}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openPanel();
        }}
        style={{
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          width: s(26),
          height: s(26),
          border: `1px solid ${open ? "var(--accent)" : "var(--line)"}`,
          borderRadius: s(6),
          background: "var(--bg-elev)",
          color: open ? "var(--accent)" : "var(--fg-muted)",
          cursor: "pointer",
        }}
      >
        <ICal size={14} style={{ width: s(14), height: s(14) }} />
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </span>
  );
}

function NavBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: "grid",
        placeItems: "center",
        width: s(20),
        height: s(20),
        border: 0,
        borderRadius: s(4),
        background: "transparent",
        color: "var(--fg-subtle)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
