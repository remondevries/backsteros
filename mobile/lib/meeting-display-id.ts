export function formatMeetingDisplayId(number: number | null | undefined): string {
  if (number == null || !Number.isFinite(number)) return "MTG-?";
  return `MTG-${number}`;
}
