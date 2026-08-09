import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { ICheck, IChevD, IPlus, IX } from "./icons";

/* Reusable searchable single-select for DESKTOP MODALS (`.modal`).
 *
 * Two things drive most of the implementation here:
 *
 * 1. Modals scale through the `--home-s` custom property (see the comment block
 *    at components.css:764). Every hardcoded px below therefore goes through
 *    `s()`. The dropdown is portalled to <body> so `.modal { overflow: hidden }`
 *    / `.modal-body { overflow: auto }` can't clip it — which means it loses the
 *    inherited `--home-s`, so we read the computed value off the trigger and
 *    re-declare it on the portal root.
 * 2. Host modals commonly *save* on backdrop mousedown (ExpenseEditor.tsx:223).
 *    A click that leaks out of this component would close and save the record,
 *    so every pointer event inside the trigger and the panel is stopped.
 */

const s = (n: number) => `calc(var(--home-s, 1) * ${n}px)`;

/** Case- and accent-insensitive fold — the data is Spanish ("Café", "Salmón"). */
const fold = (v: string) =>
  v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const stop = (e: SyntheticEvent) => e.stopPropagation();

interface PanelPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  scale: number;
}

export interface EntityPickerProps<T> {
  items: T[];
  value: string | null;                  // selected id
  onChange: (id: string | null) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string | null;   // shown dimmed on the right of a row
  placeholder?: string;
  allowCreate?: boolean;
  onCreate?: (name: string) => Promise<string>;  // returns the new id; picker then selects it
  autoFocus?: boolean;
  disabled?: boolean;
  emptyHint?: string;                    // shown when items is empty
}

