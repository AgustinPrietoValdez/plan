import { DEFAULT_RULES, formatRule } from "../lib/recurrence";
import type { RecurrenceRule } from "../types";
import { IRecurring } from "./icons";

const WEEKDAYS = [
  { value: 0, label: "S", title: "Sunday" },
  { value: 1, label: "M", title: "Monday" },
  { value: 2, label: "T", title: "Tuesday" },
  { value: 3, label: "W", title: "Wednesday" },
  { value: 4, label: "T", title: "Thursday" },
  { value: 5, label: "F", title: "Friday" },
  { value: 6, label: "S", title: "Saturday" },
];

interface Props {
  value: RecurrenceRule | null;
  onChange: (next: RecurrenceRule | null) => void;
}

export function RecurrencePicker({ value, onChange }: Props) {
  const enabled = value !== null;
  const kind = value?.kind ?? null;

  const setKind = (k: RecurrenceRule["kind"]) => {
    onChange(DEFAULT_RULES[k]);
  };

  const toggleWeekday = (day: number) => {
    if (!value || value.kind !== "weekly") return;
    const has = value.weekdays.includes(day);
    const next = has ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day];
    onChange({ ...value, weekdays: next.sort((a, b) => a - b) });
  };

  const setInterval = (n: number) => {
    if (!value) return;
    const safe = Math.max(1, Math.floor(n) || 1);
    onChange({ ...value, interval: safe });
  };

  const setDayOfMonth = (n: number) => {
    if (!value || value.kind !== "monthly") return;
    const safe = Math.max(1, Math.min(31, Math.floor(n) || 1));
    onChange({ ...value, dayOfMonth: safe });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span
          className={`pill-select ${enabled ? "active" : ""}`}
          onClick={() => onChange(enabled ? null : DEFAULT_RULES.daily)}
        >
          <IRecurring size={11} stroke={2} /> {enabled ? "Repeats" : "Doesn't repeat"}
        </span>
        {enabled && (
          <>
            <span
              className={`pill-select ${kind === "daily" ? "active" : ""}`}
              onClick={() => setKind("daily")}
            >
              Daily
            </span>
            <span
              className={`pill-select ${kind === "weekly" ? "active" : ""}`}
              onClick={() => setKind("weekly")}
            >
              Weekly
            </span>
            <span
              className={`pill-select ${kind === "monthly" ? "active" : ""}`}
              onClick={() => setKind("monthly")}
            >
              Monthly
            </span>
          </>
        )}
      </div>

      {enabled && value && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "var(--bg-sunken)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "8px 10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
              }}
            >
              Every
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={value.interval}
              onChange={(e) => setInterval(parseInt(e.target.value, 10))}
              style={{
                width: 56,
                border: "1px solid var(--line)",
                background: "var(--bg-elev)",
                borderRadius: 5,
                padding: "3px 6px",
                fontSize: 12,
                fontFamily: "inherit",
                fontVariantNumeric: "tabular-nums",
                outline: 0,
                textAlign: "right",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              {value.kind === "daily" && (value.interval === 1 ? "day" : "days")}
              {value.kind === "weekly" && (value.interval === 1 ? "week" : "weeks")}
              {value.kind === "monthly" && (value.interval === 1 ? "month" : "months")}
            </span>
          </div>

          {value.kind === "weekly" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  fontWeight: 600,
                  marginRight: 4,
                }}
              >
                On
              </span>
              {WEEKDAYS.map((w) => {
                const active = value.weekdays.includes(w.value);
                return (
                  <button
                    key={w.value}
                    type="button"
                    title={w.title}
                    onClick={() => toggleWeekday(w.value)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
                      background: active ? "var(--accent)" : "var(--bg-elev)",
                      color: active ? "white" : "var(--fg-muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          )}

          {value.kind === "monthly" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  fontWeight: 600,
                }}
              >
                On day
              </span>
              <input
                type="number"
                min={1}
                max={31}
                step={1}
                value={value.dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value, 10))}
                style={{
                  width: 56,
                  border: "1px solid var(--line)",
                  background: "var(--bg-elev)",
                  borderRadius: 5,
                  padding: "3px 6px",
                  fontSize: 12,
                  fontFamily: "inherit",
                  fontVariantNumeric: "tabular-nums",
                  outline: 0,
                  textAlign: "right",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                (clamps to last day in shorter months)
              </span>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>{formatRule(value)}</div>
        </div>
      )}
    </div>
  );
}
