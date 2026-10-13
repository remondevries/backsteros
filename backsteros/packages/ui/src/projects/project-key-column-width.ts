import type { CSSProperties } from "react";

/** Fallback when no project keys are available (e.g. empty list). */
export const DEFAULT_PROJECT_KEY_COLUMN_CH = 3;

/**
 * Extra `ch` so letterforms / subpixel rounding don't clip the last character.
 * `ch` is the advance of "0"; keys can measure a hair wider in ui-monospace.
 */
export const PROJECT_KEY_COLUMN_CH_SLACK = 1;

export type ProjectKeyColumnWidthSource = {
  key?: string | null;
};

/**
 * Monospace `ch` width for the project-key column so titles align across rows.
 *
 * Uses the widest key among `projects`, so the column grows when a longer key
 * appears (e.g. 2-char → 3-char).
 *
 * Pass all workspace projects for a global list so area filters do not resize
 * the column.
 */
export function computeProjectKeyColumnCh(
  projects: ReadonlyArray<ProjectKeyColumnWidthSource>,
): number {
  let max = DEFAULT_PROJECT_KEY_COLUMN_CH;
  for (const project of projects) {
    const key = project.key?.trim();
    if (key) {
      max = Math.max(max, key.length);
    }
  }
  return max + PROJECT_KEY_COLUMN_CH_SLACK;
}

/** Inline style that sets `--project-key-column-ch` for `.project-overview-row__key`. */
export function projectKeyColumnCssVars(columnCh: number): CSSProperties {
  return {
    ["--project-key-column-ch" as string]: columnCh,
  };
}
