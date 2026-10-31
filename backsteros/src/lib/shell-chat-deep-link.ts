/**
 * Chat deep links: open the shell chat panel on a thread and optionally
 * scroll/highlight a message.
 *
 * Channel pending links (strict, require `message=`):
 * - `backsteros://chat/<threadId>?message=<msgId>`
 * - `/chat/<threadId>?message=<msgId>`
 *
 * Notifications may also open a thread without a message id.
 *
 * Reused by notifications, Channel needs_details, and in-app routes.
 */

import {
  isProjectChannelPendingLink,
  parseProjectChannelPendingLink,
} from "@backsteros/contracts";

export const SHELL_CHAT_OPEN_THREAD_EVENT = "backsteros:shell-chat-open-thread";

export type ShellChatOpenThreadDetail = {
  threadId: string;
  messageId?: string | null;
};

export type ParsedShellChatDeepLink = {
  threadId: string;
  messageId: string | null;
};

const THREAD_ID_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

/**
 * Parse a chat deep link (custom scheme or in-app path). Returns null when
 * the input is not a chat deep link.
 *
 * For Channel `channelPendingLink`, prefer {@link isProjectChannelPendingLink}
 * / {@link parseProjectChannelPendingLink} (message required).
 */
export function parseShellChatDeepLink(
  href: string | null | undefined,
): ParsedShellChatDeepLink | null {
  const pending = parseProjectChannelPendingLink(href);
  if (pending) {
    return { threadId: pending.threadId, messageId: pending.messageId };
  }

  // Allow thread-only links for notifications (not for channelPendingLink).
  const raw = href?.trim() ?? "";
  if (!raw) return null;

  try {
    if (raw.startsWith("backsteros://")) {
      const url = new URL(raw);
      if (url.hostname.toLowerCase() !== "chat") return null;
      if (url.pathname.replace(/^\//, "").includes("/")) return null;
      const threadId = url.pathname.replace(/^\//, "").split("/")[0]?.trim() ?? "";
      if (!THREAD_ID_RE.test(threadId)) return null;
      const messageId = url.searchParams.get("message")?.trim() || null;
      return { threadId, messageId };
    }

    if (raw.startsWith("/chat/")) {
      const url = new URL(raw, "https://backsteros.local");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 2 || parts[0] !== "chat" || !parts[1]) return null;
      const threadId = parts[1].trim();
      if (!THREAD_ID_RE.test(threadId)) return null;
      const messageId = url.searchParams.get("message")?.trim() || null;
      return { threadId, messageId };
    }
  } catch {
    return null;
  }
  return null;
}

/** True when href is a Channel-safe pending link (message required). */
export function isShellChatPendingLink(
  href: string | null | undefined,
): boolean {
  return isProjectChannelPendingLink(href);
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

/**
 * Parse an accepted deep-link form and open the shell chat panel.
 * When `requirePendingForm` is true (Channel Needs details), only the strict
 * pending-link shapes with `message=` are opened.
 */
export function openShellChatDeepLink(
  href: string,
  options?: { requirePendingForm?: boolean },
): boolean {
  if (options?.requirePendingForm && !isProjectChannelPendingLink(href)) {
    return false;
  }
  const parsed = parseShellChatDeepLink(href);
  if (!parsed) return false;
  openShellChatThread(parsed.threadId, parsed.messageId);
  return true;
}
