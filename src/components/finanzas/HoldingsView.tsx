import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { convertViaUsd, DEFAULT_RATES_PER_USD, fmtMoneyIn, parseMoney } from "../../lib/money";
import { computeNetWorth } from "../../lib/netWorth";
import { fetchLiveRates } from "../../lib/exchangeRates";
import { useNetWorthSnapshot } from "../../lib/useNetWorthSnapshot";
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useFinanzasSettings,
  usePatchAccount,
  useUpsertFinanzasSettings,
} from "../../lib/queries";
import type { Account, AccountCurrency, AccountOwner, AccountType } from "../../types";
import { ICheck, IPlus, IRefresh, ITrash, IX } from "../icons";
import { NetWorthChart } from "./NetWorthChart";
import { PortfolioPie } from "./PortfolioPie";

const CURRENCY_OPTIONS: AccountCurrency[] = ["DKK", "USD", "EUR", "ARS"];

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

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

export function HoldingsView() {
  const accountsQ = useAccounts();
  const finSettingsQ = useFinanzasSettings();
  const upsertFinSettings = useUpsertFinanzasSettings();

  const ratesPerUsd: Record<string, number> = {
    USD: 1,
    DKK: finSettingsQ.data?.ratesPerUsd.DKK ?? DEFAULT_RATES_PER_USD.DKK,
    EUR: finSettingsQ.data?.ratesPerUsd.EUR ?? DEFAULT_RATES_PER_USD.EUR,
    ARS: finSettingsQ.data?.ratesPerUsd.ARS ?? DEFAULT_RATES_PER_USD.ARS,
  };
  const baseCurrency: AccountCurrency = finSettingsQ.data?.baseCurrency ?? "DKK";
  const ratesUpdatedAt = finSettingsQ.data?.ratesUpdatedAt ?? null;

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshRates = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const live = await fetchLiveRates();
      await upsertFinSettings.mutateAsync({
        ratesPerUsd: { USD: 1, DKK: live.dkkPerUsd, EUR: live.eurPerUsd, ARS: live.arsPerUsd },
        ratesUpdatedAt: new Date().toISOString(),
      });
    } catch {
      setRefreshError("No se pudo actualizar la cotizacion");
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch once a day, automatically, as soon as the settings row is known.
  useEffect(() => {
    if (!finSettingsQ.isSuccess || isToday(ratesUpdatedAt)) return;
    refreshRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finSettingsQ.isSuccess, ratesUpdatedAt]);

  const toBase = (amount: number, currency: string) => convertViaUsd(amount, currency, baseCurrency, ratesPerUsd);

  const accounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => !a.archived),
    [accountsQ.data],
  );

  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);

  const netWorth = useMemo(
    () => computeNetWorth(accounts, baseCurrency, ratesPerUsd),
    [accounts, ratesPerUsd, baseCurrency],
  );

  const netWorthSnapshotsQ = useNetWorthSnapshot(accounts, baseCurrency, ratesPerUsd, accountsQ.isSuccess);

  // Holdings se divide en dos lados: cuentas bancarias (agrupadas por titular,
  // como antes) e inversiones (broker/inversion, con su propio piechart de
  // composicion de portfolio) — ver [[project_finanzas_tabs_reorg]].
  const isInvestment = (a: Account) => a.type === "investment" || a.type === "broker";
  const bankAccounts = useMemo(() => accounts.filter((a) => !isInvestment(a)), [accounts]);
  const investmentAccounts = useMemo(() => accounts.filter(isInvestment), [accounts]);

  const grouped = useMemo(() => {
    const byOwner = new Map<AccountOwner, Account[]>();
    for (const a of bankAccounts) {
      const list = byOwner.get(a.owner) ?? [];
      list.push(a);
      byOwner.set(a.owner, list);
    }
    return OWNER_ORDER.filter((o) => byOwner.has(o)).map((owner) => ({
      owner,
      accounts: byOwner.get(owner)!,
      subtotal: (byOwner.get(owner) ?? []).reduce((s, a) => s + toBase(a.balance, a.currency), 0),
    }));
  }, [bankAccounts, ratesPerUsd, baseCurrency]);

  const portfolioItems = useMemo(
    () => investmentAccounts.map((a) => ({ id: a.id, name: a.name, amount: toBase(a.balance, a.currency) })),
    [investmentAccounts, ratesPerUsd, baseCurrency],
  );

  const sectionHeaderStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: ".06em",
    color: "var(--fg-subtle)",
    fontWeight: 600,
  };

  const renderAccountRow = (a: Account) => (
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
          {fmtMoneyIn(a.balance, a.currency)}
        </div>
        {a.currency !== baseCurrency && (
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-subtle)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ≈ {fmtMoneyIn(toBase(a.balance, a.currency), baseCurrency)}
          </div>
        )}
      </div>
    </button>
  );

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
            {fmtMoneyIn(netWorth, baseCurrency)}
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span>
              {accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}
            </span>
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span>
              1 USD = {ratesPerUsd.DKK.toFixed(2)} DKK · {ratesPerUsd.EUR.toFixed(2)} EUR ·{" "}
              {Math.round(ratesPerUsd.ARS).toLocaleString("es-AR")} ARS (oficial)
            </span>
            <span style={{ color: "var(--fg-subtle)" }}>
              {ratesUpdatedAt ? (isToday(ratesUpdatedAt) ? "hoy" : `actualizado ${ratesUpdatedAt.slice(0, 10)}`) : "sin cotizacion"}
            </span>
            <button
              className="icon-btn"
              onClick={refreshRates}
              disabled={refreshing}
              title={refreshing ? "Actualizando..." : "Actualizar cotizacion"}
              style={{ color: "var(--fg-subtle)", opacity: refreshing ? 0.5 : 1 }}
            >
              <IRefresh size={12} />
            </button>
            {refreshError && <span style={{ color: "var(--danger)" }}>{refreshError}</span>}
          </div>
        </div>
        <div className="control" style={{ alignSelf: "center" }}>
          <select
            className="input"
            style={{ width: "auto" }}
            value={baseCurrency}
            onChange={(e) =>
              upsertFinSettings.mutate({ baseCurrency: e.target.value as AccountCurrency })
            }
            title="Moneda base del patrimonio neto"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button className="btn primary" style={{ alignSelf: "center" }} onClick={() => setEditor({ mode: "create" })}>
          <IPlus size={12} /> Nueva cuenta
        </button>
      </header>

      <div style={{ marginTop: 12 }}>
        <NetWorthChart snapshots={netWorthSnapshotsQ.data ?? []} baseCurrency={baseCurrency} />
      </div>

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
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flex: 1, minHeight: 0, overflowY: "auto" }}>
          {/* IZQUIERDA — cuentas bancarias, agrupadas por titular */}
          <div>
            <div style={sectionHeaderStyle}>Cuentas</div>
            {bankAccounts.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "12px 2px" }}>
                Sin cuentas bancarias todavia.
              </div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 18 }}>
                {grouped.map((group) => (
                  <section key={group.owner}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={sectionHeaderStyle}>{OWNER_LABEL[group.owner]}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoneyIn(group.subtotal, baseCurrency)}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {group.accounts.map((a) => renderAccountRow(a))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* DERECHA — inversiones: piechart de composicion + lista */}
          <div>
            <div style={sectionHeaderStyle}>Inversiones</div>
            <div style={{ marginTop: 8 }}>
              <PortfolioPie items={portfolioItems} currency={baseCurrency} />
            </div>
            {investmentAccounts.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column" }}>
                {investmentAccounts.map((a) => renderAccountRow(a))}
              </div>
            )}
          </div>
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

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isBusy = create.isPending || patch.isPending || remove.isPending || saving;

  const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout — reintentá si sigue pasando")), 10_000)),
    ]);

  const save = async () => {
    const name = draft.name.trim();
    if (!name || saving) return;
    const balance = parseMoney(balanceText) ?? 0;
    setSaving(true);
    setError(null);
    try {
      if (mode === "edit" && existing) {
        // A manual balance edit must also move the opening_balance/balance_as_of
        // anchor to today, or the next reconcileAccountBalances() self-heal
        // (runs on every app start) recomputes from the OLD anchor and overwrites
        // this edit right back to the stale value.
        const balanceChanged = balance !== existing.balance;
        await withTimeout(
          patch.mutateAsync({
            id: existing.id,
            patch: {
              name,
              owner: draft.owner,
              type: draft.type,
              currency: draft.currency,
              balance,
              ...(balanceChanged && {
                openingBalance: balance,
                balanceAsOf: new Date().toISOString().slice(0, 10),
              }),
              institution: draft.institution.trim(),
              note: draft.note.trim(),
              receivesIncome: draft.receivesIncome,
              paysExpenses: draft.paysExpenses,
              isSavingsTarget: draft.isSavingsTarget,
              isInvestmentTarget: draft.isInvestmentTarget,
            },
          }),
        );
      } else {
        // Phase B: opening balance = balance.
        await withTimeout(
          create.mutateAsync({
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
          }),
        );
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setSaving(false);
    }
  };

  const onArchive = async () => {
    if (saving) return;
    if (mode === "edit" && existing) {
      setSaving(true);
      setError(null);
      try {
        await withTimeout(patch.mutateAsync({ id: existing.id, patch: { archived: true } }));
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo archivar");
        setSaving(false);
      }
    } else {
      onClose();
    }
  };

  const onDelete = async () => {
    if (saving) return;
    if (mode === "edit" && existing) {
      setSaving(true);
      setError(null);
      try {
        await withTimeout(remove.mutateAsync(existing.id));
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo borrar");
        setSaving(false);
      }
    } else {
      onClose();
    }
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
          {error && (
            <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>
          )}
        </div>

        <div className="modal-foot">
          {mode === "edit" ? (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  className="btn ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={isBusy}
                  style={{ padding: "4px 8px", fontSize: 11.5 }}
                >
                  Cancelar
                </button>
                <button
                  className="btn"
                  onClick={onDelete}
                  disabled={isBusy}
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
                <button className="btn ghost" onClick={onArchive} disabled={isBusy}>
                  Archivar
                </button>
                <button className="btn ghost danger" onClick={() => setConfirmDelete(true)} disabled={isBusy}>
                  <ITrash size={12} /> Borrar
                </button>
              </div>
            )
          ) : (
            <span />
          )}
          <div className="actions">
            <button className="btn ghost" onClick={onClose} disabled={isBusy}>
              Cancelar
            </button>
            <button
              className="btn primary"
              onClick={save}
              disabled={draft.name.trim().length === 0 || isBusy}
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
