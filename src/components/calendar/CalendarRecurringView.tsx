import { useMemo } from "react";
import { categoryFor } from "../../lib/categoryFor";
import { colorsForCategory } from "../../lib/categoryColor";
import { fmtDuration, priColor, priLabelEs } from "../../lib/format";
import { formatRule } from "../../lib/recurrence";
import { useCategories, usePatchTask, useProjects, useTasks } from "../../lib/queries";
import { useApp } from "../../lib/store";
import type { Task } from "../../types";
import { IRecurring } from "../icons";

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

interface Chain {
  parentId: string;
  active: Task | null;
  completed: number;
  history: Task[];
}

export function CalendarRecurringView() {
  const tasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const patchTask = usePatchTask();
  const { openEdit } = useApp();

  const chains = useMemo<Chain[]>(() => {
    const map = new Map<string, Chain>();
    for (const t of tasks) {
      const parentId = t.recurrenceParentId ?? t.id;
      if (!t.recurrence && !t.recurrenceParentId) continue;
      const chain = map.get(parentId) ?? { parentId, active: null, completed: 0, history: [] };
      chain.history.push(t);
      if (t.done) {
        chain.completed += 1;
      } else if (t.recurrence !== null) {
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
  const pausedChains = chains.filter((c) => c.active === null);
  const totalActive = activeChains.length;
  const totalCompletions = chains.reduce((s, c) => s + c.completed, 0);

  const onPause = (chain: Chain) => {
    if (!chain.active) return;
    patchTask.mutate({ id: chain.active.id, patch: { recurrence: null, recurring: false } });
  };
  const onEdit = (chain: Chain) => {
    if (chain.active) openEdit(chain.active.id);
  };

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto" }} className="cal-noscroll">
      <div style={{ padding: `${fluid(16)} ${fluid(20)} ${fluid(18)}`, display: "flex", flexDirection: "column", gap: fluid(14) }}>
        <div style={{ display: "flex", alignItems: "center", gap: fluid(12) }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: fluid(38), height: fluid(38), borderRadius: fluid(10), color: "var(--accent)", background: "var(--accent-soft)", flexShrink: 0 }}>
            <IRecurring size={19} stroke={1.7} />
          </span>
          <div>
            <div style={{ fontSize: fluid(18), fontWeight: 600, letterSpacing: "-0.01em" }}>
              {totalActive} {totalActive === 1 ? "cadena activa" : "cadenas activas"}
            </div>
            <div style={{ fontSize: fluid(12), color: "var(--fg-muted)" }}>
              {totalCompletions} {totalCompletions === 1 ? "completada en total" : "completadas en total"}
            </div>
          </div>
        </div>

        {activeChains.length === 0 && pausedChains.length === 0 && (
          <div style={{ padding: `${fluid(40)} ${fluid(12)}`, textAlign: "center", color: "var(--fg-subtle)", fontSize: fluid(13), border: "1px dashed var(--line)", borderRadius: fluid(10) }}>
            Todavía no hay tareas recurrentes.
            <br />
            <span style={{ fontSize: fluid(12) }}>Activá "Se repite" en el editor de tareas para crear una.</span>
          </div>
        )}

        {activeChains.length > 0 && (
          <ChainSection label={`Activas · ${activeChains.length}`} chains={activeChains} categories={categories} projects={projects} onPause={onPause} onEdit={onEdit} />
        )}
        {pausedChains.length > 0 && (
          <ChainSection label={`Pausadas · ${pausedChains.length}`} chains={pausedChains} categories={categories} projects={projects} onPause={onPause} onEdit={onEdit} paused />
        )}
      </div>
    </div>
  );
}

function ChainSection({
  label, chains, categories, projects, onPause, onEdit, paused,
}: {
  label: string; chains: Chain[]; categories: Parameters<typeof categoryFor>[1]; projects: Parameters<typeof categoryFor>[2];
  onPause: (c: Chain) => void; onEdit: (c: Chain) => void; paused?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(8) }}>
      <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "var(--fg-muted)" }}>{label}</div>
      {chains.map((chain) => {
        const t = chain.active ?? chain.history[chain.history.length - 1];
        const cat = categoryFor(t, categories, projects);
        const colors = cat ? colorsForCategory(cat) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
        const project = t.projectId ? projects.find((p) => p.id === t.projectId) ?? null : null;
        const ruleLabel = chain.active?.recurrence ? formatRule(chain.active.recurrence) : "Pausada";
        return (
          <div
            key={chain.parentId}
            onClick={() => onEdit(chain)}
            style={{
              border: "1px solid var(--line)", borderRadius: fluid(10), padding: `${fluid(12)} ${fluid(14)}`, background: "var(--bg-elev)",
              boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: fluid(12), opacity: paused ? 0.7 : 1, cursor: "pointer",
            }}
          >
            <span style={{ width: fluid(10), height: fluid(10), borderRadius: 3, background: colors.bg, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: fluid(13.5), fontWeight: 500, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.title || "Sin título"}
              </div>
              <div style={{ fontSize: fluid(11.5), color: "var(--fg-muted)", display: "flex", gap: fluid(6), marginTop: 2, alignItems: "center" }}>
                <IRecurring size={11} /> {ruleLabel}
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span style={{ color: priColor(t.priority), fontWeight: 600 }}>{priLabelEs(t.priority)}</span>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span>{fmtDuration(t.duration)}</span>
                {project && (<><span style={{ color: "var(--line-strong)" }}>·</span><span>{project.name}</span></>)}
              </div>
            </div>
            <div style={{ fontSize: fluid(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums", textAlign: "right", flexShrink: 0 }}>
              {chain.active?.day && <div style={{ fontWeight: 500, color: "var(--fg-muted)" }}>próx. {chain.active.day}</div>}
              <div>{chain.completed} hechas</div>
            </div>
            {chain.active && !paused && (
              <button
                onClick={(e) => { e.stopPropagation(); onPause(chain); }}
                title="Dejar de generar futuras instancias"
                style={{ flexShrink: 0, height: fluid(28), padding: `0 ${fluid(12)}`, borderRadius: fluid(7), border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--fg-muted)", fontSize: fluid(11.5), fontWeight: 600, cursor: "pointer" }}
              >
                Pausar
              </button>
            )}
            {chain.active === null && paused && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(chain); }}
                title="Reanudar desde el editor de tareas"
                style={{ flexShrink: 0, height: fluid(28), padding: `0 ${fluid(12)}`, borderRadius: fluid(7), border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--fg-muted)", fontSize: fluid(11.5), fontWeight: 600, cursor: "pointer" }}
              >
                Reanudar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
