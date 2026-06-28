import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { DEFAULT_DKK_PER_USD, fmtMoney, fmtUsdFromDkk, parseMoney } from "../../lib/money";
import {
  useAccounts,
  useComprasSettings,
  useCreateAccount,
  useDeleteAccount,
  usePatchAccount,
} from "../../lib/queries";
import type { Account, AccountCurrency, AccountOwner, AccountType } from "../../types";
import { useApp } from "../../lib/store";
import { ICheck, IPlus, ITrash, IX } from "../icons";

const OWNER_ORDER: AccountOwner[] = ["agus", "sofi", "shared"];

const OWNER_LABEL: Record<AccountOwner, string> = {
  agus: "Agus",
  sofi: "Sofi",
  shared: "Compartida",
};

const TYPE_LABEL: Record<AccountType, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  investment: "Inversion",
  broker: "Broker",
  cash: "Efectivo",
};

const TYPE_OPTIONS: AccountType[] = ["checking", "savings", "investment", "broker", "cash"];
const OWNER_OPTIONS: AccountOwner[] = ["agus", "sofi", "shared"];
const CURRENCY_OPTIONS: AccountCurrency[] = ["DKK", "USD"];

/** Convert an account balance to DKK for net-worth aggregation. */
function balanceInDkk(a: Account, dkkPerUsd: number): number {
  return a.currency === "USD" ? a.balance * dkkPerUsd : a.balance;
}

