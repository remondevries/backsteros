/**
 * Google push requires a public HTTPS URL. Prefer an explicit webhook base,
 * then any HTTPS public API URL. HTTP / loopback cannot receive Google pushes.
 */
export function resolveGoogleCalendarWebhookBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const candidates = [
    env.GOOGLE_CALENDAR_WEBHOOK_BASE_URL?.trim(),
    env.BACKSTEROS_PUBLIC_API_URL?.trim(),
    env.CORE_PUBLIC_URL?.trim(),
    env.PUBLIC_API_URL?.trim(),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") continue;
      if (
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname.endsWith(".local")
      ) {
        continue;
      }
      return url.origin;
    } catch {
      // ignore invalid
    }
  }
  return null;
}

export function googleCalendarWebhookUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const base = resolveGoogleCalendarWebhookBaseUrl(env);
  return base ? `${base}/api/v1/webhooks/google-calendar` : null;
}
