import { NAVIGATION_LEADER_SHORTCUTS } from "@/lib/shortcuts/navigation-shortcut-bindings";

export type GoNavigationItem = {
  id: string;
  label: string;
  hint: string;
  href: string;
  letter: string;
};

export function buildGoNavigationItems(): GoNavigationItem[] {
  return NAVIGATION_LEADER_SHORTCUTS.map((binding) => ({
    id: binding.id,
    label: binding.label,
    hint: binding.hint,
    href: binding.href,
    letter: binding.letter,
  }));
}

export function goNavigationItemSearchValue(item: GoNavigationItem): string {
  return `${item.label} ${item.letter} ${item.href}`;
}
