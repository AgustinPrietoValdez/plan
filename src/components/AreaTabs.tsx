import { AREA_OF_VIEW, CALENDARIO_TABS, useApp } from "../lib/store";

/** Sub-tab bar shown inside an area. Today only the Calendario area has tabs
 *  (día/semana/mes/proyectos/hábitos/recurrentes). Plain number keys 1..N
 *  select these (wired in App.tsx); Shift+1..4 switches area. */
export function AreaTabs() {
  const { view, setView } = useApp();
  const area = AREA_OF_VIEW[view];
  if (area !== "calendario") return null;

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 2,
        padding: "6px 16px",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg-elev)",
        overflowX: "auto",
      }}
    >
      {CALENDARIO_TABS.map((t, i) => {
        const active = view === t.view;
        return (
          <button
            key={t.view}
            role="tab"
            aria-selected={active}
            onClick={() => setView(t.view)}
            title={`${t.label} (${i + 1})`}
            style={{
              appearance: "none",
              border: "none",
              background: active ? "var(--bg-sunken)" : "transparent",
              color: active ? "var(--fg)" : "var(--fg-muted)",
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              padding: "5px 11px",
              borderRadius: 7,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
