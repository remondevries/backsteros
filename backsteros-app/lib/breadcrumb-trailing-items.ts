import type { BreadcrumbItem } from "@/components/shell/breadcrumb";

/** Only surface registered leaf crumbs when the route is in detail mode. */
export function getActiveBreadcrumbExtraItems(
  pathname: string,
  extraItems: BreadcrumbItem[],
  shouldIncludeTrailingItems: (pathname: string) => boolean,
): BreadcrumbItem[] {
  return shouldIncludeTrailingItems(pathname) ? extraItems : [];
}
