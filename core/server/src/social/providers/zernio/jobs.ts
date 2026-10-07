import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../../db/index.js";
import {
  socialAccounts,
  socialAnalyticsSnapshots,
  socialComments,
  socialConversations,
  socialMessages,
  socialPosts,
  socialWebhookEvents,
} from "../../../db/schema.js";
import { newId } from "../../../lib/crypto.js";
import type {
  SocialComment,
  SocialConversation,
  SocialMessage,
  SocialNormalizedEvent,
  SocialPost,
} from "../../types.js";
import {
  createZernioAdapter,
  setAnalyticsCursor,
  socialWebhookEventRowId,
} from "./settings.js";
import {
  extractZernioEventId,
  extractZernioEventType,
  translateZernioWebhook,
  verifyZernioWebhookSignature,
  zernioHeadersFromRequest,
} from "./webhook.js";

const PROVIDER = "zernio";

export type ZernioWebhookHandleResult = {
  ok: boolean;
  duplicate: boolean;
  workspaceId: string | null;
};

/**
 * Verify signature against stored secrets, dedupe on event id, ack fast,
 * and process normalized events in a background job.
 */
export async function handleZernioWebhookDelivery(input: {
  rawBody: string;
  headers: Record<string, string>;
  secrets: Array<{ workspaceId: string; secret: string }>;
}): Promise<ZernioWebhookHandleResult> {
  const { rawBody, headers, secrets } = input;
  if (secrets.length === 0) {
    return { ok: false, duplicate: false, workspaceId: null };
  }

  let matched: { workspaceId: string; secret: string } | null = null;
  for (const row of secrets) {
    if (
      verifyZernioWebhookSignature(
        row.secret,
        rawBody,
        headers["x-zernio-signature"] ?? headers["X-Zernio-Signature"],
      )
    ) {
      matched = row;
      break;
    }
  }
  if (!matched) {
    return { ok: false, duplicate: false, workspaceId: null };
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    payload = null;
  }
  const eventId = extractZernioEventId(headers, payload);
  const eventType = extractZernioEventType(headers, payload);

  if (eventId) {
    const inserted = await tryRememberEvent({
      workspaceId: matched.workspaceId,
      eventId,
      eventType,
    });
    if (!inserted) {
      return {
        ok: true,
        duplicate: true,
        workspaceId: matched.workspaceId,
      };
    }
  }

  // Ack path returns immediately; work continues in the background.
  void processZernioWebhookJob({
    workspaceId: matched.workspaceId,
    headers,
    rawBody,
  }).catch((error) => {
    console.error(
      `[social/zernio] webhook job failed workspace=${matched.workspaceId}`,
      error,
    );
  });

  return {
    ok: true,
    duplicate: false,
    workspaceId: matched.workspaceId,
  };
}

export async function processZernioWebhookJob(input: {
  workspaceId: string;
  headers: Record<string, string>;
  rawBody: string;
}): Promise<void> {
  const events = translateZernioWebhook(input.headers, input.rawBody, {
    workspaceId: input.workspaceId,
  });
  for (const event of events) {
    await applyNormalizedEvent(input.workspaceId, event);
  }
}

async function tryRememberEvent(input: {
  workspaceId: string;
  eventId: string;
  eventType: string | null;
}): Promise<boolean> {
  try {
    await db.insert(socialWebhookEvents).values({
      id: socialWebhookEventRowId(PROVIDER, input.eventId),
      workspaceId: input.workspaceId,
      provider: PROVIDER,
      eventId: input.eventId,
      eventType: input.eventType,
    });
    return true;
  } catch {
    return false;
  }
}

