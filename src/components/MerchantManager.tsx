import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import {
  useCreateMerchant,
  useDeleteMerchant,
  useExpenses,
  useMerchants,
  usePatchExpense,
  usePatchMerchant,
} from "../lib/queries";
import type { Merchant } from "../types";
import { ICheck, IPlus, ITrash, IX } from "./icons";

/** Todo lo que vive dentro de un `.modal` escala con `--home-s`: un px pelado
 *  se ve diminuto en 2K. Ver el bloque de comentarios en components.css:764. */
const s = (n: number) => `calc(var(--home-s, 1) * ${n}px)`;

/** Plegado sin acentos ni mayúsculas ni espacios de borde: "Netto ", "netto" y
 *  "NETTO" son el MISMO comercio, y dejar entrar los tres parte el historial de
 *  precios en pedazos que ya nunca se vuelven a juntar solos. */
const fold = (v: string) =>
  v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Los `.input` del proyecto sólo tienen CSS adentro de un `.field`; acá no hay
 *  ninguno, así que los controles se visten a mano (y escalados). */
const boxInput: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: s(6),
  padding: `${s(6)} ${s(8)}`,
  fontSize: s(13),
  fontFamily: "inherit",
  background: "var(--bg-elev)",
  color: "var(--fg)",
  outline: 0,
};

const smallBtn: CSSProperties = { padding: `${s(4)} ${s(8)}`, fontSize: s(11.5) };

interface RowMsg {
  id: string;
  text: string;
  tone: "danger" | "muted";
}

interface Props {
  onClose: () => void;
}

