import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOCAL_PLANNED_PROVIDER,
  rowToSocialPlannedPost,
  type SocialPlannedPostRow,
} from "./planned-posts-map.js";

function baseRow(
  overrides: Partial<SocialPlannedPostRow> = {},
): SocialPlannedPostRow {
  const now = new Date("2026-10-29T10:00:00.000Z");
  return {
    id: "plan1",
    provider: LOCAL_PLANNED_PROVIDER,
    platform: "x",
    text: "Hello world",
    media: [],
    accountKind: "personal",
    targetPlatforms: ["x", "linkedin"],
    scheduledAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe("rowToSocialPlannedPost", () => {
  it("maps unscheduled local posts to draft", () => {
    const mapped = rowToSocialPlannedPost(baseRow());
    assert.deepEqual(mapped, {
      id: "plan1",
      body: "Hello world",
      accountKind: "personal",
      platforms: ["x", "linkedin"],
      media: [],
      scheduledAt: null,
      status: "draft",
      firstComment: null,
      poll: null,
      geoCountries: null,
      createdAt: "2026-10-29T10:00:00.000Z",
      updatedAt: "2026-10-29T10:00:00.000Z",
    });
  });

  it("maps scheduled local posts", () => {
    const scheduledAt = new Date("2026-11-01T09:00:00.000Z");
    const mapped = rowToSocialPlannedPost(baseRow({ scheduledAt }));
    assert.equal(mapped?.status, "scheduled");
    assert.equal(mapped?.scheduledAt, "2026-11-01T09:00:00.000Z");
  });

  it("ignores non-local providers", () => {
    assert.equal(
      rowToSocialPlannedPost(baseRow({ provider: "zernio" })),
      null,
    );
  });
});
