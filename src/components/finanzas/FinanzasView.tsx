import { useRef, useState } from "react";
import { todayYmd } from "../../lib/date";
import { useApp, FINANZAS_TABS } from "../../lib/store";
import { useFrameScale } from "../../lib/uiScale";
import { IChevR, IPlus, IX } from "../icons";
import { BudgetView } from "../BudgetView";
import { AhorrosView, type AhorrosViewHandle } from "./AhorrosView";
import { HoldingsView, type HoldingsViewHandle } from "./HoldingsView";

// El mockup de Finanzas (como el de Home/Café) fue diseñado en un frame fijo de
// 1280×720 pensado para 2560×1440 (2×). `fluid(n)` = "n px a esa escala": se
// resuelve a `calc(var(--s) * n px)`, donde `--s` lo pone useFrameScale() en la
// raíz de FinanzasView y cascadea a todo lo de abajo — igual que CafeView.tsx.
function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

const PRIMARY_LABEL: Record<string, string> = {
  presupuesto: "Agregar gasto",
  ahorros: "Agregar objetivo",
  holdings: "Agregar cuenta",
};

export function FinanzasView() {
  const { finanzasTab: tab, setFinanzasTab, openExpenseCreate, openBudgetManager, openExpenseCategoryManager } = useApp();
  const ahorrosRef = useRef<AhorrosViewHandle>(null);
  const holdingsRef = useRef<HoldingsViewHandle>(null);
  const s = useFrameScale();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onPrimary = () => {
    if (tab === "presupuesto") openExpenseCreate({ spentOn: todayYmd() });
    else if (tab === "ahorros") ahorrosRef.current?.openCreate();
    else holdingsRef.current?.openCreate();
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", ["--s" as string]: s } as React.CSSProperties}
    >
      {/* Header + tabs */}
      <div style={{ padding: `${fluid(20)} ${fluid(20)} 0`, borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: fluid(12), marginBottom: fluid(10) }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: fluid(38), height: fluid(38), borderRadius: fluid(9), fontSize: fluid(19),
            color: "var(--c-blue-fg)", background: "var(--c-blue)", flexShrink: 0,
          }}>💰</span>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: fluid(22), fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>Finanzas</h2>
            <div style={{ fontSize: fluid(13), color: "var(--fg-muted)", marginTop: 2 }}>
              Cuentas, presupuesto y ahorro de Agus &amp; Sofi
            </div>
          </div>
          {tab === "presupuesto" && (
            <button
              className="icon-btn"
              title="Presupuestos y categorías"
              onClick={() => setSettingsOpen(true)}
              style={{ width: fluid(30), height: fluid(30), fontSize: fluid(15) }}
            >
              ⚙️
            </button>
          )}
          <button
            className="btn primary"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: fluid(12.5), padding: `${fluid(7)} ${fluid(13)}` }}
            onClick={onPrimary}
          >
            <IPlus size={13} /> {PRIMARY_LABEL[tab]}
          </button>
        </div>

        {/* Presupuesto / Ahorros / Holdings — folder tabs, como en el mockup */}
        <div style={{ display: "flex", gap: fluid(2), alignItems: "flex-end" }}>
          {FINANZAS_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <div
                key={t.id}
                role="button"
                onClick={() => setFinanzasTab(t.id)}
                style={{
                  padding: `${fluid(9)} ${fluid(16)}`, borderRadius: `${fluid(9)} ${fluid(9)} 0 0`,
                  fontSize: fluid(13), fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: fluid(7),
                  marginBottom: -1, border: "1px solid transparent", borderBottom: "none",
                  background: active ? "var(--bg-sunken)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  borderColor: active ? "var(--line)" : "transparent",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: fluid(16), height: fluid(16), fontSize: fluid(14), lineHeight: 1,
                  }}
                >
                  {t.icon}
                </span>
                {t.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content — nunca scrollea entera; el scroll vive dentro de cada tab */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: `${fluid(14)} ${fluid(20)} ${fluid(16)}` }}>
        {tab === "presupuesto" && <BudgetView />}
        {tab === "ahorros" && <AhorrosView ref={ahorrosRef} />}
        {tab === "holdings" && <HoldingsView ref={holdingsRef} />}
      </div>

      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(20,20,20,0.28)", display: "flex", justifyContent: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: fluid(320), maxWidth: "92vw", height: "100%", background: "var(--bg-elev)", borderLeft: "1px solid var(--line)",
              boxShadow: "-16px 0 48px -12px rgba(20,20,20,0.22)", display: "flex", flexDirection: "column",
            }}
          >
            <div style={{ flexShrink: 0, padding: `${fluid(18)} ${fluid(20)}`, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: fluid(10) }}>
              <span style={{ flex: 1, fontSize: fluid(15), fontWeight: 600, letterSpacing: "-0.01em" }}>Ajustes de Presupuesto</span>
              <button className="icon-btn" onClick={() => setSettingsOpen(false)}><IX size={17} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: fluid(10), display: "flex", flexDirection: "column", gap: fluid(4) }}>
              <button
                onClick={() => { setSettingsOpen(false); openBudgetManager(); }}
                style={{
                  display: "flex", alignItems: "center", gap: fluid(10), padding: `${fluid(12)} ${fluid(12)}`,
                  background: "none", border: 0, borderRadius: fluid(9), cursor: "pointer", textAlign: "left", width: "100%",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ fontSize: fluid(16) }}>📊</span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontSize: fluid(13), fontWeight: 500 }}>Presupuestos</div>
                  <div style={{ fontSize: fluid(11), color: "var(--fg-subtle)" }}>Límites mensuales por categoría</div>
                </span>
                <IChevR size={13} />
              </button>
              <button
                onClick={() => { setSettingsOpen(false); openExpenseCategoryManager(); }}
                style={{
                  display: "flex", alignItems: "center", gap: fluid(10), padding: `${fluid(12)} ${fluid(12)}`,
                  background: "none", border: 0, borderRadius: fluid(9), cursor: "pointer", textAlign: "left", width: "100%",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ fontSize: fluid(16) }}>🏷️</span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontSize: fluid(13), fontWeight: 500 }}>Categorías</div>
                  <div style={{ fontSize: fluid(11), color: "var(--fg-subtle)" }}>Crear, editar y archivar categorías de gasto</div>
                </span>
                <IChevR size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
