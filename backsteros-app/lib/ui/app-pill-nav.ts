/** Shared pill tab chrome for project sections, areas, due filters, etc. */
export const APP_PILL_NAV_ITEM_CLASS =
  "relative cursor-pointer rounded-full border-[0.5px] border-white/10 px-2 py-1 text-xs transition-colors";

export function appPillNavItemStateClass(isActive: boolean): string {
  return isActive
    ? "bg-white/5 font-medium text-foreground"
    : "text-foreground/55 hover:text-foreground/80";
}
