import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPlausibleSocialHandle,
  resolveSocialComposerAvatarUrl,
  resolveSocialConnectedIdentity,
  resolveSocialHandle,
  socialAccountPlatformForFeed,
  splitSocialDisplayName,
} from "./social-connected-account-avatar.js";

describe("socialAccountPlatformForFeed", () => {
  it("maps LinkedIn personal vs business", () => {
    assert.equal(
      socialAccountPlatformForFeed({
        feedPlatform: "linkedin",
        accountKind: "personal",
      }),
      "linkedin_personal",
    );
    assert.equal(
      socialAccountPlatformForFeed({
        feedPlatform: "linkedin",
        accountKind: "business",
      }),
      "linkedin_org",
    );
  });
});

describe("splitSocialDisplayName", () => {
  it("splits personal names and keeps business as page name", () => {
    assert.deepEqual(splitSocialDisplayName("Remon de Vries", "personal"), {
      firstName: "Remon",
      lastName: "de Vries",
    });
    assert.deepEqual(splitSocialDisplayName("Lemo-Design", "business"), {
      firstName: "Lemo-Design",
      lastName: "",
    });
  });
});

describe("resolveSocialHandle", () => {
  it("rejects display-name usernames and prefers LinkedIn vanity URL", () => {
    assert.equal(isPlausibleSocialHandle("Lemo-Design", "Lemo-Design"), false);
    assert.equal(isPlausibleSocialHandle("Remon de Vries", "Remon de Vries"), false);
    assert.equal(
      resolveSocialHandle({
        handle: "Lemo-Design",
        displayName: "Lemo-Design",
        url: "https://www.linkedin.com/company/lemodesign/",
        fallbackHandle: "backsteros",
      }),
      "lemodesign",
    );
    assert.equal(
      resolveSocialHandle({
        handle: "Remon de Vries",
        displayName: "Remon de Vries",
        url: "https://www.linkedin.com/in/remondevries/",
        fallbackHandle: "remon",
      }),
      "remondevries",
    );
  });
});

describe("resolveSocialComposerAvatarUrl", () => {
  it("prefers LinkedIn connected avatar over mock fallback", () => {
    const url = resolveSocialComposerAvatarUrl({
      feedPlatform: "linkedin",
      accountKind: "business",
      connectedAccounts: [
        {
          platform: "linkedin_personal",
          avatarUrl: "https://example.com/personal.jpg",
        },
        {
          platform: "linkedin_org",
          avatarUrl: "https://example.com/org.jpg",
        },
      ],
      fallbackAvatarUrl: "https://example.com/fallback.jpg",
    });
    assert.equal(url, "https://example.com/org.jpg");
  });

  it("falls back when LinkedIn is not selected", () => {
    const url = resolveSocialComposerAvatarUrl({
      feedPlatform: "all",
      accountKind: "personal",
      connectedAccounts: [
        {
          platform: "linkedin_personal",
          avatarUrl: "https://example.com/personal.jpg",
        },
      ],
      fallbackAvatarUrl: "https://example.com/fallback.jpg",
    });
    assert.equal(url, "https://example.com/fallback.jpg");
  });
});

describe("resolveSocialConnectedIdentity", () => {
  it("uses LinkedIn personal display name and vanity handle", () => {
    const identity = resolveSocialConnectedIdentity({
      feedPlatform: "linkedin",
      accountKind: "personal",
      connectedAccounts: [
        {
          platform: "linkedin_personal",
          handle: "Remon de Vries",
          displayName: "Remon de Vries",
          url: "https://www.linkedin.com/in/remondevries/",
          bio: "UX designer / Entrepreneur",
          followersCount: 243,
        },
      ],
      fallbackHandle: "remon",
      fallbackDisplayName: "Remon de Vries",
      fallbackBio: "Mock bio",
      fallbackFollowersCount: 1820,
    });
    assert.deepEqual(identity, {
      handle: "remondevries",
      displayName: "Remon de Vries",
      firstName: "Remon",
      lastName: "de Vries",
      bio: "UX designer / Entrepreneur",
      followersCount: 243,
    });
  });

  it("uses LinkedIn org page name for business and vanity for @handle", () => {
    const identity = resolveSocialConnectedIdentity({
      feedPlatform: "linkedin",
      accountKind: "business",
      connectedAccounts: [
        {
          platform: "linkedin_org",
          handle: "Lemo-Design",
          displayName: "Lemo-Design",
          url: "https://www.linkedin.com/company/lemodesign/",
          followersCount: 10,
        },
      ],
      fallbackHandle: "backsteros",
      fallbackDisplayName: "BacksterOS",
      fallbackBio: "Mock company bio",
      fallbackFollowersCount: 12400,
    });
    assert.deepEqual(identity, {
      handle: "lemodesign",
      displayName: "Lemo-Design",
      firstName: "Lemo-Design",
      lastName: "",
      bio: null,
      followersCount: 10,
    });
  });
});
