/** Tab cycle inside the file-as-task modal (chips: agent, then project). */

export type FileTaskTabField = "brief" | "project" | "agent";

export function fileTaskTabFieldFromDropdownId(
  id: string | null | undefined,
): FileTaskTabField | null {
  if (id === "project" || id === "agent") return id;
  return null;
}

/** Tab forward: agent → project → brief. */
export function getNextFileTaskTabField(
  current: FileTaskTabField,
  options: { readonly hasAgent: boolean },
): FileTaskTabField {
  switch (current) {
    case "agent":
      return "project";
    case "project":
      return "brief";
    case "brief":
      return options.hasAgent ? "agent" : "project";
  }
}

/**
 * Shift+Tab: brief → agent → project → brief (agent chip first when present).
 * Without an agent chip, brief ↔ project only.
 */
export function getPreviousFileTaskTabField(
  current: FileTaskTabField,
  options: { readonly hasAgent: boolean },
): FileTaskTabField {
  switch (current) {
    case "brief":
      return options.hasAgent ? "agent" : "project";
    case "agent":
      return "project";
    case "project":
      return "brief";
  }
}