async function applyNormalizedEvent(
  workspaceId: string,
  event: SocialNormalizedEvent,
): Promise<void> {
  switch (event.type) {
    case "account.disconnected": {
      await db
        .update(socialAccounts)
        .set({
          disconnected: true,
          needsReconnect: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialAccounts.workspaceId, workspaceId),
            eq(socialAccounts.provider, PROVIDER),
            eq(socialAccounts.externalId, event.externalAccountId),
            isNull(socialAccounts.deletedAt),
          ),
        );
      return;
    }
    case "analytics.synced": {
      if (event.cursor) {
        await setAnalyticsCursor(workspaceId, event.cursor);
        const adapter = await createZernioAdapter(workspaceId);
        if (adapter?.getAnalyticsDelta) {
          const delta = await adapter.getAnalyticsDelta(event.cursor);
          for (const point of delta.items) {
            await db.insert(socialAnalyticsSnapshots).values({
              id: newId(),
              workspaceId,
              accountId: point.accountId,
              postExternalId: point.postExternalId,
              platform: point.platform,
              capturedAt: new Date(point.capturedAt),
              metrics: {
                impressions: point.impressions,
                reach: point.reach,
                likes: point.likes,
                comments: point.comments,
                shares: point.shares,
                saves: point.saves,
                clicks: point.clicks,
                views: point.views,
                follows: point.follows,
              },
            });
          }
          if (delta.nextCursor) {
            await setAnalyticsCursor(workspaceId, delta.nextCursor);
          }
        }
      }
      return;
    }
    case "post.status": {
      await upsertPost(workspaceId, event.post);
      return;
    }
    case "comment.received": {
      await upsertComment(workspaceId, event.comment);
      return;
    }
    case "message.received": {
      await upsertConversation(workspaceId, event.conversation);
      await upsertMessage(workspaceId, event.message);
      return;
    }
    case "message.status": {
      await upsertMessage(workspaceId, event.message);
      return;
    }
    case "conversation.started": {
      await upsertConversation(workspaceId, event.conversation);
      return;
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

async function upsertPost(
  workspaceId: string,
  post: SocialPost,
): Promise<void> {
  const accountId = await resolveAccountId(workspaceId, post.accountId);
  if (!accountId) return;
  await db
    .insert(socialPosts)
    .values({
      id: post.id.startsWith("zernio-post:") ? post.id : `zernio-post:${post.externalId}`,
      workspaceId,
      accountId,
      platform: post.platform,
      provider: PROVIDER,
      externalId: post.externalId,
      url: post.url,
      text: post.text,
      media: post.media,
      status: post.status,
      scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : null,
      postedAt: post.postedAt ? new Date(post.postedAt) : null,
      engagement: post.engagement,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: socialPosts.id,
      set: {
        url: post.url,
        text: post.text,
        status: post.status,
        scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : null,
        postedAt: post.postedAt ? new Date(post.postedAt) : null,
        engagement: post.engagement,
        updatedAt: new Date(),
        deletedAt: null,
      },
    });
}

async function upsertComment(
  workspaceId: string,
  comment: SocialComment,
): Promise<void> {
  // Comments require a parent post row; create a stub when missing.
  const postId = comment.postId;
  const postExternalId = postId.startsWith("zernio-post:")
    ? postId.slice("zernio-post:".length)
    : postId;
  const accountId = await resolveAccountId(workspaceId, comment.accountId);
  if (accountId) {
    await db
      .insert(socialPosts)
      .values({
        id: postId.startsWith("zernio-post:") ? postId : `zernio-post:${postExternalId}`,
        workspaceId,
        accountId,
        platform: "x",
        provider: PROVIDER,
        externalId: postExternalId,
        text: "",
        status: "published",
      })
      .onConflictDoNothing();
  }
  await db
    .insert(socialComments)
    .values({
      id: comment.id,
      workspaceId,
      postId: postId.startsWith("zernio-post:") ? postId : `zernio-post:${postExternalId}`,
      accountId,
      externalId: comment.externalId,
      authorHandle: comment.authorHandle,
      authorExternalId: comment.authorExternalId,
      text: comment.text,
      parentCommentId: comment.parentCommentId,
      hidden: comment.hidden,
      contactId: comment.contactId,
      createdAt: new Date(comment.createdAt),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: socialComments.id,
      set: {
        text: comment.text,
        hidden: comment.hidden,
        updatedAt: new Date(),
        deletedAt: null,
      },
    });
}

async function upsertConversation(
  workspaceId: string,
  conversation: SocialConversation,
): Promise<void> {
  const accountId = await resolveAccountId(workspaceId, conversation.accountId);
  if (!accountId) return;
  const externalId = conversation.id.startsWith("zernio-conversation:")
    ? conversation.id.slice("zernio-conversation:".length)
    : conversation.id;
  await db
    .insert(socialConversations)
    .values({
      id: conversation.id.startsWith("zernio-conversation:")
        ? conversation.id
        : `zernio-conversation:${externalId}`,
      workspaceId,
      accountId,
      provider: PROVIDER,
      externalId,
      kind: conversation.kind,
      participantHandle: conversation.participantHandle,
      participantExternalId: conversation.participantExternalId,
      contactId: conversation.contactId,
      ticketId: conversation.ticketId,
      lastMessageAt: new Date(conversation.lastMessageAt),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: socialConversations.id,
      set: {
        participantHandle: conversation.participantHandle,
        lastMessageAt: new Date(conversation.lastMessageAt),
        updatedAt: new Date(),
        deletedAt: null,
      },
    });
}

async function upsertMessage(
  workspaceId: string,
  message: SocialMessage,
): Promise<void> {
  await db
    .insert(socialMessages)
    .values({
      id: message.id,
      workspaceId,
      conversationId: message.conversationId,
      externalId: message.externalId,
      direction: message.direction,
      text: message.text,
      status: message.status,
      sentAt: new Date(message.sentAt),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: socialMessages.id,
      set: {
        text: message.text,
        status: message.status,
        updatedAt: new Date(),
        deletedAt: null,
      },
    });
}

async function resolveAccountId(
  workspaceId: string,
  accountRef: string,
): Promise<string | null> {
  if (!accountRef) return null;
  const externalId = accountRef.startsWith("zernio-account:")
    ? accountRef.slice("zernio-account:".length)
    : accountRef;
  const [row] = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.provider, PROVIDER),
        eq(socialAccounts.externalId, externalId),
        isNull(socialAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row?.id ?? (accountRef.startsWith("zernio-account:") ? accountRef : null);
}

export { zernioHeadersFromRequest };
