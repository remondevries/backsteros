/**
 * Messaging-window / eligibility rules for Communication → + create.
 * Pure helpers — unit-tested without Chatwoot or DB.
 */

export type ChatCreateChannel =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "telegram"
  | "support"
  | "x";

/** Chatwoot API inbox for Lemo-Design X (@lemodesign) encrypted DM relay. */
export const X_LEMO_DESIGN_INBOX_ID = "8";
export const X_LEMO_DESIGN_INBOX_IDENTIFIER = "EqVqfRJVN6N3tEZNa5RDbhKM";

/** Standard customer-service window after the last user message (Meta). */
export const META_MESSAGING_WINDOW_HOURS = 24;
/**
 * Extended window when the app is approved for the HUMAN_AGENT tag
 * (Instagram / Messenger). Callers pass this when the feature is enabled.
 */
export const META_HUMAN_AGENT_WINDOW_HOURS = 24 * 7;

export type MessagingWindowInput = {
  channel: ChatCreateChannel;
  /** ISO timestamp of the last *incoming* message, if any. */
  lastIncomingAt: string | null | undefined;
  now?: Date;
  /** When true, Instagram/Messenger use the 7-day HUMAN_AGENT window. */
  humanAgentTag?: boolean;
  /** True when this contact already has a channel identity / prior thread. */
  hasChannelIdentity: boolean;
};

export type MessagingWindowResult = {
  open: boolean;
  windowHours: number;
  lastIncomingAt: string | null;
  closesAt: string | null;
  reason: string | null;
  /** WhatsApp cold start / closed window must use an approved template. */
  requiresTemplate: boolean;
};

function windowHoursFor(
  channel: ChatCreateChannel,
  humanAgentTag: boolean,
): number {
  if (
    humanAgentTag &&
    (channel === "instagram" || channel === "messenger")
  ) {
    return META_HUMAN_AGENT_WINDOW_HOURS;
  }
  return META_MESSAGING_WINDOW_HOURS;
}

function channelLabel(channel: ChatCreateChannel): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "instagram") return "Instagram";
  if (channel === "messenger") return "Messenger";
  if (channel === "telegram") return "Telegram";
  if (channel === "x") return "X";
  return "Support";
}

function hasXStyleParenHandle(text: string): boolean {
  return /\(@[a-z0-9_]{1,15}\)/i.test(text);
}

/**
 * Evaluate whether outbound messaging is allowed right now.
 *
 * - WhatsApp: free-form only inside the window; outside (or no prior message)
 *   requires an approved template (`requiresTemplate: true`, `open: false`
 *   for free-form — callers still allow template send).
 * - Instagram / Messenger: no cold outreach. Outside the window, block with
 *   a clear reason (templates are not available the same way).
 * - Telegram: bots can message any user who has ever started the bot once a
 *   chat_id is known — no Meta-style 24-hour window. Outbound is allowed
 *   whenever hasChannelIdentity is true (even after the local thread is deleted).
 * - Support: needs a contact email; then free-form create is allowed.
 * - X: needs a numeric X user id. Delivery is encrypted X Chat via Grok Bot;
 *   recipient must accept DMs.
 */
