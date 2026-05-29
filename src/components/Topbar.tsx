import {
  DOW_SHORT,
  MONTH_NAME,
  MONTH_SHORT,
  addDays,
  fromYmd,
  startOfWeek,
  todayYmd,
  ymd,
} from "../lib/date";
import { useApp } from "../lib/store";
import { useProjects } from "../lib/queries";
import { IChevL, IChevR, IFilter } from "./icons";

function getWeekNum(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

export function Topbar() {
  const { view, setView, viewDate, setViewDate, setSelectedDay, viewProjectId } = useApp();
  const projectsQ = useProjects();
  const projects = projectsQ.data ?? [];
  const project = viewProjectId
    ? projects.find((p) => p.id === viewProjectId) ?? null
    : null;

  const isCalendarView = view === "day" || view === "week" || view === "month";
  const vd = fromYmd(viewDate);

  const goPrev = () => {
    const d = new Date(vd);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else if (view === "day") d.setDate(d.getDate() - 1);
    else return;
    setViewDate(ymd(d));
  };
  const goNext = () => {
    const d = new Date(vd);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else if (view === "day") d.setDate(d.getDate() + 1);
    else return;
    setViewDate(ymd(d));
  };
  const goToday = () => {
    const t = todayYmd();
    setViewDate(t);
    setSelectedDay(t);
  };

  let title = "";
  let sub = "";
  if (view === "month") {
    title = `${MONTH_NAME[vd.getMonth()]} ${vd.getFullYear()}`;
    sub = `Week ${getWeekNum(vd)}`;
  } else if (view === "week") {
    const start = startOfWeek(vd);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    title = `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${sameMonth ? "" : MONTH_SHORT[end.getMonth()] + " "}${end.getDate()}`;
    sub = `${start.getFullYear()}`;
  } else if (view === "day") {
    title = `${DOW_SHORT[vd.getDay()]}, ${MONTH_NAME[vd.getMonth()]} ${vd.getDate()}`;
    sub = viewDate === todayYmd() ? "Today" : "";
  } else if (view === "project") {
    title = project ? project.name : "Project";
    sub = project ? "" : "Select one from the sidebar";
  } else if (view === "recurring") {
    title = "Recurring";
    sub = "Tasks that repeat on a schedule";
  } else {
    title = "Budget";
    sub = "Track expenses against monthly limits";
  }

  return (
    <header className="topbar">
      <div className="title-block">
        <h1>{title}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {isCalendarView && (
        <>
          <button className="icon-btn" onClick={goPrev} title="Previous">
            <IChevL size={15} />
          </button>
          <button className="icon-btn" onClick={goNext} title="Next">
            <IChevR size={15} />
          </button>
          <button className="btn" onClick={goToday}>
            Today
          </button>
        </>
      )}

      <div className="topbar-spacer" />

      <div className="seg">
        <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>
          Day
        </button>
        <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>
          Week
        </button>
        <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>
          Month
        </button>
        <button className={view === "project" ? "active" : ""} onClick={() => setView("project")}>
          Project
        </button>
      </div>

      {isCalendarView && (
        <button className="btn">
          <IFilter size={13} /> Filter
        </button>
      )}
    </header>
  );
}
