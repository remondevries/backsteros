import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertProjectChannel,
  assertProjectChannelPendingLink,
  assertProjectChannelUri,
  developmentFromLegacyLocations,
  grokBotAgentIdFromChannel,
  isGrokBotChannelUri,
  isProjectChannelPendingLink,
  mirrorProjectLocationCompat,
  normalizeProjectChannel,
  normalizeProjectChannelPendingLink,
  normalizeProjectChannelUri,
  normalizeProjectDevelopment,
  normalizeProjectProduction,
  parseProjectChannelPendingLink,
  productionFromLegacyLocations,
  projectChannelDisplayName,
  projectChannelPendingLinkSchema,
  projectChannelScheme,
} from "./project-locations.js";

describe("project locations", () => {
  it("normalizes local Development and drops empty host", () => {
    assert.deepEqual(
      normalizeProjectDevelopment({
        kind: "local",
        path: "  /Users/me/app  ",
        host: "ignored",
      }),
      { kind: "local", path: "/Users/me/app" },
    );
  });

  it("keeps host on server Development", () => {
    assert.deepEqual(
      normalizeProjectDevelopment({
        kind: "server",
        path: "/home/deploy/app",
        host: " development ",
      }),
      { kind: "server", path: "/home/deploy/app", host: "development" },
    );
  });

  it("rejects empty Production", () => {
    assert.equal(
      normalizeProjectProduction({
        server: "  ",
        url: null,
        deployMethod: null,
        branch: null,
        path: null,
      }),
      null,
    );
  });

  it("mirrors local Development into localWorkingDirectory", () => {
    assert.deepEqual(
      mirrorProjectLocationCompat({
        development: { kind: "local", path: "/Users/me/app" },
        production: null,
        previousLocalWorkingDirectory: "/old",
      }),
      {
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: "/Users/me/app",
        productionLocation: null,
      },
    );
  });

  it("keeps previous local cwd when Development is server", () => {
    assert.deepEqual(
      mirrorProjectLocationCompat({
        development: {
          kind: "server",
          path: "/home/deploy/app",
          host: "development",
        },
        production: {
          server: "prod",
          path: "/var/www",
          url: null,
          deployMethod: "Kamal",
          branch: "main",
        },
        previousLocalWorkingDirectory: "/Users/me/app",
      }),
      {
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: "/home/deploy/app",
        productionLocation: "/var/www",
      },
    );
  });

  it("builds Development from legacy local-only columns", () => {
    assert.deepEqual(
      developmentFromLegacyLocations({
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: null,
      }),
      { kind: "local", path: "/Users/me/app" },
    );
  });

  it("prefers Mac path when legacy Local and Development conflict", () => {
    assert.deepEqual(
      developmentFromLegacyLocations({
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: "/home/deploy/Test",
      }),
      { kind: "local", path: "/Users/me/app" },
    );
  });

  it("builds Production from legacy path", () => {
    assert.deepEqual(
      productionFromLegacyLocations({
        productionLocation: "/var/www",
      }),
      {
        path: "/var/www",
        server: null,
        url: null,
        deployMethod: null,
        branch: null,
      },
    );
  });

  it("normalizes Grok Bot Channel objects", () => {
    const uri =
      "grokbot://app/v1/agent?id=550e8400-E29B-41D4-A716-446655440000";
    assert.deepEqual(normalizeProjectChannel({ uri, name: "  OS  " }), {
      uri: "grokbot://app/v1/agent?id=550e8400-e29b-41d4-a716-446655440000",
      name: "OS",
    });
    assert.equal(projectChannelScheme(uri), "grokbot");
    assert.equal(isGrokBotChannelUri(uri), true);
    assert.equal(
      grokBotAgentIdFromChannel(uri),
      "550e8400-E29B-41D4-A716-446655440000",
    );
    assert.equal(
      projectChannelDisplayName({ uri, name: null }),
      "Grok Bot room",
    );
    assert.equal(
      projectChannelDisplayName({ uri, name: "BacksterOS" }),
      "BacksterOS",
    );
  });

  it("accepts reserved Slack and unknown schemes", () => {
    assert.deepEqual(normalizeProjectChannel({ uri: "slack:C01234567" }), {
      uri: "slack:C01234567",
      name: null,
    });
    assert.deepEqual(
      normalizeProjectChannel({ uri: "discord:#general", name: "Ops" }),
      { uri: "discord:#general", name: "Ops" },
    );
    assert.equal(
      projectChannelDisplayName({ uri: "discord:#general", name: null }),
      "Discord",
    );
  });

  it("rejects malformed Channel URIs", () => {
    assert.equal(normalizeProjectChannelUri("not-a-uri"), null);
    assert.equal(normalizeProjectChannelUri("grokbot://other"), null);
    assert.equal(normalizeProjectChannelUri("slack:"), null);
    assert.equal(assertProjectChannelUri("").ok, false);
    assert.equal(assertProjectChannel({ uri: "grokbot://x" }).ok, false);
    assert.equal(
      assertProjectChannel({
        uri: "grokbot://app/v1/agent?id=550e8400-e29b-41d4-a716-446655440000",
      }).ok,
      true,
    );
  });

  it("coerces legacy plain URI strings into Channel objects", () => {
    assert.deepEqual(
      normalizeProjectChannel(
        "grokbot://app/v1/agent?id=550e8400-e29b-41d4-a716-446655440000",
      ),
      {
        uri: "grokbot://app/v1/agent?id=550e8400-e29b-41d4-a716-446655440000",
        name: null,
      },
    );
  });

  it("accepts only chat deep-link forms for channelPendingLink", () => {
    assert.deepEqual(
      parseProjectChannelPendingLink(
        "backsteros://chat/th_abc12345?message=msg_1",
      ),
      { threadId: "th_abc12345", messageId: "msg_1" },
    );
    assert.deepEqual(
      parseProjectChannelPendingLink("/chat/th_abc12345?message=msg_1"),
      { threadId: "th_abc12345", messageId: "msg_1" },
    );
    assert.equal(
      normalizeProjectChannelPendingLink(
        "  /chat/th_abc12345?message=msg_1  ",
      ),
      "/chat/th_abc12345?message=msg_1",
    );
    assert.equal(
      projectChannelPendingLinkSchema.safeParse(
        "backsteros://chat/th_abc12345?message=msg_1",
      ).success,
      true,
    );
  });

  it("rejects non-chat channelPendingLink values", () => {
    const rejects = [
      "https://evil.example/phish",
      "javascript:alert(1)",
      "grokbot://app/v1/agent?id=550e8400-e29b-41d4-a716-446655440000",
      "backsteros://chat/th_abc12345",
      "/chat/th_abc12345",
      "backsteros://chat/th_abc12345?message=msg_1&other=1",
      "backsteros://other/th_abc12345?message=msg_1",
      "/projects/OS",
      "chat/th_abc12345?message=msg_1",
      "",
    ];
    for (const value of rejects) {
      assert.equal(
        isProjectChannelPendingLink(value),
        false,
        `expected reject: ${value}`,
      );
      assert.equal(
        assertProjectChannelPendingLink(value).ok,
        false,
        `expected assert fail: ${value}`,
      );
      assert.equal(
        projectChannelPendingLinkSchema.safeParse(value).success,
        false,
        `expected schema fail: ${value}`,
      );
    }
  });
});
