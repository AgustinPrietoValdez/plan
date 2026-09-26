import { MOBILE_TABS, type MobileTab } from "./shell";

/** Bottom nav de 4 tabs + FAB central (handoff: `TabBar.dc.html`).
 *
 *  Va EN FLUJO como último hermano dentro de `.m-app` — no es `position:fixed`.
 *  Si alguien la vuelve fixed se rompe el cálculo de alto de las 6 pantallas y
 *  aparece doble padding-bottom. */
export function MobileTabBar({
  active,
  onSelect,
  onFab,
}: {
  active: MobileTab;
  onSelect: (t: MobileTab) => void;
  onFab: () => void;
}) {
  const left = MOBILE_TABS.slice(0, 2);
  const right = MOBILE_TABS.slice(2);

  return (
    <nav className="m-nav">
      {left.map((t) => (
        <TabButton key={t.id} tab={t} active={active === t.id} onSelect={onSelect} />
      ))}

      <div className="m-nav-fab-slot">
        <button className="m-nav-fab" type="button" onClick={onFab} aria-label="Agregar">
          +
        </button>
      </div>

      {right.map((t) => (
        <TabButton key={t.id} tab={t} active={active === t.id} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function TabButton({
  tab,
  active,
  onSelect,
}: {
  tab: { id: MobileTab; icon: string; label: string };
  active: boolean;
  onSelect: (t: MobileTab) => void;
}) {
  return (
    <button
      className={`m-nav-btn${active ? " is-active" : ""}`}
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(tab.id)}
    >
      <span className="m-nav-icon">{tab.icon}</span>
      <span className="m-nav-label">{tab.label}</span>
    </button>
  );
}
