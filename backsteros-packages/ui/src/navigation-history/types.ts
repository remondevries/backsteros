export type NavigationHistoryEntry = {
  href: string;
  title: string;
  visitedAt: number;
  icon?: string | null;
};

export type NavigationHistoryState = {
  entries: NavigationHistoryEntry[];
  index: number;
};
