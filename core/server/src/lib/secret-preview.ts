/**
 * Mask a stored secret for Settings UIs: show most of the value, hide the tail.
 */
export function previewSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "••••";
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  const hide = Math.max(4, Math.min(8, Math.ceil(trimmed.length * 0.25)));
  return `${trimmed.slice(0, trimmed.length - hide)}${"•".repeat(hide)}`;
}
