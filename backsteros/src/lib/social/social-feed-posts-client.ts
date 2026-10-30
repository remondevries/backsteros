import type {
  CreateSocialFeedCommentResult,
  DeleteSocialFeedCommentResult,
  DeleteSocialFeedPostResult,
  EditSocialFeedPostResult,
  LikeSocialFeedCommentResult,
  LikeSocialFeedPostResult,
  PublishSocialPostResult,
  ResolveSocialLinkedInMentionResult,
  SocialFeedCommentsList,
  SocialFeedList,
  SocialFeedPost,
  SocialFeedPostReactionsList,
  UnlikeSocialFeedCommentResult,
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
    async publish({
      platform,
      accountKind,
      body,
      firstComment,
      geoCountries,
      reshareUrl,
      poll,
    }) {
      await client.requestJson<PublishSocialPostResult>(
        "/api/v1/social/publish",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            platform,
            accountKind,
            body,
            firstComment: firstComment ?? null,
            geoCountries: geoCountries ?? null,
            reshareUrl: reshareUrl ?? null,
            poll: poll ?? null,
          }),
        },
      );
    },
    async like({ platform, accountKind, postId, reactionType }) {
      const body = await client.requestJson<LikeSocialFeedPostResult>(
        "/api/v1/social/feed/like",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            platform,
            accountKind,
            postId,
            ...(reactionType ? { reactionType } : {}),
          }),
        },
      );
      return {
        liked: body.liked,
        alreadyReacted: body.alreadyReacted,
        reactionType: body.reactionType,
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
    async createComment({
      platform,
      accountKind,
      postId,
      body,
      parentCommentId,
    }) {
      const created = await client.requestJson<CreateSocialFeedCommentResult>(
        "/api/v1/social/feed/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            platform,
            accountKind,
            postId,
            body,
            parentCommentId: parentCommentId ?? null,
          }),
        },
      );
      return toMockReply(created);
    },
    async deleteComment({ platform, accountKind, postId, commentId }) {
      await client.requestJson<DeleteSocialFeedCommentResult>(
        "/api/v1/social/feed/comments/delete",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, accountKind, postId, commentId }),
        },
      );
    },
    async likeComment({
      platform,
      accountKind,
      postId,
      commentId,
      reactionType,
    }) {
      return client.requestJson<LikeSocialFeedCommentResult>(
        "/api/v1/social/feed/comments/like",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            platform,
            accountKind,
            postId,
            commentId,
            ...(reactionType ? { reactionType } : {}),
          }),
        },
      );
    },
    async unlikeComment({ platform, accountKind, postId, commentId }) {
      await client.requestJson<UnlikeSocialFeedCommentResult>(
        "/api/v1/social/feed/comments/unlike",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, accountKind, postId, commentId }),
        },
      );
    },
    async deletePost({ platform, accountKind, postId }) {
      await client.requestJson<DeleteSocialFeedPostResult>(
        "/api/v1/social/feed/delete",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, accountKind, postId }),
        },
      );
    },
    async listReactions({ platform, accountKind, postId }) {
      const params = new URLSearchParams({
        platform,
        accountKind,
        postId,
      });
      const body = await client.requestJson<SocialFeedPostReactionsList>(
        `/api/v1/social/feed/reactions?${params}`,
      );
      return body.reactions;
    },
    async resolveMention({ platform, accountKind, url }) {
      const params = new URLSearchParams({
        platform,
        accountKind,
        url,
      });
      const body = await client.requestJson<ResolveSocialLinkedInMentionResult>(
        `/api/v1/social/linkedin/mentions?${params}`,
      );
      return {
        mentionFormat: body.mentionFormat,
        displayName: body.displayName,
      };
    },
  };
}
