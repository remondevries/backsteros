export const SEARCHABLE_DROPDOWN_REQUEST_CLOSE = "searchable-dropdown-request-close";
export function requestCloseSearchableDropdowns() {
    window.dispatchEvent(new Event(SEARCHABLE_DROPDOWN_REQUEST_CLOSE));
}
