/**
 * Sync Network Planned calendar schedule → Zernio so they publish at `scheduledFor`.
 * Tray drafts stay local; only schedule / reschedule / unschedule (and content
 * updates while scheduled) talk to Zernio — LinkedIn targets only for now.
 */

import { and, eq, isNull } from "drizzle-orm";

import type {
  SocialPlannedPostAccountKind,
  SocialPlannedPostPlatform,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import {
  readSocialPostMediaBytes,
  type StoredSocialPostMedia,
} from "../../planned-post-media.js";
import {
  ZernioApiError,
  ZernioClient,
} from "./client.js";
import {
  createZernioAdapter,
  getZernioCredentials,
} from "./settings.js";

export type PlannedZernioSyncInput = {
  workspaceId: string;
  postId: string;
  body: string;
  accountKind: SocialPlannedPostAccountKind;
  platforms: readonly SocialPlannedPostPlatform[];
  media: readonly StoredSocialPostMedia[];
  /** ISO or null — desired schedule after this mutation. */
  scheduledAt: string | null;
  /** Existing Zernio post id from `social_posts.engagement`, if any. */
  zernioPostId: string | null;
  firstComment?: string | null;
  poll?: {
    question: string;
    options: string[];
    duration?:
      | "ONE_DAY"
      | "THREE_DAYS"
      | "SEVEN_DAYS"
      | "FOURTEEN_DAYS";
  } | null;
  geoCountries?: string[] | null;
};

/** True when this planned post should be mirrored to Zernio’s scheduler. */
export function plannedPostTargetsLinkedIn(
  platforms: readonly string[],
): boolean {
  return platforms.includes("linkedin");
}

export function parseZernioPostIdFromEngagement(
  engagement: unknown,
): string | null {
  if (!engagement || typeof engagement !== "object" || Array.isArray(engagement)) {
    return null;
  }
  const id = (engagement as Record<string, unknown>).zernioPostId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function engagementWithZernioPostId(
  engagement: unknown,
  zernioPostId: string | null,
): Record<string, unknown> | null {
  const base =
    engagement && typeof engagement === "object" && !Array.isArray(engagement)
      ? { ...(engagement as Record<string, unknown>) }
      : {};
  if (zernioPostId) {
    base.zernioPostId = zernioPostId;
    return base;
  }
  delete base.zernioPostId;
  return Object.keys(base).length > 0 ? base : null;
}

function storedPlatformForAccountKind(
  accountKind: SocialPlannedPostAccountKind,
): string {
  return accountKind === "business" ? "linkedin_org" : "linkedin_personal";
}

/** Zernio post ids are Mongo ObjectIds (24 hex). Local nanoids are not. */
export function looksLikeZernioPostId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id.trim());
}

export function extractZernioPostId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const post =
    root.post && typeof root.post === "object" && !Array.isArray(root.post)
      ? (root.post as Record<string, unknown>)
      : root;
  const id = post.id ?? post._id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isInvalidZernioPostIdError(error: unknown): boolean {
  if (!(error instanceof ZernioApiError)) return false;
  if (error.status === 404) return true;
  if (error.status !== 400) return false;
  const blob = `${error.message} ${error.body ?? ""}`.toLowerCase();
  return (
    blob.includes("invalid post id") ||
    blob.includes("invalid_field_value") ||
    blob.includes("post id format")
  );
}

async function resolveLinkedInExternalAccountId(
  workspaceId: string,
  accountKind: SocialPlannedPostAccountKind,
): Promise<string> {
  const storedPlatform = storedPlatformForAccountKind(accountKind);
  const [account] = await db
    .select({
      externalId: socialAccounts.externalId,
      disconnected: socialAccounts.disconnected,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.provider, "zernio"),
        eq(socialAccounts.platform, storedPlatform),
        isNull(socialAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account) {
    throw new ZernioApiError(
      400,
      "",
      accountKind === "business"
        ? "No LinkedIn company page connected — sync accounts in Settings → Social."
        : "No LinkedIn personal profile connected — sync accounts in Settings → Social.",
    );
  }
  if (account.disconnected) {
    throw new ZernioApiError(
      400,
      "",
      "LinkedIn account is disconnected — reconnect in Settings → Social.",
    );
  }
  return account.externalId;
}

async function requireZernioClient(workspaceId: string): Promise<{
  client: ZernioClient;
  adapter: NonNullable<Awaited<ReturnType<typeof createZernioAdapter>>>;
}> {
  const adapter = await createZernioAdapter(workspaceId);
  if (!adapter) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }
  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }
  return {
    adapter,
    client: new ZernioClient({
      apiKey: creds.apiKey,
      rateKey: workspaceId,
    }),
  };
}

