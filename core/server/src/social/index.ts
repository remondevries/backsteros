/**
 * Social adapter layer — public surface for the rest of BacksterOS.
 * Import from here or `./types.js` / `./owned-account-adapter.js`.
 * Do not import `providers/zernio` outside settings/webhook wiring.
 */

export type { OwnedAccountAdapter } from "./owned-account-adapter.js";
export type { PublicFeedAdapter } from "./public-feed-adapter.js";
export { baselineCapabilities } from "./capabilities.js";
export type {
  PublishPostInput,
  SocialAccount,
  SocialAccountRelation,
  SocialAnalyticsPoint,
  SocialCapabilities,
  SocialComment,
  SocialConversation,
  SocialConversationKind,
  SocialFollowerStats,
  SocialMediaItem,
  SocialMessage,
  SocialMessageDirection,
  SocialMessageStatus,
  SocialNormalizedEvent,
  SocialPage,
  SocialPlatform,
  SocialPost,
  SocialPostStatus,
} from "./types.js";
