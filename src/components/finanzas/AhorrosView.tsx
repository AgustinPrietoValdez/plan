import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
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
import { ICheck, ITrash, IX } from "../icons";

// Mismo frame de diseño 1280×720 (2× a 2560×1440) que Home/Café/Finanzas — `--s`
// lo pone FinanzasView en la raíz y cascadea hasta acá.
function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

// `className="input"` alone has no CSS — it's only styled when nested inside a
// `.field` wrapper (see `.field .input` in components.css). These form controls
// live directly in cards, not in `.field`s, so they need their own chrome.
const fieldChrome = {
  border: "1px solid var(--line)",
  background: "var(--bg-elev)",
  borderRadius: fluid(6),
  outline: 0,
};

const sectionLabelStyle = {
  fontSize: fluid(11),
  textTransform: "uppercase" as const,
  letterSpacing: ".05em",
  fontWeight: 600,
  color: "var(--fg-muted)",
};

// ── Small donut: % completo (goals con objetivo) ──────────────────────────────
function GoalDonut({ pct, color }: { pct: number; color: string }) {
  const CIRC = 2 * Math.PI * 22;
  const dashLen = (Math.min(100, Math.max(0, pct)) / 100) * CIRC;
  return (
    <div style={{ position: "relative", width: fluid(52), height: fluid(52), flex: "0 0 auto" }}>
      <svg width={fluid(52)} height={fluid(52)} viewBox="0 0 56 56" style={{ display: "block" }}>
        <circle cx={28} cy={28} r={22} fill="none" stroke="var(--bg-sunken)" strokeWidth={7} />
        <circle
          cx={28} cy={28} r={22} fill="none" stroke={color} strokeWidth={7}
          strokeLinecap="round" strokeDasharray={`${dashLen.toFixed(2)} ${(CIRC - dashLen).toFixed(2)}`}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: fluid(11), fontWeight: 700 }}>
        {pct}%
      </div>
    </div>
  );
}

