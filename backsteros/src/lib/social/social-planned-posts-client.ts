import type { SocialPlannedPost } from "@backsteros/contracts";
import type {
  SocialPlannedPostCreateInput,
  SocialPlannedPostRecord,
  SocialPlannedPostsClient,
  SocialPlannedPostUpdateInput,
} from "@backsteros/ui";

import type { BacksterosApiClient } from "@backsteros/api-client";

function toRecord(post: SocialPlannedPost): SocialPlannedPostRecord {
  return {
    id: post.id,
    body: post.body,
    accountKind: post.accountKind,
    platforms: post.platforms,
    media: post.media ?? [],
    scheduledAt: post.scheduledAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

/** Core REST adapter for Network Planned posts. */
export function createSocialPlannedPostsClient(
  client: BacksterosApiClient,
): SocialPlannedPostsClient {
  return {
    async list() {
      const body = await client.requestJson<{ posts: SocialPlannedPost[] }>(
        "/api/v1/social/planned-posts",
      );
      return body.posts.map(toRecord);
    },
    async create(input: SocialPlannedPostCreateInput) {
      const created = await client.requestJson<SocialPlannedPost>(
        "/api/v1/social/planned-posts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body: input.body,
            accountKind: input.accountKind,
            platforms: input.platforms,
            scheduledAt: input.scheduledAt ?? null,
            mediaUploads: input.mediaUploads,
          }),
        },
      );
      return toRecord(created);
    },
    async update(id: string, patch: SocialPlannedPostUpdateInput) {
      const updated = await client.requestJson<SocialPlannedPost>(
        `/api/v1/social/planned-posts/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      return toRecord(updated);
    },
    async remove(id: string) {
      await client.requestJson(
        `/api/v1/social/planned-posts/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
    },
    async downloadMedia(postId: string, mediaId: string) {
      return client.requestBinary(
        `/api/v1/social/planned-posts/${encodeURIComponent(postId)}/media/${encodeURIComponent(mediaId)}`,
      );
    },
  };
}
