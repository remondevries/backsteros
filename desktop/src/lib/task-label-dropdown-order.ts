export type TaskLabelDropdownSource = {
  id: string;
  name: string;
  color: string | null;
  isGroup: boolean;
  parentId: string | null;
};

export type OrderedTaskLabel = {
  id: string;
  name: string;
  color: string | null;
  /** Parent group name. Null for labels that are not in a group. */
  group: string | null;
};

function byName(
  a: { name: string },
  b: { name: string },
): number {
  return a.name.localeCompare(b.name);
}

/**
 * Selectable labels for the property dropdown.
 * Groups are not options; their children cluster under the group name so the
 * menu can draw a separator. Ungrouped labels stay flat. Empty groups are
 * omitted. Top-level labels and groups are ordered by name, matching Settings.
 */
export function orderTaskLabelsForDropdown(
  labels: readonly TaskLabelDropdownSource[],
): OrderedTaskLabel[] {
  const groups = labels.filter((label) => label.isGroup);
  const groupIds = new Set(groups.map((group) => group.id));
  const childrenOf = new Map<string, TaskLabelDropdownSource[]>();
  const ungrouped: TaskLabelDropdownSource[] = [];

  for (const label of labels) {
    if (label.isGroup) continue;
    if (label.parentId && groupIds.has(label.parentId)) {
      const list = childrenOf.get(label.parentId) ?? [];
      list.push(label);
      childrenOf.set(label.parentId, list);
    } else {
      ungrouped.push(label);
    }
  }

  for (const list of childrenOf.values()) {
    list.sort(byName);
  }

  const top: Array<
    | { kind: "label"; label: TaskLabelDropdownSource }
    | { kind: "group"; group: TaskLabelDropdownSource }
  > = [
    ...ungrouped.map((label) => ({ kind: "label" as const, label })),
    ...groups
      .filter((group) => (childrenOf.get(group.id)?.length ?? 0) > 0)
      .map((group) => ({ kind: "group" as const, group })),
  ];
  top.sort((a, b) =>
    byName(
      a.kind === "label" ? a.label : a.group,
      b.kind === "label" ? b.label : b.group,
    ),
  );

  const ordered: OrderedTaskLabel[] = [];
  for (const entry of top) {
    if (entry.kind === "label") {
      ordered.push({
        id: entry.label.id,
        name: entry.label.name,
        color: entry.label.color,
        group: null,
      });
      continue;
    }

    for (const child of childrenOf.get(entry.group.id) ?? []) {
      ordered.push({
        id: child.id,
        name: child.name,
        color: child.color,
        group: entry.group.name,
      });
    }
  }

  return ordered;
}
