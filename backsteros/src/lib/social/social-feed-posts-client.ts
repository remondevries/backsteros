import type {
  EditSocialFeedPostResult,
  LikeSocialFeedPostResult,
  PublishSocialPostResult,
  SocialFeedCommentsList,
  SocialFeedList,
  SocialFeedPost,
  UnlikeSocialFeedPostResult,
} from "@backsteros/contracts";
import type {
  SocialFeedPostsClient,
  SocialMockPost,
  SocialMockReply,
} from "@backsteros/ui";

import type { BacksterosApiClient } from "@backsteros/api-client";

function toMockPost(post: SocialFeedPost): SocialMockPost {
  return {
    id: post.id,
    authorName: post.authorName,
    authorHandle: post.authorHandle,
    authorAvatarUrl: post.authorAvatarUrl ?? undefined,
    authorFollowersCount: post.authorFollowersCount ?? undefined,
    authorVerified: post.authorVerified,
    platform: post.platform,
    accountKind: post.accountKind,
    body: post.body,
    imageUrl: post.imageUrl ?? undefined,
    imageAlt: post.imageAlt ?? undefined,
    createdAt: post.createdAt,
    replyCount: post.replyCount,
    repostCount: post.repostCount,
    likeCount: post.likeCount,
    saveCount: post.saveCount ?? 0,
    permalink: post.permalink ?? undefined,
    feed: post.feed ?? "both",
  };
}

function toMockReply(
  comment: SocialFeedCommentsList["comments"][number],
): SocialMockReply {
  return {
    id: comment.id,
    postId: comment.postId,
    authorName: comment.authorName,
    authorHandle: comment.authorHandle,
    authorAvatarUrl: comment.authorAvatarUrl ?? undefined,
    authorVerified: comment.authorVerified,
    body: comment.body,
    createdAt: comment.createdAt,
    likeCount: comment.likeCount,
  };
}

/** Core REST adapter for live Network inbox posts (LinkedIn via Zernio). */
export function createSocialFeedPostsClient(
  client: BacksterosApiClient,
): SocialFeedPostsClient {
  return {
    async list({ platform, accountKind }) {
      const params = new URLSearchParams({
        platform,
        accountKind,
      });
      const body = await client.requestJson<SocialFeedList>(
        `/api/v1/social/feed?${params}`,
      );
      return body.posts.map(toMockPost);
    },
    async listComments({ platform, accountKind, postId }) {
      const params = new URLSearchParams({
        platform,
        accountKind,
        postId,
      });
      const body = await client.requestJson<SocialFeedCommentsList>(
        `/api/v1/social/feed/comments?${params}`,
      );
      return body.comments.map(toMockReply);
    },
    async publish({ platform, accountKind, body }) {
      await client.requestJson<PublishSocialPostResult>(
        "/api/v1/social/publish",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, accountKind, body }),
        },
      );
    },
    async like({ platform, accountKind, postId }) {
      const body = await client.requestJson<LikeSocialFeedPostResult>(
        "/api/v1/social/feed/like",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, accountKind, postId }),
        },
      );
      return {
        liked: body.liked,
        alreadyReacted: body.alreadyReacted,
      };
    },
    async unlike({ platform, accountKind, postId }) {
      await client.requestJson<UnlikeSocialFeedPostResult>(
        "/api/v1/social/feed/unlike",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, accountKind, postId }),
        },
      );
    },
    async edit({ platform, accountKind, postId, body }) {
      return client.requestJson<EditSocialFeedPostResult>(
        "/api/v1/social/feed/edit",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, accountKind, postId, body }),
        },
      );
    },
  };
}
