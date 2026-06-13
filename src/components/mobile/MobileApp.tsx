import { useState } from "react";
import { signOut, useSession } from "../../lib/auth";
import { useRealtimeSync } from "../../lib/realtime";
import { useSyncEngine } from "../../lib/sync";
import { useComprasNotifications } from "../../lib/useComprasNotifications";
import { ShoppingListView } from "./ShoppingListView";
import { RecipesView } from "./RecipesView";
import { BrewView } from "./BrewView";

type Tab = "list" | "recipes" | "cafe" | "receipts";

const TITLES: Record<Tab, string> = {
  list: "Lista de la compra",
  recipes: "Recetas",
  cafe: "Café",
  receipts: "Tickets",
};

export function MobileApp() {
  const { session } = useSession();
  useSyncEngine(session?.user.id);
  useRealtimeSync(session?.user.id);
  const { needsPermission, enableNotifications } = useComprasNotifications();

  const [tab, setTab] = useState<Tab>("list");

  return (
    <div className="m-app">
      <header className="m-header">
        <h1 className="m-title">{TITLES[tab]}</h1>
        <button className="m-signout" type="button" onClick={() => void signOut()}>
          Salir
        </button>
      </header>

      {needsPermission && (
        <button className="m-notif-banner" type="button" onClick={() => void enableNotifications()}>
          Tocá para activar las notificaciones
        </button>
      )}

      <main className="m-main">
        {tab === "list" ? (
          <ShoppingListView />
        ) : tab === "recipes" ? (
          <RecipesView />
        ) : tab === "cafe" ? (
          <BrewView />
        ) : (
          <p className="m-empty">Próximamente: cargá un ticket y completá los precios.</p>
        )}
      </main>

      <nav className="m-tabs">
        <button
          className={`m-tab${tab === "list" ? " is-active" : ""}`}
          type="button"
          onClick={() => setTab("list")}
        >
          Lista
        </button>
        <button
          className={`m-tab${tab === "recipes" ? " is-active" : ""}`}
          type="button"
          onClick={() => setTab("recipes")}
        >
          Recetas
        </button>
        <button
          className={`m-tab${tab === "cafe" ? " is-active" : ""}`}
          type="button"
          onClick={() => setTab("cafe")}
        >
          Café
        </button>
        <button
          className="m-tab is-disabled"
          type="button"
          disabled
          title="Próximamente"
        >
          Tickets
        </button>
      </nav>
    </div>
  );
}
