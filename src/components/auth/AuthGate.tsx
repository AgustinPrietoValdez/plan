import type { ReactNode } from "react";
import { useSession } from "../../lib/auth";
import { AuthScreen } from "./AuthScreen";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "var(--fg-subtle)",
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) return <AuthScreen />;
  return <>{children}</>;
}
