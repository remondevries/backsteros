/**
 * Workspace owner identity for Grok Bot Channel rooms.
 *
 * `channel.members` is agent-only (Grok Bot agent ids). The human owner is
 * invited into the room separately during Connect / Sync — this helper builds
 * the `owner` block on those webhooks.
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { contacts, users, workspaces } from "../db/schema.js";

export type ChannelRoomOwner = {
  userId: string;
  contactId: string | null;
  name: string | null;
  email: string | null;
  /** Numeric X user id when known on the matched contact. */
  xUserId: string | null;
  /** @handle without @, when present on the contact's social accounts. */
  xHandle: string | null;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() || "";
  return trimmed || null;
}

function xHandleFromSocialAccounts(
  accounts: unknown,
): string | null {
  if (!Array.isArray(accounts)) return null;
  for (const entry of accounts) {
    if (!entry || typeof entry !== "object") continue;
    const platform = String(
      (entry as { platform?: unknown }).platform ?? "",
    )
      .trim()
      .toLowerCase();
    const url = String((entry as { url?: unknown }).url ?? "").trim();
    if (!url) continue;
    const isX =
      platform === "x" ||
      platform === "twitter" ||
      /(?:^|\.)x\.com\//i.test(url) ||
      /(?:^|\.)twitter\.com\//i.test(url);
    if (!isX) continue;
    // Skip x.com/i/… paths (settings, user-by-id). Require a real @handle.
    if (/\/(?:i|intent|share|search|hashtag)\b/i.test(url)) continue;
    const match = url.match(
      /(?:x\.com|twitter\.com)\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})(?:\/|$|\?)/i,
    );
    const handle = match?.[1]?.trim() || "";
    if (
      handle &&
      !/^\d+$/.test(handle) &&
      !["i", "intent", "share", "search", "hashtag", "home"].includes(
        handle.toLowerCase(),
      )
    ) {
      return handle;
    }
  }
  return null;
}

/**
 * Resolve the workspace owner (user + optional CRM contact matched by email)
 * so the lead agent can invite that human into the Grok Bot room.
 */
export async function resolveChannelRoomOwner(
  workspaceId: string,
): Promise<ChannelRoomOwner | null> {
  const [workspace] = await db
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const ownerUserId = workspace?.ownerUserId?.trim() || "";
  if (!ownerUserId) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, ownerUserId))
    .limit(1);
  if (!user) return null;

  const email = normalizeEmail(user.email);
  let contactId: string | null = null;
  let contactName: string | null = null;
  let xUserId: string | null = null;
  let xHandle: string | null = null;

  if (email) {
    const [contact] = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        xUserId: contacts.xUserId,
        socialAccounts: contacts.socialAccounts,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
          sql`lower(${contacts.email}) = ${email}`,
        ),
      )
      .limit(1);
    if (contact) {
      contactId = contact.id;
      contactName = contact.name?.trim() || null;
      xUserId = contact.xUserId?.trim() || null;
      xHandle = xHandleFromSocialAccounts(contact.socialAccounts);
    }
  }

  const name =
    user.displayName?.trim() || contactName || email || null;

  return {
    userId: user.id,
    contactId,
    name,
    email: user.email?.trim() || null,
    xUserId,
    xHandle,
  };
}

/** Pure helper exported for unit tests. */
export function channelRoomOwnerXHandleFromSocialAccounts(
  accounts: unknown,
): string | null {
  return xHandleFromSocialAccounts(accounts);
}
