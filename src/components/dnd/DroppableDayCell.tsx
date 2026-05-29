import { useDroppable } from "@dnd-kit/core";
import type { CSSProperties, ReactNode } from "react";

interface Props {
  dayKey: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function DroppableDayCell({ dayKey, className, style, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` });
  const cls = [className, isOver ? "drop-target" : ""].filter(Boolean).join(" ");
  return (
    <div ref={setNodeRef} className={cls} style={style} data-day={dayKey}>
      {children}
    </div>
  );
}
