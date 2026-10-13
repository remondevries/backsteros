export type BacksterosProjectLikeForReorder = {
  readonly id: string;
  readonly sortOrder?: number;
};

export type BacksterosProjectSortPatch = {
  readonly id: string;
  readonly sortOrder: number;
};

/**
 * Reindex projects in a single status group after a same-status drag reorder.
 * Uses stride 10 to leave room for inserts (parity with desktop).
 */
export function projectSortOrderPatchesForGroup(
  orderedProjects: readonly BacksterosProjectLikeForReorder[],
): readonly BacksterosProjectSortPatch[] {
  return orderedProjects.map((project, index) => ({
    id: project.id,
    sortOrder: index * 10,
  }));
}

/** Apply sortOrder patches onto a full project list (other rows unchanged). */
export function applyProjectSortOrderPatches<
  T extends { readonly id: string; readonly sortOrder?: number },
>(projects: readonly T[], patches: readonly BacksterosProjectSortPatch[]): T[] {
  if (patches.length === 0) return [...projects];
  const byId = new Map(patches.map((patch) => [patch.id, patch.sortOrder]));
  return projects.map((project) => {
    const sortOrder = byId.get(project.id);
    if (sortOrder === undefined) return project;
    return { ...project, sortOrder };
  });
}
