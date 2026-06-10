/** Café area placeholder. The real module (bean tracking, brew recipes, kettle
 *  + scale control) lands in Fase 6. The scale BLE protocol is already scouted
 *  in COFFEE_SCALE_SPIKE.md. */
export function CafeView() {
  return (
    <div className="day-view-main" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header style={{ paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-subtle)", fontWeight: 600 }}>
          Café
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Próximamente
        </div>
      </header>
      <div style={{ paddingTop: 24, color: "var(--fg-subtle)", fontSize: 13, maxWidth: 560, lineHeight: 1.5 }}>
        El módulo de café llega en una fase próxima: inventario de granos (frescura 3 a 6 semanas),
        recetas por tipo de café, y control de pava + balanza Bookoo Themis Ultra.
      </div>
    </div>
  );
}
