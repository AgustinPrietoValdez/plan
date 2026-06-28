import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { useSession } from "../lib/auth";
import { fromYmd } from "../lib/date";
import { CURRENCY, fmtMoney, parseMoney } from "../lib/money";
import { formatRule } from "../lib/recurrence";
import { useMaterializeRecurringExpenses } from "../lib/materializeRecurringExpenses";
import {
  useAccounts,
  useAccountTransfers,
  useBudgets,
  useCreateAccountTransfer,
  useDeleteAccountTransfer,
  useDeleteExpense,

  useExpenseCategories,
  useExpenseLineItems,
  useExpenses,
  useIncomes,
  usePatchExpense,
  usePatchSavingsGoal,
  useSavingsContributions,
  useSavingsGoals,
  useUpsertIncome,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type {
  Account,
  AccountTransfer,
  Expense,
  ExpenseCategory,
  ExpenseLineItem,
  SavingsGoal,
  TransferKind,
} from "../types";
import { IChevD, IChevL, IChevR, IChevU, IPlus, IRecurring, ITrash, IX } from "./icons";
import { SpendingPie } from "./SpendingPie";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymToLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function shiftMonth(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  let year = y;
  let month = m + delta;
  while (month > 12) { month -= 12; year += 1; }
  while (month < 1) { month += 12; year -= 1; }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function expenseInMonth(e: Expense, yyyymm: string): boolean {
  return e.spentOn.slice(0, 7) === yyyymm;
}

// ── Small donut ring for a single percentage ──────────────────────────────────
const DONUT_SIZE = 72;
const DONUT_CX = DONUT_SIZE / 2;
const DONUT_R = 28;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

function GoalDonut({ pct, color }: { pct: number; color: string }) {
  const fill = Math.min(100, Math.max(0, pct));
  const dashLen = (fill / 100) * DONUT_CIRC;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} style={{ display: "block" }}>
      <circle cx={DONUT_CX} cy={DONUT_CX} r={DONUT_R} fill="none" stroke="var(--bg-sunken)" strokeWidth={9} />
      {fill > 0 && (
        <circle
          cx={DONUT_CX} cy={DONUT_CX} r={DONUT_R}
          fill="none" stroke={color} strokeWidth={9}
          strokeDasharray={`${dashLen} ${DONUT_CIRC - dashLen}`}
          strokeDashoffset={DONUT_CIRC / 4}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray .3s" }}
        />
      )}
    </svg>
  );
}

