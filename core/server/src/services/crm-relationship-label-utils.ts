import type {
  ContactRelationshipType,
  CrmRelationshipLabel,
} from "@backsteros/contracts";

/** Built-in pairs seeded per workspace (Parent ↔ Child, …). */
export const DEFAULT_RELATIONSHIP_LABEL_SEEDS: ReadonlyArray<{
  sideALabel: string;
  sideASlug: string;
  sideBLabel: string;
  sideBSlug: string;
  sortOrder: number;
}> = [
  {
    sideALabel: "Parent",
    sideASlug: "parent",
    sideBLabel: "Child",
    sideBSlug: "child",
    sortOrder: 10,
  },
  {
    sideALabel: "Spouse",
    sideASlug: "spouse",
    sideBLabel: "Spouse",
    sideBSlug: "spouse",
    sortOrder: 20,
  },
  {
    sideALabel: "Partner",
    sideASlug: "partner",
    sideBLabel: "Partner",
    sideBSlug: "partner",
    sortOrder: 30,
  },
  {
    sideALabel: "Sibling",
    sideASlug: "sibling",
    sideBLabel: "Sibling",
    sideBSlug: "sibling",
    sortOrder: 40,
  },
  {
    sideALabel: "Friend",
    sideASlug: "friend",
    sideBLabel: "Friend",
    sideBSlug: "friend",
    sortOrder: 50,
  },
  {
    sideALabel: "Colleague",
    sideASlug: "colleague",
    sideBLabel: "Colleague",
    sideBSlug: "colleague",
    sortOrder: 60,
  },
  {
    sideALabel: "Reports to",
    sideASlug: "reports_to",
    sideBLabel: "Manager of",
    sideBSlug: "manager_of",
    sortOrder: 70,
  },
];

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

export function slugifyRelationshipLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
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
