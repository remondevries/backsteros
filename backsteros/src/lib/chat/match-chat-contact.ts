import {
  contactMatchesEmailAddress,
  normalizePhoneKey,
} from "@backsteros/contracts";

export type ChatMatchableSocialAccount = {
  platform?: string | null;
  url?: string | null;
};

export type ChatMatchableContact = {
  id: string;
  email?: string | null;
  emails?: readonly { address?: string | null }[] | null;
  phone?: string | null;
  phones?: readonly { number?: string | null }[] | null;
  socialAccounts?: readonly ChatMatchableSocialAccount[] | null;
  /** Facebook Messenger Page-Scoped ID (not a public username). */
  facebookMessengerId?: string | null;
  /** Numeric X user id (never an @handle). */
  xUserId?: string | null;
};

export type ChatChannelSocialKind =
  | "telegram"
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "x"
  | null;

function contactPhoneKeys(contact: ChatMatchableContact): Set<string> {
  const keys = new Set<string>();
  const primary = contact.phone?.trim();
  if (primary) {
    const key = normalizePhoneKey(primary);
    if (key) keys.add(key);
  }
  for (const entry of contact.phones ?? []) {
    const number = entry.number?.trim();
    if (!number) continue;
    const key = normalizePhoneKey(number);
    if (key) keys.add(key);
  }
  return keys;
}

/** Normalize a Telegram @handle / t.me URL to a bare username (lowercase). */
export function normalizeTelegramHandle(raw: string | null | undefined): string {
  let value = raw?.trim() ?? "";
  if (!value) return "";
  value = value.replace(/^@+/, "");
  const tMe = value.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/([^/?#]+)/i);
  if (tMe?.[1]) value = tMe[1];
  value = value.replace(/^\/+|\/+$/g, "").split("/")[0]?.trim() ?? "";
  return value.toLowerCase();
}

/** Normalize a Facebook / Messenger profile id or vanity handle. */
export function normalizeFacebookHandle(raw: string | null | undefined): string {
  let value = raw?.trim() ?? "";
  if (!value) return "";
  value = value.replace(/^@+/, "");
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "facebook.com" || host === "fb.com" || host === "m.me") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "profile.php") {
        return (url.searchParams.get("id") ?? "").trim().toLowerCase();
      }
      if (parts[0]) return parts[0].toLowerCase();
    }
  } catch {
    // fall through
  }
  return value.replace(/^\/+|\/+$/g, "").split("/")[0]?.trim().toLowerCase() ?? "";
}

/** Normalize an Instagram @handle / profile URL to a bare username (lowercase). */
export function normalizeInstagramHandle(
  raw: string | null | undefined,
): string {
  let value = raw?.trim() ?? "";
  if (!value) return "";
  value = value.replace(/^@+/, "");
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "instagram.com" || host === "instagr.am") {
      const parts = url.pathname.split("/").filter(Boolean);
      // Skip path prefixes that are not profile usernames.
      if (
        parts[0] &&
        !["p", "reel", "reels", "stories", "explore", "tv"].includes(
          parts[0].toLowerCase(),
        )
      ) {
        return parts[0].toLowerCase();
      }
      return "";
    }
  } catch {
    // fall through
  }
  return value.replace(/^\/+|\/+$/g, "").split("/")[0]?.trim().toLowerCase() ?? "";
}

function isTelegramPlatform(platform: string): boolean {
  const key = platform.trim().toLowerCase();
  return key === "telegram" || key === "tg" || key === "t.me";
}

function isFacebookPlatform(platform: string): boolean {
  const key = platform.trim().toLowerCase();
  return (
    key === "facebook" ||
    key === "fb" ||
    key === "messenger" ||
    key === "facebook messenger"
  );
}

function isInstagramPlatform(platform: string): boolean {
  const key = platform.trim().toLowerCase();
  return key === "instagram" || key === "ig" || key === "insta";
}

function isWhatsAppPlatform(platform: string): boolean {
  const key = platform.trim().toLowerCase();
  return key === "whatsapp" || key === "wa" || key === "wa.me";
}

function isXPlatform(platform: string): boolean {
  const key = platform.trim().toLowerCase();
  return (
    key === "x" ||
    key === "twitter" ||
    key === "x / twitter" ||
    key === "x.com" ||
    key === "twitter.com"
  );
}

