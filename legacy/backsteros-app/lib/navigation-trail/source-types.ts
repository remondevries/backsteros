export type ResolvedNavigationSourceItem = {
  label: string;
  href?: string;
};

export type ResolvedNavigationSource = {
  sectionLabel: string;
  sectionHref: string;
  items: ResolvedNavigationSourceItem[];
};
