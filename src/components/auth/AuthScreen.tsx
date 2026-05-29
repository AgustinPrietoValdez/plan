import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

type Mode = "signin" | "signup";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && !data.session) {
          setInfo("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const onMagicLink = async () => {
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setInfo("Magic link sent — check your inbox.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: "100%",
          background: "var(--bg-elev)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="brand-mark">P</div>
          <span style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em" }}>
            Plan
          </span>
        </div>

        <div className="seg" style={{ alignSelf: "stretch" }}>
          <button
            type="button"
            className={mode === "signin" ? "active" : ""}
            style={{ flex: 1 }}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            style={{ flex: 1 }}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
              }}
            >
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              style={{
                border: "1px solid var(--line)",
                background: "var(--bg-elev)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                outline: 0,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
              }}
            >
              Password
            </span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                border: "1px solid var(--line)",
                background: "var(--bg-elev)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                outline: 0,
              }}
            />
          </label>

          {error && (
            <div
              style={{
                fontSize: 12,
                color: "var(--danger)",
                background: "oklch(0.95 0.04 25)",
                padding: "6px 8px",
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}
          {info && (
            <div
              style={{
                fontSize: 12,
                color: "var(--ok)",
                background: "oklch(0.95 0.05 155)",
                padding: "6px 8px",
                borderRadius: 6,
              }}
            >
              {info}
            </div>
          )}

          <button type="submit" className="btn primary" disabled={busy} style={{ marginTop: 4 }}>
            {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>

        <button type="button" className="btn" onClick={onMagicLink} disabled={busy}>
          Send magic link
        </button>
      </div>
    </div>
  );
}
