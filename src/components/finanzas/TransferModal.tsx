import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { CURRENCY, parseMoney } from "../../lib/money";
import { useCreateAccountTransfer } from "../../lib/queries";
import type { Account, SavingsGoal, TransferKind } from "../../types";
import { IX } from "../icons";

export const KIND_LABEL: Record<TransferKind, string> = {
  transfer: "Transferencia",
  savings: "Ahorro",
  investment: "Inversion",
};
export const KIND_OPTIONS: TransferKind[] = ["transfer", "savings", "investment"];

interface Props {
  defaultDate: string;
  accounts: Account[];
  goals: SavingsGoal[];
  onClose: () => void;
  /** Prefill for opening this modal from a suggestion (e.g. Presupuesto's month-end transfer panel). */
  initialKind?: TransferKind;
  initialGoalId?: string;
  initialToId?: string;
  initialAmount?: number;
  /** Called right after the transfer is saved (e.g. to record per-goal savings_contributions
   *  when one transfer covers several goals sharing the same destination account). */
  onSaved?: () => void;
}

export function TransferModal({
  defaultDate,
  accounts,
  goals,
  onClose,
  initialKind,
  initialGoalId,
  initialToId,
  initialAmount,
  onSaved,
}: Props) {
  const create = useCreateAccountTransfer();
  const [kind, setKind] = useState<TransferKind>(initialKind ?? "transfer");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>(initialToId ?? "");
  const [amountText, setAmountText] = useState<string>(
    initialAmount && initialAmount > 0 ? initialAmount.toString().replace(".", ",") : "",
  );
  const [date, setDate] = useState<string>(defaultDate);
  const [goalId, setGoalId] = useState<string>(initialGoalId ?? "");

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

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isBusy = create.isPending || saving;

  const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout — reintentá si sigue pasando")), 10_000)),
    ]);

  const save = async () => {
    if (!canSave || !fromAccount || amount === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      await withTimeout(
        create.mutateAsync({
          fromAccountId: fromId,
          toAccountId: toId,
          amount,
          currency: fromAccount.currency,
          transferredOn: date,
          kind,
          goalId: kind === "savings" && goalId ? goalId : null,
        }),
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setSaving(false);
    }
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
          {error && (
            <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>
          )}
        </div>

        <div className="modal-foot">
          <span />
          <div className="actions">
            <button className="btn ghost" onClick={onClose} disabled={isBusy}>Cancelar</button>
            <button
              className="btn primary"
              onClick={save}
              disabled={!canSave || isBusy}
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
