/**
 * Infrastructure routes that must not be exposed on the public agents door.
 * All other `/api/v1/*` traffic is forwarded; core still enforces API key scopes.
 * Settings are blocked here as defence in depth (OS-146) — core also rejects
 * agent persona keys on `/api/v1/settings/*`.
 */
export const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\/api\/v1\/sync(?:\/|$)/,
  /^\/api\/v1\/powersync(?:\/|$)/,
  /^\/api\/v1\/ops(?:\/|$)/,
  /^\/api\/v1\/agent-pty(?:\/|$)/,
  /^\/api\/v1\/api-keys(?:\/|$)/,
  /^\/api\/v1\/settings(?:\/|$)/,
];

export function isRouteAllowed(method: string, pathname: string): boolean {
  void method;
  if (!pathname.startsWith("/api/v1/")) {
    return false;
  }
  return !BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}