/**
 * Normalize a WhatsApp phone / wa.me URL to digits only (no leading +).
 * Empty when the value is not a usable phone identity.
 */
export function normalizeWhatsAppHandle(
  raw: string | null | undefined,
): string {
  let value = raw?.trim() ?? "";
  if (!value) return "";
  value = value.replace(/^@+/, "");
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "wa.me" || host === "api.whatsapp.com" || host === "whatsapp.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const phone = (parts[0] ?? "").replace(/[^\d]/g, "");
      return phone;
    }
  } catch {
    // fall through
  }
  return value.replace(/[^\d]/g, "");
}

/** Normalize an X / Twitter @handle / profile URL to a bare username (lowercase). */
export function normalizeXHandle(raw: string | null | undefined): string {
  let value = raw?.trim() ?? "";
  if (!value) return "";
  value = value.replace(/^@+/, "");
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        parts[0] &&
        !["i", "intent", "share", "home", "explore", "search"].includes(
          parts[0].toLowerCase(),
        )
      ) {
        return parts[0].toLowerCase();
      }
      return "";
    }
  } catch {
    // fall through
  }
  return value.replace(/^\/+|\/+$/g, "").split("/")[0]?.trim().toLowerCase() ?? "";
}

/** Map a Chatwoot channel type to the social platform we store on contacts. */
export function chatChannelSocialKind(
  channelType?: string | null,
): ChatChannelSocialKind {
  const channel = (channelType ?? "").toLowerCase();
  if (!channel) return null;
  if (channel.includes("whatsapp")) return "whatsapp";
  if (
    channel.includes("twitter") ||
    channel.includes("channel::x") ||
    channel === "x"
  ) {
    return "x";
  }
  if (channel.includes("instagram")) return "instagram";
  if (channel.includes("telegram")) return "telegram";
  if (channel.includes("facebook") || channel.includes("messenger")) {
    return "facebook";
  }
  return null;
}

function contactTelegramHandles(contact: ChatMatchableContact): Set<string> {
  const handles = new Set<string>();
  for (const entry of contact.socialAccounts ?? []) {
    if (!isTelegramPlatform(String(entry.platform ?? ""))) continue;
    const handle = normalizeTelegramHandle(entry.url);
    if (handle) handles.add(handle);
  }
  return handles;
}

function contactFacebookHandles(contact: ChatMatchableContact): Set<string> {
  const handles = new Set<string>();
  for (const entry of contact.socialAccounts ?? []) {
    if (!isFacebookPlatform(String(entry.platform ?? ""))) continue;
    const handle = normalizeFacebookHandle(entry.url);
    if (handle) handles.add(handle);
  }
  return handles;
}

function contactInstagramHandles(contact: ChatMatchableContact): Set<string> {
  const handles = new Set<string>();
  for (const entry of contact.socialAccounts ?? []) {
    if (!isInstagramPlatform(String(entry.platform ?? ""))) continue;
    const handle = normalizeInstagramHandle(entry.url);
    if (handle) handles.add(handle);
  }
  return handles;
}

function contactWhatsAppHandles(contact: ChatMatchableContact): Set<string> {
  const handles = new Set<string>();
  for (const entry of contact.socialAccounts ?? []) {
    if (!isWhatsAppPlatform(String(entry.platform ?? ""))) continue;
    const handle = normalizeWhatsAppHandle(entry.url);
    if (handle) handles.add(handle);
  }
  // Phone fields are the primary WhatsApp match key.
  for (const key of contactPhoneKeys(contact)) {
    const digits = normalizeWhatsAppHandle(key);
    if (digits) handles.add(digits);
  }
  return handles;
}

function contactXHandles(contact: ChatMatchableContact): Set<string> {
  const handles = new Set<string>();
  for (const entry of contact.socialAccounts ?? []) {
    if (!isXPlatform(String(entry.platform ?? ""))) continue;
    const handle = normalizeXHandle(entry.url);
    if (handle) handles.add(handle);
  }
  return handles;
}

function cloneSocialAccounts(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
): { platform: string; url: string }[] {
  return (accounts ?? [])
    .map((entry) => ({
      platform: String(entry.platform ?? "").trim(),
      url: String(entry.url ?? "").trim(),
    }))
    .filter((entry) => entry.platform.length > 0 && entry.url.length > 0);
}

