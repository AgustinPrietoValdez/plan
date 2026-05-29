import type { Priority } from "../types";

export function fmtDuration(min: number | null | undefined): string {
  if (!min) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function priLabel(p: Priority): string {
  return p === "high" ? "High" : p === "med" ? "Med" : "Low";
}

export function priColor(p: Priority): string {
  return p === "high" ? "var(--danger)" : p === "med" ? "var(--warn)" : "var(--ok)";
}
