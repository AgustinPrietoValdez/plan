import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
// 500 y 700 reales: el diseño mobile pone TODOS los números grandes en mono
// 500/700 (36px, 62px, 21px…). Sin estos pesos el navegador los sintetiza
// (falsa negrita) y se ven sucios.
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/mobile.css";
import App from "./App";
import { MobileApp } from "./components/mobile/MobileApp";
import { AuthGate } from "./components/auth/AuthGate";

const isMobile =
  /android/i.test(navigator.userAgent) ||
  new URLSearchParams(window.location.search).has("mobile");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        {/* Rutas del widget de Android: NO se pasan por prop. El lector del
            intent es `useAndroidWidgetRoute` (en `lib/useEventNotifications.ts`),
            que retira la ruta de nativo (`take_pending_mobile_route`) al montar
            y en cada `visibilitychange`/`focus`, y llama
            `useApp.getState().requestMobileRoute(route)`. Un solo camino, sirve
            con la app cerrada y con la app ya abierta. Ver `src/lib/store.ts`. */}
        {isMobile ? <MobileApp /> : <App />}
      </AuthGate>
    </QueryClientProvider>
  </React.StrictMode>,
);
