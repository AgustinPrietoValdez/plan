import type { Category, CategoryColors, Project, Task } from "../types";
import { colorsForCategory } from "./categoryColor";

const FALLBACK_COLORS: CategoryColors = {
  bg: "var(--bg-sunken)",
  fg: "var(--fg-muted)",
};

/** Resolve a category for a task: explicit task category wins, else project's
 *  category, else null. Archived categories are ignored — they fall through
 *  the chain. */
export function categoryFor(
  task: Pick<Task, "categoryId" | "projectId">,
  categories: Category[],
  projects: Project[],
): Category | null {
  if (task.categoryId) {
    const c = categories.find((c) => c.id === task.categoryId && !c.archived);
    if (c) return c;
  }
  if (task.projectId) {
    const p = projects.find((p) => p.id === task.projectId);
    if (p) {
      const c = categories.find((c) => c.id === p.categoryId && !c.archived);
      if (c) return c;
    }
  }
  return null;
}

/** Same as `categoryFor` but always returns colors — fallback to neutral. */
export function colorsFor(
  task: Pick<Task, "categoryId" | "projectId">,
  categories: Category[],
  projects: Project[],
): CategoryColors {
  const c = categoryFor(task, categories, projects);
  return c ? colorsForCategory(c) : FALLBACK_COLORS;
}

/** Display name fallback chain. */
export function nameFor(
  task: Pick<Task, "categoryId" | "projectId">,
  categories: Category[],
  projects: Project[],
): string {
  return categoryFor(task, categories, projects)?.name ?? "Uncategorized";
}

export function projectFor(
  task: Pick<Task, "projectId">,
  projects: Project[],
): Project | null {
  if (!task.projectId) return null;
  return projects.find((p) => p.id === task.projectId) ?? null;
}

export function categoryById(
  id: string | null | undefined,
  categories: Category[],
): Category | null {
  if (!id) return null;
  return categories.find((c) => c.id === id) ?? null;
}

export function colorsById(
  id: string | null | undefined,
  categories: Category[],
): CategoryColors {
  const c = categoryById(id, categories);
  return c ? colorsForCategory(c) : FALLBACK_COLORS;
}
