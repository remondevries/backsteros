export function isKanbanInteractiveCardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'button[aria-haspopup="listbox"], [data-kanban-property-dropdown], [data-task-property-dropdown]',
    ),
  );
}
