import type { CrmRelationshipLabel } from "@backsteros/contracts";

export type RelationshipSideOption = {
  value: string;
  label: string;
  labelId: string;
  searchTerms?: string;
};

export const OTHER_RELATIONSHIP_TYPE_VALUE = "__other__";

export function slugifyRelationshipType(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function formatRelationshipTypeLabel(type: string): string {
  return type
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Expand catalog rows into selectable side options (Parent and Child both appear). */
export function expandRelationshipLabelSides(
  labels: readonly CrmRelationshipLabel[],
): RelationshipSideOption[] {
  const options: RelationshipSideOption[] = [];
  const seenSlugs = new Set<string>();

  for (const label of labels) {
    if (!seenSlugs.has(label.sideASlug)) {
      seenSlugs.add(label.sideASlug);
      options.push({
        value: label.sideASlug,
        label: label.sideALabel,
        labelId: label.id,
        searchTerms: `${label.sideALabel} ${label.sideBLabel}`,
      });
    }
    if (
      label.sideBSlug !== label.sideASlug &&
      !seenSlugs.has(label.sideBSlug)
    ) {
      seenSlugs.add(label.sideBSlug);
      options.push({
        value: label.sideBSlug,
        label: label.sideBLabel,
        labelId: label.id,
        searchTerms: `${label.sideALabel} ${label.sideBLabel}`,
      });
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function findRelationshipLabelById(
  labels: readonly CrmRelationshipLabel[],
  id: string,
): CrmRelationshipLabel | null {
  return labels.find((label) => label.id === id) ?? null;
}

export function findRelationshipLabelBySideSlug(
  labels: readonly CrmRelationshipLabel[],
  slug: string,
): CrmRelationshipLabel | null {
  return (
    labels.find(
      (label) =>
        label.sideASlug === slug || label.sideBSlug === slug,
    ) ?? null
  );
}
