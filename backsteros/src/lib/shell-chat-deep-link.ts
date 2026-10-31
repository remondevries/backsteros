/**
 * Chat deep links: open the shell chat panel on a thread and optionally
 * scroll/highlight a message.
 *
 * Accepted forms:
 * - `backsteros://chat/<threadId>?message=<msgId>`
 * - `/chat/<threadId>?message=<msgId>`
 *
 * Reused by notifications, Channel needs_details, and in-app routes.
 */

export const SHELL_CHAT_OPEN_THREAD_EVENT = "backsteros:shell-chat-open-thread";

export type ShellChatOpenThreadDetail = {
  threadId: string;
  messageId?: string | null;
};

export type ParsedShellChatDeepLink = {
  threadId: string;
  messageId: string | null;
};

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

function isThreadId(value: string): boolean {
  return UUID_LIKE.test(value) || ID_RE.test(value);
}

/**
 * Parse a chat deep link (custom scheme or in-app path). Returns null when
 * the input is not a chat deep link.
 */
export function parseShellChatDeepLink(
  href: string | null | undefined,
): ParsedShellChatDeepLink | null {
  const raw = href?.trim() ?? "";
  if (!raw) return null;

  try {
    if (raw.startsWith("backsteros://")) {
      const url = new URL(raw);
      if (url.hostname !== "chat" && url.pathname.split("/")[1] !== "chat") {
        // backsteros://chat/<id> → hostname=chat, pathname=/<id>
        // backsteros://chat/<id> with some parsers may differ
      }
      const hostPath =
        url.hostname === "chat"
          ? url.pathname.replace(/^\//, "")
          : url.pathname.replace(/^\/chat\/?/, "");
      const threadId = (hostPath.split("/")[0] || "").trim();
      if (!threadId || !isThreadId(threadId)) return null;
      const messageId = url.searchParams.get("message")?.trim() || null;
      return { threadId, messageId };
    }

    if (raw.startsWith("/chat/") || raw.startsWith("chat/")) {
      const path = raw.startsWith("/") ? raw : `/${raw}`;
      const url = new URL(path, "https://backsteros.local");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "chat" || !parts[1]) return null;
      const threadId = parts[1].trim();
      if (!isThreadId(threadId)) return null;
      const messageId = url.searchParams.get("message")?.trim() || null;
      return { threadId, messageId };
    }
  } catch {
    return null;
  }
  return null;
}

/** Build the in-app router href for a thread (+ optional message). */
export function shellChatDeepLinkHref(
  threadId: string,
  messageId?: string | null,
): string {
  const id = threadId.trim();
  const base = `/chat/${encodeURIComponent(id)}`;
  const msg = messageId?.trim();
  return msg ? `${base}?message=${encodeURIComponent(msg)}` : base;
}

/** Build the custom-scheme form (stored in channelPendingLink by agents). */
export function shellChatDeepLinkScheme(
  threadId: string,
  messageId?: string | null,
): string {
  const id = threadId.trim();
  const base = `backsteros://chat/${encodeURIComponent(id)}`;
  const msg = messageId?.trim();
  return msg ? `${base}?message=${encodeURIComponent(msg)}` : base;
}

export function openShellChatThread(
  threadId: string,
  messageId?: string | null,
): void {
  const id = threadId.trim();
  if (!id || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ShellChatOpenThreadDetail>(SHELL_CHAT_OPEN_THREAD_EVENT, {
      detail: {
        threadId: id,
        messageId: messageId?.trim() || null,
      },
    }),
  );
}

/** Parse any accepted deep-link form and open the shell chat panel. */
export function openShellChatDeepLink(href: string): boolean {
  const parsed = parseShellChatDeepLink(href);
  if (!parsed) return false;
  openShellChatThread(parsed.threadId, parsed.messageId);
  return true;
}
