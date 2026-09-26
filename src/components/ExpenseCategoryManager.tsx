import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { HUE_PRESETS, colorsForHue } from "../lib/categoryColor";
import {
  useCreateExpenseCategory,
  useDeleteExpenseCategory,
  useExpenseCategories,
  useExpenses,
  usePatchExpenseCategory,
} from "../lib/queries";
import { ICheck, IPlus, ITrash, IX } from "./icons";

/** Todo lo que vive dentro de un `.modal` escala con `--home-s`: un px pelado
 *  se ve diminuto en 2K. Ver el bloque de comentarios en components.css:764. */
const s = (n: number) => `calc(var(--home-s, 1) * ${n}px)`;

const smallBtn = { padding: `${s(4)} ${s(8)}`, fontSize: s(11.5) };

interface Props {
  onClose: () => void;
}

export function ExpenseCategoryManager({ onClose }: Props) {
  const categoriesQ = useExpenseCategories();
  const expensesQ = useExpenses();
  const create = useCreateExpenseCategory();
  const patch = usePatchExpenseCategory();
  const remove = useDeleteExpenseCategory();

  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const expenses = expensesQ.data ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Emoji en edición: `null` = ninguna fila enfocada, y entonces cada input
  // muestra el valor persistido de su categoría.
  const [emojiEdit, setEmojiEdit] = useState<{ id: string; value: string } | null>(null);
  // Escape cancela la edición de emoji, y el input pierde el foco a continuación.
  // Ese blur NO puede guardar: sin esta bandera, `commitEmoji` corre con
  // `emojiEdit` ya en null, lee "" y BORRA el emoji de la categoría.
  const cancelEmojiRef = useRef(false);

  // Este manager se abre ENCIMA del ExpenseEditor, que también escucha Escape en
  // `window`: sin cortar el evento, un solo Escape cerraría los dos de una. Se
  // escucha en captura y se corta ahí, así que todo el significado de Escape
  // (cancelar rename / cerrar) vive acá. Sin deps a propósito: el handler tiene
  // que ver el `editingId` de este render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (editingId) {
        setEditingId(null);
        setDraftName("");
        return;
      }
      if (emojiEdit) {
        // Descartar la edición y soltar el foco. El `onBlur` que viene detrás
        // tiene que ser un no-op, de ahí la bandera.
        cancelEmojiRef.current = true;
        setEmojiEdit(null);
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setDraftName(current);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = draftName.trim();
    if (trimmed.length > 0) {
      patch.mutateAsync({ id: editingId, patch: { name: trimmed } }).catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo renombrar"),
      );
    }
    setEditingId(null);
    setDraftName("");
  };

  /** Vacío = sin emoji (NULL en la base), no string vacío. */
  const commitEmoji = (id: string, current: string | null) => {
    // Blur inmediatamente posterior a un Escape: se descarta, no se guarda.
    if (cancelEmojiRef.current) {
      cancelEmojiRef.current = false;
      return;
    }
    const raw = emojiEdit && emojiEdit.id === id ? emojiEdit.value.trim() : "";
    setEmojiEdit(null);
    const next = raw.length > 0 ? raw : null;
    if (next === (current ?? null)) return;
    patch.mutateAsync({ id, patch: { emoji: next } }).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo cambiar el emoji"),
    );
  };

  const onAdd = () => {
    const usedHues = new Set(categories.map((c) => c.hue));
    const nextHue = HUE_PRESETS.find((h) => !usedHues.has(h)) ?? HUE_PRESETS[0];
    create.mutateAsync({ name: "Untitled", hue: nextHue, position: categories.length }).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo crear"),
    );
  };

  const onConfirmDelete = (id: string) => {
    remove.mutateAsync(id).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo borrar"),
    );
    setConfirmDeleteId(null);
  };

  const usageCount = (id: string) => expenses.filter((e) => e.categoryId === id).length;

  return (
    // z-index explícito: este modal se abre DESDE el ExpenseEditor y ambos
    // backdrops son `z-index: 100`, así que sin esto quedaría tapado por el
    // editor según el orden de montaje en App.tsx.
    <div className="modal-backdrop" style={{ zIndex: 110 }} onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: "calc(var(--home-s, 1) * 520px)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: s(15), fontWeight: 600, letterSpacing: "-0.01em" }}>
            Spending categories
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IX size={14} style={{ width: s(14), height: s(14) }} />
          </button>
        </div>

        <div className="modal-body">
          {categories.length === 0 && (
            <div
              style={{
                padding: `${s(20)} ${s(12)}`,
                textAlign: "center",
                fontSize: s(12.5),
                color: "var(--fg-subtle)",
                border: "1px dashed var(--line)",
                borderRadius: s(8),
              }}
            >
              No categories yet.
            </div>
          )}

          {categories.map((c) => {
            const colors = colorsForHue(c.hue);
            const inUse = usageCount(c.id);
            const editing = editingId === c.id;
            const confirming = confirmDeleteId === c.id;
            return (
              <div
                key={c.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: s(8),
                  padding: `${s(10)} ${s(12)}`,
                  background: "var(--bg-elev)",
                  display: "flex",
                  flexDirection: "column",
                  gap: s(8),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: s(10) }}>
                  <span
                    style={{
                      width: s(22),
                      height: s(22),
                      borderRadius: s(6),
                      background: colors.bg,
                      flex: "0 0 auto",
                    }}
                  />
                  <input
                    value={emojiEdit?.id === c.id ? emojiEdit.value : c.emoji ?? ""}
                    onFocus={() => setEmojiEdit({ id: c.id, value: c.emoji ?? "" })}
                    onChange={(e) => setEmojiEdit({ id: c.id, value: e.target.value })}
                    onBlur={() => commitEmoji(c.id, c.emoji)}
                    // Escape NO se maneja acá: el listener de `window` en fase de
                    // captura lo corta antes de que llegue al input (ver arriba).
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    placeholder="🙂"
                    title="Emoji de la categoría (vacío = ninguno)"
                    style={{
                      width: s(34),
                      flex: "0 0 auto",
                      textAlign: "center",
                      border: "1px solid var(--line)",
                      borderRadius: s(6),
                      padding: `${s(4)} ${s(2)}`,
                      fontSize: s(14),
                      lineHeight: 1.2,
                      fontFamily: "inherit",
                      outline: 0,
                      background: "var(--bg-elev)",
                      color: "var(--fg)",
                    }}
                  />
                  {editing ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        else if (e.key === "Escape") {
                          setEditingId(null);
                          setDraftName("");
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: "1px solid var(--accent)",
                        borderRadius: s(6),
                        padding: `${s(4)} ${s(8)}`,
                        fontSize: s(13),
                        fontWeight: 500,
                        fontFamily: "inherit",
                        outline: 0,
                        background: "var(--bg-elev)",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => startRename(c.id, c.name)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        fontSize: s(13),
                        fontWeight: 500,
                        color: "var(--fg)",
                        padding: `${s(4)} 0`,
                        background: "none",
                        border: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title="Click to rename"
                    >
                      {c.name}
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: s(11),
                      color: "var(--fg-subtle)",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: s(56),
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inUse} {inUse === 1 ? "expense" : "expenses"}
                  </span>
                  {confirming ? (
                    <>
                      <button
                        className="btn ghost"
                        onClick={() => setConfirmDeleteId(null)}
                        style={smallBtn}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn"
                        onClick={() => onConfirmDelete(c.id)}
                        style={{
                          ...smallBtn,
                          color: "var(--danger)",
                          borderColor: "var(--danger)",
                        }}
                      >
                        Confirm
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-btn"
                      title="Delete category"
                      onClick={() => setConfirmDeleteId(c.id)}
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      <ITrash size={13} style={{ width: s(13), height: s(13) }} />
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: s(6) }}>
                  {HUE_PRESETS.map((h) => {
                    const swatch = colorsForHue(h);
                    const active = h === c.hue;
                    return (
                      <button
                        key={h}
                        onClick={() =>
                          patch.mutateAsync({ id: c.id, patch: { hue: h } }).catch((err) =>
                            window.alert(err instanceof Error ? err.message : "No se pudo cambiar el color"),
                          )
                        }
                        title={`Hue ${h}`}
                        style={{
                          width: s(22),
                          height: s(22),
                          borderRadius: s(6),
                          background: swatch.bg,
                          border: active
                            ? "2px solid var(--fg)"
                            : "1px solid color-mix(in srgb, var(--fg) 6%, transparent)",
                          cursor: "pointer",
                          padding: 0,
                          display: "grid",
                          placeItems: "center",
                          color: swatch.fg,
                        }}
                      >
                        {active && <ICheck size={10} stroke={2.6} style={{ width: s(10), height: s(10) }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onAdd}>
            <IPlus size={12} style={{ width: s(12), height: s(12) }} /> Add category
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
