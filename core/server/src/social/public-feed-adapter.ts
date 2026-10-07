import type { SocialPage, SocialPost } from "./types.js";

/**
 * Watch others: followed timelines, keyword search.
 * Not implemented in OS-98 — reserved for a later X API adapter.
 */
export interface PublicFeedAdapter {
  readonly provider: string;

  listFollowedPosts(
    accountIds: string[],
    cursor?: string,
  ): Promise<SocialPage<SocialPost>>;

  fetchProfileTimeline(
    handle: string,
    cursor?: string,
  ): Promise<SocialPage<SocialPost>>;

  fetchPostById(externalId: string): Promise<SocialPost | null>;

  searchKeyword?(
    query: string,
    cursor?: string,
  ): Promise<SocialPage<SocialPost>>;
}
