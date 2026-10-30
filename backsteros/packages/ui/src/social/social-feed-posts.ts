import type {
  LinkedInPoll,
  LinkedInReactionType,
  SocialFeedPostReaction,
} from "@backsteros/contracts";

import type {
  SocialMockAccountKind,
  SocialMockPost,
  SocialMockReply,
} from "./social-mock-data.js";

/** Live Network inbox + publish client (core → Zernio). */
export type SocialFeedPostsClient = {
  list(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
  }): Promise<SocialMockPost[]>;
  /** LinkedIn company-page comments only (personal has no comments API). */
  listComments(input: {
    platform: "linkedin";
    accountKind: "business";
    postId: string;
  }): Promise<SocialMockReply[]>;
  publish(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
    body: string;
    firstComment?: string | null;
    geoCountries?: string[] | null;
    reshareUrl?: string | null;
    poll?: LinkedInPoll | null;
  }): Promise<void>;
  /** React as the connected personal/company LinkedIn account. */
  like(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
    postId: string;
    reactionType?: LinkedInReactionType;
  }): Promise<{
    liked: boolean;
    alreadyReacted?: boolean;
    reactionType?: string;
  }>;
  unlike(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
    postId: string;
  }): Promise<void>;
  /** Edit text on a post published through Network (Zernio). */
  edit(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
    postId: string;
    body: string;
  }): Promise<{ id: string; body: string }>;
  /** Comment / reply on a LinkedIn company-page post. */
  createComment(input: {
    platform: "linkedin";
    accountKind: "business";
    postId: string;
    body: string;
    parentCommentId?: string | null;
  }): Promise<SocialMockReply>;
  /** Delete a LinkedIn company-page comment. */
  deleteComment(input: {
    platform: "linkedin";
    accountKind: "business";
    postId: string;
    commentId: string;
  }): Promise<void>;
  /** React to a LinkedIn company-page comment. */
  likeComment(input: {
    platform: "linkedin";
    accountKind: "business";
    postId: string;
    commentId: string;
    reactionType?: LinkedInReactionType;
  }): Promise<{ liked: boolean; reactionType?: string }>;
  unlikeComment(input: {
    platform: "linkedin";
    accountKind: "business";
    postId: string;
    commentId: string;
  }): Promise<void>;
  /** Unpublish/delete a Network-published LinkedIn post. */
  deletePost(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
    postId: string;
  }): Promise<void>;
  /** List reactors on a company-page post. */
  listReactions?(input: {
    platform: "linkedin";
    accountKind: "business";
    postId: string;
  }): Promise<SocialFeedPostReaction[]>;
  /** Resolve a LinkedIn URL to mention markup. */
  resolveMention?(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
    url: string;
  }): Promise<{ mentionFormat: string | null; displayName?: string | null }>;
};

export function isLiveSocialFeedPlatform(
  platform: string,
): platform is "linkedin" {
  return platform === "linkedin";
}

/** Ids from core `/social/feed` (Zernio), not mock seed posts. */
export function isLiveSocialFeedPostId(postId: string): boolean {
  return (
    postId.startsWith("zernio-post:") ||
    postId.startsWith("zernio-platform-post:")
  );
}