// ── Pie: total ahorrado, partido por cuanto aporto cada goal activo ───────────
const PIE_SIZE = 130;
const PIE_CX = PIE_SIZE / 2;
const PIE_CY = PIE_SIZE / 2;
const PIE_R_OUT = 60;
const PIE_R_IN = 40;

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
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: fluid(16), boxShadow: "var(--shadow-sm)" }}>
      <div style={{ ...sectionLabelStyle, marginBottom: fluid(8) }}>Total ahorrado</div>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(16) }}>
        <div style={{ position: "relative", flex: "0 0 auto" }}>
          <svg width={fluid(PIE_SIZE)} height={fluid(PIE_SIZE)} viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`} style={{ display: "block" }}>
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
            <div style={{ fontSize: fluid(15), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(hoverSlice ? hoverSlice.amount : total, { compact: true })}
            </div>
            <div style={{ fontSize: fluid(9), color: "var(--fg-subtle)", maxWidth: fluid(70), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {hoverSlice ? hoverSlice.goal.name : "ahorrado"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: fluid(4), flex: 1, minWidth: 0, maxHeight: fluid(PIE_SIZE), overflowY: "auto" }}>
          {arcs.length === 0 && <span style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)" }}>Todavia no se ahorro nada este ciclo.</span>}
          {arcs.map((a, i) => (
            <div
              key={a.goal.id}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ display: "flex", alignItems: "center", gap: fluid(6), fontSize: fluid(11.5), padding: `2px ${fluid(4)}`, borderRadius: 4, background: hover === i ? colorsForHue(a.hue).bg : "transparent" }}
            >
              <span style={{ width: fluid(9), height: fluid(9), borderRadius: 2, background: colorsForHue(a.hue).bg, flexShrink: 0 }} />
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
function MovementsCard({ transfers, accounts, goals }: { transfers: AccountTransfer[]; accounts: Account[]; goals: SavingsGoal[] }) {
  const nameOf = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "—" : "—");
  const goalNameOf = (id: string | null) => (id ? goals.find((g) => g.id === id)?.name ?? null : null);
  const savingsTransfers = useMemo(
    () => transfers.filter((t) => !t.deletedAt && t.kind === "savings").sort((a, b) => b.transferredOn.localeCompare(a.transferredOn)).slice(0, 20),
    [transfers],
  );

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: fluid(16), boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: fluid(4) }}>
      <div style={{ ...sectionLabelStyle, marginBottom: fluid(4) }}>Movimientos de ahorro</div>
      {savingsTransfers.length === 0 ? (
        <div style={{ padding: `${fluid(16)} ${fluid(12)}`, textAlign: "center", fontSize: fluid(12), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(8) }}>
          Todavia no hay transferencias de ahorro.
        </div>
      ) : (
        savingsTransfers.map((t) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: fluid(8), alignItems: "center", fontSize: fluid(11.5), padding: `${fluid(4)} ${fluid(2)}` }}>
            <span style={{ color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>{t.transferredOn}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nameOf(t.fromAccountId)} → {nameOf(t.toAccountId)}
              {goalNameOf(t.goalId) && <span style={{ color: "var(--fg-subtle)" }}> · {goalNameOf(t.goalId)}</span>}
            </span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(t.amount, { compact: true })}</span>
          </div>
        ))
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
        borderRadius: fluid(10),
        padding: `${fluid(11)} ${fluid(13)}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: fluid(8),
        minHeight: fluid(150),
        boxShadow: "var(--shadow-sm)",
        opacity: goal.active ? 1 : 0.65,
      }}
    >
      {/* minHeight = tamaño del donut, para que "Activo" quede a la misma altura
          tenga o no objetivo (donut) la card. */}
      <div style={{ display: "flex", alignItems: "center", gap: fluid(8), minHeight: fluid(52) }}>
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
            style={{ cursor: "grab", color: "var(--fg-subtle)", fontSize: fluid(15), lineHeight: 1, userSelect: "none", letterSpacing: "-2px" }}
          >
            ⠿
          </span>
        )}
        {progressPct !== null && (
          <GoalDonut pct={progressPct} color={goal.priority ? "var(--danger)" : "var(--accent)"} />
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
            style={{ ...fieldChrome, flex: 1, fontSize: fluid(13), fontWeight: 500, padding: `${fluid(4)} ${fluid(7)}` }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            title="Click para renombrar"
            style={{ flex: "1 1 auto", minWidth: 0, textAlign: "left", fontSize: fluid(13), fontWeight: 600, color: goal.priority ? "var(--danger)" : "var(--fg)", background: "none", border: 0, padding: 0, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {goal.name}
          </button>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: fluid(5), fontSize: fluid(11), color: "var(--fg-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={goal.active}
            onChange={(e) => onPatch({ active: e.target.checked })}
            style={{ width: fluid(13), height: fluid(13), accentColor: "var(--accent)", cursor: "pointer" }}
          />
          Activo
        </label>
        <button className="icon-btn" onClick={onDelete} title="Borrar objetivo" style={{ color: "var(--fg-subtle)" }}>
          <ITrash size={12} />
        </button>
      </div>

      {/* Slot de altura fija — sea el numero grande (sin objetivo) o la linea
          chica "ahorrado / objetivo" (con objetivo), ocupa lo mismo en ambas
          variantes para que las cards no queden de distinto tamaño. */}
      <div style={{ display: "flex", alignItems: "center", minHeight: fluid(26) }}>
        {isOpenEnded ? (
          <div style={{ fontSize: fluid(20), fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--fg)" }}>
            {fmtMoney(saved, { compact: true })}
          </div>
        ) : (
          <div style={{ fontSize: fluid(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
            {fmtMoney(saved, { compact: true })} / {fmtMoney(goal.targetAmount ?? 0, { compact: true })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: fluid(10), flexWrap: "wrap", minHeight: fluid(24) }}>
        <label style={{ display: "flex", alignItems: "center", gap: fluid(5), fontSize: fluid(11), color: "var(--fg-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isOpenEnded}
            onChange={(e) => onPatch({ targetAmount: e.target.checked ? null : (parseMoney(targetText) ?? 1000) })}
            style={{ width: fluid(13), height: fluid(13), accentColor: "var(--accent)", cursor: "pointer" }}
          />
          Sin monto fijo
        </label>
        {!isOpenEnded && (
          <div style={{ display: "flex", alignItems: "center", gap: fluid(4) }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Objetivo"
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              onBlur={commitTarget}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="input"
              style={{ ...fieldChrome, width: fluid(100), textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: fluid(12), padding: `${fluid(4)} ${fluid(7)}` }}
            />
            <span style={{ fontSize: fluid(11), color: "var(--fg-muted)" }}>{CURRENCY}</span>
          </div>
        )}
        <select
          className="input"
          title="Cuenta de ahorro/recuperacion (a donde entra la plata)"
          value={goal.destinationAccountId ?? ""}
          onChange={(e) => onPatch({ destinationAccountId: e.target.value || null })}
          style={{ ...fieldChrome, width: "auto", fontSize: fluid(12), padding: `${fluid(4)} ${fluid(20)} ${fluid(4)} ${fluid(7)}` }}
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
          style={{ ...fieldChrome, width: "auto", fontSize: fluid(12), padding: `${fluid(4)} ${fluid(20)} ${fluid(4)} ${fluid(7)}` }}
        >
          <option value="">Sin cuenta de compra</option>
          {allAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {goal.priority ? (
        <div style={{ background: "color-mix(in oklch, var(--danger) 12%, var(--bg))", border: "1px solid var(--danger)", borderRadius: 6, padding: `${fluid(6)} ${fluid(9)}`, fontSize: fluid(11), color: "var(--danger)", display: "flex", alignItems: "center", gap: fluid(8) }}>
          <span style={{ flex: 1 }}>
            Prioridad — recuperar {fmtMoney(Math.max(0, (goal.targetAmount ?? 0) - saved))}
          </span>
          <button className="btn ghost" style={{ padding: `${fluid(2)} ${fluid(8)}`, fontSize: fluid(10), whiteSpace: "nowrap" }} onClick={onRecovered}>
            Ya recuperé
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: fluid(8), fontSize: fluid(11), color: "var(--fg-muted)" }}>
          <span style={{ padding: `${fluid(3)} ${fluid(8)}`, background: "var(--bg-sunken)", border: "1px solid var(--line)", borderRadius: 999 }}>
            → {(goal.destinationAccountId && (accounts.find((a) => a.id === goal.destinationAccountId) ?? allAccounts.find((a) => a.id === goal.destinationAccountId))?.name) || "sin cuenta"}
          </span>
          {!isOpenEnded && (
            <button style={{ fontSize: fluid(11), color: "var(--fg-muted)" }} onClick={onRegistrarCompra}>
              Registrar compra
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface AhorrosViewHandle {
  openCreate: () => void;
}

export const AhorrosView = forwardRef<AhorrosViewHandle>(function AhorrosView(_props, ref) {
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

  useImperativeHandle(ref, () => ({
    openCreate: () => { setNewGoalName(""); setShowAddGoal(true); },
  }));

  useEffect(() => {
    if (!showAddGoal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAddGoal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddGoal]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(6) }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(16), flex: 1, minHeight: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: fluid(16), flex: "0 0 auto" }}>
        <GoalsPie activeGoals={activeGoals} savedByGoalId={savedByGoalId} />
        <MovementsCard transfers={transfers} accounts={accounts} goals={goals} />
      </div>

      {goalsWithTarget.length === 0 && goalsNoTarget.length === 0 && purchasedGoals.length === 0 ? (
        <div style={{ padding: `${fluid(16)} ${fluid(12)}`, textAlign: "center", fontSize: fluid(12), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(8) }}>
          Todavia no hay objetivos. Crea el primero con "Nuevo objetivo".
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: fluid(16), flex: 1, minHeight: 0 }}>
          {/* El titulo de cada columna queda fijo — solo el contenido de abajo scrollea. */}
          <div style={{ display: "flex", flexDirection: "column", gap: fluid(10), minHeight: 0 }}>
            <div style={{ ...sectionLabelStyle, flexShrink: 0 }}>Con objetivo</div>
            <div className="fz-col" style={{ display: "flex", flexDirection: "column", gap: fluid(10), flex: 1, minHeight: 0, overflowY: "auto", paddingRight: fluid(4) }}>
              {goalsWithTarget.length === 0 ? (
                <div style={{ padding: fluid(12), textAlign: "center", fontSize: fluid(11.5), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(8) }}>
                  Ninguno con monto fijo todavia.
                </div>
              ) : goalColumn(goalsWithTarget)}

              {purchasedGoals.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: fluid(6), marginTop: fluid(4) }}>
                  <div style={{ fontSize: fluid(10), textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)" }}>
                    Comprados · {purchasedGoals.length}
                  </div>
                  {purchasedGoals.map((g) => (
                    <div
                      key={g.id}
                      style={{ display: "flex", alignItems: "center", gap: fluid(10), padding: `${fluid(7)} ${fluid(11)}`, background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(8), opacity: 0.65 }}
                    >
                      <span style={{ flex: 1, fontSize: fluid(12), fontWeight: 500, textDecoration: "line-through", color: "var(--fg-subtle)" }}>
                        {g.name}
                      </span>
                      <span style={{ fontSize: fluid(11), color: "var(--ok)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                        Comprado
                      </span>
                      <button
                        className="btn ghost"
                        style={{ padding: `${fluid(3)} ${fluid(8)}`, fontSize: fluid(11) }}
                        onClick={() => patch.mutate({ id: g.id, patch: { purchasedAt: null } })}
                      >
                        Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: fluid(10), minHeight: 0 }}>
            <div style={{ ...sectionLabelStyle, flexShrink: 0 }}>Sin fin definido</div>
            <div className="fz-col" style={{ display: "flex", flexDirection: "column", gap: fluid(10), flex: 1, minHeight: 0, overflowY: "auto", paddingRight: fluid(4) }}>
              {goalsNoTarget.length === 0 ? (
                <div style={{ padding: fluid(12), textAlign: "center", fontSize: fluid(11.5), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(8) }}>
                  Ninguno sin monto fijo todavia.
                </div>
              ) : goalColumn(goalsNoTarget)}
            </div>
          </div>
        </div>
      )}

      {showAddGoal && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddGoal(false); }}>
          <div className="modal" style={{ width: "calc(var(--home-s, 1) * 420px)" }} onMouseDown={(e) => e.stopPropagation()}>
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
          <div className="modal" style={{ width: "calc(var(--home-s, 1) * 360px)" }} onMouseDown={(e) => e.stopPropagation()}>
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
});
