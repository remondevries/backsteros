/**
 * Pure helpers for desktop task-shell PTY security.
 *
 * Task-shell is stricter than the general PTY bridge (mobile / Tailscale):
 * - PTY_AUTH_TOKEN must be set (fail closed)
 * - Browser Origin allowlist is localhost / 127.0.0.1 / tauri / *.localhost only
 *   (no *.exp.direct / *.exp.host — those are public tunnel domains)
 *
 * cwd: absolute paths and `~/…` are accepted as sent by the desktop owner
 * session. There is no chroot; trust is owner-only + loopback + auth, not
 * path sandboxing.
 */

/**
 * Origins allowed to mint / open task-shell sessions.
 * @param {unknown} origin
 */
export function isAllowedTaskShellOrigin(origin) {
  if (typeof origin !== "string" || !origin.trim()) return false;
  try {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return true;
    }
    if (/^tauri:\/\//i.test(origin)) return true;
    if (/\.localhost$/i.test(new URL(origin).hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * Task-shell requires a configured sidecar auth token (fail closed).
 * @param {string | null | undefined} authToken
 */
export function isTaskShellAuthConfigured(authToken) {
  return typeof authToken === "string" && authToken.trim().length > 0;
}

/**
 * Authorize a task-shell HTTP/WS request against PTY_AUTH_TOKEN.
 * Returns false when the token is unset or the provided bearer mismatches.
 * @param {string | null | undefined} authToken
 * @param {string | null | undefined} providedBearer
 */
export function isTaskShellAuthorized(authToken, providedBearer) {
  if (!isTaskShellAuthConfigured(authToken)) return false;
  const expected = authToken.trim();
  const provided =
    typeof providedBearer === "string" ? providedBearer.trim() : "";
  return provided.length > 0 && provided === expected;
}

/**
 * Whether a browser Origin is acceptable for task-shell mint/WS.
 * Missing Origin is allowed (non-browser / same-machine tools); when present
 * it must pass {@link isAllowedTaskShellOrigin}.
 * @param {unknown} origin
 */
export function isTaskShellOriginAcceptable(origin) {
  if (origin == null) return true;
  if (typeof origin !== "string") return false;
  if (!origin.trim()) return true;
  return isAllowedTaskShellOrigin(origin);
}

/**
 * Resolve a requested task-shell cwd.
 * Absolute paths and `~/…` are allowed (owner-controlled desktop cwd).
 * Relative paths are ignored in favour of `defaultCwd` (typically $HOME).
 * @param {string | null | undefined} cwdParam
 * @param {string} defaultCwd
 * @param {{ homedir: () => string, join: (...parts: string[]) => string, isAbsolute: (p: string) => boolean }} pathApi
 */
export function resolveTaskShellCwd(cwdParam, defaultCwd, pathApi) {
  if (!cwdParam) return defaultCwd;
  if (cwdParam === "~") return pathApi.homedir();
  if (cwdParam.startsWith("~/")) {
    return pathApi.join(pathApi.homedir(), cwdParam.slice(2));
  }
  if (pathApi.isAbsolute(cwdParam)) return cwdParam;
  return defaultCwd;
}
