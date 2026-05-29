import { useEffect, useState, type MouseEvent } from "react";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fmtDuration } from "../lib/format";
import { useCategories, useCompleteTask, useProjects } from "../lib/queries";
import type { Task } from "../types";
import { ICheck, IX } from "./icons";

interface Props {
  task: Task;
  onClose: () => void;
}

type Mode = "under" | "on" | "over" | "custom";

export function CompletionModal({ task, onClose }: Props) {
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const cat = categoryFor(task, categories, projects);
  const colors = cat
    ? colorsForCategory(cat)
    : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const completeTask = useCompleteTask();

  const [actual, setActual] = useState<number>(task.duration || 30);
  const [mode, setMode] = useState<Mode | null>(null);

  const setQuick = (m: number, kind: Mode) => {
    setActual(m);
    setMode(kind);
  };

  const delta = actual - (task.duration || 0);

  const confirm = async (val: number) => {
    await completeTask(task, val);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 460 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div
            className="check"
            style={{ background: "var(--ok)", borderColor: "var(--ok)", color: "white" }}
          >
            <ICheck size={11} stroke={2.4} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                color: colors.fg,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              {cat?.name ?? "Uncategorized"} · estimated {fmtDuration(task.duration)}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {task.title}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Cancel">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 16 }}>
          <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 500 }}>
            How long did this actually take?
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              className={`completion-card ${mode === "under" ? "on" : ""}`}
              onClick={() =>
                setQuick(Math.max(1, Math.round((task.duration || 30) * 0.7)), "under")
              }
            >
              <span className="completion-card-label">Faster</span>
              <span className="completion-card-val">−30%</span>
            </button>
            <button
              className={`completion-card on-time ${mode === "on" ? "on" : ""}`}
              onClick={() => setQuick(task.duration || 30, "on")}
            >
              <span className="completion-card-label">On estimate</span>
              <span className="completion-card-val">{fmtDuration(task.duration)}</span>
            </button>
            <button
              className={`completion-card ${mode === "over" ? "on" : ""}`}
              onClick={() => setQuick(Math.round((task.duration || 30) * 1.5), "over")}
            >
              <span className="completion-card-label">Slower</span>
              <span className="completion-card-val">+50%</span>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
            <span
              style={{
                fontSize: 11.5,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 500,
                minWidth: 96,
              }}
            >
              Actual time
            </span>
            <input
              type="number"
              min="1"
              step="5"
              value={actual}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v > 0) {
                  setActual(v);
                  setMode("custom");
                }
              }}
              className="input"
              style={{ width: 100, fontVariantNumeric: "tabular-nums", textAlign: "right" }}
            />
            <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>minutes</span>
            <span style={{ flex: 1 }} />
            {delta !== 0 && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  padding: "3px 8px",
                  borderRadius: 6,
                  background:
                    delta > 0 ? "oklch(0.95 0.04 25)" : "oklch(0.95 0.05 155)",
                  color: delta > 0 ? "var(--danger)" : "var(--ok)",
                }}
              >
                {delta > 0 ? "+" : "−"}
                {fmtDuration(Math.abs(delta))} vs estimate
              </span>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={() => confirm(task.duration || 0)}>
            Skip — log estimate
          </button>
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => confirm(actual)}>
              Mark done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
