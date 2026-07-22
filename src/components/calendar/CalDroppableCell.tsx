import { useDroppable } from "@dnd-kit/core";
import type { CSSProperties, ReactNode } from "react";

interface Props {
  dayKey: string;
  style: CSSProperties;
  overStyle: CSSProperties;
  onClick?: () => void;
  children?: ReactNode;
}

/** Droppable day cell for the redesigned Month/Week grids — same `day:<ymd>`
 *  droppable id App.tsx's onDragEnd already expects, just styled inline
 *  (`overStyle` merges in on top of `style` while a dragged task hovers it)
 *  instead of through the old `.drop-target` CSS class. */
export function CalDroppableCell({ dayKey, style, overStyle, onClick, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` });
  return (
    <div
      ref={setNodeRef}
      data-day={dayKey}
      onClick={onClick}
      style={isOver ? { ...style, ...overStyle } : style}
    >
      {children}
    </div>
  );
}
