/**
 * Public HTTPS URL Chatwoot should POST account webhooks to.
 * Prefer an explicit webhook base, then any HTTPS public API URL.
 */
export function resolveChatwootWebhookBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const candidates = [
    env.CHATWOOT_WEBHOOK_BASE_URL?.trim(),
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

export function chatwootWebhookUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const base = resolveChatwootWebhookBaseUrl(env);
  return base ? `${base}/api/v1/webhooks/chatwoot` : null;
}
