import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { CURRENCY, parseMoney } from "../lib/money";
import {
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  usePatchSavingsGoal,
  useSavingsGoals,
} from "../lib/queries";
import { IPlus, ITrash, IX } from "./icons";

interface Props {
  onClose: () => void;
}

export function SavingsGoalManager({ onClose }: Props) {
  const goalsQ = useSavingsGoals();
  const create = useCreateSavingsGoal();
  const patch = usePatchSavingsGoal();
  const remove = useDeleteSavingsGoal();

  const goals = useMemo(() => goalsQ.data ?? [], [goalsQ.data]);

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const g of goals) {
      next[g.id] = g.targetAmount != null ? g.targetAmount.toString().replace(".", ",") : "";
    }
    setTargetDrafts(next);
  }, [goals]);

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

  const startRename = (id: string, current: string) => {
    setEditingNameId(id);
    setDraftName(current);
  };
  const commitRename = () => {
    if (!editingNameId) return;
    const trimmed = draftName.trim();
    if (trimmed.length > 0) patch.mutate({ id: editingNameId, patch: { name: trimmed } });
    setEditingNameId(null);
    setDraftName("");
  };

  const commitTargetFromInput = (goalId: string) => {
    const text = targetDrafts[goalId] ?? "";
    const parsed = parseMoney(text);
    if (parsed === null || parsed <= 0) {
      // empty/invalid input → revert to open-ended
      patch.mutate({ id: goalId, patch: { targetAmount: null } });
    } else {
      patch.mutate({ id: goalId, patch: { targetAmount: parsed } });
    }
  };

  const toggleOpenEnded = (goalId: string, makeOpen: boolean, currentTarget: number | null) => {
    if (makeOpen) {
      patch.mutate({ id: goalId, patch: { targetAmount: null } });
    } else {
      // unchecking open-ended → seed a starting target so the input becomes
      // editable. Use the user's last typed value if any, else 1000.
      const text = targetDrafts[goalId] ?? "";
      const parsed = parseMoney(text);
      const initial = parsed && parsed > 0 ? parsed : currentTarget && currentTarget > 0 ? currentTarget : 1000;
      patch.mutate({ id: goalId, patch: { targetAmount: initial } });
    }
  };

  const onAdd = () => {
    create.mutate({ name: "Untitled goal", targetAmount: null, position: goals.length });
  };

  const onConfirmDelete = (id: string) => {
    remove.mutate(id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div
        className="modal"
        style={{ width: "min(740px, 92vw)", overflowX: "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Savings goals
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          {goals.length === 0 && (
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
              No goals yet. Click "Add goal" below.
            </div>
          )}
          {goals.map((g) => {
            const editing = editingNameId === g.id;
            const confirming = confirmDeleteId === g.id;
            const isOpenEnded = g.targetAmount === null;
            const purchased = g.purchasedAt !== null;
            return (
              <div
                key={g.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto auto auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "8px 8px",
                  borderBottom: "1px solid var(--line)",
                  opacity: purchased ? 0.5 : 1,
                }}
              >
                {editing ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") {
                        setEditingNameId(null);
                        setDraftName("");
                      }
                    }}
                    style={{
                      border: "1px solid var(--accent)",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 13,
                      fontWeight: 500,
                      outline: 0,
                      background: "var(--bg-elev)",
                    }}
                  />
                ) : (
                  <button
                    onClick={() => startRename(g.id, g.name)}
                    style={{
                      textAlign: "left",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--fg)",
                      padding: "4px 0",
                      background: "none",
                      border: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textDecoration: purchased ? "line-through" : undefined,
                    }}
                    title="Click to rename"
                  >
                    {g.name}
                    {purchased && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10.5,
                          color: "var(--ok)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: ".05em",
                        }}
                      >
                        Bought
                      </span>
                    )}
                  </button>
                )}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11.5,
                    color: "var(--fg-muted)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isOpenEnded}
                    onChange={(e) => toggleOpenEnded(g.id, e.target.checked, g.targetAmount)}
                  />
                  Open-ended
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11.5,
                    color: g.isOverflowTarget ? "var(--ok)" : "var(--fg-muted)",
                    cursor: "pointer",
                  }}
                  title="This goal receives all unallocated leftover savings"
                >
                  <input
                    type="checkbox"
                    checked={g.isOverflowTarget}
                    onChange={(e) => {
                      if (e.target.checked) {
                        patch.mutate({ id: g.id, patch: { isOverflowTarget: true } });
                      } else {
                        patch.mutate({ id: g.id, patch: { isOverflowTarget: false } });
                      }
                    }}
                    disabled={purchased}
                  />
                  Overflow
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={isOpenEnded ? "—" : "Target"}
                    disabled={isOpenEnded}
                    value={targetDrafts[g.id] ?? ""}
                    onChange={(e) =>
                      setTargetDrafts((s) => ({ ...s, [g.id]: e.target.value }))
                    }
                    onBlur={() => commitTargetFromInput(g.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="input"
                    style={{
                      width: 130,
                      fontVariantNumeric: "tabular-nums",
                      textAlign: "right",
                      padding: "5px 8px",
                      opacity: isOpenEnded ? 0.4 : 1,
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{CURRENCY}</span>
                </div>
                {confirming ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn ghost"
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ padding: "4px 8px", fontSize: 11.5 }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn"
                      onClick={() => onConfirmDelete(g.id)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 11.5,
                        color: "var(--danger)",
                        borderColor: "var(--danger)",
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                ) : (
                  <button
                    className="icon-btn"
                    title="Delete goal"
                    onClick={() => setConfirmDeleteId(g.id)}
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    <ITrash size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onAdd}>
            <IPlus size={12} /> Add goal
          </button>
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