export function EntityPicker<T>({
  items,
  value,
  onChange,
  getId,
  getLabel,
  getSublabel,
  placeholder = "Seleccionar…",
  allowCreate = false,
  onCreate,
  autoFocus = false,
  disabled = false,
  emptyHint = "No hay opciones todavía.",
}: EntityPickerProps<T>): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => items.find((it) => getId(it) === value) ?? null,
    [items, value, getId],
  );

  const q = query.trim();
  const filtered = useMemo(() => {
    if (!q) return items;
    const needle = fold(q);
    return items.filter((it) => fold(getLabel(it)).includes(needle));
  }, [items, q, getLabel]);

  const canCreate = Boolean(onCreate) && allowCreate;
  // Exact match is compared folded too, so typing "cafe" won't offer to create a
  // duplicate of an existing "Café".
  const showCreateRow =
    canCreate && q !== "" && !items.some((it) => fold(getLabel(it)) === fold(q));
  const createIndex = filtered.length;
  const rowCount = filtered.length + (showCreateRow ? 1 : 0);

  // An empty list with `allowCreate` still needs the search box (that's the only
  // way to type the first merchant), so the hint replaces the box only when
  // there is genuinely nothing the user can do with it.
  const showSearch = items.length > 0 || canCreate;

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const raw = Number.parseFloat(getComputedStyle(el).getPropertyValue("--home-s"));
    const scale = Number.isFinite(raw) && raw > 0 ? raw : 1;
    const gap = 4 * scale;
    const margin = 12 * scale;
    const desired = 280 * scale;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const flipUp = below < Math.min(desired, 180 * scale) && above > below;
    setPos({
      left: r.left,
      width: r.width,
      top: flipUp ? undefined : r.bottom + gap,
      bottom: flipUp ? window.innerHeight - r.top + gap : undefined,
      maxHeight: Math.max(120 * scale, Math.min(desired, flipUp ? above : below)),
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

  // Close on outside pointerdown. Pointer events inside the trigger/panel are
  // stopped before they reach the document, but the containment check keeps this
  // correct regardless.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the highlighted row visible.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [open, highlight, query, rowCount]);

  const openPicker = () => {
    if (disabled) return;
    setQuery("");
    setError(null);
    const idx = value === null ? 0 : Math.max(0, items.findIndex((it) => getId(it) === value));
    setHighlight(idx);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setError(null);
  };

  const pick = (item: T) => {
    onChange(getId(item));
    close();
    triggerRef.current?.focus();
  };

  const create = async () => {
    const name = query.trim();
    if (!onCreate || !name || creating) return;   // guards double-submit
    setCreating(true);
    setError(null);
    try {
      const id = await onCreate(name);
      onChange(id);
      setCreating(false);
      close();
      triggerRef.current?.focus();
    } catch (err) {
      setCreating(false);
      setError(err instanceof Error ? err.message : "No se pudo crear");
    }
  };

  const commit = (idx: number) => {
    if (idx < filtered.length) {
      const item = filtered[idx];
      if (item !== undefined) pick(item);
      return;
    }
    if (showCreateRow) void create();
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (rowCount === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + delta + rowCount) % rowCount);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();   // host modals save on Enter
      commit(highlight);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();   // host modals close on Escape
      close();
      triggerRef.current?.focus();
    }
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || open) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      openPicker();
    }
  };

  const rowStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: s(8),
    padding: `${s(6)} ${s(8)}`,
    borderRadius: s(6),
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    fontSize: s(13),
    color: "var(--fg)",
    lineHeight: 1.35,
  });

  const panel =
    open && pos ? (
      <div
        ref={panelRef}
        role="listbox"
        style={
          {
            "--home-s": String(pos.scale),
            position: "fixed",
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: pos.maxHeight,
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            gap: s(6),
            padding: s(6),
            background: "var(--bg-elev)",
            border: "1px solid var(--line)",
            borderRadius: s(8),
            boxShadow: "var(--shadow-md)",
            fontFamily: "inherit",
          } as CSSProperties
        }
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
      >
        {showSearch ? (
          <input
            ref={inputRef}
            className="input"
            type="text"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onSearchKeyDown}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              width: "100%",
              flex: "0 0 auto",
              boxSizing: "border-box",
              border: `1px solid ${searchFocused ? "var(--accent)" : "var(--line)"}`,
              boxShadow: searchFocused ? `0 0 0 ${s(3)} var(--accent-soft)` : "none",
              background: "var(--bg-elev)",
              color: "var(--fg)",
              borderRadius: s(6),
              padding: `${s(6)} ${s(8)}`,
              fontSize: s(13),
              fontFamily: "inherit",
              outline: 0,
            }}
          />
        ) : (
          <div style={{ padding: `${s(8)} ${s(8)}`, fontSize: s(12.5), color: "var(--fg-muted)" }}>
            {emptyHint}
          </div>
        )}

        {showSearch && (
          <div
            ref={listRef}
            style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: s(2) }}
          >
            {items.length === 0 && (
              <div style={{ padding: `${s(6)} ${s(8)}`, fontSize: s(12), color: "var(--fg-subtle)" }}>
                {emptyHint}
              </div>
            )}

            {filtered.map((item, idx) => {
              const id = getId(item);
              const isSelected = id === value;
              const sub = getSublabel ? getSublabel(item) : null;
              return (
                <div
                  key={id}
                  role="option"
                  aria-selected={isSelected}
                  data-idx={idx}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => e.preventDefault()}   // keep focus in the search box
                  onClick={() => pick(item)}
                  style={rowStyle(idx === highlight)}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getLabel(item)}
                  </span>
                  {sub ? (
                    <span style={{ flex: "0 0 auto", fontSize: s(11.5), color: "var(--fg-subtle)" }}>
                      {sub}
                    </span>
                  ) : null}
                  {isSelected ? (
                    <ICheck
                      size={12}
                      style={{ width: s(12), height: s(12), flex: "0 0 auto", color: "var(--accent)" }}
                    />
                  ) : null}
                </div>
              );
            })}

            {items.length > 0 && filtered.length === 0 && !showCreateRow && (
              <div style={{ padding: `${s(6)} ${s(8)}`, fontSize: s(12), color: "var(--fg-subtle)" }}>
                Sin resultados
              </div>
            )}

            {showCreateRow && (
              <div
                role="option"
                aria-selected={false}
                data-idx={createIndex}
                onMouseEnter={() => setHighlight(createIndex)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void create()}
                style={{
                  ...rowStyle(highlight === createIndex),
                  color: "var(--accent)",
                  cursor: creating ? "progress" : "pointer",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                <IPlus size={12} style={{ width: s(12), height: s(12), flex: "0 0 auto" }} />
                <span
                  style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {creating ? "Creando…" : `Crear «${q}»`}
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: `0 ${s(8)} ${s(4)}`, fontSize: s(11.5), color: "var(--danger)" }}>
            {error}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else openPicker();
        }}
        onKeyDown={onTriggerKeyDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: s(6),
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          border: `1px solid ${open ? "var(--accent)" : "var(--line)"}`,
          boxShadow: open ? `0 0 0 ${s(3)} var(--accent-soft)` : "none",
          background: "var(--bg-elev)",
          borderRadius: s(6),
          padding: `${s(6)} ${s(8)}`,
          fontSize: s(13),
          lineHeight: 1.35,
          color: selected ? "var(--fg)" : "var(--fg-subtle)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          userSelect: "none",
          outline: 0,
        }}
      >
        <span
          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {selected ? getLabel(selected) : placeholder}
        </span>
        {selected && !disabled ? (
          <span
            role="button"
            aria-label="Quitar selección"
            title="Quitar selección"
            onPointerDown={stop}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              close();
            }}
            style={{
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
              color: "var(--fg-subtle)",
              cursor: "pointer",
            }}
          >
            <IX size={11} style={{ width: s(11), height: s(11) }} />
          </span>
        ) : null}
        <IChevD
          size={12}
          style={{ width: s(12), height: s(12), flex: "0 0 auto", color: "var(--fg-muted)" }}
        />
      </div>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
