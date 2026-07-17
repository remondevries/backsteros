export function shouldDismissInlineAddOnBlur(
  container: HTMLElement | null,
): boolean {
  const active = document.activeElement;
  if (!active) {
    return true;
  }

  if (container?.contains(active)) {
    return false;
  }

  return !active.closest("[data-searchable-dropdown-panel]");
}

/** On blur outside the inline add row: cancel when empty, submit when titled. */
export function scheduleInlineAddOnBlurAction(options: {
  container: HTMLElement | null;
  title: string;
  isPending: boolean;
  isSubmitting: () => boolean;
  onCancel: () => void;
  onSubmit: () => void;
}): void {
  window.setTimeout(() => {
    if (!shouldDismissInlineAddOnBlur(options.container)) {
      return;
    }

    if (options.isPending || options.isSubmitting()) {
      return;
    }

    const trimmed = options.title.trim();
    if (!trimmed) {
      options.onCancel();
      return;
    }

    options.onSubmit();
  }, 0);
}
