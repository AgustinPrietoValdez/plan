import { useMemo, useState } from "react";
import { useAccounts, useCreateExpense, useExpenseCategories } from "../../lib/queries";
import { colorsForHue } from "../../lib/categoryColor";
import { CURRENCY, fmtMoneyIn, parseMoney } from "../../lib/money";
import { todayYmd } from "../../lib/date";

/* ═══════════════════════════════════════════════════════════════════════════
   1d · Bottom-sheet mobile de NUEVO GASTO

   Decisión del usuario (2026-08-16): el FAB del tab Finanzas abre ESTE sheet,
   NO el `ExpenseEditor` de escritorio. Ese componente son 1.176 líneas con
   `EntityPicker` portaleado a `document.body` (posicionado `fixed` sobre el
   trigger, sin reflow cuando sube el teclado virtual), grid de line items de 4
   columnas, comercios, ingredientes y recurrencia: no entra en el pulgar.

   ALCANCE (definido por el usuario): monto · categoría · cuenta · fecha ·
   descripción. SIN line items, SIN comercios, SIN recurrencia, SIN objetivo de
   ahorro. Un gasto cargado desde el celular queda más pobre que uno de
   escritorio — es a propósito; se completa después en la compu.

   Mutación por el patrón OUTBOX vía `useCreateExpense()` → `repo.createExpense`
   (INSERT + outbox). Nada de SQL desde una vista.

   Overlay: hermano de `.m-scroll` dentro de `.m-screen`, sobre `.m-sheet-*`
   (única excepción al "nada de position:fixed" del contrato de la shell).
   ═══════════════════════════════════════════════════════════════════════════ */

export function ExpenseSheetMobile({ onClose }: { onClose: () => void }) {
  const categoriesQ = useExpenseCategories();
  const accountsQ = useAccounts();
  const create = useCreateExpense();

  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  // Mismo criterio que el escritorio: las cuentas que pagan gastos, y si
  // ninguna tiene la capacidad, todas las activas.
  const accounts = useMemo(() => {
    const active = (accountsQ.data ?? []).filter((a) => !a.archived);
    const paying = active.filter((a) => a.paysExpenses);
    return paying.length > 0 ? paying : active;
  }, [accountsQ.data]);

  const [amountText, setAmountText] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [spentOn, setSpentOn] = useState<string>(todayYmd());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `parseMoney` acepta el formato da-DK ("1.234,56") y el inglés ("1234.56").
  const amount = parseMoney(amountText) ?? 0;
  // La moneda la manda la cuenta elegida (igual que el escritorio); sin cuenta,
  // la nominal de la app. No hay selector de moneda en mobile: fuera de alcance.
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? CURRENCY;
  const canSave = amount > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        amount,
        currency,
        categoryId,
        spentOn,
        note: "",
        recurrence: null,
        recurrenceParentId: null,
        accountId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el gasto");
      setSaving(false);
    }
  };

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <span>Nuevo gasto</span>
          <button className="m-sheet-close" type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <label className="m-fin-field">
          <span className="m-sheet-section">Monto</span>
          <div className="m-fin-amount-row">
            <input
              className="m-fin-amount"
              // `decimal` (no `numeric`): el teclado de Android trae la coma.
              inputMode="decimal"
              autoFocus
              placeholder="0"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
            <span className="m-fin-amount-cur">{currency}</span>
          </div>
          {amount > 0 && currency !== CURRENCY && (
            <span className="m-fin-hint">{fmtMoneyIn(amount, currency)}</span>
          )}
        </label>

        <label className="m-fin-field">
          <span className="m-sheet-section">Descripción</span>
          <input
            className="m-add-name"
            placeholder="En qué se fue"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="m-fin-field">
          <span className="m-sheet-section">Categoría</span>
          {categories.length === 0 ? (
            <span className="m-fin-hint">No hay categorías de gasto todavía.</span>
          ) : (
            <div className="m-quick-grid">
              {categories.map((c) => {
                const on = categoryId === c.id;
                const color = colorsForHue(c.hue).fg;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`m-fin-chip${on ? " is-active" : ""}`}
                    aria-pressed={on}
                    style={
                      on
                        ? { background: color, borderColor: color, color: "#fff" }
                        : { borderColor: "var(--line-strong)" }
                    }
                    onClick={() => setCategoryId(on ? null : c.id)}
                  >
                    <span
                      className="m-fin-chip-dot"
                      style={{ background: on ? "#fff" : color }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="m-fin-field">
          <span className="m-sheet-section">Cuenta</span>
          {accounts.length === 0 ? (
            <span className="m-fin-hint">No hay cuentas cargadas.</span>
          ) : (
            <div className="m-quick-grid">
              {accounts.map((a) => {
                const on = accountId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`m-fin-chip${on ? " is-active" : ""}`}
                    aria-pressed={on}
                    onClick={() => setAccountId(on ? null : a.id)}
                  >
                    {a.name} · {a.currency}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="m-fin-field">
          <span className="m-sheet-section">Fecha</span>
          {/* `type="date"` a propósito: abre el date picker nativo de Android.
              `DateInput` del escritorio es un popover con posicionamiento fijo,
              no sirve con teclado virtual. */}
          <input
            className="m-fin-date"
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value || todayYmd())}
          />
        </label>

        {error && <div className="m-fin-error">{error}</div>}

        <button className="m-fin-save" type="button" disabled={!canSave} onClick={save}>
          {saving ? "Guardando…" : "Guardar gasto"}
        </button>
      </div>
    </div>
  );
}
