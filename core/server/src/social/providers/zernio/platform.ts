import type { SocialPlatform } from "../../types.js";

/** Zernio path/query platform strings → normalized SocialPlatform. */
export function mapZernioPlatform(
  platform: string | null | undefined,
  accountType?: string | null,
): SocialPlatform | null {
  const raw = (platform ?? "").trim().toLowerCase();
  if (!raw) return null;
  switch (raw) {
    case "twitter":
    case "x":
      return "x";
    case "facebook":
    case "facebook_page":
      return "facebook_page";
    case "instagram":
      return "instagram";
    case "linkedin":
    case "linkedin_personal":
    case "linkedin_org":
    case "linkedin_page": {
      const type = (accountType ?? "").trim().toLowerCase();
      if (
        type === "organization" ||
        type === "org" ||
        type === "page" ||
        type === "company" ||
        raw === "linkedin_org" ||
        raw === "linkedin_page"
      ) {
        return "linkedin_org";
      }
      return "linkedin_personal";
    }
    case "youtube":
      return "youtube";
    case "googlebusiness":
    case "google_business":
    case "gmb":
      return "google_business";
    case "whatsapp":
      return "whatsapp";
    case "threads":
      return "threads";
    case "bluesky":
      return "bluesky";
    case "tiktok":
      return "tiktok";
    case "reddit":
      return "reddit";
    case "telegram":
      return "telegram";
    default:
      return null;
  }
}

/** Normalized platform → Zernio connect/{platform} path segment. */
export function toZernioConnectPlatform(platform: SocialPlatform): string {
  switch (platform) {
    case "x":
      return "twitter";
    case "facebook_page":
      return "facebook";
    case "instagram":
      return "instagram";
    case "linkedin_personal":
    case "linkedin_org":
      return "linkedin";
    case "youtube":
      return "youtube";
    case "google_business":
      return "googlebusiness";
    case "whatsapp":
      return "whatsapp";
    case "threads":
      return "threads";
    case "bluesky":
      return "bluesky";
    case "tiktok":
      return "tiktok";
    case "reddit":
      return "reddit";
    case "telegram":
      return "telegram";
    default: {
      const _exhaustive: never = platform;
      return _exhaustive;
    }
  }
}

/** Platforms Remon decided to use (DOC-1683). Others may still connect but UI can filter. */
export const DECIDED_SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  "x",
  "linkedin_personal",
  "linkedin_org",
  "facebook_page",
  "instagram",
  "youtube",
  "google_business",
  "whatsapp",
] as const;
