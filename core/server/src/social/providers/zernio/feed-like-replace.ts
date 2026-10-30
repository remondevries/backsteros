import { ZernioApiError, type ZernioClient } from "./client.js";

type LikeBody = { accountId: string; reactionType?: string };

type PostLikeClient = Pick<ZernioClient, "likePost" | "unlikePost">;
type CommentLikeClient = Pick<ZernioClient, "likeComment" | "unlikeComment">;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function reactionMismatch(
  payload: unknown,
  requested: string,
): boolean {
  const record = asRecord(payload);
  if (!record?.alreadyReacted) return false;
  const effective =
    asString(record.reactionType) ?? asString(record.reaction) ?? null;
  return effective != null && effective !== requested;
}

async function ignoreMissingUnlike(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    // Nothing to remove, or LinkedIn already cleared it.
    if (error instanceof ZernioApiError && (error.status === 404 || error.status === 400)) {
      return;
    }
    throw error;
  }
}

/**
 * LinkedIn cannot update a reaction in place. Prefer remove-then-create when
 * Zernio returns 409, or alreadyReacted with a different type than requested.
 */
export async function likePostReplacingConflict(
  client: PostLikeClient,
  postId: string,
  body: LikeBody,
): Promise<unknown> {
  const requested = body.reactionType ?? "LIKE";
  try {
    const payload = await client.likePost(postId, body);
    if (!reactionMismatch(payload, requested)) return payload;
  } catch (error) {
    if (!(error instanceof ZernioApiError) || error.status !== 409) {
      throw error;
    }
  }
  await ignoreMissingUnlike(() => client.unlikePost(postId, body.accountId));
  return client.likePost(postId, body);
}

/** Same replace flow for LinkedIn comment reactions. */
export async function likeCommentReplacingConflict(
  client: CommentLikeClient,
  postId: string,
  commentId: string,
  body: LikeBody,
): Promise<unknown> {
  const requested = body.reactionType ?? "LIKE";
  try {
    const payload = await client.likeComment(postId, commentId, body);
    if (!reactionMismatch(payload, requested)) return payload;
  } catch (error) {
    if (!(error instanceof ZernioApiError) || error.status !== 409) {
      throw error;
    }
  }
  await ignoreMissingUnlike(() =>
    client.unlikeComment(postId, commentId, body.accountId),
  );
  return client.likeComment(postId, commentId, body);
}
