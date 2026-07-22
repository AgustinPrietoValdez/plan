import { useEffect, useState } from "react";
import {
  DOW_MINI_ES,
  MONTH_LONG_ES,
  fromYmd,
  getMonthGrid,
  sameDay,
  todayYmd,
  ymd,
} from "../../lib/date";
import { colorsForHue } from "../../lib/categoryColor";
import { useApp } from "../../lib/store";
import { useCategories, useTasks } from "../../lib/queries";
import { IChevL, IChevR, IPlus } from "../icons";

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

export function CalendarContextPanel() {
  const {
    viewDate,
    setViewDate,
    selectedDay,
    setSelectedDay,
    filterCategoryId,
    setFilterCategory,
    openCategoryManager,
  } = useApp();
  const tasks = useTasks().data ?? [];
  const categories = useCategories().data ?? [];

  return (
    <aside
      className="cal-scroll"
      style={{
        width: fluid(230),
        flexShrink: 0,
        background: "var(--bg-elev)",
        borderRight: "1px solid var(--line)",
        overflowY: "auto",
        padding: `${fluid(16)} ${fluid(14)}`,
        display: "flex",
        flexDirection: "column",
        gap: fluid(18),
      }}
    >
      <MiniMonthCard
        viewDate={viewDate}
        setViewDate={setViewDate}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
        tasks={tasks}
      />

      <div>
        <div style={{ display: "flex", alignItems: "center", fontSize: fluid(11), fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-muted)", marginBottom: fluid(8) }}>
          <span style={{ flex: 1 }}>Categorías</span>
          <button
            onClick={openCategoryManager}
            title="Gestionar categorías"
            style={{ width: fluid(18), height: fluid(18), borderRadius: fluid(5), border: "none", background: "none", color: "var(--fg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IPlus size={11} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {categories.filter((c) => !c.archived).map((c) => {
            const active = filterCategoryId === c.id;
            const count = tasks.filter((t) => !t.done && t.categoryId === c.id).length;
            return (
              <div
                key={c.id}
                onClick={() => setFilterCategory(active ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: fluid(9), padding: `${fluid(6)} ${fluid(8)}`,
                  borderRadius: fluid(7), fontSize: fluid(12.5), cursor: "pointer", color: "var(--fg)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ width: fluid(8), height: fluid(8), borderRadius: "50%", flexShrink: 0, background: colorsForHue(c.hue).bg }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <span style={{ fontSize: fluid(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function MiniMonthCard({
  viewDate,
  setViewDate,
  selectedDay,
  setSelectedDay,
  tasks,
}: {
  viewDate: string;
  setViewDate: (ymd: string) => void;
  selectedDay: string;
  setSelectedDay: (ymd: string) => void;
  tasks: { day: string | null }[];
}) {
  const [miniDate, setMiniDate] = useState<Date>(() => fromYmd(viewDate));
  useEffect(() => setMiniDate(fromYmd(viewDate)), [viewDate]);

  const cells = getMonthGrid(miniDate);
  const taskDays = new Set(tasks.filter((t) => t.day !== null).map((t) => t.day as string));
  const todayKey = todayYmd();
  const selectedDate = fromYmd(selectedDay);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: fluid(10) }}>
        <span style={{ flex: 1, fontSize: fluid(13), fontWeight: 600, letterSpacing: "-0.01em" }}>
          {MONTH_LONG_ES[miniDate.getMonth()].replace(/^./, (c) => c.toUpperCase())} {miniDate.getFullYear()}
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={() => setMiniDate(new Date(miniDate.getFullYear(), miniDate.getMonth() - 1, 1))}
            style={{ width: fluid(22), height: fluid(22), borderRadius: fluid(6), border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--fg-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IChevL size={13} />
          </button>
          <button
            onClick={() => setMiniDate(new Date(miniDate.getFullYear(), miniDate.getMonth() + 1, 1))}
            style={{ width: fluid(22), height: fluid(22), borderRadius: fluid(6), border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--fg-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IChevR size={13} />
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {DOW_MINI_ES.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: fluid(9.5), fontWeight: 600, color: "var(--fg-subtle)", paddingBottom: fluid(4) }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const otherMonth = d.getMonth() !== miniDate.getMonth();
          const dayKey = ymd(d);
          const isToday = dayKey === todayKey;
          const isSelected = sameDay(d, selectedDate);
          const hasItems = taskDays.has(dayKey);
          return (
            <div
              key={i}
              onClick={() => { setSelectedDay(dayKey); setViewDate(dayKey); }}
              style={{
                position: "relative", textAlign: "center", fontSize: fluid(11), lineHeight: fluid(24), height: fluid(24),
                borderRadius: fluid(6), cursor: "pointer",
                color: isSelected ? "#fff" : otherMonth ? "var(--fg-subtle)" : isToday ? "var(--accent)" : "var(--fg)",
                fontWeight: isSelected || isToday ? 700 : 400,
                background: isSelected ? "var(--accent)" : isToday ? "var(--accent-soft)" : "transparent",
                opacity: otherMonth ? 0.55 : 1,
              }}
            >
              {d.getDate()}
              {hasItems && !isSelected && (
                <span style={{ position: "absolute", bottom: fluid(2), left: "50%", transform: "translateX(-50%)", width: fluid(3), height: fluid(3), borderRadius: "50%", background: "var(--accent)" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
