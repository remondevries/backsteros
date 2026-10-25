/** Placeholder when a settings secret is already stored (show preview, not "Configured"). */
export function settingsSecretPlaceholder(
  preview: string | null | undefined,
  fallback = "••••••••••••",
): string {
  const trimmed = preview?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/** Class for inputs whose placeholder shows a stored secret (white placeholder text). */
export const SETTINGS_SECRET_SET_CLASS = "settings-field__input--has-secret";

export function settingsSecretInputClassName(
  configured: boolean,
  extra?: string | null,
): string {
  return [configured ? SETTINGS_SECRET_SET_CLASS : null, extra ?? null]
    .filter(Boolean)
    .join(" ");
}
