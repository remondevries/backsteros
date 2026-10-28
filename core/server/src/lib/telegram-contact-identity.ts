/**
 * Pure helpers for persisting Telegram chat_id + @username on a contact (OS-146).
 * Chat_id is required for bot outbound after a conversation is deleted; the
 * t.me link is kept for humans.
 */

export type TelegramSocialAccount = { platform: string; url: string };

function isTelegramPlatform(platform: string): boolean {
  const key = platform.trim().toLowerCase();
  return key === "telegram" || key === "tg" || key === "t.me";
}

/** Digits-only Telegram chat_id (Chatwoot contact_inboxes source_id). */
export function normalizeTelegramChatId(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  return /^\d{3,32}$/.test(value) ? value : null;
}

/** Public @handle without @; empty when the value looks like a chat_id. */
export function normalizeTelegramUsername(
  raw: string | null | undefined,
): string | null {
  let value = raw?.trim() ?? "";
  if (!value) return null;
  value = value.replace(/^@+/, "");
  if (/^\d{3,32}$/.test(value)) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "t.me" || host === "telegram.me") {
      const parts = url.pathname.split("/").filter(Boolean);
      value = parts[0]?.replace(/^@+/, "") ?? "";
    }
  } catch {
    // fall through
  }
  value = value.replace(/^\/+|\/+$/g, "").split("/")[0]?.trim() ?? "";
  if (!value || /^\d+$/.test(value)) return null;
  if (!/^[A-Za-z0-9_]{3,64}$/.test(value)) return null;
  return value;
}

export function telegramMeUrl(username: string): string {
  return `https://t.me/${username.replace(/^@+/, "")}`;
}

/**
 * Merge inbound Telegram identity onto a contact.
 * - Sets/keeps telegramChatId when a numeric chat_id is known.
 * - Adds/updates a telegram socialAccounts entry for @username (t.me link)
 *   without dropping other t.me links that already exist.
 */
export function mergeTelegramIdentityOnContact(input: {
  telegramChatId: string | null | undefined;
  socialAccounts: readonly TelegramSocialAccount[] | null | undefined;
  nextChatId: string | null | undefined;
  nextUsername: string | null | undefined;
  /**
   * When true, do not claim `nextChatId` (another workspace contact already
   * holds it). Username / t.me link updates still apply.
   */
  chatIdTakenByOtherContact?: boolean;
}): {
  telegramChatId: string | null;
  socialAccounts: TelegramSocialAccount[];
  changed: boolean;
  /** True when nextChatId was skipped because another contact owns it. */
  skippedChatIdTaken: boolean;
} {
  const currentChatId = normalizeTelegramChatId(input.telegramChatId);
  const nextChatId = normalizeTelegramChatId(input.nextChatId);
  const nextUsername = normalizeTelegramUsername(input.nextUsername);
  const socialAccounts = (input.socialAccounts ?? []).map((entry) => ({
    platform: entry.platform,
    url: entry.url,
  }));

  let changed = false;
  let skippedChatIdTaken = false;
  let telegramChatId = currentChatId;

  if (nextChatId && nextChatId !== currentChatId) {
    // Never overwrite a differing stored chat_id (wrong-link protection).
    if (!currentChatId) {
      if (input.chatIdTakenByOtherContact) {
        skippedChatIdTaken = true;
      } else {
        telegramChatId = nextChatId;
        changed = true;
      }
    }
  }

  if (nextUsername) {
    const targetUrl = telegramMeUrl(nextUsername);
    const existingIdx = socialAccounts.findIndex((entry) => {
      if (!isTelegramPlatform(entry.platform)) return false;
      const handle = normalizeTelegramUsername(entry.url);
      return handle?.toLowerCase() === nextUsername.toLowerCase();
    });
    if (existingIdx < 0) {
      socialAccounts.push({ platform: "telegram", url: targetUrl });
      changed = true;
    } else if (socialAccounts[existingIdx]!.url !== targetUrl) {
      socialAccounts[existingIdx] = {
        platform: "telegram",
        url: targetUrl,
      };
      changed = true;
    }
  }

  return {
    telegramChatId: telegramChatId ?? null,
    socialAccounts,
    changed,
    skippedChatIdTaken,
  };
}

/**
 * Resolve chat_id + optional @username from Chatwoot contact fields.
 * Prefer an explicit telegramChatId / inbox source_id over a numeric username.
 */
export function resolveTelegramIdentityFromChatwoot(input: {
  username?: string | null;
  telegramChatId?: string | null;
  inboxSourceId?: string | null;
}): { chatId: string | null; username: string | null } {
  const chatId =
    normalizeTelegramChatId(input.telegramChatId) ||
    normalizeTelegramChatId(input.inboxSourceId) ||
    normalizeTelegramChatId(input.username);
  const username = normalizeTelegramUsername(input.username);
  return { chatId, username };
}