export function HoldingsView() {
  const openSavingsGoalManager = useApp((s) => s.openSavingsGoalManager);
  const accountsQ = useAccounts();
  const settingsQ = useComprasSettings();
  const dkkPerUsd = settingsQ.data?.dkkPerUsd ?? DEFAULT_DKK_PER_USD;

  const accounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => !a.archived),
    [accountsQ.data],
  );

  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);

  const netWorth = useMemo(
    () => accounts.reduce((s, a) => s + balanceInDkk(a, dkkPerUsd), 0),
    [accounts, dkkPerUsd],
  );

  const grouped = useMemo(() => {
    const byOwner = new Map<AccountOwner, Account[]>();
    for (const a of accounts) {
      const list = byOwner.get(a.owner) ?? [];
      list.push(a);
      byOwner.set(a.owner, list);
    }
    return OWNER_ORDER.filter((o) => byOwner.has(o)).map((owner) => ({
      owner,
      accounts: byOwner.get(owner)!,
      subtotal: (byOwner.get(owner) ?? []).reduce((s, a) => s + balanceInDkk(a, dkkPerUsd), 0),
    }));
  }, [accounts, dkkPerUsd]);

  return (
    <div className="day-view-main">
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          paddingBottom: 8,
          borderBottom: "1px solid var(--line)",
          minHeight: 84,
          boxSizing: "border-box",
        }}
      >
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
            Patrimonio neto
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtMoney(netWorth)}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--fg-muted)" }}>
            <span>≈ {fmtUsdFromDkk(netWorth, dkkPerUsd)}</span>
            <span style={{ color: "var(--line-strong)", margin: "0 8px" }}>·</span>
            <span>
              {accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}
            </span>
          </div>
        </div>
        <button className="btn ghost" onClick={openSavingsGoalManager}>
          Metas de ahorro
        </button>
        <button className="btn primary" onClick={() => setEditor({ mode: "create" })}>
          <IPlus size={12} /> Nueva cuenta
        </button>
      </header>

      {/* Body */}
      {accounts.length === 0 ? (
        <div
          style={{
            marginTop: 24,
            padding: "28px 16px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--fg-subtle)",
            border: "1px dashed var(--line)",
            borderRadius: 10,
          }}
        >
          Todavia no hay cuentas. Crea la primera con "Nueva cuenta".
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 18 }}>
          {grouped.map((group) => (
            <section key={group.owner}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    color: "var(--fg-subtle)",
                    fontWeight: 600,
                  }}
                >
                  {OWNER_LABEL[group.owner]}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--fg-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtMoney(group.subtotal)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {group.accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setEditor({ mode: "edit", id: a.id })}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 8px",
                      borderBottom: "1px solid var(--line)",
                      background: "none",
                      border: 0,
                      borderBottomWidth: 1,
                      borderBottomStyle: "solid",
                      borderBottomColor: "var(--line)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    title="Editar cuenta"
                  >
                    <div style={{ minWidth: 0 }}>
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
                        {a.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 1 }}>
                        {TYPE_LABEL[a.type]}
                        {a.institution ? ` · ${a.institution}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "var(--fg)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {a.currency === "USD"
                          ? fmtUsdFromDkk(a.balance * dkkPerUsd, dkkPerUsd)
                          : fmtMoney(a.balance)}
                      </div>
                      {a.currency === "USD" && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--fg-subtle)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          ≈ {fmtMoney(a.balance * dkkPerUsd)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editor && (
        <AccountEditor
          mode={editor.mode}
          accountId={editor.mode === "edit" ? editor.id : undefined}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

// ── Account editor modal (create / edit) ──────────────────────────────────────

interface DraftFields {
  name: string;
  owner: AccountOwner;
  type: AccountType;
  currency: AccountCurrency;
  institution: string;
  note: string;
  receivesIncome: boolean;
  paysExpenses: boolean;
  isSavingsTarget: boolean;
  isInvestmentTarget: boolean;
}

function fromAccount(a: Account): DraftFields {
  return {
    name: a.name,
    owner: a.owner,
    type: a.type,
    currency: a.currency,
    institution: a.institution,
    note: a.note,
    receivesIncome: a.receivesIncome,
    paysExpenses: a.paysExpenses,
    isSavingsTarget: a.isSavingsTarget,
    isInvestmentTarget: a.isInvestmentTarget,
  };
}

function AccountEditor({
  mode,
  accountId,
  onClose,
}: {
  mode: "edit" | "create";
  accountId?: string;
  onClose: () => void;
}) {
  const accountsQ = useAccounts();
  const create = useCreateAccount();
  const patch = usePatchAccount();
  const remove = useDeleteAccount();

  const existing = mode === "edit" && accountId
    ? (accountsQ.data ?? []).find((a) => a.id === accountId)
    : undefined;

  const [draft, setDraft] = useState<DraftFields>(() =>
    existing
      ? fromAccount(existing)
      : {
          name: "",
          owner: "shared",
          type: "checking",
          currency: "DKK",
          institution: "",
          note: "",
          receivesIncome: false,
          paysExpenses: false,
          isSavingsTarget: false,
          isInvestmentTarget: false,
        },
  );
  const [balanceText, setBalanceText] = useState<string>(() =>
    existing && existing.balance !== 0 ? existing.balance.toString().replace(".", ",") : "",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing) {
      setDraft(fromAccount(existing));
      setBalanceText(existing.balance !== 0 ? existing.balance.toString().replace(".", ",") : "");
    }
  }, [existing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (p: Partial<DraftFields>) => setDraft((d) => ({ ...d, ...p }));

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const save = () => {
    const name = draft.name.trim();
    if (!name) return;
    const balance = parseMoney(balanceText) ?? 0;
    if (mode === "edit" && existing) {
      patch.mutate({
        id: existing.id,
        patch: {
          name,
          owner: draft.owner,
          type: draft.type,
          currency: draft.currency,
          balance,
          institution: draft.institution.trim(),
          note: draft.note.trim(),
          receivesIncome: draft.receivesIncome,
          paysExpenses: draft.paysExpenses,
          isSavingsTarget: draft.isSavingsTarget,
          isInvestmentTarget: draft.isInvestmentTarget,
        },
      });
    } else {
      // Phase B: opening balance = balance.
      create.mutate({
        name,
        owner: draft.owner,
        type: draft.type,
        currency: draft.currency,
        balance,
        openingBalance: balance,
        balanceAsOf: new Date().toISOString().slice(0, 10),
        institution: draft.institution.trim(),
        note: draft.note.trim(),
        receivesIncome: draft.receivesIncome,
        paysExpenses: draft.paysExpenses,
        isSavingsTarget: draft.isSavingsTarget,
        isInvestmentTarget: draft.isInvestmentTarget,
      });
    }
    onClose();
  };

  const onArchive = () => {
    if (mode === "edit" && existing) {
      patch.mutate({ id: existing.id, patch: { archived: true } });
    }
    onClose();
  };

  const onDelete = () => {
    if (mode === "edit" && existing) {
      remove.mutate(existing.id);
    }
    onClose();
  };

  const checkbox = (
    label: string,
    key: keyof Pick<
      DraftFields,
      "receivesIncome" | "paysExpenses" | "isSavingsTarget" | "isInvestmentTarget"
    >,
  ) => (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        color: "var(--fg-muted)",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={draft[key]}
        onChange={(e) => set({ [key]: e.target.checked } as Partial<DraftFields>)}
      />
      {label}
    </label>
  );

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 480 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {mode === "edit" ? "Editar cuenta" : "Nueva cuenta"}
          </span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Nombre</label>
            <input
              type="text"
              className="input"
              placeholder="ej. Nordea corriente, Revolut…"
              autoFocus
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>

          <div className="field">
            <label>Titular</label>
            <div className="control">
              <select
                className="input"
                style={{ width: "auto" }}
                value={draft.owner}
                onChange={(e) => set({ owner: e.target.value as AccountOwner })}
              >
                {OWNER_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {OWNER_LABEL[o]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Tipo</label>
            <div className="control">
              <select
                className="input"
                style={{ width: "auto" }}
                value={draft.type}
                onChange={(e) => set({ type: e.target.value as AccountType })}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Saldo</label>
            <div className="control" style={{ alignItems: "stretch" }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={balanceText}
                onChange={(e) => setBalanceText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                className="input"
                style={{
                  width: 140,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              />
              <select
                className="input"
                style={{ width: "auto", alignSelf: "center", marginLeft: 8 }}
                value={draft.currency}
                onChange={(e) => set({ currency: e.target.value as AccountCurrency })}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Funciones</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checkbox("Recibe ingresos", "receivesIncome")}
              {checkbox("Paga gastos", "paysExpenses")}
              {checkbox("Destino de ahorro", "isSavingsTarget")}
              {checkbox("Destino de inversion", "isInvestmentTarget")}
            </div>
          </div>

          <div className="field">
            <label>Institucion</label>
            <input
              type="text"
              className="input"
              placeholder="ej. Nordea, Revolut…"
              value={draft.institution}
              onChange={(e) => set({ institution: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Nota</label>
            <input
              type="text"
              className="input"
              placeholder="Opcional…"
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>
        </div>

        <div className="modal-foot">
          {mode === "edit" ? (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  className="btn ghost"
                  onClick={() => setConfirmDelete(false)}
                  style={{ padding: "4px 8px", fontSize: 11.5 }}
                >
                  Cancelar
                </button>
                <button
                  className="btn"
                  onClick={onDelete}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11.5,
                    color: "var(--danger)",
                    borderColor: "var(--danger)",
                  }}
                >
                  Borrar
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn ghost" onClick={onArchive}>
                  Archivar
                </button>
                <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>
                  <ITrash size={12} /> Borrar
                </button>
              </div>
            )
          ) : (
            <span />
          )}
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn primary"
              onClick={save}
              disabled={draft.name.trim().length === 0}
              style={draft.name.trim().length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              <ICheck size={12} stroke={2.4} /> Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
