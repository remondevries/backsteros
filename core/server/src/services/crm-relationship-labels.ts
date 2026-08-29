import type { ContactRelationshipType } from "@backsteros/contracts";

/** Inverse type labels when viewing an incoming edge. */
export const RELATIONSHIP_TYPE_LABELS: Record<
  ContactRelationshipType,
  { outgoing: string; incoming: string }
> = {
  spouse: { outgoing: "Spouse", incoming: "Spouse" },
  partner: { outgoing: "Partner", incoming: "Partner" },
  child: { outgoing: "Child", incoming: "Parent" },
  parent: { outgoing: "Parent", incoming: "Child" },
  sibling: { outgoing: "Sibling", incoming: "Sibling" },
  friend: { outgoing: "Friend", incoming: "Friend" },
  colleague: { outgoing: "Colleague", incoming: "Colleague" },
  reports_to: { outgoing: "Reports to", incoming: "Manager of" },
  other: { outgoing: "Related", incoming: "Related" },
};

export function relationshipTypeLabel(
  type: ContactRelationshipType,
  direction: "outgoing" | "incoming",
): string {
  return RELATIONSHIP_TYPE_LABELS[type][direction];
}