async function uploadMediaForZernio(
  client: ZernioClient,
  media: readonly StoredSocialPostMedia[],
): Promise<Array<{ url: string; type: "image" | "video" | "document" }>> {
  const out: Array<{ url: string; type: "image" | "video" | "document" }> = [];
  for (const item of media) {
    const bytes = await readSocialPostMediaBytes(media, item.id);
    if (!bytes) {
      throw new ZernioApiError(
        400,
        "",
        "Could not read planned-post media for LinkedIn schedule.",
      );
    }
    const filename =
      item.filename?.trim() ||
      `${item.id}.${
        item.kind === "video"
          ? "mp4"
          : item.kind === "document"
            ? "pdf"
            : "jpg"
      }`;
    const { uploadUrl, publicUrl } = await client.presignMedia({
      filename,
      contentType: item.contentType,
      size: bytes.bytes.byteLength,
    });
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": item.contentType },
      body: Buffer.from(bytes.bytes),
    });
    if (!put.ok) {
      const text = await put.text().catch(() => "");
      throw new ZernioApiError(
        put.status,
        text,
        `Failed to upload media for LinkedIn schedule (${put.status})`,
      );
    }
    out.push({ url: publicUrl, type: item.kind });
  }
  return out;
}

async function deleteRemoteZernioPost(
  workspaceId: string,
  zernioPostId: string,
): Promise<void> {
  const adapter = await createZernioAdapter(workspaceId);
  if (!adapter) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }
  try {
    await adapter.deletePost(`zernio-post:${zernioPostId}`);
  } catch (error) {
    if (!(error instanceof ZernioApiError && error.status === 404)) {
      throw error;
    }
  }
}

/**
 * Mirror schedule state to Zernio. Returns the Zernio post id to store
 * (or null when the remote job was cancelled / never created).
 */
export async function syncPlannedPostScheduleToZernio(
  input: PlannedZernioSyncInput,
): Promise<string | null> {
  const wantsLinkedIn = plannedPostTargetsLinkedIn(input.platforms);
  const wantsSchedule = Boolean(input.scheduledAt);

  // No LinkedIn target — drop any prior remote job and keep calendar local-only.
  if (!wantsLinkedIn) {
    if (input.zernioPostId) {
      await deleteRemoteZernioPost(input.workspaceId, input.zernioPostId);
    }
    return null;
  }

  if (!wantsSchedule) {
    if (!input.zernioPostId) return null;
    await deleteRemoteZernioPost(input.workspaceId, input.zernioPostId);
    return null;
  }

  const scheduledFor = input.scheduledAt!;
  const text = input.body.trim();
  const hasPoll = Boolean(input.poll?.question?.trim());
  if (!text && input.media.length === 0 && !hasPoll) {
    throw new ZernioApiError(
      400,
      "",
      "Body, media, or poll is required to schedule on LinkedIn.",
    );
  }

  const { adapter, client } = await requireZernioClient(input.workspaceId);
  const accountExternalId = await resolveLinkedInExternalAccountId(
    input.workspaceId,
    input.accountKind,
  );

  const mediaItems =
    !hasPoll && input.media.length > 0
      ? await uploadMediaForZernio(client, input.media)
      : [];

  const linkedInExtras = {
    firstComment: input.firstComment?.trim() || null,
    poll: input.poll ?? null,
    geoCountries:
      input.accountKind === "business" && input.geoCountries?.length
        ? input.geoCountries.map((c) => c.toUpperCase())
        : null,
  };

  const platformSpecificData: Record<string, unknown> = {};
  if (linkedInExtras.firstComment) {
    platformSpecificData.firstComment = linkedInExtras.firstComment;
  }
  if (linkedInExtras.poll) {
    platformSpecificData.poll = {
      question: linkedInExtras.poll.question,
      options: linkedInExtras.poll.options,
      ...(linkedInExtras.poll.duration
        ? { duration: linkedInExtras.poll.duration }
        : {}),
    };
  }
  if (linkedInExtras.geoCountries?.length) {
    platformSpecificData.geoRestriction = {
      countries: linkedInExtras.geoCountries,
    };
  }

  const platforms = [
    {
      platform: "linkedin",
      accountId: accountExternalId,
      ...(Object.keys(platformSpecificData).length
        ? { platformSpecificData }
        : {}),
    },
  ];

  const canUpdateRemote =
    Boolean(input.zernioPostId) && looksLikeZernioPostId(input.zernioPostId!);

  if (canUpdateRemote) {
    try {
      const payload = await client.updatePost(input.zernioPostId!, {
        content: text,
        platforms,
        scheduledFor,
        isDraft: false,
        ...(mediaItems.length
          ? {
              mediaItems: mediaItems.map((m) => ({
                url: m.url,
                type: m.type,
              })),
            }
          : { mediaItems: [] }),
      });
      return extractZernioPostId(payload) ?? input.zernioPostId;
    } catch (error) {
      // Stale / fake ids from older creates — fall through to create.
      if (!isInvalidZernioPostIdError(error)) throw error;
    }
  }

  const created = await adapter.schedulePost(
    [`zernio-account:${accountExternalId}`],
    {
      text,
      ...(mediaItems.length
        ? {
            media: mediaItems.map((m) => ({
              kind: m.type,
              url: m.url,
            })),
          }
        : {}),
      linkedIn: linkedInExtras,
    },
    scheduledFor,
  );
  const fromAdapter = created[0]?.externalId?.trim() || null;
  if (fromAdapter) return fromAdapter;

  const rawId = created[0]?.id?.replace(/^zernio-post:/, "").split(":")[0];
  return rawId?.trim() || null;
}