/**
 * Merge a Telegram handle into a contact's social_accounts list.
 * Returns null when the handle is already present (no patch needed).
 */
export function withTelegramSocialAccount(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
  handleRaw: string,
): { platform: string; url: string }[] | null {
  const handle = normalizeTelegramHandle(handleRaw);
  if (!handle) return null;
  const existing = cloneSocialAccounts(accounts);
  const already = existing.some(
    (entry) =>
      isTelegramPlatform(entry.platform) &&
      normalizeTelegramHandle(entry.url) === handle,
  );
  if (already) return null;
  return [...existing, { platform: "Telegram", url: `https://t.me/${handle}` }];
}

/**
 * Merge a Facebook / Messenger identity into social_accounts.
 * Returns null when already present.
 */
export function withFacebookSocialAccount(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
  handleRaw: string,
): { platform: string; url: string }[] | null {
  const handle = normalizeFacebookHandle(handleRaw);
  if (!handle) return null;
  const existing = cloneSocialAccounts(accounts);
  const already = existing.some(
    (entry) =>
      isFacebookPlatform(entry.platform) &&
      normalizeFacebookHandle(entry.url) === handle,
  );
  if (already) return null;
  const url = /^\d+$/.test(handle)
    ? `https://www.facebook.com/profile.php?id=${handle}`
    : `https://www.facebook.com/${handle}`;
  return [...existing, { platform: "Facebook", url }];
}

/**
 * Merge an Instagram handle into a contact's social_accounts list.
 * Returns null when the handle is already present, empty, or an opaque
 * Instagram-scoped numeric id (not a public profile username).
 */
export function withInstagramSocialAccount(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
  handleRaw: string,
): { platform: string; url: string }[] | null {
  const handle = normalizeInstagramHandle(handleRaw);
  if (!handle) return null;
  // Instagram-scoped IDs are not public profile URLs — skip social offer.
  if (/^\d+$/.test(handle)) return null;
  const existing = cloneSocialAccounts(accounts);
  const already = existing.some(
    (entry) =>
      isInstagramPlatform(entry.platform) &&
      normalizeInstagramHandle(entry.url) === handle,
  );
  if (already) return null;
  return [
    ...existing,
    { platform: "Instagram", url: `https://www.instagram.com/${handle}` },
  ];
}

/**
 * Merge a WhatsApp phone into a contact's social_accounts list (wa.me URL).
 * Returns null when already present or the phone is empty.
 */
export function withWhatsAppSocialAccount(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
  handleRaw: string,
): { platform: string; url: string }[] | null {
  const handle = normalizeWhatsAppHandle(handleRaw);
  if (!handle || handle.length < 7) return null;
  const existing = cloneSocialAccounts(accounts);
  const already = existing.some(
    (entry) =>
      isWhatsAppPlatform(entry.platform) &&
      normalizeWhatsAppHandle(entry.url) === handle,
  );
  if (already) return null;
  return [...existing, { platform: "WhatsApp", url: `https://wa.me/${handle}` }];
}

/**
 * Merge an X / Twitter handle into a contact's social_accounts list.
 * Returns null when already present, empty, or an opaque numeric user id.
 */
export function withXSocialAccount(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
  handleRaw: string,
): { platform: string; url: string }[] | null {
  const handle = normalizeXHandle(handleRaw);
  if (!handle) return null;
  // Numeric Twitter/X user ids are not public profile URLs.
  if (/^\d+$/.test(handle)) return null;
  const existing = cloneSocialAccounts(accounts);
  const already = existing.some(
    (entry) =>
      isXPlatform(entry.platform) && normalizeXHandle(entry.url) === handle,
  );
  if (already) return null;
  return [...existing, { platform: "X", url: `https://x.com/${handle}` }];
}

/**
 * Merge the chat channel identity onto a contact as a social profile
 * (Telegram / Instagram / WhatsApp / X / Facebook).
 */
