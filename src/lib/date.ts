export const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_MINI = ["S", "M", "T", "W", "T", "F", "S"];

export const DOW_LONG_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DOW_MINI_ES = ["D", "L", "M", "M", "J", "V", "S"];
export const MONTH_LONG_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const MONTH_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Whole calendar days between two dates, DST-safe (compares UTC-normalized
 *  midnights so a spring-forward/fall-back between them never skews the count
 *  the way dividing a raw ms difference by 86_400_000 would). */
export function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(d.getDate() - d.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

export function getMonthGrid(viewDate: Date): Date[] {
  const first = startOfMonth(viewDate);
  const start = startOfWeek(first);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(start, i));
  return days;
}

export function todayYmd(): string {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return ymd(t);
}

/** Shift a "YYYY-MM" month string by `delta` months (can be negative). */
export function shiftMonth(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  let year = y;
  let month = m + delta;
  while (month > 12) { month -= 12; year += 1; }
  while (month < 1) { month += 12; year -= 1; }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The app's week runs **Saturday → Friday** (that's when the shopping gets
 *  done). Everything week-shaped — shopping lists, the meal plan, weekly
 *  budgets — starts here, so there is exactly one definition.
 *
 *  Note `startOfWeek()` above is a *different*, Sunday-based helper used only by
 *  the calendar month grid. Don't cross the two. */
export function weekStartOf(day: string = todayYmd()): string {
  const d = fromYmd(day);
  const dow = (d.getDay() + 1) % 7; // 0 = Saturday
  d.setDate(d.getDate() - dow);
  return ymd(d);
}

/** Shift a "YYYY-MM-DD" (Saturday) week start by `deltaWeeks` weeks. */
export function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const d = fromYmd(weekStart);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return ymd(d);
}

/** "dd/mm – dd/mm" label for the week starting at `weekStart` (Saturday..Friday).
 *  Computed with real dates: the old string arithmetic (`Number(ed) - 1`) printed
 *  "00" whenever the week ended on the 1st of a month. */
export function weekLabel(weekStart: string): string {
  const start = fromYmd(weekStart);
  const end = addDays(start, 6);
  const dd = (d: Date) => String(d.getDate()).padStart(2, "0");
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, "0");
  return `${dd(start)}/${mm(start)} – ${dd(end)}/${mm(end)}`;
}

/** "11 ago" — day + short Spanish month of the Saturday a week starts on.
 *  Shorter form of `weekLabel` for headers with no room for the full range
 *  (1j Compras: "Semana del 11 ago"). Doesn't replace `weekLabel`. */
export function weekStartShortLabel(weekStart: string): string {
  const d = fromYmd(weekStart);
  return `${d.getDate()} ${MONTH_SHORT_ES[d.getMonth()]}`;
}

/** The month ("YYYY-MM") a week belongs to: the one holding **most** of its
 *  seven days. Since a week splits as k / 7-k, the majority month is always the
 *  one containing day 4 — so no week is ever counted in two months, and the
 *  weeks of a year partition cleanly across the twelve. */
export function monthOfWeek(weekStart: string): string {
  return ymd(addDays(fromYmd(weekStart), 3)).slice(0, 7);
}

/** Week starts (Saturdays) that belong to `yyyymm` under `monthOfWeek`. 4 or 5. */
export function weekStartsInMonth(yyyymm: string): string[] {
  const first = fromYmd(`${yyyymm}-01`);
  const out: string[] = [];
  // Start one week before the 1st: a week beginning in the previous month can
  // still land here (e.g. Sat 31/10 -> 6 days in November).
  let w = shiftWeek(weekStartOf(ymd(first)), -1);
  for (let i = 0; i < 8; i++) {
    if (monthOfWeek(w) === yyyymm) out.push(w);
    w = shiftWeek(w, 1);
  }
  return out;
}

/** How many weeks belong to `yyyymm` (4 or 5). The denominator for weekly budgets. */
export function weeksInMonth(yyyymm: string): number {
  return weekStartsInMonth(yyyymm).length;
}

/** ISO-ish week number (Jan 1 = start of week 1), matching Topbar's calendar-view label. */
export function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

/** "Sábado, 19 de julio · Semana 29" — Home topbar subtitle, always today's date. */
export function fmtHomeSubtitle(d: Date): string {
  return `${DOW_LONG_ES[d.getDay()]}, ${d.getDate()} de ${MONTH_LONG_ES[d.getMonth()]} · Semana ${getWeekNumber(d)}`;
}
