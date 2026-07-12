import { useEffect, useState } from "react";
import { todayYmd } from "./date";

// Vistas que calculan "hoy" solo en el render (const today = todayYmd())
// se quedan pegadas en el dia viejo si la app queda abierta pasada la
// medianoche y nada mas dispara un re-render (ver bug de habitos: si ya
// estaban todos completados ayer, el roll-forward no invalida nada).
export function useToday(): string {
  const [today, setToday] = useState(todayYmd);
  useEffect(() => {
    const check = () => {
      const now = todayYmd();
      setToday((prev) => (prev === now ? prev : now));
    };
    const id = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}
