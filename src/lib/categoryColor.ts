import type { Category, CategoryColors } from "../types";

/** Derive bg/fg OKLCH pair from a category hue, mirroring the design tokens
 * (lightness 0.90 / chroma 0.05 for bg, lightness 0.42 / chroma 0.10 for fg). */
export function colorsForHue(hue: number): CategoryColors {
  const h = ((hue % 360) + 360) % 360;
  return {
    bg: `oklch(0.90 0.05 ${h})`,
    fg: `oklch(0.42 0.10 ${h})`,
  };
}

export function colorsForCategory(c: Category): CategoryColors {
  return colorsForHue(c.hue);
}

/** Default starter set seeded on first login. Names + hues match the
 *  prototype's original 7 categories. */
export const DEFAULT_CATEGORIES: { name: string; hue: number }[] = [
  { name: "Design", hue: 245 },
  { name: "Engineering", hue: 295 },
  { name: "Marketing", hue: 350 },
  { name: "Personal", hue: 50 },
  { name: "Admin", hue: 90 },
  { name: "Health", hue: 165 },
  { name: "Learning", hue: 130 },
];

/** Color picker preset hues — 12 evenly spaced around the OKLCH wheel. */
export const HUE_PRESETS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
