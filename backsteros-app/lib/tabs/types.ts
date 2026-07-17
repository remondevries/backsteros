export type AppTab = {
  id: string;
  href: string;
  title: string;
  /** Entity icon payload for document/letter detail tabs; undefined until the page registers. */
  icon?: string | null;
};

export type TabsState = {
  tabs: AppTab[];
  activeTabId: string;
};
