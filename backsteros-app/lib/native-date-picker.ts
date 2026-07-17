export const NATIVE_DATE_PICKER_OPEN_ATTRIBUTE = "data-native-date-picker-open";

export function openNativeDatePicker(
  input: HTMLInputElement | null | undefined,
): void {
  if (!input) {
    return;
  }

  input.setAttribute(NATIVE_DATE_PICKER_OPEN_ATTRIBUTE, "");
  const clearOpenMarker = () => {
    input.removeAttribute(NATIVE_DATE_PICKER_OPEN_ATTRIBUTE);
  };

  input.addEventListener("blur", clearOpenMarker, { once: true });
  input.addEventListener("cancel", clearOpenMarker, { once: true });
  input.addEventListener("change", clearOpenMarker, { once: true });
  input.focus({ preventScroll: true });
  input.showPicker?.();
}

export function isNativeDatePickerOpen(): boolean {
  if (
    document.querySelector(
      `input[type="date"][${NATIVE_DATE_PICKER_OPEN_ATTRIBUTE}]`,
    )
  ) {
    return true;
  }

  const active = document.activeElement;
  return (
    active !== null &&
    active.tagName === "INPUT" &&
    (active as HTMLInputElement).type === "date"
  );
}
