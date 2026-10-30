/**
 * Chatwoot channel → list kind badge.
 * Instagram before Facebook so `Channel::Instagram` (and inbox-named Instagram
 * DMs on a Facebook page) are not treated as Messenger.
 */
export type ChatChannelKind =
  | "telegram"
  | "instagram"
  | "messenger"
  | "whatsapp"
  | "x"
  | "support"
  | "chat";

export type ResolveChatChannelKindOptions = {
  /** Chatwoot inbox display name — used for Facebook-page Instagram inboxes. */
  inboxName?: string | null;
  /**
   * Contact display name. Chatwoot API / custom X proxies often put the
   * Twitter handle in the name as `Display (@handle)` with no native X channel.
   */
  contactName?: string | null;
};

/** `Name (@handle)` — common X / Twitter display form (handle ≤ 15 chars). */
function hasXStyleParenHandle(text: string): boolean {
  return /\(@[a-z0-9_]{1,15}\)/i.test(text);
}

function isXChannel(
  channel: string,
  inbox: string,
  contactName: string,
): boolean {
  if (channel.includes("twitter")) return true;
  // Chatwoot legacy `Channel::TwitterProfile` and newer `Channel::X`.
  if (/(^|::)x($|[^a-z])/i.test(channel) || channel === "x") return true;
  if (inbox.includes("twitter") || inbox.includes("x.com")) return true;
  if (inbox === "x" || inbox.startsWith("x ") || inbox.endsWith(" x")) {
    return true;
  }
  // Custom agents often wire X through `Channel::Api` and name the inbox /
  // contact `Someone (@screen_name)` instead of using a native Twitter channel.
  if (
    channel.includes("api") &&
    (hasXStyleParenHandle(inbox) || hasXStyleParenHandle(contactName))
  ) {
    return true;
  }
  return false;
}

export function resolveChatChannelKind(
  channelType: string | null | undefined,
  options?: ResolveChatChannelKindOptions,
): ChatChannelKind {
  const channel = (channelType ?? "").toLowerCase();
  const inbox = (options?.inboxName ?? "").toLowerCase();
  const contactName = (options?.contactName ?? "").toLowerCase();
  if (!channel && !inbox && !contactName) return "chat";
  if (channel.includes("whatsapp") || inbox.includes("whatsapp")) {
    return "whatsapp";
  }
  if (isXChannel(channel, inbox, contactName)) return "x";
  if (channel.includes("telegram")) return "telegram";
  // Dedicated Instagram channel, or Instagram DMs routed via a Facebook page
  // inbox whose name still says Instagram.
  if (channel.includes("instagram") || inbox.includes("instagram")) {
    return "instagram";
  }
  if (channel.includes("facebook") || channel.includes("messenger")) {
    return "messenger";
  }
  // Support tickets / helpdesk inboxes (Chatwoot or local Support module).
  if (
    channel.includes("support") ||
    channel.includes("helpdesk") ||
    channel.includes("ticket") ||
    inbox.includes("support") ||
    inbox.includes("helpdesk")
  ) {
    return "support";
  }
  return "chat";
}

export function chatChannelKindLabel(kind: ChatChannelKind): string {
  switch (kind) {
    case "telegram":
      return "Telegram";
    case "instagram":
      return "Instagram";
    case "messenger":
      return "Messenger";
    case "whatsapp":
      return "WhatsApp";
    case "x":
      return "X";
    case "support":
      return "Support";
    default:
      return "Chat";
  }
}
