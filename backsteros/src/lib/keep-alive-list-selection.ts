import { resolveAppHref } from "./resolve-app-href";

/** Select the first list row in the pane snapshot — no router hop. */
export function panePathnameWithFirstItem(
  pathname: string,
  firstHref: string | null | undefined,
  hasRoutedItem: boolean,
): string {
  if (hasRoutedItem) return pathname;

  const resolved = resolveAppHref(pathname);
  if (resolved.pathname !== pathname) {
    return resolved.pathname;
  }

  if (!firstHref) return pathname;
  // Selection matchers use pathname only — strip query (e.g. email `?list=inbox`).
  const queryIndex = firstHref.indexOf("?");
  return queryIndex >= 0 ? firstHref.slice(0, queryIndex) : firstHref;
}
