import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { CURRENCY, fmtMoney, parseMoney } from "../lib/money";
import {
  useBudgets,
  useExpenseCategories,
  useUpsertBudget,
  useDeleteBudget,
} from "../lib/queries";
import { IX } from "./icons";

interface Props {
  onClose: () => void;
}

export function BudgetManager({ onClose }: Props) {
  const categoriesQ = useExpenseCategories();
  const budgetsQ = useBudgets();
  const upsert = useUpsertBudget();
  const remove = useDeleteBudget();

  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const budgets = budgetsQ.data ?? [];

  // local draft amount per category (string for input control)
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const c of categories) {
      const b = budgets.find((b) => b.categoryId === c.id);
      next[c.id] = b ? b.monthlyAmount.toString().replace(".", ",") : "";
    }
    setDrafts(next);
  }, [budgets, categories]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const onCommit = (categoryId: string) => {
    const text = drafts[categoryId] ?? "";
    const parsed = parseMoney(text);
    const existingBudget = budgets.find((b) => b.categoryId === categoryId);
    if (parsed === null || parsed === 0) {
      // blank/zero → remove budget if exists
      if (existingBudget) {
        remove.mutateAsync(existingBudget.id).catch((err) =>
          window.alert(err instanceof Error ? err.message : "No se pudo borrar el presupuesto"),
        );
      }
      return;
    }
    upsert.mutateAsync({ categoryId, monthlyAmount: parsed, currency: CURRENCY }).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo guardar el presupuesto"),
    );
  };

  const total = budgets.reduce((s, b) => s + b.monthlyAmount, 0);

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div
        className="modal"
        style={{ width: "min(820px, 92vw)", overflowX: "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Monthly budgets
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          {categories.length === 0 ? (
            <div
              style={{
                padding: "20px 12px",
                textAlign: "center",
                fontSize: 12.5,
                color: "var(--fg-subtle)",
                border: "1px dashed var(--line)",
                borderRadius: 8,
              }}
            >
              No categories yet. Create one first.
            </div>
          ) : (
            categories.map((c) => {
              const colors = colorsForHue(c.hue);
              return (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "18px minmax(0, 1fr) 200px",
                    gap: 12,
                    alignItems: "center",
                    padding: "6px 8px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: colors.bg,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={c.name}
                  >
                    {c.name}
                  </span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={drafts[c.id] ?? ""}
                      onChange={(e) => setDrafts((s) => ({ ...s, [c.id]: e.target.value }))}
                      onBlur={() => onCommit(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="input"
                      style={{
                        flex: 1,
                        fontVariantNumeric: "tabular-nums",
                        textAlign: "right",
                        padding: "5px 8px",
                      }}
                    />
                    <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{CURRENCY}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="modal-foot">
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            Total monthly:{" "}
            <span style={{ fontWeight: 600, color: "var(--fg)" }}>{fmtMoney(total)}</span>
          </span>
          <div className="actions">
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
