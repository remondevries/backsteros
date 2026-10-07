import { baselineCapabilities } from "../../capabilities.js";
import type { SocialCapabilities, SocialPlatform } from "../../types.js";

/**
 * Zernio-specific capability overrides on top of baseline platform flags.
 * Matches DOC-1683 / DOC-1672 matrix.
 */
export function zernioCapabilities(
  platform: SocialPlatform,
): SocialCapabilities {
  const base = baselineCapabilities(platform);
  switch (platform) {
    case "instagram":
      // Published posts can't be deleted via Zernio.
      return { ...base, deletePost: false, editPost: false };
    case "youtube":
      // Video publishing stays manual; comments via Zernio.
      return {
        ...base,
        publish: false,
        schedule: false,
        hideComments: false,
      };
    case "linkedin_personal":
      return {
        ...base,
        readComments: false,
        replyComments: false,
        hideComments: false,
        deleteComments: false,
        dms: false,
        dmWebhooks: false,
      };
    case "linkedin_org":
      return {
        ...base,
        hideComments: false,
        dms: false,
        dmWebhooks: false,
      };
    case "x":
      // DMs partial: no DM webhooks → poll; analytics opt-in.
      return { ...base, dmWebhooks: false, analytics: "basic" };
    case "whatsapp":
      return {
        ...base,
        publish: false,
        schedule: false,
        deletePost: false,
        readComments: false,
        replyComments: false,
        analytics: "none",
      };
    default:
      return base;
  }
}
