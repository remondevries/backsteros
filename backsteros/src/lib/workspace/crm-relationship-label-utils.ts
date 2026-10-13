import type {
  ContactRelationshipType,
  CrmRelationshipLabel,
} from "@backsteros/contracts";

/** Fallback when a slug is not in the workspace catalog. */
export const RELATIONSHIP_TYPE_LABELS: Record<
  string,
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
  manager_of: { outgoing: "Manager of", incoming: "Reports to" },
  other: { outgoing: "Related", incoming: "Related" },
};

function titleCaseSlug(type: string): string {
  return type
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function relationshipTypeLabelFromCatalog(
  type: string,
  direction: "outgoing" | "incoming",
  labels: readonly CrmRelationshipLabel[],
): string | null {
  for (const label of labels) {
    if (label.sideASlug === type) {
      return direction === "outgoing" ? label.sideALabel : label.sideBLabel;
    }
    if (label.sideBSlug === type) {
      return direction === "outgoing" ? label.sideBLabel : label.sideALabel;
    }
  }
  return null;
}

export function relationshipTypeLabel(
  type: ContactRelationshipType | string,
  direction: "outgoing" | "incoming",
  labels?: readonly CrmRelationshipLabel[],
): string {
  if (labels && labels.length > 0) {
    const fromCatalog = relationshipTypeLabelFromCatalog(
      type,
      direction,
      labels,
    );
    if (fromCatalog) return fromCatalog;
  }
  const preset = RELATIONSHIP_TYPE_LABELS[type];
  if (preset) return preset[direction];
  return titleCaseSlug(type);
}
