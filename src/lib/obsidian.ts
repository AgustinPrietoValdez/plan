import { invoke } from "@tauri-apps/api/core";
import type { Milestone, ProjectEstado } from "../types";

// Default Obsidian vault path on the user's desktop. The scaffolding silently
// no-ops (vault-not-found) on any machine/setup where this folder is absent.
export const DEFAULT_VAULT_PATH = "C:\\Users\\agusp\\Documentos\\Notas";

/**
 * Slug for the guide file name. Matches existing files (Cargo_bot_guide.md,
 * Job_search_guide.md): capitalize the first word, spaces -> underscores,
 * strip tildes/accents. Always ends in "_guide.md". ASCII only.
 */
export function projectSlug(name: string): string {
  // NFD splits accented letters into base + combining mark; we then keep only
  // printable ASCII (code points 0x20-0x7E), dropping tildes and other marks.
  const ascii = Array.from(name.normalize("NFD"))
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= 0x20 && c <= 0x7e;
    })
    .join("");
  const underscored = ascii.trim().replace(/\s+/g, "_");
  const capitalized = underscored
    ? underscored.charAt(0).toUpperCase() + underscored.slice(1)
    : "Untitled";
  return `${capitalized}_guide.md`;
}

interface GuideInput {
  name: string;
  objetivo: string;
  estado: ProjectEstado;
  milestones: Milestone[];
}

/** Builds the <Name>_guide.md markdown, prefilled from the new project. */
export function buildGuideMarkdown(p: GuideInput): string {
  const slug = projectSlug(p.name).replace(/_guide\.md$/, "").toLowerCase();

  const actionPlan =
    p.milestones.length > 0
      ? p.milestones
          .map((m) => {
            const mark = m.done ? "DONE" : "PROXIMO";
            const desc = m.description.trim();
            return `### ${m.title} [${mark}]\n\n${desc || "(describe this milestone)"}`;
          })
          .join("\n\n")
      : "(define the timeline / phases of this project)";

  const description = p.objetivo.trim() || "(define the goal of this project)";

  return `# ${p.name} - Project Guide

## Type

Product

## Description

${description}

## Research policy

(define how research should be done for this project)

## Workload

(who does what)

## Action Plan

${actionPlan}

## File naming conventions

(naming rules - fill in as the project grows)

## Project structure

(folder layout - fill in as the project grows)

## Start files

- USER: <project-dir>\\USER.md
- AI: <project-dir>\\AI.md

Reading order is ALWAYS the chain: \`me.md\` -> \`Project guide template\` -> this guide -> \`AI.md\`.

#Guide
#${slug}
`;
}

/**
 * Desktop-only: write Guides/<Name>_guide.md into the Obsidian vault. Throws
 * on "vault-not-found"/"guide-exists" (caller swallows so project creation
 * never fails). Returns the file name written.
 */
export async function scaffoldProjectGuide(
  p: GuideInput,
  vaultPath: string = DEFAULT_VAULT_PATH,
): Promise<string> {
  const fileName = projectSlug(p.name);
  const content = buildGuideMarkdown(p);
  await invoke("scaffold_project_guide", { vaultPath, fileName, content });
  return fileName;
}
