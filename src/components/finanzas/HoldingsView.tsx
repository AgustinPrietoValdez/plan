import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type MouseEvent } from "react";
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
import { ICheck, IRefresh, ITrash, IX } from "../icons";
import { NetWorthChart } from "./NetWorthChart";
import { PortfolioPie } from "./PortfolioPie";

// Mismo frame de diseño 1280×720 (2× a 2560×1440) que Home/Café/Finanzas — `--s`
// lo pone FinanzasView en la raíz y cascadea hasta acá.
function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

const sectionLabelStyle = {
  fontSize: fluid(11),
  textTransform: "uppercase" as const,
  letterSpacing: ".06em",
  color: "var(--fg-subtle)",
  fontWeight: 600,
};

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

export interface HoldingsViewHandle {
  openCreate: () => void;
}

export const HoldingsView = forwardRef<HoldingsViewHandle>(function HoldingsView(_props, ref) {
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

  useImperativeHandle(ref, () => ({
    openCreate: () => setEditor({ mode: "create" }),
  }));

  const netWorth = useMemo(
    () => computeNetWorth(accounts, baseCurrency, ratesPerUsd),
    [accounts, ratesPerUsd, baseCurrency],
  );

  const netWorthSnapshotsQ = useNetWorthSnapshot(accounts, baseCurrency, ratesPerUsd, accountsQ.isSuccess);
  const chartSnapshots = netWorthSnapshotsQ.data ?? [];

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

  const renderAccountRow = (a: Account) => (
    <button
      key={a.id}
      onClick={() => setEditor({ mode: "edit", id: a.id })}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: fluid(12),
        alignItems: "center",
        padding: `${fluid(9)} 0`,
        borderTop: "1px solid var(--line)",
        background: "none",
        border: 0,
        borderTopWidth: 1,
        borderTopStyle: "solid",
        borderTopColor: "var(--line)",
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
      }}
      title="Editar cuenta"
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: fluid(13), fontWeight: 500, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.name}
        </div>
        <div style={{ fontSize: fluid(11), color: "var(--fg-muted)", marginTop: 1 }}>
          {TYPE_LABEL[a.type]}
          {a.institution ? ` · ${a.institution}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: fluid(13), fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
          {fmtMoneyIn(a.balance, a.currency)}
        </div>
        {a.currency !== baseCurrency && (
          <div style={{ fontSize: fluid(10.5), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
            ≈ {fmtMoneyIn(toBase(a.balance, a.currency), baseCurrency)}
          </div>
        )}
      </div>
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(14), flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: fluid(14), flexWrap: "wrap", flex: "0 0 auto" }}>
        <div style={{ flex: 1, minWidth: fluid(260) }}>
          <div style={sectionLabelStyle}>Patrimonio neto</div>
          <div style={{ fontSize: fluid(28), fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
            {fmtMoneyIn(netWorth, baseCurrency)}
          </div>
          <div style={{ marginTop: fluid(3), fontSize: fluid(11), color: "var(--fg-muted)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: fluid(6) }}>
            <span>{accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}</span>
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span>
              1 USD = {ratesPerUsd.DKK.toFixed(2)} DKK · {ratesPerUsd.EUR.toFixed(2)} EUR ·{" "}
              {Math.round(ratesPerUsd.ARS).toLocaleString("es-AR")} ARS
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
        <select
          className="input"
          style={{ border: "1px solid var(--line)", background: "var(--bg-elev)", borderRadius: fluid(6), outline: 0, alignSelf: "center", width: "auto", fontSize: fluid(12), padding: `${fluid(5)} ${fluid(20)} ${fluid(5)} ${fluid(8)}` }}
          value={baseCurrency}
          onChange={(e) => upsertFinSettings.mutate({ baseCurrency: e.target.value as AccountCurrency })}
          title="Moneda base del patrimonio neto"
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Net worth chart card */}
      <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: `${fluid(14)} ${fluid(16)}`, boxShadow: "var(--shadow-sm)", flex: "0 0 auto" }}>
        <NetWorthChart snapshots={chartSnapshots} baseCurrency={baseCurrency} />
      </div>

      {/* Body */}
      {accounts.length === 0 ? (
        <div style={{ padding: `${fluid(28)} ${fluid(16)}`, textAlign: "center", fontSize: fluid(13), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(10) }}>
          Todavia no hay cuentas. Crea la primera con "Nueva cuenta".
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: fluid(20), flex: 1, minHeight: 0 }}>
          {/* IZQUIERDA — cuentas bancarias, agrupadas por titular. El titulo
              queda fijo — solo el contenido de abajo scrollea. */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: fluid(8), flexShrink: 0 }}>Cuentas</div>
            <div className="fz-col" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: fluid(4) }}>
              {bankAccounts.length === 0 ? (
                <div style={{ fontSize: fluid(12.5), color: "var(--fg-subtle)", padding: `${fluid(12)} 2px` }}>
                  Sin cuentas bancarias todavia.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: fluid(14) }}>
                  {grouped.map((group) => (
                    <div key={group.owner} style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: `0 ${fluid(14)}`, boxShadow: "var(--shadow-sm)" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: `${fluid(11)} 0 ${fluid(5)}` }}>
                        <div style={sectionLabelStyle}>{OWNER_LABEL[group.owner]}</div>
                        <div style={{ fontSize: fluid(12), fontWeight: 600, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoneyIn(group.subtotal, baseCurrency)}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", paddingBottom: fluid(4) }}>
                        {group.accounts.map((a) => renderAccountRow(a))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* DERECHA — inversiones: piechart de composicion + lista */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: fluid(8), flexShrink: 0 }}>Inversiones</div>
            <div className="fz-col" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: fluid(4) }}>
              <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: fluid(16), boxShadow: "var(--shadow-sm)" }}>
                <PortfolioPie items={portfolioItems} currency={baseCurrency} />
                {investmentAccounts.length > 0 && (
                  <div style={{ marginTop: fluid(8), display: "flex", flexDirection: "column" }}>
                    {investmentAccounts.map((a) => renderAccountRow(a))}
                  </div>
                )}
              </div>
            </div>
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
});

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
      <div className="modal" style={{ width: "calc(var(--home-s, 1) * 480px)" }} onMouseDown={(e) => e.stopPropagation()}>
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
