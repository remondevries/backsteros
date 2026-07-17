export const KEYBOARD_NAV_ITEM_ATTR = "data-keyboard-nav-item";

export function keyboardNavItemProps(itemId: string) {
  return { [KEYBOARD_NAV_ITEM_ATTR]: itemId } as const;
}

export function queryKeyboardNavItem(
  container: HTMLElement,
  itemId: string,
): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[${KEYBOARD_NAV_ITEM_ATTR}="${CSS.escape(itemId)}"]`,
  );
}

export function scrollKeyboardNavItemIntoView(
  container: HTMLElement,
  itemId: string,
): void {
  queryKeyboardNavItem(container, itemId)?.scrollIntoView({ block: "nearest" });
}

function isFocusableKeyboardNavElement(element: HTMLElement): boolean {
  if (
    element.matches(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    )
  ) {
    return true;
  }

  const tabIndex = element.tabIndex;
  return tabIndex >= 0;
}

export function focusListKeyboardNavItem(
  container: HTMLElement,
  itemId: string,
): void {
  const marker = queryKeyboardNavItem(container, itemId);
  if (!marker) {
    return;
  }

  const focusable = isFocusableKeyboardNavElement(marker)
    ? marker
    : marker.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), [role="button"][tabindex="0"]',
      );

  if (focusable) {
    focusable.focus({ preventScroll: true });
    return;
  }

  if (marker.getAttribute("tabindex") != null) {
    marker.focus({ preventScroll: true });
    return;
  }

  if (container.getAttribute("tabindex") != null) {
    container.focus({ preventScroll: true });
  }
}

export function keyboardNavItemClass(isHighlighted: boolean): string {
  return isHighlighted ? "keyboard-nav-item-highlight" : "";
}

/** Main-content / entity list rows: hover bg only; j/k focus uses orange inset ring only. */
export function keyboardNavListItemClass(isHighlighted: boolean): string {
  return [
    "keyboard-nav-list-item",
    keyboardNavItemClass(isHighlighted),
  ]
    .filter(Boolean)
    .join(" ");
}
