import { useEffect, useState } from "react";
import {
  DOW_MINI,
  MONTH_NAME,
  fromYmd,
  getMonthGrid,
  sameDay,
  todayYmd,
  ymd,
} from "../lib/date";
import type { Task } from "../types";
import { IChevL, IChevR } from "./icons";

interface Props {
  viewDate: string;
  setViewDate: (ymd: string) => void;
  selectedDay: string;
  setSelectedDay: (ymd: string) => void;
  tasks: Task[];
}

export function MiniMonth({ viewDate, setViewDate, selectedDay, setSelectedDay, tasks }: Props) {
  const [miniDate, setMiniDate] = useState<Date>(() => fromYmd(viewDate));

  useEffect(() => {
    setMiniDate(fromYmd(viewDate));
  }, [viewDate]);

  const cells = getMonthGrid(miniDate);
  const taskDays = new Set(
    tasks.filter((t) => t.day !== null).map((t) => t.day as string),
  );
  const todayKey = todayYmd();
  const selectedDate = fromYmd(selectedDay);

  return (
    <div className="mini-month">
      <div className="mini-head">
        <span>
          {MONTH_NAME[miniDate.getMonth()]} {miniDate.getFullYear()}
        </span>
        <div className="nav">
          <button
            onClick={() =>
              setMiniDate(new Date(miniDate.getFullYear(), miniDate.getMonth() - 1, 1))
            }
          >
            <IChevL size={13} />
          </button>
          <button
            onClick={() =>
              setMiniDate(new Date(miniDate.getFullYear(), miniDate.getMonth() + 1, 1))
            }
          >
            <IChevR size={13} />
          </button>
        </div>
      </div>
      <div className="mini-grid">
        {DOW_MINI.map((d, i) => (
          <div key={i} className="mini-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          const otherMonth = d.getMonth() !== miniDate.getMonth();
          const dayKey = ymd(d);
          const isToday = dayKey === todayKey;
          const isSelected = sameDay(d, selectedDate);
          const has = taskDays.has(dayKey);
          return (
            <div
              key={i}
              className={[
                "mini-day",
                otherMonth ? "other" : "",
                isToday ? "today" : "",
                isSelected ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setSelectedDay(dayKey);
                setViewDate(dayKey);
              }}
            >
              {d.getDate()}
              {has && !isSelected && <span className="has" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
