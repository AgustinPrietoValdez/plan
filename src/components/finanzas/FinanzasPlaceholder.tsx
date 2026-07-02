// Placeholder para las sub-pestanas de Finanzas que todavia no estan implementadas.
// Inversiones queda "por verse" hasta que haya inversiones / un broker.

export function FinanzasPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div
      className="day-view-main"
      style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420, color: "var(--fg-muted)" }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--fg)", marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{note}</div>
      </div>
    </div>
  );
}