export function withChatChannelSocialAccount(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
  input: {
    channelType?: string | null;
    contactUsername?: string | null;
  },
): { platform: string; url: string }[] | null {
  const handle = input.contactUsername?.trim();
  if (!handle) return null;
  const kind = chatChannelSocialKind(input.channelType);
  if (kind === "telegram") return withTelegramSocialAccount(accounts, handle);
  if (kind === "instagram") return withInstagramSocialAccount(accounts, handle);
  if (kind === "whatsapp") return withWhatsAppSocialAccount(accounts, handle);
  if (kind === "x") return withXSocialAccount(accounts, handle);
  if (kind === "facebook") return withFacebookSocialAccount(accounts, handle);
  // Unknown channel but we have a username — prefer Telegram URL shape only
  // when it already looks like a t.me handle; otherwise skip.
  if (normalizeTelegramHandle(handle) && /t\.me|@/.test(handle)) {
    return withTelegramSocialAccount(accounts, handle);
  }
  return null;
}

export type ChatChannelSocialOffer = {
  platform: "Telegram" | "Facebook" | "Instagram" | "WhatsApp" | "X";
  /** Bare handle / id used for matching. */
  handle: string;
  /**
   * User-facing label when we have a recognizable handle (`@remon`, vanity).
   * Null for opaque Facebook Page-Scoped IDs — those are not public usernames.
   */
  displayHandle: string | null;
  /** True when `handle` is a Messenger PSID (digits), not a vanity name. */
  opaqueId: boolean;
  /** Full social_accounts list after adding this channel identity. */
  nextAccounts: { platform: string; url: string }[];
};

/**
 * When a chat visitor has a channel identity that is not yet on the contact
 * (or organization) social list, return an offer to add it. Returns null when
 * there is nothing to add (no username, or already present).
 */
export function chatChannelSocialOffer(
  accounts: readonly ChatMatchableSocialAccount[] | null | undefined,
  input: {
    channelType?: string | null;
    contactUsername?: string | null;
  },
): ChatChannelSocialOffer | null {
  const nextAccounts = withChatChannelSocialAccount(accounts, input);
  if (!nextAccounts) return null;
  const kind = chatChannelSocialKind(input.channelType);
  const raw = input.contactUsername?.trim() ?? "";
  if (kind === "facebook") {
    const handle = normalizeFacebookHandle(raw);
    if (!handle) return null;
    // Chatwoot Facebook contacts expose a Page-Scoped ID, not a public @handle.
    const opaqueId = /^\d+$/.test(handle);
    return {
      platform: "Facebook",
      handle,
      displayHandle: opaqueId ? null : handle,
      opaqueId,
      nextAccounts,
    };
  }
  if (kind === "instagram") {
    const handle = normalizeInstagramHandle(raw);
    if (!handle || /^\d+$/.test(handle)) return null;
    return {
      platform: "Instagram",
      handle,
      displayHandle: `@${handle}`,
      opaqueId: false,
      nextAccounts,
    };
  }
  if (kind === "whatsapp") {
    const handle = normalizeWhatsAppHandle(raw);
    if (!handle) return null;
    return {
      platform: "WhatsApp",
      handle,
      displayHandle: `+${handle}`,
      opaqueId: false,
      nextAccounts,
    };
  }
  if (kind === "x") {
    const handle = normalizeXHandle(raw);
    if (!handle || /^\d+$/.test(handle)) return null;
    return {
      platform: "X",
      handle,
      displayHandle: `@${handle}`,
      opaqueId: false,
      nextAccounts,
    };
  }
  const handle = normalizeTelegramHandle(raw);
  if (!handle) return null;
  return {
    platform: "Telegram",
    handle,
    displayHandle: `@${handle}`,
    opaqueId: false,
    nextAccounts,
  };
}

/**
 * Soft-match a BacksterOS contact for a Chatwoot conversation using email,
 * phone, then Telegram / Instagram / Facebook social handles. Prefer
 * {@link resolveChatContact} when the conversation may already store a
 * durable `contactId`.
 */
