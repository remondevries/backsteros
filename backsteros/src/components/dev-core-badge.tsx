import { getDesktopPublicEnvironment, isLocalDevApiUrl } from "../lib/env";

/**
 * Pure visibility for the DEV badge. No storage/sync/routing side effects —
 * reads only the Vite API URL. Hidden in production builds and on `:8788`.
 */
export function shouldShowDevCoreBadge(input: {
  viteDev: boolean;
  apiUrl: string;
}): { show: boolean; port: string | null } {
  if (!input.viteDev) return { show: false, port: null };
  if (!isLocalDevApiUrl(input.apiUrl)) return { show: false, port: null };
  let port: string;
  try {
    port = new URL(input.apiUrl).port || "80";
  } catch {
    return { show: false, port: null };
  }
  // Canonical local-core LaunchAgent — never badge that as DEV-isolated.
  if (port === "8788") return { show: false, port: null };
  return { show: true, port };
}

/**
 * Visible marker for native DEBUG / Vite hot-reload against an isolated DEV
 * core (e.g. `:8800`). Window title is overlay-hidden on macOS, so chrome must
 * say DEV — never confuse with `/Applications/BacksterOS.app`.
 */
export function DevCoreBadge() {
  const api = getDesktopPublicEnvironment().apiUrl;
  const { show, port } = shouldShowDevCoreBadge({
    viteDev: import.meta.env.DEV,
    apiUrl: api,
  });
  if (!show || port == null) return null;

  return (
    <div
      className="bos-dev-core-badge"
      title={`Isolated DEV API ${api} (PowerSync off; not production)`}
      role="status"
    >
      DEV :{port}
    </div>
  );
}
