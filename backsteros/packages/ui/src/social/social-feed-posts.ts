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
  }): Promise<void>;
  /** React as the connected personal/company LinkedIn account. */
  like(input: {
    platform: "linkedin";
    accountKind: SocialMockAccountKind;
    postId: string;
  }): Promise<{ liked: boolean; alreadyReacted?: boolean }>;
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
