import { useEffect, useMemo, useState } from "react";
import { colorsForHue } from "../../lib/categoryColor";
import { CURRENCY, fmtMoney, parseMoney } from "../../lib/money";
import {
  useAccounts,
  useAccountTransfers,
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  usePatchSavingsGoal,
  useSavingsContributions,
  useSavingsGoals,
} from "../../lib/queries";
import { useApp } from "../../lib/store";
import type { Account, AccountTransfer, SavingsGoal } from "../../types";
import { ICheck, IPlus, ITrash, IX } from "../icons";

// ── Small donut: % completo (goals con objetivo) o monto ahorrado (sin objetivo) ──
const DONUT_SIZE = 60;
const DONUT_CX = DONUT_SIZE / 2;
const DONUT_R = 23;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

function GoalDonut({ pct, label, color }: { pct: number | null; label: string; color: string }) {
  const fill = pct !== null ? Math.min(100, Math.max(0, pct)) : 0;
  const dashLen = (fill / 100) * DONUT_CIRC;
  return (
    <div style={{ position: "relative", width: DONUT_SIZE, height: DONUT_SIZE, flex: "0 0 auto" }}>
      <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} style={{ display: "block" }}>
        <circle cx={DONUT_CX} cy={DONUT_CX} r={DONUT_R} fill="none" stroke="var(--bg-sunken)" strokeWidth={8} />
        {pct !== null && fill > 0 && (
          <circle
            cx={DONUT_CX} cy={DONUT_CX} r={DONUT_R}
            fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={`${dashLen} ${DONUT_CIRC - dashLen}`}
            strokeDashoffset={DONUT_CIRC / 4}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray .3s" }}
          />
        )}
      </svg>
      <div style={{ position: "absolute", inset: 2, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: pct !== null ? 13 : 9.5, fontWeight: 700, color: "var(--fg)", textAlign: "center", lineHeight: 1.1, overflow: "hidden" }}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ── Pie: total ahorrado, partido por cuanto aporto cada goal activo ───────────
const PIE_SIZE = 150;
const PIE_CX = PIE_SIZE / 2;
const PIE_CY = PIE_SIZE / 2;
const PIE_R_OUT = 72;
const PIE_R_IN = 48;

function piePath(start: number, end: number, ro: number, ri: number): string {
  if (Math.abs(end - start) < 0.0001) return "";
  const a0 = start - Math.PI / 2;
  const a1 = end - Math.PI / 2;
  const large = end - start > Math.PI ? 1 : 0;
  const x0 = PIE_CX + ro * Math.cos(a0);
  const y0 = PIE_CY + ro * Math.sin(a0);
  const x1 = PIE_CX + ro * Math.cos(a1);
  const y1 = PIE_CY + ro * Math.sin(a1);
  const xi1 = PIE_CX + ri * Math.cos(a1);
  const yi1 = PIE_CY + ri * Math.sin(a1);
  const xi0 = PIE_CX + ri * Math.cos(a0);
  const yi0 = PIE_CY + ri * Math.sin(a0);
  return [`M ${x0} ${y0}`, `A ${ro} ${ro} 0 ${large} 1 ${x1} ${y1}`, `L ${xi1} ${yi1}`, `A ${ri} ${ri} 0 ${large} 0 ${xi0} ${yi0}`, "Z"].join(" ");
}

function GoalsPie({ activeGoals, savedByGoalId }: { activeGoals: SavingsGoal[]; savedByGoalId: Record<string, number> }) {
  const [hover, setHover] = useState<number | null>(null);
  const slices = activeGoals
    .map((g, i) => ({ goal: g, amount: savedByGoalId[g.id] ?? 0, hue: (i * 137.508) % 360 }))
    .filter((s) => s.amount > 0);
  const total = slices.reduce((s, x) => s + x.amount, 0);
  let acc = 0;
  const arcs = slices.map((s) => {
    const start = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    acc += s.amount;
    const end = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    return { ...s, start, end };
  });
  const hoverSlice = hover != null ? arcs[hover] : null;

  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)", marginBottom: 8 }}>
        Total ahorrado
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative", flex: "0 0 auto" }}>
          <svg width={PIE_SIZE} height={PIE_SIZE} style={{ display: "block" }}>
            {arcs.length === 0 ? (
              <circle cx={PIE_CX} cy={PIE_CY} r={(PIE_R_OUT + PIE_R_IN) / 2} fill="none" stroke="var(--bg-sunken)" strokeWidth={PIE_R_OUT - PIE_R_IN} />
            ) : (
              arcs.map((a, i) => (
                <path
                  key={a.goal.id}
                  d={piePath(a.start, a.end, PIE_R_OUT, PIE_R_IN)}
                  fill={colorsForHue(a.hue).bg}
                  stroke="var(--bg-elev)"
                  strokeWidth={1.5}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer", opacity: hover != null && hover !== i ? 0.4 : 1, transition: "opacity .15s" }}
                />
              ))
            )}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(hoverSlice ? hoverSlice.amount : total, { compact: true })}
            </div>
            <div style={{ fontSize: 9, color: "var(--fg-subtle)", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {hoverSlice ? hoverSlice.goal.name : "ahorrado"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0, maxHeight: PIE_SIZE, overflowY: "auto" }}>
          {arcs.length === 0 && <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>Todavia no se ahorro nada este ciclo.</span>}
          {arcs.map((a, i) => (
            <div
              key={a.goal.id}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, padding: "2px 4px", borderRadius: 4, background: hover === i ? colorsForHue(a.hue).bg : "transparent" }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 2, background: colorsForHue(a.hue).bg, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.goal.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)" }}>{fmtMoney(a.amount, { compact: true })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Recent savings-kind transfers ──────────────────────────────────────────────
function MovementsList({ transfers, accounts, goals }: { transfers: AccountTransfer[]; accounts: Account[]; goals: SavingsGoal[] }) {
  const nameOf = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "—" : "—");
  const goalNameOf = (id: string | null) => (id ? goals.find((g) => g.id === id)?.name ?? null : null);
  const savingsTransfers = useMemo(
    () => transfers.filter((t) => !t.deletedAt && t.kind === "savings").sort((a, b) => b.transferredOn.localeCompare(a.transferredOn)).slice(0, 20),
    [transfers],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
        Movimientos de ahorro
      </div>
      {savingsTransfers.length === 0 ? (
        <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: 8 }}>
          Todavia no hay transferencias de ahorro.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: PIE_SIZE, overflowY: "auto" }}>
          {savingsTransfers.map((t) => (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 8, alignItems: "center", fontSize: 11.5, padding: "3px 4px" }}>
              <span style={{ color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>{t.transferredOn}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nameOf(t.fromAccountId)} → {nameOf(t.toAccountId)}
                {goalNameOf(t.goalId) && <span style={{ color: "var(--fg-subtle)" }}> · {goalNameOf(t.goalId)}</span>}
              </span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(t.amount, { compact: true })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Goal card: nombre/objetivo/cuenta destino/activo/prioridad/registrar compra.
// El % y overflow se editan en Presupuesto (solo goals activos, con lo que hay
// que hacer ese mes) — aca queda todo lo demas del ciclo de vida del goal. ─────
function GoalCard({
  goal,
  accounts,
  allAccounts,
  saved,
  onPatch,
  onDelete,
  onRegistrarCompra,
  onRecovered,
  draggable,
  onDragStartHandle,
  onDragEndHandle,
}: {
  goal: SavingsGoal;
  accounts: Account[];
  allAccounts: Account[];
  saved: number;
  onPatch: (patch: Partial<Pick<SavingsGoal, "name" | "targetAmount" | "destinationAccountId" | "purchaseAccountId" | "active">>) => void;
  onDelete: () => void;
  onRegistrarCompra: () => void;
  onRecovered: () => void;
  draggable?: boolean;
  onDragStartHandle?: () => void;
  onDragEndHandle?: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(goal.name);
  useEffect(() => setDraftName(goal.name), [goal.id, goal.name]);
  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== goal.name) onPatch({ name: trimmed });
    setEditingName(false);
  };

  const isOpenEnded = goal.targetAmount === null;
  const [targetText, setTargetText] = useState(goal.targetAmount != null ? goal.targetAmount.toString().replace(".", ",") : "");
  useEffect(() => {
    setTargetText(goal.targetAmount != null ? goal.targetAmount.toString().replace(".", ",") : "");
  }, [goal.id, goal.targetAmount]);
  const commitTarget = () => {
    const parsed = parseMoney(targetText);
    onPatch({ targetAmount: parsed !== null && parsed > 0 ? parsed : null });
  };

  const progressPct = goal.targetAmount !== null && goal.targetAmount > 0
    ? Math.min(100, Math.round((saved / goal.targetAmount) * 100))
    : null;

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: goal.priority ? "2px solid var(--danger)" : "1px solid var(--line)",
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 6,
        minHeight: 160,
        opacity: goal.active ? 1 : 0.65,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {draggable && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", goal.id);
              onDragStartHandle?.();
            }}
            onDragEnd={onDragEndHandle}
            title="Arrastrar para reordenar"
            style={{ cursor: "grab", color: "var(--fg-subtle)", fontSize: 15, lineHeight: 1, userSelect: "none", letterSpacing: "-2px" }}
          >
            ⠿
          </span>
        )}
        {progressPct !== null && (
          <GoalDonut pct={progressPct} label={`${progressPct}%`} color="var(--accent)" />
        )}
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              else if (e.key === "Escape") { setEditingName(false); setDraftName(goal.name); }
            }}
            className="input"
            style={{ flex: 1, fontSize: 13, fontWeight: 500 }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            title="Click para renombrar"
            style={{ flex: "1 1 auto", minWidth: 0, textAlign: "left", fontSize: 13, fontWeight: 500, color: "var(--fg)", background: "none", border: 0, padding: 0, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {goal.name}
          </button>
        )}
        {goal.targetAmount !== null && (
          <span style={{ flex: "0 0 auto", fontSize: 11, color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {fmtMoney(saved, { compact: true })} / {fmtMoney(goal.targetAmount, { compact: true })}
          </span>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--fg-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={goal.active} onChange={(e) => onPatch({ active: e.target.checked })} />
          Activo
        </label>
        <button className="icon-btn" onClick={onDelete} title="Borrar objetivo" style={{ color: "var(--fg-subtle)" }}>
          <ITrash size={12} />
        </button>
      </div>

      {isOpenEnded && (
        <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--fg)" }}>
          {fmtMoney(saved, { compact: true })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--fg-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isOpenEnded}
            onChange={(e) => onPatch({ targetAmount: e.target.checked ? null : (parseMoney(targetText) ?? 1000) })}
          />
          Sin monto fijo
        </label>
        {!isOpenEnded && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Objetivo"
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              onBlur={commitTarget}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="input"
              style={{ width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
            />
            <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{CURRENCY}</span>
          </div>
        )}
        <select
          className="input"
          title="Cuenta de ahorro/recuperacion (a donde entra la plata)"
          value={goal.destinationAccountId ?? ""}
          onChange={(e) => onPatch({ destinationAccountId: e.target.value || null })}
          style={{ width: "auto", fontSize: 12 }}
        >
          <option value="">Sin cuenta de ahorro</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          className="input"
          title="Cuenta de compra (de donde sale la plata al comprar)"
          value={goal.purchaseAccountId ?? ""}
          onChange={(e) => onPatch({ purchaseAccountId: e.target.value || null })}
          style={{ width: "auto", fontSize: 12 }}
        >
          <option value="">Sin cuenta de compra</option>
          {allAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {goal.priority ? (
        <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid var(--danger)", borderRadius: 6, padding: "6px 8px", fontSize: 11.5, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>
            Prioridad — recuperar {fmtMoney(Math.max(0, (goal.targetAmount ?? 0) - saved))}
          </span>
          <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 10.5, whiteSpace: "nowrap" }} onClick={onRecovered}>
            Ya recuperé
          </button>
        </div>
      ) : !isOpenEnded ? (
        <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: 11 }} onClick={onRegistrarCompra}>
          Registrar compra
        </button>
      ) : null}
    </div>
  );
}

export function AhorrosView() {
  const goalsQ = useSavingsGoals();
  const accountsQ = useAccounts();
  const transfersQ = useAccountTransfers();
  const contributionsQ = useSavingsContributions();
  const create = useCreateSavingsGoal();
  const patch = usePatchSavingsGoal();
  const remove = useDeleteSavingsGoal();
  const { openExpenseCreate } = useApp();

  const goals = useMemo(() => goalsQ.data ?? [], [goalsQ.data]);
  const transfers = useMemo(() => transfersQ.data ?? [], [transfersQ.data]);
  const contributions = useMemo(() => contributionsQ.data ?? [], [contributionsQ.data]);
  const allAccounts = useMemo(() => (accountsQ.data ?? []).filter((a) => !a.archived), [accountsQ.data]);
  // Cuentas destino de ahorro; si ninguna tiene la capacidad, mostrar todas.
  const accounts = useMemo(() => {
    const targets = allAccounts.filter((a) => a.isSavingsTarget);
    return targets.length > 0 ? targets : allAccounts;
  }, [allAccounts]);

  const livingGoals = useMemo(
    () => goals.filter((g) => !g.purchasedAt && !g.deletedAt).sort((a, b) => a.position - b.position),
    [goals],
  );
  const activeGoals = useMemo(() => livingGoals.filter((g) => g.active), [livingGoals]);
  // Los goals en prioridad (comprados sin llegar al objetivo) van adentro de "Con objetivo"
  // — siempre tienen uno, y ahi arriba de todo (no en su propia seccion aparte).
  const goalsWithTarget = useMemo(
    () => livingGoals.filter((g) => g.targetAmount !== null).sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0)),
    [livingGoals],
  );
  const goalsNoTarget = useMemo(() => livingGoals.filter((g) => g.targetAmount === null), [livingGoals]);
  const purchasedGoals = useMemo(() => goals.filter((g) => g.purchasedAt && !g.deletedAt), [goals]);

  // "Ahorrado" por goal: suma de savings_contributions (un aporte mensual por goal,
  // registrado cuando se hace la transferencia real en Presupuesto — una misma
  // transferencia de cuenta puede cubrir varios goals, por eso no se lee de account_transfers).
  const savedByGoalId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contributions) {
      if (c.deletedAt) continue;
      map[c.goalId] = (map[c.goalId] ?? 0) + c.amount;
    }
    return map;
  }, [contributions]);

  const [dragGoalId, setDragGoalId] = useState<string | null>(null);
  const reorderWithin = (list: SavingsGoal[], fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ordered = [...list];
    const from = ordered.findIndex((g) => g.id === fromId);
    const to = ordered.findIndex((g) => g.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    ordered.forEach((g, idx) => {
      if (g.position !== idx) patch.mutate({ id: g.id, patch: { position: idx } });
    });
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState("");

  useEffect(() => {
    if (!showAddGoal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAddGoal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddGoal]);

  const onAdd = () => {
    setNewGoalName("");
    setShowAddGoal(true);
  };

  const createGoal = () => {
    const name = newGoalName.trim();
    if (!name) return;
    create.mutate({ name, targetAmount: null, position: livingGoals.length });
    setShowAddGoal(false);
  };

  const onRegistrarCompra = (g: SavingsGoal) => {
    openExpenseCreate({
      accountId: g.purchaseAccountId ?? g.destinationAccountId ?? null,
      note: g.name,
      goalId: g.id,
    });
  };

  const goalColumn = (list: SavingsGoal[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((g) => (
        <div
          key={g.id}
          onDragEnter={(e) => { if (dragGoalId) e.preventDefault(); }}
          onDragOver={(e) => { if (dragGoalId) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (dragGoalId) reorderWithin(list, dragGoalId, g.id); setDragGoalId(null); }}
          style={{ opacity: dragGoalId === g.id ? 0.5 : 1, transition: "opacity .12s" }}
        >
          <GoalCard
            goal={g}
            accounts={accounts}
            allAccounts={allAccounts}
            saved={savedByGoalId[g.id] ?? 0}
            onPatch={(p) => patch.mutate({ id: g.id, patch: p })}
            onDelete={() => setConfirmDeleteId(g.id)}
            onRegistrarCompra={() => onRegistrarCompra(g)}
            onRecovered={() => patch.mutate({ id: g.id, patch: { priority: false, purchasedAt: new Date().toISOString() } })}
            draggable
            onDragStartHandle={() => setDragGoalId(g.id)}
            onDragEndHandle={() => setDragGoalId(null)}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="day-view-main">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingBottom: 8,
          borderBottom: "1px solid var(--line)",
          minHeight: 84,
          boxSizing: "border-box",
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-subtle)", fontWeight: 600 }}>
            Ahorros
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            Objetivos
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={onAdd}>
          <IPlus size={12} /> Nuevo objetivo
        </button>
      </header>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0, overflowY: "auto" }}>
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <GoalsPie activeGoals={activeGoals} savedByGoalId={savedByGoalId} />
          <MovementsList transfers={transfers} accounts={accounts} goals={goals} />
        </section>

        {goalsWithTarget.length === 0 && goalsNoTarget.length === 0 && purchasedGoals.length === 0 ? (
          <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: 8 }}>
            Todavia no hay objetivos. Crea el primero con "Nuevo objetivo".
          </div>
        ) : (
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
                Con objetivo
              </div>
              {goalsWithTarget.length === 0 ? (
                <div style={{ padding: "12px", textAlign: "center", fontSize: 11.5, color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: 8 }}>
                  Ninguno con monto fijo todavia.
                </div>
              ) : goalColumn(goalsWithTarget)}

              {purchasedGoals.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)" }}>
                    Comprados · {purchasedGoals.length}
                  </div>
                  {purchasedGoals.map((g) => (
                    <div
                      key={g.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 8, opacity: 0.6 }}
                    >
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, textDecoration: "line-through", color: "var(--fg-subtle)" }}>
                        {g.name}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--ok)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                        Comprado
                      </span>
                      <button
                        className="btn ghost"
                        style={{ padding: "3px 8px", fontSize: 11 }}
                        onClick={() => patch.mutate({ id: g.id, patch: { purchasedAt: null } })}
                      >
                        Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
                Sin fin definido
              </div>
              {goalsNoTarget.length === 0 ? (
                <div style={{ padding: "12px", textAlign: "center", fontSize: 11.5, color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: 8 }}>
                  Ninguno sin monto fijo todavia.
                </div>
              ) : goalColumn(goalsNoTarget)}
            </div>
          </section>
        )}
      </div>

      {showAddGoal && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddGoal(false); }}>
          <div className="modal" style={{ width: 420 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Nuevo objetivo</span>
              <button className="icon-btn" onClick={() => setShowAddGoal(false)} title="Cerrar">
                <IX size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Nombre</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ej. Bici, Emergency Fund…"
                  autoFocus
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createGoal(); }}
                />
              </div>
            </div>
            <div className="modal-foot">
              <span />
              <div className="actions">
                <button className="btn ghost" onClick={() => setShowAddGoal(false)}>Cancelar</button>
                <button
                  className="btn primary"
                  onClick={createGoal}
                  disabled={newGoalName.trim().length === 0}
                  style={newGoalName.trim().length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                >
                  <ICheck size={12} stroke={2.4} /> Crear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}>
          <div className="modal" style={{ width: 360 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Borrar objetivo</span>
              <button className="icon-btn" onClick={() => setConfirmDeleteId(null)} title="Cerrar">
                <IX size={14} />
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              Esta accion no se puede deshacer.
            </div>
            <div className="modal-foot">
              <span />
              <div className="actions">
                <button className="btn ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                <button
                  className="btn"
                  style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                  onClick={() => { remove.mutate(confirmDeleteId); setConfirmDeleteId(null); }}
                >
                  <ICheck size={12} /> Borrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
