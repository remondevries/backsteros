export const NATIVE_DATE_PICKER_OPEN_ATTRIBUTE = "data-native-date-picker-open";

export function isNativeDatePickerOpen(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector(`[${NATIVE_DATE_PICKER_OPEN_ATTRIBUTE}]`) !== null ||
    document.querySelector("[data-due-date-calendar-popover]") !== null
  );
}

export function openNativeDatePicker(
  input: HTMLInputElement | null | undefined,
): void {
  if (!input) {
    return;
  }

  input.setAttribute(NATIVE_DATE_PICKER_OPEN_ATTRIBUTE, "");
  const clearOpenMarker = () => {
    input.removeEventListener("blur", clearOpenMarker);
    input.removeEventListener("cancel", clearOpenMarker);
    input.removeEventListener("change", clearOpenMarker);
    input.removeAttribute(NATIVE_DATE_PICKER_OPEN_ATTRIBUTE);
  };

  input.addEventListener("blur", clearOpenMarker, { once: true });
  input.addEventListener("cancel", clearOpenMarker, { once: true });
  input.addEventListener("change", clearOpenMarker, { once: true });
  input.focus({ preventScroll: true });
  input.showPicker?.();
}
