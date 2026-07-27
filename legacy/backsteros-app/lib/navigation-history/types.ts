import type { TaskStatus } from "@/lib/task-status";

export type NavigationHistoryEntry = {
  href: string;
  title: string;
  visitedAt: number;
  icon?: string | null;
  taskStatus?: TaskStatus | null;
};

export type NavigationHistoryState = {
  entries: NavigationHistoryEntry[];
  index: number;
};

export type NavigationHistoryStore = {
  version: 2;
  stacksByTabId: Record<string, NavigationHistoryState>;
};
