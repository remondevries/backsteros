import type { BacksterosContact } from "./types";

/** Match a file-task agent display name to a BacksterOS contact for avatars. */
export function matchFileTaskAgentContact(
  agentName: string,
  contacts: readonly BacksterosContact[],
): BacksterosContact | null {
  const needle = agentName.trim().toLowerCase();
  if (!needle || contacts.length === 0) return null;

  const exactName = contacts.find((contact) => contact.name.trim().toLowerCase() === needle);
  if (exactName) return exactName;

  const exactFirst = contacts.find((contact) => contact.firstName?.trim().toLowerCase() === needle);
  if (exactFirst) return exactFirst;

  return (
    contacts.find((contact) => {
      const blob = [contact.name, contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob === needle || blob.includes(needle);
    }) ?? null
  );
}
