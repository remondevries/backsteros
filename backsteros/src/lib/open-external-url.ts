import { isInternalAppHref } from "../../packages/ui/src/navigation/is-internal-app-href.js";

/** Schemes the desktop shell opens in the system browser / handler. */
const OPENABLE_SCHEMES = /^(https?|mailto|tel):/i;

function isDevAppHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "tauri.localhost"
  );
}

/**
 * True for http(s) / mailto / tel that are not in-app routes.
 * Custom schemes (e.g. Spark) stay as normal anchors — opener scope may deny them.
 */
export function isOpenableExternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || isInternalAppHref(trimmed)) return false;
  if (trimmed.startsWith("javascript:")) return false;
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:")
  ) {
    return false;
  }

  try {
    const base =
      typeof window !== "undefined"
        ? window.location.href
        : "http://internal.invalid/";
    const url = new URL(trimmed, base);
    if (url.protocol === "mailto:" || url.protocol === "tel:") {
      return true;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    // Dev / webview origin stays in the SPA (matches Rust `is_app_origin`).
    if (isDevAppHost(url.hostname)) return false;
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return false;
    }
    return true;
  } catch {
    return OPENABLE_SCHEMES.test(trimmed);
  }
}

/**
 * Resolve an external `<a href>` from a click, including shadow-DOM email HTML
 * (use `composedPath()` — `closest` stops at the shadow host).
 */
export function resolveExternalAnchorHref(
  event: Pick<MouseEvent, "target" | "composedPath">,
): string | null {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (!(node instanceof HTMLAnchorElement)) continue;
    if (node.hasAttribute("download")) return null;
    const rawHref = node.getAttribute("href") ?? "";
    if (!isOpenableExternalHref(rawHref)) return null;
    try {
      return new URL(rawHref, window.location.href).href;
    } catch {
      return rawHref.trim();
    }
  }
  return null;
}

/** Open a URL via Tauri opener, with browser / synthetic-anchor fallbacks. */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(trimmed);
    return;
  } catch {
    // Fall through for web / opener unavailable.
  }

  // Do not pass a features string — WKWebView may treat it as window features.
  const opened = window.open(trimmed, "_blank");
  if (opened) return;

  const anchor = document.createElement("a");
  anchor.href = trimmed;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
