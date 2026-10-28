/**
 * Helpers for the Messages contact dropdown → first/last name pencil edit
 * flow (OS-147).
 */

export type ContactDropdownNameEditMode = "dropdown" | "editing";

/** Split a display name into first + remaining last parts. */
export function splitContactDisplayName(
  name: string | null | undefined,
): { firstName: string; lastName: string } {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * Resolve first/last for the inline editors — same rules as
 * ContactOverviewView (prefer explicit CRM fields; avoid duplicating a
 * surname when firstName already holds the full display name).
 */
export function resolveContactNameEditFields(input: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): { firstName: string; lastName: string } {
  const display = input.displayName?.trim() ?? "";
  const remoteFirstName =
    input.firstName?.trim() || display.split(/\s+/)[0] || display;
  const explicitLastName = input.lastName?.trim() ?? "";
  const derivedLastName = display.split(/\s+/).slice(1).join(" ");
  const remoteLastName =
    explicitLastName ||
    (remoteFirstName === display ||
    (derivedLastName.length > 0 &&
      remoteFirstName.endsWith(` ${derivedLastName}`))
      ? ""
      : derivedLastName);
  return { firstName: remoteFirstName, lastName: remoteLastName };
}

/** Pencil is only for a linked contact while the dropdown is showing. */
export function contactDropdownNameEditShowsPencil(input: {
  contactId: string | null | undefined;
  mode: ContactDropdownNameEditMode;
}): boolean {
  return Boolean(input.contactId?.trim()) && input.mode === "dropdown";
}

/** After a successful name save (or cancel), return to the contact dropdown. */
export function contactDropdownNameEditModeAfterCommit(): ContactDropdownNameEditMode {
  return "dropdown";
}
