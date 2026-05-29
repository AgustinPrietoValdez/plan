import { useMemo } from "react";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fmtDuration, priLabel } from "../lib/format";
import { formatRule } from "../lib/recurrence";
import { useCategories, usePatchTask, useProjects, useTasks } from "../lib/queries";
import { useApp } from "../lib/store";
import type { Task } from "../types";
import { IRecurring } from "./icons";

interface Chain {
  parentId: string;
  active: Task | null; // current/next active instance (latest non-done with recurrence)
  completed: number;
  history: Task[];
}

export function RecurringView() {
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const tasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const patchTask = usePatchTask();
  const { openEdit } = useApp();

  const chains = useMemo<Chain[]>(() => {
    const map = new Map<string, Chain>();
    for (const t of tasks) {
      const parentId = t.recurrenceParentId ?? t.id;
      // Only group when this task is itself part of a chain (has a parent
      // OR has a recurrence rule, OR has descendants — but the descendants
      // case is harder; safe approximation: include any task whose id is
      // referenced by some parentId or that has a recurrence itself).
      if (!t.recurrence && !t.recurrenceParentId) continue;
      const chain = map.get(parentId) ?? {
        parentId,
        active: null,
        completed: 0,
        history: [],
      };
      chain.history.push(t);
      if (t.done) {
        chain.completed += 1;
      } else if (t.recurrence !== null) {
        // The "active" instance: the one currently scheduled with a rule.
        if (!chain.active || (chain.active.day && t.day && t.day < chain.active.day)) {
          chain.active = t;
        } else if (!chain.active) {
          chain.active = t;
        }
      }
      map.set(parentId, chain);
    }
    return [...map.values()].sort((a, b) => {
      const aDay = a.active?.day ?? "9999";
      const bDay = b.active?.day ?? "9999";
      return aDay < bDay ? -1 : 1;
    });
  }, [tasks]);

  const activeChains = chains.filter((c) => c.active !== null);
  const pausedOrEndedChains = chains.filter((c) => c.active === null);

  const totalActive = activeChains.length;
  const totalCompletions = chains.reduce((s, c) => s + c.completed, 0);

  const onPause = (chain: Chain) => {
    if (!chain.active) return;
    patchTask.mutate({
      id: chain.active.id,
      patch: { recurrence: null, recurring: false },
    });
  };

  const onEdit = (chain: Chain) => {
    if (chain.active) openEdit(chain.active.id);
  };

  return (
    <div className="day-view-main">
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          paddingBottom: 8,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center",
          }}
        >
          <IRecurring size={20} stroke={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".06em",
              color: "var(--fg-subtle)",
              fontWeight: 600,
            }}
          >
            Recurring
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {totalActive} active {totalActive === 1 ? "chain" : "chains"}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "var(--fg-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {totalCompletions} total completion{totalCompletions === 1 ? "" : "s"} so far
          </div>
        </div>
      </header>

      {activeChains.length === 0 && pausedOrEndedChains.length === 0 && (
        <div
          style={{
            padding: "40px 12px",
            textAlign: "center",
            color: "var(--fg-subtle)",
            fontSize: 13,
            border: "1px dashed var(--line)",
            borderRadius: 10,
          }}
        >
          No recurring tasks yet.
          <br />
          <span style={{ fontSize: 12 }}>
            Toggle "Repeats" in the task editor to create one.
          </span>
        </div>
      )}

      {activeChains.length > 0 && (
        <Section
          label={`Active · ${activeChains.length}`}
          chains={activeChains}
          onPause={onPause}
          onEdit={onEdit}
          tasks={tasks}
          categories={categories}
          projects={projects}
        />
      )}

      {pausedOrEndedChains.length > 0 && (
        <Section
          label={`Paused / ended · ${pausedOrEndedChains.length}`}
          chains={pausedOrEndedChains}
          onPause={onPause}
          onEdit={onEdit}
          tasks={tasks}
          categories={categories}
          projects={projects}
          paused
        />
      )}
    </div>
  );
}

function Section({
  label,
  chains,
  onPause,
  onEdit,
  categories,
  projects,
  paused,
}: {
  label: string;
  chains: Chain[];
  onPause: (c: Chain) => void;
  onEdit: (c: Chain) => void;
  tasks: Task[];
  categories: Parameters<typeof categoryFor>[1];
  projects: Parameters<typeof categoryFor>[2];
  paused?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 600,
          color: "var(--fg-muted)",
        }}
      >
        {label}
      </div>
      {chains.map((chain) => {
        const t = chain.active ?? chain.history[chain.history.length - 1];
        const cat = categoryFor(t, categories, projects);
        const colors = cat
          ? colorsForCategory(cat)
          : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
        const project = t.projectId ? projects.find((p) => p.id === t.projectId) ?? null : null;
        const ruleLabel = chain.active?.recurrence
          ? formatRule(chain.active.recurrence)
          : "Paused";
        return (
          <div
            key={chain.parentId}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "12px 14px",
              background: "var(--bg-elev)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: paused ? 0.7 : 1,
              cursor: "pointer",
            }}
            onClick={() => onEdit(chain)}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: colors.bg,
                flex: "0 0 auto",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "var(--fg)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {t.title || "Untitled"}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--fg-muted)",
                  display: "flex",
                  gap: 6,
                  marginTop: 2,
                  alignItems: "center",
                }}
              >
                <IRecurring size={11} /> {ruleLabel}
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span>{priLabel(t.priority)}</span>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span>{fmtDuration(t.duration)}</span>
                {project && (
                  <>
                    <span style={{ color: "var(--line-strong)" }}>·</span>
                    <span>{project.name}</span>
                  </>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
                flex: "0 0 auto",
              }}
            >
              {chain.active?.day && (
                <div style={{ fontWeight: 500, color: "var(--fg-muted)" }}>
                  next {chain.active.day}
                </div>
              )}
              <div>
                {chain.completed} done
              </div>
            </div>
            {chain.active && !paused && (
              <button
                className="btn ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onPause(chain);
                }}
                style={{ flex: "0 0 auto" }}
                title="Stop generating future instances"
              >
                Pause
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