// ── Savings goal card ─────────────────────────────────────────────────────────
function SavingsGoalCard({
  goal,
  leftover,
  overflowPercent,
  totalSaved,
  onPatchPercent,
  onSetOverflow,
  onUnsetOverflow,
  onMarkPurchased,
  onDragStartHandle,
  onDragEndHandle,
}: {
  goal: SavingsGoal;
  leftover: number;
  overflowPercent: number;
  totalSaved: number;
  onPatchPercent: (pct: number) => void;
  onSetOverflow: () => void;
  onUnsetOverflow: () => void;
  onMarkPurchased: () => void;
  onDragStartHandle: () => void;
  onDragEndHandle: () => void;
}) {
  const effectivePct = goal.savingsPercent + (goal.isOverflowTarget ? overflowPercent : 0);
  const allocatedAmount = leftover > 0 ? (effectivePct / 100) * leftover : 0;
  const color = goal.isOverflowTarget ? "var(--ok)" : "var(--accent)";
  const progressPct = goal.targetAmount !== null && goal.targetAmount > 0
    ? Math.min(100, Math.round((totalSaved / goal.targetAmount) * 100))
    : null;

  const [pctText, setPctText] = useState(goal.savingsPercent.toString());
  useEffect(() => {
    setPctText(goal.savingsPercent.toString());
  }, [goal.id, goal.savingsPercent]);

  const commitPct = () => {
    const val = parseInt(pctText, 10);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      if (val !== goal.savingsPercent) onPatchPercent(val);
    } else {
      setPctText(goal.savingsPercent.toString());
    }
  };

  const reachedTarget = goal.targetAmount !== null && goal.targetAmount > 0 && allocatedAmount >= goal.targetAmount;

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: goal.isOverflowTarget
          ? "2px solid var(--ok)"
          : reachedTarget
          ? "1px solid var(--ok)"
          : "1px solid var(--line)",
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      {/* Drag handle — reorder goals */}
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", goal.id);
          onDragStartHandle();
        }}
        onDragEnd={onDragEndHandle}
        title="Arrastrar para reordenar"
        style={{
          flex: "0 0 auto",
          cursor: "grab",
          color: "var(--fg-subtle)",
          fontSize: 15,
          lineHeight: 1,
          userSelect: "none",
          letterSpacing: "-2px",
          paddingRight: 2,
        }}
      >
        ⠿
      </span>

      {/* Donut — progress toward target if set, otherwise allocation % */}
      <div style={{ position: "relative", flex: "0 0 auto", width: "clamp(38px, 3.4vw, 52px)", height: "clamp(38px, 3.4vw, 52px)" }}>
        <GoalDonut pct={progressPct ?? effectivePct} color={color} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--fg)" }}>
            {progressPct !== null ? `${progressPct}%` : `${effectivePct}%`}
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {goal.name}
          </span>
          {goal.isOverflowTarget && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                color: "var(--ok)",
                background: "rgba(34,197,94,0.15)",
                borderRadius: 4,
                padding: "1px 5px",
              }}
            >
              Overflow
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            inputMode="numeric"
            value={pctText}
            onChange={(e) => setPctText(e.target.value)}
            onBlur={commitPct}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="input"
            style={{ width: 48, textAlign: "right", padding: "3px 6px", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
          />
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>%</span>
          {goal.isOverflowTarget && overflowPercent > 0 && (
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>+{overflowPercent}%</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: allocatedAmount > 0 ? "var(--fg)" : "var(--fg-subtle)", marginLeft: 4 }}>
            {fmtMoney(allocatedAmount, { compact: true })}
          </span>
        </div>

        {goal.targetAmount !== null && (
          <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 4 }}>
            {totalSaved > 0
              ? <><span style={{ color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(totalSaved, { compact: true })}</span> / {fmtMoney(goal.targetAmount, { compact: true })}</>
              : <>Target: {fmtMoney(goal.targetAmount)}</>
            }
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {!goal.isOverflowTarget ? (
            <button
              className="btn ghost"
              style={{ padding: "2px 7px", fontSize: 10.5 }}
              onClick={onSetOverflow}
            >
              Set overflow
            </button>
          ) : (
            <button
              className="btn ghost"
              style={{ padding: "2px 7px", fontSize: 10.5 }}
              onClick={onUnsetOverflow}
            >
              Unset overflow
            </button>
          )}
          {reachedTarget && (
            <button
              className="btn"
              style={{ padding: "2px 7px", fontSize: 10.5, color: "var(--ok)", borderColor: "var(--ok)" }}
              onClick={onMarkPurchased}
            >
              Mark purchased
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline expense row (collapsible — read-only info, edit via modal) ─────────
function InlineExpenseRow({
  expense,
  categories,
  lineItems,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  categories: ExpenseCategory[];
  lineItems: ExpenseLineItem[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = expense.categoryId ? categories.find((c) => c.id === expense.categoryId) ?? null : null;
  const colors = cat ? colorsForHue(cat.hue) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const date = fromYmd(expense.spentOn);
  const displayName = expense.name || expense.note || cat?.name || "Untitled";
  const expLineItems = lineItems.filter((li) => li.expenseId === expense.id && !li.deletedAt);
  const liTotal = expLineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{ display: "grid", gridTemplateColumns: "44px 8px 1fr auto auto", gap: 10, alignItems: "center", padding: "8px 10px", cursor: "pointer" }}
      >
        <span style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {date.toLocaleDateString("da-DK", { day: "2-digit", month: "short" })}
        </span>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: colors.bg }} />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
            {expense.recurrence && <IRecurring size={11} stroke={2} />}
          </div>
          {expLineItems.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>
              {expLineItems.length} item{expLineItems.length > 1 ? "s" : ""} · {fmtMoney(liTotal)}
            </span>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
          {fmtMoney(expense.amount)}
        </span>
        {expanded ? <IChevU size={12} /> : <IChevD size={12} />}
      </div>

      {/* Expanded — read-only */}
      {expanded && (
        <div
          style={{ borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Note */}
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)", marginBottom: 3 }}>Note</div>
            {expense.note
              ? <p style={{ margin: 0, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.4 }}>{expense.note}</p>
              : <p style={{ margin: 0, fontSize: 12, color: "var(--fg-subtle)", fontStyle: "italic" }}>No note</p>
            }
          </div>

          {/* Items */}
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)", marginBottom: 3 }}>
              Items{expLineItems.length > 0 && ` · ${fmtMoney(liTotal)}`}
            </div>
            {expLineItems.length === 0
              ? <p style={{ margin: 0, fontSize: 12, color: "var(--fg-subtle)", fontStyle: "italic" }}>No items</p>
              : expLineItems.map((li) => (
                  <div key={li.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center", fontSize: 12, color: "var(--fg-muted)", padding: "2px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{li.quantity}×</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(li.unitPrice)}</span>
                    <span style={{ color: "var(--fg)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>= {fmtMoney(li.quantity * li.unitPrice)}</span>
                  </div>
                ))
            }
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
            <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={onEdit}>Edit</button>
            <button className="btn ghost danger" style={{ padding: "4px 10px", fontSize: 11, marginLeft: "auto" }} onClick={onDelete}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recurring section (unchanged logic, visual update) ────────────────────────
function RecurringSection({
  expenses,
  categories,
  onEdit,
  onPause,
}: {
  expenses: Expense[];
  categories: ExpenseCategory[];
  onEdit: (e: Expense) => void;
  onPause: (e: Expense) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 600,
          color: "var(--fg-muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <IRecurring size={11} stroke={2} /> Recurring · {expenses.length}
      </div>
      {expenses.map((e) => {
        const c = e.categoryId ? categories.find((c) => c.id === e.categoryId) ?? null : null;
        const cols = c ? colorsForHue(c.hue) : { bg: "var(--bg-sunken)" };
        return (
          <div
            key={e.id}
            onClick={() => onEdit(e)}
            style={{
              display: "grid",
              gridTemplateColumns: "10px 1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "8px 12px",
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: cols.bg }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.name || e.note || c?.name || "Untitled"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                {e.recurrence ? formatRule(e.recurrence) : ""} · next {e.spentOn}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(e.amount)}
            </span>
            <button
              className="btn ghost"
              style={{ padding: "4px 8px", fontSize: 11.5 }}
              onClick={(ev) => { ev.stopPropagation(); onPause(e); }}
              title="Stop generating future instances"
            >
              Pause
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Income input ──────────────────────────────────────────────────────────────
function IncomeInput({
  month,
  currentAmount,
  onSave,
}: {
  month: string;
  currentAmount: number;
  onSave: (amount: number) => void;
}) {
  const [text, setText] = useState<string>(
    currentAmount > 0 ? currentAmount.toString().replace(".", ",") : "",
  );

  useEffect(() => {
    setText(currentAmount > 0 ? currentAmount.toString().replace(".", ",") : "");
  }, [month, currentAmount]);

  const commit = () => {
    const parsed = parseMoney(text);
    const amount = parsed === null || parsed < 0 ? 0 : parsed;
    if (amount !== currentAmount) onSave(amount);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)" }}>
        Income
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="input"
        style={{ width: 110, fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "4px 8px", fontSize: 13, fontWeight: 600 }}
      />
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{CURRENCY}</span>
    </span>
  );
}

// ── Per-account income row ────────────────────────────────────────────────────
function AccountIncomeRow({
  account,
  amount,
  onSave,
}: {
  account: Account;
  amount: number;
  onSave: (amount: number) => void;
}) {
  const [text, setText] = useState<string>(amount > 0 ? amount.toString().replace(".", ",") : "");
  useEffect(() => {
    setText(amount > 0 ? amount.toString().replace(".", ",") : "");
  }, [account.id, amount]);

  const commit = () => {
    const parsed = parseMoney(text);
    const next = parsed === null || parsed < 0 ? 0 : parsed;
    if (next !== amount) onSave(next);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {account.name}
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="input"
        style={{ width: 100, fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "4px 8px", fontSize: 12.5 }}
      />
      <span style={{ fontSize: 11, color: "var(--fg-subtle)", width: 28 }}>{account.currency}</span>
    </div>
  );
}

// ── Income-by-account section ─────────────────────────────────────────────────
function IncomeByAccountSection({
  accounts,
  incomeByAccountId,
  onSave,
}: {
  accounts: Account[];
  incomeByAccountId: Record<string, number>;
  onSave: (account: Account, amount: number) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
        Ingresos por cuenta
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {accounts.map((a) => (
          <AccountIncomeRow
            key={a.id}
            account={a}
            amount={incomeByAccountId[a.id] ?? 0}
            onSave={(amount) => onSave(a, amount)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Transfer modal (record a movement between accounts) ───────────────────────
const KIND_LABEL: Record<TransferKind, string> = {
  transfer: "Transferencia",
  savings: "Ahorro",
  investment: "Inversion",
};
const KIND_OPTIONS: TransferKind[] = ["transfer", "savings", "investment"];

function TransferModal({
  defaultDate,
  accounts,
  goals,
  onClose,
}: {
  defaultDate: string;
  accounts: Account[];
  goals: SavingsGoal[];
  onClose: () => void;
}) {
  const create = useCreateAccountTransfer();
  const [kind, setKind] = useState<TransferKind>("transfer");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [amountText, setAmountText] = useState<string>("");
  const [date, setDate] = useState<string>(defaultDate);
  const [goalId, setGoalId] = useState<string>("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Destino segun el tipo: ahorro -> destino de ahorro, inversion -> destino de
  // inversion, transferencia -> cualquiera. Si ninguna cumple, mostrar todas.
  const toAccounts = useMemo(() => {
    let filtered = accounts;
    if (kind === "savings") filtered = accounts.filter((a) => a.isSavingsTarget);
    else if (kind === "investment") filtered = accounts.filter((a) => a.isInvestmentTarget);
    return filtered.length > 0 ? filtered : accounts;
  }, [accounts, kind]);

  const fromAccount = accounts.find((a) => a.id === fromId) ?? null;
  const amount = parseMoney(amountText);
  const canSave = !!fromId && !!toId && fromId !== toId && amount !== null && amount > 0;

  const save = () => {
    if (!canSave || !fromAccount || amount === null) return;
    create.mutate({
      fromAccountId: fromId,
      toAccountId: toId,
      amount,
      currency: fromAccount.currency,
      transferredOn: date,
      kind,
      goalId: kind === "savings" && goalId ? goalId : null,
    });
    onClose();
  };

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 460 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Nueva transferencia
          </span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Tipo</label>
            <div className="control">
              <select className="input" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value as TransferKind)}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Desde</label>
            <div className="control">
              <select className="input" style={{ width: "auto" }} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">Elegir cuenta…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Hacia</label>
            <div className="control">
              <select className="input" style={{ width: "auto" }} value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Elegir cuenta…</option>
                {toAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
                ))}
              </select>
            </div>
          </div>

          {kind === "savings" && goals.length > 0 && (
            <div className="field">
              <label>Meta</label>
              <div className="control">
                <select className="input" style={{ width: "auto" }} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">(ninguna)</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="field">
            <label>Monto</label>
            <div className="control" style={{ alignItems: "center" }}>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0,00"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                className="input"
                style={{ width: 140, fontVariantNumeric: "tabular-nums", textAlign: "right", fontSize: 18, fontWeight: 600 }}
              />
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--fg-muted)", fontWeight: 600 }}>
                {fromAccount ? fromAccount.currency : CURRENCY}
              </span>
            </div>
          </div>

          <div className="field">
            <label>Fecha</label>
            <div className="control">
              <input type="date" className="input" style={{ width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span />
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button
              className="btn primary"
              onClick={save}
              disabled={!canSave}
              style={!canSave ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transfers section (recent movements for the month) ────────────────────────
function TransfersSection({
  month,
  transfers,
  accounts,
  onAdd,
  onDelete,
}: {
  month: string;
  transfers: AccountTransfer[];
  accounts: Account[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const nameOf = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "—" : "—");
  const monthTransfers = transfers.filter((t) => t.transferredOn.slice(0, 7) === month && !t.deletedAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
          Transferencias
        </span>
        <button className="btn ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={onAdd}>
          <IPlus size={11} /> Nueva
        </button>
      </div>
      {monthTransfers.length === 0 ? (
        <div style={{ padding: "12px", textAlign: "center", fontSize: 12, color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: 8 }}>
          Sin transferencias este mes.
        </div>
      ) : (
        monthTransfers.map((t) => (
          <div
            key={t.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "8px 10px",
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nameOf(t.fromAccountId)} → {nameOf(t.toAccountId)}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>
                {KIND_LABEL[t.kind]} · {t.transferredOn}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(t.amount)} {t.currency !== CURRENCY ? t.currency : ""}
            </span>
            <button className="icon-btn" style={{ color: "var(--fg-subtle)" }} onClick={() => onDelete(t.id)} title="Borrar">
              <ITrash size={12} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main BudgetView ───────────────────────────────────────────────────────────
export function BudgetView() {
  const { session } = useSession();
  const userId = session?.user.id;
  useMaterializeRecurringExpenses(userId);

  const expensesQ = useExpenses();
  const categoriesQ = useExpenseCategories();
  const budgetsQ = useBudgets();
  const lineItemsQ = useExpenseLineItems();
  const patchExpense = usePatchExpense();
  const deleteExpense = useDeleteExpense();

  const expenses = expensesQ.data ?? [];
  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const budgets = budgetsQ.data ?? [];
  const lineItems = lineItemsQ.data ?? [];

  const goalsQ = useSavingsGoals();
  const contributionsQ = useSavingsContributions();
  const incomesQ = useIncomes();
  const accountsQ = useAccounts();
  const transfersQ = useAccountTransfers();
  const upsertIncome = useUpsertIncome();
  const patchGoal = usePatchSavingsGoal();
  const deleteTransfer = useDeleteAccountTransfer();
  const goals = useMemo(() => goalsQ.data ?? [], [goalsQ.data]);
  const contributions = useMemo(() => contributionsQ.data ?? [], [contributionsQ.data]);
  const incomes = useMemo(() => incomesQ.data ?? [], [incomesQ.data]);
  const transfers = useMemo(() => transfersQ.data ?? [], [transfersQ.data]);
  const allAccounts = useMemo(() => (accountsQ.data ?? []).filter((a) => !a.archived), [accountsQ.data]);
  // Capability-driven account lists; fall back to all if none has the capability.
  const incomeAccounts = useMemo(() => {
    const r = allAccounts.filter((a) => a.receivesIncome);
    return r.length > 0 ? r : allAccounts;
  }, [allAccounts]);

  const [showTransferModal, setShowTransferModal] = useState(false);

  const {
    budgetMonth,
    setBudgetMonth,
    openExpenseCreate,
    openExpenseEdit,
    openBudgetManager,
    openExpenseCategoryManager,
  } = useApp();

  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [dragGoalId, setDragGoalId] = useState<string | null>(null);

  // Keep the pie at ~40% of the column height at all times; the rest of the height
  // goes to the legend (beside it) and the expenses list below.
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const [leftColH, setLeftColH] = useState<number | null>(null);
  useEffect(() => {
    const el = leftColRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setLeftColH(entries[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pieSizePx = leftColH != null ? leftColH * 0.40 : undefined;

  const monthExpenses = useMemo(
    () => expenses.filter((e) => expenseInMonth(e, budgetMonth) && !e.deletedAt),
    [expenses, budgetMonth],
  );
  const totalSpent = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  // Incomes are now per (month, account). Total = all incomes for the month;
  // the header input edits the "general" (no-account) income for backward compat.
  const monthIncomes = useMemo(
    () => incomes.filter((i) => i.month === budgetMonth && !i.deletedAt),
    [incomes, budgetMonth],
  );
  const incomeAmount = monthIncomes.reduce((s, i) => s + i.amount, 0);
  const generalIncomeAmount = monthIncomes.find((i) => !i.accountId)?.amount ?? 0;
  const incomeByAccountId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of monthIncomes) if (i.accountId) map[i.accountId] = i.amount;
    return map;
  }, [monthIncomes]);
  const leftover = incomeAmount - totalSpent;

  // Savings allocation
  const activeGoals = useMemo(
    () => goals.filter((g) => !g.purchasedAt && !g.deletedAt).sort((a, b) => a.position - b.position),
    [goals],
  );
  const purchasedGoals = useMemo(() => goals.filter((g) => g.purchasedAt && !g.deletedAt), [goals]);
  const totalExplicitPct = activeGoals.reduce((s, g) => s + g.savingsPercent, 0);
  const overflowPercent = Math.max(0, 100 - totalExplicitPct);
  const overflowGoal = activeGoals.find((g) => g.isOverflowTarget);
  const totalAllocated = leftover > 0
    ? activeGoals.reduce((s, g) => {
        const eff = g.savingsPercent + (g.isOverflowTarget ? overflowPercent : 0);
        return s + (eff / 100) * leftover;
      }, 0)
    : 0;

  // Cumulative saved per goal (sum of all contributions)
  const savedByGoalId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contributions) {
      if (c.deletedAt) continue;
      map[c.goalId] = (map[c.goalId] ?? 0) + c.amount;
    }
    return map;
  }, [contributions]);

  const recurringActive = useMemo(() => {
    const byRoot = new Map<string, Expense>();
    for (const e of expenses) {
      if (!e.recurrence || e.deletedAt) continue;
      const root = e.recurrenceParentId ?? e.id;
      const prev = byRoot.get(root);
      if (!prev || prev.spentOn < e.spentOn) byRoot.set(root, e);
    }
    return [...byRoot.values()].sort((a, b) => a.spentOn.localeCompare(b.spentOn));
  }, [expenses]);

  const filteredExpenses = filterCategoryId
    ? monthExpenses.filter((e) => e.categoryId === filterCategoryId)
    : monthExpenses;

  const onPauseRecurring = (e: Expense) => {
    patchExpense.mutate({ id: e.id, patch: { recurrence: null } });
  };

  // Drag-and-drop reorder of savings goals (persists each goal's `position`).
  const reorderGoals = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ordered = [...activeGoals];
    const from = ordered.findIndex((g) => g.id === fromId);
    const to = ordered.findIndex((g) => g.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    ordered.forEach((g, idx) => {
      if (g.position !== idx) patchGoal.mutate({ id: g.id, patch: { position: idx } });
    });
  };

  return (
    <div className="day-view-main">
      {/* Header */}
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
            Budget
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {ymToLabel(budgetMonth)}
          </div>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 12,
              color: "var(--fg-muted)",
              flexWrap: "wrap",
            }}
          >
            <IncomeInput
              month={budgetMonth}
              currentAmount={generalIncomeAmount}
              onSave={(amount) => upsertIncome.mutate({ month: budgetMonth, amount, currency: CURRENCY, accountId: null })}
            />
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span>
              <span style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtMoney(totalSpent)}</span>{" "}
              spent{totalBudget > 0 && <> of {fmtMoney(totalBudget)} ({pctUsed}%)</>}
            </span>
            {incomeAmount > 0 && (
              <>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span>
                  <span
                    style={{
                      color: leftover < 0 ? "var(--danger)" : "var(--fg)",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtMoney(leftover)}
                  </span>{" "}
                  leftover
                </span>
                {totalAllocated > 0 && (
                  <>
                    <span style={{ color: "var(--line-strong)" }}>·</span>
                    <span>
                      <span style={{ color: "var(--ok)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(totalAllocated)}
                      </span>{" "}
                      to savings
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" onClick={() => setBudgetMonth(shiftMonth(budgetMonth, -1))} title="Previous month">
          <IChevL size={15} />
        </button>
        <button className="icon-btn" onClick={() => setBudgetMonth(shiftMonth(budgetMonth, 1))} title="Next month">
          <IChevR size={15} />
        </button>
        <button className="btn" onClick={() => openExpenseCreate({ spentOn: new Date().toISOString().slice(0, 10) })}>
          <IPlus size={12} /> Expense
        </button>
        <button className="btn ghost" onClick={openBudgetManager}>Edit budgets</button>
        <button className="btn ghost" onClick={openExpenseCategoryManager}>Categories</button>
      </header>

      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 24,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* LEFT — spending overview */}
        <div ref={leftColRef} style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, minHeight: 0 }}>
          {/* Spending pie (row layout: pie beside category legend) */}
          <SpendingPie
            expenses={monthExpenses}
            categories={categories}
            layout="row"
            fill={false}
            sizePx={pieSizePx}
            limit={totalBudget > 0 ? totalBudget : undefined}
            budgets={budgets}
          />

          {/* Scrollable: expenses + recurring (pie above stays pinned) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 120, overflowY: "auto" }}>
          {/* Expenses section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
                color: "var(--fg-muted)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span>Expenses · {filteredExpenses.length}</span>
              {filterCategoryId && (
                <button
                  className="btn ghost"
                  style={{ padding: "2px 6px", fontSize: 11 }}
                  onClick={() => setFilterCategoryId(null)}
                >
                  Clear filter
                </button>
              )}
            </div>
            {filteredExpenses.length === 0 && (
              <div
                style={{
                  padding: "20px 12px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--fg-subtle)",
                  border: "1px dashed var(--line)",
                  borderRadius: 8,
                }}
              >
                No expenses to show.
              </div>
            )}
            {filteredExpenses.map((e) => (
              <InlineExpenseRow
                key={e.id}
                expense={e}
                categories={categories}
                lineItems={lineItems}
                expanded={expandedExpenseId === e.id}
                onToggle={() => setExpandedExpenseId(expandedExpenseId === e.id ? null : e.id)}
                onEdit={() => openExpenseEdit(e.id)}
                onDelete={() => {
                  deleteExpense.mutate(e.id);
                  if (expandedExpenseId === e.id) setExpandedExpenseId(null);
                }}
              />
            ))}
          </div>

          {/* Recurring */}
          {recurringActive.length > 0 && (
            <RecurringSection
              expenses={recurringActive}
              categories={categories}
              onEdit={(e) => openExpenseEdit(e.id)}
              onPause={onPauseRecurring}
            />
          )}
          </div>
        </div>

        {/* RIGHT — income (top) + savings (half) + transfers (half) */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, gap: 12 }}>
          {/* Income by account (compact, fixed) */}
          <IncomeByAccountSection
            accounts={incomeAccounts}
            incomeByAccountId={incomeByAccountId}
            onSave={(account, amount) =>
              upsertIncome.mutate({ month: budgetMonth, amount, currency: account.currency, accountId: account.id })
            }
          />

          {/* Savings — top half, scrolls on its own */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
          {/* Savings section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
                color: "var(--fg-muted)",
              }}
            >
              <span>Savings</span>
              {activeGoals.length > 0 && (
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    textTransform: "none",
                    letterSpacing: 0,
                    fontWeight: 400,
                    color: "var(--fg-subtle)",
                    fontSize: 11,
                    flex: 1,
                    textAlign: "right",
                  }}
                >
                  {totalExplicitPct}% explicit
                  {overflowPercent > 0 && !overflowGoal && (
                    <span style={{ color: "var(--fg-subtle)" }}> · {overflowPercent}% unassigned</span>
                  )}
                </span>
              )}
            </div>

            {activeGoals.length === 0 && (
              <div
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--fg-subtle)",
                  border: "1px dashed var(--line)",
                  borderRadius: 8,
                }}
              >
                No savings goals yet. Click <strong>Goals</strong> to add one.
              </div>
            )}

            {activeGoals.map((g) => (
              <div
                key={g.id}
                onDragEnter={(e) => { if (dragGoalId) e.preventDefault(); }}
                onDragOver={(e) => { if (dragGoalId) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (dragGoalId) reorderGoals(dragGoalId, g.id); setDragGoalId(null); }}
                style={{ opacity: dragGoalId === g.id ? 0.5 : 1, transition: "opacity .12s" }}
              >
                <SavingsGoalCard
                  goal={g}
                  leftover={leftover}
                  overflowPercent={overflowPercent}
                  totalSaved={savedByGoalId[g.id] ?? 0}
                  onPatchPercent={(pct) => patchGoal.mutate({ id: g.id, patch: { savingsPercent: pct } })}
                  onSetOverflow={() => patchGoal.mutate({ id: g.id, patch: { isOverflowTarget: true } })}
                  onUnsetOverflow={() => patchGoal.mutate({ id: g.id, patch: { isOverflowTarget: false } })}
                  onMarkPurchased={() => patchGoal.mutate({ id: g.id, patch: { purchasedAt: new Date().toISOString() } })}
                  onDragStartHandle={() => setDragGoalId(g.id)}
                  onDragEndHandle={() => setDragGoalId(null)}
                />
              </div>
            ))}

            {purchasedGoals.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    fontWeight: 600,
                    color: "var(--fg-subtle)",
                    marginBottom: 4,
                  }}
                >
                  Purchased · {purchasedGoals.length}
                </div>
                {purchasedGoals.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 10px",
                      background: "var(--bg-elev)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      opacity: 0.6,
                      marginTop: 2,
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, textDecoration: "line-through", color: "var(--fg-subtle)" }}>
                      {g.name}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ok)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                      Bought
                    </span>
                    <button
                      className="btn ghost"
                      style={{ padding: "3px 8px", fontSize: 11 }}
                      onClick={() => patchGoal.mutate({ id: g.id, patch: { purchasedAt: null } })}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>

          {/* Transfers — bottom half, scrolls on its own */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
          {/* Transfers section */}
          <TransfersSection
            month={budgetMonth}
            transfers={transfers}
            accounts={allAccounts}
            onAdd={() => setShowTransferModal(true)}
            onDelete={(id) => deleteTransfer.mutate(id)}
          />
          </div>
        </div>
      </div>

      {showTransferModal && (
        <TransferModal
          defaultDate={`${budgetMonth}-15`}
          accounts={allAccounts}
          goals={activeGoals}
          onClose={() => setShowTransferModal(false)}
        />
      )}
    </div>
  );
}
