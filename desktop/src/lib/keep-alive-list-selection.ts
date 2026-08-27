/** Select the first list row in the pane snapshot — no router hop. */
export function panePathnameWithFirstItem(
  pathname: string,
  firstHref: string | null | undefined,
  hasRoutedItem: boolean,
): string {
  if (hasRoutedItem || !firstHref) return pathname;
  return firstHref;
}