export function matchChatContact<T extends ChatMatchableContact>(
  contacts: readonly T[],
  input: {
    contactEmail?: string | null;
    contactPhone?: string | null;
    contactUsername?: string | null;
    channelType?: string | null;
  },
): T | null {
  const email = input.contactEmail?.trim();
  if (email) {
    const byEmail = contacts.find((contact) =>
      contactMatchesEmailAddress(contact, email),
    );
    if (byEmail) return byEmail;
  }

  const phone = input.contactPhone?.trim();
  if (phone) {
    const needle = normalizePhoneKey(phone);
    if (needle) {
      const byPhone = contacts.find((contact) =>
        contactPhoneKeys(contact).has(needle),
      );
      if (byPhone) return byPhone;
    }
  }

  const kind = chatChannelSocialKind(input.channelType);
  const username = input.contactUsername?.trim();
  if (username) {
    if (kind === "facebook" || (!kind && /^\d+$/.test(username.trim()))) {
      const facebook = normalizeFacebookHandle(username);
      if (facebook) {
        const byMessengerId = contacts.find(
          (contact) =>
            normalizeFacebookHandle(contact.facebookMessengerId) === facebook,
        );
        if (byMessengerId) return byMessengerId;
        // Legacy: Facebook vanity / id stored on social profiles.
        const byFacebookSocial = contacts.find((contact) =>
          contactFacebookHandles(contact).has(facebook),
        );
        if (byFacebookSocial) return byFacebookSocial;
      }
    }
    if (kind === "instagram") {
      const instagram = normalizeInstagramHandle(username);
      if (instagram && !/^\d+$/.test(instagram)) {
        const byInstagram = contacts.find((contact) =>
          contactInstagramHandles(contact).has(instagram),
        );
        if (byInstagram) return byInstagram;
      }
      return null;
    }
    if (kind === "whatsapp") {
      const whatsapp = normalizeWhatsAppHandle(username);
      if (whatsapp) {
        const byWhatsApp = contacts.find((contact) =>
          contactWhatsAppHandles(contact).has(whatsapp),
        );
        if (byWhatsApp) return byWhatsApp;
      }
      return null;
    }
    if (kind === "x") {
      const xHandle = normalizeXHandle(username);
      if (xHandle && !/^\d+$/.test(xHandle)) {
        const byX = contacts.find((contact) =>
          contactXHandles(contact).has(xHandle),
        );
        if (byX) return byX;
      }
      return null;
    }
    if (kind === "telegram" || !kind) {
      const telegram = normalizeTelegramHandle(username);
      if (telegram) {
        const byTelegram = contacts.find((contact) =>
          contactTelegramHandles(contact).has(telegram),
        );
        if (byTelegram) return byTelegram;
      }
    }
  }

  return null;
}

/**
 * When a Facebook/Messenger chat has a PSID that is not yet on the contact,
 * return that id so the UI can offer to set `facebookMessengerId`.
 */
export function chatFacebookMessengerIdOffer(
  contact: {
    facebookMessengerId?: string | null;
  } | null,
  contactUsername?: string | null,
): string | null {
  const incoming = normalizeFacebookHandle(contactUsername);
  if (!incoming) return null;
  const existing = normalizeFacebookHandle(contact?.facebookMessengerId);
  if (existing && existing === incoming) return null;
  return incoming;
}

/**
 * Pick a contact for the Facebook Messenger ID notice when the conversation
 * has no durable `contactId` yet: exact display-name match, preferring the
 * linked organization when present. Returns null when ambiguous.
 */
export function findContactForFacebookMessengerOffer<
  T extends { id: string; name?: string | null; organizationId?: string | null },
>(
  contacts: readonly T[],
  input: {
    matchedContact?: T | null;
    contactName?: string | null;
    organizationId?: string | null;
  },
): T | null {
  if (input.matchedContact) return input.matchedContact;
  const name = input.contactName?.trim().toLowerCase();
  if (!name) return null;
  const orgId = input.organizationId?.trim() || null;
  const byName = contacts.filter(
    (contact) => contact.name?.trim().toLowerCase() === name,
  );
  if (byName.length === 0) return null;
  if (orgId) {
    const inOrg = byName.find(
      (contact) => contact.organizationId?.trim() === orgId,
    );
    if (inOrg) return inOrg;
  }
  return byName.length === 1 ? byName[0]! : null;
}

/**
 * Resolve the linked contact for a chat conversation: durable `contactId`
 * first, then soft-match. Telegram / Messenger visitors often have no
 * email/phone/username, so the durable link is required for the picker.
 */
export function resolveChatContact<T extends ChatMatchableContact>(
  contacts: readonly T[],
  input: {
    contactId?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    contactUsername?: string | null;
    channelType?: string | null;
  },
): T | null {
  const contactId = input.contactId?.trim();
  if (contactId) {
    const linked = contacts.find((contact) => contact.id === contactId) ?? null;
    if (linked) return linked;
  }
  return matchChatContact(contacts, input);
}
