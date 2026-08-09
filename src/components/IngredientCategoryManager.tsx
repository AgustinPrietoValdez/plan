import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { HUE_PRESETS, colorsForHue } from "../lib/categoryColor";
import {
  useCreateIngredientCategory,
  useDeleteIngredientCategory,
  useIngredientCategories,
  useIngredients,
  usePatchIngredientCategory,
} from "../lib/queries";
import { ICheck, IPlus, ITrash, IX } from "./icons";

/** Todo lo que vive dentro de un `.modal` escala con `--home-s`: un px pelado
 *  se ve diminuto en 2K. Ver el bloque de comentarios en components.css:764. */
const s = (n: number) => `calc(var(--home-s, 1) * ${n}px)`;

const smallBtn = { padding: `${s(4)} ${s(8)}`, fontSize: s(11.5) };

interface Props {
  onClose: () => void;
}

export function IngredientCategoryManager({ onClose }: Props) {
  const categoriesQ = useIngredientCategories();
  const ingredientsQ = useIngredients();
  const create = useCreateIngredientCategory();
  const patch = usePatchIngredientCategory();
  const remove = useDeleteIngredientCategory();

  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const ingredients = ingredientsQ.data ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const onAdd = () => {
    const usedHues = new Set(categories.map((c) => c.hue));
    const nextHue = HUE_PRESETS.find((h) => !usedHues.has(h)) ?? HUE_PRESETS[0];
    create.mutateAsync({ name: "Nueva categoría", hue: nextHue, position: categories.length }).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo crear"),
    );
  };

  const onConfirmDelete = (id: string) => {
    remove.mutateAsync(id).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo borrar"),
    );
    setConfirmDeleteId(null);
  };

  const usageCount = (id: string) => ingredients.filter((i) => i.categoryId === id).length;

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: "calc(var(--home-s, 1) * 520px)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: s(15), fontWeight: 600, letterSpacing: "-0.01em" }}>
            Categorías de ingredientes
          </span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
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
              No hay categorías todavía.
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
                      title="Click para renombrar"
                    >
                      {c.name}
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: s(11),
                      color: "var(--fg-subtle)",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: s(72),
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inUse} {inUse === 1 ? "ingrediente" : "ingredientes"}
                  </span>
                  {confirming ? (
                    <>
                      <button
                        className="btn ghost"
                        onClick={() => setConfirmDeleteId(null)}
                        style={smallBtn}
                      >
                        Cancelar
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
                        Confirmar
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-btn"
                      title="Borrar categoría"
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
                        title={`Color ${h}`}
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
            <IPlus size={12} style={{ width: s(12), height: s(12) }} /> Agregar categoría
          </button>
          <div className="actions">
            <button className="btn primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
