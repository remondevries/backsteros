/** Workspace-only pinned tasks (file editor left dock). Not used on dashboard. */

export type PinnedTaskSnap = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: number;
  projectId: string | null;
  projectKey: string | null;
};

const STORAGE_KEY = "backsterdesign.pinnedTasks.v1";
const COLLAPSED_STORAGE_KEY = "backsterdesign.pinnedTasks.collapsed.v1";
const HEIGHT_STORAGE_KEY = "backsterdesign.pinnedTasks.height.v1";
export const PINNED_TASKS_CHANGED = "backsterdesign:pinned-tasks-changed";
export const OPEN_PINNED_TASK = "backsterdesign:open-pinned-task";

/** Default / clamp bounds for the left-sidebar tasks dock height. */
export const PINNED_DOCK_DEFAULT_HEIGHT = 200;
export const PINNED_DOCK_MIN_HEIGHT = 96;
export const PINNED_DOCK_MAX_HEIGHT = 560;

type Store = Record<string, PinnedTaskSnap[]>;
type CollapsedStore = Record<string, boolean>;
type HeightStore = Record<string, number>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode — ignore
  }
}

function emit(penpotProjectId: string, tasks: PinnedTaskSnap[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PINNED_TASKS_CHANGED, {
      detail: { penpotProjectId, tasks },
    }),
  );
}

function readCollapsedStore(): CollapsedStore {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CollapsedStore;
  } catch {
    return {};
  }
}

function writeCollapsedStore(store: CollapsedStore): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode — ignore
  }
}

export function getPinnedTasks(penpotProjectId: string): PinnedTaskSnap[] {
  const id = penpotProjectId.trim();
  if (!id) return [];
  return [...(readStore()[id] ?? [])];
}

export function isPinnedDockCollapsed(penpotProjectId: string): boolean {
  const id = penpotProjectId.trim();
  if (!id) return false;
  return readCollapsedStore()[id] === true;
}

export function setPinnedDockCollapsed(
  penpotProjectId: string,
  collapsed: boolean,
): void {
  const id = penpotProjectId.trim();
  if (!id) return;
  const store = readCollapsedStore();
  if (collapsed) store[id] = true;
  else delete store[id];
  writeCollapsedStore(store);
}

function readHeightStore(): HeightStore {
  try {
    const raw = localStorage.getItem(HEIGHT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as HeightStore;
  } catch {
    return {};
  }
}

function writeHeightStore(store: HeightStore): void {
  try {
    localStorage.setItem(HEIGHT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode — ignore
  }
}

export function clampPinnedDockHeight(height: number): number {
  const max =
    typeof window !== "undefined"
      ? Math.min(PINNED_DOCK_MAX_HEIGHT, Math.round(window.innerHeight * 0.7))
      : PINNED_DOCK_MAX_HEIGHT;
  return Math.max(
    PINNED_DOCK_MIN_HEIGHT,
    Math.min(max, Math.round(height)),
  );
}

export function getPinnedDockHeight(penpotProjectId: string): number {
  const id = penpotProjectId.trim();
  if (!id) return PINNED_DOCK_DEFAULT_HEIGHT;
  const stored = readHeightStore()[id];
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return PINNED_DOCK_DEFAULT_HEIGHT;
  }
  return clampPinnedDockHeight(stored);
}

export function setPinnedDockHeight(
  penpotProjectId: string,
  height: number,
): void {
  const id = penpotProjectId.trim();
  if (!id) return;
  const store = readHeightStore();
  store[id] = clampPinnedDockHeight(height);
  writeHeightStore(store);
}

export function getPinnedTaskIds(penpotProjectId: string): Set<string> {
  return new Set(getPinnedTasks(penpotProjectId).map((t) => t.id));
}

export function isTaskPinned(
  penpotProjectId: string,
  taskId: string,
): boolean {
  return getPinnedTaskIds(penpotProjectId).has(taskId);
}

export function setPinnedTasks(
  penpotProjectId: string,
  tasks: PinnedTaskSnap[],
): void {
  const id = penpotProjectId.trim();
  if (!id) return;
  const store = readStore();
  if (tasks.length === 0) {
    delete store[id];
  } else {
    store[id] = tasks;
  }
  writeStore(store);
  emit(id, tasks);
}

export function togglePinnedTask(
  penpotProjectId: string,
  task: PinnedTaskSnap,
): PinnedTaskSnap[] {
  const current = getPinnedTasks(penpotProjectId);
  const exists = current.some((row) => row.id === task.id);
  const next = exists
    ? current.filter((row) => row.id !== task.id)
    : [...current, task];
  setPinnedTasks(penpotProjectId, next);
  return next;
}

export function unpinTask(
  penpotProjectId: string,
  taskId: string,
): PinnedTaskSnap[] {
  const next = getPinnedTasks(penpotProjectId).filter((t) => t.id !== taskId);
  setPinnedTasks(penpotProjectId, next);
  return next;
}

/** Merge fields into a pinned snap (e.g. after popover title/status edits). */
export function updatePinnedTaskSnap(
  penpotProjectId: string,
  taskId: string,
  patch: Partial<Omit<PinnedTaskSnap, "id">>,
): PinnedTaskSnap[] {
  const current = getPinnedTasks(penpotProjectId);
  let changed = false;
  const next = current.map((row) => {
    if (row.id !== taskId) return row;
    const merged = { ...row, ...patch, id: row.id };
    if (
      merged.title === row.title &&
      merged.status === row.status &&
      merged.priority === row.priority &&
      merged.number === row.number &&
      merged.projectId === row.projectId &&
      merged.projectKey === row.projectKey
    ) {
      return row;
    }
    changed = true;
    return merged;
  });
  if (changed) setPinnedTasks(penpotProjectId, next);
  return next;
}

/** Persist a new pin order (ids from the dock list). Unknown ids are ignored. */
export function reorderPinnedTasks(
  penpotProjectId: string,
  orderedIds: readonly string[],
): PinnedTaskSnap[] {
  const current = getPinnedTasks(penpotProjectId);
  if (current.length === 0) return current;
  const byId = new Map(current.map((task) => [task.id, task]));
  const next: PinnedTaskSnap[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    const task = byId.get(id);
    if (!task || seen.has(id)) continue;
    next.push(task);
    seen.add(id);
  }
  for (const task of current) {
    if (!seen.has(task.id)) next.push(task);
  }
  setPinnedTasks(penpotProjectId, next);
  return next;
}

let pendingOpenTaskId: string | null = null;

export function requestOpenPinnedTask(taskId: string): void {
  pendingOpenTaskId = taskId;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_PINNED_TASK, { detail: { taskId } }),
  );
}

/** Consume a pending open when the workspace tasks island mounts late. */
export function consumePendingOpenPinnedTask(): string | null {
  const id = pendingOpenTaskId;
  pendingOpenTaskId = null;
  return id;
}

export function toPinnedSnap(task: {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: number;
  projectId?: string | null;
  projectKey?: string | null;
}): PinnedTaskSnap {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    priority: task.priority,
    projectId: task.projectId ?? null,
    projectKey: task.projectKey ?? null,
  };
}
