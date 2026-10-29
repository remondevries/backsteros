import type {
  SocialMockAccountKind,
  SocialMockPostPlatform,
} from "./social-mock-data.js";

/** Persisted planned post (core Tier C) — scheduledAt null = unscheduled tray. */
export type SocialPlannedPostRecord = {
  id: string;
  body: string;
  accountKind: SocialMockAccountKind;
  platforms: readonly SocialMockPostPlatform[];
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialPlannedPostCreateInput = {
  body: string;
  accountKind: SocialMockAccountKind;
  platforms: readonly SocialMockPostPlatform[];
  scheduledAt?: string | null;
};

export type SocialPlannedPostUpdateInput = {
  body?: string;
  accountKind?: SocialMockAccountKind;
  platforms?: readonly SocialMockPostPlatform[];
  scheduledAt?: string | null;
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
};
