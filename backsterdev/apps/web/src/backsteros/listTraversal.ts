import { groupBacksterosProjectsByStatus } from "./projectStatus";
import { groupBacksterosTasksByStatus } from "./taskStatus";

export type ListTraversalDirection = "previous" | "next";

/**
 * Flatten tasks in the same order as the sidebar status groups.
 */
export function orderedBacksterosTaskIds(
  tasks: readonly {
    readonly id: string;
    readonly status: string;
    readonly title?: string;
  }[],
): string[] {
  return groupBacksterosTasksByStatus(tasks).flatMap((group) => group.tasks.map((task) => task.id));
}

/**
 * Flatten inbox tasks in sidebar status-group order (Backlog / Ready to Start /
 * etc. instead of a single Due bucket). `workingTaskIds` is accepted for call
 * sites that already filter membership; order is status-based only.
 */
export function orderedBacksterosInboxTaskIds(
  tasks: readonly {
    readonly id: string;
    readonly status: string;
    readonly dueDate?: string | null | undefined;
    readonly sortOrder?: number;
    readonly title?: string;
  }[],
  _workingTaskIds?: ReadonlySet<string>,
): string[] {
  return orderedBacksterosTaskIds(tasks);
}

/**
 * Flatten projects in the same order as the sidebar status groups.
 */
export function orderedBacksterosProjectIds(
  projects: readonly {
    readonly id: string;
    readonly status: string;
    readonly sortOrder?: number;
    readonly name?: string;
  }[],
): string[] {
  return groupBacksterosProjectsByStatus(projects).flatMap((group) =>
    group.projects.map((project) => project.id),
  );
}

/**
 * Adjacent id for Cmd+Shift+[ / ] style list traversal.
 * When the current id is missing from the visible list (e.g. completed task
 * while inbox is filtered), treat it like no selection and pick an end.
 */
export function resolveAdjacentListItemId<T>(input: {
  readonly itemIds: readonly T[];
  readonly currentItemId: T | null;
  readonly direction: ListTraversalDirection;
}): T | null {
  const { itemIds, currentItemId, direction } = input;
  if (itemIds.length === 0) return null;

  const currentIndex = currentItemId == null ? -1 : itemIds.indexOf(currentItemId);

  if (currentIndex === -1) {
    return direction === "previous" ? (itemIds.at(-1) ?? null) : (itemIds[0] ?? null);
  }

  if (direction === "previous") {
    return currentIndex > 0 ? (itemIds[currentIndex - 1] ?? null) : null;
  }

  return currentIndex < itemIds.length - 1 ? (itemIds[currentIndex + 1] ?? null) : null;
}

/**
 * Seed the left-rail j/k highlight after a list-mode flip.
 * Prefer the route/open selection; when returning to the projects rail (no
 * route selection), fall back to the project the user just left.
 */
export function resolveSidepanelHighlightSeed(input: {
  readonly currentItemId: string | null;
  readonly itemIds: readonly string[];
  readonly rememberedId?: string | null;
}): string | null {
  const { currentItemId, itemIds, rememberedId = null } = input;
  if (currentItemId != null && (itemIds.length === 0 || itemIds.includes(currentItemId))) {
    return currentItemId;
  }
  if (rememberedId != null && (itemIds.length === 0 || itemIds.includes(rememberedId))) {
    return rememberedId;
  }
  return null;
}
