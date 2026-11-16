/**
 * Mask a stored secret for Settings UIs: show only the last 4 characters.
 */
export function previewSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "••••";
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `••••…${trimmed.slice(-4)}`;
}
