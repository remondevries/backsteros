export const SEARCHABLE_DROPDOWN_REQUEST_CLOSE =
  "searchable-dropdown-request-close";

export function requestCloseSearchableDropdowns(): void {
  window.dispatchEvent(new Event(SEARCHABLE_DROPDOWN_REQUEST_CLOSE));
}
