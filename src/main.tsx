import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
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
        {isMobile ? <MobileApp /> : <App />}
      </AuthGate>
    </QueryClientProvider>
  </React.StrictMode>,
);
