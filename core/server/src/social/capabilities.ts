import type { SocialCapabilities, SocialPlatform } from "./types.js";

const NONE: SocialCapabilities = {
  publish: false,
  schedule: false,
  editPost: false,
  deletePost: false,
  readComments: false,
  replyComments: false,
  hideComments: false,
  deleteComments: false,
  dms: false,
  dmWebhooks: false,
  analytics: "none",
  reviews: false,
};

/**
 * Baseline platform capabilities independent of provider.
 * Providers may narrow further (e.g. Instagram `deletePost=false` via Zernio).
 */
export function baselineCapabilities(
  platform: SocialPlatform,
): SocialCapabilities {
  switch (platform) {
    case "x":
      return {
        ...NONE,
        publish: true,
        schedule: true,
        editPost: true,
        deletePost: true,
        readComments: true,
        replyComments: true,
        hideComments: true,
        deleteComments: true,
        dms: true,
        dmWebhooks: false,
        analytics: "basic",
      };
    case "linkedin_personal":
      return {
        ...NONE,
        publish: true,
        schedule: true,
        editPost: true,
        deletePost: true,
        analytics: "basic",
      };
    case "linkedin_org":
      return {
        ...NONE,
        publish: true,
        schedule: true,
        editPost: true,
        deletePost: true,
        readComments: true,
        replyComments: true,
        deleteComments: true,
        analytics: "full",
      };
    case "facebook_page":
      return {
        ...NONE,
        publish: true,
        schedule: true,
        editPost: true,
        deletePost: true,
        readComments: true,
        replyComments: true,
        hideComments: true,
        deleteComments: true,
        dms: true,
        dmWebhooks: true,
        analytics: "full",
      };
    case "instagram":
      return {
        ...NONE,
        publish: true,
        schedule: true,
        editPost: false,
        deletePost: false,
        readComments: true,
        replyComments: true,
        hideComments: true,
        deleteComments: true,
        dms: true,
        dmWebhooks: true,
        analytics: "full",
      };
    case "youtube":
      return {
        ...NONE,
        // Video publishing stays manual (DOC-1683).
        publish: false,
        schedule: false,
        editPost: false,
        deletePost: true,
        readComments: true,
        replyComments: true,
        deleteComments: true,
        analytics: "basic",
      };
    case "google_business":
      return {
        ...NONE,
        publish: true,
        schedule: true,
        editPost: true,
        deletePost: true,
        analytics: "basic",
        reviews: true,
      };
    case "whatsapp":
      return {
        ...NONE,
        dms: true,
        dmWebhooks: true,
        analytics: "none",
      };
    case "threads":
    case "bluesky":
    case "tiktok":
    case "reddit":
    case "telegram":
      return {
        ...NONE,
        publish: true,
        schedule: true,
        deletePost: true,
        readComments: true,
        replyComments: true,
        analytics: "basic",
      };
    default: {
      const _exhaustive: never = platform;
      return _exhaustive;
    }
  }
}