export function MerchantManager({ onClose }: Props) {
  const merchantsQ = useMerchants();
  const expensesQ = useExpenses();
  const create = useCreateMerchant();
  const patch = usePatchMerchant();
  const remove = useDeleteMerchant();
  const patchExpense = usePatchExpense();

  // `listMerchants` ya ordena por position/name, pero los archivados van al
  // fondo: son historia, no opciones.
  const merchants = useMemo(() => {
    const rows = [...(merchantsQ.data ?? [])];
    rows.sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) ||
        a.position - b.position ||
        a.name.localeCompare(b.name, "es"),
    );
    return rows;
  }, [merchantsQ.data]);
  const expenses = expensesQ.data ?? [];

  /** Cuántos gastos apuntan a cada comercio. `listExpenses` ya excluye borrados. */
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of expenses) {
      if (e.merchantId) counts.set(e.merchantId, (counts.get(e.merchantId) ?? 0) + 1);
    }
    return counts;
  }, [expenses]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [rowMsg, setRowMsg] = useState<RowMsg | null>(null);
  const [newName, setNewName] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  /** Comercio existente con el mismo nombre plegado (ignorando uno propio). */
  const duplicateOf = (name: string, exceptId?: string) =>
    merchants.find((m) => m.id !== exceptId && fold(m.name) === fold(name)) ?? null;

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName("");
  };

  const escape = () => {
    if (editingId) {
      cancelEdit();
      setRowMsg(null);
      return;
    }
    if (confirmDeleteId) {
      setConfirmDeleteId(null);
      return;
    }
    if (mergeId) {
      setMergeId(null);
      setMergeTargetId("");
      return;
    }
    onClose();
  };

  // Este manager se abre ENCIMA del ExpenseEditor, que también escucha Escape en
  // `window`: sin cortar el evento, un solo Escape cerraría los dos de una. Se
  // escucha en captura y se corta ahí, así que todo el significado de Escape
  // (cancelar rename / cancelar confirmación / cerrar) vive en `escape()`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      escape();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const startRename = (m: Merchant) => {
    setRowMsg(null);
    setEditingId(m.id);
    setDraftName(m.name);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = draftName.trim();
    if (trimmed.length === 0 || trimmed === merchants.find((m) => m.id === editingId)?.name) {
      cancelEdit();
      return;
    }
    const dup = duplicateOf(trimmed, editingId);
    if (dup) {
      // Nunca en silencio: si se pisa un nombre existente hay que decirlo, y el
      // campo queda abierto para corregirlo.
      setRowMsg({
        id: editingId,
        text: `Ya existe «${dup.name}». Fusionalos en vez de repetir el nombre.`,
        tone: "danger",
      });
      return;
    }
    const id = editingId;
    cancelEdit();
    setRowMsg(null);
    patch
      .mutateAsync({ id, patch: { name: trimmed } })
      .catch((err) =>
        setRowMsg({
          id,
          text: err instanceof Error ? err.message : "No se pudo renombrar",
          tone: "danger",
        }),
      );
  };

  const onAdd = () => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setNewError("Escribí un nombre.");
      return;
    }
    const dup = duplicateOf(trimmed);
    if (dup) {
      setNewError(
        dup.archived
          ? `«${dup.name}» ya existe (archivado) — restauralo en vez de crear otro.`
          : `«${dup.name}» ya existe.`,
      );
      return;
    }
    setNewError(null);
    create
      .mutateAsync({ name: trimmed, position: merchants.filter((m) => !m.archived).length })
      .then(() => setNewName(""))
      .catch((err) => setNewError(err instanceof Error ? err.message : "No se pudo crear"));
  };

  const toggleArchived = (m: Merchant) => {
    setRowMsg(null);
    patch
      .mutateAsync({ id: m.id, patch: { archived: !m.archived } })
      .catch((err) =>
        setRowMsg({
          id: m.id,
          text: err instanceof Error ? err.message : "No se pudo archivar",
          tone: "danger",
        }),
      );
  };

  /** `deleteMerchant` es un soft delete y NO toca `expenses.merchant_id` (ver
   *  repo/local.ts): borrar un comercio en uso deja cada gasto pasado apuntando
   *  a una fila que ya no lista nadie — el "dónde lo compré" del historial de
   *  precios se pierde sin aviso. Por eso el borrado sólo existe cuando el
   *  contador es 0; con uso, se archiva o se fusiona. */
  const onTrash = (m: Merchant, used: number) => {
    if (used > 0) {
      setRowMsg({
        id: m.id,
        text: `No se puede borrar: ${used} ${used === 1 ? "gasto lo usa" : "gastos lo usan"} y perderían el comercio en el historial. Archivalo, o fusionalo con otro.`,
        tone: "danger",
      });
      return;
    }
    setRowMsg(null);
    setConfirmDeleteId(m.id);
  };

  const onConfirmDelete = (id: string) => {
    setConfirmDeleteId(null);
    remove
      .mutateAsync(id)
      .catch((err) =>
        setRowMsg({
          id,
          text: err instanceof Error ? err.message : "No se pudo borrar",
          tone: "danger",
        }),
      );
  };

  const startMerge = (m: Merchant) => {
    setRowMsg(null);
    setConfirmDeleteId(null);
    setMergeTargetId("");
    setMergeId(m.id);
  };

  /** Fusionar = mover los gastos al comercio bueno y recién ahí borrar el malo.
   *  Es la única forma de volver a juntar un historial que un typo partió en dos. */
  const doMerge = async (from: Merchant) => {
    const target = merchants.find((m) => m.id === mergeTargetId);
    if (!target || target.id === from.id || working) return;
    setWorking(true);
    const moving = expenses.filter((e) => e.merchantId === from.id);
    try {
      for (const e of moving) {
        await patchExpense.mutateAsync({ id: e.id, patch: { merchantId: target.id } });
      }
      await remove.mutateAsync(from.id);
      setMergeId(null);
      setMergeTargetId("");
      setRowMsg({
        id: target.id,
        text: `Se ${moving.length === 1 ? "movió 1 gasto" : `movieron ${moving.length} gastos`} desde «${from.name}», que quedó borrado.`,
        tone: "muted",
      });
    } catch (err) {
      setRowMsg({
        id: from.id,
        text: err instanceof Error ? err.message : "No se pudo fusionar",
        tone: "danger",
      });
    } finally {
      setWorking(false);
    }
  };

  const mergeOptions = mergeId ? merchants.filter((m) => m.id !== mergeId) : [];

  return (
    // z-index explícito: este modal se abre DESDE el ExpenseEditor y todos los
    // backdrops son `z-index: 100`. Regla del proyecto: el que se puede abrir
    // desde otro modal se sube a 110 (ver el comentario en App.tsx), en vez de
    // depender del orden de montaje.
    <div className="modal-backdrop" style={{ zIndex: 110 }} onMouseDown={onBackdropMouseDown}>
      <div
        className="modal"
        style={{ width: "calc(var(--home-s, 1) * 480px)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: s(15), fontWeight: 600, letterSpacing: "-0.01em" }}>
            Comercios
          </span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <IX size={14} style={{ width: s(14), height: s(14) }} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ fontSize: s(11.5), color: "var(--fg-subtle)", lineHeight: 1.45 }}>
            El historial de precios se agrupa por comercio: un nombre repetido lo
            parte en dos. Archivá los que ya no uses y fusioná los duplicados.
          </div>

          {merchants.length === 0 && (
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
              No hay comercios todavía.
            </div>
          )}

          {merchants.map((m) => {
            const used = usage.get(m.id) ?? 0;
            const editing = editingId === m.id;
            const confirming = confirmDeleteId === m.id;
            const merging = mergeId === m.id;
            const msg = rowMsg?.id === m.id ? rowMsg : null;
            return (
              <div
                key={m.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: s(8),
                  padding: `${s(10)} ${s(12)}`,
                  background: m.archived ? "var(--bg-sunken)" : "var(--bg-elev)",
                  display: "flex",
                  flexDirection: "column",
                  gap: s(8),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: s(8) }}>
                  {editing ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                      }}
                      style={{
                        ...boxInput,
                        flex: 1,
                        minWidth: 0,
                        border: "1px solid var(--accent)",
                        fontWeight: 500,
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => startRename(m)}
                      title="Click para renombrar"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        fontSize: s(13),
                        fontWeight: 500,
                        color: m.archived ? "var(--fg-muted)" : "var(--fg)",
                        padding: `${s(4)} 0`,
                        background: "none",
                        border: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.name}
                      {m.archived && (
                        <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>
                          {" "}· archivado
                        </span>
                      )}
                    </button>
                  )}

                  <span
                    style={{
                      fontSize: s(11),
                      color: "var(--fg-subtle)",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {used} {used === 1 ? "gasto" : "gastos"}
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
                        onClick={() => onConfirmDelete(m.id)}
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
                    <>
                      {merchants.length > 1 && (
                        <button
                          className="btn ghost"
                          onClick={() => (merging ? setMergeId(null) : startMerge(m))}
                          style={smallBtn}
                          title="Mover sus gastos a otro comercio y borrar éste"
                        >
                          Fusionar
                        </button>
                      )}
                      <button
                        className="btn ghost"
                        onClick={() => toggleArchived(m)}
                        style={smallBtn}
                        title={
                          m.archived
                            ? "Volver a ofrecerlo al cargar un gasto"
                            : "Sacarlo del selector sin tocar el historial"
                        }
                      >
                        {m.archived ? "Restaurar" : "Archivar"}
                      </button>
                      <button
                        className="icon-btn"
                        title={
                          used > 0
                            ? `Lo usan ${used} gastos — no se puede borrar`
                            : "Borrar comercio"
                        }
                        onClick={() => onTrash(m, used)}
                        style={{ color: "var(--fg-subtle)", opacity: used > 0 ? 0.45 : 1 }}
                      >
                        <ITrash size={13} style={{ width: s(13), height: s(13) }} />
                      </button>
                    </>
                  )}
                </div>

                {merging && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: s(6),
                      fontSize: s(11.5),
                      color: "var(--fg-muted)",
                    }}
                  >
                    <span>
                      Mover {used} {used === 1 ? "gasto" : "gastos"} a
                    </span>
                    <select
                      value={mergeTargetId}
                      onChange={(e) => setMergeTargetId(e.target.value)}
                      style={{ ...boxInput, fontSize: s(12.5), flex: 1, minWidth: s(120) }}
                    >
                      <option value="">Elegir comercio…</option>
                      {mergeOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                          {o.archived ? " (archivado)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setMergeId(null);
                        setMergeTargetId("");
                      }}
                      style={smallBtn}
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn"
                      onClick={() => void doMerge(m)}
                      disabled={mergeTargetId === "" || working}
                      style={{
                        ...smallBtn,
                        opacity: mergeTargetId === "" || working ? 0.5 : 1,
                      }}
                    >
                      <ICheck size={11} stroke={2.4} style={{ width: s(11), height: s(11) }} />{" "}
                      {working ? "Fusionando…" : "Fusionar"}
                    </button>
                  </div>
                )}

                {msg && (
                  <div
                    style={{
                      fontSize: s(11.5),
                      lineHeight: 1.4,
                      color: msg.tone === "danger" ? "var(--danger)" : "var(--fg-muted)",
                    }}
                  >
                    {msg.text}
                  </div>
                )}
              </div>
            );
          })}

          {/* --- alta --- */}
          <div style={{ display: "flex", flexDirection: "column", gap: s(6) }}>
            <div style={{ display: "flex", gap: s(6), alignItems: "center" }}>
              <input
                type="text"
                value={newName}
                placeholder="Nuevo comercio…"
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (newError) setNewError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAdd();
                }}
                style={{ ...boxInput, flex: 1, minWidth: 0 }}
              />
              <button
                className="btn"
                onClick={onAdd}
                disabled={create.isPending}
                style={{ opacity: create.isPending ? 0.5 : 1 }}
              >
                <IPlus size={12} style={{ width: s(12), height: s(12) }} /> Agregar
              </button>
            </div>
            {newError && (
              <div style={{ fontSize: s(11.5), color: "var(--danger)" }}>{newError}</div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <span />
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