export function evaluateMessagingWindow(
  input: MessagingWindowInput,
): MessagingWindowResult {
  const now = input.now ?? new Date();
  const windowHours = windowHoursFor(
    input.channel,
    input.humanAgentTag === true,
  );
  const label = channelLabel(input.channel);
  const lastIncomingAt = input.lastIncomingAt?.trim() || null;

  if (input.channel === "support") {
    if (!input.hasChannelIdentity) {
      return {
        open: false,
        windowHours,
        lastIncomingAt: null,
        closesAt: null,
        reason: "Support tickets need a contact with an email address.",
        requiresTemplate: false,
      };
    }
    return {
      open: true,
      windowHours,
      lastIncomingAt,
      closesAt: null,
      reason: null,
      requiresTemplate: false,
    };
  }

  if (input.channel === "telegram") {
    if (!input.hasChannelIdentity) {
      return {
        open: false,
        // Telegram has no Meta 24h window — windowHours is informational only.
        windowHours: 0,
        lastIncomingAt: null,
        closesAt: null,
        reason: "contact has never messaged the bot",
        requiresTemplate: false,
      };
    }
    return {
      open: true,
      windowHours: 0,
      lastIncomingAt,
      closesAt: null,
      reason: null,
      requiresTemplate: false,
    };
  }

  if (input.channel === "x") {
    if (!input.hasChannelIdentity) {
      return {
        open: false,
        windowHours,
        lastIncomingAt: null,
        closesAt: null,
        reason:
          "X DMs need a numeric X user id on the contact (not an @handle). The recipient must accept DMs and be on encrypted X Chat.",
        requiresTemplate: false,
      };
    }
    return {
      open: true,
      windowHours,
      lastIncomingAt,
      closesAt: null,
      reason:
        "Messages are delivered over encrypted X Chat via @lemodesign. The recipient must accept DMs.",
      requiresTemplate: false,
    };
  }

  if (input.channel === "whatsapp") {
    if (!lastIncomingAt) {
      return {
        open: false,
        windowHours,
        lastIncomingAt: null,
        closesAt: null,
        reason:
          "WhatsApp can only start a new conversation with an approved message template.",
        requiresTemplate: true,
      };
    }
    const last = new Date(lastIncomingAt);
    if (Number.isNaN(last.getTime())) {
      return {
        open: false,
        windowHours,
        lastIncomingAt: null,
        closesAt: null,
        reason:
          "WhatsApp can only start a new conversation with an approved message template.",
        requiresTemplate: true,
      };
    }
    const closesAt = new Date(last.getTime() + windowHours * 60 * 60 * 1000);
    if (now.getTime() <= closesAt.getTime()) {
      return {
        open: true,
        windowHours,
        lastIncomingAt: last.toISOString(),
        closesAt: closesAt.toISOString(),
        reason: null,
        requiresTemplate: false,
      };
    }
    return {
      open: false,
      windowHours,
      lastIncomingAt: last.toISOString(),
      closesAt: closesAt.toISOString(),
      reason: `The ${windowHours}-hour WhatsApp messaging window is closed. Send an approved template to continue.`,
      requiresTemplate: true,
    };
  }

  // Instagram / Messenger — prior identity required; no cold outreach.
  if (!input.hasChannelIdentity) {
    return {
      open: false,
      windowHours,
      lastIncomingAt: null,
      closesAt: null,
      reason: `${label} only allows replies after the contact messages you first. No cold outreach.`,
      requiresTemplate: false,
    };
  }
  if (!lastIncomingAt) {
    return {
      open: false,
      windowHours,
      lastIncomingAt: null,
      closesAt: null,
      reason: `${label} only allows replies within ${windowHours} hours of the contact’s last message.`,
      requiresTemplate: false,
    };
  }
  const last = new Date(lastIncomingAt);
  if (Number.isNaN(last.getTime())) {
    return {
      open: false,
      windowHours,
      lastIncomingAt: null,
      closesAt: null,
      reason: `${label} only allows replies within ${windowHours} hours of the contact’s last message.`,
      requiresTemplate: false,
    };
  }
  const closesAt = new Date(last.getTime() + windowHours * 60 * 60 * 1000);
  if (now.getTime() <= closesAt.getTime()) {
    return {
      open: true,
      windowHours,
      lastIncomingAt: last.toISOString(),
      closesAt: closesAt.toISOString(),
      reason: null,
      requiresTemplate: false,
    };
  }
  return {
    open: false,
    windowHours,
    lastIncomingAt: last.toISOString(),
    closesAt: closesAt.toISOString(),
    reason: `The ${windowHours}-hour ${label} messaging window is closed. Wait for the contact to message you again${
      input.humanAgentTag
        ? ""
        : " (HUMAN_AGENT extends this to 7 days when approved)"
    }.`,
    requiresTemplate: false,
  };
}

/** Map Chatwoot channel_type / inbox name → create channel kind. */
export function resolveChatCreateChannel(
  channelType: string | null | undefined,
  inboxName?: string | null,
): ChatCreateChannel | null {
  const channel = (channelType ?? "").toLowerCase();
  const inbox = (inboxName ?? "").toLowerCase();
  if (channel.includes("whatsapp") || inbox.includes("whatsapp")) {
    return "whatsapp";
  }
  if (channel.includes("instagram") || inbox.includes("instagram")) {
    return "instagram";
  }
  if (
    channel.includes("facebook") ||
    channel.includes("messenger") ||
    inbox.includes("messenger")
  ) {
    return "messenger";
  }
  if (channel.includes("telegram") || inbox.includes("telegram")) {
    return "telegram";
  }
  // X / Twitter — including Chatwoot API inbox "Lemo-Design X (@lemodesign)".
  if (
    channel.includes("twitter") ||
    /(^|::)x($|[^a-z])/i.test(channel) ||
    inbox.includes("twitter") ||
    inbox.includes("x.com") ||
    inbox.includes("lemo-design x") ||
    inbox.includes("lemodesign x") ||
    (channel.includes("api") && hasXStyleParenHandle(inbox)) ||
    (inbox.includes("lemodesign") && hasXStyleParenHandle(inbox))
  ) {
    return "x";
  }
  // Support tickets use the Chatwoot email (or explicitly named support) inbox.
  if (
    channel.includes("email") ||
    inbox.includes("support") ||
    (inbox.includes("email") && !inbox.includes("whatsapp"))
  ) {
    return "support";
  }
  return null;
}
