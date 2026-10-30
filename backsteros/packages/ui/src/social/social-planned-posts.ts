import type {
  SocialMockAccountKind,
  SocialMockPostPlatform,
} from "./social-mock-data.js";

export type SocialPlannedPostMediaKind = "image" | "video" | "document";

export type SocialPlannedPostMedia = {
  id: string;
  kind: SocialPlannedPostMediaKind;
  url: string;
  contentType: string;
  filename?: string | null;
};

/** Base64 / data-URL upload for create/update. */
export type SocialPlannedPostMediaUpload = {
  data: string;
  contentType?: string;
  filename?: string;
  kind?: SocialPlannedPostMediaKind;
};

/** Persisted planned post (core Tier C) — scheduledAt null = unscheduled tray. */
export type SocialPlannedPostRecord = {
  id: string;
  body: string;
  accountKind: SocialMockAccountKind;
  platforms: readonly SocialMockPostPlatform[];
  media: readonly SocialPlannedPostMedia[];
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialPlannedPostCreateInput = {
  body: string;
  accountKind: SocialMockAccountKind;
  platforms: readonly SocialMockPostPlatform[];
  scheduledAt?: string | null;
  mediaUploads?: readonly SocialPlannedPostMediaUpload[];
};

export type SocialPlannedPostUpdateInput = {
  body?: string;
  accountKind?: SocialMockAccountKind;
  platforms?: readonly SocialMockPostPlatform[];
  scheduledAt?: string | null;
  mediaUploads?: readonly SocialPlannedPostMediaUpload[];
};

/** Desktop/core adapter for Network Planned persistence. */
export type SocialPlannedPostsClient = {
  list: () => Promise<SocialPlannedPostRecord[]>;
  create: (
    input: SocialPlannedPostCreateInput,
  ) => Promise<SocialPlannedPostRecord>;
  update: (
    id: string,
    patch: SocialPlannedPostUpdateInput,
  ) => Promise<SocialPlannedPostRecord>;
  remove: (id: string) => Promise<void>;
  /** Bearer download for composer/tray thumbs (API media paths are not public). */
  downloadMedia: (postId: string, mediaId: string) => Promise<Blob>;
};
