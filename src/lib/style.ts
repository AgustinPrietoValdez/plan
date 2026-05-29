import type { CSSProperties } from "react";

export type CssVars = Record<`--${string}`, string | number>;

export function vars(v: CssVars, base?: CSSProperties): CSSProperties {
  return { ...base, ...(v as CSSProperties) };
}
